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

  // ── al_assignments ──────────────────────────────────────────────────────
  console.log('── al_assignments (' + alSnap.size + ' total) ─────────────────────────────');
  const byAdvisor = {};
  const missingLocation = [];
  const statusBreakdown = {};
  alSnap.docs.forEach(d => {
    const a = d.data();
    byAdvisor[a.advisorUid] = (byAdvisor[a.advisorUid] || 0) + 1;
    statusBreakdown[a.status] = (statusBreakdown[a.status] || 0) + 1;
    const city  = a.city  || a.homeCity  || a.prospect_city  || '';
    const state = a.state || a.homeState || a.prospect_state || '';
    if (!city || !state) missingLocation.push(d.id);
  });

  // Advisor name lookup from pilot_advisors
  const nameMap = {};
  pilotAdvisorsSnap.docs.forEach(d => { nameMap[d.id] = d.data().displayName || d.id.slice(0,12); });

  Object.entries(byAdvisor).forEach(([uid, n]) => {
    console.log('  ' + (nameMap[uid] || uid.slice(0,14)).padEnd(22) + ' → ' + n + ' lead(s)');
  });

  console.log('\n  Status breakdown:');
  if (Object.keys(statusBreakdown).length === 0) console.log('    (none)');
  else Object.entries(statusBreakdown).forEach(([s, n]) => console.log('    ' + s.padEnd(20) + ': ' + n));

  console.log('\n  Missing city/state: ' + (missingLocation.length === 0 ? '✅ Zero' : '⚠️  ' + missingLocation.length + ' doc(s) → run patch_al_location.js'));

  // ── routing_queue ───────────────────────────────────────────────────────
  console.log('\n── routing_queue (' + routingQSnap.size + ' total) ──────────────────────────────');
  const qStatus = {};
  routingQSnap.docs.forEach(d => { const s = d.data().status; qStatus[s] = (qStatus[s] || 0) + 1; });
  if (Object.keys(qStatus).length === 0) console.log('  (empty)');
  else Object.entries(qStatus).forEach(([s, n]) => {
    const flag = s === 'pending' ? '  ⏳' : s === 'failed' ? '  ❌' : s === 'assigned' ? '  ✅' : '';
    console.log('  ' + s.padEnd(14) + ': ' + n + flag);
  });

  // ── master_leads vs masterLeads ─────────────────────────────────────────
  console.log('\n── Lead source collections ─────────────────────────────────────');
  console.log('  master_leads  (CF ingestion path, snake_case)  : ' + masterLeadsSnap.size + ' docs');
  console.log('  masterLeads   (batch script path, camelCase)   : ' + masterLeadsCCSnap.size + ' docs');

  if (masterLeadsSnap.size === 0 && masterLeadsCCSnap.size > 0) {
    console.log('\n  ⚠️  MISMATCH — All leads are in masterLeads but CF routing reads master_leads.');
    console.log('     processRoutingQueue will find 0 pending leads → Sprint 2 fix required.');
  } else if (masterLeadsSnap.size > 0 && masterLeadsCCSnap.size === 0) {
    console.log('\n  ✅ All leads in master_leads — CF routing engine aligned.');
  } else if (masterLeadsSnap.size > 0 && masterLeadsCCSnap.size > 0) {
    console.log('\n  ⚠️  Leads split across BOTH collections — Sprint 2 unification needed.');
  } else {
    console.log('\n  ℹ️  Both collections empty — no leads ingested yet.');
  }

  // ── lead_assignments (legacy track) ─────────────────────────────────────
  console.log('\n── lead_assignments (legacy / CF track) (' + leadAssignSnap.size + ' total) ──────');
  const laStatus = {};
  leadAssignSnap.docs.forEach(d => { const s = d.data().ownershipStatus; laStatus[s] = (laStatus[s] || 0) + 1; });
  if (Object.keys(laStatus).length === 0) console.log('  (empty)');
  else Object.entries(laStatus).forEach(([s, n]) => console.log('  ' + s.padEnd(14) + ': ' + n));

  // ── advisor_pool ─────────────────────────────────────────────────────────
  console.log('\n── advisor_pool (' + advisorPoolSnap.size + ' entries) ────────────────────────────');
  advisorPoolSnap.docs.forEach(d => {
    const p = d.data();
    const eligible = p.eligibleForRouting ? '✅ Eligible' : '❌ NOT ELIGIBLE';
    const niches   = (p.nicheIds || []).join(', ') || '(none)';
    const cap      = p.activeLeadCap || '?';
    const current  = p.currentLeadCount !== undefined ? p.currentLeadCount : '?';
    console.log('  ' + (p.firmName || d.id.slice(0,12)).padEnd(36) +
                eligible + '  cap:' + cap + '  current:' + current);
    console.log('    niches: ' + niches);
  });

  // ── pilot_advisors ───────────────────────────────────────────────────────
  console.log('\n── pilot_advisors (' + pilotAdvisorsSnap.size + ' registered) ─────────────────────');
  pilotAdvisorsSnap.docs.forEach(d => {
    const p = d.data();
    const leadsAssigned = byAdvisor[d.id] || 0;
    console.log('  ' + (p.displayName || '?').padEnd(22) +
                p.email.padEnd(28) +
                'assigned: ' + leadsAssigned + ' leads');
  });

  // ── recent routing log ───────────────────────────────────────────────────
  console.log('\n── routing_logs (last 5 events) ────────────────────────────────');
  if (routingLogsSnap.empty) {
    console.log('  (no routing events yet)');
  } else {
    routingLogsSnap.docs.forEach(d => {
      const r = d.data();
      console.log('  ' + (r.timestamp||'').slice(0,16) + '  ' +
                  (r.event||'?').padEnd(22) + '  ' + (r.detail||'').slice(0,60));
    });
  }

  // ── Summary health score ─────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   HEALTH SUMMARY                                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const checks = [
    ['al_assignments has leads',       alSnap.size > 0],
    ['All leads have city/state',       missingLocation.length === 0],
    ['All 5 advisors provisioned',      pilotAdvisorsSnap.size >= 5],
    ['All advisors eligible for routing', advisorPoolSnap.docs.every(d => d.data().eligibleForRouting)],
    ['No pending routing_queue items',  (qStatus['pending'] || 0) === 0],
    ['No failed routing_queue items',   (qStatus['failed']  || 0) === 0],
    ['master_leads has docs (CF path)', masterLeadsSnap.size > 0],
    ['masterLeads empty (schema unified)', masterLeadsCCSnap.size === 0],
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
