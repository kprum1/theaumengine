#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Agent Registry Backfill
// scripts/agent_registry_backfill.js
// Sprint C39 — Contact Enrichment Layer (Tier 1 — FREE)
//
// Purpose: For leads whose contact data is blank, re-reads the original
//   source registry batch files (NPI, FAA, etc.) and patches phone,
//   address, zipCode, and NPI number directly into Firestore master_leads.
//   Uses idempotencyKey to match source records to Firestore docs.
//   Zero API cost — uses data already on disk.
//
// Covered sources:
//   NPI Registry (physicians, dentists)   → phone, npi, credential
//   FAA Registry (aircraft-owners)        → zipCode, tailNumber
//
// Usage:
//   node scripts/agent_registry_backfill.js
//   node scripts/agent_registry_backfill.js --dry-run
//   node scripts/agent_registry_backfill.js --niche physicians
//   node scripts/agent_registry_backfill.js --niche dentists
//   node scripts/agent_registry_backfill.js --niche aircraft-owners
//   node scripts/agent_registry_backfill.js --limit 100
// =====================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');
const crypto = require('crypto');

const KEY   = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI ───────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const hasFlag    = (f) => args.includes(f);
const getArg     = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN    = hasFlag('--dry-run');
const NICHE_FILTER = getArg('--niche');
const LIMIT      = parseInt(getArg('--limit') || '9999', 10);

// ── Source file registry ──────────────────────────────────────────────
// Maps nicheId → list of raw batch files that contain registry contact data
const RAW_DIR = path.join(__dirname, 'staging', 'raw');

const SOURCE_MAP = {
  'physicians': [
    'alfred_batch_npi_physicians_2026-04-16.raw.json',
    'alfred_batch_npi_physicians_2026-04-17.raw.json',
    'alfred_batch_npi_physicians_eden_prairie_2026-04-17.raw.json',
    'alfred_batch_npi_physicians_edina_2026-04-17.raw.json',
    'alfred_batch_npi_physicians_minnetonka_2026-04-17.raw.json',
    'alfred_batch_npi_physicians_plymouth_2026-04-17.raw.json',
  ],
  'dentists': [
    'alfred_batch_npi_dentists_2026-04-16.raw.json',
    'alfred_batch_npi_dentists_2026-04-17.raw.json',
  ],
  'aircraft-owners': [
    'alfred_batch_faa_2026-04-17.raw.json',
  ],
};

// ── Matching keys by niche ────────────────────────────────────────────
// NPI (physicians/dentists): use NPI number — stable, unique, registry-assigned
// FAA (aircraft-owners): use firstName+lastName+state (tail# not always on Firestore doc)
// Fallback: SHA-256 idempotency key
function makeMatchKey(lead, niche) {
  if (niche === 'physicians' || niche === 'dentists') {
    const npi = String(lead.npi || lead.npiNumber || '').trim();
    return npi ? `npi:${npi}` : null;
  }
  if (niche === 'aircraft-owners') {
    const first = (lead.firstName || '').toLowerCase().trim();
    const last  = (lead.lastName  || '').toLowerCase().trim();
    const state = (lead.state     || '').toLowerCase().trim();
    return first && last ? `faa:${first}|${last}|${state}` : null;
  }
  // Generic fallback
  const str = [
    (lead.firstName || '').toLowerCase().trim(),
    (lead.lastName  || '').toLowerCase().trim(),
    (lead.email     || '').toLowerCase().trim(),
    (lead.phone     || '').replace(/\D/g, ''),
  ].join('|');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 32);
}

// ── Load source records from disk ─────────────────────────────────────
function loadSourceRecords(niche) {
  const files = SOURCE_MAP[niche] || [];
  const records = {};

  files.forEach(filename => {
    const fpath = path.join(RAW_DIR, filename);
    if (!fs.existsSync(fpath)) {
      console.log(`  ⚠️  Source file not found: ${filename}`);
      return;
    }

    const raw = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const leads = Array.isArray(raw) ? raw : (raw.leads || []);

    leads.forEach(lead => {
      const key = makeMatchKey(lead, niche);
      if (key && !records[key]) {
        records[key] = lead; // first occurrence wins (dedup)
      }
    });
  });

  return records; // { matchKey → lead }
}

// ── Determine what fields to patch from source ─────────────────────────
function extractPatchFields(sourceLead, niche) {
  const patch = {};

  // NPI niches: phone + NPI number + credential
  if (niche === 'physicians' || niche === 'dentists') {
    if (sourceLead.phone && sourceLead.phone.trim()) {
      patch.phone = sourceLead.phone.trim();
    }
    if (sourceLead.npi) {
      patch.npiNumber = String(sourceLead.npi);
    }
    if (sourceLead.credential) {
      patch.credential = sourceLead.credential;
    }
    if (sourceLead.signals?.specialty) {
      patch.specialty = sourceLead.signals.specialty;
    }
  }

  // FAA: zip code and tail number
  if (niche === 'aircraft-owners') {
    if (sourceLead.zipCode) {
      patch.zipCode = String(sourceLead.zipCode);
    }
    if (sourceLead.signals?.tailNumber || sourceLead.tailNumber) {
      patch.tailNumber = sourceLead.signals?.tailNumber || sourceLead.tailNumber;
    }
    if (sourceLead.signals?.aircraftModel || sourceLead.aircraftModel) {
      patch.aircraftModel = sourceLead.signals?.aircraftModel || sourceLead.aircraftModel;
    }
  }

  return patch;
}

