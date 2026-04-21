#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — People Data Labs Enrichment Agent
// scripts/agent_pdl_enrich.js
// Sprint C39 — Contact Enrichment Layer (Tier 2 — PDL)
//
// Purpose: Enriches master_leads with People Data Labs person API.
//   PDL is the widest-coverage enrichment source — spans both B2B
//   professionals AND private HNW individuals (aircraft owners, athletes,
//   yacht owners, inheritance). Returns email, phone, address, LinkedIn,
//   Facebook, Twitter in a single API call.
//
// Coverage by niche:
//   ✅ physicians, dentists       — works via NPI name + location
//   ✅ c-suite-executives         — works via SEC name + company
//   ✅ business-owners            — works via SBA name + company
//   ✅ law-partners               — works via bar name + firm
//   ✅ aircraft-owners            — works via FAA name + state
//   ✅ yacht-owners               — works via USCG name + state
//   ✅ pro-athletes               — works via name + sport context
//   ✅ charity-board-members      — works via 990 name + org
//   ✅ ai-displaced-executives    — works via WARN name + company
//   ✅ henrys                     — works via H-1B employer name
//   ✅ high-earning-tradesman     — works via BBB name + company
//   ⚠️ inheritance               — hit rate lower (individuals only)
//
// PDL API returns (when matched):
//   - emails[]          personal + work emails
//   - phone_numbers[]   personal + work phones
//   - location          city, state, country, street address
//   - linkedin_url      LinkedIn profile
//   - facebook_url      Facebook profile
//   - twitter_url       Twitter/X profile
//   - education[]       degrees + schools
//   - experience[]      job history
//
// Usage:
//   node scripts/agent_pdl_enrich.js                        (all blank leads)
//   node scripts/agent_pdl_enrich.js --niche physicians
//   node scripts/agent_pdl_enrich.js --niche aircraft-owners
//   node scripts/agent_pdl_enrich.js --limit 20
//   node scripts/agent_pdl_enrich.js --dry-run              (show what would be searched)
//   node scripts/agent_pdl_enrich.js --force               (re-enrich already enriched)
//   node scripts/agent_pdl_enrich.js --niche physicians --limit 10
//
// PDL Free tier: 100 credits/month — each successful match = 1 credit
// PDL Pro:       $98/mo — 350 credits/month
// Docs:          https://docs.peopledatalabs.com/docs/person-enrichment-api
// =====================================================================

'use strict';

const admin  = require('firebase-admin');
const path   = require('path');
const fs     = require('fs');

const KEY    = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── Load PDL SDK ──────────────────────────────────────────────────────
let PDLJS;
try {
  PDLJS = require('peopledatalabs');
} catch (e) {
  console.error('❌ PDL SDK not installed. Run: npm install peopledatalabs');
  console.error('   from directory: /Users/kosalprum/Documents/AdvDiamondMining/scripts/');
  process.exit(1);
}

// ── Load API key ──────────────────────────────────────────────────────
function loadApiKey() {
  if (process.env.PDL_API_KEY) return process.env.PDL_API_KEY;
  const cfgPath = path.join(__dirname, 'config', 'pdl.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.apiKey) return cfg.apiKey;
    } catch (_) {}
  }
  return null;
}

const PDL_API_KEY = loadApiKey();

// ── CLI ───────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const hasFlag      = (f) => args.includes(f);
const getArg       = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN      = hasFlag('--dry-run');
const FORCE        = hasFlag('--force');
const NO_CONTACT_ONLY = hasFlag('--no-contact-only'); // skip leads that already have email OR phone
const NICHE_FILTER = getArg('--niche');
const STATE_FILTER = getArg('--state');               // e.g. --state MN
const CITIES_FILTER = getArg('--cities')              // e.g. --cities "Wayzata,Minnetonka"
  ? getArg('--cities').split(',').map(c => c.trim()).filter(Boolean)
  : null;
const LIMIT        = parseInt(getArg('--limit') || '20', 10);
const DELAY_MS     = parseInt(getArg('--delay') || '500', 10);

// ── Niches PDL handles poorly — skip to save credits ─────────────────
const LOW_HIT_NICHES = []; // PDL is broad enough — try all niches

