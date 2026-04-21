#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Hennepin County $1M+ Homestead Miner
// scripts/agent_hennepin_miner.js
//
// Strategy: wealth-first lead sourcing — start with a CONFIRMED $1M+ asset
// (legal deed of record), then back into who the person is via PDL enrichment.
//
// This inverts the traditional approach:
//   Old: Find a physician → hope they're wealthy
//   New: Find a $2.3M Wayzata homeowner → discover they're a physician
//
// Data source:
//   Hennepin County GIS / LAND_PROPERTY MapServer — Layer 1 "County Parcels"
//   https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1
//   Updated monthly by Hennepin County Real Estate Services.
//   Data is public record per MN Statute 13.03 (government data openness).
//   No auth required. No rate limits documented.
//
// Filters applied:
//   MKT_VAL_TOT >= 1000000     Confirmed $1M+ asset (assessor-valued)
//   HMSTD_CD1 = 'H'            Primary homestead — they live there (not LLC/rental)
//   MAILING_MUNIC_NM IN (...)  Western Twin Cities suburbs only
//   Owner name NOT like TRUST/LLC/CORP/ESTATE  Skip non-individual owners
//
// Output fields written to master_leads:
//   firstName, lastName, city, state, location
//   homeValue (MKT_VAL_TOT), salePrice (SALE_PRICE)
//   propertyAddress (full street), propertyPid (Hennepin parcel ID)
//   nicheId: 'henrys' (routable catch-all for Jeremy's territory)
//   source: 'HennepinCounty_GIS_$1M+_Homestead'
//
// Next step after mining:
//   node scripts/agent_pdl_enrich.js --state MN --cities "Wayzata,..." --force
//   PDL will discover profession → niche can be updated from 'henrys' to actual niche
//
// Usage:
//   node scripts/agent_hennepin_miner.js                       (all western suburbs)
//   node scripts/agent_hennepin_miner.js --dry-run             (preview, no writes)
//   node scripts/agent_hennepin_miner.js --city WAYZATA        (one city only)
//   node scripts/agent_hennepin_miner.js --min-value 2000000   ($2M+ filter)
//   node scripts/agent_hennepin_miner.js --limit 100           (cap at N leads)
//   node scripts/agent_hennepin_miner.js --no-dedup            (skip Firestore dedup check)
//
// Note: Carver County (Chaska, Chanhassen, Waconia, Victoria) uses a different
//       GIS system — add agent_carver_miner.js as a follow-up sprint.
// =============================================================================

'use strict';

const admin  = require('firebase-admin');
const https  = require('https');
const path   = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI ───────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const hasFlag    = f => args.includes(f);
const getArg     = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const DRY_RUN    = hasFlag('--dry-run');
const NO_DEDUP   = hasFlag('--no-dedup');
const CITY_FILTER = getArg('--city');                              // e.g. "WAYZATA"
const MIN_VALUE  = parseInt(getArg('--min-value') || '1000000', 10);
const LIMIT      = parseInt(getArg('--limit') || '9999', 10);

// ── Target cities (Hennepin County only — all-caps as stored in the GIS DB) ──
// Chaska and Chanhassen are Carver County → separate agent needed
const WESTERN_SUBURBS = [
  'WAYZATA', 'MINNETONKA', 'PLYMOUTH', 'EDEN PRAIRIE',
  'EXCELSIOR', 'DEEPHAVEN', 'ORONO', 'LONG LAKE',
  'SHOREWOOD', 'MOUND', 'MEDINA', 'MAPLE PLAIN',
  'SPRING PARK', 'MINNETONKA BEACH', 'GREENWOOD', 'TONKA BAY',
];

// ── ArcGIS REST API config ────────────────────────────────────────────────────
const GIS_HOST  = 'gis.hennepin.us';
const GIS_PATH  = '/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1/query';
const PAGE_SIZE = 1000;   // Max 2000 per API docs — use 1000 to be safe

// Fields we request
const OUT_FIELDS = [
  'PID', 'OWNER_NM', 'TAXPAYER_NM', 'TAXPAYER_NM_1',
  'MAILING_MUNIC_NM', 'ZIP_CD',
  'MKT_VAL_TOT', 'SALE_PRICE', 'SALE_DATE',
  'HOUSE_NO', 'STREET_NM', 'BUILD_YR',
  'HMSTD_CD1', 'PR_TYP_NM1',
].join(',');

