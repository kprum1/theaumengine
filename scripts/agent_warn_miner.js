#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Agent A4: DOL WARN Act Monitor
// scripts/agent_warn_miner.js
//
// Data source: US Department of Labor + State Labor Departments
// WARN Act: 60-day advance notice required for mass layoffs (100+ employees)
// Source URLs: State-level public portals (links below)
//
// What it does:
//   1. Fetches WARN Act notice feeds from key states
//   2. Filters for notices at tech, finance, or AI-adjacent companies
//   3. Cross-references with LinkedIn company search to estimate exec count
//   4. Outputs company-level leads flagged for executive enrichment
//
// IMPORTANT: WARN leads are COMPANY-level, not individual-level.
// They need a second step: LinkedIn research to find Director/VP/C-Suite
// employees at those companies who were affected.
//
// Usage:
//   node scripts/agent_warn_miner.js
//   node scripts/agent_warn_miner.js --states CA,TX,NY,WA --days 90
//   node scripts/agent_warn_miner.js --dry-run
//
// Output: scripts/staging/alfred_batch_warn_{date}.json
// ============================================================

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ─────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag   = (f) => args.includes(f);
const STATES_ARG = getArg('--states') || 'CA,TX,NY,WA,IL,FL,MA,CO,GA,NC';
const DAYS      = parseInt(getArg('--days') || '90', 10);
const DRY_RUN   = hasFlag('--dry-run');
const TARGET_STATES = STATES_ARG.split(',').map(s => s.trim().toUpperCase());

const STAGING_DIR = path.join(__dirname, 'staging');
const TODAY       = new Date().toISOString().split('T')[0];
const START_DATE  = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// ── Target industries (AI/tech layoffs most likely to produce HNW exec leads) ──
const HIGH_VALUE_KEYWORDS = [
  'technology', 'tech', 'software', 'ai', 'artificial intelligence',
  'data', 'cloud', 'saas', 'platform', 'digital', 'fintech', 'biotech',
  'financial', 'finance', 'bank', 'insurance', 'consulting',
  'media', 'entertainment', 'gaming', 'streaming',
  'healthcare', 'health', 'medical', 'pharma',
  'aerospace', 'defense', 'semiconductor',
  'retail', 'ecommerce', 'logistics',
];

// Minimum employees to qualify as HNW exec lead opportunity
const MIN_EMPLOYEES = 50;

// ── State WARN feed definitions ───────────────────────────────
// Note: Each state has different formats. We use the most accessible.
// Some states have structured data; others require parsing HTML.
// We implement the states with the clearest public data access.
const WARN_FEEDS = {
  // California — most structured, downloadable
  CA: {
    name: 'California',
    url:  'https://edd.ca.gov/siteassets/files/jobs_and_training/warn/warn-report-for-7-days-of-closings-and-layoffs.xlsx',
    type: 'ca_edd',
    note: 'CA EDD publishes weekly XLSX. Use curl to download and parse.',
  },
  // Texas — CSV available
  TX: {
    name: 'Texas',
    url:  'https://www.twc.texas.gov/files/news/warn-notices-twc.xlsx',
    type: 'tx_twc',
    note: 'TX publishes rolling XLSX of WARN notices.',
  },
  // New York — web-based search
  NY: {
    url:  'https://dol.ny.gov/warn-notices',
    type: 'web_scrape',
    name: 'New York',
  },
  // Washington — structured
  WA: {
    url:  'https://lni.wa.gov/about-l-i/warn-notices/',
    type: 'web_scrape',
    name: 'Washington',
  },
};

// ── Fetch helper ─────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AUM-Research-Agent/1.0)',
        'Accept': 'text/html,application/json,*/*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Parse WARN HTML tables (generic) ─────────────────────────
function parseWarnTable(html, stateName) {
  const notices = [];

  // Extract table rows — most state WARN pages use HTML tables
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  if (!tableMatch) return notices;

  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    let headers = [];

    for (const row of rows) {
      const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
        .map(cell => cell.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim());

      if (!cells.length) continue;

      // Detect header row
      if (row.includes('<th') || cells.some(c => /company|employer|date|employee|worker/i.test(c))) {
        headers = cells.map(c => c.toLowerCase());
        continue;
      }

      if (!headers.length || cells.length < 2) continue;

      const mapped = {};
      headers.forEach((h, i) => { mapped[h] = cells[i] || ''; });

      // Try to extract key fields
      const company   = mapped['company'] || mapped['employer'] || mapped['company name'] || cells[0] || '';
      const dateStr   = mapped['notice date'] || mapped['effective date'] || mapped['date'] || '';
      const employees = parseInt(mapped['employees'] || mapped['workers'] || mapped['number'] || '0', 10);
      const city      = mapped['city'] || mapped['location'] || '';
      const stateCode = mapped['state'] || stateName;
      const layoffType = mapped['type'] || mapped['layoff type'] || 'Layoff';

      if (!company || company.length < 3) continue;

      notices.push({ company, dateStr, employees, city, stateCode, layoffType });
    }
  }

  return notices;
}

