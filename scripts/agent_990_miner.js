#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Agent A6: IRS 990 Charity Board Miner
// scripts/agent_990_miner.js
//
// Data source: ProPublica Nonprofit Explorer API (free, no key)
// API: https://projects.propublica.org/nonprofits/api/v2/
//
// What it does:
//   1. Searches ProPublica for 501c3 nonprofits by state + NTEE category
//   2. Filters for organizations with $5M+ in assets (HNW board signal)
//   3. Produces org-level leads with needsNameResolution: true
//      (board member names must be pulled from the 990 PDF Part VII)
//   4. Writes .raw.json to scripts/staging/raw/
//
// Lead type: Company-level → "Board Trustee at [Org]"
// Name resolution: Open sourceUrl → click latest 990 PDF → Part VII
//
// Usage:
//   node scripts/agent_990_miner.js --state TX --limit 40
//   node scripts/agent_990_miner.js --states TX,IL,FL,NY,CA --limit 20
//   node scripts/agent_990_miner.js --ntee E --state MN --limit 30
//   node scripts/agent_990_miner.js --dry-run
//
// NTEE codes:
//   A = Arts, Culture, Humanities
//   B = Education
//   E = Health
//   F = Mental Health
//   G = Disease Research
//   P = Human Services
//   T = Philanthropy / Foundations
//   (default: E,B,A,T — highest board member wealth concentration)
//
// Output: scripts/staging/raw/alfred_batch_990_charity_boards_YYYY-MM-DD.raw.json
// ============================================================

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const STATE_ARG  = getArg('--state');
const STATES_ARG = getArg('--states');  // comma-separated: TX,IL,FL
const NTEE_ARG   = getArg('--ntee');    // single NTEE code override
const LIMIT      = parseInt(getArg('--limit') || '40', 10);
const DRY_RUN    = hasFlag('--dry-run');
const MIN_ASSETS = parseInt(getArg('--min-assets') || '5000000', 10); // $5M default

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().slice(0, 10);

// ── Target states ─────────────────────────────────────────────
// Default: top 8 HNW philanthropy markets if no state specified
const DEFAULT_STATES = ['TX', 'IL', 'FL', 'NY', 'CA', 'MN', 'AZ', 'CO'];

function getTargetStates() {
  if (STATE_ARG)  return [STATE_ARG.toUpperCase()];
  if (STATES_ARG) return STATES_ARG.split(',').map(s => s.trim().toUpperCase());
  return DEFAULT_STATES;
}

// ── NTEE category codes — highest board member AUM concentration ──
// Each category has different wealth signals
const NTEE_CATEGORIES = [
  { code: 'E', label: 'Health — Hospital Foundations' },
  { code: 'B', label: 'Education — University & School Foundations' },
  { code: 'A', label: 'Arts, Culture & Humanities — Museums, Symphony, Theatre' },
  { code: 'T', label: 'Philanthropy — Community Foundations' },
];

// ── HNW nonprofit search terms — produces highest-AUM boards ──
const SEARCH_QUERIES = [
  'symphony orchestra foundation',
  'hospital foundation',
  'university foundation',
  'art museum foundation',
  'community foundation',
  'medical center foundation',
  'children hospital foundation',
  'cancer center foundation',
  'performing arts foundation',
  'library foundation',
];

function getTargetQueries() {
  if (NTEE_ARG) {
    // If NTEE specified, still use broad query but filter post-fetch
    return SEARCH_QUERIES;
  }
  return SEARCH_QUERIES;
}

// ── AUM estimator by org asset size ──────────────────────────
function estimateAUM(totalAssets) {
  if (totalAssets >= 100_000_000) return { aum: '$5M+',    band: '5m+',    fitScore: 92, timing: 70 };
  if (totalAssets >= 25_000_000)  return { aum: '$3M–$8M', band: '1m-5m',  fitScore: 88, timing: 68 };
  if (totalAssets >= 10_000_000)  return { aum: '$2M–$5M', band: '1m-5m',  fitScore: 84, timing: 65 };
  return                                 { aum: '$1M–$3M', band: '1m-5m',  fitScore: 78, timing: 60 };
}

// ── AUM tier label ────────────────────────────────────────────
function assetTier(totalAssets) {
  if (totalAssets >= 100_000_000) return '$100M+';
  if (totalAssets >= 25_000_000)  return '$25M–$100M';
  if (totalAssets >= 10_000_000)  return '$10M–$25M';
  return '$5M–$10M';
}

