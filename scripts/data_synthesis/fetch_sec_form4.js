// ======================================================================
// AUM ENGINE — SEC Form 4 Scraper (RSU / Equity Vesting Events)
// scripts/data_synthesis/fetch_sec_form4.js
//
// Source: SEC EDGAR Full-Text Search API (free, public, no auth)
// API:    https://efts.sec.gov/LATEST/search-index
//
// What this pulls:
//   - Executives who recently filed Form 4 (insider trading report)
//   - Form 4 = equity/RSU/option disposition or acquisition
//   - These are "liquidity events" — cash hitting a brokerage account NOW
//
// Why this works:
//   An exec who just vested $300K in RSUs needs:
//     1. A tax strategy (within days of vesting)
//     2. A plan for whether to hold or sell concentrated stock
//     3. Often their first real need for a wealth advisor
//   Most advisors don't monitor EDGAR. This is first-mover territory.
//
// Usage:
//   node scripts/data_synthesis/fetch_sec_form4.js [--days=7] [--state=TX] [--limit=50]
//   Output → scripts/incoming/sec_form4_[state]_[date].json
// ======================================================================

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ── CLI args ──────────────────────────────────────────────────
const stateArg  = process.argv.find(a => a.startsWith('--state='));
const daysArg   = process.argv.find(a => a.startsWith('--days='));
const limitArg  = process.argv.find(a => a.startsWith('--limit='));
const STATE     = stateArg  ? stateArg.replace('--state=', '').toUpperCase() : null;
const DAYS_BACK = daysArg   ? parseInt(daysArg.replace('--days=', ''))       : 7;
const LIMIT     = limitArg  ? parseInt(limitArg.replace('--limit=', ''))     : 50;
const DATE      = new Date().toISOString().slice(0, 10);
const OUTFILE   = path.join(__dirname, '..', 'incoming',
  `sec_form4_${STATE ? STATE.toLowerCase() + '_' : ''}${DATE}.json`);

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent':  'AUM-Engine-Research/1.0 kosal@fin-tegration.com',
        'Accept':      'application/json',
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error(`Parse error: ${e.message}\nRaw: ${raw.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Date range for query ──────────────────────────────────────
function getDateRange(daysBack) {
  const end   = new Date();
  const start = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return {
    startdt: start.toISOString().slice(0, 10),
    enddt:   end.toISOString().slice(0, 10),
  };
}

// ── Parse a Form 4 filing into a lead ─────────────────────────
function form4ToLead(hit) {
  const src = hit._source || hit;

  const entityName  = src.entity_name || src.display_names?.[0]?.name || 'Unknown Exec';
  const filingDate  = src.file_date   || src.period_of_report || DATE;
  const company     = src.company_name || src.entity_name || '';

  // Extract first/last from entity name
  const nameParts = entityName.trim().split(/\s+/);
  const lastName  = nameParts.pop() || 'Unknown';
  const firstName = nameParts.join(' ') || 'Executive';

  // Estimate timing — Form 4 is time-critical
  const filedDaysAgo = Math.floor(
    (Date.now() - new Date(filingDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const timingScore = filedDaysAgo <= 2  ? 98 :
                      filedDaysAgo <= 5  ? 92 :
                      filedDaysAgo <= 7  ? 85 :
                      filedDaysAgo <= 14 ? 75 : 65;

  return {
    firstName,
    lastName,
    title:       'Corporate Executive',
    company:     company,
    city:        '',         // SEC doesn't always include city — needs identity resolution
    state:       STATE || '',
    niche:       'C-Suite Executives',
    fitScore:    80,
    timingScore,
    estimatedAUM: 'Unknown — see RSU vesting signal',
    reasonCodes: [
      `SEC Form 4 filed ${filedDaysAgo} day(s) ago`,
      'Insider equity transaction — liquidity event',
      'RSU vesting or stock option exercise',
      'No advisor on record (public filing only)',
    ],
    signals: {
      secFilingDate:  filingDate,
      secFormType:    'Form 4 — Insider Transaction',
      filedDaysAgo:   String(filedDaysAgo),
      nextEvent:      `Form 4 filed ${filedDaysAgo}d ago — reach out NOW before tax window closes`,
      estimatedAssets: 'Confirm via identity resolution',
      outreachAngle:  'RSU vesting tax strategy + concentrated stock planning',
    },
    source:   'SEC Form 4',
    _needsIdentityResolution: true,
    _secAccessionNumber: src.accession_no || src.accession_number || '',
    _secEntityName:      entityName,
    _secCompany:         company,
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const { startdt, enddt } = getDateRange(DAYS_BACK);

  console.log('\n📈 SEC Form 4 Scraper — RSU / Equity Vesting Events');
  console.log(`   Date range: ${startdt} → ${enddt} (last ${DAYS_BACK} days)`);
  console.log(`   State filter: ${STATE || 'none (national)'} | Limit: ${LIMIT}`);
  console.log(`   Source: SEC EDGAR public API (no auth required)\n`);

  // SEC EDGAR full-text search for Form 4 filings
  const params = new URLSearchParams({
    q:         '',
    forms:     '4',
    dateRange: 'custom',
    startdt,
    enddt,
    hits:      LIMIT * 2,
  });

  const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
  console.log(`   Fetching: https://efts.sec.gov/LATEST/search-index...\n`);

  let data;
  try {
    data = await fetch(url);
  } catch(e) {
    // Fallback to EDGAR full text search
    const fallbackUrl = `https://efts.sec.gov/LATEST/search-index?q=%22Form+4%22&forms=4&dateRange=custom&startdt=${startdt}&enddt=${enddt}`;
    console.log('   Primary endpoint failed, trying fallback...');
    try {
      data = await fetch(fallbackUrl);
    } catch(e2) {
      console.error(`❌ SEC EDGAR API error: ${e2.message}`);
      console.error('   SEC API may be rate-limiting. Wait 60s and retry.');
      process.exit(1);
    }
  }

  const hits = data?.hits?.hits || [];
  console.log(`   Raw Form 4 filings: ${hits.length}`);

  // Filter and dedupe by entity name
  const seen = new Set();
  const filtered = hits
    .filter(h => {
      const name = (h._source?.entity_name || h._source?.display_names?.[0]?.name || '').trim();
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, LIMIT);

  console.log(`   Unique executives: ${filtered.length}\n`);

  if (filtered.length === 0) {
    console.log('⚠️  No Form 4 filings found in this date range.');
    console.log('   Try: --days=14 to expand the window\n');
    process.exit(0);
  }

  const leads = filtered.map(form4ToLead);

  // Log preview
  leads.slice(0, 5).forEach(l => {
    console.log(`  ✅ ${l.firstName} ${l.lastName} | ${l.company} | Timing: ${l.timingScore}`);
  });
  if (leads.length > 5) console.log(`  ... and ${leads.length - 5} more\n`);

  // Write output
  fs.writeFileSync(OUTFILE, JSON.stringify(leads, null, 2));
  console.log(`\n✅ ${leads.length} SEC Form 4 leads written to:`);
  console.log(`   ${OUTFILE}`);
  console.log('\n⚡ TIMING ALERT: Form 4 leads are time-sensitive.');
  console.log('   Run through the pipeline and route within 48 hours of filing.\n');
  console.log('Next step: node scripts/review_alfred_leads.js\n');
}

main().catch(err => {
  console.error('❌ SEC Form 4 scraper failed:', err.message);
  process.exit(1);
});
