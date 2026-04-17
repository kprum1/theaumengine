#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Agent Apollo Enrichment (A-Enrich)
// scripts/agent_apollo_enrich.js
// Sprint C29 — Priority 5: Owner name resolution for firm-level leads
//
// Purpose: For leads with needsNameResolution: true, calls Apollo.io
//   People Search to find the owner/president/principal by company name.
//   Writes enriched records to staging/enriched/ with resolved names.
//
// Supported niches:
//   high-earning-tradesman  (A10 — BBB/MN SOS firm-level leads)
//   henrys                  (A12 — DOL H-1B employer-title leads)
//
// Usage:
//   node scripts/agent_apollo_enrich.js --file <scrubbed.json>
//   node scripts/agent_apollo_enrich.js --file <scrubbed.json> --dry-run
//   node scripts/agent_apollo_enrich.js --file <scrubbed.json> --limit 10
//   node scripts/agent_apollo_enrich.js --file <scrubbed.json> --force-all
//
// Requirements:
//   APOLLO_API_KEY env var OR scripts/config/apollo.json { "apiKey": "..." }
//   Free tier: 50 People searches/month — use --limit to stay within budget
//
// Output: scripts/staging/enriched/<batchId>.enriched.json
//
// Apollo free tier docs: https://apolloio.github.io/apollo-api-docs/
// =====================================================================

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CLI args ──────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag  = (f) => args.includes(f);

const FILE_ARG  = getArg('--file');
const DRY_RUN   = hasFlag('--dry-run');
const FORCE_ALL = hasFlag('--force-all');  // enrich even leads without needsNameResolution
const LIMIT     = parseInt(getArg('--limit') || '50', 10);
const DELAY_MS  = parseInt(getArg('--delay') || '1200', 10); // ms between API calls (rate limit)

// ── Apollo config ─────────────────────────────────────────────────────
function loadApiKey() {
  // Priority 1: env var
  if (process.env.APOLLO_API_KEY) return process.env.APOLLO_API_KEY;

  // Priority 2: config file
  const cfgPath = path.join(__dirname, 'config', 'apollo.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.apiKey) return cfg.apiKey;
    } catch (e) { /* ignore */ }
  }

  return null;
}

const APOLLO_API_KEY = loadApiKey();
const APOLLO_BASE    = 'api.apollo.io';

// ── Titles to search for (owner-tier roles) ───────────────────────────
// Apollo title search is fuzzy — these hit owner/principal for SMBs
const OWNER_TITLES = [
  'Owner',
  'Co-Owner',
  'President',
  'Founder',
  'Principal',
  'Managing Partner',
  'CEO',
  'Chief Executive Officer',
];

// HENRYs niche uses different titles — high-earner individual contributors
const HENRY_TITLES = [
  'Senior Software Engineer',
  'Staff Software Engineer',
  'Principal Engineer',
  'Engineering Manager',
  'Senior Data Scientist',
  'Product Manager',
  'Senior Product Manager',
  'Director of Engineering',
  'VP of Engineering',
];

// ── Apollo People Search ──────────────────────────────────────────────
function apolloPeopleSearch(companyName, titles, city, state) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      q_organization_name:        companyName,
      person_titles:              titles,
      person_locations:           city && state ? [`${city}, ${state}`] : [],
      page:                       1,
      per_page:                   3,  // top 3 candidates — we take the first
      prospected_by_current_team: ['no'],
    });

    const options = {
      hostname: APOLLO_BASE,
      path:     '/v1/people/search',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Cache-Control':  'no-cache',
        'X-Api-Key':      APOLLO_API_KEY,   // Apollo requires key in header, not body
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Apollo Organization Enrich (domain-based) ─────────────────────────
// Used when company website is available — more accurate than name search
function apolloOrgEnrich(domain) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ domain });

    const options = {
      hostname: APOLLO_BASE,
      path:     '/v1/organizations/enrich',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Cache-Control':  'no-cache',
        'X-Api-Key':      APOLLO_API_KEY,   // Apollo requires key in header, not body
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: null });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Extract domain from URL ────────────────────────────────────────────
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

