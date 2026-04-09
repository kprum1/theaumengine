// ======================================================================
// AUM ENGINE — Routing Rules Engine v2
// scripts/routing_engine.js
//
// Step 3 of the Alfred Lead Pipeline. Runs after approve_and_ingest.js
// has written leads to masterLeads with status:'New'.
//
// What this engine does:
//   1. Pulls all unrouted leads from masterLeads (status: 'New')
//   2. For each lead, scores every eligible advisor using:
//      a. Niche match (hard requirement)
//      b. Geography match (ZIP or state — soft, adds score weight)
//      c. Capacity check (advisor not over lead cap)
//      d. Exclusivity (same lead never goes to two advisors)
//      e. Data source priority (SEC/DOL/USCG leads score higher)
//   3. Assigns best-match advisor → writes to al_assignments
//   4. Updates lead status in masterLeads to 'routed'
//   5. Logs routing receipt
//
// Usage:
//   node scripts/routing_engine.js [--dry-run] [--limit=N]
//
// Flags:
//   --dry-run     Preview assignments without writing to Firestore
//   --limit=N     Only process N leads (default: 100)
// ======================================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Init ──────────────────────────────────────────────────────
const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
const serviceAccount = require(SA_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── CLI flags ──────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.replace('--limit=', '')) : 100;

// ── Niche scoring weights (higher = more valuable lead) ────────
// Sources with public registration data score higher (verifiable)
const SOURCE_PRIORITY = {
  'SEC Form 4':                     10,   // RSU/equity vesting — immediate liquidity
  'DOL Form 5500':                   9,   // Exact 401k balance on record
  'USCG Vessel Registry':            8,   // Documented vessel = verified HNW
  'WARN Act':                        8,   // Layoff + 401k rollover — time-sensitive
  'CMS Open Payments':               7,   // Doctor high-income verified
  'FAA Aircraft Registry':           7,   // Aircraft = verified HNW
  'Non-Profit Board Registry':       6,   // Wealth signal, softer timing
  'Alfred Wealth Trigger Miner':     5,   // General Alfred scrape
  'County Property Records':         5,
  'Manual Import':                   3,
};

// ── Niche compatibility map ─────────────────────────────────────
// Which data sources map to which niches
const SOURCE_NICHE_AFFINITY = {
  'SEC Form 4':              ['c-suite-executives', 'ai-displaced-executives', 'henrys'],
  'DOL Form 5500':           ['business-owners'],
  'USCG Vessel Registry':    ['yacht-owners'],
  'WARN Act':                ['ai-displaced-executives', 'c-suite-executives'],
  'CMS Open Payments':       ['physicians'],
  'FAA Aircraft Registry':   ['aircraft-owners'],
  'Non-Profit Board Registry': ['charity-boards', 'charity-board-members'],
};

// ── US State → Region for geography matching ───────────────────
const STATE_REGIONS = {
  'MN':'midwest', 'WI':'midwest', 'IA':'midwest', 'IL':'midwest',
  'MI':'midwest', 'IN':'midwest', 'OH':'midwest', 'MO':'midwest',
  'ND':'midwest', 'SD':'midwest', 'NE':'midwest', 'KS':'midwest',
  'TX':'south',   'FL':'south',   'GA':'south',   'NC':'south',
  'SC':'south',   'VA':'south',   'TN':'south',   'AL':'south',
  'MS':'south',   'AR':'south',   'LA':'south',   'OK':'south',
  'CA':'west',    'WA':'west',    'OR':'west',    'AZ':'west',
  'NV':'west',    'CO':'west',    'UT':'west',    'ID':'west',
  'MT':'west',    'WY':'west',    'NM':'west',    'HI':'west', 'AK':'west',
  'NY':'northeast','NJ':'northeast','CT':'northeast','MA':'northeast',
  'PA':'northeast','MD':'northeast','DE':'northeast','RI':'northeast',
  'VT':'northeast','NH':'northeast','ME':'northeast',
};

function getRegion(state) {
  return STATE_REGIONS[(state || '').toUpperCase()] || 'national';
}

