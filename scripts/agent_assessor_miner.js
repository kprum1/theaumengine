#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A15: Hennepin County Assessor GIS Miner
// scripts/agent_assessor_miner.js
//
// Data source: Hennepin County LAND_PROPERTY MapServer (free, no key)
// API: https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1
//
// What it does:
//   Queries the Hennepin County parcel layer for residential homeowners
//   (HMSTD_CD1 = 'H') with property market values above a threshold,
//   filtered by target cities (Wayzata branch geography). Returns names,
//   addresses, and property values as real estate wealth signals.
//
// Why this source:
//   - FREE, no API key, no rate limit (public gov data)
//   - Updated monthly by Hennepin County GIS office
//   - 400,000+ parcels across all of Hennepin County
//   - High-value homestead owners = individual people (not LLCs)
//     with significant real estate wealth — directly ICP-aligned
//   - Includes sale date + price → recent buyers = fresh wealth events
//
// Niche production:
//   Primary:   'Real Estate Developers' — recent high-value buyers
//   Secondary: 'Business Owners' — non-homestead + high value (LLC owners)
//   Default:   'C-Suite Executives' — $1.5M+ homestead owners
//
// Usage:
//   node scripts/agent_assessor_miner.js                         # Default: western suburbs, $1M+
//   node scripts/agent_assessor_miner.js --min-value 1500000     # $1.5M+ only
//   node scripts/agent_assessor_miner.js --city MINNETONKA       # Single city
//   node scripts/agent_assessor_miner.js --city all              # All Hennepin cities
//   node scripts/agent_assessor_miner.js --recent-sales          # Recent buyers (sale 2022+)
//   node scripts/agent_assessor_miner.js --limit 200
//   node scripts/agent_assessor_miner.js --dry-run
//
// Output: scripts/staging/raw/alfred_batch_assessor_{geo}_{date}.raw.json
//
// After running:
//   node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_assessor_*.raw.json
//   node scripts/lead_ingest_agent.js --file <scrubbed>
//   node scripts/trigger_routing.js
//   node scripts/write_pipeline_meta.js
// ============================================================

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag   = (f) => args.includes(f);
const MIN_VALUE = parseInt(getArg('--min-value') || '1000000', 10);
const LIMIT     = parseInt(getArg('--limit')     || '200', 10);
const CITY_ARG  = (getArg('--city') || 'wayzata-suburbs').toUpperCase().replace(/-/g, ' ');
const DRY_RUN   = hasFlag('--dry-run');
const RECENT    = hasFlag('--recent-sales');   // Filter for sale date 2022+

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().split('T')[0];

// ── Target geographies ────────────────────────────────────────
// Wayzata branch ICP: western Minneapolis suburbs (Hennepin County)
const WAYZATA_SUBURBS = [
  'WAYZATA',
  'MINNETONKA',
  'PLYMOUTH',
  'EDEN PRAIRIE',
  'EDINA',
  'GOLDEN VALLEY',
  'HOPKINS',
  'ST LOUIS PARK',
  'ORONO',
  'LONG LAKE',
  'DEEPHAVEN',
  'SHOREWOOD',
  'CHANHASSEN',    // Carver County but common in Hennepin GIS
];

// Determine which cities to query
let TARGET_CITIES;
if (CITY_ARG === 'ALL') {
  TARGET_CITIES = null;   // No city filter — query all Hennepin
} else if (CITY_ARG === 'WAYZATA SUBURBS') {
  TARGET_CITIES = WAYZATA_SUBURBS;
} else {
  TARGET_CITIES = [CITY_ARG];
}

// ── AUM / scoring by property value band ─────────────────────
function scoringByValue(mktVal) {
  if (mktVal >= 3000000) return { aum: '$5M–$20M',  band: '5m+',   fitScore: 92, timing: 78 };
  if (mktVal >= 2000000) return { aum: '$3M–$10M',  band: '1m-5m', fitScore: 88, timing: 74 };
  if (mktVal >= 1500000) return { aum: '$2M–$6M',   band: '1m-5m', fitScore: 84, timing: 70 };
  return                        { aum: '$1M–$3M',   band: '1m-5m', fitScore: 78, timing: 65 };
}

// Boost timing score for recent sales (fresh wealth event / new ownership)
function timingBoostForSale(saleDateStr) {
  if (!saleDateStr || saleDateStr.trim() === '') return 0;
  const yr = parseInt(saleDateStr.slice(0, 4), 10);
  if (yr >= 2024) return 15;  // Very recent — high timing
  if (yr >= 2022) return 8;
  if (yr >= 2020) return 3;
  return 0;
}

