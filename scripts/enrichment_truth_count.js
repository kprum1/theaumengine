'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection('master_leads')
    .where('enrichmentStatus', '==', 'enriched')
    .get();

  let apolloTouched = 0, hasEmail = 0, hasPhone = 0, hasBoth = 0, hasTitle = 0;
  snap.forEach(doc => {
    const d = doc.data();
    const sources = d.enrichmentSources || [];
    if (sources.includes('apollo')) apolloTouched++;
    if (d.email)  hasEmail++;
    if (d.phone)  hasPhone++;
    if (d.email && d.phone) hasBoth++;
    if (d.title)  hasTitle++;
  });

  console.log(`\n── Apollo Enrichment Truth ──────────────────────`);
  console.log(`  Total enriched docs (status=enriched): ${snap.size}`);
  console.log(`  Apollo touched:                        ${apolloTouched}`);
  console.log(`  Has email:                             ${hasEmail}`);
  console.log(`  Has phone:                             ${hasPhone}`);
  console.log(`  Has specialty/title:                   ${hasTitle}`);
  console.log(`  Has BOTH email + phone:                ${hasBoth}`);
  console.log(`\n  Apollo email hit rate: ~${Math.round(100*hasEmail/apolloTouched || 0)}% of apollo-touched leads`);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
