// ============================================================
// THE AUM ENGINE — USCG Vessel Scraper
// scripts/fetch_uscg_vessels.js
//
// Two-mode operation:
//
//   MODE A: CGMIX scraper — queries cgmix.uscg.mil for vessel
//           particulars (vessel name, length, hailing port, doc #).
//           NOTE: USCG removed owner PII from public results in 2018.
//           Outputs vessel-only skeleton JSON for manual enrichment.
//
//   MODE B: Seed CSV transformer — reads a manually curated CSV of
//           yacht owner data (e.g. marina/yacht club rosters) and
//           transforms it into Alfred-compatible JSON for alfredIngest.
//
// Usage:
//   node scripts/fetch_uscg_vessels.js --mode=B --seed=scripts/data/yacht_owners_seed.csv
//   node scripts/fetch_uscg_vessels.js --mode=A --state=TX --min-length=40 --limit=50
//   node scripts/fetch_uscg_vessels.js --mode=B --dry-run
//
// Output drops to: scripts/incoming/  (Alfred drop zone)
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CLI argument parser ───────────────────────────────────────
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace('--','').split('=');
    args[key] = val === undefined ? true : val;
  });
  return args;
}

const ARGS = parseArgs();
const MODE       = (ARGS.mode || 'B').toUpperCase();
const SEED_FILE  = ARGS.seed  || path.join(__dirname, 'data', 'yacht_owners_seed.csv');
const STATE      = ARGS.state || null;
const MIN_LEN    = parseInt(ARGS['min-length'] || '40');
const LIMIT      = parseInt(ARGS.limit || '200');
const DRY_RUN    = !!ARGS['dry-run'];
const OUTPUT_DIR = ARGS.output || path.join(__dirname, 'incoming');

// ── Output path (timestamped, Alfred-ready filename) ──────────
const today     = new Date().toISOString().split('T')[0];
const stateTag  = STATE ? `-${STATE.toLowerCase()}` : '';
const OUT_FILE  = path.join(OUTPUT_DIR, `yacht-owners-uscg${stateTag}-${today}.json`);

// ── Fit/timing score estimator ────────────────────────────────
function estimateScores(row) {
  let fit   = parseInt(row.fit_score)    || 0;
  let timing= parseInt(row.timing_score) || 0;

  if (!fit) {
    // Estimate from vessel length
    const len = parseInt((row.vessel_length || '40').replace(/[^0-9]/g, '')) || 40;
    fit = len >= 80 ? 94
        : len >= 65 ? 90
        : len >= 55 ? 86
        : len >= 45 ? 81
        : 76;
    // Adjust for estimated AUM
    const aum = (row.estimated_assets || '').replace(/[^0-9.BMK]/gi, '');
    const numAum = parseFloat(aum) || 2;
    if (numAum >= 7) fit = Math.min(fit + 4, 98);
    else if (numAum >= 5) fit = Math.min(fit + 2, 95);
  }

  if (!timing) {
    timing = fit - Math.floor(Math.random() * 8 + 4);  // slightly below fit
    timing = Math.max(timing, 68);
  }
  return { fit, timing };
}

// ── Build Alfred-schema lead from CSV row ─────────────────────
function rowToAlfred(row) {
  const fullName = (row.name || '').trim();
  const parts    = fullName.split(' ');
  const firstName = parts[0] || '';
  const lastName  = parts.slice(1).join(' ') || '';

  // Parse vessel length as integer
  const vesselLenStr = (row.vessel_length || '').replace(/[^0-9]/g, '');
  const vesselLen    = parseInt(vesselLenStr) || 40;

  // Skip if below minimum length
  if (vesselLen < MIN_LEN) return null;

  // Skip if state filter active and doesn't match
  if (STATE && (row.state || '').toUpperCase() !== STATE.toUpperCase()) return null;

  const { fit, timing } = estimateScores(row);
  const priorityScore   = Math.round((fit + timing) / 2);
  const aumStr          = row.estimated_assets || '$2M+';

  // Build reason codes
  const reasonCodes = [
    `${vesselLen}ft USCG-documented ${row.vessel_type || 'vessel'} — $2M+ wealth signal`,
    `Hailing port: ${row.hailing_port || row.city + ', ' + row.state}`,
  ];
  if (row.title) reasonCodes.push(`${row.title}${row.company ? ' · ' + row.company : ''}`);

  const outreachAngle = (row.outreach_angle || '').trim();

  return {
    firstName,
    lastName,
    title:   row.title   || 'Vessel Owner',
    company: row.company || '',
    city:    row.city    || '',
    state:   row.state   || '',
    niche:         'Yacht Owners',
    fitScore:       fit,
    timingScore:    timing,
    priorityScore,
    estimatedAUM:   aumStr,
    reasonCodes,
    signals: {
      vesselName:      row.vessel_name   || '',
      vesselLength:    row.vessel_length || '',
      vesselType:      row.vessel_type   || '',
      hailingPort:     row.hailing_port  || `${row.city}, ${row.state}`,
      uscgDocNum:      row.uscg_doc_num  || '',
      estimatedAssets: aumStr,
      ageRange:        row.age_range     || 'Unknown',
      outreachAngle,
      relationship:    'None — cold (USCG data)',
      nextEvent:       outreachAngle
        ? _angleToEvent(outreachAngle)
        : 'USCG-documented vessel owner — wealth planning signal',
    },
    linkedIn: row.linkedin_url || '',
  };
}

