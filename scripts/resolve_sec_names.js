'use strict';
// ============================================================
// C35-6: SEC Form4 Name + Company Resolution (v2)
// Uses EDGAR full-text search to get both person names AND
// issuer companies from display_names array.
//
// Input:  staging/raw/alfred_batch_sec_form4_2026-04-17.raw.json
// Output: staging/raw/alfred_batch_sec_form4_2026-04-17.resolved.json
// ============================================================

const fs    = require('fs');
const https = require('https');
const path  = require('path');

const FORM4_FILE = path.join(__dirname, 'staging/raw/alfred_batch_sec_form4_2026-04-17.raw.json');
const OUT_FILE   = path.join(__dirname, 'staging/raw/alfred_batch_sec_form4_2026-04-17.resolved.json');
const TODAY      = new Date().toISOString().slice(0, 10);

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'AUM-Engine-NameResolver/1.0 kosal@fin-tegration.com' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extract CIK from lastName: "John E. (Cik 0001552715)" → "1552715"
function extractCik(lastName) {
  const m = (lastName || '').match(/\(Cik\s+([\d]+)\)/i);
  return m ? parseInt(m[1], 10).toString() : null;
}

// Fix name order: raw has LAST in firstName, FIRST (CIK) in lastName
function fixNames(raw) {
  const rawFirst = (raw.firstName || '').trim(); // Actually last name: "Heller"
  const rawLast  = (raw.lastName  || '').trim(); // Actually first + CIK: "John E. (Cik 0001552715)"
  const cik      = extractCik(rawLast);
  const firstName = rawLast.replace(/\s*\(Cik\s+[\d]+\)/i, '').trim(); // "John E."
  const lastName  = rawFirst;                                            // "Heller"
  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), cik };
}

// Search EDGAR full-text for this person's Form 4 filings and extract issuer
async function lookupIssuer(firstName, lastName, cik, fileDate) {
  const name = `${firstName} ${lastName}`.trim();
  const encoded = encodeURIComponent(`"${name}"`);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encoded}&forms=4&hits.hits._source=display_names,file_date&hits.hits.total.value=5`;

  try {
    const data = await httpsGet(url);
    if (!data?.hits?.hits?.length) return null;

    // Find the hit closest to our filing date
    const hits = data.hits.hits;
    let best = null;

    // Prefer hit with matching fileDate, otherwise take most recent
    for (const hit of hits) {
      const names = hit._source?.display_names || [];
      // display_names: [person (CIK xxx), COMPANY (TICKER) (CIK yyy)]
      const issuer = names.find(n => {
        if (!n.includes('CIK')) return false;
        const m = n.match(/\(CIK\s+(0*[\d]+)\)/i);
        if (!m) return false;
        const hitCik = parseInt(m[1], 10).toString();
        return hitCik !== cik; // Not the person's own CIK
      });

      if (issuer) {
        // Parse: "Amentum Holdings, Inc.  (CIK 0002011286)" or "VIEMED HEALTHCARE, INC.  (VMD)  (CIK 0001729149)"
        const tickerM = issuer.match(/\(([A-Z]{1,5})\)\s*\(CIK/);
        const ticker  = tickerM ? tickerM[1] : null;
        const company = issuer.replace(/\s*\([A-Z]{1,5}\)\s*\(CIK.*$/, '').replace(/\s*\(CIK.*$/, '').trim();
        const hdDate  = hit._source?.file_date || '';

        if (!best || (fileDate && hdDate >= fileDate) || (fileDate && Math.abs(hdDate.localeCompare(fileDate)) < Math.abs((best.date || '').localeCompare(fileDate)))) {
          best = { company, ticker, date: hdDate };
        }
      }
    }

    return best;
  } catch(e) {
    return null;
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  C35-6: SEC Form4 Name + Company Resolution v2     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const raw   = JSON.parse(fs.readFileSync(FORM4_FILE, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.leads || []);
  console.log(`  Input: ${leads.length} leads\n`);

  const resolved = [];
  let enriched = 0, noCompany = 0;

  // Deduplicate names to avoid redundant SEC API calls
  const cache = {};

  for (let i = 0; i < leads.length; i++) {
    const l = { ...leads[i] };
    const { firstName, lastName, fullName, cik } = fixNames(l);

    l.firstName = firstName;
    l.lastName  = lastName;
    l.fullName  = fullName;
    l.secCik    = cik;
    l.needsNameResolution = false;
    l.nameResolvedAt = new Date().toISOString();

    const cacheKey = fullName + '|' + l.secFilingDate;
    process.stdout.write(`  [${i+1}/${leads.length}] ${fullName} (${l.secFilingDate})... `);

    let issuer = cache[cacheKey];
    if (issuer === undefined) {
      issuer = await lookupIssuer(firstName, lastName, cik, l.secFilingDate);
      cache[cacheKey] = issuer;
      await sleep(150); // polite rate limit
    } else {
      process.stdout.write('[cached] ');
    }

    if (issuer && issuer.company) {
      l.company = issuer.company;
      if (issuer.ticker) l.ticker = issuer.ticker;
      console.log(`✅ ${issuer.company}${issuer.ticker ? ' (' + issuer.ticker + ')' : ''}`);
      enriched++;
    } else {
      l.company = l.company === 'See SEC filing' ? `${firstName} ${lastName} — Insider (company TBD)` : l.company;
      console.log('⚠️  company not found');
      noCompany++;
    }

    l.batchId = `alfred_batch_sec_form4_resolved_${TODAY}`;
    resolved.push(l);
  }

  // Write output
  const unique = [];
  const seenIds = new Set();
  resolved.forEach(l => {
    const key = l.fullName + '|' + l.secFilingDate;
    if (!seenIds.has(key)) { seenIds.add(key); unique.push(l); }
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(unique, null, 2), 'utf8');
  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log(`\n  ✅ Resolved: ${unique.length} unique leads (${leads.length - unique.length} dupes removed)`);
  console.log(`  ✅ Company enriched: ${enriched}`);
  console.log(`  ⚠️  No company found: ${noCompany}`);
  console.log(`\n  Output: ${OUT_FILE} (${sizeKB} KB)\n`);

  console.log('── Sample ────────────────────────────────────────────');
  unique.slice(0, 8).forEach((l, i) => {
    console.log(`  ${i+1}. ${l.firstName} ${l.lastName} — ${l.company}${l.ticker ? ' (' + l.ticker + ')' : ''}`);
  });

  process.exit(0);
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
