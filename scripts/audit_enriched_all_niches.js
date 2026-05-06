#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function audit() {
  console.log('\nPulling all master_leads...');
  const snap = await db.collection('master_leads').get();
  const byNiche = {};
  let totalEnriched = 0, totalActionReady = 0;

  snap.docs.forEach(d => {
    const l = d.data();
    const n = l.nicheId || 'unknown';
    if (!byNiche[n]) byNiche[n] = { total: 0, enriched: 0, actionReady: 0, unassigned: 0, unassignedEnriched: 0 };
    byNiche[n].total++;

    const rawEmail = l.emailAddress || l.email || l.workEmail || l.personalEmail;
    let email = '';
    if (typeof rawEmail === 'string') email = rawEmail;
    else if (Array.isArray(rawEmail)) email = rawEmail[0] || '';
    else if (rawEmail && typeof rawEmail === 'object') email = rawEmail.address || rawEmail.value || '';

    const hasEmail = !!email;
    const hasPhone = !!(l.phone || l.phoneNumber || l.mobilePhone);
    const unassigned = (l.ownershipStatus || '') !== 'assigned';

    if (hasEmail) { byNiche[n].enriched++; totalEnriched++; }
    if (hasEmail && hasPhone) { byNiche[n].actionReady++; totalActionReady++; }
    if (unassigned) byNiche[n].unassigned++;
    if (unassigned && hasEmail) byNiche[n].unassignedEnriched++;
  });

  console.log('\nNiche                        | Total | Email | Email+Ph | Unassigned | UnassignedEmail');
  console.log('-----------------------------|-------|-------|----------|------------|----------------');
  Object.keys(byNiche).sort().forEach(n => {
    const r = byNiche[n];
    console.log(
      n.padEnd(29) + '| ' +
      String(r.total).padEnd(6) + '| ' +
      String(r.enriched).padEnd(6) + '| ' +
      String(r.actionReady).padEnd(9) + '| ' +
      String(r.unassigned).padEnd(11) + '| ' +
      r.unassignedEnriched
    );
  });
  console.log('\nTOTAL enriched (email):       ' + totalEnriched);
  console.log('TOTAL action-ready (e+ph):    ' + totalActionReady);
  process.exit(0);
}
audit().catch(e => { console.error(e.message); process.exit(1); });
