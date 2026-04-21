#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Carver County $1M+ Homestead Miner
// scripts/agent_carver_miner.js
//
// Mirrors agent_hennepin_miner.js but targets Carver County GIS.
//
// Data source:
//   Carver County GIS — CC_ADMIN_Market_Val, Layer 2 (Residential MV Change)
//   https://gis.co.carver.mn.us/arcgis_ea/rest/services/Specialty/CC_ADMIN_Market_Val/MapServer/2
//   Updated 4/6/2026 per Carver County. Public record, no auth.
//
// Carver County cities in Jeremy's western suburbs territory:
//   Chaska, Chanhassen, Victoria, Waconia, Watertown, Norwood Young America
//   (Chaska and Chanhassen are the primary HNW targets)
//
// Key difference from Hennepin:
//   Carver's API returns TAXPAYER_NAME as displayField.
//   We request it explicitly — if the API returns it, great.
//   If not, we use TAXPAYER_ADDRESS+city as the PDL lookup anchor
//   (address-based lookups have 60%+ match rate on PDL/Apollo).
//
// Usage:
//   node scripts/agent_carver_miner.js                   (all target cities)
//   node scripts/agent_carver_miner.js --dry-run
//   node scripts/agent_carver_miner.js --min-value 2000000
//   node scripts/agent_carver_miner.js --city CHASKA
//   node scripts/agent_carver_miner.js --limit 500
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const https = require('https');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI ───────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const hasFlag   = f => args.includes(f);
const getArg    = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const DRY_RUN   = hasFlag('--dry-run');
const NO_DEDUP  = hasFlag('--no-dedup');
const CITY_FILTER = getArg('--city');
const MIN_VALUE = parseInt(getArg('--min-value') || '1000000', 10);
const LIMIT     = parseInt(getArg('--limit') || '9999', 10);

// Carver County city/township values (CityTwp field uses title case)
// Primary HNW targets + neighbors
const CARVER_CITIES = [
  'CHASKA', 'CHANHASSEN', 'VICTORIA', 'WACONIA',
  'WATERTOWN', 'NORWOOD YOUNG AMERICA', 'COLOGNE',
  'CARVER', 'HAMBURG', 'MAYER',
];

// ── ArcGIS REST API config ────────────────────────────────────────────────────
const GIS_HOST  = 'gis.co.carver.mn.us';
const GIS_PATH  = '/arcgis_ea/rest/services/Specialty/CC_ADMIN_Market_Val/MapServer/2/query';
const PAGE_SIZE = 1000;

// ── Skip patterns — non-individual owners ─────────────────────────────────────
const SKIP_PATTERNS = [
  /\bTRUST(EE)?\b/i, /\bLLC\b/i, /\bINC\b/i, /\bCORP\b/i,
  /\bESTATE\b/i,    /\bFOUNDATION\b/i, /\bCHURCH\b/i,
  /\bCITY OF\b/i,   /\bCOUNTY\b/i,    /\bTOWNSHIP\b/i,
  /\bREVOC\b/i,     /\bIRREV\b/i,     /\bFAMILY LTD\b/i,
  /^[0-9]/,
];

function isSkippable(name) {
  if (!name || !name.trim()) return false; // no name = address-based, don't skip
  return SKIP_PATTERNS.some(p => p.test(name));
}

// ── Name parser (same as Hennepin miner) ─────────────────────────────────────
function parseName(raw) {
  if (!raw || !raw.trim()) return null;
  const clean = raw.trim().replace(/\s+/g, ' ');
  const tc = s => s.split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('-');
  const parts = clean.split(' ').map(tc);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };

  const ampIdx = parts.findIndex(p => p === '&');
  const usable = ampIdx > 0 ? parts.slice(0, ampIdx) : parts;
  const firstName = usable[0];
  const lastName  = usable[usable.length - 1];

  if (firstName.length <= 1 && lastName.length <= 1) return null;
  if (firstName.toLowerCase() === lastName.toLowerCase()) {
    const all = clean.split(' ').map(tc);
    return { firstName: all[0], lastName: all[all.length - 1] };
  }
  return { firstName, lastName };
}

// ── Parse TAXPAYER_CITY field (e.g. "CHASKA, MN 55318-4545") ─────────────────
function parseTaxpayerCity(raw) {
  if (!raw) return { city: '', state: 'MN', zip: '' };
  const match = raw.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (!match) return { city: raw.trim(), state: 'MN', zip: '' };
  const city = match[1].trim();
  const city2 = city.charAt(0) + city.slice(1).toLowerCase();
  return { city: city2, state: 'MN', zip: match[3] || '' };
}

