#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A3: NPI Registry Miner
// scripts/agent_npi_miner.js
//
// Data source: CMS National Provider Identifier (NPI) Registry
// API: https://npiregistry.cms.hhs.gov/api/  (free, no key)
//
// What it does:
//   1. Queries CMS NPI API for physicians and dentists by specialty
//   2. Filters for individual providers (not groups) in target specialties
//   3. Outputs clean batch JSON to scripts/staging/
//
// Usage:
//   node scripts/agent_npi_miner.js
//   node scripts/agent_npi_miner.js --niche physicians --state TX --limit 50
//   node scripts/agent_npi_miner.js --niche dentists --state FL
//   node scripts/agent_npi_miner.js --dry-run
//
// Niches produced: physicians, dentists
// Output: scripts/staging/alfred_batch_npi_{niche}_{date}.json
// ============================================================

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// ── CLI args ────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag   = (flag) => args.includes(flag);
const NICHE_ARG = getArg('--niche') || 'physicians'; // 'physicians' | 'dentists' | 'all'
const STATE     = getArg('--state') || null;
const LIMIT     = parseInt(getArg('--limit') || '100', 10);
const DRY_RUN   = hasFlag('--dry-run');

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().split('T')[0];

// ── NPI Taxonomy Codes ───────────────────────────────────────
// Source: nucc.org/index.php/code-sets-mainmenu-41
const TAXONOMIES = {
  physicians: [
    { code: '207RC0000X', label: 'Cardiovascular Disease (Cardiology)' },
    { code: '207X00000X', label: 'Orthopaedic Surgery' },
    { code: '207N00000X', label: 'Dermatology' },
    { code: '207P00000X', label: 'Emergency Medicine' },
    { code: '208G00000X', label: 'Thoracic Surgery (Cardiothoracic)' },
    { code: '208200000X', label: 'Plastic Surgery' },
    { code: '2086S0122X', label: 'Surgery of the Hand' },
    { code: '207Y00000X', label: 'Pulmonary Disease' },
    { code: '207RN0300X', label: 'Nephrology' },
    { code: '207VG0400X', label: 'Gynecologic Oncology' },
    { code: '207W00000X', label: 'Ophthalmology' },
    { code: '207L00000X', label: 'Anesthesiology' },
    { code: '2085R0202X', label: 'Diagnostic Radiology' },
    { code: '2085H0002X', label: 'Neurological Surgery' },
  ],
  dentists: [
    { code: '1223G0001X', label: 'General Practice' },
    { code: '1223P0221X', label: 'Orthodontics & Dentofacial Orthopedics' },
    { code: '1223S0112X', label: 'Oral & Maxillofacial Surgery' },
    { code: '1223E0200X', label: 'Endodontics' },
    { code: '1223X0400X', label: 'Prosthodontics' },
    { code: '1223P0300X', label: 'Periodontics' },
    { code: '1223D0001X', label: 'Dental Public Health' },
  ],
};

// All valid dental taxonomy codes — used for post-fetch filtering
const DENTAL_CODES = new Set([
  '1223G0001X', // General Practice
  '1223P0221X', // Orthodontics
  '1223S0112X', // Oral & Maxillofacial Surgery
  '1223E0200X', // Endodontics
  '1223X0400X', // Prosthodontics
  '1223P0300X', // Periodontics
  '1223D0001X', // Dental Public Health
  '1223P0700X', // Pediatric Dentistry
  '1223X0008X', // Oral & Maxillofacial Radiology
]);

// AUM estimates by specialty (physician income proxy)
const PHYSICIAN_AUM = {
  '207RC0000X': { aum: '$2M–$5M', band: '1m-5m', fitScore: 88, timing: 72 },
  '207X00000X': { aum: '$2M–$6M', band: '1m-5m', fitScore: 86, timing: 70 },
  '208200000X': { aum: '$2M–$8M', band: '1m-5m', fitScore: 90, timing: 75 },
  '207L00000X': { aum: '$1.5M–$4M', band: '1m-5m', fitScore: 84, timing: 68 },
  '2085R0202X': { aum: '$1.5M–$4M', band: '1m-5m', fitScore: 82, timing: 65 },
};
const DEFAULT_PHYSICIAN_AUM = { aum: '$1M–$3M', band: '1m-5m', fitScore: 80, timing: 65 };
const DEFAULT_DENTIST_AUM   = { aum: '$750K–$2M', band: '500k-1m', fitScore: 78, timing: 68 };

