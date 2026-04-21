#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Free Registry Cross-Reference Agent
// scripts/agent_registry_crossref.js
//
// STRATEGY: Zero-cost professional classification of HNW homestead leads.
//
// We have 9,085+ homestead leads with verified names but no profession.
// This agent cross-references those names against free public registries:
//
//   SOURCE 1: CMS NPI Registry (federal, free, no auth)
//     → Physicians, Dentists, Optometrists, Psychiatrists, PTs, etc.
//     → Returns: NPI#, phone, specialty, credential (MD/DO/DDS/etc.)
//
//   SOURCE 2: MN Secretary of State Business Registry (free)
//     → Business owners, registered agents
//     → Returns: business name, registration date, officer names
//
// MATCH LOGIC:
//   Query by last_name + state=MN (broad) → filter by first name similarity
//   This avoids false misses from city encoding differences (Wayzata vs WAYZATA)
//
// OUTCOME per match:
//   - Updates nicheId: 'henrys' → 'physicians' (or dentists, etc.)
//   - Adds phone from NPI
//   - Adds npiNumber, credential, specialty fields
//   - Sets enrichmentStatus: 'registry-matched'
//   - Adds tag: '🏥 NPI Verified MD' (or DDS, etc.)
//
// Usage:
//   node scripts/agent_registry_crossref.js                   (all homestead leads)
//   node scripts/agent_registry_crossref.js --dry-run         (preview matches)
//   node scripts/agent_registry_crossref.js --city Wayzata    (single city)
//   node scripts/agent_registry_crossref.js --niche henrys    (specific niche only)
//   node scripts/agent_registry_crossref.js --limit 500       (cap at N leads)
//   node scripts/agent_registry_crossref.js --source npi      (NPI only)
//   node scripts/agent_registry_crossref.js --source sos      (SOS only)
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const https = require('https');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI ───────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const hasFlag   = f => args.includes(f);
const getArg    = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const DRY_RUN     = hasFlag('--dry-run');
const CITY_FILTER = getArg('--city');
const NICHE_FILTER = getArg('--niche') || 'henrys';  // default: run on henrys leads
const LIMIT       = parseInt(getArg('--limit') || '9999', 10);
const SOURCE      = getArg('--source') || 'all'; // 'npi' | 'sos' | 'all'

// ── NPI taxonomy → niche mapping ─────────────────────────────────────────────
// CMS taxonomy descriptions → our nicheId
const TAXONOMY_MAP = [
  // Physicians / surgeons
  { pattern: /\b(Internal Medicine|Cardiology|Dermatology|Endocrinology|Gastroenterology|Hematology|Infectious Disease|Nephrology|Neurology|Oncology|Ophthalmology|Orthopedic|Pediatrics|Pulmonology|Radiology|Rheumatology|Surgery|Urology|Obstetrics|Gynecology|Anesthesiology|Pathology|Psychiatry|Emergency Medicine|Family Medicine|General Practice)\b/i,
    nicheId: 'physicians', niche: 'Physician', tagPrefix: '🏥', credLabel: 'MD/DO' },

  // Dentists
  { pattern: /\b(Dentistry|Dental|Orthodontics|Oral Surgery|Periodontics|Endodontics|Prosthodontics|Pedodontics)\b/i,
    nicheId: 'dentists', niche: 'Dentist', tagPrefix: '🦷', credLabel: 'DDS/DMD' },

  // Mental health (goes to physicians as close match)
  { pattern: /\b(Psychology|Mental Health|Social Work|Counseling|Behavioral Health)\b/i,
    nicheId: 'physicians', niche: 'Mental Health Professional', tagPrefix: '🧠', credLabel: 'PhD/LCSW' },

  // Physical / Occupational therapy (henrys catch-all — high earners)
  { pattern: /\b(Physical Therapy|Occupational Therapy|Speech|Audiology|Chiropractic|Podiatry)\b/i,
    nicheId: 'henrys', niche: 'Healthcare Professional', tagPrefix: '💊', credLabel: 'PT/OT' },

  // Optometry
  { pattern: /\bOptometr/i,
    nicheId: 'physicians', niche: 'Optometrist', tagPrefix: '👁️', credLabel: 'OD' },
];

