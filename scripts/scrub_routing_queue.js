#!/usr/bin/env node
// ============================================================
// AUM ENGINE — scripts/scrub_routing_queue.js
// C41 Track 2: Stale routing_queue scrub
//
// Scans routing_queue for non-pending items and cross-checks
// each against lead_assignments + master_leads to determine
// if they are genuine orphans safe to remove.
//
// Usage:
//   node scripts/scrub_routing_queue.js           # dry-run (default)
//   node scripts/scrub_routing_queue.js --dry-run # explicit dry-run
//   node scripts/scrub_routing_queue.js --execute # perform deletions
//   node scripts/scrub_routing_queue.js --status=failed  # target specific status
//
// Decision rules:
//   KEEP   — status=assigned AND active lead_assignment exists for masterLeadId
//   KEEP   — status=pending   (routing engine should process these)
//   DELETE — status=failed    AND no active lead_assignment exists
//   DELETE — status=orphaned  (already flagged as stale)
//   DELETE — status=assigned  AND no active lead_assignment exists (ghost assignment)
// ============================================================

'use strict';

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const args    = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const DRY_RUN = !EXECUTE;
const STATUS_FILTER = (() => {
  const f = args.find(a => a.startsWith('--status='));
  return f ? f.split('=')[1] : null;
})();

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — routing_queue Scrubber (C41)          ║');
  console.log(`║  Mode: ${DRY_RUN ? '🔍 DRY RUN — no writes' : '⚡ EXECUTE — deleting stale docs'}       ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Load all routing_queue docs ──────────────────────────────────
  const qSnap = await db.collection('routing_queue').get();
  console.log(`routing_queue: ${qSnap.size} total docs`);

  const statusCounts = {};
  qSnap.docs.forEach(d => {
    const s = d.data().status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  console.log('Status breakdown:', JSON.stringify(statusCounts, null, 2));

  // ── Load active lead_assignments masterLeadIds ─────────────────
  // Build a set of masterLeadIds that have an active or assigned assignment.
  // These queue items are NOT orphans.
  console.log('\nLoading active lead_assignments...');
  const laSnap = await db.collection('lead_assignments')
    .where('ownershipStatus', 'in', ['active', 'pending'])
    .get();

  const activeMasterLeadIds = new Set(
    laSnap.docs.map(d => d.data().masterLeadId).filter(Boolean)
  );
  console.log(`Active lead_assignments: ${laSnap.size} → ${activeMasterLeadIds.size} unique masterLeadIds`);

  // ── Classify each queue item ─────────────────────────────────────
  const toDelete  = [];
  const toKeep    = [];
  const pending   = [];

  for (const doc of qSnap.docs) {
    const q      = doc.data();
    const status = q.status || 'unknown';
    const mlId   = q.masterLeadId || null;

    // Skip pending — routing engine handles these
    if (status === 'pending') {
      pending.push({ id: doc.id, mlId, status });
      continue;
    }

    // Apply status filter if provided
    if (STATUS_FILTER && status !== STATUS_FILTER) {
      toKeep.push({ id: doc.id, mlId, status, reason: `filtered out (not ${STATUS_FILTER})` });
      continue;
    }

    const hasActiveAssignment = mlId && activeMasterLeadIds.has(mlId);

    if (status === 'orphaned') {
      // Already flagged as orphan — safe to delete
      toDelete.push({ id: doc.id, mlId, status, reason: 'orphaned status — safe to remove' });
    } else if (status === 'failed') {
      if (hasActiveAssignment) {
        // Failed but has an active assignment — something re-routed it manually. Keep.
        toKeep.push({ id: doc.id, mlId, status, reason: 'has active lead_assignment — not a true orphan' });
      } else {
        toDelete.push({ id: doc.id, mlId, status, reason: 'failed + no active assignment = orphan' });
      }
    } else if (status === 'assigned') {
      if (hasActiveAssignment) {
        toKeep.push({ id: doc.id, mlId, status, reason: 'assigned + active lead_assignment confirmed' });
      } else {
        // Ghost: marked assigned but no matching lead_assignment
        toDelete.push({ id: doc.id, mlId, status, reason: 'assigned but NO lead_assignment found = ghost' });
      }
    } else {
      // Unknown status — keep, flag for review
      toKeep.push({ id: doc.id, mlId, status, reason: `unknown status "${status}" — keeping for review` });
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log('\n── Classification Results ───────────────────────────────────');
  console.log(`  Pending (untouched):     ${pending.length}`);
  console.log(`  KEEP:                    ${toKeep.length}`);
  console.log(`  DELETE (stale orphans):  ${toDelete.length}`);

  if (toDelete.length > 0) {
    console.log('\n── Stale Docs to Delete ─────────────────────────────────────');
    toDelete.forEach((item, i) => {
      console.log(`  ${i + 1}. [${item.status}] id:${item.id.slice(0, 10)}… mlId:${(item.mlId || 'null').slice(0, 10)}…`);
      console.log(`     Reason: ${item.reason}`);
    });
  } else {
    console.log('\n  ✅ No stale orphans found — routing_queue is clean.');
  }

  if (toKeep.length > 0) {
    console.log('\n── Kept Docs (non-stale) ────────────────────────────────────');
    toKeep.forEach((item, i) => {
      console.log(`  ${i + 1}. [${item.status}] ${item.id.slice(0, 10)}… → ${item.reason}`);
    });
  }

  // ── Execute deletions ─────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n── DRY RUN SUMMARY ──────────────────────────────────────────');
    console.log(`  Would delete: ${toDelete.length} stale routing_queue docs`);
    console.log(`  Would keep:   ${pending.length + toKeep.length} docs`);
    console.log('\n  Run with --execute to perform the deletions.\n');
    process.exit(0);
  }

  if (toDelete.length === 0) {
    console.log('\n  ✅ Nothing to delete. Queue is already clean.\n');
    process.exit(0);
  }

  console.log(`\n── Executing ${toDelete.length} deletions... ─────────────────────────`);
  let deleted = 0;
  let errored = 0;
  const BATCH_SIZE = 450; // Firestore batch limit is 500
  const chunks = [];
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    chunks.push(toDelete.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(item => {
      batch.delete(db.collection('routing_queue').doc(item.id));
    });
    try {
      await batch.commit();
      deleted += chunk.length;
      console.log(`  ✅ Deleted batch of ${chunk.length}`);
    } catch (e) {
      errored += chunk.length;
      console.error(`  ❌ Batch delete failed: ${e.message}`);
    }
  }

  console.log('\n── Execution Complete ────────────────────────────────────────');
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors:  ${errored}`);
  console.log(`  Remaining (pending + kept): ${pending.length + toKeep.length}`);
  console.log('\n  Run audit_leads.js to verify final state.\n');
  process.exit(0);
}

main().catch(e => {
  console.error('[scrub_routing_queue] FATAL:', e.message, e.stack);
  process.exit(1);
});