// ── Score an advisor against a lead ────────────────────────────
function scoreAdvisorForLead(advisor, lead) {
  let score = 0;
  const reasons = [];

  // 1 — Niche match (required — if no match, score stays 0)
  const advNiches = advisor.nicheIds || advisor.niches || [];
  const hasAllNiches = advNiches.includes('all');
  const nicheMatch = hasAllNiches || advNiches.includes(lead.nicheId);
  if (!nicheMatch) return { score: 0, reasons: ['No niche match'] };
  score += 40;
  reasons.push(`Niche match: ${lead.nicheId}`);

  // 2 — Geography match (state > region > national)
  const advStates = advisor.states || [];
  const advRegions = advisor.regions || [];
  if (advStates.includes(lead.state)) {
    score += 25;
    reasons.push(`State match: ${lead.state}`);
  } else if (advRegions.includes(getRegion(lead.state))) {
    score += 15;
    reasons.push(`Region match: ${getRegion(lead.state)}`);
  } else if (advStates.length === 0 && advRegions.length === 0) {
    score += 10;
    reasons.push('National advisor — no geo restriction');
  }

  // 3 — Data source quality bonus
  const sourcePriority = SOURCE_PRIORITY[lead.source] || 3;
  score += sourcePriority;
  reasons.push(`Source quality: ${lead.source} (+${sourcePriority})`);

  // 4 — Lead score quality bonus
  const fitBonus = Math.floor((lead.fitScore || 70) / 20);    // 0–5
  const timBonus = Math.floor((lead.timingScore || 70) / 20); // 0–5
  score += fitBonus + timBonus;
  reasons.push(`Lead quality: fit=${lead.fitScore} timing=${lead.timingScore}`);

  // 5 — Capacity penalty (prefer advisors with more room)
  const capacity = advisor.activeLeadCap || 25;
  const current  = advisor.currentLeadCount || 0;
  const remaining = capacity - current;
  if (remaining <= 0) return { score: 0, reasons: ['Advisor at capacity'] };
  if (remaining < 5)  score -= 10; // nearly full — deprioritize
  if (remaining > 15) score += 5;  // lots of room — prefer

  return { score, reasons };
}