// ── Sleep ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Registry Backfill (Tier 1 · FREE)        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const nicheList = NICHE_FILTER
    ? [NICHE_FILTER]
    : Object.keys(SOURCE_MAP);

  console.log(`Mode:         ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✍️  LIVE WRITE to Firestore'}`);
  console.log(`Niches:       ${nicheList.join(', ')}`);
  console.log(`Limit:        ${LIMIT}`);
  console.log('');

  let globalPatched = 0;
  let globalSkipped = 0;
  let globalNoMatch = 0;

  for (const niche of nicheList) {
    console.log(`\n── Niche: ${niche} ─────────────────────────────────────────`);

    // Load source records for this niche
    const sourceRecords = loadSourceRecords(niche);
    const sourceCount = Object.keys(sourceRecords).length;
    console.log(`  Source records loaded from disk: ${sourceCount}`);

    if (sourceCount === 0) {
      console.log(`  ⚠️  No source data found for niche — skipping`);
      continue;
    }

    // Load Firestore leads for this niche
    const snap = await db.collection('master_leads')
      .where('nicheId', '==', niche)
      .get();

    const firestoreLeads = [];
    snap.forEach(doc => firestoreLeads.push({ id: doc.id, ...doc.data() }));
    console.log(`  Firestore leads for niche:       ${firestoreLeads.length}`);

    // Find leads that are missing contact data
    const needsPatch = firestoreLeads.filter(l => {
      const missingPhone   = !l.phone || l.phone.trim() === '';
      const missingAddress = !l.address || l.address.trim() === '';
      const missingZip     = !l.zipCode || l.zipCode.trim() === '';
      const missingNpi     = !l.npiNumber;
      return missingPhone || missingAddress || missingZip || missingNpi;
    }).slice(0, LIMIT);

    console.log(`  Leads needing patch:             ${needsPatch.length}`);

    let patched = 0, skipped = 0, noMatch = 0;
    const batchWrites = [];

    for (const fsLead of needsPatch) {
      const matchKey = makeMatchKey(fsLead, niche);
      const sourceMatch = matchKey ? sourceRecords[matchKey] : null;

      if (!sourceMatch) {
        noMatch++;
        continue;
      }

      const patch = extractPatchFields(sourceMatch, niche);

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }

      // Add enrichment metadata
      patch.registryBackfilledAt = new Date().toISOString();
      patch.registryBackfillSource = niche === 'physicians' || niche === 'dentists'
        ? 'CMS NPI Registry'
        : 'FAA Aircraft Registry';

      const name = `${fsLead.firstName || ''} ${fsLead.lastName || ''}`.trim() || fsLead.company || fsLead.id;
      const patchSummary = Object.keys(patch).filter(k => !k.includes('At') && !k.includes('Source')).join(', ');
      console.log(`    ✏️  ${name.slice(0,40).padEnd(40)} → patching: ${patchSummary}`);

      if (!DRY_RUN) {
        batchWrites.push({ id: fsLead.id, patch });
      }
      patched++;
    }

    // Apply Firestore writes in batches of 400
    if (!DRY_RUN && batchWrites.length > 0) {
      console.log(`\n  Writing ${batchWrites.length} updates to Firestore...`);
      const BATCH_SIZE = 400;
      for (let i = 0; i < batchWrites.length; i += BATCH_SIZE) {
        const chunk = batchWrites.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach(({ id, patch }) => {
          batch.update(db.collection('master_leads').doc(id), patch);
        });
        await batch.commit();
        console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE) + 1} committed (${chunk.length} docs)`);
        if (i + BATCH_SIZE < batchWrites.length) await sleep(500);
      }
    }

    console.log(`\n  Niche "${niche}" results:`);
    console.log(`    ✅ Patched:       ${patched}`);
    console.log(`    ⏭  Skipped:      ${skipped} (no new fields to add)`);
    console.log(`    ❓ No source match: ${noMatch} (lead not found in source files)`);

    globalPatched  += patched;
    globalSkipped  += skipped;
    globalNoMatch  += noMatch;
  }

  // ── Final summary ─────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   REGISTRY BACKFILL SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Total leads patched:    ${globalPatched}`);
  console.log(`  ⏭  Total skipped:         ${globalSkipped}`);
  console.log(`  ❓ No source match:        ${globalNoMatch}`);

  if (DRY_RUN) {
    console.log('\n  ℹ️  DRY RUN — no Firestore writes made.');
    console.log('  Remove --dry-run flag to apply patches.');
  } else {
    console.log('\n  Next steps:');
    console.log('  1. Verify a sample lead in Firestore console');
    console.log('  2. Run enrichment_status_report.js to see updated coverage:');
    console.log('     node scripts/enrichment_status_report.js');
    console.log('  3. Run Apollo v2 for remaining blank leads:');
    console.log('     node scripts/agent_apollo_enrich_v2.js --niche c-suite-executives --limit 50');
  }

  console.log('\n');
  process.exit(0);
}

run().catch(e => { console.error('[RegistryBackfill] FATAL:', e.message); process.exit(1); });
