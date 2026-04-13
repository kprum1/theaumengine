// =====================================================================
// THE AUM ENGINE — Sprint 4: Migrate al_assignments → lead_assignments
// scripts/migrate_al_to_lead_assignments.js
//
// Run: node scripts/migrate_al_to_lead_assignments.js [--dry-run]
//
// What it does:
//   1. Reads all 30 docs from al_assignments
//   2. For each, checks if a lead_assignments doc already exists for
//      the same masterLeadId (idempotent — skips if already migrated)
//   3. Writes a new lead_assignments doc with normalized schema
//   4. Does NOT delete al_assignments docs (read-only freeze)
//
// Safe to re-run: idempotent by ownerUid+masterLeadId dedup check.
// =====================================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM ENGINE — Sprint 4: al_assignments Migration     ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no writes)               ' : 'LIVE (writes to lead_assignments)    '}  ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── 1. Load all al_assignments ─────────────────────────────────────────
  const alSnap = await db.collection('al_assignments').get();
  console.log(`  Found ${alSnap.size} docs in al_assignments\n`);

  if (alSnap.empty) {
    console.log('  ✅  al_assignments is empty — nothing to migrate.');
    process.exit(0);
  }

  // ── 2. Build existing lead_assignments dedup map (ownerUid+masterLeadId) ─
  const laSnap = await db.collection('lead_assignments').get();
  const existingKeys = new Set();
  laSnap.docs.forEach(d => {
    const la = d.data();
    if (la.ownerUid && la.masterLeadId) {
      existingKeys.add(`${la.ownerUid}__${la.masterLeadId}`);
    }
  });
  console.log(`  Existing lead_assignments: ${laSnap.size} docs\n`);

  let migratedCount = 0;
  let skippedCount  = 0;
  let errorCount    = 0;

  const results = [];

  for (const doc of alSnap.docs) {
    const al  = doc.data();
    const uid = al.advisorUid || al.ownerUid || null;

    // Resolve masterLeadId — al_assignments may use masterLeadId or the doc ID itself
    const masterLeadId = al.masterLeadId || null;

    if (!uid || !masterLeadId) {
      console.warn(`  ⚠️  Skipping doc ${doc.id} — missing advisorUid or masterLeadId`);
      skippedCount++;
      results.push({ id: doc.id, result: 'skip', reason: 'missing_uid_or_leadId' });
      continue;
    }

    const dedupKey = `${uid}__${masterLeadId}`;
    if (existingKeys.has(dedupKey)) {
      console.log(`  ↷  SKIP  ${doc.id.slice(0,14)}… — already in lead_assignments`);
      skippedCount++;
      results.push({ id: doc.id, result: 'skip_existing', dedupKey });
      continue;
    }

    // ── Build normalized lead_assignments doc ──────────────────────────
    const now = new Date().toISOString();
    const slaDeadline = al.slaDeadline || (() => {
      // If no slaDeadline, inherit from assignedAt + 30 days
      const base = al.assignedAt ? new Date(al.assignedAt) : new Date();
      base.setDate(base.getDate() + 30);
      return base.toISOString();
    })();

    const leadAssignDoc = {
      // Ownership
      masterLeadId,
      masterContactId:  al.masterContactId  || null,
      ownerUid:         uid,

      // Dates
      assignedAt:       al.assignedAt       || al.createdAt || now,
      createdAt:        al.createdAt        || al.assignedAt || now,
      updatedAt:        now,

      // Status — normalize al_assignments 'New' → 'active'
      ownershipStatus:  al.ownershipStatus  || 'active',
      status:           al.advisorStatus    || al.status || 'new',
      advisorStatus:    al.advisorStatus    || al.status || 'New',

      // Scores / routing
      fitScore:         al.fitScore         || null,
      timingScore:      al.timingScore      || null,
      priorityScore:    al.priorityScore    || al.routingScore || null,
      routingScore:     al.routingScore     || null,
      slaDeadline,

      // Reply / outcome tracking
      replyType:        al.replyType        || null,
      replyOutcome:     al.replyOutcome     || null,
      repliedAt:        al.repliedAt        || null,
      outcome:          al.outcome          || null,
      outcomeAt:        al.outcomeAt        || null,

      // Provenance
      assignedBy:       'migrate_al_to_lead_assignments_v1',
      migratedFromAlId: doc.id,   // audit trail back to source doc
      source:           al.source || 'batch_migration',
      batchId:          al.batchId || null,

      // Ownership lifecycle
      releasedAt:       null,
      releasedReason:   null,
      previousOwners:   [],
    };

    if (DRY_RUN) {
      console.log(`  🔍  DRY-RUN  ${doc.id.slice(0,14)}… → lead_assignments (uid: ${uid.slice(0,10)}…)`);
      results.push({ id: doc.id, result: 'dry_run', masterLeadId, uid });
    } else {
      try {
        const newRef = db.collection('lead_assignments').doc();
        await newRef.set(leadAssignDoc);
        existingKeys.add(dedupKey); // prevent re-insert if script hits a duplicate source doc
        console.log(`  ✅  MIGRATED  ${doc.id.slice(0,14)}… → lead_assignments/${newRef.id.slice(0,14)}…`);
        results.push({ id: doc.id, result: 'migrated', newId: newRef.id, masterLeadId, uid });
        migratedCount++;
      } catch(e) {
        console.error(`  ❌  ERROR  ${doc.id} — ${e.message}`);
        results.push({ id: doc.id, result: 'error', reason: e.message });
        errorCount++;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  MIGRATION SUMMARY                                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Total al_assignments:   ${alSnap.size}`);
  if (DRY_RUN) {
    const wouldMigrate = results.filter(r => r.result === 'dry_run').length;
    const wouldSkip    = results.filter(r => r.result.startsWith('skip')).length;
    console.log(`  Would migrate:          ${wouldMigrate}`);
    console.log(`  Would skip (existing):  ${wouldSkip}`);
    console.log(`\n  ✅  Dry run complete — no writes performed.`);
    console.log(`  ℹ️   Re-run without --dry-run to apply.\n`);
  } else {
    console.log(`  Migrated:               ${migratedCount}`);
    console.log(`  Skipped (existing):     ${skippedCount}`);
    console.log(`  Errors:                 ${errorCount}`);
    if (errorCount === 0) {
      console.log(`\n  ✅  Migration complete. al_assignments docs preserved (read-only).`);
      console.log(`  ℹ️   Run node scripts/audit_leads.js to verify counts.\n`);
    } else {
      console.log(`\n  ⚠️  Migration finished with ${errorCount} error(s). Review above.\n`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('\n[FATAL]', err.message || err);
  process.exit(1);
});