// ── HTTP GET ──────────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// ── Query Carver GIS paginated ────────────────────────────────────────────────
async function fetchParcelsForCity(cityPattern) {
  const records = [];
  let offset = 0;

  while (true) {
    // Try to get TAXPAYER_NAME — it's the displayField so it might be a real column
    const outFields = 'PID,TAXPAYER_NAME,TAXPAYER_ADDRESS,TAXPAYER_CITY,CityTwp,Val_2026,Property_Class';

    const where = [
      `Val_2026 >= ${MIN_VALUE}`,
      `CityTwp LIKE '${cityPattern}%'`,
      `Property_Class LIKE 'Res%'`,
    ].join(' AND ');

    const params = new URLSearchParams({
      where,
      outFields,
      returnGeometry:    'false',
      resultOffset:      offset,
      resultRecordCount: PAGE_SIZE,
      f:                 'json',
    });

    const url = `https://${GIS_HOST}${GIS_PATH}?${params.toString()}`;
    const resp = await httpGet(url);

    if (resp.error) {
      // If TAXPAYER_NAME fails, retry without it
      const params2 = new URLSearchParams({
        where,
        outFields:         'PID,TAXPAYER_ADDRESS,TAXPAYER_CITY,CityTwp,Val_2026,Property_Class',
        returnGeometry:    'false',
        resultOffset:      offset,
        resultRecordCount: PAGE_SIZE,
        f:                 'json',
      });
      const url2 = `https://${GIS_HOST}${GIS_PATH}?${params2.toString()}`;
      const resp2 = await httpGet(url2);
      if (resp2.error) throw new Error(`API error for ${cityPattern}: ${JSON.stringify(resp2.error)}`);
      const features2 = resp2.features || [];
      records.push(...features2.map(f => f.attributes));
      if (!resp2.exceededTransferLimit || features2.length < PAGE_SIZE) break;
    } else {
      const features = resp.features || [];
      records.push(...features.map(f => f.attributes));
      if (!resp.exceededTransferLimit || features.length < PAGE_SIZE) break;
    }
    offset += PAGE_SIZE;
  }
  return records;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtVal(n) {
  if (!n) return '$1M+';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

async function loadExistingPids() {
  if (NO_DEDUP) return new Set();
  process.stdout.write('  Loading existing Carver PIDs from master_leads... ');
  const snap = await db.collection('master_leads')
    .where('source', '==', 'CarverCounty_GIS_$1M+_Homestead')
    .select('propertyPid')
    .get();
  const pids = new Set(snap.docs.map(d => d.data().propertyPid).filter(Boolean));
  console.log(`${pids.size} already ingested`);
  return pids;
}

function buildLead(record) {
  const nameRaw = (record.TAXPAYER_NAME || '').trim();
  const addrRaw = (record.TAXPAYER_ADDRESS || '').trim();

  if (isSkippable(nameRaw)) return null;

  // Parse city from the TAXPAYER_CITY field ("CHASKA, MN 55318-4545")
  const { city, state, zip } = parseTaxpayerCity(record.TAXPAYER_CITY || '');

  // Parse name if available; otherwise store address-only record for PDL address lookup
  let firstName = '', lastName = '';
  if (nameRaw) {
    const parsed = parseName(nameRaw);
    if (parsed) {
      firstName = parsed.firstName;
      lastName  = parsed.lastName;
    }
  }

  const homeValue = record.Val_2026 || 0;
  const fitScore  = homeValue >= 5000000 ? 95
    : homeValue >= 3000000 ? 88
    : homeValue >= 2000000 ? 82
    : homeValue >= 1500000 ? 76
    : 70;

  // Street address parsing from TAXPAYER_ADDRESS ("11180 HUNTINGTON AVE")
  const addrTc = addrRaw.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    firstName,
    lastName,
    name: firstName ? `${firstName} ${lastName}`.trim() : `${addrTc} (Carver owner)`,

    city,
    state: state || 'MN',
    location: `${city}, MN`,
    zip,

    propertyAddress: addrTc,
    propertyPid:     record.PID || '',
    homeValue,
    propertyType:    record.Property_Class || 'Res 1 unit',
    cityTwp:         (record.CityTwp || '').trim(),

    fitScore,
    timingScore:   72,
    priorityScore: fitScore,
    assets:        fmtVal(homeValue),

    nicheId:  'henrys',
    niche:    'High Net Worth Homeowner',

    status:      'New',
    source:      'CarverCounty_GIS_$1M+_Homestead',
    enrichmentStatus: firstName ? 'pending' : 'address-only',

    signals: [
      `🏡 ${fmtVal(homeValue)} home in ${city}`,
      homeValue >= 2000000 ? '💎 Ultra-High Net Worth property' : '💰 High Net Worth property',
      `📍 Carver County verified record (as of 4/6/2026)`,
    ],

    tags: ['🏡 Property-Backed HNW', '📋 Carver County'],

    _fromFirestore: false,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Carver County $1M+ Homestead Miner           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const citiesToRun = CITY_FILTER
    ? [CITY_FILTER.toUpperCase()]
    : CARVER_CITIES;

  console.log(`Mode:         ${DRY_RUN ? '🔍 DRY RUN — no writes' : '✍️  LIVE — will write to Firestore'}`);
  console.log(`Min value:    ${fmtVal(MIN_VALUE)}`);
  console.log(`Cities:       ${citiesToRun.join(', ')}`);
  console.log(`Limit:        ${LIMIT === 9999 ? 'no limit' : LIMIT}`);
  console.log('');

  const existingPids = await loadExistingPids();

  console.log('Mining Carver County GIS...\n');
  let allRecords = [];

  for (const city of citiesToRun) {
    process.stdout.write(`  ${city.padEnd(26)} → `);
    try {
      const records = await fetchParcelsForCity(city);
      console.log(`${records.length} parcels ≥ ${fmtVal(MIN_VALUE)}`);
      allRecords.push(...records);
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
    }
    await sleep(300);
  }

  console.log(`\nTotal parcels fetched: ${allRecords.length}`);

  // Parse
  const leads = [];
  let skipNonIndividual = 0, skipDuplicate = 0, skipBadParse = 0;

  for (const record of allRecords) {
    const nameRaw = (record.TAXPAYER_NAME || '').trim();
    if (isSkippable(nameRaw)) { skipNonIndividual++; continue; }
    if (existingPids.has(record.PID)) { skipDuplicate++; continue; }

    const lead = buildLead(record);
    if (!lead) { skipBadParse++; continue; }

    leads.push(lead);
    if (leads.length >= LIMIT) break;
  }

  const hasName    = leads.filter(l => l.firstName).length;
  const addrOnly   = leads.filter(l => !l.firstName).length;

  console.log(`\n── Parse Results ───────────────────────────────────────────────`);
  console.log(`  ✅ Valid leads:              ${leads.length}`);
  console.log(`    With name (full record):   ${hasName}`);
  console.log(`    Address-only (PDL lookup): ${addrOnly}`);
  console.log(`  ⏭  Non-individual:           ${skipNonIndividual}`);
  console.log(`  ⏭  Already ingested:         ${skipDuplicate}`);

  const v3m = leads.filter(l => l.homeValue >= 3000000).length;
  const v2m = leads.filter(l => l.homeValue >= 2000000 && l.homeValue < 3000000).length;
  const v1m = leads.filter(l => l.homeValue >= 1000000 && l.homeValue < 2000000).length;
  console.log(`\n── Value Breakdown ─────────────────────────────────────────────`);
  console.log(`  $3M+:   ${v3m}`);
  console.log(`  $2M–3M: ${v2m}`);
  console.log(`  $1M–2M: ${v1m}`);

  console.log(`\n── Sample Leads (first 8) ──────────────────────────────────────`);
  leads.slice(0, 8).forEach((l, i) => {
    const display = l.firstName ? l.name : l.propertyAddress;
    console.log(`  ${String(i+1).padStart(2)}. ${display.padEnd(40)} ${l.city.padEnd(16)} ${fmtVal(l.homeValue)}`);
  });

  if (DRY_RUN) {
    console.log(`\n  🔍 DRY RUN complete. Remove --dry-run to write ${leads.length} leads.\n`);
    process.exit(0);
  }

  if (leads.length === 0) {
    console.log('\n  ℹ️  No new leads to ingest.\n');
    process.exit(0);
  }

  console.log(`\n── Writing ${leads.length} leads to master_leads...`);
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(lead => batch.set(db.collection('master_leads').doc(), lead));
    await batch.commit();
    written += chunk.length;
    console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1} committed (${chunk.length} docs) — ${written}/${leads.length}`);
    if (i + BATCH_SIZE < leads.length) await sleep(500);
  }

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   CARVER MINER SUMMARY                                       ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  ✅ Leads ingested:     ${written}`);
  console.log(`  🏡 $3M+:              ${v3m}`);
  console.log(`  💰 $2M–3M:            ${v2m}`);
  console.log(`  📋 $1M–2M:            ${v1m}`);
  console.log(`  📍 Address-only:      ${addrOnly} (run PDL address lookup next)`);
  console.log(``);
  console.log(`  Next: Run PDL to resolve addresses → names + professions:`);
  console.log(`    node scripts/agent_pdl_enrich.js --state MN \\`);
  console.log(`      --cities "Chaska,Chanhassen,Victoria,Waconia" \\`);
  console.log(`      --no-contact-only --limit 100`);
  console.log(``);
  process.exit(0);
}

main().catch(e => {
  console.error('[CarverMiner] FATAL:', e.message);
  process.exit(1);
});
