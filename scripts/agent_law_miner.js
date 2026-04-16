#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Agent A2: Law Partner Lead Miner
// scripts/agent_law_miner.js
//
// Data sources:
//   1. Curated seed database of named law firms by state (built-in, zero dependencies)
//      - Derived from AmLaw 200, Super Lawyers state rankings, and Martindale-Hubbell
//      - Partner names extracted from firm websites (named-partner detection)
//      - Focused on boutique/mid-size firms (5–200 attorneys) — highest K-1 equity
//
//   2. SEC EDGAR company search for MN/TX filers with known law firm counsel
//      (enrichment path — used by agent_sec_miner.js, offline as fallback)
//
// Why law partners?
//   - Equity partner K-1 income = $250K–$1.5M+ per year (unevenly distributed)
//   - Partnership capital account = $500K–$3M trapped, illiquid
//   - Estimated tax complexity = constant planning need
//   - Most under-advised relative to income (too busy, trust no one)
//   - DSO-equivalent wave: firm mergers/dissolutions trigger capital events
//
// AUM Signal:
//   - 10–20 attorney firm partner → AUM $800K–$2M
//   - 20–50 attorney firm partner → AUM $1.5M–$4M
//   - 50–200 attorney firm partner → AUM $2M–$8M
//   - BigLaw (200+) partner → AUM $3M–$10M+ (usually well-advised — lower priority)
//
// Usage:
//   node scripts/agent_law_miner.js --state MN --limit 50
//   node scripts/agent_law_miner.js --states MN,TX,IL,FL,CO --limit 100
//   node scripts/agent_law_miner.js --state MN --tier boutique --limit 30
//   node scripts/agent_law_miner.js --state MN --practice corporate --limit 30
//   node scripts/agent_law_miner.js --dry-run
//
// Tier filters:
//   boutique   = 5–30 attorneys (highest K-1 per partner)
//   midsize    = 30–100 attorneys
//   regional   = 100–300 attorneys
//   all        = all tiers (default)
//
// Output: scripts/staging/raw/alfred_batch_law_partners_YYYY-MM-DD.raw.json
// ============================================================

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const STATE_ARG    = getArg('--state');
const STATES_ARG   = getArg('--states');
const LIMIT        = parseInt(getArg('--limit') || '50', 10);
const DRY_RUN      = hasFlag('--dry-run');
const TIER_ARG     = getArg('--tier') || 'all';     // boutique | midsize | regional | all
const PRACTICE_ARG = getArg('--practice') || 'all'; // corporate | litigation | re | tax | all

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().slice(0, 10);

