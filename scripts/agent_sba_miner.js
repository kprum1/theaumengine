#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Agent A7: SBA 7(a) Loan Business Owner Miner
// scripts/agent_sba_miner.js
//
// Data source: SBA FOIA 7(a) Loan Data — data.sba.gov (FREE, no key)
// https://data.sba.gov/dataset/7-a-504-foia
//
// What it does:
//   1. Downloads SBA 7(a) FOIA CSV (FY2010–Present or FY2020–Present)
//   2. Filters by state(s), loan amount ($250K–$8M), business type,
//      NAICS code (owner-operated sectors), and loan status
//   3. Produces business-level leads — owner needs enrichment for
//      personal first/last name (borrname is usually the business name)
//   4. Writes .raw.json to scripts/staging/raw/
//
// Why SBA 7(a) data?
//   - SBA loan approval = business has $500K–$15M revenue (lender verified)
//   - Loan amount is a hard revenue signal — lenders don't approve $1M loans
//     to businesses that can't service them
//   - Paid-in-full (PIF) loans = business thrived, owner now cash-rich
//   - Business age field = succession planning window identification
//
// AUM signal:
//   - $250K–$750K SBA loan → ~$500K–$2M revenue → owner AUM $500K–$2M
//   - $750K–$2M SBA loan   → ~$2M–$8M revenue   → owner AUM $1M–$3M
//   - $2M–$8M SBA loan     → ~$8M–$25M revenue  → owner AUM $2M–$8M
//
// Usage:
//   node scripts/agent_sba_miner.js --state MN --limit 50
//   node scripts/agent_sba_miner.js --states TX,IL,FL,MN --limit 100
//   node scripts/agent_sba_miner.js --state MN --city minnetonka --limit 30
//   node scripts/agent_sba_miner.js --state MN --status PIF --limit 50
//   node scripts/agent_sba_miner.js --dataset 2020 --state MN --limit 50
//   node scripts/agent_sba_miner.js --dry-run
//
// Status filters:
//   PIF    = Paid in Full (owner is cash-rich, no debt — prime AUM target)
//   EXEMPT = Still active, not yet paid (business still operating)
//   CHGOFF = Charged off — SKIP (business failed)
//   CANCLD = Cancelled — SKIP
//
// Output: scripts/staging/raw/alfred_batch_sba_business_owners_YYYY-MM-DD.raw.json
// ============================================================

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync } = require('child_process');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const STATE_ARG   = getArg('--state');
const STATES_ARG  = getArg('--states');
const CITY_ARG    = getArg('--city');      // filter by city name (partial match)
const LIMIT       = parseInt(getArg('--limit') || '50', 10);
const DRY_RUN     = hasFlag('--dry-run');
const STATUS_ARG  = getArg('--status');    // PIF, EXEMPT, ALL (default: PIF+EXEMPT)
const DATASET     = getArg('--dataset') || '2000'; // '2000' is confirmed working
const MIN_LOAN    = parseInt(getArg('--min-loan') || '250000', 10);
const MAX_LOAN    = parseInt(getArg('--max-loan') || '8000000', 10);

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().slice(0, 10);
const TMP_DIR     = path.join(os.tmpdir(), 'aum_sba');

// ── SBA FOIA CSV URLs ─────────────────────────────────────────
// FY2000-2009 confirmed working direct download (243MB, 690K records)
// FY2010+ files redirect to auth portal — use FY2000-2009 for now
const SBA_URLS = {
  '2000': 'https://data.sba.gov/dataset/0ff8e8e9-b967-4f4e-987c-6ac78c575087/resource/186eb176-b53e-4cbe-ab93-e5c4fb50197d/download',
  '2010': 'https://data.sba.gov/dataset/0ff8e8e9-b967-4f4e-987c-6ac78c575087/resource/186eb176-b53e-4cbe-ab93-e5c4fb50197d/download', // same until direct link confirmed
  '2020': 'https://data.sba.gov/dataset/0ff8e8e9-b967-4f4e-987c-6ac78c575087/resource/186eb176-b53e-4cbe-ab93-e5c4fb50197d/download', // same until direct link confirmed
};

