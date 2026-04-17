#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A1: FAA Aircraft Registry Miner
// scripts/agent_faa_miner.js
//
// Data source: FAA Releasable Aircraft Database (public, free)
// URL: https://registry.faa.gov/database/ReleasableAircraft.zip
//
// What it does:
//   1. Downloads the FAA bulk ZIP (updates monthly)
//   2. Parses MASTER.txt (pipe-delimited, all ~350K aircraft)
//   3. Filters for HNW aircraft owned by individuals/LLCs
//   4. Cross-references ACFTREF.txt for aircraft model (value signal)
//   5. Outputs alfred_batch_faa_YYYY_MM_DD.json to scripts/staging/
//
// Usage:
//   export PATH="/opt/homebrew/bin:$PATH"
//   node scripts/agent_faa_miner.js
//   node scripts/agent_faa_miner.js --state TX --limit 50
//   node scripts/agent_faa_miner.js --dry-run   (preview, no file written)
//
// Output: scripts/staging/alfred_batch_faa_YYYY-MM-DD.json
// ============================================================

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync } = require('child_process');

// ── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag   = (flag) => args.includes(flag);
const STATE_FILTER = getArg('--state') || null;   // e.g. 'TX' — null = all states
const LIMIT        = parseInt(getArg('--limit') || '100', 10);
const DRY_RUN      = hasFlag('--dry-run');
const SKIP_DOWNLOAD = hasFlag('--skip-download'); // use cached /tmp/faa_aircraft/ if exists

// ── Config ──────────────────────────────────────────────────
const FAA_ZIP_URL  = 'https://registry.faa.gov/database/ReleasableAircraft.zip';
const TMP_DIR      = path.join(os.tmpdir(), 'faa_aircraft');
const ZIP_PATH     = path.join(os.tmpdir(), 'faa_aircraft.zip');
const MASTER_FILE  = path.join(TMP_DIR, 'MASTER.txt');
const ACFTREF_FILE = path.join(TMP_DIR, 'ACFTREF.txt');
const STAGING_DIR  = path.join(__dirname, 'staging', 'raw');
const TODAY        = new Date().toISOString().split('T')[0];
const OUTPUT_FILE  = path.join(STAGING_DIR, `alfred_batch_faa_${TODAY}.raw.json`);

// ── HNW aircraft manufacturer codes (from ACFTREF.txt MFR field) ──
// These manufacturers produce aircraft typically valued $300K–$30M+
const HNW_MANUFACTURERS = new Set([
  'BEECH', 'BEECHCRAFT',
  'CESSNA',
  'CIRRUS',
  'PIPER',
  'MOONEY',
  'PILATUS',
  'DAHER', 'SOCATA', 'DAHER-SOCATA', 'TBM',
  'ECLIPSE',
  'EMBRAER',
  'BOMBARDIER', 'LEARJET', 'CHALLENGER',
  'GULFSTREAM', 'GRUMMAN AMERICAN',
  'DASSAULT', 'FALCON',
  'HAWKER', 'SIDDELEY', 'RAYTHEON',
  'CESSNA CITATION',
  'ADAM AIRCRAFT',
  'COLUMBIA',
  'DIAMOND',
  'GLASAIR',
  'LANCAIR',
  'VELOCITY',
  'EXTRA',
  'AMERICAN CHAMPION',
]);

// HNW aircraft category codes (from MASTER.txt column indices)
// TYPE AIRCRAFT: 1=Glider, 2=Balloon, 3=Blimp/Dirigible, 4=Fixed Wing Single,
//               5=Fixed Wing Multi, 6=Rotorcraft, 7=Weight-Shift, 8=Powered Parachute, 9=Gyroplane
const HNW_AIRCRAFT_TYPES = new Set(['4', '5', '6']); // Multi-engine, turbine, rotor = higher value

// TYPE REGISTRANT: 1=Individual, 2=Partnership, 3=Corporation, 4=Co-Owner,
//                  5=Government, 7=LLC, 8=Non-Citizen Corp, 9=Non-Citizen Co-Owner
const INDIVIDUAL_OWNER_TYPES = new Set(['1', '2', '4', '7']); // Individual, Partnership, Co-Owner, LLC