// ── Load all eligible advisors ──────────────────────────────────
async function getAdvisors() {
  const snap = await db.collection('advisor_pool')
    .where('eligibleForRouting', '==', true)
    .get();
  if (snap.empty) {
    // Fallback: try 'advisors' collection (the auth-linked collection)
    const snap2 = await db.collection('advisors').get();
    return snap2.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Check if lead already assigned to this advisor ─────────────
async function isAlreadyAssigned(leadId, advisorId) {
  const snap = await db.collection('al_assignments')
    .where('masterLeadId', '==', leadId)
    .where('ownerUid', '==', advisorId)
    .limit(1)
    .get();
  return !snap.empty;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Routing Rules Engine v2              ║');
  console.log(DRY_RUN ?
  '║   MODE: DRY RUN (no writes)                         ║' :
  '║   MODE: LIVE (writing to Firestore)                 ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const now = new Date().toISOString();

  // ── Pull unrouted leads from master_leads ───────────────────
  const leadsSnap = await db.collection('master_leads')
    .where('ownershipStatus', '==', 'unassigned')
    .limit(LIMIT)
    .get();

  if (leadsSnap.empty) {
    console.log('  ℹ️  No unassigned leads in master_leads.');
    console.log('  → Run lead_ingest_agent.js first, or check ownershipStatus field.\n');
    process.exit(0);
  }
  console.log(`  📋 Leads to route: ${leadsSnap.docs.length} (limit: ${LIMIT})\n`);

  // ── Pull eligible advisors ───────────────────────────────────
  const advisors = await getAdvisors();
  if (!advisors.length) {
    console.log('  ❌ No eligible advisors found in advisor_pool or advisors collections.');
    console.log('  → Run provision_pilot_advisors.js or check advisor_pool.eligibleForRouting\n');
    process.exit(1);
  }
  console.log(`  👥 Eligible advisors: ${advisors.length}`);
  advisors.forEach(a => {
    const niches = (a.nicheIds || a.niches || ['all']).join(', ');
    const states = (a.states || []).join(', ') || 'national';
    console.log(`     • ${a.firmName || a.email || a.id.slice(0,12)} | niches: [${niches}] | geo: ${states} | cap: ${a.currentLeadCount||0}/${a.activeLeadCap||25}`);
  });
  console.log('');

  // ── Track in-flight lead counts ──────────────────────────────
  const liveCounts = {};
  advisors.forEach(a => { liveCounts[a.id] = a.currentLeadCount || 0; });

  const routingLog = [];
  let assigned = 0, skipped = 0, noMatch = 0;

  // ── Route each lead ──────────────────────────────────────────
  for (const ldoc of leadsSnap.docs) {
    const lead = { id: ldoc.id, ...ldoc.data() };
    const leadName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || ldoc.id.slice(0,12);

    // Score every advisor
    const scored = advisors
      .map(advisor => {
        const liveAdvisor = { ...advisor, currentLeadCount: liveCounts[advisor.id] };
        const { score, reasons } = scoreAdvisorForLead(liveAdvisor, lead);
        return { advisor: liveAdvisor, score, reasons };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      console.log(`  ⚠️  NO MATCH — ${leadName} (niche: ${lead.nicheId}, state: ${lead.state})`);
      noMatch++;
      continue;
    }

    const best = scored[0];
    const advisor = best.advisor;

    // Check duplicates
    const alreadyAssigned = await isAlreadyAssigned(ldoc.id, advisor.id);
    if (alreadyAssigned) {
      console.log(`  ↩  SKIP (already assigned) — ${leadName} → ${advisor.firmName || advisor.id.slice(0,8)}`);
      skipped++;
      continue;
    }

    const routingReason = best.reasons.join(' | ');
    const scoreBreakdown = `Routing score: ${best.score} | ${routingReason}`;

    if (DRY_RUN) {
      console.log(`  📋 DRY — ${leadName}`);
      console.log(`     → ${advisor.firmName || advisor.id.slice(0,12)} (score: ${best.score})`);
      console.log(`     Reason: ${routingReason}\n`);
    } else {
      const batch = db.batch();

      // ── Write to al_assignments (the live app reads this) ────
      const assignId = `route_${ldoc.id}_${advisor.id}`.slice(0, 100);
      batch.set(db.collection('al_assignments').doc(assignId), {
        masterLeadId:     ldoc.id,
        ownerUid:         advisor.id,   // legacy field — keep for backwards compat
        advisorUid:       advisor.id,   // canonical field — used by funnel_tracker + admin.js
        ownerFirmName:    advisor.firmName || '',
        ownerEmail:       advisor.email || '',

        // Lead fields surfaced for the app UI
        firstName:        lead.firstName,
        lastName:         lead.lastName,
        title:            lead.title || '',
        company:          lead.company || '',
        city:             lead.city || '',
        state:            lead.state || '',
        niche:            lead.niche,
        nicheId:          lead.nicheId,
        fitScore:         lead.fitScore || 0,
        timingScore:      lead.timingScore || 0,
        priorityScore:    lead.priorityScore || Math.round(((lead.fitScore||0)+(lead.timingScore||0))/2),
        reasonCodes:      lead.reasonCodes || [],
        signals:          lead.signals || {},
        source:           lead.source || 'Routing Engine',
        estimatedAUM:     lead.estimatedAUM || '',

        // Assignment metadata
        status:           'New',
        ownershipStatus:  'active',
        assignedAt:       now,
        routingScore:     best.score,
        routingReason:    routingReason,
        slaDeadline:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        batchId:          lead.batchId || '',
        createdAt:        now,
        updatedAt:        now,
      });

      // ── Update master_lead ownershipStatus to 'assigned' ──────
      batch.update(db.collection('master_leads').doc(ldoc.id), {
        ownershipStatus:   'assigned',
        currentOwnerUid:   advisor.id,
        currentOwnerSince: now,
        updatedAt:         now,
      });

      // ── Increment advisor capacity counter ────────────────────
      batch.update(db.collection('advisor_pool').doc(advisor.id), {
        currentLeadCount: admin.firestore.FieldValue.increment(1),
        updatedAt:        now,
      });

      await batch.commit();

      liveCounts[advisor.id] = (liveCounts[advisor.id] || 0) + 1;
      assigned++;

      console.log(`  ✅ ASSIGNED — ${leadName}`);
      console.log(`     → ${advisor.firmName || advisor.email || advisor.id.slice(0,12)}`);
      console.log(`     Score: ${best.score} | ${routingReason}`);
      console.log(`     Assignment: ${assignId}\n`);
    }

    routingLog.push({
      lead:       leadName,
      nicheId:    lead.nicheId,
      state:      lead.state,
      advisor:    advisor.firmName || advisor.id.slice(0, 12),
      score:      best.score,
      reason:     routingReason,
      status:     DRY_RUN ? 'DRY_RUN' : 'ASSIGNED'
    });
  }

  // ── Summary ────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Routing complete ${DRY_RUN ? '(DRY RUN)            ' : '                     '} ║`);
  console.log(`║  Assigned: ${String(assigned).padEnd(6)} Skipped: ${String(skipped).padEnd(6)} No-match: ${String(noMatch).padEnd(5)}║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (noMatch > 0) {
    console.log(`  💡 ${noMatch} lead(s) had no advisor match. Check:`);
    console.log('     1. Advisor nicheIds in advisor_pool match lead nicheIds');
    console.log('     2. Advisors have eligibleForRouting: true');
    console.log('     3. Advisors are not at capacity (currentLeadCount < activeLeadCap)\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Routing Engine failed:', err.message || err);
  process.exit(1);
});
