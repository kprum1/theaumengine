/**
 * remove_test_advisor.js
 * C37 — Remove test@test.com from production Firestore
 *
 * Usage (operator runs from project root):
 *   node scripts/remove_test_advisor.js
 *
 * What it does:
 *   1. Finds advisor_pool doc where email === 'test@test.com'
 *   2. Finds advisorProfiles doc for same UID
 *   3. Deletes both — does NOT touch any other documents
 *
 * Safe: read-before-delete, shows preview before execution.
 */

'use strict';
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── Service account key ─────────────────────────────────────────────────────
const KEY_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error('❌  serviceAccountKey.json not found at:', KEY_PATH);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();
const TEST_EMAIL = 'test@test.com';

async function main() {
  console.log('\n🔍  Scanning for test@test.com in advisor_pool...\n');

  // 1. Find in advisor_pool
  const poolSnap = await db.collection('advisor_pool')
    .where('email', '==', TEST_EMAIL)
    .get();

  if (poolSnap.empty) {
    console.log('✅  No advisor_pool doc found for test@test.com — already clean.\n');
    process.exit(0);
  }

  const toDelete = [];

  poolSnap.forEach(doc => {
    const data = doc.data();
    console.log(`→ Found in advisor_pool: ${doc.id}`);
    console.log(`  email:       ${data.email}`);
    console.log(`  displayName: ${data.displayName || '(none)'}`);
    console.log(`  nicheIds:    ${(data.nicheIds || []).join(', ') || '(none)'}\n`);
    toDelete.push({ collection: 'advisor_pool', id: doc.id });

    // 2. Also queue advisorProfiles doc if it exists (same UID as doc.id)
    toDelete.push({ collection: 'advisorProfiles', id: doc.id });
  });

  console.log('⚠️  The following documents will be deleted:');
  toDelete.forEach(d => console.log(`   ${d.collection}/${d.id}`));
  console.log('');

  // 3. Execute deletions
  const batch = db.batch();
  for (const { collection, id } of toDelete) {
    const ref = db.collection(collection).doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`🗑  Deleting ${collection}/${id}`);
      batch.delete(ref);
    } else {
      console.log(`ℹ️  ${collection}/${id} — not found, skipping`);
    }
  }

  await batch.commit();
  console.log('\n✅  Done — test@test.com removed from production.\n');
}

main().catch(err => {
  console.error('❌  Script error:', err.message);
  process.exit(1);
});
