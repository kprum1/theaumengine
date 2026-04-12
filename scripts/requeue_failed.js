// AUM ENGINE — Re-queue Failed Routing Items
// scripts/requeue_failed.js
// Run: node scripts/requeue_failed.js
//
// Resets status=failed routing_queue docs back to 'pending'
// so processRoutingQueue picks them up on the next 5-min tick.
// Skips the _schema garbage doc (no masterLeadId).
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function requeue() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Re-queue Failed Routing Items                 ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const snap = await db.collection('routing_queue').where('status', '==', 'failed').get();
  console.log(`Found ${snap.size} failed items.\n`);

  let reset = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const q = doc.data();

    // Skip garbage _schema doc and any doc with no masterLeadId
    if (!q.masterLeadId) {
      console.log(`  ⏭  Skipping ${doc.id} — no masterLeadId (garbage doc)`);
      skipped++;
      continue;
    }

    // Verify the master_lead still exists before re-queuing
    const leadSnap = await db.collection('master_leads').doc(q.masterLeadId).get();
    if (!leadSnap.exists) {
      console.log(`  ⚠️  Skipping ${doc.id} — master_lead ${q.masterLeadId} not found`);
      skipped++;
      continue;
    }

    await doc.ref.update({
      status:     'pending',
      attempts:   0,
      lastError:  null,
      lockedBy:   null,
      lockedUntil: null,
      updatedAt:  new Date().toISOString(),
      requeuedAt: new Date().toISOString(),
    });

    const lead = leadSnap.data();
    console.log(`  ✅ Re-queued: ${doc.id} → ${lead.firstName} ${lead.lastName} (${lead.nicheId})`);
    reset++;
  }

  console.log(`\n  Reset: ${reset} | Skipped: ${skipped}`);
  console.log('\n  processRoutingQueue fires every 5 min automatically.');
  console.log('  Or run: node scripts/trigger_routing.js to fire it now.\n');
  process.exit(0);
}

requeue().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
