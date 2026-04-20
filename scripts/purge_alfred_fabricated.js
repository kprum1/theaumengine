#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — C40: Purge Alfred-Fabricated Leads
// scripts/purge_alfred_fabricated.js
//
// Sprint C40 — Lead Legitimacy Audit & Registry Re-Sourcing
// Prepared by: Big Nate (Antigravity) | 2026-04-20
//
// Targets exactly 33 fabricated leads:
//   • 30 yacht-owners  — ALL ingested from Alfred's fabricated seed CSV
//                        (source: "Alfred Wealth Trigger Miner")
//   •  3 individuals   — source field explicitly tagged "alfred"
//       - Michael Thornton   | aircraft-owners
//       - Sandra Okafor      | business-owners
//       - James Hargrove     | real-estate-investors (nicheId: re-developers)
//
// Detection criteria (must match ANY of):
//   A) nicheId === 'yacht-owners'  AND source contains 'Alfred'  (30 leads)
//   B) source (lowercased) === 'alfred'                          (3 leads)
//
// Cascade: for every purged master_lead, also deletes all matching
//          lead_assignments where masterLeadId === deleted doc ID.
//
// Usage:
//   node scripts/purge_alfred_fabricated.js --dry-run   ← preview only
//   node scripts/purge_alfred_fabricated.js             ← execute delete
//
// Output: prints full manifest of targeted leads + per-advisor impact.
// =====================================================================

'use strict';

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ── Detection helpers ─────────────────────────────────────────────────

function isYachtAlfred(data) {
  const nicheId = (data.nicheId || '').toLowerCase();
  const source  = (data.source  || '').toLowerCase();
  // All yacht-owners originated from Alfred's fabricated seed CSV
  return nicheId === 'yacht-owners' && source.includes('alfred');
}

function isExplicitAlfred(data) {
  const source = (data.source || '').toLowerCase().trim();
  // 3 individual leads tagged with bare "alfred" source
  return source === 'alfred';
}

function isFabricated(data) {
  return isYachtAlfred(data) || isExplicitAlfred(data);
}

// ── Batch delete helper ────────────────────────────────────────────────