// ── HTTP helper ───────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'AUM-Engine-Research/1.0 kosal@fin-tegration.com',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse error: ${e.message} | URL: ${url.slice(0,100)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Search ProPublica for orgs ────────────────────────────────
async function searchOrgs(state, query, page = 0) {
  const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(query)}&state[id]=${state}&c_code[id]=3&per_page=25&page=${page}`;
  return fetchJson(url);
}

// ── Is a valid HNW org category? (NTEE prefix check) ─────────
function isHNWCategory(nteeCode) {
  if (!nteeCode) return true; // include if no NTEE — check assets instead
  if (NTEE_ARG) return nteeCode.startsWith(NTEE_ARG.toUpperCase());
  // Default: allow E (Health), B (Education), A (Arts), T (Philanthropy), G (Disease), P (Human Services)
  return /^[EBAGTPU]/.test(nteeCode);
}

// ── Skip clearly non-target orgs by name ─────────────────────
const SKIP_PATTERNS = /church|parish|school district|public school|department of|city of|county of|state of|federal|government|united states/i;

// ── Fetch org detail (assets, filing info) ────────────────────
async function fetchOrgDetail(ein) {
  const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
  return fetchJson(url);
}

// ── Build lead from org ───────────────────────────────────────
function buildOrgLead(org, orgDetail, nteeLabel) {
  const orgData   = orgDetail.organization || {};
  const filings   = orgDetail.filings_with_data || [];
  const latestFiling = filings[0] || {};

  // Use filing data for asset amount if available (more accurate than search result)
  const totalAssets = Number(latestFiling.totassetsend) || Number(orgData.asset_amount) || 0;
  const revenue     = Number(latestFiling.totrevenue)   || Number(orgData.income_amount) || 0;
  const filingYear  = latestFiling.tax_prd_yr || '';

  if (totalAssets < MIN_ASSETS) return null; // Below threshold

  const { aum, band, fitScore, timing } = estimateAUM(totalAssets);

  const ein      = orgData.ein || org.ein;
  const einStr   = orgData.strein || org.strein || String(ein);
  const orgName  = orgData.name || org.name || '';
  const city     = orgData.city || org.city || '';
  const state    = orgData.state || org.state || '';

  const sourceUrl = `https://projects.propublica.org/nonprofits/organizations/${ein}`;
  const pdfNote  = filings.length > 0
    ? `Open ${sourceUrl} → click ${filingYear} Form 990 → Part VII for board member names`
    : `Open ${sourceUrl} → find most recent 990 filing → Part VII Section A`;

  // Build NTEE category label
  const nteeCode  = orgData.ntee_code || org.ntee_code || '';
  const category  = nteeLabel || nteeCode;

  // Outreach angle by NTEE
  let outreachAngle = 'DAF strategy + charitable trust — align giving with personal wealth';
  if (nteeCode.startsWith('E')) outreachAngle = 'Healthcare philanthropy + personal estate alignment — hospital foundation donors are ideal DAF candidates';
  if (nteeCode.startsWith('B')) outreachAngle = 'Education giving + 529 legacy planning — university board members often have generational wealth complexity';
  if (nteeCode.startsWith('A')) outreachAngle = 'Arts patronage + charitable annuity strategy — arts board donors are sophisticated givers with estate planning gaps';
  if (nteeCode.startsWith('T')) outreachAngle = 'Community foundation board members are the most philanthropically sophisticated — DAF + impact investing angle';

  return {
    // Name fields — empty until board member names extracted from 990
    firstName:    '',
    lastName:     '',
    fullName:     '',
    title:        `Board Trustee / Director — ${orgName}`,
    company:      orgName,
    entityType:   'unknown', // Individual names not yet resolved

    // Location from org
    city,
    state,

    // Niche
    niche:    'Charity Boards',
    nicheId:  'charity-boards',

    // AUM
    estimatedAUM:  aum,
    aumBand:       band,
    fitScore,
    timingScore:   timing,

    // Org details
    orgName,
    orgEIN:        einStr,
    orgAssets:     totalAssets,
    orgAssetTier:  assetTier(totalAssets),
    orgRevenue:    revenue,
    orgFilingYear: filingYear,
    orgCategory:   category,
    orgNTEE:       nteeCode,

    // Source
    source:    'IRS Form 990 — ProPublica Nonprofit Explorer',
    sourceUrl,
    externalId: einStr, // EIN as external ID

    // Signal arrays
    reasonCodes: [
      `Board member at ${orgName} (assets: ${assetTier(totalAssets)})`,
      `IRS 990 verified 501(c)(3) — ${filingYear || 'recent'} filing`,
      totalAssets >= 25_000_000 ? 'Major institution — board members are top-tier HNW' : 'Significant nonprofit — board members are HNW individuals',
    ],
    signals: [
      `Nonprofit assets: ${assetTier(totalAssets)}`,
      `NTEE: ${nteeCode} — ${category}`,
      'Board members carry $2M+ AUM minimum (give-or-get board requirement)',
      `Estate planning trigger: active philanthropist at major institution`,
    ],

    // Enrichment flags
    needsEnrichment:      true,
    needsNameResolution:  true, // CRITICAL — board member names must be extracted from 990 Part VII
    nameResolutionNote:   pdfNote,

    batchId: `alfred_batch_990_charity_boards_${TODAY}`,
  };
}