// ── MASTER.txt CSV column indices (0-based) ─────────────────
// FAA MASTER.txt is now comma-delimited (CSV).
// Header: N-NUMBER,SERIAL NUMBER,MFR MDL CODE,ENG MFR MDL,YEAR MFR,
//         TYPE REGISTRANT,NAME,STREET,STREET2,CITY,STATE,ZIP CODE,
//         REGION,COUNTY,COUNTRY,LAST ACTION DATE,CERT ISSUE DATE,
//         CERTIFICATION,TYPE AIRCRAFT,TYPE ENGINE,STATUS CODE,
//         MODE S CODE,FRACT OWNER,AIR WORTH DATE,...
const CSV_COL = {
  N_NUMBER:        0,
  SERIAL:          1,
  MFR_MDL_CODE:    2,
  ENG_MFR_MDL:     3,
  YEAR_MFR:        4,
  TYPE_REGISTRANT: 5,
  NAME:            6,
  STREET:          7,
  STREET2:         8,
  CITY:            9,
  STATE:           10,
  ZIP_CODE:        11,
  REGION:          12,
  COUNTY:          13,
  COUNTRY:         14,
  LAST_ACT_DT:     15,
  CERT_ISSUE_DT:   16,
  CERTIFICATION:   17,
  TYPE_AIRCRAFT:   18,
  TYPE_ENGINE:     19,
  STATUS_CODE:     20,
  MODE_S_CODE:     21,
  FRACT_OWNER:     22,
  AIR_WORTH_DATE:  23,
};

function parseCSVLine(line) {
  // Simple CSV split — FAA data doesn't use quoted fields
  return line.split(',').map(f => f.trim());
}

function getField(fields, colKey) {
  const idx = CSV_COL[colKey];
  return (fields[idx] || '').trim();
}

// ── ACFTREF.txt parser — builds a map of MFR_MDL_CODE → {mfr, model} ──
// ACFTREF.txt is now CSV: CODE,MFR,MODEL,TYPE-ACFT,TYPE-ENG,...
function buildAircraftRefMap(acftrefPath) {
  if (!fs.existsSync(acftrefPath)) {
    console.warn('[FAA Agent] ACFTREF.txt not found — model data unavailable');
    return {};
  }
  const lines = fs.readFileSync(acftrefPath, 'utf8').split('\n');
  const map = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('CODE') || trimmed.startsWith('\uFEFFCODE')) continue;
    // CSV: CODE,MFR,MODEL,TYPE-ACFT,...
    const fields = trimmed.split(',');
    const code  = (fields[0] || '').trim();
    const mfr   = (fields[1] || '').trim();
    const model = (fields[2] || '').trim();
    if (code) map[code] = { mfr, model };
  }
  console.log(`[FAA Agent] Aircraft reference map built: ${Object.keys(map).length} models`);
  return map;
}


// ── Name parser — splits "HATCHER DALE R" → {firstName, lastName} ──
function parseName(raw) {
  if (!raw || !raw.trim()) return { firstName: '', lastName: '', fullName: raw };
  const parts = raw.trim().split(/\s+/);

  // If it looks like a company name (INC, LLC, CORP, TRUST, etc.), return as-is
  const companyKeywords = ['INC', 'LLC', 'CORP', 'LTD', 'TRUST', 'FOUNDATION',
                           'ENTERPRISES', 'GROUP', 'HOLDINGS', 'PARTNERS', 'AVIATION'];
  if (parts.some(p => companyKeywords.includes(p.toUpperCase()))) {
    return { firstName: '', lastName: '', fullName: raw.trim(), isCompany: true };
  }

  // FAA format is usually: LASTNAME FIRSTNAME MIDDLEINIT
  if (parts.length >= 2) {
    const lastName  = parts[0];
    const firstName = parts[1];
    return {
      firstName: _titleCase(firstName),
      lastName:  _titleCase(lastName),
      fullName:  `${_titleCase(firstName)} ${_titleCase(lastName)}`,
      isCompany: false,
    };
  }
  return { firstName: '', lastName: _titleCase(parts[0]), fullName: raw.trim(), isCompany: false };
}

function _titleCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ── AUM estimator based on aircraft make ────────────────────
function estimateAUM(mfr) {
  const m = (mfr || '').toUpperCase();
  if (/GULFSTREAM|BOMBARDIER|DASSAULT|HAWKER/.test(m)) return { aum: '$5M+', band: '5m+' };
  if (/EMBRAER|PILATUS|ECLIPSE|LEARJET/.test(m))        return { aum: '$3M–$8M', band: '1m-5m' };
  if (/BEECH|CESSNA CITATION|PIPER|DAHER|TBM/.test(m)) return { aum: '$1.5M–$4M', band: '1m-5m' };
  if (/CIRRUS|MOONEY|DIAMOND/.test(m))                  return { aum: '$800K–$2.5M', band: '500k-1m' };
  return { aum: '$500K+', band: '500k-1m' };
}

