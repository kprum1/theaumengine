#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A16: OpenFEC Political Donor Miner
// scripts/agent_fec_miner.js
//
// Data source: FEC EDGAR Schedule A — Itemized Receipts
// API: https://api.open.fec.gov/v1/schedules/schedule_a/
// Key: DEMO_KEY (free, 1,000 req/day) or register at api.data.gov
//
// Why this source:
//   Federal law (52 U.S.C. § 30104) requires disclosure of EVERY
//   individual who contributes $200+ to a federal campaign or PAC.
//   Anyone who writes a $10,000+ check to a political committee has:
//   (1) verified liquid assets well above our AUM threshold
//   (2) demonstrated willingness to write large checks
//   (3) a publicly documented identity, employer, and occupation
//
//   This is a CLEAN, LEGAL, NAMED lead source — no scraping, no gray areas.
//
// What it produces:
//   - Individual MN donors, $10K+ per contribution
//   - Fields: name, city, state, employer, occupation, amount
//   - Niche: 'Business Owners', 'C-Suite Executives', or 'HENRYs'
//     based on occupation signals
//
// Usage:
//   node scripts/agent_fec_miner.js                     # MN, 2024 cycle, $10K+
//   node scripts/agent_fec_miner.js --min-amount 50000  # $50K+ only
//   node scripts/agent_fec_miner.js --cycle 2022        # Previous cycle
//   node scripts/agent_fec_miner.js --state MN          # Default
//   node scripts/agent_fec_miner.js --limit 100
//   node scripts/agent_fec_miner.js --dry-run
//   node scripts/agent_fec_miner.js --api-key YOUR_KEY  # Override DEMO_KEY
//
// Register free API key: https://api.data.gov/signup/
// Default DEMO_KEY: 1,000 requests/hour, sufficient for daily ops
//
// Output: scripts/staging/raw/alfred_batch_fec_{state}_{date}.raw.json
// ============================================================

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag   = (f) => args.includes(f);
const MIN_AMT   = parseInt(getArg('--min-amount') || '10000', 10);
const LIMIT     = parseInt(getArg('--limit')      || '150',   10);
const CYCLE     = getArg('--cycle') || '2024';
const STATE_ARG = (getArg('--state') || 'MN').toUpperCase();
const API_KEY   = getArg('--api-key') || 'DEMO_KEY';
const DRY_RUN   = hasFlag('--dry-run');

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().split('T')[0];

// ── Occupation → niche mapping ────────────────────────────────
// FEC stores free-text occupation — map common patterns to niches
const OCCUPATION_NICHE_MAP = [
  // C-Suite / Executive
  { pattern: /\b(CEO|CHIEF EXECUTIVE|PRESIDENT|CHAIRMAN|MANAGING DIRECTOR|EXECUTIVE VICE)\b/i,
    niche: 'C-Suite Executives', nicheId: 'c-suite-executives' },
  // Business owners
  { pattern: /\b(OWNER|BUSINESS OWNER|SELF.?EMPLOYED|ENTREPRENEUR|FOUNDER|CO-FOUNDER|PROPRIETOR)\b/i,
    niche: 'Business Owners', nicheId: 'business-owners' },
  // Attorneys
  { pattern: /\b(ATTORNEY|LAWYER|PARTNER|COUNSEL|SOLICITOR)\b/i,
    niche: 'Law Partners', nicheId: 'law-partners' },
  // Physicians
  { pattern: /\b(PHYSICIAN|DOCTOR|MD|SURGEON|CARDIOLOGIST|RADIOLOGIST|ANESTHESIOLOGIST|NEUROSURGEON)\b/i,
    niche: 'Physicians & Surgeons', nicheId: 'physicians' },
  // Real Estate
  { pattern: /\b(REAL ESTATE|DEVELOPER|PROPERTY|LANDLORD)\b/i,
    niche: 'Real Estate Developers', nicheId: 're-developers' },
  // Finance/Investor
  { pattern: /\b(INVESTOR|INVESTMENT|PORTFOLIO|FUND|VENTURE|PRIVATE EQUITY|HEDGE)\b/i,
    niche: 'C-Suite Executives', nicheId: 'c-suite-executives' },
  // Aircraft owners (pilot)
  { pattern: /\b(PILOT|AVIATOR)\b/i,
    niche: 'Aircraft Owners', nicheId: 'aircraft-owners' },
];