// Parse YYYYMM sale date to readable format
function parseSaleDate(s) {
  if (!s || s.trim() === '') return null;
  const yr  = s.slice(0, 4);
  const mo  = s.slice(4, 6);
  if (!yr || yr === '0000') return null;
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(mo,10)] || mo} ${yr}`;
}

// ── Name parsing ──────────────────────────────────────────────
// OWNER_NM format examples:
//   "SMITH JOHN A & JANE B"  → firstName=John, lastName=Smith
//   "ANDERSON KAREN M"       → firstName=Karen, lastName=Anderson
//   "BLACK HILLS LLC"        → skip (non-individual)
const LLC_PATTERNS = /\b(LLC|INC|CORP|LTD|TRUST|FOUNDATION|PROPERTIES|HOLDINGS|INVESTMENT|REALTY|CHURCH|COUNTY|CITY OF|STATE OF)\b/i;

function parseName(ownerNm) {
  if (!ownerNm) return null;
  const cleaned = ownerNm.trim();
  if (LLC_PATTERNS.test(cleaned)) return null;  // Skip non-individual entities

  // Remove trailing "&..." (joint owners) — keep primary owner
  const primary = cleaned.split(/\s*&\s*/)[0].trim();

  // Format is typically LASTNAME FIRSTNAME [MIDDLE] or LASTNAME FIRSTNAME
  const parts = primary.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  // Hennepin County OWNER_NM format: FIRSTNAME [MIDDLE] LASTNAME
  // Verified from live API: "MICHAEL AFREMOV", "THEODORE BIGOS", "PERRY J SCHMIDT"
  // parts[0] = first name (given), parts[last] = last name (family)
  const givenName  = _title(parts[0]);
  const familyName = _title(parts[parts.length - 1]);

  // Basic validation: both must look like names (no digits, min 2 chars)
  if (givenName.length < 2 || familyName.length < 2) return null;
  if (/\d/.test(givenName) || /\d/.test(familyName)) return null;

  return { firstName: givenName, lastName: familyName };
}

function _title(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function _fmtAddress(rec) {
  const house = rec.HOUSE_NO ? String(rec.HOUSE_NO) : '';
  const street = _title((rec.STREET_NM || '').trim());
  return `${house} ${street}`.trim();
}

// ── GIS API helper ────────────────────────────────────────────
const GIS_BASE = 'https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1/query';
const FIELDS   = 'OWNER_NM,TAXPAYER_NM,HOUSE_NO,STREET_NM,MAILING_MUNIC_NM,ZIP_CD,MKT_VAL_TOT,SALE_PRICE,SALE_DATE,BUILD_YR,PR_TYP_NM1,HMSTD_CD1';
const MAX_PAGE = 2000;  // Server-enforced max per page

function fetchGis(params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      f:              'json',
      outFields:      FIELDS,
      returnGeometry: 'false',
      ...params,
    }).toString();

    const url = `${GIS_BASE}?${qs}`;

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
        catch(e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('GIS request timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Query one city (or all) with pagination ───────────────────
async function queryCity(cityName, leads, seen) {
  let offset = 0;
  let pageCount = 0;

  // Build WHERE clause
  const valueClause = `MKT_VAL_TOT >= ${MIN_VALUE}`;
  const homesteadClause = `HMSTD_CD1 = 'H'`;  // Residential homestead only
  const cityClause = cityName ? `MAILING_MUNIC_NM = '${cityName}'` : null;
  const recentClause = RECENT ? `SALE_DATE >= '202200'` : null;

  const whereParts = [valueClause, homesteadClause];
  if (cityClause) whereParts.push(cityClause);
  if (recentClause) whereParts.push(recentClause);
  const where = whereParts.join(' AND ');

  while (leads.length < LIMIT) {
    pageCount++;
    let result;
    try {
      result = await fetchGis({
        where,
        orderByFields: 'MKT_VAL_TOT DESC',
        resultRecordCount: Math.min(MAX_PAGE, LIMIT - leads.length + 50),
        resultOffset: offset,
      });
    } catch(e) {
      console.log(`  [GIS] ERROR on page ${pageCount}: ${e.message}`);
      break;
    }

    if (result.error) {
      console.log(`  [GIS] API error: ${result.error.message}`);
      break;
    }

    const features = result.features || [];
    if (features.length === 0) break;

    for (const feat of features) {
      if (leads.length >= LIMIT) break;
      const rec = feat.attributes;
      if (!rec) continue;

      const mktVal = rec.MKT_VAL_TOT || 0;
      if (mktVal < MIN_VALUE) continue;

      // Parse name — skip LLCs and invalid names
      const name = parseName(rec.OWNER_NM);
      if (!name) continue;

      // Dedup by owner name + address
      const key = `${rec.OWNER_NM}|${rec.HOUSE_NO}|${rec.STREET_NM}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const city     = _title((rec.MAILING_MUNIC_NM || '').trim());
      const zip      = (rec.ZIP_CD || '').trim();
      const address  = _fmtAddress(rec);
      const saleDate = parseSaleDate(rec.SALE_DATE);
      const salePrice = rec.SALE_PRICE > 0 ? rec.SALE_PRICE : null;
      const buildYr  = rec.BUILD_YR && rec.BUILD_YR !== '0000' ? rec.BUILD_YR : null;
      const propType = rec.PR_TYP_NM1 || '';

      const scoring      = scoringByValue(mktVal);
      const timingBoost  = timingBoostForSale(rec.SALE_DATE);
      const finalTiming  = Math.min(95, scoring.timing + timingBoost);

      // Niche assignment
      let niche, nicheId;
      if (saleDate && parseInt((rec.SALE_DATE || '0').slice(0, 4), 10) >= 2020 && salePrice && salePrice > 800000) {
        niche   = 'Real Estate Developers';
        nicheId = 're-developers';
      } else {
        niche   = 'C-Suite Executives';
        nicheId = 'c-suite-executives';
      }

      const propertyUrl = `https://www16.co.hennepin.mn.us/pins/pidresult.jsp?pid=${(rec.PID || '').replace(/-/g, '')}`;
      const gisUrl      = `https://gis.hennepin.us/property/map/default.aspx?pid=${(rec.PID || '').replace(/-/g, '')}`;
      const verifyUrl   = `https://www.hennepin.us/residents/property/property-information`;

      // Outreach angle by property value
      let outreachAngle;
      if (mktVal >= 3000000) {
        outreachAngle = 'Real estate concentration risk — $3M+ property w/o full diversification strategy';
      } else if (timingBoost >= 8) {
        outreachAngle = `Recent home purchase (${saleDate}) — post-close liquidity and mortgage integration planning`;
      } else {
        outreachAngle = 'High real estate equity — asset diversification and legacy/estate planning';
      }

      leads.push({
        firstName:    name.firstName,
        lastName:     name.lastName,
        title:        'Homeowner — high-value residential property',
        company:      '',   // No company for individual homeowners
        address:      address,
        city,
        state:        'MN',
        zip,
        niche,
        nicheId,
        estimatedAUM: scoring.aum,
        aumBand:      scoring.band,
        fitScore:     scoring.fitScore,
        timingScore:  finalTiming,
        source:       'Hennepin County Assessor GIS',
        sourceUrl:    verifyUrl,
        needsEnrichment: true,   // No phone/email — needs enrichment
        batchId:      `alfred_batch_assessor_${TODAY}`,
        propertyValue: mktVal,
        saleDate:     saleDate || null,
        salePrice:    salePrice,
        buildYear:    buildYr,
        propertyType: propType,
        reasonCodes: [
          `Hennepin County parcel — market value $${mktVal.toLocaleString()} (homestead)`,
          saleDate
            ? `Property purchased ${saleDate}${salePrice ? ` for $${salePrice.toLocaleString()}` : ''}`
            : `Long-term owner — $${mktVal.toLocaleString()} assessed value`,
          outreachAngle,
        ],
        signals: {
          estimatedAssets: scoring.aum,
          propertyValue:   `$${mktVal.toLocaleString()}`,
          propertyAddress: `${address}, ${city}, MN ${zip}`,
          saleDate:        saleDate || 'Long-term owner',
          salePrice:       salePrice ? `$${salePrice.toLocaleString()}` : null,
          buildYear:       buildYr,
          relationship:    'None — cold (Hennepin County GIS public data)',
          nextEvent:       saleDate ? 'Post-purchase — mortgage integration, liquidity planning' : 'Ongoing — estate + diversification',
          outreachAngle,
          verifyUrl,
          gisMapsUrl:      gisUrl,
          urgency:         timingBoost >= 8 ? 'HIGH — recent buyer' : 'STANDARD',
        },
      });
    }

    // If server returns fewer records than requested, we've exhausted the dataset
    if (features.length < Math.min(MAX_PAGE, LIMIT) || !result.exceededTransferLimit) break;

    offset += features.length;
    await sleep(300);
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A15: Hennepin County Assessor Miner     ║');
  console.log('║  Free · No key · Monthly updated · 400K+ parcels           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('[GIS] DRY RUN — no file will be written');
  console.log(`[GIS] Min property value: $${MIN_VALUE.toLocaleString()}`);
  console.log(`[GIS] Max leads: ${LIMIT}`);
  console.log(`[GIS] Cities: ${TARGET_CITIES ? TARGET_CITIES.join(', ') : 'All Hennepin County'}`);
  if (RECENT) console.log('[GIS] Recent sales filter: ON (sale 2022+)');

  const leads = [];
  const seen  = new Set();
  const citiesToRun = TARGET_CITIES || [null];  // null = no city filter (all)

  for (const city of citiesToRun) {
    if (leads.length >= LIMIT) break;
    if (city) {
      process.stdout.write(`  [GIS] ${city}…`);
    } else {
      process.stdout.write(`  [GIS] All Hennepin County (paginated)…`);
    }

    const beforeCount = leads.length;
    await queryCity(city, leads, seen);
    const added = leads.length - beforeCount;
    console.log(` +${added} leads (total: ${leads.length})`);

    await sleep(200);
  }

  console.log(`\n[GIS] ✅ Total leads: ${leads.length}`);

  if (leads.length === 0) {
    console.log('[GIS] No parcels matched. Try lowering --min-value or adding more cities.');
    console.log('  → Default filter: HMSTD_CD1=H (homestead), MKT_VAL_TOT >= $1M');
    return;
  }

  // Summary stats
  const avgVal = Math.round(leads.reduce((s, l) => s + (l.propertyValue || 0), 0) / leads.length);
  const recent  = leads.filter(l => l.timingScore >= 78).length;
  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`  Avg property value: $${avgVal.toLocaleString()}`);
  console.log(`  High-timing leads (score ≥ 78): ${recent}`);
  console.log(`  Niches: ${[...new Set(leads.map(l=>l.niche))].join(', ')}`);

  // Preview top 5
  console.log('\n── Sample leads ────────────────────────────────────');
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i+1}. ${l.firstName} ${l.lastName} — ${l.city}, MN`);
    console.log(`     Property: $${(l.propertyValue||0).toLocaleString()} | ${l.address}`);
    console.log(`     AUM est: ${l.estimatedAUM} | TimingScore: ${l.timingScore}${l.saleDate ? ` | Sold: ${l.saleDate}` : ''}`);
    console.log(`     Niche: ${l.niche}`);
  });

  if (DRY_RUN) {
    console.log('\n[GIS] DRY RUN — skipping file write.');
    console.log('\nFull sample lead JSON:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  // Write output
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
  const geoSlug   = TARGET_CITIES === null ? 'all_hennepin'
    : (CITY_ARG === 'WAYZATA SUBURBS' ? 'wayzata_suburbs'
    : CITY_ARG.toLowerCase().replace(/\s+/g, '_'));
  const outputFile = path.join(STAGING_DIR, `alfred_batch_assessor_${geoSlug}_${TODAY}.raw.json`);
  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

  console.log(`\n[GIS] ✅ Raw batch → ${path.basename(outputFile)} (${sizeKB} KB)`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log(`  1. Scrub:    node scripts/scrub_leads.js --file ${outputFile}`);
  console.log(`  2. Ingest:   node scripts/lead_ingest_agent.js --file <scrubbed>`);
  console.log(`  3. Route:    node scripts/trigger_routing.js`);
  console.log(`  4. KPI sync: node scripts/write_pipeline_meta.js`);
  console.log('\n── Production cadence ──────────────────────────────');
  console.log('  Run monthly (Hennepin GIS updates monthly):');
  console.log('  node scripts/agent_assessor_miner.js --recent-sales  # Fresh buyers');
  console.log('  node scripts/agent_assessor_miner.js --min-value 2000000  # Premium tier');
}

main().catch(err => {
  console.error('[GIS] FATAL:', err.message);
  process.exit(1);
});
