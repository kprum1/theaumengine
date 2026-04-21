#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Registry Match Quality Sweep
// scripts/sweep_registry_quality.js
//
// STRATEGY: "Only route the provably real."
//
// After agent_registry_crossref.js runs, some NPI matches are low-quality:
//   ❌ Students in healthcare training programs
//   ❌ NPI matched in a different state (person moved — city mismatch)
//   ❌ Missing phone number (NPI record is old/incomplete)
//   ❌ Credential is a non-clinical specialty (medical transport CEO, etc.)
//   ❌ Name is initials-only (e.g. "James A" — can't be trusted)
//
// This script applies a 5-point quality gate and produces three buckets:
//
//   ✅ PRODUCTION READY — Has: real name + valid phone + real credential +
//                         clinical specialty + NPI number. Upgrades fitScore.
//
//   ⚠️  SOFT HOLD — Matched NPI but missing phone or low-confidence specialty.
//                   Stays in pipeline but not routed until enriched.
//
//   ❌ REVERTED — Student trainees, medical transport, non-clinical.
//                 nicheId rolled back to 'henrys'. enrichmentStatus = 'reverted'.
//
// Usage:
//   node scripts/sweep_registry_quality.js              (audit + write)
//   node scripts/sweep_registry_quality.js --dry-run    (preview only)
//   node scripts/sweep_registry_quality.js --report     (print report, no writes)
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('--report');

// ── Quality criteria ──────────────────────────────────────────────────────────

// Credentials that signal a real clinical provider (bill insurance, see patients)
const CLINICAL_CREDENTIALS = new Set([
  'MD','DO','DDS','DMD','DPM','OD','DC','CRNA','APRN','NP','PA','PA-C',
  'PHARMD','RPH','PHD','PSYD','DPT','PT','OT',
]);

// Specialties we consider low-signal for advisor outreach
const LOW_SIGNAL_SPECIALTIES = [
  /student in an organized/i,
  /health care education.*training/i,
  /non-emergency medical transport/i,
  /medical transport/i,
  /supplier/i,
  /vendor/i,
  /durable medical equipment/i,
  /pharmacy/i,  // Pharmacists are good but lower priority than MDs
];

// Specialties that map cleanly to top-tier physician niche
const TOP_TIER_SPECIALTIES = [
  /cardiology/i, /oncology/i, /surgery/i, /neurology/i, /gastroenterology/i,
  /dermatology/i, /radiology/i, /orthopedic/i, /urology/i, /ophthalmology/i,
  /internal medicine/i, /anesthesiology/i, /plastic surgery/i,
  /obstetrics/i, /gynecology/i, /psychiatry/i, /endocrinology/i,
  /nephrology/i, /hematology/i, /rheumatology/i, /pulmonology/i,
  /emergency medicine/i, /critical care/i, /interventional/i,
];

