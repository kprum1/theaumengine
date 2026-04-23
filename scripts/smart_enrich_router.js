#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Smart Enrichment Router
// scripts/smart_enrich_router.js
//
// PURPOSE: Eliminate wasted API credits by routing each lead
// to the BEST enrichment platform based on its available
// signals. Falls through to secondary/tertiary only on miss.
//
// PLATFORM ROUTING STRATEGY (derived from live hit-rate data):
// ─────────────────────────────────────────────────────────────
//
//  TIER 1 — Free / Registry (always try first, no cost):
//    • NPI / DEA registry    → physicians, dentists (name+NPI)
//    • FAA registry          → aircraft-owners (name+N-number)
//
//  TIER 2 — Apollo ($, B2B company-signal leads):
//    Best for: has company name — returns title, email, LinkedIn
//    ✅ law-partners          → 34/34 (100%)  name+firm
//    ✅ business-owners       → 57/57 (100%)  name+company
//    ✅ re-developers         → 96/96 (100%)  name+company
//    ✅ high-earning-tradesman→ 18/18 (100%)  name+company
//    ✅ c-suite-executives    → high           name+company
//    ✅ charity-board-members → high           name+org
//    ✅ pro-athletes          → moderate        name+team
//    ✅ inheritance           → moderate        name+employer
//    ⚠️ physicians            → moderate        name+hospital (NPI first)
//    ❌ henrys                → low            no company signal
//    ❌ aircraft-owners       → low            private individuals
//
//  TIER 3 — PDL ($, LinkedIn URL or name+location):
//    Best for: has LinkedIn URL → 73% hit rate (19/26)
//    ✅ c-suite-executives    → LinkedIn slug match
//    ✅ aircraft-owners       → name+state match
//    ✅ re-developers         → LinkedIn slug match
//    ✅ henrys                → name+employer (H-1B context)
//    ⚠️ pro-athletes          → profile matched, no contact
//    Trigger: has LinkedIn URL OR (no company, has city+state)
//
//  TIER 4 — NinjaPear ($, name+employer → personal email/phone):
//    ⚠️  BREAKING CHANGE 2026-04: Proxycurl API fully sunsetted (410).
//    New API: https://nubela.co/api/v1/employee/profile
//    Input: work_email OR first_name+employer_website (no LinkedIn URL input)
//    Cost: 3 credits/hit — use only after PDL miss
//    ❌ LinkedIn-URL-only targeting no longer supported
//
//  SKIP LOGIC (never waste a credit on these):
//    - Already has email AND phone → skip
//    - _purgeFlag set → skip
//    - No name (firstName AND lastName blank) → skip unless has LinkedIn
//    - Niche=henrys + no company + no LinkedIn → PDL only (name+location)
//
// ROUTING TABLE:
// ─────────────────────────────────────────────────────────────
//  Niche                  Primary     Secondary    Tertiary
//  physicians             registry    apollo       pdl
//  dentists               registry    apollo       pdl
//  law-partners           apollo      pdl          -
//  business-owners        apollo      pdl          -
//  re-developers          apollo      pdl          ninjapear
//  high-earning-tradesman apollo      pdl          ninjapear
//  c-suite-executives     apollo      pdl          ninjapear
//  charity-board-members  apollo      pdl          -
//  pro-athletes           pdl         ninjapear    -
//  aircraft-owners        pdl         apollo       ninjapear
//  inheritance            apollo      pdl          -
//  ai-displaced-executives apollo     pdl          -
//  henrys                 pdl         ninjapear    -
//
// Usage:
//   node scripts/smart_enrich_router.js --dry-run          (preview routing decisions)
//   node scripts/smart_enrich_router.js --niche henrys     (one niche)
//   node scripts/smart_enrich_router.js --niche physicians (one niche, uses registry→apollo→pdl)
//   node scripts/smart_enrich_router.js --limit 50
//   node scripts/smart_enrich_router.js --platform apollo  (force one platform only)
//   node scripts/smart_enrich_router.js --blank-only       (only leads with 0 contact fields)
// ============================================================

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// ── Load SDKs & Keys ─────────────────────────────────────────
let PDLJS;
try { PDLJS = require('peopledatalabs'); } catch { console.error('❌ npm install peopledatalabs'); process.exit(1); }