const DEFAULT_NICHE    = 'C-Suite Executives';
const DEFAULT_NICHE_ID = 'c-suite-executives';

function resolveNiche(occupation) {
  if (!occupation) return { niche: DEFAULT_NICHE, nicheId: DEFAULT_NICHE_ID };
  for (const { pattern, niche, nicheId } of OCCUPATION_NICHE_MAP) {
    if (pattern.test(occupation)) return { niche, nicheId };
  }
  return { niche: DEFAULT_NICHE, nicheId: DEFAULT_NICHE_ID };
}

// ── AUM estimation from contribution amount ───────────────────
// Contribution size → proxy for liquid wealth
function aumEstimate(amount) {
  if (amount >= 1000000) return { aum: '$20M+',    band: '5m+',   fitScore: 97, timing: 82 };
  if (amount >=  500000) return { aum: '$10M–$30M', band: '5m+',  fitScore: 95, timing: 80 };
  if (amount >=  100000) return { aum: '$5M–$15M',  band: '5m+',  fitScore: 92, timing: 76 };
  if (amount >=   50000) return { aum: '$3M–$10M',  band: '1m-5m', fitScore: 88, timing: 73 };
  if (amount >=   25000) return { aum: '$2M–$7M',   band: '1m-5m', fitScore: 84, timing: 70 };
  return                        { aum: '$1M–$4M',   band: '1m-5m', fitScore: 78, timing: 66 };
}

// ── HTTP helper ───────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'AUM-Engine-Research/1.0 kosal@fin-tegration.com',
        'Accept':     'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse: ${e.message} | ${url.slice(0, 80)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _title(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Deduplicate on name+zip — FEC logs multiple transactions per donor ──
