#!/usr/bin/env node
// scripts/write_pipeline_meta.js
// Writes accurate pipeline stats to Firestore meta/pipeline_stats.
// v3: Counts per-niche from master_leads (canonical source of nicheId).
//     lead_assignments are counted per-advisor. latestIngest from master_leads.
// Usage: node scripts/write_pipeline_meta.js

'use strict';
const admin = require('firebase-admin');
const path  = require('path');
const KEY   = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

async function run() {
  console.log('── Writing pipeline meta v3 ───────────────────────────');

  // 1. Count lead_assignments per advisor UID (canonical lead count per advisor)
  const laSnap = await db.collection('lead_assignments').get();
  const byUid  = {};
  laSnap.forEach(d => {
    const uid = d.data().ownerUid;
    if (uid) byUid[uid] = (byUid[uid] || 0) + 1;
  });
  const totalLeads = laSnap.size;

  // 2. Count master_leads per nicheId + get latest ingest date per niche
  const mlSnap = await db.collection('master_leads').get();
  const totalMasterLeads = mlSnap.size;
  const byNiche = {}; // { nicheId: { total, latestIngest } }

  mlSnap.forEach(d => {
    const data    = d.data();
    const nicheId = data.nicheId || data.niche_id || null;
    const ts_raw  = data.createdAt || data.ingestedAt || data.assignedAt || null;
    if (!nicheId) return;

    if (!byNiche[nicheId]) byNiche[nicheId] = { total: 0, latestIngest: null };
    byNiche[nicheId].total++;

    const ts = typeof ts_raw === 'string'
      ? ts_raw
      : ts_raw?.toDate?.().toISOString() || null;
    if (ts && (!byNiche[nicheId].latestIngest || ts > byNiche[nicheId].latestIngest)) {
      byNiche[nicheId].latestIngest = ts;
    }
  });

  // 3. Count routing_queue
  const rqSnap = await db.collection('routing_queue').get();
  const totalQueueItems = rqSnap.size;

  // 4. Write to Firestore — 1 read from browser loads everything
  const stat = {
    totalLeads,
    totalMasterLeads,
    totalQueueItems,
    leadsByAdvisor: byUid,
    nicheBreakdown: byNiche,
    updatedAt: new Date().toISOString(),
    updatedBy: 'write_pipeline_meta.js v3',
  };

  await db.collection('meta').doc('pipeline_stats').set(stat);

  console.log('  total lead_assignments :', totalLeads);
  console.log('  total master_leads     :', totalMasterLeads);
  console.log('  total routing_queue    :', totalQueueItems);
  console.log('  niche breakdown (from master_leads):');
  Object.entries(byNiche)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([id, { total, latestIngest }]) => {
      console.log(`    ${id.padEnd(32)} ${String(total).padStart(5)} leads   latest: ${latestIngest ? latestIngest.slice(0, 10) : '—'}`);
    });
  console.log('  ✅ meta/pipeline_stats written to Firestore');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
