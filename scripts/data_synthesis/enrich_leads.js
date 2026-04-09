// ======================================================================
// AUM ENGINE — Lead Enrichment Agent (Identity Resolution — Step 2)
// scripts/data_synthesis/enrich_leads.js
//
// PURPOSE:
//   DOL 5500 and USCG registry data gives us a company or vessel —
//   but NOT a person. This agent bridges that gap.
//
// What it does:
//   1. Reads masterLeads with _needsIdentityResolution: true
//   2. For each lead, runs a 3-source enrichment waterfall:
//      A. OpenCorporates API  — company name → registered officer names
//      B. Email pattern gen   — company domain → likely email addresses
//      C. LinkedIn URL build  — structured search URL for Alfred to verify
//   3. Updates masterLead with enriched firstName, lastName, linkedIn, email
//   4. Creates an Alfred Review Task for any lead it couldn't auto-resolve
//   5. Calls identity_resolution_agent.resolveIdentity() to dedup
//
// Pipeline position:
//   approve_and_ingest.js
//     ↓
//   enrich_leads.js          ← THIS FILE
//     ↓
//   identity_resolution_agent.js (dedup against master_contacts)
//     ↓
//   routing_engine.js
//
// Usage:
//   node scripts/data_synthesis/enrich_leads.js [--limit=25] [--dry-run]
// ======================================================================

const admin  = require('firebase-admin');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ── Init ──────────────────────────────────────────────────────
const SA_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();

// ── CLI flags ──────────────────────────────────────────────────
const DRY_RUN  = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.replace('--limit=', '')) : 25;
const DATE     = new Date().toISOString().slice(0, 10);

// ── Alfred review queue path (output for manual enrichment) ───
const REVIEW_DIR  = path.join(__dirname, '..', 'staging');
const REVIEW_FILE = path.join(REVIEW_DIR, `alfred_enrich_queue_${DATE}.json`);