// ── Target states ─────────────────────────────────────────────
function getTargetStates() {
  if (STATE_ARG)  return [STATE_ARG.toUpperCase()];
  if (STATES_ARG) return STATES_ARG.split(',').map(s => s.trim().toUpperCase());
  return ['MN', 'TX', 'IL', 'FL', 'CO', 'AZ']; // default
}

// ── Target loan statuses ──────────────────────────────────────
function getTargetStatuses() {
  if (STATUS_ARG === 'ALL') return null; // no filter
  if (STATUS_ARG) return [STATUS_ARG.toUpperCase()];
  return ['PIF', 'EXEMPT']; // PIF = paid in full (cash rich) + active loans
}

// ── HNW NAICS sectors — owner-operated businesses only ────────
// First 2 digits = sector. These are the highest-AUM owner-operated sectors.
const HNW_NAICS_SECTORS = new Set([
  '23', // Construction — GC, specialty trade, plumbing, electrical
  '33', // Manufacturing — fabricated metal, machinery, plastics
  '42', // Wholesale trade — durable goods distributors
  '44', // Retail — auto dealers, building materials
  '45', // Retail (cont)
  '48', // Transportation — trucking, logistics
  '49', // Warehousing
  '53', // Real estate
  '54', // Professional services — engineering, accounting, consulting, IT
  '55', // Management of companies
  '56', // Support services — staffing, facilities management
  '62', // Healthcare & social assistance — outpatient, dental practices
  '72', // Accommodation & food services — hotels, franchised restaurants
  '81', // Other services — repair shops, personal care, laundry
]);

// ── NAICS sectors to SKIP — low-AUM or non-owner-operated ─────
const SKIP_NAICS = new Set([
  '61', // Educational services (usually nonprofits)
  '92', // Public administration (government)
  '11', // Agriculture (farm equipment, not HNW profile)
  '21', // Mining/oil — too large or commodity
]);

// ── Company name patterns to exclude ─────────────────────────
// These indicate national chains, franchises, or non-owner businesses
const SKIP_NAME_PATTERNS = /\b(LLC$|CORPORATION$|INC$)$|\bFRANCHISE\b|\bMCDONALD|\bSUBWAY\b|\bDUNKIN|\bPIZZA HUT|\bFEDERAL|\bGOVERNMENT|\bUNITED STATES|\bU\.S\.\b|\bUSDA|\bHUD\b|\bSBA\b/i;

// ── AUM estimator from loan amount ───────────────────────────
function estimateAUM(loanAmount) {
  if (loanAmount >= 3_000_000) return { aum: '$3M–$8M', band: '1m-5m', fitScore: 90, timing: 72 };
  if (loanAmount >= 1_000_000) return { aum: '$2M–$5M', band: '1m-5m', fitScore: 86, timing: 70 };
  if (loanAmount >= 500_000)   return { aum: '$1M–$3M', band: '1m-5m', fitScore: 80, timing: 65 };
  return                              { aum: '$500K–$1.5M', band: '500k-1m', fitScore: 72, timing: 60 };
}

// ── Revenue estimator from loan amount ───────────────────────
function estimateRevenue(loanAmount) {
  // SBA lenders typically approve loans at 25–35% of annual revenue
  const low  = Math.round(loanAmount / 0.35 / 1_000_000 * 10) / 10;
  const high = Math.round(loanAmount / 0.20 / 1_000_000 * 10) / 10;
  return `$${low}M–$${high}M`;
}

// ── Timing signal from loan status ────────────────────────────
function getTimingAngle(status, businessAge) {
  if (status === 'PIF') return 'Loan paid off — business is cash-rich, succession planning window open';
  if (status === 'EXEMPT' && businessAge >= 15) return 'Established business — owner approaching exit window (15+ years)';
  if (status === 'EXEMPT') return 'Active SBA borrower — expanding business, may need wealth planning';
  return 'Business operating — active owner';
}

