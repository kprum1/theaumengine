// =====================================================================
// THE AUM ENGINE — MANUAL ROUTING TRIGGER
// scripts/trigger_routing.js
// Run: node scripts/trigger_routing.js (from project root)
// Manually runs the routing logic to assign queued leads to pilot advisors.
// =====================================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const NICHES = [
  'business-owners', 'aircraft-owners', 'physicians',
  'ai-displaced-executives', 'charity-board-members',
];

// ── Pull all eligible advisors from advisor_pool ─────────────────────────
async function getEligibleAdvisors() {
  const snap = await db.collection('advisor_pool')
    .where('eligibleForRouting', '==', true)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Find best-match advisor for a lead ──────────────────────────────────
function matchAdvisor(lead, advisors) {
  // Filter advisors who have capacity and whose niches overlap the lead's niche
  const eligible = advisors.filter(a => {
    const hasCapacity = (a.currentLeadCount || 0) < (a.activeLeadCap || 25);
    const nicheMatch  = !lead.nicheId || !a.nicheIds?.length ||
                        a.nicheIds.includes(lead.nicheId) ||
                        a.nicheIds.includes('all');
    return hasCapacity && nicheMatch;
  });

  if (!eligible.length) return null;

  // Sort by: fewest leads first (round-robin fairness), then routing score
  eligible.sort((a, b) => {
    const loadDiff = (a.currentLeadCount || 0) - (b.currentLeadCount || 0);
    if (loadDiff !== 0) return loadDiff;
    return (b.routingScore || 100) - (a.routingScore || 100);
  });

  return eligible[0];
}

// ── Main routing pass ────────────────────────────────────────────────────
async function runRoutingPass() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — MANUAL ROUTING PASS              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const now = new Date().toISOString();

  // Pull leads that need routing (ingest agent sets 'pending'; resolved leads become 'queued')
  const queueSnap = await db.collection('routing_queue')
    .where('status', 'in', ['pending', 'queued'])
    .limit(50)
    .get();

  if (queueSnap.empty) {
    console.log('  ⚠️  No leads in routing_queue with status="queued".');
    console.log('  → Ingest some leads first: node scripts/lead_ingest_agent.js');
    process.exit(0);
  }

  console.log(`  Found ${queueSnap.docs.length} lead(s) in queue.\n`);

  // Pull eligible advisors fresh
  const advisors = await getEligibleAdvisors();
  if (!advisors.length) {
    console.log('  ❌ No eligible advisors in advisor_pool. Run provision_pilot_advisors.js first.');
    process.exit(1);
  }
  console.log(`  Eligible advisors: ${advisors.map(a => a.id.slice(0,8)).join(', ')}\n`);

  // Track lead counts in memory so we don't over-assign in one pass
  const leadCounts = {};
  advisors.forEach(a => { leadCounts[a.id] = a.currentLeadCount || 0; });

  let assigned = 0;
  let skipped  = 0;

  for (const qDoc of queueSnap.docs) {
    const qData = qDoc.data();

    // Get master_lead for niche info
    let lead = qData;
    if (qData.masterLeadId) {
      try {
        const leadSnap = await db.collection('master_leads').doc(qData.masterLeadId).get();
        if (leadSnap.exists) lead = { ...leadSnap.data(), ...qData };
      } catch(e) { /* use qData */ }
    }

    // Refresh counts in advisor objects
    const liveAdvisors = advisors.map(a => ({ ...a, currentLeadCount: leadCounts[a.id] || 0 }));

    const match = matchAdvisor(lead, liveAdvisors);
    if (!match) {
      console.log(`  ⚠️  No match for lead: ${lead.fullName || qDoc.id} (niche: ${lead.nicheId || 'none'})`);
      skipped++;
      continue;
    }

    // Check for existing assignment (no duplicates)
    const existing = await db.collection('lead_assignments')
      .where('masterLeadId', '==', qData.masterLeadId || qDoc.id)
      .where('ownerUid', '==', match.id)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log(`  ↩  Already assigned: ${lead.fullName || qDoc.id} → ${match.id.slice(0,8)}`);
      await db.collection('routing_queue').doc(qDoc.id).update({ status: 'assigned', updatedAt: now });
      skipped++;
      continue;
    }

    const batch = db.batch();

    // Create lead_assignment
    const assignRef = db.collection('lead_assignments').doc();
    batch.set(assignRef, {
      masterLeadId:   qData.masterLeadId || qDoc.id,
      masterLeadRef:  qData.masterLeadId
                        ? db.collection('master_leads').doc(qData.masterLeadId)
                        : null,
      ownerUid:           match.id,
      ownerFirmName:      match.firmName || '',
      ownershipStatus:    'active',
      advisorStatus:      'New',
      assignedAt:         now,
      slaDeadline:        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      finalScore:         qData.score || 0.75,
      timingScore:        qData.timingScore || 0.65,
      source:             lead.source || 'Routing Engine',
      createdAt:          now,
      updatedAt:          now,
    });

    // Update routing_queue status
    batch.update(db.collection('routing_queue').doc(qDoc.id), {
      status:     'assigned',
      assignedTo: match.id,
      updatedAt:  now,
    });

    // Increment advisor lead count
    batch.update(db.collection('advisor_pool').doc(match.id), {
      currentLeadCount: admin.firestore.FieldValue.increment(1),
      updatedAt:        now,
    });

    await batch.commit();

    leadCounts[match.id] = (leadCounts[match.id] || 0) + 1;
    assigned++;

    const leadName = lead.fullName || lead.firstName
                     ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
                     : qDoc.id;
    console.log(`  ✅ Assigned: ${leadName || qDoc.id.slice(0,12)}`);
    console.log(`     → ${match.firmName || match.id.slice(0,8)} (load: ${leadCounts[match.id]}/${match.activeLeadCap || 25})`);
    console.log(`     Assignment ID: ${assignRef.id}\n`);
  }

  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Routing pass complete                           ║`);
  console.log(`║  Assigned: ${String(assigned).padEnd(5)} | Skipped: ${String(skipped).padEnd(14)}║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  process.exit(0);
}

runRoutingPass().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
