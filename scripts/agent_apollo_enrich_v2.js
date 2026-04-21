#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Apollo Enrichment v2
// scripts/agent_apollo_enrich_v2.js
// Sprint C39 — Contact Enrichment Layer (Tier 2)
//
// Upgrades from v1 (staging-file only, name-resolution only) to:
//   - Runs on ALL leads (not just needsNameResolution)
//   - Calls Apollo Person Enrichment API (name + company)
//   - Writes results DIRECTLY back to Firestore master_leads
//   - Tracks enrichmentStatus field on each doc
//   - Supports --niche filter, --limit, --dry-run, --force (re-enrich)
//   - Respects Apollo rate limits (1.2s delay between calls)
//   - Skips leads already marked enrichmentStatus: "enriched"
//
// Usage:
//   node scripts/agent_apollo_enrich_v2.js                        (all blank leads)
//   node scripts/agent_apollo_enrich_v2.js --niche physicians      (one niche)
//   node scripts/agent_apollo_enrich_v2.js --niche c-suite-executives --limit 50
//   node scripts/agent_apollo_enrich_v2.js --dry-run               (preview only)
//   node scripts/agent_apollo_enrich_v2.js --force                 (re-enrich all)
//
// Priority order (most likely to succeed with Apollo):
//   1. physicians / dentists       (CMS records, named individuals)
//   2. c-suite-executives          (SEC 8-K filers, named)
//   3. business-owners             (SBA, named)
//   4. law-partners                (state bar, named)
//   5. aircraft-owners             (FAA — often only lastName)
//
// Costs (Apollo Professional plan, $79/mo):
//   Email lookup: ~1 credit
//   Phone lookup: ~5-8 credits
//   Budget: ~600–1,000 enrichments/month before overage
//
// Apollo API docs: https://apolloio.github.io/apollo-api-docs/#people-search
// =====================================================================

'use strict';

const admin  = require('firebase-admin');
const https  = require('https');
const path   = require('path');
const fs     = require('fs');

const KEY   = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI ───────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const hasFlag     = (f) => args.includes(f);
const getArg      = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN     = hasFlag('--dry-run');
const FORCE       = hasFlag('--force');        // re-enrich even if already enriched
const NICHE_FILTER = getArg('--niche');
const STATE_FILTER = getArg('--state');        // e.g. --state MN
const CITIES_FILTER = getArg('--cities')      // e.g. --cities "Wayzata,Minnetonka,Plymouth"
  ? getArg('--cities').split(',').map(c => c.trim()).filter(Boolean)
  : null;
const LIMIT       = parseInt(getArg('--limit') || '50', 10);
const DELAY_MS    = parseInt(getArg('--delay') || '1300', 10);

// ── Apollo config ─────────────────────────────────────────────────────
function loadApiKey() {
  if (process.env.APOLLO_API_KEY) return process.env.APOLLO_API_KEY;
  const cfgPath = path.join(__dirname, 'config', 'apollo.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.apiKey) return cfg.apiKey;
    } catch (_) {}
  }
  return null;
}

const APOLLO_API_KEY = loadApiKey();
const APOLLO_HOST    = 'api.apollo.io';

// ── Niche → Apollo title hints ────────────────────────────────────────
const NICHE_TITLES = {
  'physicians':             ['Physician', 'Doctor', 'MD', 'DO', 'Surgeon', 'Medical Director'],
  'dentists':               ['Dentist', 'DDS', 'DMD', 'Orthodontist', 'Oral Surgeon'],
  'c-suite-executives':     ['CEO', 'CFO', 'COO', 'CTO', 'President', 'Chief Executive Officer'],
  'business-owners':        ['Owner', 'Founder', 'President', 'Co-Owner', 'Managing Partner'],
  'law-partners':           ['Partner', 'Managing Partner', 'Attorney', 'Counsel', 'General Counsel'],
  'aircraft-owners':        ['Owner', 'President', 'CEO', 'Founder'],
  'yacht-owners':           ['Owner', 'President', 'CEO'],
  'henrys':                 ['Senior Engineer', 'Staff Engineer', 'Engineering Manager', 'Director of Engineering', 'VP Engineering'],
  'ai-displaced-executives':['Chief AI Officer', 'VP Technology', 'Director of AI', 'SVP Technology'],
  're-developers':          ['Principal', 'President', 'CEO', 'Managing Partner', 'Developer'],
  'charity-board-members':  ['Board Member', 'Trustee', 'Executive Director', 'President', 'Chair'],
  'pro-athletes':           [],   // Apollo doesn't have great athlete coverage — skip
  'inheritance':            [],   // Individuals, not professionals — skip
  'high-earning-tradesman': ['Owner', 'President', 'Founder'],
};

