'use strict';
const admin = require('firebase-admin');
const path  = require('path');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function audit() {
  const niches = ['law-partners', 'business-owners', 're-developers', 'ai-displaced-executives', 'henrys', 'high-earning-tradesman', 'charity-board-members'];

  for (const niche of niches) {
    const snap = await db.collection('master_leads').where('nicheId', '==', niche).limit(4).get();
    console.log(`\n── ${niche} (${snap.size} sampled) ─────────`);
    snap.forEach(doc => {
      const d = doc.data();
      const nameStr = `"${d.firstName || ''}" "${d.lastName || ''}"`;
      const co      = d.company  ? ` | co: "${d.company}"` : '';
      const src     = d.sourceType || d.dataSource || d.source || '';
      console.log(`  name: ${nameStr}${co} | src: ${src}`);
    });
  }
  process.exit(0);
}

audit().catch(e => { console.error(e.message); process.exit(1); });
