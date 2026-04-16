#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A9: SEC EDGAR Monitor (C-Suite + AI-Displaced)
// scripts/agent_sec_miner.js
//
// Data source: SEC EDGAR full-text search API (free, no key)
// API: https://efts.sec.gov/LATEST/search-index
//
// Sub-agents:
//   A5a — Form 4 (Insider stock sales → C-Suite, large stock dispositions)
//   A5b — Form 8-K Item 5.02 (Executive departures → AI-Displaced Execs)
//   A5c — DEF 14A (Proxy comp tables → C-Suite executives with disclosed pay)
//
// Usage:
//   node scripts/agent_sec_miner.js
//   node scripts/agent_sec_miner.js --mode 8k    (departures only)
//   node scripts/agent_sec_miner.js --mode form4  (insider sales only)
//   node scripts/agent_sec_miner.js --mode proxy  (proxy comp only)
//   node scripts/agent_sec_miner.js --days 30 --limit 60
//   node scripts/agent_sec_miner.js --dry-run
//
// Output: scripts/staging/alfred_batch_sec_{mode}_{date}.json
// ============================================================

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);
const MODE    = getArg('--mode') || 'all';  // 'form4' | '8k' | 'proxy' | 'all'
const DAYS    = parseInt(getArg('--days') || '60', 10);
const LIMIT   = parseInt(getArg('--limit') || '50', 10);
const DRY_RUN = hasFlag('--dry-run');

const STAGING_DIR = path.join(__dirname, 'staging', 'raw');
const TODAY       = new Date().toISOString().split('T')[0];
const START_DATE  = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// ── HTTP helper ───────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'AUM-Engine-Research/1.0 kosal@fin-tegration.com' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse: ${e.message} | URL: ${url.slice(0,100)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── EDGAR full-text search ────────────────────────────────────
async function edgarSearch(formType, query, startDt, limit = 20) {
  const qs = new URLSearchParams({
    q:         query,
    forms:     formType,
    dateRange: 'custom',
    startdt:   startDt,
    enddt:     TODAY,
    hits: JSON.stringify({ hits: { total: {}, hits: [] } }), // just for page size
  }).toString();

  // EDGAR EFTS endpoint
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&forms=${formType}&dateRange=custom&startdt=${startDt}&enddt=${TODAY}&hits.hits.total.value=1&hits.hits._source.period_of_report=1`;

  // Use the standard search endpoint
  const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&forms=${formType}&dateRange=custom&startdt=${startDt}&_source=file_date,entity_name,file_num,period_of_report,form_type&from=0&size=${Math.min(limit, 40)}`;
  return fetchJson(searchUrl);
}

