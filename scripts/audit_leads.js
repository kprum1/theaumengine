// AUM ENGINE — Full Leads Engine Audit
// Run: node scripts/audit_leads.js
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function audit() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — LEADS ENGINE AUDIT                       ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const [
    alSnap, masterLeadsSnap, masterLeadsCCSnap, routingQSnap,
    leadAssignSnap, advisorPoolSnap, pilotAdvisorsSnap, routingLogsSnap
  ] = await Promise.all([
    db.collection('al_assignments').get(),
    db.collection('master_leads').get(),
    db.collection('masterLeads').get(),
    db.collection('routing_queue').get(),
    db.collection('lead_assignments').get(),
    db.collection('advisor_pool').get(),
    db.collection('pilot_advisors').get(),
    db.collection('routing_logs').orderBy('timestamp', 'desc').limit(5).get(),
  ]);

  // Build name map from pilot_advisors
  const nameMap = {};
  pilotAdvisorsSnap.docs.forEach(d => { nameMap[d.id] = d.data().displayName || d.id.slice(0,12); });

  // ── Per-advisor lead counts ACROSS BOTH collections ──────────────────────
  // al_assignments uses advisorUid; lead_assignments uses ownerUid
  const combined = {};             // uid → { al, la, total }
  const missingLocation  = [];
  const alStatusBreakdown = {};

  alSnap.docs.forEach(d => {
    const a = d.data();
    const uid = a.advisorUid;
    if (!uid) return;
    if (!combined[uid]) combined[uid] = { al: 0, la: 0 };
    combined[uid].al++;
    alStatusBreakdown[a.status] = (alStatusBreakdown[a.status] || 0) + 1;
    const city  = a.city  || a.homeCity  || a.prospect_city  || '';
    const state = a.state || a.homeState || a.prospect_state || '';
    if (!city || !state) missingLocation.push(d.id);
  });

  leadAssignSnap.docs.forEach(d => {
    const a = d.data();
    const uid = a.ownerUid;
    if (!uid) return;
    if (!combined[uid]) combined[uid] = { al: 0, la: 0 };
    combined[uid].la++;
  });

  // ── Per-advisor summary ──────────────────────────────────────────────────
  const totalLeads = alSnap.size + leadAssignSnap.size;
  console.log('── Leads per Advisor (both collections combined) ──────────────────');
  console.log('  ' + 'Advisor'.padEnd(22) + 'al_assign'.padEnd(12) + 'lead_assign'.padEnd(14) + 'TOTAL');
  console.log('  ' + '─'.repeat(55));

  const allUids = new Set([...Object.keys(combined), ...pilotAdvisorsSnap.docs.map(d => d.id)]);
  let grandTotal = 0;
  allUids.forEach(uid => {
    const c = combined[uid] || { al: 0, la: 0 };
    const total = c.al + c.la;
    grandTotal += total;
    const name = (nameMap[uid] || uid.slice(0,14)).padEnd(22);
    console.log('  ' + name + String(c.al).padEnd(12) + String(c.la).padEnd(14) + total);
  });
  console.log('  ' + '─'.repeat(55));
  console.log('  ' + 'TOTAL'.padEnd(22) + String(alSnap.size).padEnd(12) + String(leadAssignSnap.size).padEnd(14) + grandTotal);

  // Status breakdown (al_assignments)
  console.log('\n  al_assignments status:');
  if (!Object.keys(alStatusBreakdown).length) console.log('    (none)');
  else Object.entries(alStatusBreakdown).forEach(([s, n]) => console.log('    ' + s.padEnd(20) + ': ' + n));

  console.log('\n  Missing city/state: ' + (missingLocation.length === 0 ? '✅ Zero' : '⚠️  ' + missingLocation.length + ' doc(s)'));

  // ── routing_queue ────────────────────────────────────────────────────────
  console.log('\n── routing_queue (' + routingQSnap.size + ' total) ─────────────────────────────────');
  const qStatus = {};
  const failedNiches = {};
  routingQSnap.docs.forEach(d => {
    const q = d.data();
    const s = q.status;
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
  } else if (masterLeadsSnap.size > 0) {
    console.log('  ⚠️  Both exist — masterLeads still has ' + masterLeadsCCSnap.size + ' docs (archive candidate)');
  }

  // ── advisor_pool ─────────────────────────────────────────────────────────
  console.log('\n── advisor_pool (' + advisorPoolSnap.size + ' entries) ───────────────────────────────');
  advisorPoolSnap.docs.forEach(d => {
    const p   = d.data();
    const cap = p.activeLeadCap || '?';
    const actual = (combined[d.id]?.al || 0) + (combined[d.id]?.la || 0);
    const eligible = p.eligibleForRouting ? '✅' : '❌';
    const capBar = cap !== '?' ? ` (${actual}/${cap})` : '';
    console.log('  ' + eligible + ' ' + (p.firmName || d.id.slice(0,12)).padEnd(36) + capBar);
    console.log('    niches: ' + (p.nicheIds || []).join(', '));
    const states = (p.licensedStates || []);
    console.log('    states: ' + (states.length === 0 ? '⚠️  none set (state gate bypassed)' : states.length >= 50 ? '🌐 National' : states.join(', ')));
  });

  // ── recent routing log ────────────────────────────────────────────────────
  console.log('\n── routing_logs (last 5 events) ─────────────────────────────────────');
  if (routingLogsSnap.empty) {
    console.log('  (no routing events yet)');
  } else {
    routingLogsSnap.docs.forEach(d => {
      const r = d.data();
      console.log('  ' + (r.timestamp||'').slice(0,16) + '  ' +
                  (r.event||'?').padEnd(24) + '  ' + (r.detail||'').slice(0,55));
    });
  }

  // ── Health summary ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   HEALTH SUMMARY                                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const totalAssigned = grandTotal;
  const checks = [
    ['Total leads assigned across all advisors > 0', totalAssigned > 0],
    ['All leads have city/state',                    missingLocation.length === 0],
    ['All 5 advisors provisioned',                   pilotAdvisorsSnap.size >= 5],
    ['All advisors eligible for routing',            advisorPoolSnap.docs.every(d => d.data().eligibleForRouting)],
    ['No pending routing_queue items',               (qStatus['pending'] || 0) === 0],
    ['No failed routing_queue items',                (qStatus['failed']  || 0) === 0],
    ['master_leads has docs (CF path)',               masterLeadsSnap.size > 0],
    ['masterLeads archived (schema unified)',          masterLeadsCCSnap.size === 0],
    ['Every pilot advisor has ≥1 lead',              pilotAdvisorsSnap.docs.every(d => ((combined[d.id]?.al||0)+(combined[d.id]?.la||0)) > 0)],
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
