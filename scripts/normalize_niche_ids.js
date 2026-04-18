/**
 * normalize_niche_ids.js
 * C35-1: Normalize "real-estate-developers" → "re-developers" across all Firestore collections.
 * Touches: advisor_pool, pilot_advisors, users (advisorProfile), master_leads, lead_assignments, routing_queue
 */

const admin = require('./node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const OLD_NICHE = 'real-estate-developers';
const NEW_NICHE = 're-developers';

let totalPatched = 0;
let totalSkipped = 0;

function swapNiche(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(n => n === OLD_NICHE ? NEW_NICHE : n);
}

async function patchAdvisorCollection(collectionName) {
  console.log(`\n── Patching ${collectionName} ─────────────────────`);
  const snap = await db.collection(collectionName).get();
  const batch = db.batch();
  let count = 0;

  snap.forEach(doc => {
    const d = doc.data();
    const nicheIds = d.nicheIds || d.niches || [];
    if (nicheIds.includes(OLD_NICHE)) {
      const updated = swapNiche(nicheIds);
      const updateObj = {};
      if (d.nicheIds) updateObj.nicheIds = updated;
      if (d.niches)   updateObj.niches   = updated;
      batch.update(doc.ref, updateObj);
      console.log(`  ✅ ${d.firmName || d.email || doc.id.slice(0,12)} — swapped niche`);
      count++;
    } else {
      console.log(`  — ${d.firmName || d.email || doc.id.slice(0,12)} — no change`);
      totalSkipped++;
    }
  });

  if (count > 0) await batch.commit();
  totalPatched += count;
  console.log(`  → ${count} patched in ${collectionName}`);
}

async function patchUsersAdvisorProfile() {
  console.log(`\n── Patching users/{uid}/data/advisorProfile ──────`);
  const usersSnap = await db.collection('users').get();
  let count = 0;

  for (const userDoc of usersSnap.docs) {
    try {
      const profileRef = db.collection('users').doc(userDoc.id).collection('data').doc('advisorProfile');
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) continue;

      const d = profileSnap.data();
      const nicheIds = d.nicheIds || d.niches || [];
      if (nicheIds.includes(OLD_NICHE)) {
        const updated = swapNiche(nicheIds);
        const updateObj = {};
        if (d.nicheIds) updateObj.nicheIds = updated;
        if (d.niches)   updateObj.niches   = updated;
        await profileRef.update(updateObj);
        console.log(`  ✅ users/${userDoc.id.slice(0,8)}/data/advisorProfile — swapped`);
        count++;
      }
    } catch (e) {
      // no advisorProfile subpath — skip
    }
  }

  totalPatched += count;
  console.log(`  → ${count} advisor profiles patched`);
}

async function patchLeadCollection(collectionName) {
  console.log(`\n── Patching ${collectionName} ─────────────────────`);
  const snap = await db.collection(collectionName)
    .where('nicheId', '==', OLD_NICHE)
    .get();

  if (snap.empty) {
    console.log(`  — 0 docs with nicheId="${OLD_NICHE}" found`);
    return;
  }

  const BATCH_SIZE = 400;
  let count = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { nicheId: NEW_NICHE });
    count++;
    batchCount++;
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  totalPatched += count;
  console.log(`  ✅ ${count} docs patched in ${collectionName}`);
}

async function run() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  C35-1: Niche ID Normalization               ║');
  console.log(`║  "${OLD_NICHE}" → "${NEW_NICHE}"  ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Patch advisor registries
  await patchAdvisorCollection('advisor_pool');
  await patchAdvisorCollection('pilot_advisors');
  await patchUsersAdvisorProfile();

  // Patch lead collections
  await patchLeadCollection('master_leads');
  await patchLeadCollection('lead_assignments');
  await patchLeadCollection('routing_queue');

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  DONE — ${totalPatched} records patched, ${totalSkipped} skipped    ║`);
  console.log('╚══════════════════════════════════════════════╝');

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
