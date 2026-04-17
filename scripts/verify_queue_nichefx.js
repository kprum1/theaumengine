#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function run() {
  console.log('\n── Verifying new routing_queue items have nicheId (post-fix) ──\n');

  // Route: get 5 queue items created this session from routing_logs
  const logs = await db.collection('routing_logs')
    .where('event','==','lead_ingested')
    .limit(30).get();

  const qIds = [];
  logs.forEach(d => {
    const data = d.data();
    if (data.queueItemId) qIds.push(data.queueItemId);
  });

  console.log(`  Found ${qIds.length} log entries with queueItemIds`);

  let withNiche = 0, withoutNiche = 0, notFound = 0;

  for (const qid of qIds.slice(0, 20)) {
    const qDoc = await db.collection('routing_queue').doc(qid).get();
    if (!qDoc.exists) { notFound++; continue; }
    const d = qDoc.data();
    if (d.nicheId && d.nicheId !== '') {
      withNiche++;
    } else {
      withoutNiche++;
      console.log(`  [NO NICHE] ${qid} | status: ${d.status} | masterLeadId: ${d.masterLeadId}`);
    }
  }

  console.log(`\n  Results:`);
  console.log(`    With nicheId:    ${withNiche}`);
  console.log(`    Without nicheId: ${withoutNiche}`);
  console.log(`    Not found:       ${notFound}`);

  if (withNiche === 0 && withoutNiche > 0) {
    console.log('\n  ⚠️  The ingest fix has NOT been applied to any existing queue docs.');
    console.log('     This is expected — the fix applies to NEW ingests going forward.');
    console.log('     Run a new ingest batch to confirm the fix works.');
  } else if (withNiche > 0) {
    console.log('\n  ✅ Post-fix queue items have nicheId — fix is working!');
  }

  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