// ── Run one state + search query ──────────────────────────────
async function runStateQuery(state, query, leads, seen) {
  if (leads.length >= LIMIT) return;

  process.stdout.write(`  [990] ${state} / "${query}"… `);

  let result;
  try {
    result = await searchOrgs(state, query, 0);
  } catch(e) {
    console.log(`ERROR: ${e.message}`);
    return;
  }

  const orgs = result.organizations || [];
  console.log(`${orgs.length} orgs found`);

  for (const org of orgs) {
    if (leads.length >= LIMIT) break;

    const ein = String(org.ein);
    if (seen.has(ein)) continue;
    seen.add(ein);

    // Skip clearly non-target orgs by name
    if (SKIP_PATTERNS.test(org.name || '')) continue;

    // NTEE filter post-fetch
    if (!isHNWCategory(org.ntee_code)) continue;

    await sleep(300);

    let detail;
    try {
      detail = await fetchOrgDetail(ein);
    } catch(e) {
      continue;
    }

    // Find matching NTEE label
    const nteeMatch = NTEE_CATEGORIES.find(n => (org.ntee_code || '').startsWith(n.code));
    const nteeLabel = nteeMatch ? nteeMatch.label : (org.ntee_code || 'Nonprofit');

    const lead = buildOrgLead(org, detail, nteeLabel);
    if (!lead) continue; // Below asset threshold

    leads.push(lead);
    process.stdout.write(`    ✓ ${lead.orgName} (${lead.orgAssetTier})\n`);

    if (leads.length >= LIMIT) break;
  }
}


// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A6: IRS 990 Charity Board Miner ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const states  = getTargetStates();
  const queries  = getTargetQueries();

  console.log(`  States:     ${states.join(', ')}`);
  console.log(`  Queries:    ${queries.length} search terms`);
  console.log(`  Min assets: $${(MIN_ASSETS / 1_000_000).toFixed(0)}M+`);
  console.log(`  Limit:      ${LIMIT} orgs`);
  if (DRY_RUN) console.log('  DRY RUN — no file will be written');
  console.log('');
  console.log('  ⚠️  Output is org-level (needsNameResolution: true).');
  console.log('     Board member names must be extracted from 990 Part VII.');
  console.log('');

  const leads = [];
  const seen  = new Set();

  // Iterate states × search queries
  outerLoop:
  for (const state of states) {
    for (const query of queries) {
      if (leads.length >= LIMIT) break outerLoop;
      await runStateQuery(state, query, leads, seen);
      await sleep(300);
    }
  }

  console.log(`\n[990 Agent] ✅ ${leads.length} qualifying organizations found`);

  if (leads.length === 0) {
    console.warn('[990 Agent] ⚠️  No results. Try --min-assets 1000000 or expand --states.');
    process.exit(0);
  }

  // ── Summary ───────────────────────────────────────────────
  const byAsset = {
    '$100M+':    leads.filter(l => l.orgAssets >= 100_000_000).length,
    '$25M–$100M': leads.filter(l => l.orgAssets >= 25_000_000 && l.orgAssets < 100_000_000).length,
    '$10M–$25M': leads.filter(l => l.orgAssets >= 10_000_000 && l.orgAssets < 25_000_000).length,
    '$5M–$10M':  leads.filter(l => l.orgAssets >= MIN_ASSETS && l.orgAssets < 10_000_000).length,
  };

  console.log('\n── Asset Tier Distribution ──────────────────────────────');
  Object.entries(byAsset).forEach(([tier, count]) => {
    if (count > 0) console.log(`  ${tier}: ${count} orgs`);
  });

  console.log('\n── Sample Orgs ──────────────────────────────────────────');
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.orgName}`);
    console.log(`     ${l.city}, ${l.state} | Assets: ${l.orgAssetTier} | NTEE: ${l.orgNTEE}`);
    console.log(`     Verify: ${l.sourceUrl}`);
    console.log(`     ⚠️  Board names: ${l.nameResolutionNote.slice(0, 80)}...`);
  });

  // ── Dry run ───────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[990 Agent] DRY RUN — skipping file write. Sample lead:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // ── Write output ──────────────────────────────────────────
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const outputFile = path.join(STAGING_DIR, `alfred_batch_990_charity_boards_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[990 Agent] ✅ Raw batch written: ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log(`[990 Agent] 📂 Location: ${outputFile}`);

  console.log('\n── Next Steps ───────────────────────────────────────────');
  console.log('  ⚠️  IMPORTANT: These are org-level leads. Before scrubbing:');
  console.log('     1. Open each sourceUrl');
  console.log('     2. Click the latest Form 990 PDF link');
  console.log('     3. Find Part VII Section A (Officers, Directors, Trustees)');
  console.log('     4. Extract the names → update firstName/lastName on each lead');
  console.log('     5. Duplicate the lead for each board member at that org');
  console.log('');
  console.log(`  After name resolution:`);
  console.log(`  - Scrub:  node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  - Review: node scripts/scrub_leads.js --file ${outputFile} --review-only`);
  console.log(`  - Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>`);
  console.log('');
}

main().catch(err => {
  console.error('[990 Agent] FATAL:', err.message);
  process.exit(1);
});