// ── Apollo People Match (enrichment endpoint) ────────────────────────
// POST /v1/people/match — name + org → person record + email reveal
function apolloPeopleSearch(lead) {
  return new Promise((resolve, reject) => {
    const city   = lead.city  || '';
    const state  = lead.state || '';

    const payload = JSON.stringify({
      first_name:              lead.firstName?.trim() || undefined,
      last_name:               lead.lastName?.trim()  || undefined,
      organization_name:       lead.company?.trim()   || undefined,
      location:                city && state ? `${city}, ${state}` : (state || undefined),
      reveal_personal_emails:  true,
      reveal_phone_number:     false,  // phone costs extra credits — defer to PDL
    });

    const options = {
      hostname: APOLLO_HOST,
      path:     '/v1/people/match',    // replaces deprecated /v1/people/search
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Cache-Control':  'no-cache',
        'X-Api-Key':      APOLLO_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Pick best match — people/match returns single person object ───────
function pickBestMatch(body, lead) {
  // /v1/people/match returns { person: {...} } not { people: [...] }
  const person = body?.person;
  if (!person) return null;

  // Validate name matches — reject clear mismatches
  const targetFirst = (lead.firstName || '').toLowerCase();
  const targetLast  = (lead.lastName  || '').toLowerCase();
  const pFirst = (person.first_name || '').toLowerCase();
  const pLast  = (person.last_name  || '').toLowerCase();

  let score = 0;
  if (targetFirst && pFirst === targetFirst) score += 30;
  if (targetLast  && pLast  === targetLast)  score += 30;
  if (targetFirst && pFirst.startsWith(targetFirst[0])) score += 5;
  if (person.email && person.email !== '')   score += 20;
  if (person.linkedin_url)                   score += 8;

  person._score = score;
  return person;
}

// ── Format phone number ───────────────────────────────────────────────
function formatPhone(phoneObj) {
  if (!phoneObj) return '';
  return phoneObj.sanitized_number || phoneObj.raw_number || '';
}

// ── Sleep ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Enrich a single lead via Apollo ──────────────────────────────────
async function enrichLead(lead) {
  const result = {
    firestoreId: lead.id,
    enriched: false,
    fields: {},
    source: 'apollo_people_search_v2',
    error: null,
  };

  if (DRY_RUN) {
    result.dryRun = true;
    result.wouldSearch = {
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      company: lead.company,
      niche: lead.nicheId,
      location: `${lead.city || ''}, ${lead.state || ''}`,
    };
    return result;
  }

  try {
    const resp = await apolloPeopleSearch(lead);

    if (resp.status === 200 && resp.body) {
      // people/match returns { person: {...} } — not { people: [...] }
      const person = pickBestMatch(resp.body, lead);

      if (person && person._score >= 30) {
        result.enriched = true;
        result.fields = {
          firstName:   lead.firstName || person.first_name  || '',
          lastName:    lead.lastName  || person.last_name   || '',
          email:       lead.email     || person.email       || '',
          phone:       lead.phone     || formatPhone(person.phone_numbers?.[0]) || '',
          linkedInUrl: lead.linkedInUrl || person.linkedin_url || '',
          title:       lead.title     || person.title       || '',
          company:     lead.company   || person.organization_name || '',
          enrichmentStatus:   'enriched',
          enrichmentSources:  admin.firestore.FieldValue.arrayUnion('apollo'),
          enrichmentScore:    person._score,
          enrichedAt:         new Date().toISOString(),
          apolloPersonId:     person.id || '',
        };
      } else {
        result.error = `Low confidence or no match (score: ${person?._score || 0})`;
      }
    } else if (resp.status === 401) {
      result.error = 'Apollo API key invalid or missing';
    } else if (resp.status === 422) {
      result.error = 'Apollo 422 — deprecated endpoint (already patched, should not occur)';
    } else if (resp.status === 429) {
      result.error = 'Apollo rate limit hit — slow down or upgrade plan';
    } else {
      result.error = `Apollo error ${resp.status}: ${JSON.stringify(resp.body).slice(0, 120)}`;
    }
  } catch (err) {
    result.error = err.message;
  }

  if (!result.enriched) {
    result.fields = {
      enrichmentStatus:  'failed',
      enrichmentSources: admin.firestore.FieldValue.arrayUnion('apollo'),
      enrichedAt:        new Date().toISOString(),
    };
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Apollo Enrichment v2                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (!APOLLO_API_KEY) {
    console.error('❌ Apollo API key not found.');
    console.error('   Set via: APOLLO_API_KEY=xxx or scripts/config/apollo.json');
    process.exit(1);
  }

  console.log(`Mode:          ${DRY_RUN ? '🔍 DRY RUN' : '✍️  LIVE — will write to Firestore'}`);
  console.log(`Niche filter:  ${NICHE_FILTER || 'all niches'}`);
  console.log(`State filter:  ${STATE_FILTER || 'all states'}`);
  console.log(`Cities filter: ${CITIES_FILTER ? CITIES_FILTER.join(', ') : 'all cities'}`);
  console.log(`Limit:         ${LIMIT} leads`);
  console.log(`Force re-enrich: ${FORCE}`);
  console.log(`API key:       ✅ Configured`);
  console.log('');

  // ── Load leads from Firestore ──────────────────────────────────────
  console.log('Loading leads from Firestore...');
  let query = db.collection('master_leads');
  if (NICHE_FILTER)  query = query.where('nicheId', '==', NICHE_FILTER);
  if (STATE_FILTER)  query = query.where('state',   '==', STATE_FILTER);

  const snap = await query.get();
  const allLeads = [];
  snap.forEach(doc => allLeads.push({ id: doc.id, ...doc.data() }));
  // Apply city filter in-memory (Firestore doesn't support array-based IN easily with other filters)
  const filteredLeads = CITIES_FILTER
    ? allLeads.filter(l => CITIES_FILTER.includes(l.city))
    : allLeads;
  console.log(`Loaded: ${allLeads.length} leads`);

  // ── Filter to enrichment candidates ───────────────────────────────
  // Skip: already enriched (unless --force), missing name (can't search), niche is bad for Apollo
  const SKIP_NICHES = ['pro-athletes', 'inheritance'];

  const candidates = filteredLeads.filter(l => {
    if (SKIP_NICHES.includes(l.nicheId)) return false;
    if (!FORCE && l.enrichmentStatus === 'enriched') return false;
    const hasName = (l.firstName && l.firstName.trim()) || (l.lastName && l.lastName.trim());
    const hasCompany = l.company && l.company.trim();
    return hasName || hasCompany;
  });

  const targets = candidates.slice(0, LIMIT);

  console.log(`Candidates for enrichment: ${candidates.length}`);
  console.log(`Will process this run:     ${targets.length}`);
  console.log('');

  // ── Cost estimate ─────────────────────────────────────────────────
  const creditsEst = targets.length * 6; // ~6 credits avg (email + partial phone)
  console.log(`── Cost Estimate ──────────────────────────────────────────────`);
  console.log(`  Leads to process:    ${targets.length}`);
  console.log(`  Est. credits used:   ~${creditsEst} (email ~1, phone ~5 each)`);
  console.log(`  Apollo Pro monthly:  ~1,000 credits included → ${Math.round(100*creditsEst/1000)}% of monthly budget`);
  console.log('');

  if (!DRY_RUN) {
    console.log('Starting enrichment in 3 seconds... (Ctrl+C to abort)');
    await sleep(3000);
  }

  // ── Process leads ─────────────────────────────────────────────────
  let successCount = 0;
  let failCount    = 0;
  let skipCount    = 0;
  const firestoreWrites = [];

  for (let i = 0; i < targets.length; i++) {
    const lead  = targets[i];
    const label = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.company || lead.id;

    process.stdout.write(`  [${String(i+1).padStart(3)}/${targets.length}] ${label.slice(0,42).padEnd(42)} `);

    const result = await enrichLead(lead);

    if (result.dryRun) {
      console.log(`→ 🔍 DRY: would search "${result.wouldSearch.name}" at ${result.wouldSearch.company}`);
      skipCount++;
    } else if (result.enriched) {
      const got = Object.entries(result.fields)
        .filter(([k, v]) => v && !k.includes('At') && !k.includes('Id') && !k.includes('Status') && !k.includes('Source') && !k.includes('Score') && k !== 'firstName' && k !== 'lastName')
        .map(([k]) => k);
      console.log(`→ ✅ Got: ${got.join(', ')}`);
      successCount++;
      firestoreWrites.push({ id: lead.id, patch: result.fields });
    } else {
      console.log(`→ ❌ ${result.error || 'No match'}`);
      failCount++;
      if (!DRY_RUN) {
        firestoreWrites.push({ id: lead.id, patch: result.fields });
      }
    }

    // Rate limit
    if (i < targets.length - 1 && !DRY_RUN) {
      await sleep(DELAY_MS);
    }
  }

  // ── Write to Firestore ─────────────────────────────────────────────
  if (!DRY_RUN && firestoreWrites.length > 0) {
    console.log(`\n── Writing ${firestoreWrites.length} enrichment updates to Firestore...`);
    const BATCH_SIZE = 400;
    for (let i = 0; i < firestoreWrites.length; i += BATCH_SIZE) {
      const chunk = firestoreWrites.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ id, patch }) => {
        batch.update(db.collection('master_leads').doc(id), patch);
      });
      await batch.commit();
      console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE) + 1} committed (${chunk.length} docs)`);
      if (i + BATCH_SIZE < firestoreWrites.length) await sleep(300);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   APOLLO ENRICHMENT SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Enriched:     ${successCount}`);
  console.log(`  ❌ No match:     ${failCount}`);
  console.log(`  ⏭  Dry/skipped: ${skipCount}`);
  console.log('');

  if (!DRY_RUN) {
    console.log('  Next steps:');
    console.log('  1. Run enrichment_status_report.js to see updated coverage:');
    console.log('     node scripts/enrichment_status_report.js');
    console.log('  2. Spot-check 3-5 enriched leads in Firestore console');
    console.log('  3. Run next niche or increase --limit for more coverage');
  } else {
    console.log('  Remove --dry-run to execute live enrichment.');
  }

  console.log('\n');
  process.exit(0);
}

main().catch(e => { console.error('[ApolloEnrichV2] FATAL:', e.message); process.exit(1); });
