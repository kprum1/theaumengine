// ======================================================================
// AUM ENGINE — Operator Dashboard Data Engine (Path B)
// scripts/funnel_report.js
//
// Reads Firestore funnel_events and masterLeads/al_assignments to
// generate a live operator scorecard across all pilot advisors.
//
// What you see:
//   • Per-advisor: leads assigned, viewed, emailed, replied, meetings
//   • Conversion funnel: Assign → View → Draft → Send → Reply → Meet
//   • Niche breakdown: which niches are converting best
//   • SLA compliance: leads that haven't been touched in 7 days
//   • Top 3 performing advisors, bottom 3 (for coaching)
//
// Usage:
//   node scripts/funnel_report.js [--days=30] [--advisor=EMAIL]
// ======================================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) { console.error('❌ Missing serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();

// CLI
const daysArg    = process.argv.find(a => a.startsWith('--days='));
const advisorArg = process.argv.find(a => a.startsWith('--advisor='));
const DAYS_BACK  = daysArg ? parseInt(daysArg.replace('--days=', '')) : 30;
const FILTER_ADV = advisorArg ? advisorArg.replace('--advisor=', '') : null;
const SINCE      = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

function pct(n, d) { return d === 0 ? '—' : `${Math.round((n/d)*100)}%`; }
function bar(n, d, w = 20) {
  const filled = d === 0 ? 0 : Math.round((n/d) * w);
  return '█'.repeat(filled) + '░'.repeat(w - filled);
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Operator Dashboard                           ║');
  console.log(`║   Period: Last ${String(DAYS_BACK).padEnd(3)} days  (since ${SINCE.slice(0,10)})         ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── Pull funnel events ─────────────────────────────────────
  let eventsQuery = db.collection('funnel_events').where('ts', '>=', SINCE);
  if (FILTER_ADV) eventsQuery = eventsQuery.where('advisorEmail', '==', FILTER_ADV);
  const eventsSnap = await eventsQuery.limit(5000).get();
  const events = eventsSnap.docs.map(d => d.data());

  // ── Pull al_assignments ────────────────────────────────────
  const assignSnap = await db.collection('al_assignments')
    .where('assignedAt', '>=', SINCE)
    .limit(2000).get();
  const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── Build per-advisor stats ────────────────────────────────
  const advisorMap = {};

  // Seed from assignments
  assignments.forEach(a => {
    const email = a.ownerEmail || a.ownerUid;
    if (!advisorMap[email]) advisorMap[email] = {
      email,
      firmName:  a.ownerFirmName || email,
      assigned:  0, viewed: 0, drafted: 0,
      sent: 0, replied: 0, meetings: 0,
      slaBreaches: 0, niches: {},
    };
    advisorMap[email].assigned++;

    // SLA: assigned >7 days ago and status still 'New'
    const assignedAge = (Date.now() - new Date(a.assignedAt).getTime()) / (1000*60*60*24);
    if (a.status === 'New' && assignedAge > 7) advisorMap[email].slaBreaches++;

    // Niche tally
    if (a.nicheId) {
      advisorMap[email].niches[a.nicheId] = (advisorMap[email].niches[a.nicheId] || 0) + 1;
    }
  });

  // Tally events
  events.forEach(e => {
    const email = e.advisorEmail || e.advisorUid;
    if (!advisorMap[email]) advisorMap[email] = {
      email, firmName: email, assigned: 0, viewed: 0, drafted: 0,
      sent: 0, replied: 0, meetings: 0, slaBreaches: 0, niches: {},
    };
    const a = advisorMap[email];
    if (e.event === 'lead_viewed')       a.viewed++;
    if (e.event === 'outreach_drafted')  a.drafted++;
    if (e.event === 'outreach_sent')     a.sent++;
    if (e.event === 'reply_logged')      a.replied++;
    if (e.event === 'meeting_booked')    a.meetings++;
  });

  const advisors = Object.values(advisorMap).sort((a,b) => b.meetings - a.meetings);

  // ── Global funnel ─────────────────────────────────────────
  const totals = advisors.reduce((acc, a) => {
    acc.assigned += a.assigned;
    acc.viewed   += a.viewed;
    acc.drafted  += a.drafted;
    acc.sent     += a.sent;
    acc.replied  += a.replied;
    acc.meetings += a.meetings;
    acc.slaBreaches += a.slaBreaches;
    return acc;
  }, { assigned:0, viewed:0, drafted:0, sent:0, replied:0, meetings:0, slaBreaches:0 });

  console.log('  ══ GLOBAL FUNNEL ══════════════════════════════════════════════');
  console.log(`\n  Leads Assigned  ${bar(totals.assigned, totals.assigned)} ${totals.assigned}`);
  console.log(`  Leads Viewed    ${bar(totals.viewed,   totals.assigned)} ${totals.viewed.toString().padEnd(4)} ${pct(totals.viewed, totals.assigned)}`);
  console.log(`  Draft Generated ${bar(totals.drafted,  totals.assigned)} ${totals.drafted.toString().padEnd(4)} ${pct(totals.drafted, totals.assigned)}`);
  console.log(`  Outreach Sent   ${bar(totals.sent,     totals.assigned)} ${totals.sent.toString().padEnd(4)} ${pct(totals.sent, totals.assigned)}`);
  console.log(`  Reply Received  ${bar(totals.replied,  totals.sent)}    ${totals.replied.toString().padEnd(4)} ${pct(totals.replied, totals.sent)}`);
  console.log(`  Meeting Booked  ${bar(totals.meetings, totals.replied)} ${totals.meetings.toString().padEnd(4)} ${pct(totals.meetings, totals.replied)}`);

  if (totals.slaBreaches > 0) {
    console.log(`\n  ⚠️  SLA BREACHES (not touched in 7 days): ${totals.slaBreaches} leads`);
  }

  // ── Per-advisor scorecard ─────────────────────────────────
  console.log('\n  ══ ADVISOR SCORECARD ══════════════════════════════════════════');
  console.log(`\n  ${'ADVISOR'.padEnd(28)} ASN  VWD  DFT  SND  RPL  MTG  SLA⚠️`);
  console.log('  ' + '─'.repeat(70));

  advisors.forEach(a => {
    const name = (a.firmName || a.email).slice(0, 26).padEnd(28);
    const sla  = a.slaBreaches > 0 ? `  ⚠️ ${a.slaBreaches}` : '';
    console.log(
      `  ${name}` +
      `${String(a.assigned).padStart(4)} ` +
      `${String(a.viewed).padStart(4)} ` +
      `${String(a.drafted).padStart(4)} ` +
      `${String(a.sent).padStart(4)} ` +
      `${String(a.replied).padStart(4)} ` +
      `${String(a.meetings).padStart(4)}` +
      sla
    );
  });

  // ── Niche breakdown ───────────────────────────────────────
  const nicheAgg = {};
  advisors.forEach(a => {
    Object.entries(a.niches).forEach(([niche, count]) => {
      nicheAgg[niche] = (nicheAgg[niche] || 0) + count;
    });
  });

  if (Object.keys(nicheAgg).length > 0) {
    const topNiches = Object.entries(nicheAgg).sort((a,b) => b[1]-a[1]).slice(0, 8);
    console.log('\n  ══ NICHE DISTRIBUTION ═════════════════════════════════════════');
    const maxN = Math.max(...topNiches.map(n => n[1]));
    topNiches.forEach(([niche, count]) => {
      const b = bar(count, maxN, 15);
      console.log(`  ${niche.padEnd(28)} ${b} ${count}`);
    });
  }

  // ── Top / Bottom performers ───────────────────────────────
  if (advisors.length >= 3) {
    const sorted = [...advisors].filter(a => a.assigned > 0);
    sorted.sort((a,b) => (b.meetings - a.meetings) || (b.sent - a.sent));

    console.log('\n  ══ PERFORMANCE ════════════════════════════════════════════════');
    console.log('\n  🥇 Top Performers:');
    sorted.slice(0, 3).forEach((a, i) => {
      const medals = ['🥇','🥈','🥉'];
      console.log(`     ${medals[i]} ${a.firmName || a.email}: ${a.meetings} meetings | ${a.sent} sent | ${pct(a.sent, a.assigned)} contact rate`);
    });

    if (sorted.length > 3) {
      console.log('\n  📉 Needs Coaching:');
      sorted.slice(-3).reverse().forEach(a => {
        const age = a.slaBreaches > 0 ? ` ⚠️  ${a.slaBreaches} SLA breach(es)` : '';
        console.log(`     • ${a.firmName || a.email}: ${a.sent} emails sent from ${a.assigned} assigned${age}`);
      });
    }
  }

  // ── Event count summary ───────────────────────────────────
  const eventCounts = events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(eventCounts).length > 0) {
    console.log('\n  ══ RAW EVENT COUNTS ═══════════════════════════════════════════');
    Object.entries(eventCounts).sort((a,b) => b[1]-a[1]).forEach(([e, c]) => {
      console.log(`     ${e.padEnd(28)} ${c}`);
    });
  }

  console.log('\n' + '═'.repeat(65));
  console.log(`\n  📊 Report generated: ${new Date().toLocaleString()}`);
  console.log(`  📁 Data: ${events.length} events | ${assignments.length} assignments | ${advisors.length} advisors\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Funnel report failed:', err.message);
  process.exit(1);
});
