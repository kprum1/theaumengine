// AUM ENGINE — Full Leads Engine Audit (Sprint 4: unified lead_assignments)
// Run: node scripts/audit_leads.js
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function audit() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — LEADS ENGINE AUDIT (Sprint 5)            ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const [
    alSnap, masterLeadsSnap, masterLeadsCCSnap, routingQSnap,
    leadAssignSnap, advisorPoolSnap, pilotAdvisorsSnap, routingLogsSnap
  ] = await Promise.all([
    db.collection('al_assignments').get(),          // frozen archive — read-only
    db.collection('master_leads').get(),
    db.collection('masterLeads').get(),
    db.collection('routing_queue').get(),
    db.collection('lead_assignments').get(),         // canonical collection
    db.collection('advisor_pool').get(),
    db.collection('pilot_advisors').get(),
    db.collection('routing_logs').orderBy('timestamp', 'desc').limit(5).get(),
  ]);

  // Build name map from pilot_advisors
  const nameMap = {};
  pilotAdvisorsSnap.docs.forEach(d => { nameMap[d.id] = d.data().displayName || d.id.slice(0,12); });

  // ── Per-advisor lead counts from lead_assignments (canonical) ────────────
  // Post-Sprint4: all leads live in lead_assignments (ownerUid field).
  // al_assignments is frozen — shown as reference only.
  const combined = {};   // uid → { la: count }
  const missingLocation  = [];
  const laStatusBreakdown = {};

  leadAssignSnap.docs.forEach(d => {
    const a = d.data();
    const uid = a.ownerUid;
    if (!uid) return;
    if (!combined[uid]) combined[uid] = { la: 0 };
    combined[uid].la++;
    const st = a.advisorStatus || a.status || 'unknown';
    laStatusBreakdown[st] = (laStatusBreakdown[st] || 0) + 1;
    // Note: city/state lives in master_leads (not assignment docs) — verified via master_leads check below
  });


  // ── Per-advisor summary ──────────────────────────────────────────────────
  console.log('── Leads per Advisor (lead_assignments — canonical) ───────────────────');
  console.log('  ' + 'Advisor'.padEnd(24) + 'lead_assign'.padEnd(14) + 'TOTAL');
  console.log('  ' + '─'.repeat(42));

  const allUids = new Set([...Object.keys(combined), ...pilotAdvisorsSnap.docs.map(d => d.id)]);
  let grandTotal = 0;
  allUids.forEach(uid => {
    const c = combined[uid] || { la: 0 };
    const total = c.la;
    grandTotal += total;
    const name = (nameMap[uid] || uid.slice(0,14)).padEnd(24);
    console.log('  ' + name + String(c.la).padEnd(14) + total);
  });
  console.log('  ' + '─'.repeat(42));
  console.log('  ' + 'TOTAL'.padEnd(24) + String(leadAssignSnap.size).padEnd(14) + grandTotal);

  // Status breakdown (lead_assignments)
  console.log('\n  lead_assignments status breakdown:');
  if (!Object.keys(laStatusBreakdown).length) console.log('    (none)');
  else Object.entries(laStatusBreakdown).sort().forEach(([s, n]) =>
    console.log('    ' + s.padEnd(22) + ': ' + n));

  // al_assignments: intentionally purged in Sprint 5 (demo data removed)
  console.log('\n  al_assignments (purged Sprint 5): ' + alSnap.size + ' docs' + (alSnap.size === 0 ? ' ✅ Clean — demo data removed' : ' ⚠️  Still has data'));

  // Location check: city/state lives in master_leads (the source of truth for lead data)
  const mlMissingLocation = [];
  masterLeadsSnap.docs.forEach(d => {
    const m = d.data();
    if (!m.city && !m.state) mlMissingLocation.push(d.id);
  });
  console.log('\n  Missing city/state in master_leads: ' + (mlMissingLocation.length === 0 ? '✅ Zero' : '⚠️  ' + mlMissingLocation.length + ' doc(s)'));

  // ── routing_queue ────────────────────────────────────────────────────────
  console.log('\n── routing_queue (' + routingQSnap.size + ' total) ─────────────────────────────────');
  const qStatus = {};
  routingQSnap.docs.forEach(d => {
    const s = d.data().status;
    qStatus[s] = (qStatus[s] || 0) + 1;
  });
  if (!Object.keys(qStatus).length) console.log('  (empty)');
  else Object.entries(qStatus).forEach(([s, n]) => {
    const flag = s === 'pending' ? '  ⏳' : s === 'failed' ? '  ❌' : s === 'assigned' ? '  ✅' : '';
    console.log('  ' + s.padEnd(14) + ': ' + n + flag);
  });

  // ── master_leads vs masterLeads ──────────────────────────────────────────
  console.log('\n── Lead source collections ──────────────────────────────────────────');
  console.log('  master_leads  (CF path, snake_case)   : ' + masterLeadsSnap.size + ' docs');
  console.log('  masterLeads   (batch path, camelCase) : ' + masterLeadsCCSnap.size + ' docs');
  if (masterLeadsCCSnap.size === 0) {
    console.log('  ✅ masterLeads is empty — schema fully unified');
  } else {
    console.log('  ⚠️  masterLeads still has ' + masterLeadsCCSnap.size + ' docs (archive candidate)');
  }

  // ── advisor_pool ─────────────────────────────────────────────────────────
  console.log('\n── advisor_pool (' + advisorPoolSnap.size + ' entries) ───────────────────────────────');
  advisorPoolSnap.docs.forEach(d => {
    const p   = d.data();
    const cap = p.activeLeadCap || '?';
    const actual = combined[d.id]?.la || 0;
    const eligible = p.eligibleForRouting ? '✅' : '❌';
    const capBar = cap !== '?' ? ` (${actual}/${cap})` : '';
    const policy = p.capPolicy ? ` [${p.capPolicy}]` : '';
    console.log('  ' + eligible + ' ' + (p.firmName || d.id.slice(0,12)).padEnd(36) + capBar + policy);
    console.log('    niches: ' + (p.nicheIds || []).join(', '));
    const states = (p.licensedStates || []);
    console.log('    states: ' + (states.length === 0 ? '⚠️  none set' : states.length >= 50 ? '🌐 National' : states.join(', ')));
  });

  // ── recent routing log ────────────────────────────────────────────────────
  console.log('\n── routing_logs (last 5 events) ─────────────────────────────────────');
  if (routingLogsSnap.empty) {
    console.log('  (no routing events yet)');
  } else {
    routingLogsSnap.docs.forEach(d => {
      const r = d.data();
      console.log('  ' + (r.timestamp||'').slice(0,16) + '  ' +
                  (r.event||'?').padEnd(26) + '  ' + (r.detail||'').slice(0,55));
    });
  }

  // ── Health summary ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   HEALTH SUMMARY                                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const checks = [
    ['Total leads assigned across all advisors > 0',   grandTotal > 0],
    ['All master_leads have city/state',               mlMissingLocation.length === 0],
    ['All 6 advisors provisioned (5 pilot + Kosal)',    advisorPoolSnap.size >= 6],
    ['All advisors eligible for routing',               advisorPoolSnap.docs.every(d => d.data().eligibleForRouting)],
    ['No pending routing_queue items',                  (qStatus['pending'] || 0) === 0],
    ['No failed routing_queue items',                   (qStatus['failed']  || 0) === 0],
    ['master_leads has docs (CF path)',                  masterLeadsSnap.size > 0],
    ['masterLeads archived (schema unified)',             masterLeadsCCSnap.size === 0],
    ['Every pilot advisor has ≥1 lead',                 pilotAdvisorsSnap.docs.every(d => (combined[d.id]?.la || 0) > 0)],
    ['Sprint 5: al_assignments purged (demo data gone)', alSnap.size === 0],
  ];

  checks.forEach(([label, pass]) => {
    console.log('  ' + (pass ? '✅' : '❌') + '  ' + label);
  });

  const score = checks.filter(c => c[1]).length;
  console.log('\n  Score: ' + score + '/' + checks.length + (score === checks.length ? '  🟢 All systems go' : '  🟡 Issues found — see above'));
  console.log('\n');
  process.exit(0);
}

audit().catch(e => { console.error('[AUDIT ERROR]', e.message, e.stack); process.exit(1); });
