// =====================================================================
// THE AUM ENGINE — ADD YACHT-OWNERS NICHE TO PILOT ADVISORS
// scripts/add_yacht_niche.js
//
// Usage:
//   node scripts/add_yacht_niche.js [--dry-run]
//
// Context (C8):
//   The 30 Yacht Owner leads from the C7 batch have nicheId='yacht-owners'.
//   None of the 5 pilot advisors had 'yacht-owners' in their advisor_pool
//   nicheIds, so route_batch.js would return 0 matches.
//
//   This script adds 'yacht-owners' to the advisor_pool docs for:
//     - Matt Germshied  (Chicago, IL — Great Lakes / national)
//     - Ray Uncle       (Miami, FL   — FL/TX/MD coast coverage)
//
//   These two advisors already work with high-net-worth clients and have
//   capacity. Run this ONCE before route_batch.js to enable routing.
//   It uses merge: true so all other fields are preserved.
//
//   Safe to re-run — idempotent (Set.add to array is deduped in code,
//   but Firestore arrayUnion ensures no duplicates).
// =====================================================================

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db   = admin.firestore();
const auth = admin.auth();

const DRY_RUN = process.argv.includes('--dry-run');

// Advisors to patch — keyed by email (looks up UID dynamically via Auth)
const PATCHES = [
  {
    email:       'matt@matt.com',
    addNiches:   ['yacht-owners'],
    note:        'Great Lakes / national — high-capacity advisor',
  },
  {
    email:       'ray@ray.com',
    addNiches:   ['yacht-owners'],
    note:        'Miami FL — coastal coverage for FL/TX/MD yacht owners',
  },
];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — ADD YACHT-OWNERS NICHE               ║');
  console.log(DRY_RUN
    ? '║   MODE: DRY RUN (no writes)                         ║'
    : '║   MODE: LIVE (writing to advisor_pool)              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  for (const patch of PATCHES) {
    console.log(`\n→ Patching: ${patch.email}`);
    console.log(`  Note: ${patch.note}`);

    // Look up UID from Firebase Auth
    let uid;
    try {
      const user = await auth.getUserByEmail(patch.email);
      uid = user.uid;
      console.log(`  ✓ Auth UID: ${uid}`);
    } catch (e) {
      console.log(`  ⚠️  User not found in Auth: ${patch.email}`);
      console.log('     → Run provision_pilot_advisors.js first, then re-run this script.');
      continue;
    }

    // Read current advisor_pool doc
    const poolRef = db.collection('advisor_pool').doc(uid);
    const poolSnap = await poolRef.get();

    if (!poolSnap.exists) {
      console.log(`  ⚠️  advisor_pool doc not found for ${uid}`);
      console.log('     → Run provision_pilot_advisors.js first.');
      continue;
    }

    const current  = poolSnap.data();
    const existing = current.nicheIds || [];
    const toAdd    = patch.addNiches.filter(n => !existing.includes(n));

    if (!toAdd.length) {
      console.log(`  ✓ Already has all target niches: [${existing.join(', ')}] — no change needed.`);
      continue;
    }

    const updated = [...existing, ...toAdd];
    console.log(`  Current nicheIds: [${existing.join(', ')}]`);
    console.log(`  Adding:           [${toAdd.join(', ')}]`);
    console.log(`  Updated nicheIds: [${updated.join(', ')}]`);

    if (!DRY_RUN) {
      // arrayUnion is safest — no risk of overwriting if concurrent writes
      await poolRef.update({
        nicheIds:  admin.firestore.FieldValue.arrayUnion(...patch.addNiches),
        updatedAt: new Date().toISOString(),
      });

      // Also patch the advisorProfile sub-doc so it stays in sync
      await db.collection('users').doc(uid)
              .collection('data').doc('advisorProfile')
              .update({
                nicheIds:  admin.firestore.FieldValue.arrayUnion(...patch.addNiches),
                updatedAt: new Date().toISOString(),
              });

      console.log(`  ✅ advisor_pool + advisorProfile updated.`);
    } else {
      console.log(`  📋 DRY — would write nicheIds: [${updated.join(', ')}]`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   NEXT STEP                                         ║');
  console.log('║   Run routing for the C7 Yacht Owner batch:         ║');
  console.log('║   node scripts/route_batch.js \\                    ║');
  console.log('║     --batch=2026-04-09T19-48-33 --dry-run           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ add_yacht_niche.js failed:', err.message || err);
  process.exit(1);
});
