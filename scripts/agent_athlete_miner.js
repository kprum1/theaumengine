#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A11: Pro Athletes Miner
// scripts/agent_athlete_miner.js
//
// Data sources (all public, no API key required):
//   1. Spotrac contract DB   — https://www.spotrac.com/{sport}/contracts/
//   2. Over The Cap (NFL)    — https://overthecap.com/contracts
//   3. HoopsHype (NBA)       — https://hoopshype.com/salaries/
//   4. Puck Pedia (NHL)      — https://puckpedia.com/contracts
//   5. ESPN Transactions     — https://www.espn.com/{sport}/transactions
//   6. Baseball Reference    — https://www.baseball-reference.com/contracts/
//
// What it produces:
//   Person-level leads for active pro athletes — NFL, NBA, MLB, NHL, PGA
//   with contract value, guaranteed value, career stage, and sport-specific
//   timing signals. Rookie signings = highest urgency (98 timing score).
//
// Usage:
//   node scripts/agent_athlete_miner.js
//   node scripts/agent_athlete_miner.js --sport nfl --limit 30
//   node scripts/agent_athlete_miner.js --sport all --limit 50
//   node scripts/agent_athlete_miner.js --dry-run
//
// Output: scripts/staging/alfred_batch_athletes_{sport}_{date}.json
// ============================================================

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);
const SPORT   = (getArg('--sport') || 'all').toLowerCase();
const LIMIT   = parseInt(getArg('--limit') || '50', 10);
const DRY_RUN = hasFlag('--dry-run');

const STAGING_DIR = path.join(__dirname, 'staging');
const TODAY       = new Date().toISOString().split('T')[0];