// ── Skip patterns — non-individual owners ─────────────────────────────────────
const SKIP_PATTERNS = [
  /\bTRUST(EE)?\b/i, /\bLLC\b/i, /\bINC\b/i, /\bCORP\b/i,
  /\bESTATE\b/i,    /\bFOUNDATION\b/i, /\bCHURCH\b/i, /\bSCHOOL\b/i,
  /\bCITY OF\b/i,   /\bCOUNTY OF\b/i,  /\bSTATE OF\b/i,
  /\bREVOC\b/i,     /\bIRREV\b/i,      /\bFAMILY LTD\b/i,
  /\bPARTNERSHIP\b/i, /\bHOA\b/i,      /^[0-9]/,       // address bled into name field
];

function isSkippable(name) {
  if (!name || !name.trim()) return true;
  return SKIP_PATTERNS.some(p => p.test(name));
}

// ── Name parser ───────────────────────────────────────────────────────────────
// Input: "KATHERINE F APPLEBAUM" or "STEVEN W NELSON"
// Output: { firstName: 'Katherine', lastName: 'Applebaum' }
function parseName(raw) {
  if (!raw || !raw.trim()) return null;
  const clean = raw.trim().replace(/\s+/g, ' ');

  // Title-case helper
  const tc = s => s.split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('-');

  const parts = clean.split(' ').map(tc);

  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };

  // 3+ parts: last token is last name, first token is first name, middle = ignored
  // Handle "E E FLYNN-FERRY & M J FERRY" — stop at &
  const ampIdx = parts.findIndex(p => p === '&');
  const usableParts = ampIdx > 0 ? parts.slice(0, ampIdx) : parts;

  const firstName = usableParts[0];
  const lastName  = usableParts[usableParts.length - 1];

  // Guard: reject single-initial-only names ("P C" style — just initials, no real name)
  if (firstName.length <= 1 && lastName.length <= 1) return null;

  // Guard: if firstName === lastName, the & split went wrong (e.g. "Norah & GONDECK" parsed badly)
  // Fall back to using the last token as last name and first token as first name from the full string
  if (firstName.toLowerCase() === lastName.toLowerCase()) {
    const allParts = clean.split(' ').map(tc);
    return { firstName: allParts[0], lastName: allParts[allParts.length - 1] };
  }

  return { firstName, lastName };
}