function loadKey(filename) {
  if (process.env[filename.toUpperCase().replace('.json','').replace('-','_') + '_API_KEY']) {
    return process.env[filename.toUpperCase().replace('.json','').replace('-','_') + '_API_KEY'];
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', filename), 'utf8'));
    return cfg.apiKey || '';
  } catch { return ''; }
}

const KEYS = {
  apollo:     loadKey('apollo.json'),
  pdl:        loadKey('pdl.json'),
  ninjapear:  loadKey('proxycurl.json'),  // NinjaPear key stored as proxycurl.json
};

// ── Platform routing table (per-niche priority order) ────────
const ROUTE_TABLE = {
  'physicians':             ['registry', 'apollo', 'pdl'],
  'dentists':               ['registry', 'apollo', 'pdl'],
  'law-partners':           ['apollo',   'pdl'],
  'business-owners':        ['apollo',   'pdl'],
  're-developers':          ['apollo',   'pdl',   'ninjapear'],
  'high-earning-tradesman': ['apollo',   'pdl',   'ninjapear'],
  'c-suite-executives':     ['apollo',   'pdl',   'ninjapear'],
  'charity-board-members':  ['apollo',   'pdl'],
  'pro-athletes':           ['pdl',      'ninjapear'],
  'aircraft-owners':        ['pdl',      'apollo', 'ninjapear'],
  'inheritance':            ['apollo',   'pdl'],
  'ai-displaced-executives':['apollo',   'pdl'],
  'henrys':                 ['pdl',      'ninjapear'],
};

// ── SIGNAL STRENGTH: what identifiers do we have? ───────────
function getSignals(d) {
  return {
    hasEmail:    !!(d.email    && typeof d.email    === 'string' && d.email.trim()),
    hasPhone:    !!(d.phone    && typeof d.phone    === 'string' && d.phone.trim()),
    hasLinkedIn: !!(d.linkedInUrl && typeof d.linkedInUrl === 'string' && d.linkedInUrl.includes('linkedin.com')),
    hasCompany:  !!(d.company  && typeof d.company  === 'string' && d.company.trim()),
    hasName:     !!(d.firstName && d.firstName.trim()) || !!(d.lastName && d.lastName.trim()),
    hasLocation: !!(d.city && d.state),
    hasNPI:      !!(d.npi),
    hasNNumber:  !!(d.nNumber  || d.n_number),
  };
}