// ── Download helper ──────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let downloaded = 0;
      res.on('data', chunk => {
        downloaded += chunk.length;
        process.stdout.write(`\r[FAA Agent] Downloading… ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log('\n[FAA Agent] Download complete.'); resolve(); });
    });
    req.on('error', reject);
  });
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A1: FAA Registry Miner      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (DRY_RUN)      console.log('[FAA Agent] DRY RUN mode — no file will be written');
  if (STATE_FILTER) console.log(`[FAA Agent] State filter: ${STATE_FILTER}`);
  console.log(`[FAA Agent] Limit: ${LIMIT} leads`);
  console.log('');

  // ── Step 1: Download FAA ZIP ─────────────────────────────
  if (!SKIP_DOWNLOAD || !fs.existsSync(MASTER_FILE)) {
    if (fs.existsSync(TMP_DIR)) {
      console.log('[FAA Agent] Cleaning previous download…');
      execSync(`rm -rf "${TMP_DIR}"`);
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });

    console.log('[FAA Agent] Downloading FAA ReleasableAircraft.zip (~10MB)…');
    console.log(`[FAA Agent] Source: ${FAA_ZIP_URL}`);
    await downloadFile(FAA_ZIP_URL, ZIP_PATH);

    console.log('[FAA Agent] Extracting ZIP…');
    execSync(`unzip -o "${ZIP_PATH}" -d "${TMP_DIR}"`, { stdio: 'pipe' });
    fs.unlinkSync(ZIP_PATH);
    console.log('[FAA Agent] Extraction complete.');
  } else {
    console.log('[FAA Agent] Using cached FAA data (--skip-download)');
  }

  // ── Step 2: Build aircraft reference map ─────────────────
  const aircraftRef = buildAircraftRefMap(ACFTREF_FILE);

  // ── Step 3: Parse MASTER.txt ─────────────────────────────
  if (!fs.existsSync(MASTER_FILE)) {
    console.error('[FAA Agent] ERROR: MASTER.txt not found after extraction. Check ZIP contents:');
    execSync(`ls "${TMP_DIR}"`, { stdio: 'inherit' });
    process.exit(1);
  }

  console.log('[FAA Agent] Parsing MASTER.txt (CSV format)…');
  const lines = fs.readFileSync(MASTER_FILE, 'utf8').split('\n');
  console.log(`[FAA Agent] Total records in FAA database: ${lines.length.toLocaleString()}`);

  // ── Step 4: Filter and convert ───────────────────────────
  const leads = [];
  let scanned = 0;
  let filtered_reason = { type_registrant: 0, aircraft_type: 0, manufacturer: 0, company: 0, state: 0, status: 0 };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('N-NUMBER') || trimmed.startsWith('\uFEFFN-NUMBER')) continue; // skip header/blank
    scanned++;

    const fields = parseCSVLine(trimmed);
    if (fields.length < 21) continue; // malformed line

    const typeRegistrant = getField(fields, 'TYPE_REGISTRANT');
    const typeAircraft   = getField(fields, 'TYPE_AIRCRAFT');
    const statusCode     = getField(fields, 'STATUS_CODE');
    const state          = getField(fields, 'STATE');
    const mfrMdlCode     = getField(fields, 'MFR_MDL_CODE');
    const rawName        = getField(fields, 'NAME');

    // Filter: Valid status (V = Valid registration)
    if (statusCode !== 'V') { filtered_reason.status++; continue; }

    // Filter: Individual/LLC owner type
    if (!INDIVIDUAL_OWNER_TYPES.has(typeRegistrant)) { filtered_reason.type_registrant++; continue; }

    // Filter: State (if specified)
    if (STATE_FILTER && state !== STATE_FILTER.toUpperCase()) { filtered_reason.state++; continue; }

    // Filter: HNW aircraft type (exclude gliders, balloons, etc.)
    if (!HNW_AIRCRAFT_TYPES.has(typeAircraft)) { filtered_reason.aircraft_type++; continue; }

    // Look up aircraft make/model
    const acft = aircraftRef[mfrMdlCode] || { mfr: '', model: '' };
    const mfrUpper = (acft.mfr || '').toUpperCase();

    // Filter: HNW manufacturer
    const isHNW = Array.from(HNW_MANUFACTURERS).some(m => mfrUpper.includes(m));
    if (!isHNW) { filtered_reason.manufacturer++; continue; }

    // Parse name — skip if company (no individual owner to contact)
    const parsed = parseName(rawName);
    if (parsed.isCompany || !parsed.lastName) { filtered_reason.company++; continue; }

    // Build the lead
    const nNumber = getField(fields, 'N_NUMBER');
    const city    = _titleCase(getField(fields, 'CITY'));
    const zip     = getField(fields, 'ZIP_CODE');
    const { aum, band } = estimateAUM(acft.mfr);
    const aircraftModel = [acft.mfr, acft.model].filter(Boolean).join(' ') || 'Unknown';
    const yearMfr = getField(fields, 'YEAR_MFR');

    const verifyUrl = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${nNumber}`;

    leads.push({
      firstName:    parsed.firstName,
      lastName:     parsed.lastName,
      city,
      state,
      zipCode:      zip,
      niche:        'Aircraft Owners',
      nicheId:      'aircraft-owners',
      estimatedAUM: aum,
      aumBand:      band,
      fitScore:     80,
      timingScore:  60,
      nNumber:      `N${nNumber}`,
      aircraftModel,
      aircraftYear:  yearMfr || null,
      source:       'FAA Aircraft Registry',
      sourceUrl:    verifyUrl,
      needsEnrichment: true,
      batchId:      `alfred_batch_faa_${TODAY}`,
      reasonCodes:  [
        `FAA-registered ${aircraftModel} owner`,
        `${city}, ${state} — verifiable public record`,
        typeAircraft === '5' ? 'Multi-engine aircraft — high AUM signal'
          : typeAircraft === '6' ? 'Rotorcraft owner — high AUM signal'
          : 'Aircraft owner — AUM proxy',
      ],
      signals: {
        estimatedAssets: aum,
        aircraftModel,
        aircraftYear:    yearMfr || 'Unknown',
        nNumber:         `N${nNumber}`,
        relationship:    'None — cold (FAA public registry)',
        nextEvent:       'No known trigger — initial outreach',
        outreachAngle:   'Aviation-specific tax complexity and estate coordination',
        verifyUrl,
      },
    });

    if (leads.length >= LIMIT) break;
  }

  // ── Step 5: Results summary ───────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  FAA Agent Results                               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Records scanned:        ${scanned.toLocaleString()}`);
  console.log(`  Filtered (status):      ${filtered_reason.status.toLocaleString()}`);
  console.log(`  Filtered (owner type):  ${filtered_reason.type_registrant.toLocaleString()}`);
  console.log(`  Filtered (aircraft):    ${filtered_reason.aircraft_type.toLocaleString()}`);
  console.log(`  Filtered (manufacturer):${filtered_reason.manufacturer.toLocaleString()}`);
  console.log(`  Filtered (company name):${filtered_reason.company.toLocaleString()}`);
  if (STATE_FILTER) console.log(`  Filtered (state != ${STATE_FILTER}): ${filtered_reason.state.toLocaleString()}`);
  console.log(`  ✅ Leads produced:       ${leads.length}`);
  console.log('');

  if (leads.length === 0) {
    console.warn('[FAA Agent] ⚠️  No leads produced. Try removing --state filter or check MASTER.txt.');
    process.exit(0);
  }

  // Preview top 5 leads
  console.log('── Sample leads ────────────────────────────────────');
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.firstName} ${l.lastName} | ${l.aircraftModel} (${l.aircraftYear || '?'}) | ${l.city}, ${l.state} | AUM: ${l.estimatedAUM}`);
    console.log(`     Verify: ${l.signals.verifyUrl}`);
  });
  console.log('');

  // ── Step 6: Write output ─────────────────────────────────
  if (DRY_RUN) {
    console.log('[FAA Agent] DRY RUN — skipping file write. Sample JSON:');
    console.log(JSON.stringify(leads[0], null, 2));
    return;
  }

  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  console.log(`[FAA Agent] ✅ Raw batch written: ${path.basename(OUTPUT_FILE)} (${sizeKB} KB)`);
  console.log(`[FAA Agent] 📂 Location: ${OUTPUT_FILE}`);
  console.log('');
  console.log('── Next steps ──────────────────────────────────────');
  console.log('  1. Scrub:  node scripts/scrub_leads.js --file ' + OUTPUT_FILE);
  console.log('  2. Review: node scripts/scrub_leads.js --file ' + OUTPUT_FILE + ' --review-only');
  console.log('  3. Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>');
  console.log('');
}

main().catch(err => {
  console.error('[FAA Agent] FATAL:', err.message);
  process.exit(1);
});