// ── HTTP GET (returns parsed JSON) ────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message} | raw: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// ── Query Hennepin GIS for one city, paginated ────────────────────────────────
async function fetchParcelsForCity(city) {
  const records = [];
  let offset = 0;

  while (true) {
    const where = [
      `MAILING_MUNIC_NM = '${city}'`,
      `MKT_VAL_TOT >= ${MIN_VALUE}`,
      `HMSTD_CD1 = 'H'`,
    ].join(' AND ');

    const params = new URLSearchParams({
      where,
      outFields:          OUT_FIELDS,
      returnGeometry:     'false',
      resultOffset:       offset,
      resultRecordCount:  PAGE_SIZE,
      f:                  'json',
    });

    const url = `https://${GIS_HOST}${GIS_PATH}?${params.toString()}`;
    const resp = await httpGet(url);

    if (resp.error) {
      throw new Error(`API error for ${city}: ${JSON.stringify(resp.error)}`);
    }

    const features = resp.features || [];
    records.push(...features.map(f => f.attributes));

    if (!resp.exceededTransferLimit || features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return records;
}

// ── Sleep ─────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Dedup: check if PID already in master_leads ──────────────────────────────
async function loadExistingPids() {
  if (NO_DEDUP) return new Set();
  process.stdout.write('  Loading existing PIDs from master_leads... ');
  const snap = await db.collection('master_leads')
    .where('source', '==', 'HennepinCounty_GIS_$1M+_Homestead')
    .select('propertyPid')
    .get();
  const pids = new Set(snap.docs.map(d => d.data().propertyPid).filter(Boolean));
  console.log(`${pids.size} already ingested`);
  return pids;
}

// ── Format home value for display ─────────────────────────────────────────────
function fmtVal(n) {
  if (!n) return '$1M+';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

// ── Build master_lead object from parcel record ───────────────────────────────
function buildLead(record) {
  const ownerRaw    = (record.TAXPAYER_NM  || record.OWNER_NM || '').trim();
  const owner2Raw   = (record.TAXPAYER_NM_1 || '').trim();

  if (isSkippable(ownerRaw)) return null;

  const name = parseName(ownerRaw);
  if (!name || !name.firstName) return null;

  // TAXPAYER_NM_1 is sometimes the second co-owner, sometimes the mailing address
  // Discard if it looks like a street address (starts with digit)
  const hasSecondOwner = owner2Raw && !/^\d/.test(owner2Raw) && !isSkippable(owner2Raw);
  const owner2 = hasSecondOwner ? parseName(owner2Raw) : null;

  const city  = (record.MAILING_MUNIC_NM || '').trim();
  const city2 = city.charAt(0) + city.slice(1).toLowerCase(); // "WAYZATA" → "Wayzata"

  const houseNo   = record.HOUSE_NO || '';
  const streetNm  = (record.STREET_NM || '').trim();
  const streetNmTc = streetNm.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const propertyAddress = `${houseNo} ${streetNmTc}`.trim();

  const homeValue  = record.MKT_VAL_TOT || 0;
  const salePrice  = record.SALE_PRICE  || 0;

  // AUM scoring signals
  const fitScore = homeValue >= 5000000 ? 95
    : homeValue >= 3000000 ? 88
    : homeValue >= 2000000 ? 82
    : homeValue >= 1500000 ? 76
    : 70;

  return {
    // Identity
    firstName:   name.firstName,
    lastName:    name.lastName,
    name:        `${name.firstName} ${name.lastName}`.trim(),

    // Co-owner (spouse/partner) — stored for context, not used in routing
    coOwnerName: owner2 ? `${owner2.firstName} ${owner2.lastName}`.trim() : '',

    // Location
    city:        city2,
    state:       'MN',
    location:    `${city2}, MN`,
    zip:         (record.ZIP_CD || '').trim(),

    // Property
    propertyAddress,
    propertyPid:   record.PID || '',
    homeValue,
    salePrice,
    buildYear:     record.BUILD_YR || '',
    propertyType:  (record.PR_TYP_NM1 || '').trim(),

    // Scoring
    fitScore,
    timingScore:   72,
    priorityScore: fitScore,
    assets:        fmtVal(homeValue),

    // Classification — wealth confirmed, profession TBD pending PDL
    // nicheId 'henrys' routes to Jeremy Jackson who covers all MN geographies
    nicheId:  'henrys',
    niche:    'High Net Worth Homeowner',

    // Pipeline state
    status:      'New',
    source:      'HennepinCounty_GIS_$1M+_Homestead',
    enrichmentStatus: 'pending',

    // Signals for the drawer — shows advisor WHY this person is a target
    signals: [
      `🏡 ${fmtVal(homeValue)} home in ${city2}`,
      homeValue >= 2000000 ? '💎 Ultra-High Net Worth property' : '💰 High Net Worth property',
      salePrice > 0 ? `📋 Purchased at ${fmtVal(salePrice)}` : '📋 Long-term owner of record',
      record.BUILD_YR ? `🏗️ Property built ${record.BUILD_YR}` : null,
    ].filter(Boolean),

    tags: ['🏡 Property-Backed HNW'],

    // Metadata
    _fromFirestore: false,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Hennepin County $1M+ Homestead Miner         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const citiesToRun = CITY_FILTER
    ? [CITY_FILTER.toUpperCase()]
    : WESTERN_SUBURBS;

  console.log(`Mode:         ${DRY_RUN ? '🔍 DRY RUN — no writes' : '✍️  LIVE — will write to Firestore'}`);
  console.log(`Min value:    ${fmtVal(MIN_VALUE)}`);
  console.log(`Cities:       ${citiesToRun.join(', ')}`);
  console.log(`Limit:        ${LIMIT === 9999 ? 'no limit' : LIMIT}`);
  console.log(`Dedup:        ${NO_DEDUP ? 'OFF' : 'ON (skips existing PIDs)'}`);
  console.log('');

  // Load existing PIDs for dedup
  const existingPids = await loadExistingPids();

  // Mine all cities
  console.log('Mining Hennepin County GIS...\n');
  let allRecords = [];

  for (const city of citiesToRun) {
    process.stdout.write(`  ${city.padEnd(22)} → `);
    try {
      const records = await fetchParcelsForCity(city);
      console.log(`${records.length} parcels ≥ ${fmtVal(MIN_VALUE)}`);
      allRecords.push(...records);
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
    }
    await sleep(300); // polite delay between city requests
  }

  console.log(`\nTotal parcels fetched: ${allRecords.length}`);

  // Parse and filter
  const leads = [];
  let skipNonIndividual = 0;
  let skipDuplicate     = 0;
  let skipBadName       = 0;

  for (const record of allRecords) {
    // Skip non-individuals (trusts, LLCs, etc.)
    const ownerRaw = (record.TAXPAYER_NM || record.OWNER_NM || '').trim();
    if (isSkippable(ownerRaw)) { skipNonIndividual++; continue; }

    // Dedup
    if (existingPids.has(record.PID)) { skipDuplicate++; continue; }

    const lead = buildLead(record);
    if (!lead) { skipBadName++; continue; }

    leads.push(lead);
    if (leads.length >= LIMIT) break;
  }

  console.log(`\n── Parse Results ───────────────────────────────────────────────`);
  console.log(`  ✅ Valid individual leads:  ${leads.length}`);
  console.log(`  ⏭  Non-individual (trust/LLC): ${skipNonIndividual}`);
  console.log(`  ⏭  Already in Firestore:    ${skipDuplicate}`);
  console.log(`  ⏭  Bad/missing name:         ${skipBadName}`);

  // Home value distribution
  const v3m = leads.filter(l => l.homeValue >= 3000000).length;
  const v2m = leads.filter(l => l.homeValue >= 2000000 && l.homeValue < 3000000).length;
  const v1m = leads.filter(l => l.homeValue >= 1000000 && l.homeValue < 2000000).length;
  console.log(`\n── Value Breakdown ─────────────────────────────────────────────`);
  console.log(`  $3M+:   ${v3m}`);
  console.log(`  $2M–3M: ${v2m}`);
  console.log(`  $1M–2M: ${v1m}`);

  // Sample preview
  console.log(`\n── Sample Leads (first 8) ──────────────────────────────────────`);
  leads.slice(0, 8).forEach((l, i) => {
    const coOwner = l.coOwnerName ? ` & ${l.coOwnerName}` : '';
    console.log(`  ${String(i+1).padStart(2)}. ${(l.name + coOwner).padEnd(40)} ${l.city.padEnd(16)} ${fmtVal(l.homeValue)}`);
  });

  if (DRY_RUN) {
    console.log('\n  🔍 DRY RUN complete. Remove --dry-run to write to Firestore.');
    console.log(`  Will ingest ${leads.length} verified HNW homeowner leads.\n`);
    process.exit(0);
  }

  if (leads.length === 0) {
    console.log('\n  ℹ️  No new leads to ingest.\n');
    process.exit(0);
  }

  // Write to Firestore in batches of 400
  console.log(`\n── Writing ${leads.length} leads to master_leads...`);
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(lead => {
      const ref = db.collection('master_leads').doc();
      batch.set(ref, lead);
    });
    await batch.commit();
    written += chunk.length;
    console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1} committed (${chunk.length} docs) — ${written}/${leads.length} total`);
    if (i + BATCH_SIZE < leads.length) await sleep(500);
  }

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   HENNEPIN MINER SUMMARY                                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  ✅ Leads ingested:     ${written}`);
  console.log(`  🏡 $3M+ ultra-HNW:    ${v3m}`);
  console.log(`  💰 $2M–3M high-value: ${v2m}`);
  console.log(`  📋 $1M–2M core:       ${v1m}`);
  console.log(``);
  console.log(`  Next steps:`);
  console.log(`  1. Run PDL enrichment to discover professions:`);
  console.log(`     node scripts/agent_pdl_enrich.js --state MN \\`);
  console.log(`       --cities "Wayzata,Minnetonka,Plymouth,Eden Prairie" \\`);
  console.log(`       --no-contact-only --limit 100`);
  console.log(`  2. Route new leads to Jeremy Jackson:`);
  console.log(`     node scripts/route_new_leads.js --advisor jeremy`);
  console.log(`  3. Update pipeline meta:`);
  console.log(`     node scripts/write_pipeline_meta.js`);
  console.log(``);
  process.exit(0);
}

main().catch(e => {
  console.error('[HennepinMiner] FATAL:', e.message);
  process.exit(1);
});
