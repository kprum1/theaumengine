#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A13: Inheritance / Probate Miner
// scripts/agent_probate_miner.js
//
// Data sources (all public court records):
//   1. Florida MyFLCourtAccess — most open probate portal
//      https://myflcourtaccess.com/
//   2. Maricopa County AZ Superior Court
//      https://superiorcourt.maricopa.gov/
//   3. CourtListener API — Federal + State probate filings
//      https://www.courtlistener.com/api/rest/v3/dockets/?type=pb
//   4. County Recorder Deed Transfers — "Estate of [name]" transactions
//
// What it produces:
//   Beneficiary-level leads from probate filings and estate deed transfers.
//   Estate value >= $500K. Outreach window: 0–90 days post-opening.
//   SENSITIVITY PROTOCOL: outreach angle is "sudden wealth navigation"
//   NEVER references the death or the inheritance directly.
//
// Usage:
//   node scripts/agent_probate_miner.js
//   node scripts/agent_probate_miner.js --state FL --days 90 --limit 30
//   node scripts/agent_probate_miner.js --state AZ,FL --limit 40
//   node scripts/agent_probate_miner.js --dry-run
//
// Output: scripts/staging/alfred_batch_probate_{date}.json
// ============================================================

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args       = process.argv.slice(2);
const getArg     = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag    = (f) => args.includes(f);
const STATES_ARG = getArg('--state') || 'FL,AZ,TX';
const DAYS       = parseInt(getArg('--days') || '90', 10);
const LIMIT      = parseInt(getArg('--limit') || '30', 10);
const DRY_RUN    = hasFlag('--dry-run');
const TARGET_STATES = STATES_ARG.split(',').map(s => s.trim().toUpperCase());

const STAGING_DIR = path.join(__dirname, 'staging');
const TODAY       = new Date().toISOString().split('T')[0];
const START_DATE  = new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0];

// ── State probate portal registry ─────────────────────────────
const PROBATE_PORTALS = {
  FL: {
    name:     'Florida MyFLCourtAccess',
    url:      'https://myflcourtaccess.com/',
    type:     'web_portal',
    counties: ['Collier', 'Sarasota', 'Palm Beach', 'Pinellas', 'Hillsborough', 'Broward', 'Miami-Dade'],
    richZips:  ['34102','34108','34236','33480','33401','33756','34229','33948'],
    note:     'Most open FL probate portal. Search by county, filing type = probate. Estate value often disclosed.',
    searchInstructions: 'Go to myflcourtaccess.com → Case Search → Select County → Case Type: Probate → Filed After: ' + START_DATE,
  },
  AZ: {
    name:     'Maricopa County Superior Court',
    url:      'https://superiorcourt.maricopa.gov/',
    type:     'web_portal',
    counties: ['Maricopa', 'Pima'],
    richZips:  ['85253','85254','85259','85266','85032'],
    note:     'Maricopa covers Scottsdale, Paradise Valley, Chandler. High-wealth market.',
    searchInstructions: 'Go to superiorcourt.maricopa.gov → eAccess → Probate → search by date range',
  },
  TX: {
    name:     'Harris County District Clerk',
    url:      'https://www.hcdistrictclerk.com/',
    type:     'web_portal',
    counties: ['Harris', 'Dallas', 'Travis'],
    richZips:  ['77024','77005','77007','75205','75225'],
    note:     'Harris County (Houston). Dallas County searchable at dallascounty.org.',
    searchInstructions: 'Go to hcdistrictclerk.com → Civil Online → Probate → date range filter',
  },
  MN: {
    name:     'Minnesota Court Records Online (MCRO)',
    url:      'https://pa.courts.state.mn.us/',
    type:     'web_portal',
    counties: ['Hennepin', 'Ramsey', 'Anoka', 'Dakota', 'Washington'],
    richZips:  ['55391','55420','55347','55379','55346'],
    note:     'MN MCRO searchable. Hennepin = Minneapolis + Wayzata (high wealth density).',
    searchInstructions: 'Go to pa.courts.state.mn.us → Case Search → Case Type: PR (Probate) → county filter',
  },
  IL: {
    name:     'Cook County Circuit Court',
    url:      'https://www.cookcountyclerkofcourt.org/',
    type:     'web_portal',
    counties: ['Cook', 'DuPage'],
    richZips:  ['60611','60614','60601','60093','60043'],
    note:     'Cook County = Chicago. Lake Forest, Winnetka are high-wealth suburbs.',
    searchInstructions: 'Go to cookcountyclerkofcourt.org → Case Search → Division: Probate',
  },
};

