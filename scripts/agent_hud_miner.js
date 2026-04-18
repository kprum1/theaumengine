#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Agent A8: HUD Multifamily Real Estate Developer Miner
// scripts/agent_hud_miner.js
//
// Data source: HUD Active FHA-Insured Multifamily Mortgages (FREE, public)
// https://www.hud.gov/program_offices/housing/comp/mf_fhasl_active
//
// What it does:
//   1. Downloads the HUD Active Multifamily Mortgages XLSX (updated monthly)
//   2. Filters by state(s), city (optional), mortgage amount, and unit count
//   3. Produces project-level leads — property/developer needs name resolution
//      (PROPERTY NAME identifies the project; owner lookup via state SOS or county recorder)
//   4. Writes .raw.json to scripts/staging/raw/
//
// Why HUD FHA-insured mortgages?
//   - FHA-insured = developer had to demonstrate financial capacity
//   - Mortgage amount = direct AUM signal ($2M mortgage → developer has $2M+ net worth)
//   - Units (50+) = scale developer, not small landlord
//   - Active = still operating, owner is actively managing wealth
//   - MN has 618 active projects → rich lead pool
//
// AUM signal:
//   - $500K–$2M FHA mortgage  → Developer AUM ~$500K–$2M
//   - $2M–$10M FHA mortgage   → Developer AUM ~$2M–$8M  (sweet spot)
//   - $10M+ FHA mortgage      → Developer AUM ~$5M+     (major developer)
//
// Usage:
//   node scripts/agent_hud_miner.js --state MN --limit 50
//   node scripts/agent_hud_miner.js --states MN,TX,IL,FL --limit 100
//   node scripts/agent_hud_miner.js --state MN --city minneapolis --limit 30
//   node scripts/agent_hud_miner.js --state MN --min-units 50 --limit 50
//   node scripts/agent_hud_miner.js --state MN --min-mortgage 2000000 --limit 30
//   node scripts/agent_hud_miner.js --dry-run
//
// Output: scripts/staging/raw/alfred_batch_hud_re_developers_YYYY-MM-DD.raw.json
// ============================================================

const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync } = require('child_process');
const crypto  = require('crypto');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const STATE_ARG     = getArg('--state');
const STATES_ARG    = getArg('--states');
const CITY_ARG      = getArg('--city');
const LIMIT         = parseInt(getArg('--limit') || '50', 10);
const DRY_RUN       = hasFlag('--dry-run');
const MIN_MORTGAGE  = parseFloat(getArg('--min-mortgage') || '500000');
const MAX_MORTGAGE  = parseFloat(getArg('--max-mortgage') || '50000000');
const MIN_UNITS     = parseInt(getArg('--min-units') || '10', 10);
const LOCAL_FILE    = getArg('--local-file'); // skip download, use local XLSX

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().slice(0, 10);
const TMP_DIR     = path.join(os.tmpdir(), 'aum_hud');
const TMP_XLSX    = path.join(TMP_DIR, 'hud_active_mf.xlsx');

// ── HUD XLSX URL — confirmed live (updated monthly) ──────────
// Source: https://www.hud.gov/program_offices/housing/comp/mf_fhasl_active
// File is ~2.6MB — downloads fast
const HUD_URL = 'https://www.hud.gov/sites/default/files/Housing/documents/FHA-BF90-RM-A-03312026.xlsx';

// ── Target states ─────────────────────────────────────────────
function getTargetStates() {
  if (STATE_ARG)   return [STATE_ARG.toUpperCase()];
  if (STATES_ARG)  return STATES_ARG.split(',').map(s => s.trim().toUpperCase());
  return ['MN', 'TX', 'IL', 'FL', 'CO', 'AZ', 'WI', 'IA'];
}

// ── AUM estimator from mortgage amount ───────────────────────
function estimateAUM(mortgageAmt) {
  if (mortgageAmt >= 15_000_000) return { aum: '$5M+',    band: '5m+',   fitScore: 92, timing: 70 };
  if (mortgageAmt >= 5_000_000)  return { aum: '$3M–$8M', band: '1m-5m', fitScore: 88, timing: 68 };
  if (mortgageAmt >= 2_000_000)  return { aum: '$2M–$5M', band: '1m-5m', fitScore: 84, timing: 65 };
  if (mortgageAmt >= 1_000_000)  return { aum: '$1M–$3M', band: '1m-5m', fitScore: 78, timing: 62 };
  return                                { aum: '$500K–$2M', band: '500k-1m', fitScore: 70, timing: 58 };
}