// ── Download CSV via curl (more reliable than Node https for large files) ─
function downloadCSV(url, destFile) {
  console.log(`[SBA Agent] Downloading CSV dataset… this may take 30–60 seconds.`);
  console.log(`[SBA Agent] URL: ${url.slice(0, 80)}...`);
  console.log(`[SBA Agent] Dest: ${destFile}`);

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Use curl with follow-redirects
  const cmd = `curl -sL --max-time 120 --retry 2 "${url}" -o "${destFile}"`;
  execSync(cmd, { stdio: 'pipe' });

  const stat = fs.statSync(destFile);
  if (stat.size < 1000) {
    // Check if it's HTML (redirect error)
    const sample = fs.readFileSync(destFile, 'utf8').slice(0, 100);
    if (sample.includes('<!DOCTYPE') || sample.includes('<html')) {
      throw new Error('Download returned HTML (redirect error). Check URL.');
    }
  }
  console.log(`[SBA Agent] Download complete: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  return destFile;
}

// ── Parse CSV line (handles quoted fields) ────────────────────
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ── Build lead from SBA loan row ──────────────────────────────
function buildLead(row, headers) {
  const get = (name) => (row[headers.indexOf(name)] || '').trim();

  const borrName   = get('borrname').toUpperCase();
  const city       = get('borrcity');
  const state      = get('borrstate').toUpperCase();
  const zip        = get('borrzip').slice(0, 5);
  const naics      = get('naicscode').slice(0, 2); // top-level sector
  const naicsDesc  = get('naicsdescription');
  const loanAmt    = parseFloat(get('grossapproval').replace(/[,$]/g, '')) || 0;
  const status     = get('loanstatus').toUpperCase().trim();
  const bizType    = get('businesstype');
  const bizAge     = parseInt(get('businessage'), 10) || 0;
  const approvalYr = parseInt(get('approvalfiscalyear'), 10) || 0;
  const naicsFull  = get('naicscode');

  // ── Hard filters ──
  if (loanAmt < MIN_LOAN || loanAmt > MAX_LOAN) return null;

  const targetStatuses = getTargetStatuses();
  if (targetStatuses && !targetStatuses.includes(status)) return null;

  // Skip non-HNW NAICS sectors
  if (SKIP_NAICS.has(naics)) return null;
  if (naics && !HNW_NAICS_SECTORS.has(naics) && naics !== '') return null;

  // Skip franchise patterns
  if (SKIP_NAME_PATTERNS.test(borrName)) return null;

  // City filter
  if (CITY_ARG && !city.toLowerCase().includes(CITY_ARG.toLowerCase())) return null;

  const { aum, band, fitScore, timing } = estimateAUM(loanAmt);
  const timingAngle = getTimingAngle(status, bizAge);
  const estimatedRevenue = estimateRevenue(loanAmt);

  // Name is the business name — owner name requires enrichment
  const titleCaseCity = city.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const sourceUrl = `https://data.sba.gov/dataset/7-a-504-foia`;

  return {
    // Name fields — business-level lead, owner name needs enrichment
    firstName: '',
    lastName:  '',
    fullName:  '',
    title:     `Owner — ${toTitleCase(borrName)}`,
    company:   toTitleCase(borrName),
    entityType: mapBizType(bizType),

    // Location
    city:  titleCaseCity,
    state,
    zip,

    // Niche
    niche:   'Business Owners',
    nicheId: 'business-owners',

    // AUM / Revenue
    estimatedAUM:     aum,
    aumBand:          band,
    estimatedRevenue,
    fitScore,
    timingScore:      loanAmt >= 1_000_000 ? timing + 5 : timing,

    // SBA specifics
    sbaLoanAmount:  loanAmt,
    sbaLoanStatus:  status,
    sbaApprovalYear: approvalYr,
    sbaNaicsCode:   naicsFull,
    sbaNaicsDesc:   naicsDesc,
    sbaBusinessAge:  bizAge,
    sbaBusinessType: bizType,

    // Source
    source:    'SBA FOIA 7(a) Loan Data — data.sba.gov',
    sourceUrl,
    externalId: `SBA-${borrName.replace(/\s+/g, '-').slice(0, 30)}-${zip}`,

    // Signals
    reasonCodes: [
      `SBA 7(a) loan: $${(loanAmt / 1000).toFixed(0)}K (${status === 'PIF' ? 'PAID IN FULL ✅' : 'Active'})`,
      `Estimated business revenue: ${estimatedRevenue}`,
      naicsDesc ? `Industry: ${naicsDesc}` : `NAICS: ${naicsFull}`,
      bizAge > 0 ? `Business age: ${bizAge}+ years` : '',
    ].filter(Boolean),

    signals: [
      `SBA loan amount: $${(loanAmt / 1000000).toFixed(2)}M`,
      `Loan status: ${status} — ${timingAngle}`,
      `NAICS ${naicsFull}: ${naicsDesc || 'Owner-operated sector'}`,
      `Approval year: ${approvalYr}`,
    ],

    // Enrichment flags
    needsEnrichment:      true,
    needsNameResolution:  true,  // borrname is the business — need owner's personal name
    nameResolutionNote:   `Search "${toTitleCase(borrName)}" on LinkedIn or Secretary of State to find owner name`,

    batchId: `alfred_batch_sba_business_owners_${TODAY}`,
  };
}

function toTitleCase(str) {
  return str.split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function mapBizType(bizType) {
  const t = (bizType || '').toLowerCase();
  if (t.includes('individual') || t.includes('proprietor')) return 'individual';
  if (t.includes('corporation') || t.includes('corp')) return 'business';
  if (t.includes('llc') || t.includes('limited')) return 'business';
  if (t.includes('partnership')) return 'business';
  return 'business'; // most SBA borrowers are businesses
}

// ── Parse the CSV file ────────────────────────────────────────
function parseCSV(filePath, targetStates) {
  console.log(`[SBA Agent] Parsing CSV: ${filePath}`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');

  const headerLine = lines[0].replace(/\r/g, '');
  const headers    = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  console.log(`[SBA Agent] Total rows: ${lines.length.toLocaleString()}`);
  console.log(`[SBA Agent] Filtering for states: ${targetStates.join(', ')}`);

  const stateIdx  = headers.indexOf('borrstate');
  const leads     = [];
  let   scanned   = 0;
  let   filtered  = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '').trim();
    if (!line) continue;
    scanned++;

    // Fast state pre-filter before full parse
    const row = parseCSVLine(line);
    const state = (row[stateIdx] || '').trim().toUpperCase();
    if (!targetStates.includes(state)) { filtered++; continue; }

    const lead = buildLead(row, headers);
    if (!lead) { filtered++; continue; }

    leads.push(lead);
    if (leads.length >= LIMIT) break;

    if (leads.length % 10 === 0) {
      process.stdout.write(`\r  ✓ ${leads.length} leads found (scanned ${scanned.toLocaleString()} rows)…`);
    }
  }

  process.stdout.write('\n');
  return leads;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A7: SBA 7(a) Business Owner Miner ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const states  = getTargetStates();
  const statuses = getTargetStatuses();

  console.log(`  States:     ${states.join(', ')}`);
  console.log(`  Loan range: $${(MIN_LOAN/1000).toFixed(0)}K – $${(MAX_LOAN/1_000_000).toFixed(0)}M`);
  console.log(`  Statuses:   ${statuses ? statuses.join(', ') : 'ALL'}`);
  console.log(`  Dataset:    FY${DATASET}–Present`);
  console.log(`  Limit:      ${LIMIT} leads`);
  if (CITY_ARG) console.log(`  City filter: ${CITY_ARG}`);
  if (DRY_RUN)  console.log('  DRY RUN — no file will be written');
  console.log('');
  console.log('  ⚠️  Output is business-level (needsNameResolution: true).');
  console.log('     Owner personal name must be looked up via LinkedIn or SOS filing.');
  console.log('');

  // ── Download CSV ──────────────────────────────────────────
  const csvUrl  = SBA_URLS[DATASET] || SBA_URLS['2020'];
  const csvFile = path.join(TMP_DIR, `sba_7a_${DATASET}.csv`);

  let leads;
  try {
    if (fs.existsSync(csvFile) && fs.statSync(csvFile).size > 100_000) {
      console.log(`[SBA Agent] Using cached CSV: ${csvFile} (${(fs.statSync(csvFile).size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      downloadCSV(csvUrl, csvFile);
    }

    // ── Parse ───────────────────────────────────────────────
    leads = parseCSV(csvFile, states);
  } catch(e) {
    console.error(`[SBA Agent] ❌ Error: ${e.message}`);
    console.error('[SBA Agent] The SBA FOIA CSV download may have failed.');
    console.error('[SBA Agent] Try downloading manually from: https://data.sba.gov/dataset/7-a-504-foia');
    console.error('[SBA Agent] Then: node scripts/agent_sba_miner.js --local-file /path/to/file.csv --state MN');
    process.exit(1);
  }

  console.log(`\n[SBA Agent] ✅ ${leads.length} qualifying business leads found`);

  if (leads.length === 0) {
    console.warn('[SBA Agent] ⚠️  No results. Try --min-loan 100000, different states, or --status ALL');
    process.exit(0);
  }

  // ── Summary ────────────────────────────────────────────────
  const statusDist  = {};
  const naicsDist   = {};
  const aumDist     = { '$3M–$8M': 0, '$2M–$5M': 0, '$1M–$3M': 0, '$500K–$1.5M': 0 };
  leads.forEach(l => {
    statusDist[l.sbaLoanStatus]  = (statusDist[l.sbaLoanStatus] || 0) + 1;
    const naicsSector = (l.sbaNaicsCode || '').slice(0, 2);
    naicsDist[naicsSector]       = (naicsDist[naicsSector] || 0) + 1;
    aumDist[l.estimatedAUM]      = (aumDist[l.estimatedAUM] || 0) + 1;
  });

  console.log('\n── AUM Tier Distribution ─────────────────────────────────');
  Object.entries(aumDist).filter(([,n]) => n > 0).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  console.log('\n── Loan Status Distribution ──────────────────────────────');
  Object.entries(statusDist).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  console.log('\n── Sample Leads ──────────────────────────────────────────');
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.company}`);
    console.log(`     ${l.city}, ${l.state} ${l.zip} | ${l.sbaLoanStatus} | Loan: $${(l.sbaLoanAmount/1000).toFixed(0)}K | AUM: ${l.estimatedAUM}`);
    console.log(`     ${l.sbaNaicsDesc || 'NAICS ' + l.sbaNaicsCode}`);
    console.log(`     📌 ${l.nameResolutionNote}`);
  });

  // ── Dry run ────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[SBA Agent] DRY RUN — skipping file write. Sample lead:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // ── Write output ───────────────────────────────────────────
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const outputFile = path.join(STAGING_DIR, `alfred_batch_sba_business_owners_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[SBA Agent] ✅ Raw batch written: ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log(`[SBA Agent] 📂 Location: ${outputFile}`);

  console.log('\n── Next Steps ───────────────────────────────────────────');
  console.log('  ⚠️  These are BUSINESS-level leads (borrname = company name).');
  console.log('     Owner name resolution needed before scrubbing.');
  console.log('');
  console.log('  Name resolution options:');
  console.log('  1. Search company name on LinkedIn → find "Owner", "Founder", "President"');
  console.log('  2. Search company on your state Secretary of State → registered agent = often owner');
  console.log('  3. Pass to Alfred/Vera for batch enrichment via Apollo or Hunter.io');
  console.log('');
  console.log(`  After name resolution:`);
  console.log(`  - Scrub:  node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  - Review: node scripts/scrub_leads.js --file ${outputFile} --review-only`);
  console.log(`  - Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>`);
  console.log('');
}

main().catch(err => {
  console.error('[SBA Agent] FATAL:', err.message);
  process.exit(1);
});
