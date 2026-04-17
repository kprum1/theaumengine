#!/usr/bin/env node
// scripts/purge_orphan_queue.js
// Finds routing_queue items with no matching master_lead and either:
//   - Patches them if the master_lead can be found by another key
//   - Marks them 'orphaned' so the queue clears and audit passes
// Run: node scripts/purge_orphan_queue.js
'use strict';

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — ORPHAN QUEUE PURGE                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get all pending queue items
  const pendingSnap = await db.collection('routing_queue')
    .where('status', '==', 'pending')
    .limit(50)
    .get();

  console.log(`  Pending: ${pendingSnap.size} items\n`);

  // Get all master_lead IDs for cross-reference
  const allMasters = await db.collection('master_leads').get();
  const masterIds = new Set();
  const masterByBatch = {};
  allMasters.forEach(doc => {
    masterIds.add(doc.id);
    const d = doc.data();
    if (d.batchId) {
      if (!masterByBatch[d.batchId]) masterByBatch[d.batchId] = [];
      masterByBatch[d.batchId].push({ id: doc.id, nicheId: d.nicheId, state: d.state, city: d.city });
    }
  });

  let fixed = 0;
  let purged = 0;
  const batchWriter = db.batch();

  for (const qDoc of pendingSnap.docs) {
    const qData = qDoc.data();
    const qId = qDoc.id;

    // Check if this queue item's docId matches a master_lead docId
    if (masterIds.has(qId)) {
      // Queue item ID IS a master_lead ID — get niche from master
      const mlDoc = await db.collection('master_leads').doc(qId).get();
      if (mlDoc.exists) {
        const ml = mlDoc.data();
        if (ml.nicheId && ml.nicheId !== 'unknown') {
          batchWriter.update(qDoc.ref, {
            nicheId: ml.nicheId,
            niche:   ml.niche || ml.nicheId,
            state:   ml.state || 'US',
            city:    ml.city  || 'Unknown',
            leadId:  qId,
          });
          console.log(`  ✓ Fixed (by docId): ${qId} → ${ml.nicheId}`);
          fixed++;
          continue;
        }
      }
    }

    // Check by leadId field on the queue item itself
    const leadId = qData.leadId;
    if (leadId && masterIds.has(leadId)) {
      const mlDoc = await db.collection('master_leads').doc(leadId).get();
      if (mlDoc.exists) {
        const ml = mlDoc.data();
        if (ml.nicheId && ml.nicheId !== 'unknown') {
          batchWriter.update(qDoc.ref, {
            nicheId: ml.nicheId,
            niche:   ml.niche || ml.nicheId,
            state:   ml.state || 'US',
            city:    ml.city  || 'Unknown',
          });
          console.log(`  ✓ Fixed (by leadId): ${qId} → ${ml.nicheId}`);
          fixed++;
          continue;
        }
      }
    }

    // Cannot resolve — mark as orphaned so queue clears
    batchWriter.update(qDoc.ref, {
      status: 'orphaned',
      orphanedAt: new Date().toISOString(),
      orphanReason: 'No matching master_lead found — routing_queue entry is stale',
    });
    console.log(`  🗑  Orphaned: ${qId} (no master_lead match)`);
    purged++;
  }

  if (fixed + purged > 0) {
    await batchWriter.commit();
    console.log(`\n  ✅ Fixed:   ${fixed}`);
    console.log(`  🗑  Purged: ${purged} orphaned entries`);
  } else {
    console.log('\n  ℹ️  Nothing to do');
  }

  process.exit(0);
}

run().catch(e => { console.error('[PURGE]', e.message); process.exit(1); });