// NPI credential → niche override
const CRED_MAP = {
  'MD':  { nicheId: 'physicians', label: 'MD' },
  'DO':  { nicheId: 'physicians', label: 'DO' },
  'DDS': { nicheId: 'dentists',   label: 'DDS' },
  'DMD': { nicheId: 'dentists',   label: 'DMD' },
  'DPM': { nicheId: 'physicians', label: 'DPM (Podiatry)' },
  'OD':  { nicheId: 'physicians', label: 'OD (Optometry)' },
  'PhD': { nicheId: 'physicians', label: 'PhD' },
};

// ── HTTP GET returning parsed JSON ────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AUMEngine/1.0 (lead research platform)' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message} — url: ${url.slice(0, 100)}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Normalize a name for fuzzy matching ──────────────────────────────────────
function normalizeName(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}

function firstNameMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  // Exact match
  if (na === nb) return true;
  // Prefix match (e.g. "Kate" matches "Katherine")
  if (na.length >= 3 && nb.startsWith(na)) return true;
  if (nb.length >= 3 && na.startsWith(nb)) return true;
  // Nickname heuristics
  const nicknames = {
    'katherine':'kate', 'kate':'katherine',
    'william':'bill', 'bill':'william', 'will':'william',
    'robert':'bob', 'bob':'robert',
    'richard':'rick', 'rick':'richard', 'rich':'richard',
    'michael':'mike', 'mike':'michael',
    'james':'jim', 'jim':'james',
    'john':'johnny', 'patricia':'pat', 'margaret':'meg',
    'joseph':'joe', 'joe':'joseph',
    'thomas':'tom', 'tom':'thomas',
    'edward':'ed', 'ed':'edward',
    'charles':'chuck', 'chuck':'charles',
  };
  if (nicknames[na] === nb || nicknames[nb] === na) return true;
  return false;
}

// ── Classify a taxonomy string → niche ───────────────────────────────────────
function classifyTaxonomy(taxonomyDesc, credential) {
  // Try credential first
  if (credential) {
    const credClean = credential.replace(/[^A-Za-z]/g, '');
    for (const [abbr, info] of Object.entries(CRED_MAP)) {
      if (credClean.toUpperCase() === abbr) return { ...info };
    }
  }
  // Try taxonomy pattern
  for (const map of TAXONOMY_MAP) {
    if (map.pattern.test(taxonomyDesc || '')) {
      return { nicheId: map.nicheId, label: map.credLabel, tag: map.tagPrefix };
    }
  }
  return { nicheId: 'physicians', label: 'Healthcare' }; // NPI exists = healthcare professional
}

// ── Query NPI for a single last name (broad) then match by first name ────────
async function queryNPI(firstName, lastName) {
  const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1` +
    `&first_name=${encodeURIComponent(firstName)}` +
    `&last_name=${encodeURIComponent(lastName)}` +
    `&state=MN&enumeration_type=NPI-1&limit=20`;

  const resp = await httpGet(url);
  const results = resp.results || [];

  // Match by first name similarity
  for (const r of results) {
    const b = r.basic || {};
    if (!firstNameMatch(firstName, b.first_name || b.authorized_official_first_name || '')) continue;

    // Get location address
    const locAddr = r.addresses?.find(a => a.address_purpose === 'LOCATION') || r.addresses?.[0] || {};
    const mailingAddr = r.addresses?.find(a => a.address_purpose === 'MAILING') || {};

    const taxonomy = r.taxonomies?.[0] || {};
    const credential = b.credential || '';
    const classified = classifyTaxonomy(taxonomy.desc || '', credential);

    return {
      matched:      true,
      npiNumber:    r.number,
      firstName:    b.first_name || firstName,
      lastName:     b.last_name  || lastName,
      credential,
      specialty:    taxonomy.desc || '',
      phone:        locAddr.telephone_number || mailingAddr.telephone_number || '',
      npiCity:      locAddr.city || '',
      nicheId:      classified.nicheId,
      nicheLabel:   classified.label,
    };
  }

  return { matched: false };
}

// ── MN Secretary of State business search ────────────────────────────────────
// Returns true if the person has a registered MN business
async function queryMNSOS(firstName, lastName) {
  try {
    const url = `https://mblsportal.sos.state.mn.us/api/BusinessSearch` +
      `?BusinessName=&AgentLastName=${encodeURIComponent(lastName)}` +
      `&AgentFirstName=${encodeURIComponent(firstName)}` +
      `&MNITServices=false&Status=1&SearchSubType=1`;
    const resp = await httpGet(url);
    const items = resp.businessList || resp.results || (Array.isArray(resp) ? resp : []);
    if (items.length === 0) return { matched: false };

    // Return first match — we have their name as registered agent
    const b = items[0];
    return {
      matched:       true,
      businessName:  b.BusinessName || b.name || '',
      businessType:  b.BusinessType || b.type || '',
      entityStatus:  b.Status || b.status || '',
      regDate:       b.DateOfFormation || b.formed || '',
    };
  } catch (_) {
    return { matched: false };
  }
}