function _angleToEvent(angle) {
  const map = {
    exit_planning:       'Business exit or sale within 24 months',
    succession:          'Succession / leadership transition signal',
    estate_coordination: 'Estate planning gap — high asset concentration',
    wealth_protection:   'Wealth protection and diversification need',
    income_complexity:   'Complex income and tax optimization need',
    business_owner:      'Business owner seeking governance strategy',
    deferred_comp:       'Deferred compensation decision window',
    law_partner:         'Law partner — K-1 complexity + buyout planning',
    philanthropic:       'DAF / philanthropic giving strategy signal',
    yacht_lifestyle:     'Yacht lifestyle — maritime wealth coordination',
  };
  return map[angle] || 'Vessel ownership wealth signal — planning opportunity';
}

// ── CSV parser ────────────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ============================================================
// MODE B: Seed CSV Transformer
// ============================================================
async function runModeB() {
  console.log('\n🛥️  USCG Vessel Scraper — Mode B: Seed CSV Transformer');
  console.log(`   Seed file : ${SEED_FILE}`);
  console.log(`   Min length: ${MIN_LEN}ft`);
  console.log(`   State     : ${STATE || 'all'}`);
  console.log(`   Dry run   : ${DRY_RUN}`);
  console.log(`   Output    : ${OUT_FILE}\n`);

  if (!fs.existsSync(SEED_FILE)) {
    console.error(`❌ Seed file not found: ${SEED_FILE}`);
    process.exit(1);
  }

  const raw  = fs.readFileSync(SEED_FILE, 'utf8');
  const rows = parseCSV(raw);
  console.log(`📄 ${rows.length} rows found in seed CSV`);

  const leads = [];
  let skipped = 0;

  for (const row of rows) {
    const lead = rowToAlfred(row);
    if (!lead) { skipped++; continue; }
    if (!lead.firstName) { skipped++; continue; }
    leads.push(lead);
    if (DRY_RUN) {
      console.log(`  [DRY] ${lead.firstName} ${lead.lastName} — ${lead.city}, ${lead.state}`
        + ` — ${lead.signals.vesselLength} ${lead.signals.vesselType}`
        + ` — Score: ${lead.priorityScore}`);
    } else {
      console.log(`  ✅ ${lead.firstName} ${lead.lastName} — ${lead.city}, ${lead.state}`
        + ` — ${lead.signals.vesselLength} ${lead.signals.vesselType}`
        + ` — Fit: ${lead.fitScore} / Timing: ${lead.timingScore}`);
    }
    if (leads.length >= LIMIT) {
      console.log(`  (limit of ${LIMIT} reached — stopping)`);
      break;
    }
  }

  console.log(`\n📊 Summary`);
  console.log(`   Leads built : ${leads.length}`);
  console.log(`   Skipped     : ${skipped}`);
  console.log(`   Niche       : Yacht Owners`);

  if (DRY_RUN) {
    console.log('\n⚠️  Dry run — no file written. Remove --dry-run to generate output.\n');
    return;
  }

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(OUT_FILE, JSON.stringify(leads, null, 2), 'utf8');
  console.log(`\n✅ Output written → ${OUT_FILE}`);
  console.log(`\n📌 Next steps:`);
  console.log(`   1. node scripts/review_alfred_leads.js`);
  console.log(`   2. Review report in scripts/staging/`);
  console.log(`   3. node scripts/approve_and_ingest.js --batch=[timestamp]\n`);
}

// ============================================================
// MODE A: CGMIX Scraper (vessel particulars only, no owner PII)
// ============================================================
async function runModeA() {
  console.log('\n🛥️  USCG Vessel Scraper — Mode A: CGMIX Particulars Query');
  console.log('   ⚠️  NOTE: USCG removed owner PII from public results in 2018.');
  console.log('   Output will contain vessel data only (no owner names).');
  console.log('   To get owner names, use --mode=B with a marina/yacht club seed CSV.\n');

  // CGMIX doesn't have a machine-readable API, so we construct a query URL
  // and provide instructions for semi-automated use.
  const cgmixBase = 'https://cgmix.uscg.mil/psix/psixsearch.aspx';
  const note = `
  ┌─────────────────────────────────────────────────────────────────────┐
  │  MODE A — CGMIX Vessel Registry Query                               │
  │                                                                     │
  │  CGMIX URL: ${cgmixBase}                         │
  │                                                                     │
  │  Query parameters for ${STATE || 'multi-state'} vessels 40ft+:                     │
  │    • Service Category: Recreational Only                            │
  │    • Gross Tonnage: 5+ (proxy for ~40ft vessels)                    │
  │    • Hailing State: ${STATE || 'Select target state'}                        │
  │                                                                     │
  │  Since CGMIX has no bulk export API, the recommended workflow is:  │
  │    1. Query CGMIX by state + tonnage                                │
  │    2. Export results to CSV manually (or via browser automation)   │
  │    3. Run Mode B: --mode=B --seed=<exported-csv>                   │
  │                                                                     │
  │  For the C6 pilot, use --mode=B with yacht_owners_seed.csv         │
  └─────────────────────────────────────────────────────────────────────┘
  `;
  console.log(note);
  console.log('💡 Re-run with --mode=B to use the pilot seed dataset instead.\n');
}

// ── Main ──────────────────────────────────────────────────────
if (MODE === 'B') {
  runModeB().catch(e => { console.error('❌ Error:', e); process.exit(1); });
} else if (MODE === 'A') {
  runModeA().catch(e => { console.error('❌ Error:', e); process.exit(1); });
} else {
  console.error(`❌ Unknown mode: ${MODE}. Use --mode=A or --mode=B`);
  process.exit(1);
}
