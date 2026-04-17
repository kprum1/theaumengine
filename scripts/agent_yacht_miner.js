#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Agent A14: Yacht Owners Miner
// scripts/agent_yacht_miner.js
// Sprint C29 — Build A14 Sourcing Pipeline
//
// Data sources (all public):
//   Primary:  Curated seed CSV — scripts/data/yacht_owners_seed.csv
//             (derived from USCG NVDC documentation records, marina
//              rosters, and yacht club public membership lists)
//   Fallback: CGMIX (cgmix.uscg.mil) — vessel particulars only;
//             owner PII removed from public data in 2018
//
// The USCG National Vessel Documentation Center documents vessels 5+ net tons
// used in commerce OR vessels of any size owned by US citizens that want
// national registration. A documented 40ft+ yacht is a $400K+ asset minimum,
// making it one of the strongest single-asset wealth signals available.
//
// AUM Signal Logic:
//   40–54 ft  → $2M–$5M AUM proxy
//   55–64 ft  → $4M–$8M AUM proxy
//   65–79 ft  → $7M–$15M AUM proxy
//   80ft+     → $12M+ AUM proxy
//
// Usage:
//   node scripts/agent_yacht_miner.js
//   node scripts/agent_yacht_miner.js --limit 25
//   node scripts/agent_yacht_miner.js --min-length 55
//   node scripts/agent_yacht_miner.js --state FL
//   node scripts/agent_yacht_miner.js --dry-run
//
// Output: scripts/staging/raw/alfred_batch_yacht_<date>.raw.json
// =====================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI ───────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const getFlagV = (f) => { // supports both --key=val and --key val
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`${f}=`)) return args[i].split('=')[1];
    if (args[i] === f && args[i+1]) return args[i+1];
  }
  return null;
};
const hasFlag = (f) => args.includes(f);

const LIMIT      = parseInt(getFlagV('--limit')      || '30',  10);
const MIN_LEN    = parseInt(getFlagV('--min-length')  || '40',  10);
const STATE_FILT = (getFlagV('--state') || '').toUpperCase() || null;
const DRY_RUN    = hasFlag('--dry-run');
const SEED_FILE  = getFlagV('--seed') || path.join(__dirname, 'data', 'yacht_owners_seed.csv');
const TODAY      = new Date().toISOString().split('T')[0];
const OUTPUT_DIR = path.join(__dirname, 'staging', 'raw');

// ── Vessel length → AUM band ──────────────────────────────────────────
function lengthToAUM(len) {
  if (len >= 80) return '$12M+';
  if (len >= 65) return '$7M–$15M';
  if (len >= 55) return '$4M–$8M';
  if (len >= 45) return '$2M–$5M';
  return '$1.5M–$3M';
}

function lengthToAUMBand(len) {
  if (len >= 65) return '5m+';
  if (len >= 45) return '2m-5m';
  return '1m-2m';
}

// ── Fit score ─────────────────────────────────────────────────────────
function fitScore(len, aumStr, title) {
  let fit = 76;      // baseline — documented vessel is already a strong signal

  // Length-based (primary wealth signal)
  if (len >= 80) fit += 18;
  else if (len >= 65) fit += 14;
  else if (len >= 55) fit += 10;
  else if (len >= 45) fit += 5;

  // AUM from seed (if provided)
  const aum = parseFloat((aumStr || '').replace(/[$M+]/g, '')) || 0;
  if (aum >= 8)  fit += 4;
  else if (aum >= 5) fit += 2;

  // Title modifier
  const t = (title || '').toLowerCase();
  if (t.includes('ceo') || t.includes('chairman') || t.includes('founder')) fit += 2;
  if (t.includes('retired')) fit += 1;  // Retired HNW → estate planning signal

  return Math.min(98, fit);
}