// ── API helper ───────────────────────────────────────────────
function npiSearch(params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      version:          '2.1',
      enumeration_type: 'NPI-1', // Individual providers only (not org)
      limit:            '200',
      ...params,
    }).toString();

    const url = `https://npiregistry.cms.hhs.gov/api/?${qs}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch(e) {
          reject(new Error(`JSON parse error: ${e.message}\nURL: ${url}`));
        }
      });
    }).on('error', reject);
  });
}

// ── Lead builder from NPI result ────────────────────────────
function buildLead(result, nicheId, specialtyLabel, aumData) {
  const basic = result.basic || {};
  const addresses = result.addresses || [];
  const taxonomies = result.taxonomies || [];

  // Get practice address (location type = 'LOCATION' preferred over mailing)
  const practiceAddr = addresses.find(a => a.address_purpose === 'LOCATION')
    || addresses[0]
    || {};

  const firstName = _title(basic.first_name || '');
  const lastName  = _title(basic.last_name  || '');
  if (!firstName || !lastName) return null; // Skip incomplete records

  const credential = basic.credential ? basic.credential.replace(/\./g, '') : '';
  const gender     = basic.gender || '';

  // Practice info from first active taxonomy
  const activeTax = taxonomies.find(t => t.primary) || taxonomies[0] || {};
  const specialty  = activeTax.desc || specialtyLabel;

  const city  = _title(practiceAddr.city   || '');
  const state = practiceAddr.state || '';
  const phone = practiceAddr.telephone_number || '';
  const org   = _title(basic.organization_name || activeTax.organization_name || '');

  const npi = result.number;
  const verifyUrl = `https://npiregistry.cms.hhs.gov/provider-view/${npi}`;

  // Determine outreach angle by specialty
  let outreachAngle = 'Practice income complexity and retirement gap strategy';
  if (nicheId === 'physicians') {
    if (specialty.toLowerCase().includes('surgery') || specialty.toLowerCase().includes('surgical')) {
      outreachAngle = 'Surgical income complexity + malpractice exposure + practice succession';
    } else if (specialty.toLowerCase().includes('cardio')) {
      outreachAngle = 'High-income cash flow, hospital system transition options, retirement timing';
    }
  } else if (nicheId === 'dentists') {
    outreachAngle = 'DSO buyout optionality, practice value, buy-in/out complexity';
  }

  return {
    firstName,
    lastName,
    credential,
    title:        `${credential || 'MD'} — ${specialty}`,
    company:      org || `${lastName} ${credential || 'Medical'} Practice`,
    city,
    state,
    phone:        phone || '',  // Office phone — needs personal enrichment
    niche:        nicheId === 'physicians' ? 'Physicians & Surgeons' : 'Dentists & Specialists',
    nicheId,
    estimatedAUM: aumData.aum,
    aumBand:      aumData.band,
    fitScore:     aumData.fitScore,
    timingScore:  aumData.timing,
    npi,
    gender,
    source:       'CMS NPI Registry',
    sourceUrl:    verifyUrl,
    needsEnrichment: true, // Office phone present but no personal email or cell
    batchId:      `alfred_batch_npi_${nicheId}_${TODAY}`,
    reasonCodes: [
      `NPI-registered ${specialty}`,
      city ? `${city}, ${state} — practice location confirmed` : `${state} — NPI verified`,
      phone ? 'Office phone on record' : 'Contact enrichment needed',
    ],
    signals: {
      estimatedAssets: aumData.aum,
      specialty,
      npi,
      officePhone:     phone || null,
      relationship:    'None — cold (CMS public registry)',
      nextEvent:       nicheId === 'dentists'
        ? 'DSO acquisition wave — evaluate before offer arrives'
        : 'Practice valuation / succession planning horizon',
      outreachAngle,
      verifyUrl,
    },
  };
}

