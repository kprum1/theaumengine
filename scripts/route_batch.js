// =====================================================================
// THE AUM ENGINE — TARGETED BATCH ROUTER
// scripts/route_batch.js
//
// Usage:
//   node scripts/route_batch.js --batch=2026-04-09T19-48-33 [--dry-run]
//
// WHY THIS EXISTS (C8 context):
//   approve_and_ingest.js writes to `masterLeads` (camelCase).
//   routing_engine.js reads from `master_leads` (snake_case) and
//   requires ownershipStatus='unassigned' — a field the admin SDK
//   ingest never sets. This script bridges that gap by reading
//   directly from masterLeads filtered by batchId, then routing
//   via the same al_assignments logic as routing_engine.js.
//
// This is the canonical routing trigger for admin-SDK-ingested batches.
// =====================================================================

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── Init Firebase Admin ──────────────────────────────────────────────
const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();

// ── CLI flags ─────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const batchArg  = process.argv.find(a => a.startsWith('--batch='));
const BATCH_ID  = batchArg ? batchArg.replace('--batch=', '') : null;
const limitArg  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = limitArg ? parseInt(limitArg.replace('--limit=', '')) : 200;

if (!BATCH_ID) {
  console.error('❌ Usage: node scripts/route_batch.js --batch=TIMESTAMP [--dry-run]');
  console.error('   Example: node scripts/route_batch.js --batch=2026-04-09T19-48-33');
  process.exit(1);
}

// ── Niche source scoring ──────────────────────────────────────────────
const SOURCE_PRIORITY = {
  'USCG Vessel Registry':        8,
  'Alfred Wealth Trigger Miner': 5,
  'SEC Form 4':                  10,
  'DOL Form 5500':                9,
  'FAA Aircraft Registry':        7,
  'Manual Import':                3,
};

// ── Geography regions ─────────────────────────────────────────────────
const STATE_REGIONS = {
  'TX':'south','FL':'south','GA':'south','NC':'south','SC':'south',
  'VA':'south','TN':'south','AL':'south','MS':'south','AR':'south',
  'LA':'south','OK':'south',
  'CA':'west','WA':'west','OR':'west','AZ':'west','NV':'west',
  'CO':'west','UT':'west','ID':'west','MT':'west','WY':'west',
  'NM':'west','HI':'west','AK':'west',
  'MN':'midwest','WI':'midwest','IA':'midwest','IL':'midwest',
  'MI':'midwest','IN':'midwest','OH':'midwest','MO':'midwest',
  'ND':'midwest','SD':'midwest','NE':'midwest','KS':'midwest',
  'NY':'northeast','NJ':'northeast','CT':'northeast','MA':'northeast',
  'PA':'northeast','MD':'northeast','DE':'northeast','RI':'northeast',
  'VT':'northeast','NH':'northeast','ME':'northeast',
};
const getRegion = st => STATE_REGIONS[(st||'').toUpperCase()] || 'national';