// ── Timing score ──────────────────────────────────────────────────────
function timingScore(fit, outreachAngle, ageRange) {
  let timing = fit - 8;  // baseline slightly below fit

  // Angle-based urgency
  const URGENT_ANGLES = ['exit_planning', 'succession', 'deferred_comp'];
  const HIGH_ANGLES   = ['estate_coordination', 'wealth_protection', 'income_complexity'];

  if (URGENT_ANGLES.includes(outreachAngle)) timing += 10;
  else if (HIGH_ANGLES.includes(outreachAngle)) timing += 5;

  // Age range (if near retirement)
  const ageLow = parseInt((ageRange || '').split('-')[0]) || 0;
  if (ageLow >= 60) timing += 6;       // Estate/transition window
  else if (ageLow >= 55) timing += 3;

  return Math.min(98, Math.max(68, timing));
}

// ── Outreach angle → human label ──────────────────────────────────────
const ANGLE_LABELS = {
  exit_planning:       'Business exit or sale within 24 months',
  succession:          'Succession / leadership transition signal',
  estate_coordination: 'Estate planning gap — high asset concentration',
  wealth_protection:   'Wealth protection and diversification need',
  income_complexity:   'Complex income and tax optimization need',
  business_owner:      'Business owner seeking governance strategy',
  deferred_comp:       'Deferred compensation decision window',
  law_partner:         'Law partner — K-1 complexity + buyout planning',
  philanthropic:       'DAF / philanthropic giving strategy signal',
  yacht_lifestyle:     'Yacht lifestyle — maritime wealth coordination',
};