async function batchDelete(refs) {
  const CHUNK = 400;
  let deleted = 0;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    refs.slice(i, i + CHUNK).forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += refs.slice(i, i + CHUNK).length;
  }
  return deleted;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const mode = DRY_RUN ? '🔍 DRY RUN — no changes will be made' : '⚠️  LIVE EXECUTION — deletes are PERMANENT';

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — C40: Purge Alfred-Fabricated Leads           ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('║   ' + mode);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. Scan master_leads ──────────────────────────────────────────
  console.log('── Step 1: Scanning master_leads for fabricated leads... ────────');
  const masterSnap = await db.collection('master_leads').get();
  console.log(`   Total master_leads: ${masterSnap.size}`);

  const targets = [];   // { id, ref, data, reason }

  masterSnap.forEach(doc => {
    if (doc.id === '_schema') return;
    const data = doc.data();
    if (!isFabricated(data)) return;

    const reason = isYachtAlfred(data)
      ? 'yacht-owners — Alfred fabricated seed (no USCG backing)'
      : `source:"alfred" — explicit fabrication tag (${data.nicheId || 'unknown niche'})`;

    targets.push({ id: doc.id, ref: doc.ref, data, reason });
  });

  console.log(`   Fabricated leads found: ${targets.length}\n`);

  if (targets.length === 0) {
    console.log('✅ No fabricated leads found. Database is clean.\n');
    process.exit(0);
  }

  // ── 2. Print manifest ─────────────────────────────────────────────
  console.log('── Fabricated Lead Manifest ─────────────────────────────────────');

  const byNiche = {};
  targets.forEach((t, i) => {
    const d = t.data;
    const name    = `${d.firstName || '?'} ${d.lastName || '?'}`.padEnd(26);
    const company = (d.company || '').slice(0, 32).padEnd(34);
    const loc     = `${d.city || '?'}, ${d.state || '?'}`.padEnd(22);
    const niche   = (d.nicheId || d.niche || '?').padEnd(24);
    console.log(`  ${String(i + 1).padStart(2)}. ${name} ${company} ${loc} ${niche}`);
    byNiche[d.nicheId || 'unknown'] = (byNiche[d.nicheId || 'unknown'] || 0) + 1;
  });

  console.log('\n── By Niche ─────────────────────────────────────────────────────');
  Object.entries(byNiche).sort((a, b) => b[1] - a[1]).forEach(([niche, count]) => {
    console.log(`   ${niche.padEnd(30)} ${count}`);
  });

  // ── 3. Find cascade lead_assignments ─────────────────────────────
  console.log('\n── Step 2: Finding lead_assignments to cascade-delete... ────────');
  const targetIds = new Set(targets.map(t => t.id));

  // Query in batches of 30 (Firestore 'in' limit = 30)
  const assignmentRefs = [];
  const idArray = [...targetIds];
  const IN_LIMIT = 30;

  for (let i = 0; i < idArray.length; i += IN_LIMIT) {
    const chunk = idArray.slice(i, i + IN_LIMIT);
    const snap  = await db.collection('lead_assignments')
      .where('masterLeadId', 'in', chunk)
      .get();
    snap.forEach(doc => assignmentRefs.push(doc.ref));
  }

  console.log(`   lead_assignments to delete: ${assignmentRefs.length}`);

  // ── 4. Per-advisor impact ─────────────────────────────────────────
  if (assignmentRefs.length > 0) {
    const advisorImpact = {};
    // Re-fetch to get ownerUid
    for (let i = 0; i < idArray.length; i += IN_LIMIT) {
      const chunk = idArray.slice(i, i + IN_LIMIT);
      const snap  = await db.collection('lead_assignments')
        .where('masterLeadId', 'in', chunk)
        .get();
      snap.forEach(doc => {
        const uid = doc.data().ownerUid || 'unassigned';
        advisorImpact[uid] = (advisorImpact[uid] || 0) + 1;
      });
    }

    console.log('\n── Advisor Impact (lead_assignments removed per advisor) ─────────');
    Object.entries(advisorImpact).forEach(([uid, count]) => {
      console.log(`   ${uid.padEnd(36)} -${count} assignments`);
    });
  }

  // ── 5. Pre-delete count ───────────────────────────────────────────
  const beforeCount = masterSnap.size;
  const afterCount  = beforeCount - targets.length;

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   master_leads before purge : ${beforeCount}`);
  console.log(`   Leads to delete           : ${targets.length}`);
  console.log(`   master_leads after purge  : ${afterCount}`);
  console.log(`   lead_assignments to purge : ${assignmentRefs.length}`);

  if (DRY_RUN) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   DRY RUN COMPLETE — no data was modified                   ║');
    console.log('║   To execute the purge, run WITHOUT --dry-run flag          ║');
    console.log('║   node scripts/purge_alfred_fabricated.js                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    process.exit(0);
  }

  // ── 6. LIVE EXECUTE ───────────────────────────────────────────────
  console.log('\n── Step 3: Executing purge... ───────────────────────────────────');

  // Delete lead_assignments first (cascade)
  if (assignmentRefs.length > 0) {
    process.stdout.write('   Deleting lead_assignments...');
    const aDeleted = await batchDelete(assignmentRefs);
    console.log(` ✅ ${aDeleted} deleted`);
  }

  // Delete master_leads
  process.stdout.write('   Deleting master_leads (fabricated)...');
  const mDeleted = await batchDelete(targets.map(t => t.ref));
  console.log(` ✅ ${mDeleted} deleted`);

  // ── 7. Verification ───────────────────────────────────────────────
  console.log('\n── Step 4: Verification ─────────────────────────────────────────');
  const afterSnap = await db.collection('master_leads').get();

  // Check no fabricated remain
  let fabricatedRemaining = 0;
  afterSnap.forEach(doc => {
    if (doc.id !== '_schema' && isFabricated(doc.data())) fabricatedRemaining++;
  });

  const passCount = afterSnap.size === afterCount;
  const passClean = fabricatedRemaining === 0;

  console.log(`   master_leads after purge  : ${afterSnap.size}  ${passCount ? '✅' : '❌ expected ' + afterCount}`);
  console.log(`   Fabricated leads remaining: ${fabricatedRemaining}  ${passClean ? '✅ Clean' : '❌ Still found fabricated leads — investigate'}`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  if (passCount && passClean) {
    console.log('║   ✅ PURGE COMPLETE                                          ║');
    console.log(`║   ${beforeCount} → ${afterSnap.size} master_leads (${mDeleted} fabricated removed)      ║`);
    console.log('║   0 fabricated leads remain in the pipeline                 ║');
    console.log('║                                                              ║');
    console.log('║   Next: node scripts/agent_uscg_miner.js --dry-run          ║');
    console.log('║          (source real yacht owners from USCG NVDC)          ║');
  } else {
    console.log('║   ⚠️  PURGE COMPLETED WITH WARNINGS — review output above   ║');
    console.log('║   Run audit_leads.js to confirm pipeline state              ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n[FATAL] purge_alfred_fabricated.js:', err.message);
  console.error(err.stack);
  process.exit(1);
});
