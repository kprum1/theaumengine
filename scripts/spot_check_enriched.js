'use strict';
const admin = require('firebase-admin');
const path  = require('path');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'physicians')
    .where('enrichmentStatus', '==', 'enriched')
    .limit(8)
    .get();

  console.log(`\nSpot-checking ${snap.size} enriched physician leads:\n`);
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`${d.firstName} ${d.lastName} (${d.city}, ${d.state})`);
    console.log(`  email:    ${d.email    || '(blank)'}`);
    console.log(`  phone:    ${d.phone    || '(blank)'}`);
    console.log(`  title:    ${d.title    || '(blank)'}`);
    console.log(`  sources:  ${JSON.stringify(d.enrichmentSources || [])}`);
    console.log('');
  });
  process.exit(0);
}

check().catch(e => { console.error(e.message); process.exit(1); });