// ── Score a WARN notice for HNW exec lead potential ──────────
function scoreNotice(notice) {
  let score = 0;
  const companyLower = (notice.company || '').toLowerCase();
  const typeLower    = (notice.layoffType || '').toLowerCase();

  // Industry match
  if (HIGH_VALUE_KEYWORDS.some(kw => companyLower.includes(kw))) score += 30;

  // Employee count — larger = more execs
  if (notice.employees >= 500) score += 30;
  else if (notice.employees >= 200) score += 20;
  else if (notice.employees >= 100) score += 10;
  else if (notice.employees >= 50)  score += 5;

  // Not a plant closing (layoff = active company, better for outreach)
  if (!typeLower.includes('closing') && !typeLower.includes('plant')) score += 10;

  // Recency (date within 60 days = urgency)
  if (notice.dateStr) {
    const d = new Date(notice.dateStr);
    const daysDiff = (Date.now() - d.getTime()) / 86400000;
    if (daysDiff < 30)  score += 30;
    else if (daysDiff < 60) score += 20;
    else if (daysDiff < 90) score += 10;
  }

  return score;
}

// ── Convert WARN notice → AUM Engine lead record ──────────────
function warnToLead(notice, state) {
  const company  = notice.company || '';
  const city     = _title(notice.city || '');
  const stateCode = (notice.stateCode || state || '').toUpperCase().slice(0, 2);
  const empCount = notice.employees || 0;

  // AUM estimate based on company size / type
  const aum  = empCount >= 500 ? '$3M–$10M' : '$1.5M–$6M';
  const band = empCount >= 500 ? '1m-5m'    : '1m-5m';

  const linkedInSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}&origin=GLOBAL_SEARCH_HEADER&position=0&searchId=&titleFilter=%5B"Director"%2C"Vice+President"%2C"VP"%2C"C-Suite"%2C"Chief"%5D`;

  return {
    firstName: '',
    lastName:  '',
    title:     `Displaced Executive — ${company}`,
    company:   `Former: ${company}`,
    city,
    state:     stateCode,
    niche:     'AI-Displaced Executives',
    nicheId:   'ai-displaced-executives',
    estimatedAUM: aum,
    aumBand:   band,
    fitScore:  80,
    timingScore: Math.min(95, 60 + scoreNotice(notice) / 3), // Score up to 95
    source:    `DOL WARN Act — ${stateCode} State Labor Dept`,
    sourceUrl: WARN_FEEDS[stateCode]?.url || `https://www.dol.gov/agencies/eta/layoffs/warn`,
    needsEnrichment: true,
    needsNameResolution: true, // Must find specific Director/VP names via LinkedIn
    batchId:   `alfred_batch_warn_${TODAY}`,
    warnDate:  notice.dateStr || '',
    warnEmployees: empCount,
    reasonCodes: [
      `WARN Act filing: ${company} — ${empCount > 0 ? empCount + ' employees affected' : 'layoff notice'}`,
      notice.dateStr ? `Notice date: ${notice.dateStr}` : 'Recent WARN filing',
      'Research Directors/VPs on LinkedIn for this company — active separation window',
    ],
    signals: {
      estimatedAssets: aum,
      formerCompany:   company,
      relationship:    'None — cold (public WARN filing)',
      nextEvent:       'Layoff effective within 60 days — option/severance window imminent',
      outreachAngle:   'Executive severance + RSU liquidation + career transition planning',
      warnNoticeDate:  notice.dateStr || 'Recent',
      employeesAffected: empCount,
      linkedInSearch,
      researchNote:    `Search LinkedIn for Director/VP at ${company} who are "Open to Work" — those are your contacts`,
      verifyUrl:       WARN_FEEDS[stateCode]?.url || 'https://www.dol.gov/agencies/eta/layoffs/warn',
    },
  };
}