// ── Score an advisor against a lead ──────────────────────────────────
function scoreAdvisor(advisor, lead) {
  const advNiches = advisor.nicheIds || advisor.niches || [];
  const hasAll    = advNiches.includes('all');
  // Niche match is required
  if (!hasAll && !advNiches.includes(lead.nicheId)) {
    return { score: 0, reason: 'No niche match' };
  }

  let score = 40;
  const parts = [`Niche:${lead.nicheId}`];

  // Geography
  const advStates = advisor.states || [];
  const advRegions = advisor.regions || [];
  if (advStates.includes(lead.state)) {
    score += 25; parts.push(`State:${lead.state}`);
  } else if (advRegions.includes(getRegion(lead.state))) {
    score += 15; parts.push(`Region:${getRegion(lead.state)}`);
  } else if (!advStates.length && !advRegions.length) {
    score += 10; parts.push('National');
  }

  // Source quality
  const sq = SOURCE_PRIORITY[lead.source] || 3;
  score += sq; parts.push(`Src+${sq}`);

  // Fit + timing bonus
  const fit = Math.floor((lead.fitScore || 70) / 20);
  const tim = Math.floor((lead.timingScore || 70) / 20);
  score += fit + tim; parts.push(`Q+${fit+tim}`);

  // Capacity
  const cap  = advisor.activeLeadCap || 25;
  const curr = advisor.currentLeadCount || 0;
  if (cap - curr <= 0) return { score: 0, reason: 'At capacity' };
  if (cap - curr < 5)  score -= 10;
  if (cap - curr > 15) score += 5;

  return { score, reason: parts.join(' | ') };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — TARGETED BATCH ROUTER                ║');
  console.log(DRY_RUN
    ? '║   MODE: DRY RUN (no writes)                         ║'
    : '║   MODE: LIVE (writing to al_assignments)            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`  Batch ID : ${BATCH_ID}`);
  console.log(`  Limit    : ${LIMIT} leads\n`);

  const now = new Date().toISOString();

  // ── Step 1: Pull leads from master_leads by batchId ─────────────────
  // master_leads is the canonical snake_case CF collection.
  // masterLeads (camelCase) has been archived — do not read from it.
  const leadsSnap = await db.collection('master_leads')
    .where('batchId', '==', BATCH_ID)
    .limit(LIMIT)
    .get();

  if (leadsSnap.empty) {
    // Fallback: also check masterLeads in case old batches haven't migrated
    const legacySnap = await db.collection('masterLeads')
      .where('batchId', '==', BATCH_ID).limit(1).get();
    if (!legacySnap.empty) {
      console.log(`  ⚠️  Batch found in legacy masterLeads — run migrate_masterleads.js first.`);
    } else {
      console.log(`  ⚠️  No leads found with batchId="${BATCH_ID}" in master_leads.`);
    }
    process.exit(0);
  }
  console.log(`  📋 Leads in batch: ${leadsSnap.docs.length}\n`);

  // ── Step 2: Pull eligible advisors ─────────────────────────────────
  const poolSnap = await db.collection('advisor_pool')
    .where('eligibleForRouting', '==', true)
    .get();

  if (poolSnap.empty) {
    console.log('  ❌ No eligible advisors in advisor_pool.');
    console.log('  → Run: node scripts/provision_pilot_advisors.js');
    process.exit(1);
  }

  const advisors = poolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`  👥 Eligible advisors: ${advisors.length}`);
  advisors.forEach(a => {
    const niches = (a.nicheIds || []).join(', ') || 'none';
    const load   = `${a.currentLeadCount||0}/${a.activeLeadCap||25}`;
    console.log(`     • ${(a.firmName || a.id.slice(0,10)).padEnd(32)} niches:[${niches}]  load:${load}`);
  });
  console.log('');

  // ── Step 3: Track in-flight counts ─────────────────────────────────
  const liveCounts = {};
  advisors.forEach(a => { liveCounts[a.id] = a.currentLeadCount || 0; });

  let assigned = 0, skipped = 0, noMatch = 0;

  for (const ldoc of leadsSnap.docs) {
    const lead = { id: ldoc.id, ...ldoc.data() };
    const name = `${lead.firstName||''} ${lead.lastName||''}`.trim() || ldoc.id.slice(0,20);

    // Score all advisors for this lead
    const scored = advisors
      .map(a => {
        const live = { ...a, currentLeadCount: liveCounts[a.id] };
        const { score, reason } = scoreAdvisor(live, lead);
        return { advisor: live, score, reason };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      console.log(`  ⚠️  NO MATCH — ${name} (nicheId:${lead.nicheId}, state:${lead.state})`);
      noMatch++;
      continue;
    }

    const best    = scored[0];
    const advisor = best.advisor;

    // Dedup check: has this masterLeadId already been assigned to ANYONE?
    // Uses masterLeadId field so re-runs with a different winner still dedup correctly.
    const existSnap = await db.collection('al_assignments')
      .where('masterLeadId', '==', ldoc.id)
      .limit(1)
      .get();
    if (!existSnap.empty) {
      const ex = existSnap.docs[0].data();
      console.log(`  ↩  ALREADY ASSIGNED — ${name} → ${ex.ownerFirmName || ex.advisorUid?.slice(0,8)}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  📋 DRY — ${name}`);
      console.log(`     → ${advisor.firmName || advisor.id.slice(0,12)} (score: ${best.score})`);
      console.log(`     Reason: ${best.reason}\n`);
      assigned++;
      continue;
    }

    // ── Write to al_assignments + update master_leads + increment cap ──
    const batch = db.batch();
    // Use a random doc ID (CF routing style) — masterLeadId dedup check above prevents doubles
    const assignRef = db.collection('al_assignments').doc();

    batch.set(assignRef, {
      masterLeadId:    ldoc.id,
      ownerUid:        advisor.id,
      advisorUid:      advisor.id,
      ownerFirmName:   advisor.firmName || '',
      ownerEmail:      advisor.email || '',

      // Lead fields the app UI reads
      firstName:       lead.firstName  || '',
      lastName:        lead.lastName   || '',
      fullName:        name,
      title:           lead.title      || '',
      company:         lead.company    || '',
      city:            lead.city       || '',
      state:           lead.state      || '',
      niche:           lead.niche      || 'Yacht Owners',
      nicheId:         lead.nicheId    || 'yacht-owners',
      fitScore:        lead.fitScore   || 0,
      timingScore:     lead.timingScore || 0,
      priorityScore:   lead.priorityScore || Math.round(((lead.fitScore||0)+(lead.timingScore||0))/2),
      estimatedAUM:    lead.estimatedAUM || '',
      source:          lead.source     || 'Alfred Wealth Trigger Miner',
      reasonCodes:     lead.reasonCodes || [],
      signals:         lead.signals    || {},
      batchId:         BATCH_ID,

      // Assignment metadata
      status:           'New',
      ownershipStatus:  'active',
      assignedAt:       now,
      routingScore:     best.score,
      routingReason:    best.reason,
      routingMethod:    'route_batch.js',
      slaDeadline:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      replyType:        null,           // initialized for C7 replyType schema
      createdAt:        now,
      updatedAt:        now,
    });

    // Mark master_leads doc as assigned
    batch.update(db.collection('master_leads').doc(ldoc.id), {
      ownershipStatus:   'assigned',
      currentOwnerUid:   advisor.id,
      currentOwnerFirm:  advisor.firmName || '',
      routedAt:          now,
      updatedAt:         now,
    });

    // Increment advisor capacity
    batch.update(db.collection('advisor_pool').doc(advisor.id), {
      currentLeadCount: admin.firestore.FieldValue.increment(1),
      updatedAt:        now,
    });

    await batch.commit();
    liveCounts[advisor.id] = (liveCounts[advisor.id] || 0) + 1;
    assigned++;

    console.log(`  ✅ ASSIGNED — ${name}`);
    console.log(`     → ${advisor.firmName || advisor.id.slice(0,12)} (score:${best.score})`);
    console.log(`     Reason: ${best.reason}`);
    console.log(`     Assignment ID: ${assignRef.id}\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Batch routing complete ${DRY_RUN ? '(DRY RUN)           ' : '                    '} ║`);
  console.log(`║  Assigned: ${String(assigned).padEnd(5)} Skipped: ${String(skipped).padEnd(5)} No-match: ${String(noMatch).padEnd(5)} ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (noMatch > 0) {
    console.log('  💡 Leads with no match — check:');
    console.log('     1. Advisors have the correct nicheId in advisor_pool');
    console.log(`     2. Run dry-run first: node scripts/route_batch.js --batch=${BATCH_ID} --dry-run`);
    console.log('     3. Add yacht-owners niche: node scripts/add_niche_to_advisor.js\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ route_batch.js failed:', err.message || err);
  process.exit(1);
});
