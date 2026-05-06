#!/usr/bin/env node
'use strict';
// Dumps all company names for the polluted niches so we can build lookup tables
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function main() {
  const niches = ['law-partners', 'business-owners', 're-developers', 'high-earning-tradesman'];
  for (const niche of niches) {
    const snap = await db.collection('master_leads').where('nicheId', '==', niche).get();
    console.log(`\n── ${niche} (${snap.size} total) ──────────────────────────────`);
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.firstName || !d.firstName.trim()) {
        const co  = d.company || d.firmName || '';
        const cty = d.city || '';
        const st  = d.state || '';
        console.log(`  "${co}" | ${cty}, ${st}`);
      }
    });
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