// ── JUNK NAME DETECTION: don't waste credits on garbage names ─
const JUNK_PATTERNS = [/\bcik\b/i, /Trustee/i, /\bTr\b$/, /\bAl\b$/, /\bEt Al\b/i, /^(Jaw|Jaw Tr|Larson Tr|Patricia Tr)$/i, /^\w{1,3}\s+(Tr|Al|Et)$/i];
function isJunkName(d) {
  const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim();
  if (!fullName || fullName.length < 4) return true;
  if (JUNK_PATTERNS.some(p => p.test(fullName))) return true;
  // CIK contamination in firstName/company
  if (d.firstName && /\(Cik/i.test(d.firstName)) return true;
  if (d.company  && /\(Cik/i.test(d.company))   return true;
  // Only initials (e.g. "R A", "J T")
  if (/^[A-Z]\s+[A-Z]$/.test(fullName)) return true;
  return false;
}

// ── ELIGIBILITY: should we even try this lead? ───────────────
function isEligible(d, sig) {
  if (d._purgeFlag) return { eligible: false, reason: 'purged' };
  if (sig.hasEmail && sig.hasPhone) return { eligible: false, reason: 'already fully enriched' };
  if (!sig.hasName && !sig.hasLinkedIn) return { eligible: false, reason: 'no name and no LinkedIn' };
  if (isJunkName(d)) return { eligible: false, reason: 'junk name — skip' };
  return { eligible: true };
}

// ── PLATFORM SKIP LOGIC: should we skip THIS platform for THIS lead? ─
function shouldSkipPlatform(platform, d, sig) {
  switch (platform) {
    case 'registry':
      // Only useful for physicians/dentists with NPI, or aircraft with N-number
      if (d.nicheId === 'physicians' || d.nicheId === 'dentists') return !sig.hasNPI && !sig.hasName;
      if (d.nicheId === 'aircraft-owners') return !sig.hasNNumber && !sig.hasName;
      return true; // skip registry for all other niches

    case 'apollo':
      // Apollo needs company name for high confidence
      // Without company, apollo will guess → wrong cross-niche matches
      if (!sig.hasCompany && !sig.hasName) return true;
      if (!sig.hasCompany && d.nicheId === 'henrys') return true; // no company on H-1B workers
      if (!sig.hasCompany && d.nicheId === 'aircraft-owners') return true; // private pilots
      // Physicians/dentists without a practice name: name+city alone is too ambiguous for Apollo
      // (948 of 1,138 blanks are name-only; the 190 with practice names still run)
      if (!sig.hasCompany && (d.nicheId === 'physicians' || d.nicheId === 'dentists')) return true;
      return false;

    case 'pdl':
      // PDL works with LinkedIn URL (73% hit) OR name+location (moderate hit)
      // Don't call PDL if no name AND no LinkedIn
      if (!sig.hasName && !sig.hasLinkedIn) return true;
      return false;

    case 'ninjapear':
      // NinjaPear new API requires employer_website (a real domain, e.g. 'grantrealty.com')
      // employer_name alone → HTTP 400. company name strings from HUD/SBA are NOT domains.
      // Skip until we have a domain-enrichment preprocessing step (Google + ClearBit/PDL).
      if (!d.companyDomain) return true;  // ← must skip — no domain = guaranteed 400
      if (!sig.hasEmail && !sig.hasCompany) return true;
      return false;

    default:
      return true;
  }
}

// ── CLI args ─────────────────────────────────────────────────
const args        = process.argv.slice(2);
const getArg      = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN     = args.includes('--dry-run');
const NICHE_ONLY  = getArg('--niche') || null;
const LIMIT       = parseInt(getArg('--limit') || '50', 10);
const FORCE_PLAT  = getArg('--platform') || null;  // force a specific platform
const BLANK_ONLY  = args.includes('--blank-only');
const DELAY_MS    = 1200;
const sleep       = ms => new Promise(r => setTimeout(r, ms));

// ── Apollo enrichment call ───────────────────────────────────
// NOTE: Apollo now requires api_key as X-Api-Key header (body param is rejected with 422)
async function callApollo(lead, d) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      first_name: d.firstName || '',
      last_name:  d.lastName  || '',
      organization_name: d.company || '',
      domain:     '',
      reveal_personal_emails: true,
      // reveal_phone_number: true,  // ← requires webhook_url param (async delivery) — skip
    });
    const options = {
      hostname: 'api.apollo.io',
      path:     '/v1/people/match',
      method:   'POST',
      headers:  {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Api-Key':      KEYS.apollo,  // ← required header auth (2026-04 breaking change)
      },
    };
    const req = https.request(options, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(out);
          if (res.statusCode !== 200) {
            // Surface auth/quota errors without crashing
            process.stdout.write(`  ⚠️  Apollo HTTP ${res.statusCode}: ${r.error || r.message || 'unknown'}\n`);
            return resolve({ ok: false });
          }
          const p = r.person || {};
          resolve({
            ok:    !!p.email || !!(p.phone_numbers && p.phone_numbers.length),
            email: p.email || null,
            phone: (p.phone_numbers && p.phone_numbers[0] && p.phone_numbers[0].sanitized_number) || null,
            title: p.title || null,
            company: (p.organization && p.organization.name) || null,
            linkedIn: p.linkedin_url || null,
            score: p.confidence_score || 0,
          });
        } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// ── PDL enrichment call ──────────────────────────────────────
