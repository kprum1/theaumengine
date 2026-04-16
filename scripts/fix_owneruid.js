'use strict';
// fix_owneruid.js — One-shot repair: fix truncated ownerUid on lead_assignments
// Runs from: node scripts/fix_owneruid.js (project root)

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Truncated 20-char → full 28-char Firebase UID
const UID_MAP = {
  'Iqo8zz5gTFh967ZokqHC': 'Iqo8zz5gTFh967ZokqHCpUp4S2t2',  // Wight Financial
  'Zd4H7gaNZJdrgXbIWNnM': 'Zd4H7gaNZJdrgXbIWNnM5cSpqdB2',  // Ray Financial Advisors
  'BQhiSqKW2JM3ycrPQYze': 'BQhiSqKW2JM3ycrPQYzeXa640Ku1',  // Cooper Capital Group
  'yzTL1YHadINFrMwxCMrr': 'yzTL1YHadINFrMwxCMrrh0fbhZp2',  // Germshied Wealth Management
  'NzC6fh3sXKVuDmgfPAaa': 'NzC6fh3sXKVuDmgfPAaaEea3Ovm2',  // Duelly / Belly Wealth
};

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Fix: ownerUid truncation repair        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const snap = await db.collection('lead_assignments').get();
  console.log(`Total lead_assignments: ${snap.size}`);

  const toFix = [];
  snap.forEach(d => {
    const uid = d.data().ownerUid || '';
    if (UID_MAP[uid]) toFix.push({ id: d.id, truncated: uid, full: UID_MAP[uid] });
  });

  console.log(`Need repair: ${toFix.length}`);
  console.log(`Already correct / other: ${snap.size - toFix.length}\n`);

  if (toFix.length === 0) {
    console.log('✅ Nothing to fix. All ownerUids are correct.');
    process.exit(0);
  }

  // Also fix advisor_pool currentLeadCount — will recalculate after
  // Firestore batches max 500 writes each
  const BATCH_SIZE = 400;
  let fixed = 0;

  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ id, full }) => {
      batch.update(db.collection('lead_assignments').doc(id), {
        ownerUid:  full,
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    fixed += chunk.length;
    process.stdout.write(`  Fixed ${fixed}/${toFix.length}...\r`);
  }

  console.log(`\n✅ Repaired ${fixed} lead_assignments\n`);

  // Now recalculate advisor_pool currentLeadCount from the fixed data
  console.log('Recalculating advisor_pool currentLeadCount...');
  const counts = {};
  Object.values(UID_MAP).forEach(uid => { counts[uid] = 0; });

  const fullSnap = await db.collection('lead_assignments').get();
  fullSnap.forEach(d => {
    const uid = d.data().ownerUid || '';
    if (counts[uid] !== undefined) counts[uid]++;
  });

  const poolBatch = db.batch();
  Object.entries(counts).forEach(([uid, count]) => {
    poolBatch.update(db.collection('advisor_pool').doc(uid), {
      currentLeadCount: count,
      updatedAt: new Date().toISOString(),
    });
    console.log(`  ${uid.slice(0,12)}... → ${count} leads`);
  });
  await poolBatch.commit();

  console.log('\n✅ advisor_pool counts recalculated');
  console.log('✅ Cockpit will now show all leads correctly on next login\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[fix_owneruid] FATAL:', err.message);
  process.exit(1);
});