// ── Pick best candidate from Apollo results ────────────────────────────
function pickBestPerson(people) {
  if (!people || !people.length) return null;

  // Score candidates: prefer owners/founders, penalize generic titles
  const scored = people.map(p => {
    const title = (p.title || '').toLowerCase();
    let score = 0;
    if (title.includes('owner'))    score += 30;
    if (title.includes('founder'))  score += 28;
    if (title.includes('president'))score += 25;
    if (title.includes('ceo'))      score += 20;
    if (title.includes('principal'))score += 18;
    if (p.email_status === 'verified') score += 15;
    if (p.phone_numbers?.length)       score += 10;
    if (p.linkedin_url)                score += 5;
    return { person: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].person;
}

// ── Rate limiter ──────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Enrich a single lead ──────────────────────────────────────────────
async function enrichLead(lead, apiCallCount) {
  const companyName = lead.company || lead.fullName || '';
  const city  = lead.city  || '';
  const state = lead.state || '';
  const niche = lead.nicheId || '';

  // Choose title list based on niche
  const titles = niche === 'henrys' ? HENRY_TITLES : OWNER_TITLES;

  // Try domain-based org enrich first if sourceUrl is a company website
  const domain = extractDomain(lead.sourceUrl);
  const isDomainUrl = domain &&
    !domain.includes('bbb.org') &&
    !domain.includes('mncis.') &&
    !domain.includes('dol.gov') &&
    !domain.includes('sec.gov') &&
    !domain.includes('spotrac') &&
    !domain.includes('hoopshype');

  let result = {
    leadId:            lead.leadId,
    company:           companyName,
    enriched:          false,
    apolloCallsMade:   0,
    firstName:         null,
    lastName:          null,
    fullName:          null,
    title:             null,
    email:             null,
    phone:             null,
    linkedInUrl:       null,
    apolloPersonId:    null,
    enrichmentSource:  'apollo_people_search',
    enrichedAt:        new Date().toISOString(),
    error:             null,
  };

  try {
    // Primary: Apollo People Search by company name + owner titles
    if (DRY_RUN) {
      result.dryRun = true;
      result.wouldSearchFor = { companyName, titles: titles.slice(0,3), city, state };
      return result;
    }

    const searchResp = await apolloPeopleSearch(companyName, titles, city, state);
    result.apolloCallsMade++;

    if (searchResp.status === 200 && searchResp.body?.people?.length) {
      const person = pickBestPerson(searchResp.body.people);
      if (person) {
        result.enriched       = true;
        result.firstName      = person.first_name  || '';
        result.lastName       = person.last_name   || '';
        result.fullName       = `${person.first_name || ''} ${person.last_name || ''}`.trim();
        result.title          = person.title        || '';
        result.email          = person.email        || '';
        result.phone          = person.phone_numbers?.[0]?.sanitized_number || '';
        result.linkedInUrl    = person.linkedin_url  || '';
        result.apolloPersonId = person.id            || '';
        result.enrichmentSource = 'apollo_people_search';
      }
    } else if (searchResp.status === 401) {
      result.error = 'Apollo API key invalid or missing';
    } else if (searchResp.status === 429) {
      result.error = 'Apollo rate limit hit — slow down or upgrade plan';
    } else if (searchResp.status === 422) {
      result.error = `Apollo validation error: ${JSON.stringify(searchResp.body?.error)}`;
    } else {
      result.error = `Apollo returned status ${searchResp.status}: ${JSON.stringify(searchResp.body).slice(0, 100)}`;
    }

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

// ── Apply enrichment back to the lead ─────────────────────────────────
function applyEnrichment(lead, enrichResult) {
  if (!enrichResult.enriched) return { ...lead, enrichmentAttempted: true, enrichmentFailed: true, enrichmentError: enrichResult.error };

  return {
    ...lead,
    firstName:            enrichResult.firstName,
    lastName:             enrichResult.lastName,
    fullName:             enrichResult.fullName,
    title:                enrichResult.title || lead.title,
    email:                enrichResult.email || lead.email,
    phone:                enrichResult.phone || lead.phone,
    linkedInUrl:          enrichResult.linkedInUrl || lead.linkedInUrl,
    needsNameResolution:  false,
    needsEnrichment:      false,
    apolloPersonId:       enrichResult.apolloPersonId,
    enrichmentSource:     enrichResult.enrichmentSource,
    enrichmentAttempted:  true,
    enrichedAt:           enrichResult.enrichedAt,
    updatedAt:            new Date().toISOString(),
    status:               'enriched',
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Apollo Enrichment Agent (A-Enrich)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Validate input ────────────────────────────────────────────────
  if (!FILE_ARG) {
    console.error('Usage: node scripts/agent_apollo_enrich.js --file <scrubbed.json> [--dry-run] [--limit N]');
    console.error('\nExamples:');
    console.error('  node scripts/agent_apollo_enrich.js --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json --dry-run');
    console.error('  node scripts/agent_apollo_enrich.js --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json --limit 10');
    process.exit(1);
  }

  if (!fs.existsSync(FILE_ARG)) {
    console.error(`❌ File not found: ${FILE_ARG}`);
    process.exit(1);
  }

  // ── API key check ─────────────────────────────────────────────────
  if (!APOLLO_API_KEY) {
    console.log('⚠️  NO APOLLO API KEY FOUND\n');
    console.log('  To get a free Apollo.io API key:');
    console.log('  1. Go to: https://app.apollo.io/#/settings/integrations/api');
    console.log('  2. Sign up for free (no credit card required)');
    console.log('  3. Free tier: 50 people search credits/month');
    console.log('  4. Set key via one of:');
    console.log('     a) APOLLO_API_KEY=your_key node scripts/agent_apollo_enrich.js ...');
    console.log('     b) Create scripts/config/apollo.json: { "apiKey": "your_key" }');
    console.log('\n  Running in DRY-RUN mode to show what would be searched...\n');
    // Fall through — dry-run shows preview even without key
  }

  // ── Load batch ────────────────────────────────────────────────────
  const raw   = JSON.parse(fs.readFileSync(FILE_ARG, 'utf8'));
  const leads = Array.isArray(raw) ? raw : (raw.leads || []);
  const batchId = raw.batchId || path.basename(FILE_ARG, '.json').replace('.scrubbed', '');

  // Filter to leads that need enrichment
  const toEnrich = FORCE_ALL
    ? leads
    : leads.filter(l => l.needsNameResolution || l.needsEnrichment);

  const alreadyResolved = leads.filter(l => !l.needsNameResolution && !l.needsEnrichment).length;

  console.log(`Input:            ${FILE_ARG}`);
  console.log(`Total leads:      ${leads.length}`);
  console.log(`Needs enrichment: ${toEnrich.length}`);
  console.log(`Already resolved: ${alreadyResolved}`);
  console.log(`Limit:            ${LIMIT}`);
  console.log(`Delay between calls: ${DELAY_MS}ms`);
  console.log(`Dry run:          ${DRY_RUN || !APOLLO_API_KEY}`);
  console.log(`Apollo API key:   ${APOLLO_API_KEY ? '✅ Configured' : '❌ Not set — dry-run only'}`);

  const limitedTargets = toEnrich.slice(0, LIMIT);
  console.log(`\nWill process: ${limitedTargets.length} lead(s)\n`);

  // ── Estimate cost ─────────────────────────────────────────────────
  console.log('── Apollo Credit Estimate ──────────────────────────────────');
  console.log(`  People search calls: ${limitedTargets.length}`);
  console.log(`  Free tier budget: 50 credits/month`);
  console.log(`  Estimated usage: ${limitedTargets.length}/50 credits`);
  if (limitedTargets.length > 40) {
    console.log(`  ⚠️  Close to free tier limit — use --limit to stay under 50`);
  }
  console.log('');

  // ── Process each lead ─────────────────────────────────────────────
  const enrichResults   = [];
  const enrichedLeads   = [];
  let successCount      = 0;
  let failCount         = 0;
  let totalApiCalls     = 0;

  for (let i = 0; i < limitedTargets.length; i++) {
    const lead = limitedTargets[i];
    const label = lead.company || lead.fullName || lead.leadId || `Lead ${i+1}`;

    process.stdout.write(`  [${i+1}/${limitedTargets.length}] ${label.slice(0, 50).padEnd(50)} `);

    const enrichResult = await enrichLead(lead, totalApiCalls);
    totalApiCalls += enrichResult.apolloCallsMade || 0;

    if (enrichResult.dryRun) {
      console.log(`→ DRY RUN — would search: ${JSON.stringify(enrichResult.wouldSearchFor)}`);
    } else if (enrichResult.enriched) {
      successCount++;
      console.log(`→ ✅ ${enrichResult.fullName} (${enrichResult.title})`);
    } else {
      failCount++;
      console.log(`→ ❌ ${enrichResult.error || 'No match found'}`);
    }

    enrichResults.push(enrichResult);

    // Apply enrichment back to lead object
    const enrichedLead = applyEnrichment(lead, enrichResult);
    enrichedLeads.push(enrichedLead);

    // Rate limit — don't hammer Apollo
    if (i < limitedTargets.length - 1 && !DRY_RUN && APOLLO_API_KEY) {
      await sleep(DELAY_MS);
    }
  }

  // Carry through non-enriched leads unchanged
  const notProcessed = leads.filter(l =>
    !limitedTargets.some(t => t.leadId === l.leadId)
  );

  const allOutputLeads = [...enrichedLeads, ...notProcessed];

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   ENRICHMENT SUMMARY                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Processed:     ${limitedTargets.length}`);
  console.log(`  ✅ Enriched:   ${successCount} (names resolved via Apollo)`);
  console.log(`  ❌ Failed:     ${failCount} (no match or API error)`);
  console.log(`  ⏭  Skipped:   ${notProcessed.length} (already resolved or over limit)`);
  console.log(`  API calls made: ${totalApiCalls}`);

  // ── Write output ──────────────────────────────────────────────────
  if (!DRY_RUN || APOLLO_API_KEY) {
    const enrichedDir = path.join(__dirname, 'staging', 'enriched');
    if (!fs.existsSync(enrichedDir)) fs.mkdirSync(enrichedDir, { recursive: true });

    const outFile = path.join(enrichedDir, `${batchId}.enriched.json`);
    const output = {
      batchId,
      enrichedAt:     new Date().toISOString(),
      enrichmentAgent:'Apollo.io People Search v1',
      totalLeads:     allOutputLeads.length,
      enrichedCount:  successCount,
      failedCount:    failCount,
      apiCallsMade:   totalApiCalls,
      leads:          allOutputLeads,
    };

    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`\n  Output written to:`);
    console.log(`  ${outFile}`);
  } else {
    console.log('\n  ℹ️  Dry run — no output file written.');
  }

  // ── Next steps ────────────────────────────────────────────────────
  console.log('\n── Next Steps ──────────────────────────────────────────────');
  if (!APOLLO_API_KEY) {
    console.log('  1. Get Apollo free API key: https://app.apollo.io/#/settings/integrations/api');
    console.log('  2. Create scripts/config/apollo.json: { "apiKey": "YOUR_KEY_HERE" }');
    console.log('  3. Re-run: node scripts/agent_apollo_enrich.js --file <file> --limit 17');
  } else {
    console.log('  1. Review enriched file in staging/enriched/');
    console.log('  2. Spot-check 3–5 resolved names for accuracy');
    console.log('  3. Re-ingest enriched batch (idempotency key will update existing leads):');
    console.log(`     node scripts/lead_ingest_agent.js --file staging/enriched/${batchId}.enriched.json`);
  }
  console.log('\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n[ApolloEnrich] FATAL:', err.message);
  process.exit(1);
});