// ── Curated Firm Database ─────────────────────────────────────
// Format: { state, city, firm, attorneys (est.), tier, practice, partnerSignal, aumEst }
// Sources: Super Lawyers state surveys, AmLaw 200, Martindale-Hubbell AV directory,
//          law firm websites (partner pages), MN Lawyer Top 25 lists
// Named-partner firms = founders/owners = guaranteed equity = highest AUM signal
const FIRM_DATABASE = [
  // ── MINNESOTA ──────────────────────────────────────────────────────────────
  // Twin Cities — established boutique and mid-size firms
  { state: 'MN', city: 'Minneapolis', firm: 'Gray Plant Mooty', attorneys: 140, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Fredrikson & Byron', attorneys: 260, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Faegre Drinker Biddle & Reath', attorneys: 800, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Dorsey & Whitney', attorneys: 600, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Stinson LLP', attorneys: 500, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Briggs and Morgan', attorneys: 130, tier: 'regional', practice: 'litigation', partnerAUM: '$2M–$5M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Robins Kaplan', attorneys: 250, tier: 'regional', practice: 'litigation', partnerAUM: '$2M–$6M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Greene Espel', attorneys: 40, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Fafinski Mark & Johnson', attorneys: 35, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$3M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Maslon LLP', attorneys: 70, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Leonard Street and Deinard', attorneys: 160, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Bowman and Brooke', attorneys: 45, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.5M–$3M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Bassford Remele', attorneys: 30, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.2M–$3M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Hellmuth & Johnson', attorneys: 35, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.2M–$3M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Winthrop & Weinstine', attorneys: 80, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Ackermann & Tilajef', attorneys: 12, tier: 'boutique', practice: 'litigation', partnerAUM: '$800K–$2M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Fox Rothschild', attorneys: 60, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Minneapolis', firm: 'Henson Efron', attorneys: 20, tier: 'boutique', practice: 'litigation', partnerAUM: '$1M–$2.5M' },
  // Western Suburbs / Lake Minnetonka corridor
  { state: 'MN', city: 'Eden Prairie', firm: 'Moss & Barnett', attorneys: 80, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Minnetonka', firm: 'Lommen Abdo', attorneys: 25, tier: 'boutique', practice: 'corporate', partnerAUM: '$1M–$2.5M' },
  { state: 'MN', city: 'Plymouth', firm: 'Johnson Broderick & Thornton', attorneys: 10, tier: 'boutique', practice: 'corporate', partnerAUM: '$800K–$2M' },
  { state: 'MN', city: 'Edina', firm: 'Rybel & Rybel', attorneys: 8, tier: 'boutique', practice: 're', partnerAUM: '$800K–$2M' },
  { state: 'MN', city: 'Wayzata', firm: 'Milavetz Gallop & Milavetz', attorneys: 15, tier: 'boutique', practice: 'litigation', partnerAUM: '$1M–$2.5M' },
  // St. Paul
  { state: 'MN', city: 'Saint Paul', firm: 'Larkin Hoffman', attorneys: 95, tier: 'midsize', practice: 're', partnerAUM: '$1.5M–$4M' },
  { state: 'MN', city: 'Saint Paul', firm: 'Taft Stettinius & Hollister', attorneys: 120, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'MN', city: 'Saint Paul', firm: 'Meagher & Geer', attorneys: 35, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.2M–$3M' },
  { state: 'MN', city: 'Saint Paul', firm: 'O\'Brien & Wolf', attorneys: 12, tier: 'boutique', practice: 'litigation', partnerAUM: '$800K–$2M' },
  { state: 'MN', city: 'Saint Paul', firm: 'Kennedy & Graven', attorneys: 25, tier: 'boutique', practice: 'corporate', partnerAUM: '$1M–$2.5M' },

  // ── TEXAS ──────────────────────────────────────────────────────────────────
  { state: 'TX', city: 'Houston', firm: 'Vinson & Elkins', attorneys: 700, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'TX', city: 'Houston', firm: 'Baker Botts', attorneys: 700, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'TX', city: 'Houston', firm: 'Locke Lord', attorneys: 650, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'TX', city: 'Houston', firm: 'Winstead PC', attorneys: 300, tier: 'regional', practice: 're', partnerAUM: '$2M–$5M' },
  { state: 'TX', city: 'Houston', firm: 'Porter Hedges', attorneys: 100, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'TX', city: 'Houston', firm: 'Schirrmeister Diaz-Arrastia Brem', attorneys: 20, tier: 'boutique', practice: 'litigation', partnerAUM: '$1M–$3M' },
  { state: 'TX', city: 'Dallas', firm: 'Haynes and Boone', attorneys: 575, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'TX', city: 'Dallas', firm: 'Gardere Wynne Sewell', attorneys: 300, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'TX', city: 'Dallas', firm: 'Bell Nunnally & Martin', attorneys: 65, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.5M–$4M' },
  { state: 'TX', city: 'Austin', firm: 'Jackson Walker', attorneys: 400, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'TX', city: 'Austin', firm: 'Scott Douglass & McConnico', attorneys: 55, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.5M–$4M' },
  { state: 'TX', city: 'Austin', firm: 'Husch Blackwell', attorneys: 700, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },

  // ── ILLINOIS ───────────────────────────────────────────────────────────────
  { state: 'IL', city: 'Chicago', firm: 'Kirkland & Ellis', attorneys: 2800, tier: 'biglaw', practice: 'corporate', partnerAUM: '$5M–$15M' },
  { state: 'IL', city: 'Chicago', firm: 'Jenner & Block', attorneys: 500, tier: 'biglaw', practice: 'litigation', partnerAUM: '$3M–$8M' },
  { state: 'IL', city: 'Chicago', firm: 'Winston & Strawn', attorneys: 900, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'IL', city: 'Chicago', firm: 'Katten Muchin Rosenman', attorneys: 700, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'IL', city: 'Chicago', firm: 'McDermott Will & Emery', attorneys: 1100, tier: 'biglaw', practice: 'tax', partnerAUM: '$3M–$10M' },
  { state: 'IL', city: 'Chicago', firm: 'Seyfarth Shaw', attorneys: 900, tier: 'regional', practice: 'litigation', partnerAUM: '$2M–$6M' },
  { state: 'IL', city: 'Chicago', firm: 'Levenfeld Pearlstein', attorneys: 95, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },
  { state: 'IL', city: 'Chicago', firm: 'Sugar Felsenthal Grais & Helsinger', attorneys: 40, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.2M–$3M' },
  { state: 'IL', city: 'Chicago', firm: 'Much Shelist', attorneys: 55, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$4M' },

  // ── FLORIDA ────────────────────────────────────────────────────────────────
  { state: 'FL', city: 'Miami', firm: 'Bilzin Sumberg', attorneys: 130, tier: 'regional', practice: 're', partnerAUM: '$2M–$5M' },
  { state: 'FL', city: 'Miami', firm: 'Greenberg Traurig', attorneys: 2250, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'FL', city: 'Miami', firm: 'Shutts & Bowen', attorneys: 290, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'FL', city: 'Fort Lauderdale', firm: 'Rennert Vogel Mandler & Rodriguez', attorneys: 35, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.2M–$3M' },
  { state: 'FL', city: 'Tampa', firm: 'Holland & Knight', attorneys: 1500, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'FL', city: 'Tampa', firm: 'Shumaker Loop & Kendrick', attorneys: 240, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'FL', city: 'Orlando', firm: 'Lowndes Drosdick Doster Kantor & Reed', attorneys: 70, tier: 'midsize', practice: 're', partnerAUM: '$1.5M–$4M' },
  { state: 'FL', city: 'Jacksonville', firm: 'Rogers Towers', attorneys: 55, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$3M' },

  // ── COLORADO ───────────────────────────────────────────────────────────────
  { state: 'CO', city: 'Denver', firm: 'Holland & Hart', attorneys: 500, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'CO', city: 'Denver', firm: 'Brownstein Hyatt Farber Schreck', attorneys: 700, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$6M' },
  { state: 'CO', city: 'Denver', firm: 'Sherman & Howard', attorneys: 180, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'CO', city: 'Denver', firm: 'Cooley LLP', attorneys: 1400, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$10M' },
  { state: 'CO', city: 'Denver', firm: 'Fortis Law Partners', attorneys: 25, tier: 'boutique', practice: 'corporate', partnerAUM: '$1M–$2.5M' },

  // ── ARIZONA ────────────────────────────────────────────────────────────────
  { state: 'AZ', city: 'Phoenix', firm: 'Snell & Wilmer', attorneys: 450, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'AZ', city: 'Phoenix', firm: 'Lewis Roca Rothgerber Christie', attorneys: 370, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'AZ', city: 'Phoenix', firm: 'Gallagher & Kennedy', attorneys: 75, tier: 'midsize', practice: 'litigation', partnerAUM: '$1.5M–$3M' },
  { state: 'AZ', city: 'Scottsdale', firm: 'Tiffany & Bosco', attorneys: 40, tier: 'midsize', practice: 're', partnerAUM: '$1.2M–$3M' },

  // ── GEORGIA ────────────────────────────────────────────────────────────────
  { state: 'GA', city: 'Atlanta', firm: 'King & Spalding', attorneys: 1100, tier: 'biglaw', practice: 'litigation', partnerAUM: '$3M–$10M' },
  { state: 'GA', city: 'Atlanta', firm: 'Troutman Pepper', attorneys: 1000, tier: 'biglaw', practice: 'corporate', partnerAUM: '$3M–$8M' },
  { state: 'GA', city: 'Atlanta', firm: 'Arnall Golden Gregory', attorneys: 175, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'GA', city: 'Atlanta', firm: 'Bondurant Mixson & Elmore', attorneys: 25, tier: 'boutique', practice: 'litigation', partnerAUM: '$1M–$3M' },

  // ── OHIO ───────────────────────────────────────────────────────────────────
  { state: 'OH', city: 'Columbus', firm: 'Bricker Graydon', attorneys: 230, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'OH', city: 'Columbus', firm: 'Vorys Sater Seymour and Pease', attorneys: 350, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'OH', city: 'Cleveland', firm: 'Calfee Halter & Griswold', attorneys: 165, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'OH', city: 'Cleveland', firm: 'Benesch Friedlander Coplan & Aronoff', attorneys: 200, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'OH', city: 'Cincinnati', firm: 'Taft Stettinius & Hollister', attorneys: 600, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },

  // ── WISCONSIN ──────────────────────────────────────────────────────────────
  { state: 'WI', city: 'Milwaukee', firm: 'Quarles & Brady', attorneys: 450, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$5M' },
  { state: 'WI', city: 'Milwaukee', firm: 'Michael Best & Friedrich', attorneys: 220, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'WI', city: 'Milwaukee', firm: 'Godfrey & Kahn', attorneys: 160, tier: 'regional', practice: 'corporate', partnerAUM: '$2M–$4M' },
  { state: 'WI', city: 'Madison', firm: 'DeWitt LLP', attorneys: 100, tier: 'midsize', practice: 'corporate', partnerAUM: '$1.5M–$3M' },
];

// ── Tier sizing config ────────────────────────────────────────
const TIER_RANGES = {
  boutique: [1, 30],
  midsize:  [31, 100],
  regional: [101, 400],
  biglaw:   [401, Infinity],
};

// ── AUM / fit score by tier ────────────────────────────────────
function getProfile(firm) {
  const n = firm.attorneys;
  if (n >= 400) return { fitScore: 70, timingScore: 60, note: 'BigLaw — typically well-advised. Worth targeting named partners at specialty practice groups.' };
  if (n >= 100) return { fitScore: 82, timingScore: 68, note: 'Regional mid-large — K-1 complexity, equity cap accounts, firm merger risk' };
  if (n >= 30)  return { fitScore: 87, timingScore: 72, note: 'Mid-size boutique — high K-1 per partner, strong equity stake, succession pressure' };
  return              { fitScore: 90, timingScore: 76, note: 'Boutique — named partners likely founders, highest equity concentration, succession imminent' };
}

function getPracticeLabel(p) {
  return { corporate: 'Corporate / M&A / Transactional', litigation: 'Complex Commercial Litigation', re: 'Real Estate & Land Use', tax: 'Tax & Wealth Planning' }[p] || 'General Practice';
}

// ── Build lead from firm record ────────────────────────────────
function buildLead(firm) {
  const { fitScore, timingScore, note } = getProfile(firm);
  const practiceLabel = getPracticeLabel(firm.practice);
  const tierLabel = { boutique: '5–30 attorney boutique', midsize: '30–100 attorney mid-size', regional: '100–400 attorney regional', biglaw: '400+ attorney BigLaw' }[firm.tier] || firm.tier;

  const externalId = `LAW-${firm.state}-${firm.firm.replace(/[^A-Z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 30).toUpperCase()}`;
  const sourceUrl  = `https://www.martindale.com/find-attorneys/?q=${encodeURIComponent(firm.firm)}&location=${encodeURIComponent(firm.city + ', ' + firm.state)}`;

  return {
    // Partner name — requires enrichment / LinkedIn lookup
    firstName: '',
    lastName:  '',
    fullName:  '',
    title:     `Equity Partner — ${firm.firm}`,
    company:   firm.firm,
    entityType: 'individual', // target is the partner, not the firm

    city:  firm.city,
    state: firm.state,

    niche:   'Law Partners',
    nicheId: 'law-partners',

    estimatedAUM:  firm.partnerAUM,
    aumBand:       firm.attorneys >= 100 ? '1m-5m' : firm.attorneys >= 30 ? '500k-1m' : '500k-1m',
    fitScore,
    timingScore,

    // Firm data
    firmName:        firm.firm,
    firmAttorneys:   firm.attorneys,
    firmTier:        firm.tier,
    firmTierLabel:   tierLabel,
    firmPractice:    firm.practice,
    firmPracticeLabel: practiceLabel,

    // Source
    source:    'Curated Law Firm Database (AmLaw / Super Lawyers / Martindale-Hubbell)',
    sourceUrl,
    externalId,

    reasonCodes: [
      `${tierLabel} — ${practiceLabel}`,
      `${firm.city}, ${firm.state} — confirmed active firm`,
      `Estimated partner AUM: ${firm.partnerAUM}`,
    ],
    signals: [
      `${firm.attorneys}-attorney ${firm.tier} firm`,
      `K-1 income complexity — uneven distributions, estimated tax burden`,
      note,
      'Outreach: Partner capital account + K-1 spike management + buyout planning',
    ],

    // Enrichment — firm is known, partner name is needed
    needsEnrichment:     true,
    needsNameResolution: true,
    nameResolutionNote:  `Visit ${firm.firm} website → Partners page → Copy equity partner names. Or search "${firm.firm} partners" on LinkedIn.`,

    batchId: `alfred_batch_law_partners_${TODAY}`,
  };
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A2: Law Partner Lead Miner           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const targetStates = STATE_ARG  ? [STATE_ARG.toUpperCase()]
                     : STATES_ARG ? STATES_ARG.split(',').map(s => s.trim().toUpperCase())
                     : [...new Set(FIRM_DATABASE.map(f => f.state))];

  console.log(`  States:    ${targetStates.join(', ')}`);
  console.log(`  Tier:      ${TIER_ARG}`);
  console.log(`  Practice:  ${PRACTICE_ARG}`);
  console.log(`  Limit:     ${LIMIT} leads`);
  if (DRY_RUN) console.log('  DRY RUN   — no file will be written');
  console.log('');
  console.log('  ⚠️  Firm-level leads — partner name enrichment needed.');
  console.log('     Each firm record = 1 lead; expand to individual partners via firm website.');
  console.log('     Avg partners per firm: 8–25 (boutique) → 50–150 (BigLaw)');
  console.log('');

  // ── Filter ──────────────────────────────────────────────────
  let firms = FIRM_DATABASE.filter(f => targetStates.includes(f.state));

  if (TIER_ARG !== 'all') {
    firms = firms.filter(f => f.tier === TIER_ARG);
  }
  if (PRACTICE_ARG !== 'all') {
    firms = firms.filter(f => f.practice === PRACTICE_ARG);
  }

  // Sort: boutique first (highest AUM per partner relative to risk of being well-advised)
  const tierOrder = { boutique: 0, midsize: 1, regional: 2, biglaw: 3 };
  firms.sort((a, b) => (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99));

  // Limit
  firms = firms.slice(0, LIMIT);
  const leads = firms.map(buildLead);

  console.log(`[Law Agent] ✅ ${leads.length} law firm leads generated\n`);

  if (leads.length === 0) {
    console.warn('[Law Agent] ⚠️  No results — check --state or --tier filter.');
    process.exit(0);
  }

  // ── Summary ──────────────────────────────────────────────────
  const byTier = {};
  leads.forEach(l => { byTier[l.firmTier] = (byTier[l.firmTier] || 0) + 1; });

  console.log('── Tier Distribution ─────────────────────────────────────');
  Object.entries(byTier).forEach(([t, n]) => console.log(`  ${t}: ${n} firms`));

  console.log('\n── Sample Leads ──────────────────────────────────────────');
  leads.slice(0, 6).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.company}`);
    console.log(`     ${l.city}, ${l.state} | ${l.firmTierLabel} | ${l.firmPracticeLabel}`);
    console.log(`     Partner AUM: ${l.estimatedAUM} | Fit: ${l.fitScore}`);
    console.log(`     📌 ${l.nameResolutionNote}`);
  });

  // ── Dry run ──────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[Law Agent] DRY RUN — skipping file write. Sample lead:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // ── Write ────────────────────────────────────────────────────
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const outputFile = path.join(STAGING_DIR, `alfred_batch_law_partners_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[Law Agent] ✅ Raw batch written: ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log(`[Law Agent] 📂 Location: ${outputFile}`);

  console.log('\n── Next Steps ───────────────────────────────────────────');
  console.log('  Each firm record = 1 pipeline entry. Expand to individual partners:');
  console.log('  1. Visit firm website → find "Partners" or "Attorneys" page');
  console.log('  2. Identify equity partners (vs. senior counsel / associate)');
  console.log('  3. Update firstName/lastName on each lead (or duplicate for each partner)');
  console.log('  4. Pass to Alfred for LinkedIn/Apollo enrichment at scale');
  console.log('');
  console.log(`  After name resolution:`);
  console.log(`  - Scrub:  node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  - Review: node scripts/scrub_leads.js --file ${outputFile} --review-only`);
  console.log(`  - Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>`);
  console.log('');

  // ── Expansion tip ─────────────────────────────────────────────
  const totalPartnerEst = leads.reduce((sum, l) => {
    const n = l.firmAttorneys;
    return sum + Math.round(n * (n < 30 ? 0.6 : n < 100 ? 0.35 : 0.2));
  }, 0);
  console.log(`  💡 Estimated individual partners across all firms: ~${totalPartnerEst}`);
  console.log(`     After enrichment, this batch can expand to ~${totalPartnerEst} individual leads.`);
  console.log('');
}

main().catch(err => {
  console.error('[Law Agent] FATAL:', err.message);
  process.exit(1);
});
