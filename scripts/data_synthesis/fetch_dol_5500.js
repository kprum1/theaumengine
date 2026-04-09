// ======================================================================
// AUM ENGINE — DOL Form 5500 Scraper
// scripts/data_synthesis/fetch_dol_5500.js
//
// Source: US Dept of Labor EFAST2 public API (free, federal, no auth)
// API:    https://efts.dol.gov/LATEST/search-index
//
// What this pulls:
//   - Companies with 401k plans over $X million in assets
//   - Returns: plan sponsor name, trustee, total assets, filing year
//   - Niche: business-owners (the plan sponsor = business owner)
//
// Why this works:
//   Every company with a 401k must file Form 5500 with the DOL.
//   We filter for plans with $5M+ in assets — the sponsor is a business
//   owner who has serious retirement assets and is likely advisor-less.
//
// Usage:
//   node scripts/data_synthesis/fetch_dol_5500.js [--min-assets=5000000] [--state=MN] [--limit=50]
//   Output → scripts/incoming/dol5500_[state]_[date].json
// ======================================================================

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// ── CLI args ──────────────────────────────────────────────────
const stateArg    = process.argv.find(a => a.startsWith('--state='));
const minArg      = process.argv.find(a => a.startsWith('--min-assets='));
const limitArg    = process.argv.find(a => a.startsWith('--limit='));
const STATE       = stateArg    ? stateArg.replace('--state=', '').toUpperCase() : 'MN';
const MIN_ASSETS  = minArg      ? parseInt(minArg.replace('--min-assets=', ''))  : 5000000;
const LIMIT       = limitArg    ? parseInt(limitArg.replace('--limit=', ''))     : 50;
const DATE        = new Date().toISOString().slice(0, 10);
const OUTFILE     = path.join(__dirname, '..', 'incoming', `dol5500_${STATE.toLowerCase()}_${DATE}.json`);

// ── DOL EFAST2 API ────────────────────────────────────────────
// Public API — no auth required. Respectful rate limiting built in.
const BASE_URL = 'https://efts.dol.gov/LATEST/search-index';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AUM-Engine-Research/1.0' } }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error(`JSON parse error from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Map DOL record → AUM Engine lead format ────────────────────
function dolToLead(record) {
  const sponsor = record.plan_name || '';
  const trustee = record.spons_dfe_mail_us_state || '';

  // Extract company name from plan name (e.g., "THORNTON HOLDINGS 401K" → "Thornton Holdings")
  const companyRaw = sponsor
    .replace(/\b(401K|401\(K\)|PROFIT SHARING|PENSION|RETIREMENT|PLAN|TRUST|GROUP)\b/gi, '')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();

  const assets = parseInt(record.tot_assets_boy_eoy_cd) || 0;
  const participants = parseInt(record.tot_act_partcp_cnt) || 0;
  const planYear = record.plan_year_begin_date?.slice(0, 4) || new Date().getFullYear() - 1;

  // Estimate AUM signal: 401k assets + typical personal wealth multiple
  const aumEstimate = assets > 0 ? `$${(assets / 1000000).toFixed(1)}M (401k)` : 'Unknown';

  // Fit score: bigger plan = higher fit
  const fitScore = assets >= 10000000 ? 90 :
                   assets >= 5000000  ? 82 :
                   assets >= 2000000  ? 74 : 65;

  // Timing: recent filing = higher timing
  const planYearInt = parseInt(planYear);
  const timingScore = planYearInt >= new Date().getFullYear() - 1 ? 80 : 68;

  return {
    firstName:    'Plan Sponsor',        // DOL doesn't give individual names — needs identity resolution
    lastName:     companyRaw || 'Unknown',
    title:        'Plan Trustee / Business Owner',
    company:      companyRaw,
    city:         record.spons_dfe_cty_txt || '',
    state:        record.spons_dfe_mail_us_state || STATE,
    niche:        'Business Owners',
    fitScore,
    timingScore,
    estimatedAUM: aumEstimate,
    reasonCodes: [
      `DOL 5500 filer — ${aumEstimate} in 401k assets`,
      `${participants} plan participants`,
      `Plan year: ${planYear}`,
      'Business owner with established retirement plan'
    ],
    signals: {
      plan401kAssets:   aumEstimate,
      participants:     String(participants),
      planYear:         String(planYear),
      planName:         sponsor,
      nextEvent:        'Annual 5500 filing window — succession planning gap likely',
      estimatedAssets:  aumEstimate,
    },
    source:       'DOL Form 5500',
    _needsIdentityResolution: true,  // Flag for Alfred to cross-ref LinkedIn/county records
    _dolEin:      record.spons_dfe_ein || '',
    _dolPlanNum:  record.plan_num || '',
  };
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('\n📊 DOL Form 5500 Scraper');
  console.log(`   State: ${STATE} | Min assets: $${MIN_ASSETS.toLocaleString()} | Limit: ${LIMIT}`);
  console.log(`   Source: DOL EFAST2 public API\n`);

  const params = new URLSearchParams({
    q:        `"${STATE}"`,
    'hits.hits._source': [
      'plan_name', 'spons_dfe_mail_us_state', 'spons_dfe_cty_txt',
      'spons_dfe_ein', 'plan_num', 'tot_assets_boy_eoy_cd',
      'tot_act_partcp_cnt', 'plan_year_begin_date'
    ].join(','),
    from:     0,
    size:     Math.min(LIMIT * 3, 200),  // fetch more, filter down
  });

  const url = `${BASE_URL}?${params.toString()}`;
  console.log(`   Fetching: ${BASE_URL}...`);

  let data;
  try {
    data = await fetch(url);
  } catch(e) {
    console.error(`❌ DOL API error: ${e.message}`);
    console.error('   The DOL API may be temporarily unavailable. Try again later.');
    process.exit(1);
  }

  const hits = data?.hits?.hits || [];
  console.log(`   Raw results: ${hits.length}`);

  // Filter by state and minimum assets
  const filtered = hits
    .map(h => h._source || h)
    .filter(r => {
      const s = (r.spons_dfe_mail_us_state || '').toUpperCase();
      const assets = parseInt(r.tot_assets_boy_eoy_cd) || 0;
      return s === STATE && assets >= MIN_ASSETS;
    })
    .slice(0, LIMIT);

  console.log(`   After filter (${STATE}, $${MIN_ASSETS.toLocaleString()}+): ${filtered.length} plans\n`);

  if (filtered.length === 0) {
    console.log('⚠️  No results matched filters. Try:');
    console.log(`   --state=TX --min-assets=2000000`);
    process.exit(0);
  }

  const leads = filtered.map(dolToLead);

  // ── Write to incoming/ ─────────────────────────────────────
  fs.writeFileSync(OUTFILE, JSON.stringify(leads, null, 2));

  console.log(`✅ ${leads.length} DOL 5500 leads written to:`);
  console.log(`   ${OUTFILE}`);
  console.log('\n⚠️  NOTE: These leads need identity resolution before outreach.');
  console.log('   _needsIdentityResolution: true is flagged on each record.');
  console.log('   Alfred should cross-reference EIN → LinkedIn → county records.\n');
  console.log('Next step: node scripts/review_alfred_leads.js\n');
}

main().catch(err => {
  console.error('❌ DOL 5500 scraper failed:', err.message);
  process.exit(1);
});
