// =====================================================================
// THE AUM ENGINE — PATCH: Matt Germshied activeLeadCap → 35
// scripts/patch_matt_cap.js
// Run: node scripts/patch_matt_cap.js
// One-off patch. Safe to re-run (idempotent merge).
// =====================================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MATT_UID = 'yzTL1YHaJ3RXK8vqUwP5i2MnFbG4';  // from C9 handoff

async function patchMattCap() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  PATCH: Matt Germshied activeLeadCap     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── 1. Find Matt's advisor_pool doc by firmName (UID might have been truncated in handoff) ──
  const poolSnap = await db.collection('advisor_pool')
    .where('firmName', '==', 'Germshied Wealth Management')
    .limit(1)
    .get();

  if (poolSnap.empty) {
    console.error('❌  Could not find Matt Germshied in advisor_pool. Aborting.');
    process.exit(1);
  }

  const mattDoc = poolSnap.docs[0];
  const before  = mattDoc.data();

  console.log(`  Document ID : ${mattDoc.id}`);
  console.log(`  firmName    : ${before.firmName}`);
  console.log(`  Cap BEFORE  : ${before.activeLeadCap}`);

  if (before.activeLeadCap >= 35) {
    console.log('\n  ✅  Cap is already ≥ 35. No update needed.');
    process.exit(0);
  }

  // ── 2. Apply patch ────────────────────────────────────────────────────────
  await mattDoc.ref.set({
    activeLeadCap: 35,
    capPolicy:     'soft',          // keep soft-cap policy consistent
    capWarningPct: 90,
    updatedAt:     new Date().toISOString(),
    capRaisedAt:   new Date().toISOString(),
    capRaisedNote: 'C9+1 session: raised from 25→35 because Matt stayed at 30 leads through session end',
  }, { merge: true });

  console.log(`  Cap AFTER   : 35`);
  console.log('\n  ✅  advisor_pool patched successfully.');
  console.log('  ℹ️   Run node scripts/audit_leads.js to confirm.\n');

  process.exit(0);
}

patchMattCap().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