// ── Classify a registry-matched lead ─────────────────────────────────────────
function classifyQuality(lead) {
  const { firstName, lastName, npiNumber, credential, specialty, phone, homeValue } = lead;

  const issues = [];
  const strengths = [];

  // 1. Name quality
  const hasRealName = firstName && lastName &&
    firstName.length > 1 && lastName.length > 1 &&
    !firstName.match(/^[A-Z]$/) && !lastName.match(/^[A-Z]$/);

  if (!hasRealName) issues.push('name-initials-only');
  else strengths.push('real-name');

  // 2. NPI number present
  if (!npiNumber || !String(npiNumber).trim()) issues.push('no-npi');
  else strengths.push('npi-verified');

  // 3. Phone present and valid
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const hasPhone   = cleanPhone.length >= 10;
  if (!hasPhone) issues.push('no-phone');
  else strengths.push('has-phone');

  // 4. Credential quality
  const credClean = (credential || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const isClinical = CLINICAL_CREDENTIALS.has(credClean) ||
    CLINICAL_CREDENTIALS.has(credClean.replace(/,.*/, ''));
  if (!isClinical && credClean) issues.push('non-clinical-credential');
  else if (isClinical) strengths.push('clinical-credential');

  // 5. Specialty quality
  const isLowSignal = LOW_SIGNAL_SPECIALTIES.some(p => p.test(specialty || ''));
  const isTopTier   = TOP_TIER_SPECIALTIES.some(p => p.test(specialty || ''));

  if (isLowSignal) issues.push('low-signal-specialty');
  if (isTopTier)   strengths.push('top-tier-specialty');

  // 6. Homestead wealth signal (bonus)
  if (homeValue >= 2000000) strengths.push('$2M+ homestead');
  if (homeValue >= 3000000) strengths.push('$3M+ homestead');

  // ── Decision ──────────────────────────────────────────────────────────────
  // PRODUCTION READY: real name + phone + NPI + clinical credential
  const isProduction = hasRealName && hasPhone && npiNumber && isClinical && !isLowSignal;

  // REVERT: student/non-clinical OR initials-only name
  const shouldRevert = !hasRealName || isLowSignal ||
    (!hasPhone && !isClinical && issues.length >= 3);

  const bucket = isProduction ? 'PRODUCTION'
    : shouldRevert            ? 'REVERT'
    : 'SOFT_HOLD';

  // Upgraded fitScore for production leads
  let fitScore = lead.fitScore || 70;
  if (bucket === 'PRODUCTION') {
    fitScore = homeValue >= 3000000 ? 96
      : homeValue >= 2000000 ? 91
      : homeValue >= 1500000 ? 88
      : 85;
  }

  return { bucket, issues, strengths, fitScore, hasPhone, cleanPhone };
}

// ── Format phone ──────────────────────────────────────────────────────────────
function formatPhone(digits) {
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return digits;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Registry Quality Sweep                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN / REPORT — no writes' : '✍️  LIVE — writing quality gates to Firestore'}\n`);

  // Load all registry-matched leads
  process.stdout.write('  Loading registry-matched leads... ');
  const snap = await db.collection('master_leads')
    .where('enrichmentStatus', '==', 'registry-matched')
    .get();
  const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${leads.length} leads found\n`);

  if (leads.length === 0) {
    console.log('  No registry-matched leads yet. Run agent_registry_crossref.js first.\n');
    process.exit(0);
  }

  // Classify each lead
  const production = [];
  const softHold   = [];
  const revert     = [];

  leads.forEach(lead => {
    const result = classifyQuality(lead);
    if (result.bucket === 'PRODUCTION') production.push({ lead, result });
    else if (result.bucket === 'SOFT_HOLD') softHold.push({ lead, result });
    else revert.push({ lead, result });
  });

  // ── Print production-ready leads ─────────────────────────────────────────
  console.log('═'.repeat(66));
  console.log(`  ✅ PRODUCTION READY (${production.length} leads) — Complete data, route now`);
  console.log('═'.repeat(66));
  console.log('');

  if (production.length === 0) {
    console.log('  None yet — run more NPI crossref batches.\n');
  } else {
    console.log('  ' +
      'Name'.padEnd(28) +
      'City'.padEnd(14) +
      'Specialty'.padEnd(30) +
      'Phone'.padEnd(18) +
      'Home Value'
    );
    console.log('  ' + '─'.repeat(105));

    production.forEach(({ lead, result }) => {
      const name = `${lead.firstName} ${lead.lastName}`.slice(0, 27).padEnd(27);
      const city = (lead.city || '').slice(0, 13).padEnd(13);
      const spec = (lead.specialty || lead.niche || '').slice(0, 28).padEnd(28);
      const phone = formatPhone(result.cleanPhone).padEnd(17);
      const val  = lead.homeValue ? `$${(lead.homeValue/1e6).toFixed(1)}M` : '—';
      console.log(`  ${name}  ${city}  ${spec}  ${phone}  ${val}`);
    });
  }

  // ── Soft hold ────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`  ⚠️  SOFT HOLD (${softHold.length} leads) — Matched NPI but incomplete contact`);
  console.log('─'.repeat(66));
  softHold.slice(0, 10).forEach(({ lead, result }) => {
    const name = `${lead.firstName} ${lead.lastName}`.slice(0, 27);
    const issues = result.issues.join(', ');
    console.log(`  ${name.padEnd(28)} Issues: ${issues}`);
  });
  if (softHold.length > 10) console.log(`  ... and ${softHold.length - 10} more`);

  // ── Reverts ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`  ❌ REVERTED (${revert.length} leads) — Rolling back to 'henrys'`);
  console.log('─'.repeat(66));
  revert.slice(0, 8).forEach(({ lead, result }) => {
    const name = `${lead.firstName} ${lead.lastName}`.slice(0, 27);
    console.log(`  ${name.padEnd(28)} Reason: ${result.issues.join(', ')}`);
  });
  if (revert.length > 8) console.log(`  ... and ${revert.length - 8} more`);

  // ── Stats ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  QUALITY SUMMARY`);
  console.log('═'.repeat(66));
  console.log(`  Total registry-matched:    ${leads.length}`);
  console.log(`  ✅ Production ready:       ${production.length}  (${Math.round(100*production.length/leads.length)}%)`);
  console.log(`  ⚠️  Soft hold:             ${softHold.length}  (${Math.round(100*softHold.length/leads.length)}%)`);
  console.log(`  ❌ Reverted:               ${revert.length}  (${Math.round(100*revert.length/leads.length)}%)`);

  // Niche breakdown of production
  const byNicheP = {};
  production.forEach(({ lead }) => {
    byNicheP[lead.nicheId] = (byNicheP[lead.nicheId] || 0) + 1;
  });
  console.log(`\n  Production niche breakdown:`);
  Object.entries(byNicheP).forEach(([n, c]) => console.log(`    ${n}: ${c}`));

  // Home value of production leads
  const prodVals = production.map(({ lead }) => lead.homeValue).filter(Boolean);
  if (prodVals.length) {
    const avg = Math.round(prodVals.reduce((a, b) => a + b, 0) / prodVals.length);
    const max = Math.max(...prodVals);
    console.log(`\n  Production lead home values:`);
    console.log(`    Average: $${(avg/1e6).toFixed(1)}M`);
    console.log(`    Highest: $${(max/1e6).toFixed(1)}M`);
  }

  if (DRY_RUN) {
    console.log(`\n  🔍 DRY RUN — remove --dry-run to apply quality gates.\n`);
    process.exit(0);
  }

  // ── Write quality gates ───────────────────────────────────────────────────
  console.log(`\n── Writing quality gates to Firestore...`);
  let written = 0;

  // Write in one batch per bucket
  // PRODUCTION: mark as production-ready, format phone, bump fitScore
  const allUpdates = [];

  production.forEach(({ lead, result }) => {
    allUpdates.push({
      id: lead.id,
      update: {
        enrichmentStatus: 'production-ready',
        fitScore:         result.fitScore,
        priorityScore:    result.fitScore,
        phone:            formatPhone(result.cleanPhone),
        qualityBucket:    'production',
        qualityGatedAt:   new Date().toISOString(),
        updatedAt:        new Date().toISOString(),
        // Ensure niche is accurate
        nicheId:          lead.nicheId || 'physicians',
      },
    });
  });

  // SOFT HOLD: mark enrichmentStatus but don't change nicheId
  softHold.forEach(({ lead }) => {
    allUpdates.push({
      id: lead.id,
      update: {
        enrichmentStatus: 'soft-hold',
        qualityBucket:    'soft-hold',
        qualityGatedAt:   new Date().toISOString(),
        updatedAt:        new Date().toISOString(),
      },
    });
  });

  // REVERT: roll back to henrys
  revert.forEach(({ lead }) => {
    allUpdates.push({
      id: lead.id,
      update: {
        nicheId:          'henrys',
        niche:            'High Net Worth Homeowner',
        enrichmentStatus: 'reverted',
        qualityBucket:    'reverted',
        qualityGatedAt:   new Date().toISOString(),
        updatedAt:        new Date().toISOString(),
      },
    });
  });

  // Batch write
  const BATCH_SIZE = 400;
  for (let i = 0; i < allUpdates.length; i += BATCH_SIZE) {
    const chunk = allUpdates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ id, update }) => {
      batch.update(db.collection('master_leads').doc(id), update);
    });
    await batch.commit();
    written += chunk.length;
    console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1} committed — ${written}/${allUpdates.length}`);
  }

  console.log(`\n  Quality gate applied: ${production.length} production-ready, ${softHold.length} soft-hold, ${revert.length} reverted`);
  console.log(`\n  Next steps:`);
  console.log(`    1. View production-ready leads in cockpit (enrichmentStatus = 'production-ready')`);
  console.log(`    2. Route them: node scripts/route_new_leads.js --advisor jeremy --quality production-ready`);
  console.log(`    3. Run more NPI crossref: node scripts/agent_registry_crossref.js --source npi --limit 2000`);
  console.log('');

  process.exit(0);
}

main().catch(e => {
  console.error('[QualitySweep] FATAL:', e.message);
  process.exit(1);
});