// ── A5a: Form 4 Insider Sales ────────────────────────────────
// Form 4 = Statement of Changes in Beneficial Ownership
// When a named executive sells stock above a threshold.
async function runForm4Mode() {
  console.log('\n[SEC Agent A5a] Scanning Form 4 — Insider Stock Sales…');
  console.log(`[SEC Agent A5a] Period: ${START_DATE} to ${TODAY}`);

  const leads = [];

  // Search for Form 4 filings with large dispositions
  // EDGAR EFTS full-text searches the filing content
  const queries = [
    '"disposition" "Chief Executive"',
    '"disposition" "Chief Financial"',
    '"disposition" "Chief Operating"',
    '"D" "President"',
  ];

  for (const q of queries) {
    if (leads.length >= LIMIT) break;
    console.log(`  [Form4] Querying: ${q}`);

    let result;
    try {
      result = await fetchJson(
        `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=4&dateRange=custom&startdt=${START_DATE}&enddt=${TODAY}&hits.hits.total.value=1&from=0&size=20`
      );
    } catch(e) {
      console.log(`  [Form4] ERROR: ${e.message}`);
      continue;
    }

    const hits = result?.hits?.hits || [];
    console.log(`  [Form4] ${hits.length} filings found`);

    for (const hit of hits) {
      if (leads.length >= LIMIT) break;
      const src = hit._source || {};
      const entityName = src.entity_name || src.display_names?.[0] || '';
      const fileDate   = src.file_date || '';
      const accNum     = hit._id || '';

      if (!entityName) continue;

      // Parse name from entity — Form 4 entity_name is the reporting person
      const nameParts = entityName.trim().split(/\s+/);
      if (nameParts.length < 2) continue;

      const filingUrl = accNum
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${accNum}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(entityName)}&type=4`;

      leads.push({
        firstName:    _title(nameParts[0]),
        lastName:     _title(nameParts.slice(1).join(' ')),
        title:        'Executive — insider stock disposition',
        company:      'See SEC filing',
        city:         '',
        state:        '',
        niche:        'C-Suite Executives',
        nicheId:      'c-suite-executives',
        estimatedAUM: '$2M–$10M',
        aumBand:      '1m-5m',
        fitScore:     85,
        timingScore:  88, // High — stock sale = active liquidity moment
        source:       'SEC EDGAR Form 4',
        sourceUrl:    filingUrl,
        needsEnrichment: true,
        batchId:      `alfred_batch_sec_form4_${TODAY}`,
        secFilingDate: fileDate,
        reasonCodes: [
          'Named insider — recent stock disposition (SEC Form 4)',
          `Filing date: ${fileDate}`,
          'Concentrated equity position — active liquidity moment',
        ],
        signals: {
          estimatedAssets: '$2M–$10M',
          relationship:    'None — cold (SEC public filing)',
          nextEvent:       'Post-disposition — concentrated stock + tax planning window',
          outreachAngle:   'Concentrated equity deployment after insider sale — 10b5-1 planning',
          secForm:         'Form 4',
          fileDate,
          verifyUrl:       filingUrl,
        },
      });
    }

    await sleep(500);
  }

  return leads;
}

// ── A5b: Form 8-K Executive Departures ───────────────────────
// Item 5.02: Departure of Directors or Principal Officers
async function run8KMode() {
  console.log('\n[SEC Agent A5b] Scanning Form 8-K — Executive Departures…');
  console.log(`[SEC Agent A5b] Period: ${START_DATE} to ${TODAY}`);

  const leads = [];

  const queries = [
    '"5.02" "departure" "Chief Executive Officer"',
    '"5.02" "resignation" "Chief Financial Officer"',
    '"5.02" "terminated" "President"',
    '"5.02" "departure" "Chief Technology Officer"',
    '"5.02" "departure" "Chief Operating Officer"',
    '"5.02" "step down" "Chief"',
  ];

  for (const q of queries) {
    if (leads.length >= LIMIT) break;
    console.log(`  [8-K] Querying: ${q}`);

    let result;
    try {
      result = await fetchJson(
        `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=8-K&dateRange=custom&startdt=${START_DATE}&enddt=${TODAY}&from=0&size=20`
      );
    } catch(e) {
      console.log(`  [8-K] ERROR: ${e.message}`);
      continue;
    }

    const hits = result?.hits?.hits || [];
    console.log(`  [8-K] ${hits.length} filings found`);

    for (const hit of hits) {
      if (leads.length >= LIMIT) break;
      const src = hit._source || {};
      const companyName = src.entity_name || src.display_names?.[0] || '';
      const fileDate    = src.file_date || '';
      const accNum      = (hit._id || '').replace(/-/g, '');

      if (!companyName) continue;

      // 8-K: entity_name is the COMPANY, not the executive.
      // The executive name is in the filing text — we surface it as a research lead:
      // "Executive at [Company] departed on [date] — needs enrichment for name."
      const filingUrl = accNum
        ? `https://www.sec.gov/Archives/edgar/full-index/${fileDate.slice(0,4)}/`
        : `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(companyName)}&forms=8-K`;

      const viewUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(companyName)}&type=8-K&dateb=&owner=include&count=10&search_text=`;

      leads.push({
        firstName:    '',   // Needs enrichment — 8-K names exec in filing text
        lastName:     '',
        title:        `Departed Executive — ${companyName}`,
        company:      `Former: ${companyName}`,
        city:         '',
        state:        '',
        niche:        'AI-Displaced Executives',
        nicheId:      'ai-displaced-executives',
        estimatedAUM: '$2M–$8M',
        aumBand:      '1m-5m',
        fitScore:     82,
        timingScore:  92, // Very high — fresh departure
        source:       'SEC EDGAR Form 8-K',
        sourceUrl:    viewUrl,
        needsEnrichment: true, // Name + contact required
        needsNameResolution: true, // Name must be extracted from 8-K text
        batchId:      `alfred_batch_sec_8k_${TODAY}`,
        secFilingDate: fileDate,
        reasonCodes: [
          `SEC 8-K Item 5.02: Executive departure at ${companyName}`,
          `Filing date: ${fileDate} — recent transition`,
          'Severance + equity liquidation event likely — high urgency',
        ],
        signals: {
          estimatedAssets: '$2M–$8M',
          formerCompany:   companyName,
          relationship:    'None — cold (SEC public filing)',
          nextEvent:       'Post-departure planning — option window, severance deployment',
          outreachAngle:   'Executive severance + RSU/option window strategy',
          secForm:         '8-K Item 5.02',
          fileDate,
          verifyUrl:       viewUrl,
          researchNote:    `Open ${viewUrl} to extract executive name from filing`,
        },
      });
    }

    await sleep(500);
  }

  return leads;
}

// ── A5c: DEF 14A Proxy — Named Executive Compensation ─────────
async function runProxyMode() {
  console.log('\n[SEC Agent A5c] Scanning DEF 14A — Executive Compensation…');
  console.log(`[SEC Agent A5c] Period: ${START_DATE} to ${TODAY}`);

  const leads = [];

  // Proxy statements name executives with total comp — pre-qualify for outreach
  const queries = [
    '"Named Executive Officers" "Total Compensation" "$"',
    '"Summary Compensation Table" "Chief Executive" "$"',
  ];

  for (const q of queries) {
    if (leads.length >= LIMIT) break;
    console.log(`  [Proxy] Querying: ${q}`);

    let result;
    try {
      result = await fetchJson(
        `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=DEF%2014A&dateRange=custom&startdt=${START_DATE}&enddt=${TODAY}&from=0&size=20`
      );
    } catch(e) {
      console.log(`  [Proxy] ERROR: ${e.message}`);
      continue;
    }

    const hits = result?.hits?.hits || [];
    console.log(`  [Proxy] ${hits.length} filings found`);

    for (const hit of hits) {
      if (leads.length >= LIMIT) break;
      const src         = hit._source || {};
      const companyName = src.entity_name || src.display_names?.[0] || '';
      const fileDate    = src.file_date || '';

      if (!companyName) continue;

      const viewUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(companyName)}&type=DEF+14A&dateb=&owner=include&count=5`;

      leads.push({
        firstName:    '',
        lastName:     '',
        title:        `Named Executive — ${companyName} (proxy)`,
        company:      companyName,
        city:         '',
        state:        '',
        niche:        'C-Suite Executives',
        nicheId:      'c-suite-executives',
        estimatedAUM: '$3M–$15M',
        aumBand:      '5m+',
        fitScore:     87,
        timingScore:  65,
        source:       'SEC EDGAR DEF 14A',
        sourceUrl:    viewUrl,
        needsEnrichment:      true,
        needsNameResolution:  true, // Must pull names from proxy NEO table
        batchId:      `alfred_batch_sec_proxy_${TODAY}`,
        secFilingDate: fileDate,
        reasonCodes: [
          `Named executive at ${companyName} — disclosed compensation in proxy`,
          `Filing date: ${fileDate}`,
          'Total comp likely $1M+ — concentrated equity + deferred comp planning need',
        ],
        signals: {
          estimatedAssets: '$3M–$15M',
          company:         companyName,
          relationship:    'None — cold (SEC proxy disclosure)',
          nextEvent:       'Ongoing — executive comp + deferred comp + concentrated stock',
          outreachAngle:   'Deferred comp, 10b5-1 planning, executive transition readiness',
          secForm:         'DEF 14A',
          fileDate,
          verifyUrl:       viewUrl,
          researchNote:    `Open ${viewUrl} → click latest DEF 14A → find Summary Compensation Table → extract NEO names`,
        },
      });
    }

    await sleep(500);
  }

  return leads;
}

