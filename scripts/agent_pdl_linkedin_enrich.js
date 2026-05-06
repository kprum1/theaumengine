#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — PDL LinkedIn Reverse Enrichment
// scripts/agent_pdl_linkedin_enrich.js
//
// Targets leads with a LinkedIn URL but no email/phone.
// Passes LinkedIn profile URL as string match signal to PDL.
//
// Usage:
//   node scripts/agent_pdl_linkedin_enrich.js --dry-run
//   node scripts/agent_pdl_linkedin_enrich.js
//   node scripts/agent_pdl_linkedin_enrich.js --niche c-suite-executives
//   node scripts/agent_pdl_linkedin_enrich.js --limit 10
// ============================================================

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// ── Load PDL SDK ──────────────────────────────────────────────
let PDLJS;
try {
  PDLJS = require('peopledatalabs');
} catch (e) {
  console.error('❌ Run: npm install peopledatalabs'); process.exit(1);
}

// ── Load API key ─────────────────────────────────────────────
function loadApiKey() {
  if (process.env.PDL_API_KEY) return process.env.PDL_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'pdl.json'), 'utf8'));
    if (cfg.apiKey) return cfg.apiKey;
  } catch {}
  return '';
}

// ── CLI args ─────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN    = args.includes('--dry-run');
const NICHE_ONLY = getArg('--niche') || null;
const LIMIT      = parseInt(getArg('--limit') || '50', 10);
const DELAY_MS   = 1200;
const sleep      = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────
function extractSlug(url) {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/in\//i, '').replace(/\/+$/, '').trim();
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — PDL LinkedIn Reverse Enrichment            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const PDL_API_KEY = loadApiKey();
  if (!PDL_API_KEY) { console.error('❌ No PDL key in scripts/config/pdl.json'); process.exit(1); }

  const pdlClient = new PDLJS({ apiKey: PDL_API_KEY });
  if (DRY_RUN) console.log('  🔍 DRY RUN — no API calls or writes\n');
  if (NICHE_ONLY) console.log(`  Niche filter: ${NICHE_ONLY}`);
  console.log(`  Limit: ${LIMIT} leads\n`);

  // ── Load candidates ──────────────────────────────────────
  console.log('Loading leads from Firestore...');
  const snap = await db.collection('master_leads').get();

  const candidates = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (NICHE_ONLY && d.nicheId !== NICHE_ONLY) return;
    if (d._purgeFlag) return;
    const hasLinkedIn = !!(d.linkedInUrl && d.linkedInUrl.includes('linkedin.com'));
    const hasEmail    = !!(d.email && d.email.trim());
    const hasPhone    = !!(d.phone && d.phone.trim());
    const slug        = extractSlug(d.linkedInUrl);
    if (hasLinkedIn && !hasEmail && !hasPhone && slug) {
      candidates.push({
        docId:    doc.id,
        name:     `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        nicheId:  d.nicheId,
        slug,
        city:     d.city  || '',
        state:    d.state || '',
      });
    }
  });

  const toProcess = candidates.slice(0, LIMIT);
  console.log(`Candidates:  ${candidates.length} LinkedIn-only leads`);
  console.log(`Processing:  ${toProcess.length} this run\n`);

  if (toProcess.length === 0) {
    console.log('✅ No candidates found.'); process.exit(0);
  }

  // ── Process ───────────────────────────────────────────────
  const stats  = { enriched: 0, noContact: 0, noMatch: 0, error: 0, credits: 0 };
  const toWrite = [];

  for (let i = 0; i < toProcess.length; i++) {
    const lead   = toProcess[i];
    const idx    = `[${String(i + 1).padStart(3)}/${toProcess.length}]`;
    const lbl    = `${idx} ${lead.name.padEnd(36)}`;

    if (DRY_RUN) {
      console.log(`  ${lbl} → 🔍 linkedin.com/in/${lead.slug}`);
      if (i < toProcess.length - 1) await sleep(200);
      continue;
    }

    let response = null;
    let errMsg   = null;

    try {
      const nameParts = lead.name.split(' ');
      response = await pdlClient.person.enrichment({
        profile:        `linkedin.com/in/${lead.slug}`,
        first_name:     nameParts[0] || undefined,
        last_name:      nameParts.slice(1).join(' ') || undefined,
        location:       lead.city && lead.state ? `${lead.city}, ${lead.state}` : undefined,
        min_likelihood: 2,
      });
    } catch (err) {
      errMsg = (err && (err.message || err.toString())) || 'unknown';
      if (errMsg.includes('402') || errMsg.includes('credit') || errMsg.includes('payment')) {
        console.log(`  ${lbl} → ❌ FATAL: Out of credits`);
        break;
      }
    }

    if (errMsg || !response || response.status !== 200 || !response.data) {
      console.log(`  ${lbl} → ❌ ${errMsg ? errMsg.slice(0, 50) : 'No match'}`);
      if (errMsg) results.error++; else stats.noMatch++;
      if (i < toProcess.length - 1) await sleep(DELAY_MS);
      continue;
    }

    // ── Successful match ──────────────────────────────────
    const d = response.data;
    stats.credits++;

    const emails  = d.emails        || [];
    const phones  = d.phone_numbers || [];
    const mobile  = d.mobile_no     || null;
    const gotEmail = emails.length > 0;
    const gotPhone = phones.length > 0 || !!mobile;

    if (!gotEmail && !gotPhone) {
      console.log(`  ${lbl} → ⚠️  Matched — no email/phone in PDL record`);
      stats.noContact++;
      if (i < toProcess.length - 1) await sleep(DELAY_MS);
      continue;
    }

    const fields = [];
    if (gotEmail) fields.push('email');
    if (gotPhone) fields.push('phone');
    if (d.linkedin_url) fields.push('LinkedIn✓');
    console.log(`  ${lbl} → ✅ Got: ${fields.join(', ')}`);
    stats.enriched++;

    // Build Firestore update
    const update = {
      _pdlLinkedInEnriched:   true,
      _pdlLinkedInEnrichedAt: new Date().toISOString(),
    };
    if (gotEmail)    update.email       = emails[0];
    if (mobile)      update.phone       = mobile;
    else if (gotPhone) update.phone     = phones[0];
    if (d.linkedin_url) {
      const cleanSlug = d.linkedin_url.replace(/.*\/in\//i, '').replace(/\/+$/, '');
      update.linkedInUrl = `https://www.linkedin.com/in/${cleanSlug}`;
    }
    if (d.location_city  && !lead.city)  update.city  = d.location_city;
    if (d.location_state && !lead.state) update.state = d.location_state;
    if (d.experience && d.experience.length > 0) {
      const cur = d.experience.find(j => !j.end_date) || d.experience[0];
      if (cur.title   && cur.title.name)   update.title   = cur.title.name;
      if (cur.company && cur.company.name) update.company = cur.company.name;
    }
    toWrite.push({ docId: lead.docId, update });

    if (i < toProcess.length - 1) await sleep(DELAY_MS);
  }

  // ── Write to Firestore ────────────────────────────────────
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n── Writing ${toWrite.length} enrichment updates to Firestore...`);
    const BATCH = 499;
    for (let i = 0; i < toWrite.length; i += BATCH) {
      const batch = db.batch();
      toWrite.slice(i, i + BATCH).forEach(({ docId, update }) => {
        batch.update(db.collection('master_leads').doc(docId), update);
      });
      await batch.commit();
      console.log(`  ✅ Batch ${Math.floor(i / BATCH) + 1} committed (${Math.min(BATCH, toWrite.length - i)} docs)`);
    }
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PDL LINKEDIN ENRICHMENT SUMMARY                         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Enriched (email/phone written):  ${String(stats.enriched).padEnd(20)}║`);
  console.log(`║  ⚠️  Matched, no contact data:       ${String(stats.noContact).padEnd(20)}║`);
  console.log(`║  ❌ No match / error:                ${String(stats.noMatch + stats.error).padEnd(20)}║`);
  console.log(`║  💳 PDL credits used:                ${String(stats.credits).padEnd(20)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!DRY_RUN && stats.enriched > 0) {
    console.log('\n  node scripts/enrichment_status_report.js');
  }
  process.exit(0);
}

main().catch(e => { console.error('[PDL-LinkedIn] FATAL:', e.message); process.exit(1); });