let pdlClient;
function getPDL() {
  if (!pdlClient) pdlClient = new PDLJS({ apiKey: KEYS.pdl });
  return pdlClient;
}

async function callPDL(lead, d, sig) {
  try {
    const params = {
      first_name:     d.firstName || undefined,
      last_name:      d.lastName  || undefined,
      company:        d.company   || undefined,
      location:       d.city && d.state ? `${d.city}, ${d.state}` : undefined,
      min_likelihood: 3,
    };
    // LinkedIn URL = strongest signal → override others
    if (sig.hasLinkedIn) {
      const slug = d.linkedInUrl.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/in\//i, '').replace(/\/+$/, '');
      params.profile = `linkedin.com/in/${slug}`;
      params.min_likelihood = 2;  // lower threshold — LinkedIn is strong
    }

    const r = await getPDL().person.enrichment(params);
    if (!r || r.status !== 200 || !r.data) return { ok: false };
    const data = r.data;
    const email = (data.emails && data.emails[0]) || null;
    const phone = data.mobile_no || (data.phone_numbers && data.phone_numbers[0]) || null;
    return {
      ok:      !!(email || phone),
      email,
      phone,
      title:   data.experience && data.experience[0] && data.experience[0].title && data.experience[0].title.name || null,
      company: data.experience && data.experience[0] && data.experience[0].company && data.experience[0].company.name || null,
      linkedIn: data.linkedin_url ? `https://www.linkedin.com/in/${data.linkedin_url.replace(/.*\/in\//i,'').replace(/\/+$/,'')}` : null,
    };
  } catch { return { ok: false }; }
}

