'use strict';
// ============================================================
// C35-3: Status Casing Normalization
// Normalizes lowercase status values → Title Case across:
//   - lead_assignments: advisorStatus, status
//   - master_leads: status
//   - routing_queue: status
//
// Canonical values: 'New' | 'Contacted' | 'Engaged' | 'Nurture'
//                   'Meeting Requested' | 'Booked' | 'Dead'
// ============================================================

const admin = require('./node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const STATUS_MAP = {
  'new':               'New',
  'contacted':         'Contacted',
  'engaged':           'Engaged',
  'nurture':           'Nurture',
  'meeting requested': 'Meeting Requested',
  'meeting_requested': 'Meeting Requested',
  'booked':            'Booked',
  'dead':              'Dead',
  'assigned':          'New',   // routing artifact → normalize to New for advisor view
};

function normalize(val) {
  if (typeof val !== 'string') return null;
  return STATUS_MAP[val.toLowerCase().trim()] || null;
}

async function patchCollection(colName, fields) {
  let total = 0, patched = 0;
  const snap = await db.collection(colName).get();
  total = snap.size;

  // Build batches
  const toUpdate = [];
  snap.forEach(doc => {
    const d = doc.data();
    const updates = {};
    for (const field of fields) {
      const raw = d[field];
      const fixed = normalize(raw);
      if (fixed && fixed !== raw) {
        updates[field] = fixed;
      }
    }
    if (Object.keys(updates).length > 0) {
      toUpdate.push({ ref: doc.ref, updates });
    }
  });

  // Commit in batches of 400
  const BATCH_SIZE = 400;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ ref, updates }) => {
      batch.update(ref, { ...updates, updatedAt: new Date().toISOString() });
    });
    await batch.commit();
    patched += chunk.length;
    process.stdout.write(`  ${colName}: patched ${patched}/${toUpdate.length}...\r`);
  }

  return { total, patched: toUpdate.length };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  C35-3: Status Casing Normalization                 ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. lead_assignments — both advisorStatus and status fields
  console.log('── lead_assignments ──────────────────────────────────');
  const la = await patchCollection('lead_assignments', ['advisorStatus', 'status']);
  console.log(`\n  Scanned: ${la.total} | Patched: ${la.patched} docs ✅\n`);

  // 2. master_leads
  console.log('── master_leads ──────────────────────────────────────');
  const ml = await patchCollection('master_leads', ['status']);
  console.log(`\n  Scanned: ${ml.total} | Patched: ${ml.patched} docs ✅\n`);

  // 3. routing_queue
  console.log('── routing_queue ─────────────────────────────────────');
  const rq = await patchCollection('routing_queue', ['status']);
  console.log(`\n  Scanned: ${rq.total} | Patched: ${rq.patched} docs ✅\n`);

  const totalPatched = la.patched + ml.patched + rq.patched;

  console.log('── Verification ──────────────────────────────────────');
  // Quick spot-check: confirm 0 lowercase remain
  const [check1, check2] = await Promise.all([
    db.collection('lead_assignments').where('advisorStatus', '==', 'new').get(),
    db.collection('lead_assignments').where('status', '==', 'new').get(),
  ]);
  console.log('  lead_assignments.advisorStatus=new remaining: ' + check1.size + (check1.size === 0 ? ' ✅' : ' ⚠️'));
  console.log('  lead_assignments.status=new remaining:        ' + check2.size + (check2.size === 0 ? ' ✅' : ' ⚠️'));

  const allClean = check1.size === 0 && check2.size === 0;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Total patched: ${String(totalPatched).padEnd(4)} docs | ${allClean ? 'ALL CLEAN ✅' : 'ISSUES REMAIN ⚠️'}           ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(e => { console.error('[C35-3 FATAL]', e.message); process.exit(1); });