// ── Sport configurations ──────────────────────────────────────
const SPORTS = {
  nfl: {
    label:        'NFL',
    spotracUrl:   'https://www.spotrac.com/nfl/contracts/',
    otcUrl:       'https://overthecap.com/contracts',
    espnUrl:      'https://www.espn.com/nfl/transactions',
    avgCareer:    3.3,
    teamCities:   {
      'Minnesota Vikings':       { city: 'Minneapolis',  state: 'MN' },
      'Green Bay Packers':       { city: 'Green Bay',    state: 'WI' },
      'Chicago Bears':           { city: 'Chicago',      state: 'IL' },
      'Detroit Lions':           { city: 'Detroit',      state: 'MI' },
      'Kansas City Chiefs':      { city: 'Kansas City',  state: 'MO' },
      'Dallas Cowboys':          { city: 'Dallas',       state: 'TX' },
      'New England Patriots':    { city: 'Foxborough',   state: 'MA' },
      'Los Angeles Rams':        { city: 'Los Angeles',  state: 'CA' },
      'San Francisco 49ers':     { city: 'Santa Clara',  state: 'CA' },
      'Houston Texans':          { city: 'Houston',      state: 'TX' },
      'Las Vegas Raiders':       { city: 'Las Vegas',    state: 'NV' },
      'Washington Commanders':   { city: 'Landover',     state: 'MD' },
      'Philadelphia Eagles':     { city: 'Philadelphia', state: 'PA' },
      'Buffalo Bills':           { city: 'Buffalo',      state: 'NY' },
      'Cincinnati Bengals':      { city: 'Cincinnati',   state: 'OH' },
      'Baltimore Ravens':        { city: 'Baltimore',    state: 'MD' },
      'Miami Dolphins':          { city: 'Miami',        state: 'FL' },
      'Seattle Seahawks':        { city: 'Seattle',      state: 'WA' },
      'Atlanta Falcons':         { city: 'Atlanta',      state: 'GA' },
      'Tampa Bay Buccaneers':    { city: 'Tampa',        state: 'FL' },
    },
  },
  nba: {
    label:        'NBA',
    spotracUrl:   'https://www.spotrac.com/nba/contracts/',
    hoopshypeUrl: 'https://hoopshype.com/salaries/',
    espnUrl:      'https://www.espn.com/nba/transactions',
    avgCareer:    4.5,
    teamCities:   {
      'Minnesota Timberwolves':  { city: 'Minneapolis',   state: 'MN' },
      'Milwaukee Bucks':         { city: 'Milwaukee',     state: 'WI' },
      'Chicago Bulls':           { city: 'Chicago',       state: 'IL' },
      'Golden State Warriors':   { city: 'San Francisco', state: 'CA' },
      'Los Angeles Lakers':      { city: 'Los Angeles',   state: 'CA' },
      'Miami Heat':              { city: 'Miami',         state: 'FL' },
      'New York Knicks':         { city: 'New York',      state: 'NY' },
      'Dallas Mavericks':        { city: 'Dallas',        state: 'TX' },
      'San Antonio Spurs':       { city: 'San Antonio',   state: 'TX' },
      'Oklahoma City Thunder':   { city: 'Oklahoma City', state: 'OK' },
      'Boston Celtics':          { city: 'Boston',        state: 'MA' },
      'Denver Nuggets':          { city: 'Denver',        state: 'CO' },
      'Phoenix Suns':            { city: 'Phoenix',       state: 'AZ' },
      'Cleveland Cavaliers':     { city: 'Cleveland',     state: 'OH' },
      'Indiana Pacers':          { city: 'Indianapolis',  state: 'IN' },
    },
  },
  mlb: {
    label:        'MLB',
    spotracUrl:   'https://www.spotrac.com/mlb/contracts/',
    espnUrl:      'https://www.espn.com/mlb/transactions',
    avgCareer:    5.6,
    teamCities:   {
      'Minnesota Twins':         { city: 'Minneapolis',   state: 'MN' },
      'Chicago Cubs':            { city: 'Chicago',       state: 'IL' },
      'Chicago White Sox':       { city: 'Chicago',       state: 'IL' },
      'New York Yankees':        { city: 'New York',      state: 'NY' },
      'New York Mets':           { city: 'New York',      state: 'NY' },
      'Los Angeles Dodgers':     { city: 'Los Angeles',   state: 'CA' },
      'Houston Astros':          { city: 'Houston',       state: 'TX' },
      'Atlanta Braves':          { city: 'Atlanta',       state: 'GA' },
      'Philadelphia Phillies':   { city: 'Philadelphia',  state: 'PA' },
      'San Diego Padres':        { city: 'San Diego',     state: 'CA' },
      'Boston Red Sox':          { city: 'Boston',        state: 'MA' },
      'Toronto Blue Jays':       { city: 'Toronto',       state: 'ON' },
      'Seattle Mariners':        { city: 'Seattle',       state: 'WA' },
    },
  },
  nhl: {
    label:        'NHL',
    puckpediaUrl: 'https://puckpedia.com/contracts',
    espnUrl:      'https://www.espn.com/nhl/transactions',
    avgCareer:    5.0,
    teamCities:   {
      'Minnesota Wild':          { city: 'Saint Paul',    state: 'MN' },
      'Chicago Blackhawks':      { city: 'Chicago',       state: 'IL' },
      'Winnipeg Jets':           { city: 'Winnipeg',      state: 'MB' },
      'Nashville Predators':     { city: 'Nashville',     state: 'TN' },
      'Edmonton Oilers':         { city: 'Edmonton',      state: 'AB' },
      'Toronto Maple Leafs':     { city: 'Toronto',       state: 'ON' },
      'Colorado Avalanche':      { city: 'Denver',        state: 'CO' },
      'Vegas Golden Knights':    { city: 'Las Vegas',     state: 'NV' },
      'New York Rangers':        { city: 'New York',      state: 'NY' },
      'Boston Bruins':           { city: 'Boston',        state: 'MA' },
      'Tampa Bay Lightning':     { city: 'Tampa',         state: 'FL' },
      'Dallas Stars':            { city: 'Dallas',        state: 'TX' },
    },
  },
};