// ── NinjaPear enrichment call ────────────────────────────────
// ⚠️  ENDPOINT MIGRATION (2026-04): Proxycurl /api/v2/linkedin is 410 GONE.
// New NinjaPear API: https://nubela.co/api/v1/employee/profile
// Input: name+employer_website OR work_email (LinkedIn URL no longer an input)
// Cost: 3 credits/hit
async function callNinjaPear(lead, d) {
  // NinjaPear requires employer_website (domain) for name-based lookup.
  // Without it, skip — it will burn credits without a match.
  if (!d.company && !d.email) return { ok: false, reason: 'no employer signal for NinjaPear' };

  return new Promise((resolve) => {
    const params = new URLSearchParams();
    if (d.firstName) params.set('first_name', d.firstName);
    if (d.lastName)  params.set('last_name',  d.lastName);
    // employer_website: try to derive a domain from company name or use stored domain
    if (d.companyDomain) params.set('employer_website', d.companyDomain);
    else if (d.company)  params.set('employer_name', d.company);  // fallback signal
    if (d.email) params.set('work_email', d.email);

    const req = https.request({
      hostname: 'nubela.co',
      path:     `/api/v1/employee/profile?${params}`,
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${KEYS.ninjapear}`, 'Accept': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          try {
            const e = JSON.parse(body);
            process.stdout.write(`  ⚠️  NinjaPear HTTP ${res.statusCode}: ${e.error?.message || e.message || body.substring(0,100)}\n`);
          } catch { /*noop*/ }
          return resolve({ ok: false, status: res.statusCode });
        }
        try {
          const r = JSON.parse(body);
          // NinjaPear returns emails/phones in arrays
          const email = (r.emails && r.emails[0]) || r.work_email || null;
          const phone = (r.mobile_phones && r.mobile_phones[0]) || (r.phones && r.phones[0]) || null;
          resolve({
            ok:      !!(email || phone),
            email,
            phone,
            title:   r.current_position?.title || null,
            company: r.current_position?.company?.name || null,
            linkedIn: r.linkedin_url ? `https://www.linkedin.com/in/${r.linkedin_url.replace(/.*\/in\//i,'').replace(/\/+$/,'')}` : null,
          });
        } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

// ── Run enrichment via specified platform ────────────────────
async function runPlatform(platform, lead, d, sig) {
  switch (platform) {
    case 'apollo':    return callApollo(lead, d);
    case 'pdl':       return callPDL(lead, d, sig);
    case 'ninjapear': return callNinjaPear(lead, d);  // new API: name+company (no LinkedIn URL)
    case 'registry':  return { ok: false, skip: true, reason: 'registry run separately' };
    default:          return { ok: false };
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Smart Enrichment Router                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Validate keys
  const keyStatus = Object.entries(KEYS).map(([k,v]) => `${k}:${v ? '✅' : '❌'}`).join('  ');
  console.log(`  Keys: ${keyStatus}`);
  if (!KEYS.pdl && !KEYS.apollo) { console.error('\n❌ No API keys found.'); process.exit(1); }

  if (DRY_RUN)    console.log('  🔍 DRY RUN — preview routing decisions, no API calls\n');
  if (NICHE_ONLY) console.log(`  Niche filter: ${NICHE_ONLY}`);
  if (FORCE_PLAT) console.log(`  Platform forced: ${FORCE_PLAT}`);
  if (BLANK_ONLY) console.log('  Filter: blank (0 contact fields) only');
  console.log(`  Limit: ${LIMIT} leads\n`);

  // ── Load leads ───────────────────────────────────────────
  console.log('Loading leads from Firestore...');
  const snap = await db.collection('master_leads').get();

  const candidates = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (NICHE_ONLY && d.nicheId !== NICHE_ONLY) return;

    const sig   = getSignals(d);
    const elig  = isEligible(d, sig);
    if (!elig.eligible) return;
    if (BLANK_ONLY && (sig.hasEmail || sig.hasPhone)) return;

    const routeKey  = d.nicheId in ROUTE_TABLE ? d.nicheId : null;
    const platforms = FORCE_PLAT ? [FORCE_PLAT] : (routeKey ? ROUTE_TABLE[routeKey] : ['apollo','pdl']);

    // Filter out platforms that would be skipped for this lead
    const viable = platforms.filter(p => !shouldSkipPlatform(p, d, sig));
    if (viable.length === 0) return; // nothing can help this lead

    candidates.push({
      docId:     doc.id,
      name:      `${d.firstName || ''} ${d.lastName || ''}`.trim(),
      nicheId:   d.nicheId,
      platforms: viable,
      sig,
      data:      d,
    });
  });

  const toProcess = candidates.slice(0, LIMIT);

  // ── Platform summary ─────────────────────────────────────
  const platformCounts = {};
  toProcess.forEach(c => {
    const p = c.platforms[0]; // primary platform
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  });
  console.log(`Candidates: ${candidates.length} leads need enrichment`);
  console.log(`Processing: ${toProcess.length} this run\n`);
  console.log('Routing plan:');
  Object.entries(platformCounts).sort((a,b)=>b[1]-a[1]).forEach(([p,ct]) => {
    console.log(`  ${p.padEnd(12)} → ${ct} leads as primary`);
  });
  console.log('');

  if (DRY_RUN) {
    console.log('─── DRY RUN — routing decisions ───────────────────────────');
    toProcess.slice(0, 20).forEach((c, i) => {
      const route = c.platforms.join(' → ');
      const signals = [c.sig.hasCompany?'co':'', c.sig.hasLinkedIn?'li':'', c.sig.hasLocation?'loc':'', c.sig.hasNPI?'npi':''].filter(Boolean).join('+') || 'name-only';
      console.log(`  [${String(i+1).padStart(3)}] ${c.name.padEnd(30)} ${c.nicheId.padEnd(26)} signals: ${signals.padEnd(16)} → ${route}`);
    });
    if (toProcess.length > 20) console.log(`  ... and ${toProcess.length - 20} more`);
    console.log('\n  Run without --dry-run to execute.\n');
    process.exit(0);
  }

  // ── Execute enrichment ───────────────────────────────────
  const stats   = {};
  const toWrite = [];
  let totalCalls = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const lead = toProcess[i];
    const idx  = `[${String(i + 1).padStart(3)}/${toProcess.length}]`;
    const lbl  = `${idx} ${lead.name.padEnd(32)} ${lead.nicheId.padEnd(24)}`;

    let enriched = false;

    for (const platform of lead.platforms) {
      if (!KEYS[platform]) {
        process.stdout.write(`  ${lbl} → ⏭  skip ${platform} (no key)\n`);
        continue;
      }

      totalCalls++;
      const result = await runPlatform(platform, lead, lead.data, lead.sig);

      if (!stats[platform]) stats[platform] = { tried: 0, hit: 0, miss: 0 };
      stats[platform].tried++;

      if (result.ok) {
        stats[platform].hit++;
        const fields = [result.email ? 'email' : '', result.phone ? 'phone' : '', result.linkedIn ? 'li' : ''].filter(Boolean).join('+');
        console.log(`  ${lbl} → ✅ ${platform.padEnd(10)} ${fields}`);

        const update = { _routerEnriched: true, _routerPlatform: platform, _routerEnrichedAt: new Date().toISOString() };
        if (result.email)   update.email     = result.email;
        if (result.phone)   update.phone     = result.phone;
        if (result.linkedIn && !lead.sig.hasLinkedIn) update.linkedInUrl = result.linkedIn;
        if (result.title)   update.title     = result.title;
        if (result.company && !lead.sig.hasCompany)  update.company   = result.company;
        toWrite.push({ docId: lead.docId, update });
        enriched = true;
        break; // ← stop — don't call secondary if primary hit
      } else {
        stats[platform].miss++;
        process.stdout.write(`  ${lbl} → ⚠️  ${platform} miss\n`);
      }

      await sleep(DELAY_MS);
    }

    if (!enriched) {
      process.stdout.write(`  ${lbl} → ❌ all platforms missed\n`);
    }

    if (i < toProcess.length - 1) await sleep(400);
  }

  // ── Write to Firestore ───────────────────────────────────
  if (toWrite.length > 0) {
    console.log(`\n── Writing ${toWrite.length} enrichment updates to Firestore...`);
    const BATCH_SIZE = 499;
    for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
      const batch = db.batch();
      toWrite.slice(i, i + BATCH_SIZE).forEach(({ docId, update }) => {
        batch.update(db.collection('master_leads').doc(docId), update);
      });
      await batch.commit();
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} committed (${Math.min(BATCH_SIZE, toWrite.length - i)} docs)`);
    }
  }

  // ── Summary ──────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SMART ROUTER SUMMARY                                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  Object.entries(stats).forEach(([p, s]) => {
    const pct = s.tried > 0 ? Math.round(s.hit / s.tried * 100) : 0;
    console.log(`║  ${p.padEnd(12)} tried:${String(s.tried).padStart(4)}  hit:${String(s.hit).padStart(4)}  (${String(pct).padStart(3)}%)              ║`);
  });
  console.log(`║  ─────────────────────────────────────────────────────  ║`);
  console.log(`║  Total API calls:   ${String(totalCalls).padEnd(36)}║`);
  console.log(`║  Leads enriched:    ${String(toWrite.length).padEnd(36)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (toWrite.length > 0) {
    console.log('\n  node scripts/enrichment_status_report.js');
    console.log('  node scripts/write_pipeline_meta.js\n');
  }

  process.exit(0);
}

main().catch(e => { console.error('[SmartRouter] FATAL:', e.message); process.exit(1); });
