#!/usr/bin/env node
// scripts/patch_queue_unknown.js
// Patches routing_queue items with nicheId='unknown' by looking up
// their corresponding master_lead record and copying the real nicheId/state.
// Then triggers routing to clear them.
'use strict';

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — PATCH UNKNOWN NICHE QUEUE ITEMS         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get all pending unknown-niche queue items
  const pendingSnap = await db.collection('routing_queue')
    .where('status', '==', 'pending')
    .limit(50)
    .get();

  console.log(`  Found ${pendingSnap.size} pending routing_queue items`);

  const batch = db.batch();
  let patched = 0;
  let skipped = 0;

  for (const qDoc of pendingSnap.docs) {
    const qData = qDoc.data();
    const leadId = qData.leadId || qData.lead_id || qDoc.id;

    // Only patch 'unknown' nicheId records
    if (qData.nicheId && qData.nicheId !== 'unknown') {
      skipped++;
      continue;
    }

    // Look up the master_lead to get the real nicheId
    const masterSnap = await db.collection('master_leads')
      .where('leadId', '==', leadId)
      .limit(1)
      .get();

    if (masterSnap.empty) {
      // Try by doc ID
      const byId = await db.collection('master_leads').doc(leadId).get();
      if (!byId.exists) {
        console.log(`  ⚠️  No master_lead found for queue item: ${qDoc.id}`);
        skipped++;
        continue;
      }
      const ml = byId.data();
      if (!ml.nicheId || ml.nicheId === 'unknown') {
        console.log(`  ⚠️  master_lead ${leadId} also has unknown nicheId`);
        skipped++;
        continue;
      }
      batch.update(qDoc.ref, {
        nicheId: ml.nicheId,
        niche:   ml.niche || ml.nicheId,
        state:   ml.state || '',
        city:    ml.city  || '',
      });
      console.log(`  ✓ Patched queue item ${qDoc.id} → nicheId: ${ml.nicheId}`);
      patched++;
    } else {
      const ml = masterSnap.docs[0].data();
      if (!ml.nicheId || ml.nicheId === 'unknown') {
        skipped++;
        continue;
      }
      batch.update(qDoc.ref, {
        nicheId: ml.nicheId,
        niche:   ml.niche || ml.nicheId,
        state:   ml.state || '',
        city:    ml.city  || '',
      });
      console.log(`  ✓ Patched queue item ${qDoc.id} → nicheId: ${ml.nicheId}`);
      patched++;
    }
  }

  if (patched > 0) {
    await batch.commit();
    console.log(`\n  ✅ Committed ${patched} patches`);
  } else {
    console.log('\n  ℹ️  No patches needed (or nicheId already set)');
  }

  console.log(`  Skipped: ${skipped}`);
  console.log('\n  → Next: node scripts/trigger_routing.js');
  process.exit(0);
}

run().catch(e => { console.error('[PATCH]', e.message); process.exit(1); });
