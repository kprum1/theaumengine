#!/usr/bin/env node
// scripts/write_pipeline_meta.js
// Writes accurate pipeline stats to Firestore meta/pipeline_stats.
// Called after any ingest run so the browser KPI always shows the true total.
// Usage: node scripts/write_pipeline_meta.js

'use strict';
const admin  = require('firebase-admin');
const path   = require('path');

const KEY    = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db     = admin.firestore();

async function run() {
  console.log('── Writing pipeline meta ──────────────────────────────');

  // 1. Count lead_assignments per advisor
  const laSnap = await db.collection('lead_assignments').get();
  const byUid  = {};
  laSnap.forEach(d => {
    const uid = d.data().ownerUid;
    if (!uid) return;
    byUid[uid] = (byUid[uid] || 0) + 1;
  });
  const totalLeads = laSnap.size;

  // 2. Count master_leads
  const mlSnap = await db.collection('master_leads').get();
  const totalMasterLeads = mlSnap.size;

  // 3. Count routing_queue
  const rqSnap = await db.collection('routing_queue').get();
  const totalQueueItems = rqSnap.size;

  // 4. Write summary doc — readable by browser client as 1 Firestore read
  const stat = {
    totalLeads,           // canonical: all lead_assignments docs
    totalMasterLeads,     // master_leads collection
    totalQueueItems,
    leadsByAdvisor: byUid,
    updatedAt: new Date().toISOString(),
    updatedBy: 'write_pipeline_meta.js',
  };

  await db.collection('meta').doc('pipeline_stats').set(stat);

  console.log('  total lead_assignments :', totalLeads);
  console.log('  total master_leads     :', totalMasterLeads);
  console.log('  total routing_queue    :', totalQueueItems);
  console.log('  leads by advisor       :', JSON.stringify(byUid, null, 2));
  console.log('  ✅ meta/pipeline_stats written to Firestore');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