function _title(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Run one niche ─────────────────────────────────────────────
async function runNiche(nicheId) {
  const taxonomyList = TAXONOMIES[nicheId];
  if (!taxonomyList) throw new Error(`Unknown niche: ${nicheId}`);

  console.log(`\n[NPI Agent] Running niche: ${nicheId} (${taxonomyList.length} specialty codes)`);

  const leads = [];
  const seen  = new Set();

  for (const { code, label } of taxonomyList) {
    if (leads.length >= LIMIT) break;

    // Use taxonomy_description for the API search (taxonomy_code param not supported by v2.1)
    const params = { taxonomy_description: label };
    if (STATE) params.state = STATE;

    process.stdout.write(`  [NPI] Querying: ${label}…`);

    let result;
    try {
      result = await npiSearch(params);
    } catch(e) {
      console.log(` ERROR: ${e.message}`);
      continue;
    }

    const results = result.results || [];
    console.log(` ${results.length} results`);

    for (const r of results) {
      if (leads.length >= LIMIT) break;
      const npi = r.number;
      if (seen.has(npi)) continue;
      seen.add(npi);

      // Post-filter for dentists: ensure at least one taxonomy code is a dental code
      // The 'General Practice' label also matches RNs, midwives, etc. in the NPI API.
      if (nicheId === 'dentists') {
        const providerCodes = (r.taxonomies || []).map(t => t.code);
        const isDental = providerCodes.some(c => DENTAL_CODES.has(c));
        if (!isDental) continue;
      }

      const aumData = PHYSICIAN_AUM[code] || (nicheId === 'dentists' ? DEFAULT_DENTIST_AUM : DEFAULT_PHYSICIAN_AUM);
      const lead = buildLead(r, nicheId, label, aumData);
      if (lead) leads.push(lead);
    }

    // Rate limit — be a good citizen to the CMS API
    await new Promise(r => setTimeout(r, 300));
  }

  return leads;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const niche = NICHE_ARG;
  console.log('╔══════════════════════════════════════════════════════════════╗');
  if (niche === 'dentists') {
    console.log('║  AUM Engine — Agent A1: NPI Dentist Miner                    ║');
  } else {
    console.log('║  AUM Engine — Agent A3: NPI Physician Miner                  ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('[NPI Agent] DRY RUN — no file will be written');
  if (STATE)   console.log(`[NPI Agent] State filter: ${STATE}`);
  console.log(`[NPI Agent] Niche: ${NICHE_ARG} | Limit: ${LIMIT}`);

  const nichesToRun = NICHE_ARG === 'all'
    ? ['physicians', 'dentists']
    : [NICHE_ARG];

  for (const nicheId of nichesToRun) {
    const leads = await runNiche(nicheId);

    console.log(`\n[NPI Agent] ✅ ${nicheId}: ${leads.length} leads produced`);

    if (leads.length === 0) {
      console.warn('[NPI Agent] ⚠️  No leads — check specialty codes or state filter.');
      continue;
    }

    // Preview
    console.log('\n── Sample leads ────────────────────────────────────');
    leads.slice(0, 3).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.firstName} ${l.lastName}, ${l.credential} — ${l.city}, ${l.state}`);
      console.log(`     Specialty: ${l.signals.specialty}`);
      console.log(`     AUM est: ${l.estimatedAUM} | NPI: ${l.npi}`);
      console.log(`     Verify: ${l.sourceUrl}`);
    });

    if (DRY_RUN) {
      console.log('\n[NPI Agent] DRY RUN — skipping file write.');
      continue;
    }

    // Write output
    if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

    const outputFile = path.join(STAGING_DIR, `alfred_batch_npi_${nicheId}_${TODAY}.raw.json`);
    fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
    const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);

    console.log(`\n[NPI Agent] ✅ Raw batch written: ${path.basename(outputFile)} (${sizeKB} KB)`);
    console.log('\n── Next steps ──────────────────────────────────────');
    console.log(`  1. Scrub:  node scripts/scrub_leads.js --file ${outputFile}`);
    console.log(`  2. Review: node scripts/scrub_leads.js --file ${outputFile} --review-only`);
    console.log(`  3. Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>`);
  }
}

main().catch(err => {
  console.error('[NPI Agent] FATAL:', err.message);
  process.exit(1);
});