// We want UNIQUE individuals, not unique transactions.
// We keep the LARGEST single contribution per person.
function deduplicateDonors(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.contributor_last_name}|${r.contributor_first_name}|${r.contributor_zip?.slice(0,5)}`;
    if (!byKey.has(key)) {
      byKey.set(key, r);
    } else {
      // Keep highest single-transaction amount
      if ((r.contribution_receipt_amount || 0) > (byKey.get(key).contribution_receipt_amount || 0)) {
        byKey.set(key, r);
      }
    }
  }
  return [...byKey.values()];
}

// ── Main fetch + paginate ─────────────────────────────────────
async function fetchDonors() {
  const leads = [];
  const rawRecords = [];
  let page = 1;
  let lastIndexes = null;

  const perPage = Math.min(100, LIMIT * 2); // Fetch extra to account for dedup

  console.log(`\n[FEC] Fetching MN individual donors ≥ $${MIN_AMT.toLocaleString()} — cycle ${CYCLE}…`);

  while (rawRecords.length < LIMIT * 3 && page <= 15) {
    // Build URL — FEC API uses cursor-based pagination
    let url = `https://api.open.fec.gov/v1/schedules/schedule_a/`
      + `?api_key=${API_KEY}`
      + `&contributor_state=${STATE_ARG}`
      + `&min_amount=${MIN_AMT}`
      + `&is_individual=true`
      + `&sort=-contribution_receipt_amount`
      + `&per_page=${perPage}`
      + `&two_year_transaction_period=${CYCLE}`;

    if (lastIndexes) {
      url += `&last_contribution_receipt_amount=${lastIndexes.last_contribution_receipt_amount}`;
      url += `&last_index=${lastIndexes.last_index}`;
    }

    let result;
    try {
      result = await fetchJson(url);
    } catch(e) {
      console.log(`  [FEC] ERROR page ${page}: ${e.message}`);
      break;
    }

    if (result.error) {
      console.log(`  [FEC] API error: ${JSON.stringify(result.error)}`);
      break;
    }

    // Rate limit warning
    if (result.api_version === '1.0' && result.pagination?.count === 0) {
      console.log('  [FEC] No results — check API key or parameters');
      break;
    }

    const results = result.results || [];
    if (results.length === 0) break;

    // Filter: must have first AND last name (some records are companies with is_individual flag)
    const valid = results.filter(r =>
      r.contributor_first_name && r.contributor_last_name &&
      r.contributor_first_name.trim() && r.contributor_last_name.trim()
    );

    rawRecords.push(...valid);
    console.log(`  [FEC] Page ${page}: ${results.length} results → ${valid.length} named individuals (total raw: ${rawRecords.length})`);

    lastIndexes = result.pagination?.last_indexes;
    if (!lastIndexes || results.length < perPage) break;

    page++;
    await sleep(350);  // Be polite to the FEC API
  }

  // Deduplicate — keep one record per person (largest contribution)
  const unique = deduplicateDonors(rawRecords);
  console.log(`  [FEC] After dedup: ${unique.length} unique donors`);

  // Build lead records
  for (const r of unique) {
    if (leads.length >= LIMIT) break;

    const firstName  = _title(r.contributor_first_name || '');
    const lastName   = _title(r.contributor_last_name  || '');
    if (!firstName || !lastName) continue;

    const city       = _title(r.contributor_city   || '');
    const state      = r.contributor_state || STATE_ARG;
    const zip        = (r.contributor_zip  || '').slice(0, 5);
    const employer   = _title(r.contributor_employer    || '');
    const occupation = _title(r.contributor_occupation  || '');
    const amount     = r.contribution_receipt_amount || 0;
    const ytdAmount  = r.contributor_aggregate_ytd   || amount;
    const contribDate = r.contribution_receipt_date   || '';

    const scoring  = aumEstimate(amount);
    const { niche, nicheId } = resolveNiche(r.contributor_occupation);

    const fecUrl   = r.pdf_url
      || `https://www.fec.gov/data/receipts/?contributor_name=${encodeURIComponent(`${lastName},${firstName}`)}&contributor_state=${state}`;
    const verifyUrl = `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(r.contributor_name || `${lastName}, ${firstName}`)}&contributor_state=${state}&two_year_transaction_period=${CYCLE}`;

    // Outreach angle
    let outreachAngle;
    if (amount >= 500000) {
      outreachAngle = `Ultra-high donor ($${(amount/1000000).toFixed(1)}M gift) — estate planning, philanthropic structuring, and asset protection strategy`;
    } else if (nicheId === 'business-owners') {
      outreachAngle = `Business owner with $${Math.round(amount/1000)}K+ in discretionary capital — business succession + personal wealth planning`;
    } else if (nicheId === 'law-partners') {
      outreachAngle = `Law partner — equity partner income, malpractice exposure, and retirement gap planning`;
    } else {
      outreachAngle = `High-capacity political donor ($${Math.round(amount/1000)}K) — verified liquid capital and willingness to write large checks`;
    }

    leads.push({
      firstName,
      lastName,
      title:        occupation ? `${occupation}${employer ? ` at ${employer}` : ''}` : 'Political Donor — high-capacity individual',
      company:      employer || '',
      city,
      state,
      zip,
      niche,
      nicheId,
      estimatedAUM: scoring.aum,
      aumBand:      scoring.band,
      fitScore:     scoring.fitScore,
      timingScore:  scoring.timing,
      source:       'FEC Schedule A — Itemized Individual Receipts',
      sourceUrl:    verifyUrl,
      needsEnrichment: true,   // No phone/email — needs enrichment
      batchId:      `alfred_batch_fec_${TODAY}`,
      fecAmount:    amount,
      fecAmountYTD: ytdAmount,
      fecCycle:     CYCLE,
      fecDate:      contribDate,
      fecFilingUrl: fecUrl,
      reasonCodes: [
        `FEC-disclosed political donor — $${amount.toLocaleString()} contribution in ${CYCLE} cycle`,
        occupation ? `Occupation: ${occupation}${employer ? ` at ${employer}` : ''}` : 'Occupation: not disclosed',
        outreachAngle,
      ],
      signals: {
        estimatedAssets:  scoring.aum,
        fecContribution:  `$${amount.toLocaleString()}`,
        ytdContributions: `$${ytdAmount.toLocaleString()}`,
        employer,
        occupation,
        relationship:     'None — cold (FEC public disclosure)',
        nextEvent:        'Ongoing — liquid wealth demonstrated via political giving pattern',
        outreachAngle,
        fecCycle:         CYCLE,
        fecDate:          contribDate,
        verifyUrl,
        researchNote:     `Verify at: ${verifyUrl}`,
        urgency:          amount >= 100000 ? 'HIGH — $100K+ donor' : 'STANDARD',
      },
    });
  }

  return leads;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A16: OpenFEC Political Donor Miner      ║');
  console.log('║  Legal · Named · Employer · Occupation — FEC public record  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  if (DRY_RUN)    console.log('[FEC] DRY RUN — no file will be written');
  if (API_KEY === 'DEMO_KEY') {
    console.log('[FEC] Using DEMO_KEY (1,000 req/hour). Register free key at https://api.data.gov/signup/');
  }
  console.log(`[FEC] State: ${STATE_ARG} | Cycle: ${CYCLE} | Min amount: $${MIN_AMT.toLocaleString()} | Limit: ${LIMIT}`);

  const leads = await fetchDonors();

  console.log(`\n[FEC] ✅ Total unique donor leads: ${leads.length}`);

  if (leads.length === 0) {
    console.log('[FEC] No leads produced. Try --min-amount 5000 or --cycle 2022.');
    return;
  }

  // Summary
  const avgAmt  = Math.round(leads.reduce((s, l) => s + (l.fecAmount || 0), 0) / leads.length);
  const topAmt  = Math.max(...leads.map(l => l.fecAmount || 0));
  const highCap = leads.filter(l => (l.fecAmount || 0) >= 100000).length;
  const niches  = [...new Set(leads.map(l => l.nicheId))];

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`  Avg contribution: $${avgAmt.toLocaleString()}`);
  console.log(`  Top contribution: $${topAmt.toLocaleString()}`);
  console.log(`  High-cap donors ($100K+): ${highCap}`);
  console.log(`  Niches: ${niches.join(', ')}`);

  // Preview top 5
  console.log('\n── Sample leads ────────────────────────────────────');
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i+1}. ${l.firstName} ${l.lastName} — ${l.city}, ${l.state}`);
    console.log(`     Employer: ${l.company || 'Not disclosed'} | Occ: ${l.signals.occupation || 'N/A'}`);
    console.log(`     Contribution: $${(l.fecAmount||0).toLocaleString()} (YTD: $${(l.fecAmountYTD||0).toLocaleString()})`);
    console.log(`     AUM est: ${l.estimatedAUM} | Niche: ${l.niche} | Timing: ${l.timingScore}`);
  });

  if (DRY_RUN) {
    console.log('\n[FEC] DRY RUN — skipping file write.');
    console.log('\nFull sample lead JSON:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // Write output
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
  const stateSlug  = STATE_ARG.toLowerCase();
  const outputFile = path.join(STAGING_DIR, `alfred_batch_fec_${stateSlug}_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[FEC] ✅ Raw batch → ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log(`  1. Scrub:    node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  2. Ingest:   node scripts/lead_ingest_agent.js --file <scrubbed>`);
  console.log(`  3. Route:    node scripts/trigger_routing.js`);
  console.log(`  4. KPI sync: node scripts/write_pipeline_meta.js`);
  console.log('\n── API key upgrade ─────────────────────────────────');
  console.log('  DEMO_KEY: 1,000 req/hour (sufficient for daily ops)');
  console.log('  Free registered key: 1,000 req/hour + higher reliability');
  console.log('  Register: https://api.data.gov/signup/');
  console.log('\n── Run cadence ─────────────────────────────────────');
  console.log('  FEC data updates daily. Run after each major filing deadline:');
  console.log('  Q1/Q2/Q3/Y-E reports → Jan 31, Apr 15, Jul 15, Oct 15');
  console.log('  node scripts/agent_fec_miner.js --min-amount 25000  # Premium filter');
}

main().catch(err => {
  console.error('[FEC] FATAL:', err.message);
  process.exit(1);
});