function _title(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Agent A4: DOL WARN Act Monitor    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('[WARN Agent] DRY RUN — no file will be written');
  console.log(`[WARN Agent] States: ${TARGET_STATES.join(', ')}`);
  console.log(`[WARN Agent] Period: ${START_DATE} → ${TODAY} (${DAYS} days)`);
  console.log('');

  // For states not in our direct fetch map, we list the manual research URLs
  console.log('── WARN Act Research Portals ────────────────────────');
  const WARN_PORTALS = {
    CA: 'https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/',
    TX: 'https://www.twc.texas.gov/news/warn-notices',
    NY: 'https://dol.ny.gov/warn-notices',
    WA: 'https://lni.wa.gov/about-l-i/warn-notices/',
    IL: 'https://dceo.illinois.gov/workforcedevelopment/warn.htm',
    FL: 'https://floridajobs.org/office-directory/division-of-workforce-services/workforce-programs/warn-act',
    MA: 'https://www.mass.gov/lists/warn-act-layoff-notices',
    CO: 'https://cdle.colorado.gov/layoff-warn',
    GA: 'https://www.dol.state.ga.us/em/warn.htm',
    NC: 'https://www.nccommerce.com/workforce/warn-act-notices',
    NJ: 'https://www.nj.gov/labor/employer-services/warn/',
    PA: 'https://www.dli.pa.gov/Individuals/Workforce-Development/warn/Pages/default.aspx',
    OH: 'https://jfs.ohio.gov/warn/warnnotices.stm',
    AZ: 'https://des.az.gov/services/employment/warn-act-notices',
    MN: 'https://mn.gov/deed/business/dislocated-workers/minnesota-warn-act-notices/',
  };

  for (const state of TARGET_STATES) {
    const url = WARN_PORTALS[state];
    if (url) console.log(`  ${state}: ${url}`);
  }
  console.log('');

  // Attempt to fetch pages that allow it
  const allNotices = [];

  for (const state of TARGET_STATES) {
    const url = WARN_PORTALS[state];
    if (!url) {
      console.log(`[WARN Agent] ${state}: No portal URL configured — skipping`);
      continue;
    }

    process.stdout.write(`[WARN Agent] Fetching ${state}…`);
    try {
      const { status, body } = await fetchText(url);
      if (status === 200) {
        const notices = parseWarnTable(body, state);
        console.log(` ${notices.length} notices parsed from HTML`);
        // Filter and score
        const qualified = notices
          .filter(n => n.employees >= MIN_EMPLOYEES)
          .map(n => ({ ...n, _score: scoreNotice(n), _state: state }))
          .filter(n => n._score > 20)
          .sort((a, b) => b._score - a._score);
        allNotices.push(...qualified);
      } else {
        console.log(` HTTP ${status} — state requires manual access`);
      }
    } catch(e) {
      console.log(` Error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Build leads from all extracted notices
  const leads = allNotices.map(n => warnToLead(n, n._state));

  console.log(`\n[WARN Agent] ✅ ${leads.length} company-level WARN leads found`);
  console.log('');

  // Even if web scraping got 0 results (state portals vary in accessibility),
  // we still produce the research artifact with portal URLs for manual research
  const researchManifest = {
    generatedAt: new Date().toISOString(),
    dateRange:   { start: START_DATE, end: TODAY },
    states:      TARGET_STATES,
    portals:     WARN_PORTALS,
    instruction: 'For each state portal above, visit the URL, filter for Tech/Finance companies with 50+ employees affected, note the company name and layoff date, then use LinkedIn to find Director/VP level employees who posted "Open to Work" or "Recently laid off".',
    linkedInSearchTemplate: 'https://www.linkedin.com/search/results/people/?keywords={COMPANY_NAME}&currentJobFunction=%5B4%2C7%2C8%5D&pastJobFunction=&network=%5B%22O%22%5D',
    leadsFound: leads,
  };

  if (leads.length > 0) {
    console.log('── Sample WARN leads ───────────────────────────────');
    leads.slice(0, 3).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.company} | ${l.city}, ${l.state} | ${l.warnEmployees} employees`);
      console.log(`     Score: ${l.timingScore} | Date: ${l.warnDate}`);
    });
  } else {
    console.log('[WARN Agent] ℹ️  Web parsing returned 0 results — some state portals require manual access.');
    console.log('[WARN Agent] The research manifest shows all portal URLs to check manually.');
    console.log('[WARN Agent] Vera (Perplexity) can pull WARN data from these URLs with browser access.');
  }

  if (DRY_RUN) {
    console.log('\n[WARN Agent] DRY RUN — skipping file write.');
    return;
  }

  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const outputFile = path.join(STAGING_DIR, `alfred_batch_warn_${TODAY}.json`);
  const manifestFile = path.join(STAGING_DIR, `warn_research_manifest_${TODAY}.json`);

  fs.writeFileSync(outputFile, JSON.stringify(leads, null, 2), 'utf8');
  fs.writeFileSync(manifestFile, JSON.stringify(researchManifest, null, 2), 'utf8');

  console.log(`\n[WARN Agent] ✅ Leads file: ${path.basename(outputFile)}`);
  console.log(`[WARN Agent] ✅ Research manifest: ${path.basename(manifestFile)}`);
  console.log('\n── Next steps ──────────────────────────────────────');
  console.log('  1. Send warn_research_manifest to Vera for real-time WARN data pull');
  console.log('  2. For each company in leads, search LinkedIn for Director/VP "Open to Work"');
  console.log('  3. Add names → run enrichment → ingest');
  console.log('\n  Tip: Vera on Perplexity can browse the state portal URLs above');
  console.log('  and extract current WARN notices directly — give her the manifest.');
}

main().catch(err => {
  console.error('[WARN Agent] FATAL:', err.message);
  process.exit(1);
});
