// AUM ENGINE — SLA Breach Auto-Reassigner
// Moves un-touched leads (>7d new, no outreach) to the advisor with most headroom.
// Run: node scripts/reassign_sla_breach.js [--dry-run]
'use strict';

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const DRY_RUN  = process.argv.includes('--dry-run');
const SLA_DAYS = 7;

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — SLA Breach Auto-Reassigner               ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Mode: ${DRY_RUN ? '🔵 DRY RUN' : '🔴 LIVE WRITE'}\n`);

  // ── 1. Find eligible re-assignment target (most headroom, eligible) ──────
  const poolSnap = await db.collection('advisor_pool')
    .where('eligibleForRouting', '==', true)
    .get();
  const nameSnap = await db.collection('pilot_advisors').get();
  const nameMap  = {};
  nameSnap.docs.forEach(d => { nameMap[d.id] = d.data().displayName || d.id.slice(0, 14); });

  // Load current lead counts per advisor
  const leadAssignSnap = await db.collection('lead_assignments').get();
  const countByUid = {};
  leadAssignSnap.docs.forEach(d => {
    const uid = d.data().ownerUid;
    if (uid) countByUid[uid] = (countByUid[uid] || 0) + 1;
  });

  // Rank advisors by headroom
  const ranked = poolSnap.docs.map(d => {
    const ap  = d.data();
    const uid = d.id;
    const cap = ap.activeLeadCap || 25;
    const cur = countByUid[uid] || 0;
    return { uid, firmName: ap.firmName || uid, cap, cur, headroom: cap - cur };
  }).sort((a, b) => b.headroom - a.headroom);

  console.log('── Advisor Headroom Ranking ─────────────────────────────────────────');
  ranked.forEach((a, i) => {
    console.log(`  ${i === 0 ? '🎯' : '  '} ${a.firmName.padEnd(36)} ${a.cur}/${a.cap} — ${a.headroom} slots free`);
  });

  const target = ranked[0];
  if (target.headroom <= 0) {
    console.log('\n  ❌ No advisor has capacity. Cannot auto-reassign. Aborting.\n');
    process.exit(0);
  }

  // ── 2. Fetch all SLA-breached lead doc IDs ───────────────────────────────
  const logsSnap = await db.collection('routing_logs')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  const breachedDocIds = new Set();
  logsSnap.docs
    .filter(d => d.data().event === 'sla_breach_flagged')
    .forEach(d => {
      const docRef = (d.data().detail || '').split('/').pop() || d.data().leadId;
      if (docRef) breachedDocIds.add(docRef);
    });

  if (!breachedDocIds.size) {
    console.log('\n  ✅ No SLA-breached leads found.\n');
    process.exit(0);
  }

  // ── 3. Filter: only reassign leads NOT already owned by target advisor ───
  const toReassign = [];
  const now = Date.now();
  for (const docId of breachedDocIds) {
    const doc = await db.collection('lead_assignments').doc(docId).get();
    if (!doc.exists) continue;
    const data = doc.data();
    if (data.ownerUid === target.uid) continue; // already at target advisor
    const assignedAt     = data.assignedAt ? new Date(data.assignedAt).getTime() : 0;
    const daysOld        = Math.floor((now - assignedAt) / (1000 * 60 * 60 * 24));
    const fromAdvisor    = nameMap[data.ownerUid] || data.ownerUid?.slice(0, 14) || '?';
    toReassign.push({ docId, ownerUid: data.ownerUid, fromAdvisor, daysOld });
  }

  // Cap reassignments at available headroom
  const limit    = Math.min(toReassign.length, target.headroom);
  const batch    = toReassign.slice(0, limit);
  const skipped  = toReassign.length - limit;

  console.log('\n── Reassignment Plan ────────────────────────────────────────────────');
  console.log(`  Target:     🎯 ${target.firmName} (${target.cur}/${target.cap} — ${target.headroom} slots free)`);
  console.log(`  Leads:      ${batch.length} will be reassigned (${skipped} skipped — beyond capacity)`);
  if (batch.length === 0) {
    console.log('  ✅ All breached leads already belong to the target advisor.\n');
    process.exit(0);
  }
  console.log('');
  console.log('  ' + 'Lead ID'.padEnd(28) + 'From'.padEnd(30) + 'Days Old');
  console.log('  ' + '─'.repeat(70));
  batch.forEach(l => {
    console.log('  ' + l.docId.slice(0, 24).padEnd(28) + l.fromAdvisor.padEnd(30) + `${l.daysOld}d`);
  });

  if (DRY_RUN) {
    console.log('\n  🔵 DRY RUN complete — no changes written.\n');
    process.exit(0);
  }

  // ── 4. Execute reassignments ─────────────────────────────────────────────
  console.log('\n── Executing Reassignments ──────────────────────────────────────────');
  const nowISO = new Date().toISOString();
  let success = 0, failed = 0;

  for (const lead of batch) {
    try {
      const ref = db.collection('lead_assignments').doc(lead.docId);
      const snap = await ref.get();
      const prev = snap.data().previousOwners || [];
      await ref.update({
        ownerUid:        target.uid,
        reassignedFrom:  lead.ownerUid,
        reassignedAt:    nowISO,
        reassignReason:  `sla_breach_${SLA_DAYS}d`,
        previousOwners:  [...prev, { uid: lead.ownerUid, releasedAt: nowISO, reason: `sla_breach_${SLA_DAYS}d` }],
        status:          'new',
        advisorStatus:   'new',
        updatedAt:       nowISO,
      });

      // Log the reassignment
      await db.collection('routing_logs').add({
        event:         'lead_reassigned',
        agentId:       'reassign_sla_breach_v1',
        leadId:        lead.docId,
        fromUid:       lead.ownerUid,
        toUid:         target.uid,
        reason:        `sla_breach_${SLA_DAYS}d`,
        detail:        `SLA breach reassignment: ${lead.fromAdvisor} → ${target.firmName}`,
        timestamp:     nowISO,
      });

      console.log(`  ✅ ${lead.docId.slice(0, 20)}… → ${target.firmName}`);
      success++;
    } catch (e) {
      console.log(`  ❌ ${lead.docId.slice(0, 20)}… — ${e.message}`);
      failed++;
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   SUMMARY                                               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Reassigned: ${success}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  ⏭  Skipped:   ${skipped} (beyond ${target.firmName}'s capacity)`);
  console.log('');
  console.log(`  Next step: run audit_leads.js to confirm 10/10 🟢\n`);
  process.exit(0);
}

run().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