// ── Helpers ───────────────────────────────────────────────────────────
function hasValue(v) {
  return v && typeof v === 'string' && v.trim().length > 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatPhone(phoneArr) {
  if (!phoneArr || !phoneArr.length) return '';
  // PDL phone type can be 'mobile', 'personal', or 'professional' — prefer personal/mobile
  const mobile = phoneArr.find(p => ['mobile', 'personal'].includes(p.type));
  return mobile ? mobile.number : phoneArr[0].number || '';
}

function formatEmail(emailArr) {
  if (!emailArr || !emailArr.length) return '';
  // Prefer current/personal emails over old ones
  const current = emailArr.find(e => e.current === true);
  return current ? current.address : emailArr[0].address || '';
}

function formatAddress(location) {
  if (!location) return '';
  const parts = [
    location.street_address,
    location.locality,     // city
    location.region_abbr || location.region,  // state
    location.postal_code,
  ].filter(Boolean);
  return parts.join(', ');
}

// ── Build PDL params from lead ─────────────────────────────────────────
// PDL SDK takes FLAT params (not nested under 'params' key)
function buildPDLParams(lead) {
  const params = {};

  // Name — required for matching
  if (hasValue(lead.firstName)) params.first_name = lead.firstName.trim();
  if (hasValue(lead.lastName))  params.last_name  = lead.lastName.trim();

  // Location — improves match rate significantly
  if (hasValue(lead.city))  params.locality = lead.city.trim();
  if (hasValue(lead.state)) {
    // PDL requires full state name — all 50 states covered
    const stateNames = {
      'AL':'Alabama',    'AK':'Alaska',        'AZ':'Arizona',       'AR':'Arkansas',
      'CA':'California', 'CO':'Colorado',       'CT':'Connecticut',   'DE':'Delaware',
      'FL':'Florida',    'GA':'Georgia',        'HI':'Hawaii',        'ID':'Idaho',
      'IL':'Illinois',   'IN':'Indiana',        'IA':'Iowa',          'KS':'Kansas',
      'KY':'Kentucky',   'LA':'Louisiana',      'ME':'Maine',         'MD':'Maryland',
      'MA':'Massachusetts','MI':'Michigan',     'MN':'Minnesota',     'MS':'Mississippi',
      'MO':'Missouri',   'MT':'Montana',        'NE':'Nebraska',      'NV':'Nevada',
      'NH':'New Hampshire','NJ':'New Jersey',   'NM':'New Mexico',    'NY':'New York',
      'NC':'North Carolina','ND':'North Dakota','OH':'Ohio',          'OK':'Oklahoma',
      'OR':'Oregon',     'PA':'Pennsylvania',   'RI':'Rhode Island',  'SC':'South Carolina',
      'SD':'South Dakota','TN':'Tennessee',     'TX':'Texas',         'UT':'Utah',
      'VT':'Vermont',    'VA':'Virginia',       'WA':'Washington',    'WV':'West Virginia',
      'WI':'Wisconsin',  'WY':'Wyoming',
    };
    params.region = stateNames[lead.state.trim()] || lead.state.trim();
  }

  // Company — strong signal for professionals
  if (hasValue(lead.company)) params.company = lead.company.trim();

  // Existing identifiers — extremely high confidence
  if (hasValue(lead.linkedInUrl)) params.profile = lead.linkedInUrl.trim();
  if (hasValue(lead.email))       params.email   = lead.email.trim();
  if (hasValue(lead.phone))       params.phone   = lead.phone.replace(/\D/g, '');

  // PDL quality controls — niche-aware likelihood threshold
  // Private HNW individuals (name + state only) → lower bar (4) to get any match
  // B2B professionals (name + company) → require high confidence (6) to avoid weak hits
  const PRIVATE_NICHES = ['aircraft-owners', 'yacht-owners', 'pro-athletes', 'inheritance'];
  params.min_likelihood = PRIVATE_NICHES.includes(lead.nicheId) ? 4 : 6;

  // Require actual contact data — linkedin_url excluded:
  // We already capture social links on PDL matches even without 'required' forcing it.
  // Paying a Pro credit for a LinkedIn-only match adds zero incremental value.
  params.required = 'emails OR phone_numbers';

  // Minimum viable — must have a name
  const hasName = params.first_name && params.last_name;
  if (!hasName && !params.profile && !params.email) return null;

  return params;
}

// ── Enrich a single lead via PDL ──────────────────────────────────────
// Suppress EventEmitter TLS warning for concurrent connections
require('events').EventEmitter.defaultMaxListeners = 30;

async function enrichLead(lead, pdlClient) {
  const result = {
    firestoreId: lead.id,
    enriched:    false,
    fields:      {},
    error:       null,
  };

  const params = buildPDLParams(lead);

  if (!params) {
    result.error = 'Insufficient data to search (need name or identifier)';
    return result;
  }

  if (DRY_RUN) {
    result.dryRun = true;
    result.wouldSearch = params;
    return result;
  }

  try {
    // PDL SDK: pass params FLAT (not nested under 'params' key)
    const response = await pdlClient.person.enrichment(params);

    if (response.status === 200 && response.data) {
      const d = response.data;
      result.enriched = true;

      // Build patch — only overwrite blank fields
      const patch = {};

      // PDL emails[] is array of { address, type, first_seen, last_seen, current }
      const emailList  = Array.isArray(d.emails)        ? d.emails        : [];
      const phoneList  = Array.isArray(d.phone_numbers) ? d.phone_numbers : [];

      const email = formatEmail(emailList);
      const phone = formatPhone(phoneList);
      const addr  = formatAddress(d.location);

      if (email && !hasValue(lead.email))       patch.email       = email;
      if (phone && !hasValue(lead.phone))       patch.phone       = phone;
      if (addr  && !hasValue(lead.address))     patch.address     = addr;

      if (d.linkedin_url && !hasValue(lead.linkedInUrl))  patch.linkedInUrl  = d.linkedin_url;
      if (d.facebook_url && !hasValue(lead.facebookUrl))  patch.facebookUrl  = d.facebook_url;
      if (d.twitter_url  && !hasValue(lead.twitterUrl))   patch.twitterUrl   = d.twitter_url;

      // Always write these enrichment fields
      patch.enrichmentStatus   = 'enriched';
      // arrayUnion preserves provenance — if Apollo runs later, 'pdl' stays in the array
      patch.enrichmentSources  = admin.firestore.FieldValue.arrayUnion('pdl');
      patch.enrichedAt         = new Date().toISOString();
      patch.pdlProfileId       = d.id || '';

      // Bonus fields if we have them
      if (d.job_title && !hasValue(lead.title)) patch.title = d.job_title;

      result.fields = patch;
      result.gotFields = Object.keys(patch).filter(k =>
        !['enrichmentStatus','enrichmentSources','enrichedAt','pdlProfileId'].includes(k)
      );

    } else if (response.status === 404) {
      result.error = 'No PDL match found';
      result.fields = {
        enrichmentStatus: 'failed',
        enrichmentSources: admin.firestore.FieldValue.arrayUnion('pdl'),
        enrichedAt: new Date().toISOString(),
      };
    } else {
      result.error = `PDL error ${response.status}`;
    }

  } catch (err) {
    // PDL SDK throws on 404 in some versions
    if (err.status === 404 || err.message?.includes('404')) {
      result.error = 'No PDL match found';
      result.fields = {
        enrichmentStatus: 'failed',
        enrichmentSources: admin.firestore.FieldValue.arrayUnion('pdl'),
        enrichedAt: new Date().toISOString(),
      };
    } else {
      result.error = err.message;
    }
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — PDL Enrichment Agent                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (!PDL_API_KEY) {
    console.error('❌ PDL API key not found.');
    console.error('   Expected at: scripts/config/pdl.json → { "apiKey": "..." }');
    process.exit(1);
  }

  // ── Init PDL client ───────────────────────────────────────────────
  const pdlClient = new PDLJS({ apiKey: PDL_API_KEY });

  console.log(`Mode:          ${DRY_RUN ? '🔍 DRY RUN' : '✍️  LIVE — writing to Firestore'}`);
  console.log(`Niche:         ${NICHE_FILTER || 'all niches'}`);
  console.log(`State:         ${STATE_FILTER || 'all states'}`);
  console.log(`Cities:        ${CITIES_FILTER ? CITIES_FILTER.join(', ') : 'all cities'}`);
  console.log(`No-contact-only: ${NO_CONTACT_ONLY}`);
  console.log(`Limit:         ${LIMIT} leads`);
  console.log(`Force:         ${FORCE}`);
  console.log(`PDL API key:   ✅ Configured`);
  console.log('');

  // ── Load leads from Firestore ──────────────────────────────────────
  console.log('Loading leads from Firestore...');
  let query = db.collection('master_leads');
  if (NICHE_FILTER)  query = query.where('nicheId', '==', NICHE_FILTER);
  if (STATE_FILTER)  query = query.where('state',   '==', STATE_FILTER);

  const snap = await query.get();
  const allLeads = [];
  snap.forEach(doc => allLeads.push({ id: doc.id, ...doc.data() }));

  // City filter in-memory
  const filteredLeads = CITIES_FILTER
    ? allLeads.filter(l => CITIES_FILTER.includes(l.city))
    : allLeads;
  console.log(`Loaded: ${allLeads.length} leads${CITIES_FILTER ? ` (${filteredLeads.length} in target cities)` : ''}`);

  // ── Filter candidates ─────────────────────────────────────────────
  const candidates = filteredLeads.filter(l => {
    if (!FORCE && l.enrichmentStatus === 'enriched') {
      // --no-contact-only: re-process enriched leads that got no usable contact data
      if (NO_CONTACT_ONLY && !l.email && !l.phone) return true;
      return false;
    }
    const hasName = (hasValue(l.firstName) && hasValue(l.lastName));
    return hasName; // need at least a name to search PDL
  });

  const targets = candidates.slice(0, LIMIT);

  console.log(`Candidates:    ${candidates.length}`);
  console.log(`Processing:    ${targets.length}`);

  if (targets.length === 0) {
    console.log('\n  ℹ️  No leads to enrich. All may already be enriched or missing names.');
    process.exit(0);
  }

  // ── Credit estimate ───────────────────────────────────────────────
  console.log('');
  console.log('── PDL Credit Estimate ─────────────────────────────────────');
  console.log(`  Processing:         ${targets.length} leads`);
  console.log(`  Credits if all hit: ${targets.length} credits (1 per successful match)`);
  console.log(`  Free tier budget:   100 credits/month`);
  console.log(`  This run will use:  up to ${targets.length} credits`);
  console.log('');

  // ── Process leads ─────────────────────────────────────────────────
  let successCount = 0;
  let failCount    = 0;
  let skipCount    = 0;
  const writes = [];

  for (let i = 0; i < targets.length; i++) {
    const lead  = targets[i];
    const label = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();

    process.stdout.write(`  [${String(i+1).padStart(3)}/${targets.length}] ${label.slice(0,40).padEnd(40)} `);

    const result = await enrichLead(lead, pdlClient);

    if (result.dryRun) {
      const searchKeys = Object.keys(result.wouldSearch).join(', ');
      console.log(`→ 🔍 DRY: ${searchKeys}`);
      skipCount++;
    } else if (result.enriched && result.gotFields?.length > 0) {
      console.log(`→ ✅ Got: ${result.gotFields.join(', ')}`);
      successCount++;
      writes.push({ id: lead.id, patch: result.fields });
    } else if (result.enriched && result.gotFields?.length === 0) {
      // Match found but no new fields (all already populated)
      console.log(`→ ⏭  Already complete`);
      skipCount++;
    } else {
      console.log(`→ ❌ ${result.error || 'No match'}`);
      failCount++;
      if (result.fields && Object.keys(result.fields).length > 0) {
        writes.push({ id: lead.id, patch: result.fields }); // write failed status
      }
    }

    // Delay between calls — PDL rate limit is generous but be polite
    if (i < targets.length - 1 && !DRY_RUN) {
      await sleep(DELAY_MS);
    }
  }

  // ── Write to Firestore ─────────────────────────────────────────────
  if (!DRY_RUN && writes.length > 0) {
    console.log(`\n── Writing ${writes.length} updates to Firestore...`);
    const BATCH_SIZE = 400;
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      const chunk = writes.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ id, patch }) => {
        batch.update(db.collection('master_leads').doc(id), patch);
      });
      await batch.commit();
      console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1} committed (${chunk.length} docs)`);
      if (i + BATCH_SIZE < writes.length) await sleep(300);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   PDL ENRICHMENT SUMMARY                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Enriched:       ${successCount}`);
  console.log(`  ❌ No match:       ${failCount}  (PDL hit rate: ${Math.round(100*successCount/(successCount+failCount)||0)}%)`);
  console.log(`  ⏭  Skipped:        ${skipCount}`);
  console.log(`  📊 Credits used:   ~${successCount} of your 100 free tier`);

  if (!DRY_RUN && successCount > 0) {
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Check updated coverage:');
    console.log('     node scripts/enrichment_status_report.js');
    console.log('  2. Run next niche or upgrade PDL to Pro ($98/mo) for 350 credits:');
    console.log('     https://dashboard.peopledatalabs.com/plans');
    console.log('  3. Run Apollo on professional niches for work email:');
    console.log('     node scripts/agent_apollo_enrich_v2.js --niche physicians --limit 50');
  }

  console.log('\n');
  process.exit(0);
}

main().catch(e => { console.error('[PDLEnrich] FATAL:', e.message); process.exit(1); });
