#!/usr/bin/env node
'use strict';
// Dumps leads with LinkedIn URL but no email AND no phone
// These are Proxycurl candidates
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('master_leads').get();
  const candidates = [];
  snap.forEach(doc => {
    const d = doc.data();
    const hasLinkedIn = !!(d.linkedInUrl && d.linkedInUrl.trim() && d.linkedInUrl.includes('linkedin.com'));
    const hasEmail   = !!(d.email && d.email.trim());
    const hasPhone   = !!(d.phone && d.phone.trim());
    if (hasLinkedIn && !hasEmail && !hasPhone) {
      candidates.push({
        id: doc.id,
        name: `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        nicheId: d.nicheId,
        linkedInUrl: d.linkedInUrl,
        city: d.city, state: d.state,
      });
    }
  });

  console.log(`\nProxycurl Candidates: ${candidates.length} leads (LinkedIn ✓, email ✗, phone ✗)\n`);
  const byNiche = {};
  candidates.forEach(c => { byNiche[c.nicheId] = (byNiche[c.nicheId] || 0) + 1; });
  console.log('By niche:');
  Object.entries(byNiche).sort((a,b)=>b[1]-a[1]).forEach(([n,ct]) => console.log(`  ${n}: ${ct}`));
  console.log('\nSample leads:');
  candidates.slice(0, 10).forEach(c => {
    console.log(`  ${c.name} | ${c.nicheId} | ${c.city}, ${c.state}`);
    console.log(`    ${c.linkedInUrl}`);
  });
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