function _title(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A5: SEC EDGAR Monitor        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('[SEC Agent] DRY RUN — no file will be written');
  console.log(`[SEC Agent] Mode: ${MODE} | Days back: ${DAYS} | Limit: ${LIMIT}`);
  console.log(`[SEC Agent] Date range: ${START_DATE} → ${TODAY}`);

  const allLeads = {};

  if (MODE === 'form4' || MODE === 'all') {
    allLeads.form4 = await runForm4Mode();
    console.log(`\n[SEC Agent] Form 4 leads: ${allLeads.form4.length}`);
  }
  if (MODE === '8k' || MODE === 'all') {
    allLeads['8k'] = await run8KMode();
    console.log(`\n[SEC Agent] 8-K departure leads: ${allLeads['8k'].length}`);
  }
  if (MODE === 'proxy' || MODE === 'all') {
    allLeads.proxy = await runProxyMode();
    console.log(`\n[SEC Agent] DEF 14A proxy leads: ${allLeads.proxy.length}`);
  }

  if (DRY_RUN) {
    console.log('\n[SEC Agent] DRY RUN — skipping file write.');
    console.log('\nSample lead (form4):');
    const sample = Object.values(allLeads).flat()[0];
    if (sample) console.log(JSON.stringify(sample, null, 2));
    return;
  }

  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  // Write each mode as a separate file
  let totalWritten = 0;
  for (const [mode, leads] of Object.entries(allLeads)) {
    if (!leads || !leads.length) continue;
    const outputFile = path.join(STAGING_DIR, `alfred_batch_sec_${mode}_${TODAY}.raw.json`);
    fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
    const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
    console.log(`\n[SEC Agent] ✅ ${mode}: ${leads.length} leads → ${path.basename(outputFile)} (${sizeKB} KB)`);
    totalWritten += leads.length;
  }

  console.log(`\n[SEC Agent] ✅ Total: ${totalWritten} leads across ${Object.keys(allLeads).length} modes`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log('  ⚠️  8-K and proxy leads flag needsNameResolution: true');
  console.log('     Open sourceUrl, extract exec name, update firstName/lastName.');
  console.log(`  1. Scrub:  node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_sec_*_${TODAY}.raw.json`);
  console.log('  2. Review: add --review-only flag to see top candidates');
  console.log('  3. Ingest: node scripts/lead_ingest_agent.js --file <scrubbed path>');
}

main().catch(err => {
  console.error('[SEC Agent] FATAL:', err.message);
  process.exit(1);
});