// ── Load homestead leads from Firestore ──────────────────────────────────────
async function loadCandidates() {
  process.stdout.write('  Loading homestead leads from Firestore... ');

  let q = db.collection('master_leads');

  if (NICHE_FILTER !== 'all') {
    q = q.where('nicheId', '==', NICHE_FILTER);
  }
  // Only homestead sources — no point re-running on NPI-sourced leads
  // Actually, run against ALL henrys regardless of source so we catch everything
  const snap = await q.get();
  let leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filter to leads that have a usable name
  leads = leads.filter(l => l.firstName && l.firstName.trim() && l.lastName && l.lastName.trim());

  // Filter to leads that haven't already been registry-matched
  leads = leads.filter(l => l.enrichmentStatus !== 'registry-matched');

  // City filter
  if (CITY_FILTER) {
    const cf = CITY_FILTER.toLowerCase();
    leads = leads.filter(l => (l.city || '').toLowerCase().includes(cf));
  }

  // Cap
  if (leads.length > LIMIT) leads = leads.slice(0, LIMIT);

  console.log(`${leads.length} candidates loaded`);
  return leads;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Free Registry Cross-Reference Agent          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode:     ${DRY_RUN ? '🔍 DRY RUN' : '✍️  LIVE'}`);
  console.log(`Niche:    ${NICHE_FILTER}`);
  console.log(`City:     ${CITY_FILTER || 'all'}`);
  console.log(`Source:   ${SOURCE} (npi + sos)`);
  console.log(`Limit:    ${LIMIT === 9999 ? 'no limit' : LIMIT}`);
  console.log('');

  const candidates = await loadCandidates();

  if (candidates.length === 0) {
    console.log('  ℹ️  No candidates to process.\n');
    process.exit(0);
  }

  // Track results
  const updates  = [];
  let npiMatches = 0;
  let sosMatches = 0;
  let noMatch    = 0;
  let processed  = 0;

  console.log(`\nCross-referencing ${candidates.length} leads...\n`);
  console.log('  ' + 'Name'.padEnd(32) + 'City'.padEnd(16) + 'NPI Result'.padEnd(30) + 'SOS');
  console.log('  ' + '─'.repeat(85));

  for (const lead of candidates) {
    processed++;
    const { id, firstName, lastName, city } = lead;

    const lineLabel = `${firstName} ${lastName}`.padEnd(30);
    const cityLabel = (city || '').padEnd(14);
    process.stdout.write(`  ${lineLabel}  ${cityLabel}  `);

    let npiResult = { matched: false };
    let sosResult = { matched: false };

    // ── NPI query ──────────────────────────────────────────────────
    if (SOURCE === 'npi' || SOURCE === 'all') {
      try {
        npiResult = await queryNPI(firstName, lastName);
      } catch (e) {
        process.stdout.write(`[NPI err] `);
      }
      await sleep(150); // polite 150ms between NPI calls
    }

    // ── SOS query ──────────────────────────────────────────────────
    if ((SOURCE === 'sos' || SOURCE === 'all') && !npiResult.matched) {
      try {
        sosResult = await queryMNSOS(firstName, lastName);
      } catch (_) {}
      await sleep(100);
    }

    // ── Build update ───────────────────────────────────────────────
    if (npiResult.matched) {
      npiMatches++;
      const tag = `🏥 NPI Verified ${npiResult.credential || 'Provider'}`;
      console.log(`✅ NPI — ${npiResult.specialty} (${npiResult.credential}) | ${npiResult.npiCity}`);

      if (!DRY_RUN) {
        const update = {
          nicheId:          npiResult.nicheId,
          niche:            npiResult.nicheLabel || npiResult.specialty,
          npiNumber:        npiResult.npiNumber,
          credential:       npiResult.credential,
          specialty:        npiResult.specialty,
          enrichmentStatus: 'registry-matched',
          updatedAt:        new Date().toISOString(),
        };
        if (npiResult.phone) update.phone = npiResult.phone;
        // Merge tags
        const existingTags = Array.isArray(lead.tags) ? lead.tags : [];
        if (!existingTags.includes(tag)) update.tags = [...existingTags, tag];
        // Rebuild signals to include specialty
        update.signals = [
          ...(lead.signals || []),
          `🏥 ${npiResult.specialty} (${npiResult.credential}) — NPI ${npiResult.npiNumber}`,
        ];
        updates.push({ id, update });
      }

    } else if (sosResult.matched) {
      sosMatches++;
      console.log(`🏢 SOS — ${sosResult.businessName} (${sosResult.businessType})`);

      if (!DRY_RUN) {
        const update = {
          nicheId:          'business-owners',
          niche:            'Business Owner',
          businessName:     sosResult.businessName,
          businessType:     sosResult.businessType,
          enrichmentStatus: 'registry-matched',
          updatedAt:        new Date().toISOString(),
        };
        const existingTags = Array.isArray(lead.tags) ? lead.tags : [];
        const tag = '🏢 MN SOS Verified Business Owner';
        if (!existingTags.includes(tag)) update.tags = [...existingTags, tag];
        update.signals = [
          ...(lead.signals || []),
          `🏢 Registered: ${sosResult.businessName} (${sosResult.businessType || 'MN LLC'})`,
        ];
        updates.push({ id, update });
      }

    } else {
      noMatch++;
      console.log(`— no match`);
    }

    // Progress every 100
    if (processed % 100 === 0) {
      console.log(`\n  ── Progress: ${processed}/${candidates.length} | NPI: ${npiMatches} | SOS: ${sosMatches} | No match: ${noMatch} ──\n`);
    }
  }

  // ── Write updates to Firestore ────────────────────────────────────────────
  if (!DRY_RUN && updates.length > 0) {
    console.log(`\n── Writing ${updates.length} updates to Firestore...`);
    const BATCH_SIZE = 400;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ id, update }) => {
        batch.update(db.collection('master_leads').doc(id), update);
      });
      await batch.commit();
      written += chunk.length;
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} committed — ${written}/${updates.length}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const hitRate = candidates.length > 0
    ? Math.round(100 * (npiMatches + sosMatches) / candidates.length)
    : 0;

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   REGISTRY CROSS-REF SUMMARY                                 ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  Leads processed:  ${processed}`);
  console.log(`  ✅ NPI matches:   ${npiMatches}  (physicians / dentists / healthcare)`);
  console.log(`  🏢 SOS matches:   ${sosMatches}  (business owners)`);
  console.log(`  — No match:       ${noMatch}`);
  console.log(`  Hit rate:         ${hitRate}%`);
  console.log(`  Cost:             $0.00 (all free public registry data)`);
  console.log('');
  if (DRY_RUN) {
    console.log(`  🔍 DRY RUN — remove --dry-run to write ${npiMatches + sosMatches} updates`);
  } else {
    console.log(`  Next: Run audit to see reclassification impact:`);
    console.log(`    node scripts/audit_data_quality.js`);
    console.log(`  Then route new physicians to Jeremy:`);
    console.log(`    node scripts/route_new_leads.js --advisor jeremy`);
  }
  console.log('');
  process.exit(0);
}

// Fix the source variable reference issue in the NPI block


main().catch(e => {
  console.error('[RegistryCrossRef] FATAL:', e.message);
  process.exit(1);
});