// ── Fetch helper (HTTPS GET → JSON) ───────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'AUM-Engine/1.0 kosal@fin-tegration.com' } };
    https.get(url, options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Source A: OpenCorporates (free, no auth for basic queries) ─
// Returns company officers (directors, owners) by company name + state
async function enrichFromOpenCorporates(companyName, state) {
  try {
    const q   = encodeURIComponent(companyName);
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=us_${state.toLowerCase()}&fields=name,officers`;
    const res = await fetchJSON(url);

    if (res.status !== 200 || !res.data?.results?.companies) return null;

    const companies = res.data.results.companies;
    if (!companies.length) return null;

    // Take best match (first result)
    const company = companies[0].company;
    const officers = company.officers || [];

    // Find owner / director / president
    const owner = officers.find(o =>
      /owner|president|founder|ceo|partner|trustee|principal/i.test(o.officer?.position || '')
    ) || officers[0];

    if (!owner?.officer?.name) return null;

    const fullName = owner.officer.name.trim();
    const parts    = fullName.split(/\s+/);
    const lastName = parts.pop() || '';
    const firstName = parts.join(' ') || '';

    return {
      firstName,
      lastName,
      title:         owner.officer.position || 'Business Owner',
      company:       company.name || companyName,
      city:          company.registered_address?.locality || '',
      _enrichSource: 'OpenCorporates',
      _enrichConfidence: 0.75,
      _ocCompanyNumber: company.company_number || '',
    };
  } catch(e) {
    return null;  // fail silently — fall through to next source
  }
}

// ── Source B: Domain + Email Pattern Generator ─────────────────
// Guesses company domain from company name, generates email candidates
function guessEmailPatterns(firstName, lastName, companyName) {
  if (!firstName || !lastName) return [];

  // Guess domain from company name
  const domainBase = companyName
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co\.|group|holdings|management|advisors|partners|associates)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
    .slice(0, 25);

  if (!domainBase) return [];

  const fn  = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const ln  = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const fi  = fn.charAt(0);

  // Common corporate email patterns (ranked by prevalence)
  const domain = `${domainBase}.com`;
  return [
    `${fi}${ln}@${domain}`,
    `${fn}.${ln}@${domain}`,
    `${fn}@${domain}`,
    `${fn}${ln}@${domain}`,
    `${ln}@${domain}`,
  ];
}

// ── Source C: LinkedIn URL Builder ─────────────────────────────
// Generates structured LinkedIn search URLs for Alfred to verify manually
function buildLinkedInSearchURL(firstName, lastName, company, state) {
  const namePart    = encodeURIComponent(`${firstName} ${lastName}`);
  const companyPart = encodeURIComponent(company);
  return `https://www.linkedin.com/search/results/people/?keywords=${namePart}&company=${companyPart}`;
}

function buildLinkedInCompanySearchURL(companyName, state) {
  const q = encodeURIComponent(`${companyName} owner president ${state}`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}

// ── Source D: USCG Vessel Cross-Reference ─────────────────────
// For Yacht Owner leads — build USCG lookup URL for manual verification
function buildUSCGLookupURL(vesselName) {
  const q = encodeURIComponent(vesselName || '');
  return `https://www.mvr.uscg.mil/NVDCDocuments/CGForm1258SearchPublic.aspx`;
}

// ── Enrich a single lead ───────────────────────────────────────
async function enrichLead(lead, leadId) {
  const log = [];
  const enriched = { ...lead };
  let resolved = false;

  const companyName = lead.company || lead.lastName || ''; // DOL uses company name as lastName
  const state       = lead.state || '';
  const nicheId     = lead.nicheId || '';

  log.push(`Lead: ${leadId} | Company: ${companyName} | Niche: ${nicheId}`);

  // ── Source A: OpenCorporates ─────────────────────────────────
  if (companyName && state && !resolved) {
    await sleep(300); // rate limit respect
    const ocResult = await enrichFromOpenCorporates(companyName, state);
    if (ocResult && ocResult.firstName) {
      Object.assign(enriched, ocResult);
      enriched.emailCandidates = guessEmailPatterns(ocResult.firstName, ocResult.lastName, companyName);
      enriched.linkedIn        = buildLinkedInSearchURL(ocResult.firstName, ocResult.lastName, companyName, state);
      enriched._enrichMethod   = 'opencorporates';
      resolved = true;
      log.push(`  ✅ OpenCorporates: ${ocResult.firstName} ${ocResult.lastName} (${ocResult._enrichConfidence})`);
    } else {
      log.push(`  ⚠️  OpenCorporates: No match for "${companyName}" in ${state}`);
    }
  }

  // ── Source B: Email + LinkedIn fallback (if OC failed) ───────
  if (!resolved) {
    // For DOL leads: firstName = 'Plan Sponsor', lastName = company name
    // We can still generate LinkedIn company search URL
    const liUrl = buildLinkedInCompanySearchURL(companyName, state);

    enriched.linkedIn           = liUrl;
    enriched._enrichMethod      = 'linkedin_search_url';
    enriched._enrichConfidence  = 0.3;
    enriched._requiresAlfredReview = true;
    enriched._alfredInstruction = `Search this URL and identify the business owner: ${liUrl}`;

    // For USCG/Yacht leads
    if (nicheId === 'yacht-owners' && lead.signals?.vesselName) {
      enriched._uscgLookupUrl  = buildUSCGLookupURL(lead.signals.vesselName);
      enriched._alfredInstruction = `Check USCG registry for "${lead.signals.vesselName}" to get owner name, then LinkedIn verify: ${liUrl}`;
    }

    log.push(`  📎 LinkedIn search URL generated — needs Alfred review`);
  }

  // ── Clean up DOL placeholder name ────────────────────────────
  if (enriched.firstName === 'Plan Sponsor') {
    enriched.firstName = enriched._oc_firstName || 'Unknown';
    enriched.lastName  = enriched._oc_lastName  || companyName;
  }

  // ── Generate email candidates (if we have a real name now) ───
  if (enriched.firstName !== 'Unknown' && enriched.lastName !== companyName) {
    enriched.emailCandidates = enriched.emailCandidates ||
      guessEmailPatterns(enriched.firstName, enriched.lastName, companyName);
  }

  // ── Always clear the resolution flag ─────────────────────────
  enriched._needsIdentityResolution = false;
  enriched._enrichedAt = new Date().toISOString();

  return { enriched, resolved, log, requiresAlfredReview: !!enriched._requiresAlfredReview };
}

// ── Batch enrich all pending leads ────────────────────────────
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Lead Enrichment Agent                 ║');
  console.log(DRY_RUN ?
  '║   MODE: DRY RUN                                      ║' :
  '║   MODE: LIVE                                         ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Pull leads needing resolution
  const snap = await db.collection('masterLeads')
    .where('_needsIdentityResolution', '==', true)
    .limit(LIMIT)
    .get();

  if (snap.empty) {
    console.log('  ℹ️  No leads flagged with _needsIdentityResolution: true');
    console.log('  → All leads are already resolved, or run DOL/SEC scrapers first.\n');
    process.exit(0);
  }

  console.log(`  🔍 Leads to enrich: ${snap.docs.length}\n`);

  const alfredQueue  = [];
  let autoResolved   = 0;
  let needsAlfred    = 0;

  for (const doc of snap.docs) {
    const lead   = { id: doc.id, ...doc.data() };
    const result = await enrichLead(lead, doc.id);

    result.log.forEach(l => console.log('  ' + l));

    if (result.resolved) {
      autoResolved++;
      console.log(`  → Auto-resolved: ${result.enriched.firstName} ${result.enriched.lastName}\n`);
    } else {
      needsAlfred++;
      alfredQueue.push({
        leadId:      doc.id,
        company:     lead.company || lead.lastName,
        state:       lead.state,
        niche:       lead.niche,
        linkedIn:    result.enriched.linkedIn,
        instruction: result.enriched._alfredInstruction,
        uscgUrl:     result.enriched._uscgLookupUrl || null,
      });
      console.log(`  → Queued for Alfred review\n`);
    }

    if (!DRY_RUN) {
      // Update masterLead with enriched data
      await db.collection('masterLeads').doc(doc.id).update({
        ...result.enriched,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // ── Write Alfred review queue ─────────────────────────────
  if (alfredQueue.length > 0) {
    if (!fs.existsSync(REVIEW_DIR)) fs.mkdirSync(REVIEW_DIR, { recursive: true });
    fs.writeFileSync(REVIEW_FILE, JSON.stringify({
      generatedAt:  new Date().toISOString(),
      totalTasks:   alfredQueue.length,
      instruction:  'For each lead: open the linkedIn URL, find the business owner, update firstName/lastName/email in masterLeads using the leadId.',
      tasks:        alfredQueue,
    }, null, 2));

    console.log(`\n📋 Alfred Review Queue: ${alfredQueue.length} leads needing manual enrichment`);
    console.log(`   Saved to: ${REVIEW_FILE}`);
    console.log(`\n   Send this file to Alfred with instruction:`);
    console.log(`   "Complete identity resolution for each task. Update Firestore masterLeads with real name + email."`);
  }

  // ── Summary ────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  Enrichment complete                                 ║`);
  console.log(`║  Auto-resolved: ${String(autoResolved).padEnd(10)} Queued for Alfred: ${String(needsAlfred).padEnd(7)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  if (!DRY_RUN) {
    console.log('Next steps:');
    console.log('  1. Send Alfred the enrich queue file above');
    console.log('  2. After Alfred completes: node scripts/identity_resolution_agent.js --batch');
    console.log('  3. Then: node scripts/routing_engine.js\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Enrichment agent failed:', err.message);
  process.exit(1);
});
