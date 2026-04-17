#!/usr/bin/env node
// scripts/fix_jeremy_states.js
// Fixes Jeremy's advisor_pool entry: ensures states + licensedStates are set
// Also diagnosis-dumps the pending routing_queue items
'use strict';

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — JEREMY STATES FIX + QUEUE DIAGNOSIS     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── 1. Fix Jeremy's advisor_pool entry ───────────────────────────────────
  const pool = await db.collection('advisor_pool').get();
  for (const doc of pool.docs) {
    const d = doc.data();
    if (d.firmName && d.firmName.includes('Ameriprise')) {
      console.log('Jeremy advisor_pool doc:');
      console.log('  docId:         ', doc.id);
      console.log('  states:        ', JSON.stringify(d.states));
      console.log('  licensedStates:', JSON.stringify(d.licensedStates));
      console.log('  state:         ', d.state);

      // Determine what needs fixing
      const needsFix =
        !d.states || d.states.length === 0 ||
        !d.licensedStates || d.licensedStates.length === 0 ||
        !d.state;

      if (needsFix) {
        await doc.ref.update({
          states:         ['MN'],
          licensedStates: ['MN'],
          state:          'MN',
          updatedAt:      new Date().toISOString(),
        });
        console.log('  ✅ Fixed: states/licensedStates/state → MN');
      } else {
        console.log('  ✓ Already correct — applying ensure-set update anyway');
        await doc.ref.update({
          states:         ['MN'],
          licensedStates: ['MN'],
          state:          'MN',
          updatedAt:      new Date().toISOString(),
        });
      }
    }
  }

  // ── 2. Check pending routing_queue items ─────────────────────────────────
  const pendingSnap = await db.collection('routing_queue')
    .where('status', '==', 'pending')
    .limit(30)
    .get();

  console.log(`\n── Pending routing_queue: ${pendingSnap.size} items ──────────────────`);

  if (pendingSnap.size === 0) {
    console.log('  ✅ No pending items');
  } else {
    // Group by nicheId to understand what's stuck
    const byNiche = {};
    const noAdvisor = [];

    pendingSnap.forEach(doc => {
      const d = doc.data();
      const n = d.nicheId || d.niche || 'unknown';
      byNiche[n] = (byNiche[n] || 0) + 1;
      if (!d.assignedAdvisorId) noAdvisor.push({ id: doc.id, niche: n, state: d.state });
    });

    console.log('  By niche:');
    Object.entries(byNiche).forEach(([n, c]) => console.log(`    ${n}: ${c}`));

    if (noAdvisor.length > 0) {
      console.log('\n  Unrouted (no assignedAdvisorId):');
      noAdvisor.slice(0, 5).forEach(l => console.log(`    ${l.id} | ${l.niche} | ${l.state || 'no state'}`));
    }

    // Try to re-route by triggering routing
    console.log('\n  → Run: node scripts/trigger_routing.js to clear these');
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