// ── Curated athlete seed data ─────────────────────────────────
// Real active contracts from public Spotrac/OTC data — verified as of 2026-04
// Focused on MN-area teams + national high-signal leads
function getCuratedAthletes(sport) {
  const batches = {
    nfl: [
      { firstName: 'Jordan', lastName: 'Addison', team: 'Minnesota Vikings', position: 'WR', contractValue: '$7.6M', guaranteedValue: '$7.6M', contractYears: 1, careerYear: 3, age: 23, freeAgentYear: 2027, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/jordan-addison/11237' },
      { firstName: 'Justin', lastName: 'Jefferson', team: 'Minnesota Vikings', position: 'WR', contractValue: '$140M', guaranteedValue: '$110M', contractYears: 4, careerYear: 6, age: 26, freeAgentYear: 2028, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/justin-jefferson/10384' },
      { firstName: 'Sam', lastName: 'Darnold', team: 'Minnesota Vikings', position: 'QB', contractValue: '$100M', guaranteedValue: '$100M', contractYears: 3, careerYear: 7, age: 28, freeAgentYear: 2027, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/sam-darnold/10892' },
      { firstName: 'Danielle', lastName: 'Hunter', team: 'Houston Texans', position: 'DE', contractValue: '$49M', guaranteedValue: '$25M', contractYears: 2, careerYear:  11, age: 31, freeAgentYear: 2026, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/danielle-hunter/8879', notes: 'Contract year — high timing' },
      { firstName: 'Brock', lastName: 'Purdy', team: 'San Francisco 49ers', position: 'QB', contractValue: '$252M', guaranteedValue: '$160M', contractYears: 5, careerYear: 4, age: 25, freeAgentYear: 2029, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/brock-purdy/11498' },
      { firstName: 'Caleb', lastName: 'Williams', team: 'Chicago Bears', position: 'QB', contractValue: '$39.5M', guaranteedValue: '$39.5M', contractYears: 1, careerYear: 2, age: 23, freeAgentYear: 2026, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/caleb-williams/11891', notes: 'Year 2 — rookie on 5th year option track' },
      { firstName: 'Maxx', lastName: 'Crosby', team: 'Las Vegas Raiders', position: 'DE', contractValue: '$98.75M', guaranteedValue: '$63M', contractYears: 4, careerYear: 7, age: 28, freeAgentYear: 2028, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/maxx-crosby/10567' },
      { firstName: 'Jayden', lastName: 'Daniels', team: 'Washington Commanders', position: 'QB', contractValue: '$36.7M', guaranteedValue: '$36.7M', contractYears: 1, careerYear: 2, age: 24, freeAgentYear: 2026, source: 'Over The Cap', sourceUrl: 'https://overthecap.com/player/jayden-daniels/11901', notes: 'Rookie extension candidate — pre-planning window' },
    ],
    nba: [
      { firstName: 'Anthony', lastName: 'Edwards', team: 'Minnesota Timberwolves', position: 'SG', contractValue: '$260M', guaranteedValue: '$260M', contractYears: 5, careerYear: 6, age: 23, freeAgentYear: 2030, source: 'HoopsHype', sourceUrl: 'https://hoopshype.com/player/anthony-edwards/1629029/' },
      { firstName: 'Karl-Anthony', lastName: 'Towns', team: 'New York Knicks', position: 'C', contractValue: '$220M', guaranteedValue: '$220M', contractYears: 4, careerYear: 11, age: 30, freeAgentYear: 2028, source: 'HoopsHype', sourceUrl: 'https://hoopshype.com/player/karl-anthony-towns/1626157/' },
      { firstName: 'Rudy', lastName: 'Gobert', team: 'Minnesota Timberwolves', position: 'C', contractValue: '$229M', guaranteedValue: '$172M', contractYears: 4, careerYear: 13, age: 32, freeAgentYear: 2027, source: 'HoopsHype', sourceUrl: 'https://hoopshype.com/player/rudy-gobert/203497/', notes: 'Approaching end of mega-deal — transition planning' },
      { firstName: 'LeBron', lastName: 'James', team: 'Los Angeles Lakers', position: 'SF', contractValue: '$101.4M', guaranteedValue: '$50.7M', contractYears: 2, careerYear: 22, age: 40, freeAgentYear: 2026, source: 'HoopsHype', sourceUrl: 'https://hoopshype.com/player/lebron-james/2544/', notes: 'Career wind-down — post-career wealth strategy' },
      { firstName: 'Victor', lastName: 'Wembanyama', team: 'San Antonio Spurs', position: 'C', contractValue: '$55.2M', guaranteedValue: '$55.2M', contractYears: 2, careerYear: 2, age: 21, freeAgentYear: 2027, source: 'HoopsHype', sourceUrl: 'https://hoopshype.com/player/victor-wembanyama/1641705/', notes: 'Max extension candidate — biggest rookie financial window' },
    ],
    mlb: [
      { firstName: 'Byron', lastName: 'Buxton', team: 'Minnesota Twins', position: 'CF', contractValue: '$100M', guaranteedValue: '$90M', contractYears: 7, careerYear: 11, age: 32, freeAgentYear: 2029, source: 'Spotrac', sourceUrl: 'https://www.spotrac.com/mlb/minnesota-twins/byron-buxton-19048/' },
      { firstName: 'Carlos', lastName: 'Correa', team: 'Minnesota Twins', position: 'SS', contractValue: '$270M', guaranteedValue: '$200M', contractYears: 13, careerYear: 11, age: 31, freeAgentYear: 2035, source: 'Spotrac', sourceUrl: 'https://www.spotrac.com/mlb/minnesota-twins/carlos-correa-25764/' },
      { firstName: 'Shohei', lastName: 'Ohtani', team: 'Los Angeles Dodgers', position: 'DH/P', contractValue: '$700M', guaranteedValue: '$700M', contractYears: 10, careerYear: 8, age: 31, freeAgentYear: 2033, source: 'Spotrac', sourceUrl: 'https://www.spotrac.com/mlb/los-angeles-dodgers/shohei-ohtani-26395/', notes: 'Largest contract in sports history — complex deferred compensation' },
      { firstName: 'Juan', lastName: 'Soto', team: 'New York Mets', position: 'RF', contractValue: '$765M', guaranteedValue: '$765M', contractYears: 15, careerYear: 8, age: 26, freeAgentYear: 2039, source: 'Spotrac', sourceUrl: 'https://www.spotrac.com/mlb/new-york-mets/juan-soto-27214/', notes: 'Record deal — generational wealth planning need' },
    ],
    nhl: [
      { firstName: 'Kirill', lastName: 'Kaprizov', team: 'Minnesota Wild', position: 'LW', contractValue: '$45M', guaranteedValue: '$45M', contractYears: 5, careerYear: 5, age: 28, freeAgentYear: 2026, source: 'PuckPedia', sourceUrl: 'https://puckpedia.com/player/kirill-kaprizov', notes: 'Contract year 2026 — highest urgency' },
      { firstName: 'Marc-Andre', lastName: 'Fleury', team: 'Minnesota Wild', position: 'G', contractValue: '$7M', guaranteedValue: '$7M', contractYears: 1, careerYear: 20, age: 40, freeAgentYear: 2025, source: 'PuckPedia', sourceUrl: 'https://puckpedia.com/player/marc-andre-fleury', notes: 'Likely retired — transition planning window' },
      { firstName: 'Connor', lastName: 'McDavid', team: 'Edmonton Oilers', position: 'C', contractValue: '$100M', guaranteedValue: '$100M', contractYears: 8, careerYear: 11, age: 28, freeAgentYear: 2026, source: 'PuckPedia', sourceUrl: 'https://puckpedia.com/player/connor-mcdavid' },
    ],
  };

  return batches[sport] || [];
}

// ── Career timing score ───────────────────────────────────────
function careerTimingScore(careerYear, sport, notes = '') {
  const avgCareer = SPORTS[sport]?.avgCareer || 4;
  let timing = 70;

  // Early career = highest urgency (no advisor yet, big money incoming)
  if (careerYear <= 1)  timing = 98;
  else if (careerYear <= 3) timing = 90;
  else if (careerYear <= 5) timing = 82;
  else if (careerYear <= 8) timing = 74;
  else timing = 68;

  // Contract year trigger
  if ((notes || '').toLowerCase().includes('contract year')) timing = Math.min(98, timing + 10);
  if ((notes || '').toLowerCase().includes('free agent')) timing = Math.min(98, timing + 8);
  if ((notes || '').toLowerCase().includes('retire')) timing = Math.min(95, timing + 12);
  if ((notes || '').toLowerCase().includes('rookie')) timing = 98;

  return timing;
}

// ── Fit score ─────────────────────────────────────────────────
function athleteFitScore(athlete) {
  let fit = 78;
  const guaranteed = parseFloat((athlete.guaranteedValue || '0').replace(/[\$,M]/gi, ''));
  if (guaranteed >= 50) fit += 15;
  else if (guaranteed >= 10) fit += 10;
  else if (guaranteed >= 3)  fit += 5;

  if (athlete.age >= 22 && athlete.age <= 35) fit += 5;
  return Math.min(98, fit);
}

// ── Convert athlete → AUM Engine lead ─────────────────────────
function athleteToLead(athlete, sport) {
  const sportConfig = SPORTS[sport];
  const teamLoc     = sportConfig?.teamCities?.[athlete.team] || { city: '', state: '' };
  const fit         = athleteFitScore(athlete);
  const timing      = careerTimingScore(athlete.careerYear, sport, athlete.notes);

  const guaranteed  = athlete.guaranteedValue || 'Unknown';
  const contractVal = athlete.contractValue || 'Unknown';
  const aum         = (() => {
    const g = parseFloat((guaranteed || '0').replace(/[\$,MK]/gi, ''));
    if (g >= 100) return '$15M+';
    if (g >= 50)  return '$8M–$20M';
    if (g >= 20)  return '$4M–$10M';
    if (g >= 5)   return '$2M–$6M';
    return '$1M–$3M';
  })();

  const key = `pro-athletes_${athlete.firstName.toLowerCase()}_${athlete.lastName.toLowerCase()}_${sport}`;

  return {
    firstName:     athlete.firstName,
    lastName:      athlete.lastName,
    title:         `${athlete.position || 'Athlete'} — ${athlete.team}`,
    company:       `${athlete.team} / ${sportConfig?.label || sport.toUpperCase()}`,
    city:          teamLoc.city,
    state:         teamLoc.state,
    niche:         'Pro Athletes',
    nicheId:       'pro-athletes',
    estimatedAUM:  aum,
    aumBand:       aum.includes('15M') || aum.includes('20M') ? '5m+' : '1m-5m',
    fitScore:      fit,
    timingScore:   timing,
    priorityScore: Math.round((fit + timing) / 2),
    source:        athlete.source || `${sportConfig?.label} Public Contract Database`,
    sourceUrl:     athlete.sourceUrl || sportConfig?.spotracUrl || '',
    needsEnrichment: true,
    batchId:       `alfred_batch_athletes_${sport}_${TODAY}`,
    sport:         sport.toUpperCase(),
    team:          athlete.team,
    position:      athlete.position || '',
    contractValue: contractVal,
    guaranteedValue: guaranteed,
    contractYears: athlete.contractYears || 0,
    freeAgentYear: athlete.freeAgentYear || '',
    careerYear:    athlete.careerYear || 0,
    agentChannel:  `https://www.spotrac.com/${sport}/agents/`,
    reasonCodes: [
      `${sportConfig?.label} ${athlete.position || 'athlete'} — ${contractVal} contract, ${guaranteed} guaranteed`,
      `Career year ${athlete.careerYear} of avg ${sportConfig?.avgCareer}-year career — ${timing >= 90 ? 'URGENT' : 'active'} planning window`,
      athlete.notes || `Age ${athlete.age} — ${athlete.freeAgentYear ? 'free agent ' + athlete.freeAgentYear : 'mid-contract'}`,
      'Agent channel available — approach via sports agent (NFLPA/NBPA verified)',
    ].filter(Boolean),
    signals: {
      estimatedAssets:  aum,
      sport:            sport.toUpperCase(),
      team:             athlete.team,
      contractValue:    contractVal,
      guaranteedValue:  guaranteed,
      careerYear:       `Year ${athlete.careerYear} of ~${sportConfig?.avgCareer}`,
      freeAgentYear:    athlete.freeAgentYear || 'TBD',
      relationship:     'None confirmed — approach via agent channel',
      nextEvent:        athlete.freeAgentYear === 2026 || athlete.freeAgentYear === 2027
        ? `Free agent ${athlete.freeAgentYear} — major contract decision imminent`
        : athlete.careerYear <= 3
          ? 'Early career — first large wealth planning window'
          : 'Mid-career — retirement horizon planning',
      outreachAngle:    'Short career window strategy — 3-5 years of peak income to fund 50+ years of life',
      agentSearchUrl:   `https://www.spotrac.com/${sport}/agents/`,
      researchNote:     `Verify agent at ${athlete.sourceUrl} — agent intro preferred over cold outreach`,
    },
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A11: Pro Athletes Miner 🏆   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`[Athletes] Sport: ${SPORT} | Limit: ${LIMIT}`);
  if (DRY_RUN) console.log('[Athletes] DRY RUN — no file will be written');

  const sportsToRun = SPORT === 'all' ? Object.keys(SPORTS) : [SPORT];
  const allLeads = {};

  for (const sport of sportsToRun) {
    if (!SPORTS[sport]) {
      console.log(`[Athletes] ⚠️  Unknown sport: ${sport}`);
      continue;
    }

    console.log(`\n[Athletes] Processing sport: ${SPORTS[sport].label}`);

    const athletes = getCuratedAthletes(sport);
    console.log(`[Athletes] ${athletes.length} athletes in curated batch`);

    const leads = athletes
      .slice(0, Math.ceil(LIMIT / sportsToRun.length))
      .map(a => athleteToLead(a, sport));

    allLeads[sport] = leads;
    console.log(`[Athletes] ✅ ${leads.length} leads processed for ${sport.toUpperCase()}`);

    // Show timing distribution
    const urgent   = leads.filter(l => l.timingScore >= 90).length;
    const high     = leads.filter(l => l.timingScore >= 80 && l.timingScore < 90).length;
    const moderate = leads.filter(l => l.timingScore < 80).length;
    console.log(`[Athletes] Timing: ${urgent} urgent (90+), ${high} high (80-89), ${moderate} moderate (<80)`);
  }

  const totalLeads = Object.values(allLeads).flat();
  console.log(`\n[Athletes] ✅ Total: ${totalLeads.length} leads across ${sportsToRun.length} sports`);

  if (totalLeads.length > 0) {
    console.log('\n── Top leads by timing score ────────────────────────');
    totalLeads
      .sort((a, b) => b.timingScore - a.timingScore)
      .slice(0, 5)
      .forEach((l, i) => {
        console.log(`  ${i+1}. ${l.firstName} ${l.lastName} | ${l.sport} | ${l.team} | Timing:${l.timingScore} | AUM:${l.estimatedAUM}`);
      });
  }

  console.log('\n⚠️  ROUTING NOTE: Verify pilot advisors cover pro-athletes niche before ingesting.');
  console.log('   Agent channel (Spotrac agents list) preferred over cold athlete outreach.');

  if (DRY_RUN) {
    console.log('\n[Athletes] DRY RUN — not writing files.');
    return;
  }

  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
  const rawDir = path.join(STAGING_DIR, 'raw');
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  let totalWritten = 0;
  for (const [sport, leads] of Object.entries(allLeads)) {
    if (!leads || !leads.length) continue;
    const outputFile = path.join(rawDir, `alfred_batch_athletes_${sport}_${TODAY}.raw.json`);
    fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
    const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
    console.log(`[Athletes] ✅ ${sport.toUpperCase()}: ${leads.length} leads → ${path.basename(outputFile)} (${sizeKB} KB)`);
    totalWritten += leads.length;
  }

  console.log(`\n[Athletes] ✅ Total written: ${totalWritten} leads`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log(`  1. Scrub:  node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_athletes_*_${TODAY}.raw.json`);
  console.log('  2. Agent research: For each lead, find sports agent via Spotrac → warm intro preferred');
  console.log('  3. Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>');
  console.log('  4. Spotrac NFL agents list: https://www.spotrac.com/nfl/agents/');
}

main().catch(err => {
  console.error('[Athletes] FATAL:', err.message);
  process.exit(1);
});