// ── Outreach angle by project type ───────────────────────────
function getOutreachAngle(propName, soaCategory) {
  const n = (propName || '').toLowerCase();
  const s = (soaCategory || '').toLowerCase();
  if (n.includes('senior') || n.includes('elder') || n.includes('care') || n.includes('retirement')) {
    return 'Senior housing developer — estate planning + legacy wealth strategy';
  }
  if (n.includes('coop') || n.includes('co-op')) {
    return 'Cooperative housing — equity concentration needs diversification planning';
  }
  if (s.includes('221') || s.includes('223')) {
    return 'Market-rate multifamily — 1031 exchange + DST strategy at next disposition';
  }
  return 'Commercial RE developer — entity structure + exit tax efficiency';
}

// ── Download HUD XLSX ─────────────────────────────────────────
function downloadXLSX() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Check if cached (file > 1MB = valid)
  if (fs.existsSync(TMP_XLSX) && fs.statSync(TMP_XLSX).size > 1_000_000) {
    const ageDays = (Date.now() - fs.statSync(TMP_XLSX).mtimeMs) / 86400000;
    if (ageDays < 7) {
      console.log(`[HUD Agent] Using cached XLSX (${(fs.statSync(TMP_XLSX).size/1024/1024).toFixed(1)} MB, ${ageDays.toFixed(0)}d old)`);
      return TMP_XLSX;
    }
  }

  console.log(`[HUD Agent] Downloading HUD Active MF Mortgages XLSX…`);
  console.log(`[HUD Agent] URL: ${HUD_URL.slice(0, 80)}…`);

  const cmd = `curl -sL --max-time 60 --retry 2 "${HUD_URL}" -o "${TMP_XLSX}"`;
  execSync(cmd, { stdio: 'pipe' });

  const stat = fs.statSync(TMP_XLSX);
  if (stat.size < 100_000) throw new Error('Download too small — check URL');
  console.log(`[HUD Agent] Download complete: ${(stat.size/1024/1024).toFixed(1)} MB`);
  return TMP_XLSX;
}