// ── CourtListener API fetch ───────────────────────────────────
// Free API, no key required for public probate records
async function fetchCourtListener(state) {
  const stateMap = { FL: 'flasd', AZ: 'azd', TX: 'txsd', MN: 'mnd', IL: 'ilnd' };
  const court    = stateMap[state];
  if (!court) return [];

  console.log(`  [CL API] Fetching CourtListener dockets for ${state}…`);
  const url = `https://www.courtlistener.com/api/rest/v3/dockets/?format=json&type=pb&court=${court}&filed_after=${START_DATE}&page_size=20`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'AUM-Engine-Research/1.0 kosal@fin-tegration.com' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log(`  [CL API] HTTP ${res.statusCode} — trying next source`);
          return resolve([]);
        }
        try {
          const json = JSON.parse(data);
          resolve(json.results || []);
        } catch(e) {
          console.log(`  [CL API] Parse error: ${e.message}`);
          resolve([]);
        }
      });
    });
    req.on('error', e => { console.log(`  [CL API] Error: ${e.message}`); resolve([]); });
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _title(s) { return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

// ── CourtListener docket → AUM lead ──────────────────────────
function clDocketToLead(docket, state) {
  const caseName    = docket.case_name || docket.case_name_short || '';
  const filed       = docket.date_filed || '';
  const court       = docket.court    || state;
  const absoluteUrl = docket.absolute_url
    ? `https://www.courtlistener.com${docket.absolute_url}`
    : `https://www.courtlistener.com/api/rest/v3/dockets/?type=pb&court=${state.toLowerCase()}d`;

  // Extract beneficiary hint from case name
  // Format often: "In Re: Estate of [FirstName LastName]" or "[LastName] Estate"
  let estateOf = '';
  const estMatch = caseName.match(/estate\s+of\s+([A-Za-z\s\.,']+)/i);
  if (estMatch) estateOf = estMatch[1].trim();

  const daysSinceFiled = filed
    ? Math.floor((Date.now() - new Date(filed).getTime()) / 86400000)
    : 60;

  const timingScore = daysSinceFiled <= 30  ? 95
    : daysSinceFiled <= 60  ? 88
    : daysSinceFiled <= 90  ? 80
    : 65;

  const portal = PROBATE_PORTALS[state];

  return {
    firstName:    '',   // Beneficiary name requires petition review
    lastName:     '',
    title:        estateOf ? `Beneficiary — Estate of ${_title(estateOf)}` : 'Beneficiary — Probate Estate',
    company:      estateOf ? `Estate of ${_title(estateOf)}` : 'Probate Estate',
    city:         '',   // City from county context
    state,
    niche:        'Inheritance Recipients',
    nicheId:      'inheritance',   // canonical slug in data.js is 'inheritance' (not 'inheritance-recipients')
    estimatedAUM: '$500K–$2M',
    aumBand:      '500k-1m',
    fitScore:     78,
    timingScore,
    priorityScore: Math.round((78 + timingScore) / 2),
    source:       `CourtListener API — ${portal?.name || state} Probate`,
    sourceUrl:    absoluteUrl,
    needsEnrichment:     true,
    needsNameResolution: true,   // Beneficiary names in filing — open sourceUrl
    sensitivityFlag:     'bereavement',   // MANDATORY — use approved outreach angle only
    batchId:      `alfred_batch_probate_${TODAY}`,
    probateFiledDate: filed,
    courtCaseName: caseName,
    estate:       estateOf,
    reasonCodes: [
      estateOf ? `Probate: Estate of ${_title(estateOf)} — filed ${filed}` : `Probate filing — ${state} — filed ${filed}`,
      `CourtListener public record — ${daysSinceFiled} days since filing (distribution window ${daysSinceFiled <= 60 ? 'OPEN' : 'mid-stage'})`,
      'Beneficiary name in filing — open sourceUrl to resolve',
      'SENSITIVITY: use "sudden wealth navigation" angle only — never reference death',
    ],
    signals: {
      estimatedAssets:   '$500K–$2M',
      relationship:      'None — cold (public probate record)',
      probateFiledDate:  filed,
      daysSinceFiling:   daysSinceFiled,
      nextEvent:         daysSinceFiled <= 60
        ? 'Estate distribution likely within 90 days — URGENT outreach window'
        : 'Estate mid-distribution — outreach window closing',
      outreachAngle:     'Sudden wealth navigation — protecting assets before any deployment decisions',
      sensitivityNote:   'NEVER reference the death or the inheritance. Frame as "navigating a significant financial change". Lead with the complexity.',
      verifyUrl:         absoluteUrl,
      researchNote:      `Open ${absoluteUrl} → find beneficiary names in petition documents → check for estate value disclosure`,
      statePortal:       portal?.url || '',
    },
  };
}

// ── Curated probate seed data ─────────────────────────────────
// Real county/region data for manual research — grounds the batch
function getCuratedProbateResearchTargets(state) {
  const targets = {
    FL: [
      { county: 'Collier', richZip: '34102', city: 'Naples', note: 'Naples is top-5 US market for $1M+ estates', manualSearchUrl: 'https://myflcourtaccess.com/', estateAumProxy: '$1.2M–$4M' },
      { county: 'Sarasota', richZip: '34236', city: 'Sarasota', note: 'High retiree wealth — frequent estate openings', manualSearchUrl: 'https://myflcourtaccess.com/', estateAumProxy: '$800K–$2.5M' },
      { county: 'Palm Beach', richZip: '33480', city: 'Palm Beach', note: 'UHNW market — estates often $5M+', manualSearchUrl: 'https://myflcourtaccess.com/', estateAumProxy: '$2M–$8M' },
    ],
    AZ: [
      { county: 'Maricopa', richZip: '85253', city: 'Paradise Valley', note: 'Highest per-capita wealth in AZ', manualSearchUrl: 'https://superiorcourt.maricopa.gov/', estateAumProxy: '$1M–$5M' },
      { county: 'Maricopa', richZip: '85259', city: 'Scottsdale', note: 'Large retiree community — frequent probate', manualSearchUrl: 'https://superiorcourt.maricopa.gov/', estateAumProxy: '$800K–$3M' },
    ],
    TX: [
      { county: 'Harris', richZip: '77024', city: 'Houston (River Oaks)', note: 'River Oaks = highest Houston wealth density', manualSearchUrl: 'https://www.hcdistrictclerk.com/', estateAumProxy: '$1.5M–$6M' },
      { county: 'Dallas', richZip: '75205', city: 'Dallas (Highland Park)', note: 'Highland Park — ultra-high wealth enclave', manualSearchUrl: 'https://www.dallascounty.org/courts/', estateAumProxy: '$2M–$8M' },
    ],
    MN: [
      { county: 'Hennepin', richZip: '55391', city: 'Minnetonka / Wayzata', note: 'Lake Minnetonka area — high estate values', manualSearchUrl: 'https://pa.courts.state.mn.us/', estateAumProxy: '$800K–$3M' },
      { county: 'Hennepin', richZip: '55420', city: 'Bloomington', note: 'Large suburban market', manualSearchUrl: 'https://pa.courts.state.mn.us/', estateAumProxy: '$600K–$2M' },
    ],
  };
  return targets[state] || [];
}

function researchTargetToLead(target, state, index) {
  const portal = PROBATE_PORTALS[state];
  const manualSearchNote = portal?.searchInstructions || `Visit ${portal?.url} and search for probate filings in ${target.county} county filed after ${START_DATE}`;

  return {
    firstName:    '',
    lastName:     '',
    title:        `Probate Beneficiary — ${target.county} County, ${state} (research target)`,
    company:      `${target.county} County Probate — ${target.city}`,
    city:         target.city,
    state,
    niche:        'Inheritance Recipients',
    nicheId:      'inheritance',
    estimatedAUM: target.estateAumProxy,
    aumBand:      '500k-1m',
    fitScore:     74,
    timingScore:  82,
    priorityScore: 78,
    source:       `${portal?.name || state + ' Probate Court'} — Manual Research Target`,
    sourceUrl:    target.manualSearchUrl || portal?.url || '',
    needsEnrichment:     true,
    needsNameResolution: true,
    sensitivityFlag:     'bereavement',
    batchId:      `alfred_batch_probate_${TODAY}`,
    confidenceScore: 0.70,
    confidenceBand:  'medium',
    isResearchTarget: true,   // This is a county-level target, not an individual record
    county:       target.county,
    richZip:      target.richZip,
    reasonCodes: [
      `${target.county} County, ${state} — high-wealth probate zone (${target.richZip} zip cluster)`,
      target.note,
      `Estate AUM proxy: ${target.estateAumProxy} based on area wealth density`,
      `Manual research required — visit: ${target.manualSearchUrl}`,
    ],
    signals: {
      estimatedAssets:  target.estateAumProxy,
      relationship:     'None — cold (probate public record)',
      nextEvent:        'Estate filing window active — 0–90 days post-opening ideal',
      outreachAngle:    'Sudden wealth navigation — first 90 days are the most important',
      sensitivityNote:  'NEVER reference death or inheritance. Use "significant financial change" frame.',
      manualSearchNote,
      verifyUrl:        target.manualSearchUrl || portal?.url || '',
      richZip:          target.richZip,
    },
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A13: Probate Miner  💰       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`[Probate] States: ${TARGET_STATES.join(', ')} | Days: ${DAYS} | Limit: ${LIMIT}`);
  console.log(`[Probate] Date range: ${START_DATE} → ${TODAY}`);
  if (DRY_RUN) console.log('[Probate] DRY RUN — no file will be written');

  // ⚠️ SENSITIVITY WARNING
  console.log('\n⚠️  SENSITIVITY PROTOCOL: All probate leads carry sensitivityFlag = "bereavement".');
  console.log('   Outreach MUST use "sudden wealth navigation" angle. NEVER reference the death.\n');

  const allLeads = [];

  for (const state of TARGET_STATES) {
    const portal = PROBATE_PORTALS[state];
    if (!portal) {
      console.log(`[Probate] ${state}: No portal configured — skipping`);
      continue;
    }

    console.log(`\n[Probate] Processing ${state} — ${portal.name}`);
    console.log(`[Probate] Portal: ${portal.url}`);

    // Step 1: Try CourtListener API for structured records
    const clDockets = await fetchCourtListener(state);
    console.log(`[Probate] CourtListener: ${clDockets.length} dockets found`);

    for (const docket of clDockets.slice(0, 8)) {
      if (allLeads.length >= LIMIT) break;
      allLeads.push(clDocketToLead(docket, state));
    }

    await sleep(800);

    // Step 2: Add curated research targets for manual portal lookup
    const targets = getCuratedProbateResearchTargets(state);
    console.log(`[Probate] Adding ${targets.length} manual research targets for ${state}`);

    for (const target of targets) {
      if (allLeads.length >= LIMIT) break;
      allLeads.push(researchTargetToLead(target, state, allLeads.length));
    }

    console.log(`[Probate] ${state} complete. Total leads so far: ${allLeads.length}`);
    console.log(`[Probate] Manual search: ${portal.searchInstructions}`);
  }

  // ── Summary ───────────────────────────────────────────────────
  const clLeads     = allLeads.filter(l => !l.isResearchTarget);
  const manualLeads = allLeads.filter(l => l.isResearchTarget);
  const urgent      = allLeads.filter(l => l.timingScore >= 90);

  console.log(`\n[Probate] ✅ Total: ${allLeads.length} leads`);
  console.log(`[Probate]    CourtListener records: ${clLeads.length}`);
  console.log(`[Probate]    Manual research targets: ${manualLeads.length}`);
  console.log(`[Probate]    Urgent (timing 90+): ${urgent.length}`);

  // Print portal research guide
  console.log('\n── Manual Research Portals ──────────────────────────');
  for (const state of TARGET_STATES) {
    const p = PROBATE_PORTALS[state];
    if (p) {
      console.log(`  ${state}: ${p.url}`);
      if (p.searchInstructions) console.log(`       ${p.searchInstructions}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[Probate] DRY RUN — not writing files.');
    if (allLeads.length) {
      console.log('\nSample lead:');
      console.log(JSON.stringify(allLeads[0], null, 2));
    }
    return;
  }

  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
  const rawDir = path.join(STAGING_DIR, 'raw');
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  const outputFile   = path.join(rawDir,     `alfred_batch_probate_${TODAY}.raw.json`);
  const manifestFile = path.join(STAGING_DIR, `probate_research_manifest_${TODAY}.json`);

  // Research manifest — for Vera (Perplexity) to do manual portal pulls
  const manifest = {
    generatedAt: new Date().toISOString(),
    dateRange:   { start: START_DATE, end: TODAY },
    states:      TARGET_STATES,
    portals:     Object.fromEntries(TARGET_STATES.filter(s => PROBATE_PORTALS[s]).map(s => [s, PROBATE_PORTALS[s]])),
    sensitivityProtocol: {
      flag:      'bereavement',
      approved:  'Sudden wealth navigation — first 90 days are the most important',
      forbidden: ['inheritance', 'death', 'passed away', 'deceased', 'estate left to you'],
    },
    vera_instructions: 'For each state portal above, visit the URL and search for probate filings opened in the last 90 days. Filter for estates with disclosed values >= $500K. Extract: case name, estate value, filing date, county. Return as structured JSON.',
    leadsFound:  allLeads.length,
  };

  fs.writeFileSync(outputFile,   JSON.stringify(allLeads, null, 2), 'utf8');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
  console.log(`\n[Probate] ✅ Leads:    ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log(`[Probate] ✅ Manifest: ${path.basename(manifestFile)}`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log('  1. Send manifest to Vera (Perplexity) for portal research');
  console.log('  2. Vera returns individual case records → update firstName/lastName');
  console.log('  3. Scrub: node scripts/scrub_leads.js --file ' + outputFile);
  console.log('  4. Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>');
  console.log('\n  ⚠️  ALL outreach must use sensitivity-approved angle. See signals.sensitivityNote.');
}

main().catch(err => {
  console.error('[Probate] FATAL:', err.message);
  process.exit(1);
});
