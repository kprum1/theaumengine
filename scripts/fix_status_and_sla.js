// AUM ENGINE — Fix status casing + SLA breach report
// Run: node scripts/fix_status_and_sla.js
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Status Fix + SLA Breach Report           ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const snap = await db.collection('lead_assignments').get();

  // ── 1. Fix "New" → "new" casing ──────────────────────────────────────────
  console.log('── Fix 1: Status casing normalization ───────────────────────────────');
  const batch = db.batch();
  let fixCount = 0;
  const slaBreached = [];
  const nameMap = {};

  // Load advisor names
  const advisorSnap = await db.collection('pilot_advisors').get();
  advisorSnap.docs.forEach(d => { nameMap[d.id] = d.data().displayName || d.id.slice(0, 14); });

  snap.docs.forEach(d => {
    const data = d.data();
    const statusField = data.advisorStatus !== undefined ? 'advisorStatus' : 'status';
    const currentStatus = data[statusField];

    // Normalize "New" → "new"
    if (currentStatus === 'New') {
      batch.update(d.ref, { [statusField]: 'new' });
      fixCount++;
    }

    // Collect SLA-breached leads
    if (data.slaBreached || data.slaBreach || (data.slaStatus && data.slaStatus === 'breached')) {
      slaBreached.push({ id: d.id, ...data });
    }
  });

  if (fixCount > 0) {
    await batch.commit();
    console.log(`  ✅ Normalized ${fixCount} docs: "New" → "new"`);
  } else {
    console.log('  ✅ No casing fixes needed — all statuses already lowercase');
  }

  // ── 2. SLA breach report ──────────────────────────────────────────────────
  console.log('\n── Fix 2: SLA Breach Report (from routing_logs) ─────────────────────');
  // Fetch recent logs client-side filtered (avoids composite index requirement)
  const allLogsSnap = await db.collection('routing_logs')
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();
  const slaLogsSnap = { docs: allLogsSnap.docs.filter(d => d.data().event === 'sla_breach_flagged'), empty: false };
  if (slaLogsSnap.docs.length === 0) slaLogsSnap.empty = true;
  slaLogsSnap.size = slaLogsSnap.docs.length;

  if (slaLogsSnap.empty) {
    console.log('  ✅ No SLA breach events found in routing_logs');
  } else {
    console.log(`  ⚠️  ${slaLogsSnap.size} SLA breach event(s) found:\n`);
    console.log('  ' + 'Lead Doc ID'.padEnd(30) + 'Timestamp'.padEnd(20) + 'Detail');
    console.log('  ' + '─'.repeat(80));

    const breachedDocIds = new Set();
    slaLogsSnap.docs.forEach(d => {
      const r = d.data();
      const docRef = (r.detail || '').split('/').pop() || r.leadId || '?';
      breachedDocIds.add(docRef);
      console.log('  ' + docRef.padEnd(30) + (r.timestamp || '?').slice(0, 19).padEnd(20) + (r.detail || ''));
    });

    // Fetch the actual breached lead docs for advisor context
    console.log('\n  ── Breached Lead Details ──────────────────────────────────────────');
    console.log('  ' + 'Lead ID'.padEnd(30) + 'Advisor'.padEnd(26) + 'Name / Company'.padEnd(26) + 'Status');
    console.log('  ' + '─'.repeat(95));

    for (const docId of breachedDocIds) {
      try {
        const leadDoc = await db.collection('lead_assignments').doc(docId).get();
        if (leadDoc.exists) {
          const ld = leadDoc.data();
          const advisorName = nameMap[ld.ownerUid] || ld.ownerUid?.slice(0, 14) || '?';
          const leadName = [ld.firstName, ld.lastName].filter(Boolean).join(' ') || ld.company || ld.firmName || '?';
          const status = ld.advisorStatus || ld.status || '?';
          console.log('  ' + docId.slice(0, 28).padEnd(30) + advisorName.padEnd(26) + leadName.slice(0, 24).padEnd(26) + status);
        } else {
          console.log('  ' + docId.slice(0, 28).padEnd(30) + '(doc not found in lead_assignments)');
        }
      } catch (e) {
        console.log('  ' + docId.slice(0, 28).padEnd(30) + '(read error: ' + e.message + ')');
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   COMPLETE                                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  process.exit(0);
}

run().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