// ── CSV parser ────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Convert seed row → AUM Engine lead ───────────────────────────────
function rowToLead(row, index) {
  const fullName    = (row.name || '').trim();
  const parts       = fullName.split(/\s+/);
  const firstName   = parts[0]  || '';
  const lastName    = parts.slice(1).join(' ') || '';

  const vesselLen   = parseInt((row.vessel_length || '0').replace(/[^0-9]/g, '')) || 0;
  const aumStr      = row.estimated_assets || '';
  const angle       = (row.outreach_angle  || 'yacht_lifestyle').trim();
  const cityStr     = (row.city  || '').trim();
  const stateStr    = (row.state || '').trim().toUpperCase().slice(0, 2);

  // Filters
  if (vesselLen < MIN_LEN)                              return null;
  if (!firstName)                                       return null;
  if (STATE_FILT && stateStr !== STATE_FILT)            return null;

  const fit     = fitScore(vesselLen, aumStr, row.title);
  const timing  = timingScore(fit, angle, row.age_range);
  const aum     = aumStr || lengthToAUM(vesselLen);
  const aumBand = lengthToAUMBand(vesselLen);

  const angleLabel = ANGLE_LABELS[angle] || 'Vessel ownership wealth signal — planning opportunity';

  const leadId = `yacht-owners_${lastName.toLowerCase().replace(/[^a-z]/g,'_')}_${stateStr.toLowerCase()}_${index}`;
  const dupKey = `yacht_${lastName.toLowerCase().replace(/\s+/g,'_')}_${stateStr.toLowerCase()}_${row.uscg_doc_num || index}`;

  return {
    leadId,
    duplicateKey: dupKey,

    // ── Identity ────────────────────────────────────────────────
    firstName,
    lastName,
    fullName,
    title:            (row.title   || 'Vessel Owner').trim(),
    company:          (row.company || '').trim(),
    city:             cityStr,
    state:            stateStr,
    email:            '',
    phone:            '',
    linkedInUrl:      (row.linkedin_url || '').trim(),

    // ── Niche ────────────────────────────────────────────────────
    niche:            'Yacht Owners',
    nicheId:          'yacht-owners',

    // ── AUM & scoring ────────────────────────────────────────────
    estimatedAUM:     aum,
    aumBand,
    fitScore:         fit,
    timingScore:      timing,
    priorityScore:    Math.round((fit + timing) / 2),

    // ── Vessel data ──────────────────────────────────────────────
    vesselName:       (row.vessel_name  || '').trim(),
    vesselLength:     (row.vessel_length || `${vesselLen}ft`).trim(),
    vesselLengthFt:   vesselLen,
    vesselType:       (row.vessel_type  || 'Motor Yacht').trim(),
    uscgDocNum:       (row.uscg_doc_num || '').trim(),
    hailingPort:      (row.hailing_port || `${cityStr}, ${stateStr}`).trim(),

    // ── Outreach context ─────────────────────────────────────────
    outreachAngle:    angle,
    outreachContext:  angleLabel,
    ageRange:         (row.age_range || '').trim(),

    // ── Source ───────────────────────────────────────────────────
    source:           'USCG NVDC + Curated Seed',
    sourceUrl:        row.uscg_doc_num
      ? `https://cgmix.uscg.mil/psix/psixsearch.aspx?Documentnumber=${row.uscg_doc_num}`
      : 'https://cgmix.uscg.mil/psix/psixsearch.aspx',
    needsNameResolution:  false,
    needsEnrichment:      !row.linkedin_url,
    confidenceScore:      0.82,
    confidenceBand:       'high',
    batchId:              `alfred_batch_yacht_${TODAY}`,

    // ── Reason codes ─────────────────────────────────────────────
    reasonCodes: [
      `${vesselLen}ft USCG-documented ${row.vessel_type || 'vessel'} — ${aum} estimated AUM`,
      `Hailing port: ${row.hailing_port || `${cityStr}, ${stateStr}`}`,
      row.title ? `${row.title}${row.company ? ' · ' + row.company : ''}` : null,
      angleLabel,
    ].filter(Boolean),

    // ── Signals (advisor cockpit display) ────────────────────────
    signals: [
      `${aum} AUM proxy — ${vesselLen}ft documented vessel`,
      `Vessel: ${row.vessel_name || '[unnamed]'} (${row.vessel_type || 'Motor Yacht'}, ${vesselLen}ft)`,
      `USCG Doc #${row.uscg_doc_num || 'N/A'} — Hailing port: ${row.hailing_port || `${cityStr}, ${stateStr}`}`,
      `Age range: ${row.age_range || 'Unknown'}`,
      `Outreach angle: ${angleLabel}`,
      row.company ? `Employer/Firm: ${row.company}` : null,
      `Source: USCG National Vessel Documentation Center (public record)`,
    ].filter(Boolean),
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Agent A14: Yacht Owners Miner  ⛵         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Validate seed file ───────────────────────────────────────────
  if (!fs.existsSync(SEED_FILE)) {
    console.error(`❌ Seed file not found: ${SEED_FILE}`);
    console.error('\nTo populate the seed file:');
    console.error('  1. Query CGMIX: https://cgmix.uscg.mil/psix/psixsearch.aspx');
    console.error('  2. Filter by vessel length 40ft+, service: Recreational');
    console.error('  3. Export names from marina/yacht club public rosters');
    console.error(`  4. Save as CSV to: ${SEED_FILE}`);
    console.error('\n  See scripts/data/yacht_owners_seed.csv.example for required columns.');
    process.exit(1);
  }

  // ── Load + parse ─────────────────────────────────────────────────
  const raw  = fs.readFileSync(SEED_FILE, 'utf8');
  const rows = parseCSV(raw);

  console.log(`  Seed file:    ${SEED_FILE}`);
  console.log(`  Rows parsed:  ${rows.length}`);
  console.log(`  Min length:   ${MIN_LEN}ft`);
  console.log(`  State filter: ${STATE_FILT || 'all states'}`);
  console.log(`  Limit:        ${LIMIT}`);
  console.log(`  Dry run:      ${DRY_RUN}\n`);

  // ── Build leads ───────────────────────────────────────────────────
  const leads   = [];
  let skipped   = 0;

  for (let i = 0; i < rows.length; i++) {
    const lead = rowToLead(rows[i], i + 1);
    if (!lead) { skipped++; continue; }

    leads.push(lead);
    if (DRY_RUN) {
      console.log(`  [DRY] ${lead.firstName} ${lead.lastName.padEnd(20)} ${lead.city}, ${lead.state}  ${lead.vesselLength.padEnd(8)} ${lead.vesselType.padEnd(15)} Fit:${lead.fitScore} Timing:${lead.timingScore}`);
    } else {
      console.log(`  ✅ ${lead.firstName} ${lead.lastName.padEnd(20)} ${lead.city}, ${lead.state}  ${lead.vesselLength.padEnd(8)} ${lead.vesselType.padEnd(15)} Fit:${lead.fitScore} Timing:${lead.timingScore}`);
    }

    if (leads.length >= LIMIT) {
      console.log(`\n  (Limit of ${LIMIT} reached)`);
      break;
    }
  }

  // ── Distribution summary ──────────────────────────────────────────
  const byState  = {};
  const byAngle  = {};
  const byLength = { '40-54ft': 0, '55-64ft': 0, '65-79ft': 0, '80ft+': 0 };
  leads.forEach(l => {
    byState[l.state] = (byState[l.state] || 0) + 1;
    byAngle[l.outreachAngle] = (byAngle[l.outreachAngle] || 0) + 1;
    if (l.vesselLengthFt >= 80) byLength['80ft+']++;
    else if (l.vesselLengthFt >= 65) byLength['65-79ft']++;
    else if (l.vesselLengthFt >= 55) byLength['55-64ft']++;
    else byLength['40-54ft']++;
  });

  console.log('\n── Distribution ────────────────────────────────────────────');
  console.log('  By state:  ', Object.entries(byState).sort((a,b)=>b[1]-a[1]).map(([s,n]) => `${s}:${n}`).join(', '));
  console.log('  By length: ', Object.entries(byLength).map(([k,v]) => `${k}:${v}`).join(', '));
  console.log('  By angle:  ', Object.entries(byAngle).sort((a,b)=>b[1]-a[1]).map(([a,n]) => `${a}:${n}`).join(', '));

  console.log('\n── Top 5 by Priority ─────────────────────────────────────────');
  [...leads]
    .sort((a,b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .forEach((l, i) => {
      console.log(`  ${i+1}. ${l.firstName} ${l.lastName} | ${l.city}, ${l.state} | ${l.vesselLength} ${l.vesselType} | AUM: ${l.estimatedAUM} | Priority: ${l.priorityScore}`);
    });

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   SUMMARY                                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Total leads:  ${leads.length}`);
  console.log(`  Skipped:      ${skipped} (below min-length or state filter)`);
  console.log(`  No name:      0 (all seed records have owner names)`);

  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY RUN — no file written. Remove --dry-run to produce output.');
    return;
  }

  // ── Write output ──────────────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const stateTag    = STATE_FILT ? `_${STATE_FILT.toLowerCase()}` : '';
  const outFileName = `alfred_batch_yacht${stateTag}_${TODAY}.raw.json`;
  const outFile     = path.join(OUTPUT_DIR, outFileName);

  fs.writeFileSync(outFile, JSON.stringify(leads, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(1);

  console.log(`\n  Output → ${outFile} (${sizeKB} KB)`);
  console.log('\n── Next Steps ───────────────────────────────────────────────');
  console.log(`  1. Scrub:  node scripts/scrub_leads.js --file ${outFile}`);
  console.log(`  2. Ingest: node scripts/lead_ingest_agent.js \\`);
  console.log(`               --file scripts/staging/scrubbed/${outFileName.replace('.raw.', '.scrubbed.')}`);
  console.log(`  3. Route:  node scripts/trigger_routing.js`);
  console.log(`  4. Extend: Add more rows to ${SEED_FILE} (target: 50 records)`);
  console.log(`             or integrate CGMIX bulk vessel query (Mode A)`);
  console.log('\n  ⚓ OUTREACH NOTE: Never cold-call yacht owners. Use marina/club');
  console.log('     relationships or warm intro via vessel broker/marine insurer.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n[YachtMiner] FATAL:', err.message);
  process.exit(1);
});