// ── Parse XLSX (pure JS — no xlsx library needed) ────────────
// XLSX is a ZIP of XML files. We parse xl/sharedStrings.xml + xl/worksheets/sheet1.xml
function parseXLSX(xlsxPath, targetStates) {
  console.log(`[HUD Agent] Parsing XLSX: ${xlsxPath}`);

  // Read zip using unzip to temp XML files (simpler than pure JS zip)
  const xmlDir = path.join(TMP_DIR, 'xlsx_xml');
  if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });

  execSync(`unzip -o "${xlsxPath}" -d "${xmlDir}" > /dev/null 2>&1`, { stdio: 'pipe' });

  // Load shared strings
  const sstr = {};
  const ssPath = path.join(xmlDir, 'xl', 'sharedStrings.xml');
  if (fs.existsSync(ssPath)) {
    const ssXml = fs.readFileSync(ssPath, 'utf8');
    const items = ssXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    items.forEach((item, i) => {
      sstr[i] = item.replace(/<t[^>]*>/, '').replace(/<\/t>/, '');
    });
  }

  // Load sheet1
  const sheetPath = path.join(xmlDir, 'xl', 'worksheets', 'sheet1.xml');
  const sheetXml = fs.readFileSync(sheetPath, 'utf8');

  // Extract all row XML blocks
  const rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  console.log(`[HUD Agent] Total rows in XLSX: ${rowMatches.length}`);

  // Parse a single row into column → value map
  function parseRow(rowXml) {
    const vals = {};
    const cellRegex = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    let m;
    while ((m = cellRegex.exec(rowXml)) !== null) {
      const [, col, attrs, content] = m;
      const vMatch = content.match(/<v>([^<]*)<\/v>/);
      if (vMatch) {
        let v = vMatch[1];
        if (attrs.includes('t="s"')) v = sstr[parseInt(v)] || v;
        vals[col] = v;
      }
    }
    return vals;
  }

  // Row 1 = title, Row 2 = headers, Row 3+ = data
  const COLS = {
    projNum:   'A', // HUD PROJECT NUMBER
    propName:  'B', // PROPERTY NAME
    city:      'C', // PROPERTY CITY
    state:     'D', // PROPERTY STATE
    zip:       'E', // PROPERTY ZIP
    units:     'F', // UNITS
    mortgAmt:  'I', // ORIGINAL MORTGAGE AMOUNT
    holder:    'P', // HOLDER NAME (lender)
    holderCity:'Q', // HOLDER CITY
    soaCode:   'V', // SECTION OF ACT CODE
    soaCat:    'W', // SOA CATEGORY
    bizType:   'Z', // BUSINESS_TYPE
  };

  const leads = [];
  const seen  = new Set();

  for (let i = 2; i < rowMatches.length; i++) { // skip title + header
    if (leads.length >= LIMIT) break;

    const row  = parseRow(rowMatches[i]);
    const state = (row[COLS.state] || '').trim().toUpperCase();

    if (!targetStates.includes(state)) continue;

    // City filter
    const city = toTitleCase((row[COLS.city] || '').trim());
    if (CITY_ARG && !city.toLowerCase().includes(CITY_ARG.toLowerCase())) continue;

    const mortgAmt = parseFloat(row[COLS.mortgAmt] || '0') || 0;
    const units    = parseInt(row[COLS.units] || '0', 10) || 0;
    const propName = toTitleCase((row[COLS.propName] || '').trim());
    const projNum  = (row[COLS.projNum] || '').trim();
    const zip      = (row[COLS.zip] || '').slice(0, 5);

    if (mortgAmt < MIN_MORTGAGE || mortgAmt > MAX_MORTGAGE) continue;
    if (units < MIN_UNITS) continue;
    if (!propName) continue;

    // Dedup by project number
    if (seen.has(projNum)) continue;
    seen.add(projNum);

    const { aum, band, fitScore, timing } = estimateAUM(mortgAmt);
    const outreachAngle = getOutreachAngle(propName, row[COLS.soaCat] || '');
    const soaCategory   = (row[COLS.soaCat] || 'Multifamily').trim();
    const holderName    = toTitleCase((row[COLS.holder] || '').trim());

    const sourceUrl = `https://www.hud.gov/program_offices/housing/comp/mf_fhasl_active`;
    const hudUrl    = `https://www.hud.gov/program_offices/housing/comp/mf_fhasl_active#${projNum}`;

    leads.push({
      // Name fields — property-level lead, developer name needs resolution
      firstName: '',
      lastName:  '',
      fullName:  '',
      title:     `Developer / Owner — ${propName}`,
      company:   propName,
      entityType: 'unknown', // Developer identity not in HUD data

      // Location (of the property)
      city,
      state,
      zip,

      // Niche
      niche:   'Real Estate Developers',
      nicheId: 're-developers',

      // AUM
      estimatedAUM:  aum,
      aumBand:       band,
      fitScore,
      timingScore:   units >= 100 ? timing + 5 : timing,

      // HUD project specifics
      hudProjectNumber: projNum,
      hudPropertyName:  propName,
      hudUnits:         units,
      hudMortgageAmount: mortgAmt,
      hudMortgageTierLabel: mortgAmt >= 10_000_000 ? '$10M+' :
                            mortgAmt >= 5_000_000  ? '$5M–$10M' :
                            mortgAmt >= 2_000_000  ? '$2M–$5M' :
                            mortgAmt >= 1_000_000  ? '$1M–$2M' : '$500K–$1M',
      hudSoaCategory:   soaCategory,
      hudHolder:        holderName,

      // Source
      source:    'HUD Active FHA-Insured Multifamily Mortgages — hud.gov',
      sourceUrl: hudUrl,
      externalId: `HUD-${projNum}`,

      // Signals
      reasonCodes: [
        `HUD FHA-insured project: ${propName} — ${units} units`,
        `Original mortgage: $${(mortgAmt/1_000_000).toFixed(1)}M (developer demonstrated financial capacity)`,
        `Active FHA project = ongoing RE developer with capital at work`,
      ],
      signals: [
        `Units: ${units} (${units >= 100 ? 'Major' : units >= 50 ? 'Mid-size' : 'Small'} multifamily developer)`,
        `FHA mortgage: $${(mortgAmt/1_000_000).toFixed(1)}M`,
        `Category: ${soaCategory}`,
        outreachAngle,
      ],

      // Enrichment
      needsEnrichment:     true,
      needsNameResolution: true, // HUD data has property name, not developer personal name
      nameResolutionNote:  `Search "${propName}" + ${city}, ${state} on county recorder or state SOS to find LLC owner/developer`,

      batchId: `alfred_batch_hud_re_developers_${TODAY}`,
    });

    if (leads.length % 10 === 0) {
      process.stdout.write(`\r  ✓ ${leads.length} leads found…`);
    }
  }

  process.stdout.write('\n');
  return leads;
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A8: HUD Multifamily RE Developer Miner ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const states = getTargetStates();

  console.log(`  States:        ${states.join(', ')}`);
  console.log(`  Mortgage range: $${(MIN_MORTGAGE/1e6).toFixed(1)}M – $${(MAX_MORTGAGE/1e6).toFixed(0)}M`);
  console.log(`  Min units:     ${MIN_UNITS}`);
  console.log(`  Limit:         ${LIMIT} leads`);
  if (CITY_ARG)  console.log(`  City filter:   ${CITY_ARG}`);
  if (DRY_RUN)   console.log('  DRY RUN — no file will be written');
  console.log('');
  console.log('  ⚠️  Output is property-level (needsNameResolution: true).');
  console.log('     Developer personal name: search property name on county recorder or state SOS.');
  console.log('');

  // Download
  const xlsxPath = LOCAL_FILE || downloadXLSX();

  // Parse
  let leads;
  try {
    leads = parseXLSX(xlsxPath, states);
  } catch(e) {
    console.error(`[HUD Agent] ❌ Parse error: ${e.message}`);
    process.exit(1);
  }

  console.log(`\n[HUD Agent] ✅ ${leads.length} qualifying RE developer leads found`);

  if (leads.length === 0) {
    console.warn('[HUD Agent] ⚠️  No results. Try --min-mortgage 250000, --min-units 5, or expand states.');
    process.exit(0);
  }

  // ── Summary ────────────────────────────────────────────────
  const byAUM   = {};
  const byUnits = { '200+': 0, '100–200': 0, '50–100': 0, '20–50': 0, '<20': 0 };

  leads.forEach(l => {
    byAUM[l.estimatedAUM] = (byAUM[l.estimatedAUM] || 0) + 1;
    const u = l.hudUnits;
    if (u >= 200)      byUnits['200+']++;
    else if (u >= 100) byUnits['100–200']++;
    else if (u >= 50)  byUnits['50–100']++;
    else if (u >= 20)  byUnits['20–50']++;
    else               byUnits['<20']++;
  });

  console.log('\n── AUM Tier Distribution ─────────────────────────────────');
  Object.entries(byAUM).filter(([,n]) => n > 0).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  console.log('\n── Unit Count Distribution ───────────────────────────────');
  Object.entries(byUnits).filter(([,n]) => n > 0).forEach(([t, n]) => console.log(`  ${t} units: ${n}`));

  console.log('\n── Sample Leads ──────────────────────────────────────────');
  leads.slice(0, 6).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.company}`);
    console.log(`     ${l.city}, ${l.state} ${l.zip} | ${l.hudUnits} units | Mortgage: $${(l.hudMortgageAmount/1e6).toFixed(1)}M | AUM: ${l.estimatedAUM}`);
    console.log(`     Category: ${l.hudSoaCategory}`);
    console.log(`     📌 ${l.nameResolutionNote}`);
  });

  // ── Dry run ────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[HUD Agent] DRY RUN — skipping file write. Sample lead:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // ── Write output ───────────────────────────────────────────
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const outputFile = path.join(STAGING_DIR, `alfred_batch_hud_re_developers_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[HUD Agent] ✅ Raw batch written: ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log(`[HUD Agent] 📂 Location: ${outputFile}`);

  console.log('\n── Next Steps ───────────────────────────────────────────');
  console.log('  ⚠️  These are PROPERTY-level leads (HUD project name, not developer name).');
  console.log('     Name resolution options:');
  console.log('  1. Search property name on county recorder → looks up LLC owner/developer');
  console.log('  2. Search property name on MN SOS entity search → find registered agent = often developer');
  console.log('  3. Pass to Vera or Alfred for enrichment via Apollo or LinkedIn');
  console.log('');
  console.log(`  After name resolution:`);
  console.log(`  - Scrub:  node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  - Review: node scripts/scrub_leads.js --file ${outputFile} --review-only`);
  console.log(`  - Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>`);
  console.log('');
}

main().catch(err => {
  console.error('[HUD Agent] FATAL:', err.message);
  process.exit(1);
});
