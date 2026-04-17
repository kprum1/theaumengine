#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Manual Name Resolution Importer
// scripts/resolve_names_manual.js
//
// Because Apollo's /v1/people/search requires a PAID plan ($49+/mo),
// this script provides a structured manual workflow using:
//   1. The Apollo Browser Extension (free) — installed at chrome web store
//   2. LinkedIn search URLs (pre-built by Alfred in the leads)
//   3. Google / BBB / company website lookup
//
// Usage:
//   node scripts/resolve_names_manual.js --batch tradesman
//   node scripts/resolve_names_manual.js --batch henrys
//   node scripts/resolve_names_manual.js --apply --file <resolved.json>
//
// Output:
//   Prints a lookup checklist with LinkedIn URLs for each unresolved lead.
//   Once you fill in names, run with --apply to merge into enriched file.
// =====================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const BATCH  = getArg('--batch') || 'tradesman';
const APPLY  = hasFlag('--apply');
const FILE   = getArg('--file');

// ── Batch file map ───────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];
const BATCH_FILES = {
  tradesman: `scripts/staging/scrubbed/alfred_batch_tradesman_${TODAY}.scrubbed.json`,
  henrys:    `scripts/staging/scrubbed/alfred_batch_henrys_h1b_${TODAY}.scrubbed.json`,
};

// ── Print lookup checklist ───────────────────────────────────────
function printChecklist(leads, batchName) {
  const unresolved = leads.filter(l => l.needsNameResolution || l.needsEnrichment);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║   AUM ENGINE — Manual Name Resolution: ${batchName.toUpperCase().padEnd(14)}    ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`${unresolved.length} leads need owner name resolution.\n`);
  console.log('LOOKUP METHOD (in order of preference):');
  console.log('  1. Apollo Browser Extension — go to company LinkedIn page, click extension icon');
  console.log('  2. LinkedIn Search URL (below) — find Owner/President by name');
  console.log('  3. Google: "Genz-Ryan Plumbing owner" or "Genz-Ryan Plumbing president"\n');
  console.log('─'.repeat(70));

  const outputRows = [];
  unresolved.forEach((l, i) => {
    const liUrl = l.linkedInSearchUrl
      || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((l.company || '') + ' owner')}&origin=GLOBAL_SEARCH_HEADER`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent('"' + (l.company || '') + '" owner OR president OR founder')}`;

    console.log(`\n[${i + 1}] ${l.company}`);
    console.log(`    📍 ${l.city}, ${l.state}  |  ${l.niche}  |  ID: ${l.leadId}`);
    console.log(`    🔗 LinkedIn: ${liUrl}`);
    console.log(`    🔍 Google:   ${googleUrl}`);

    outputRows.push({
      num:         i + 1,
      leadId:      l.leadId,
      company:     l.company,
      city:        l.city,
      state:       l.state,
      linkedInUrl: liUrl,
      googleUrl,
      // Fill these in after lookup:
      firstName:   '',
      lastName:    '',
      title:       '',
      email:       '',
      linkedInProfileUrl: '',
    });
  });

  console.log('\n' + '─'.repeat(70));

  // Write lookup sheet
  const outDir   = path.join(__dirname, 'staging', 'manual_resolution');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile  = path.join(outDir, `manual_resolution_${batchName}_${TODAY}.json`);
  fs.writeFileSync(outFile, JSON.stringify(outputRows, null, 2));

  console.log(`\n✅ Lookup sheet written to:\n   ${outFile}`);
  console.log('\n── NEXT STEPS ─────────────────────────────────────────────────');
  console.log('  1. Open each LinkedIn URL above');
  console.log('  2. Use Apollo Browser Extension to reveal contact info (FREE)');
  console.log('     → Click the Apollo icon on any LinkedIn profile page');
  console.log('     → It will show name, email, phone if available');
  console.log('  3. Fill in firstName, lastName, title, email in the lookup sheet');
  console.log(`  4. Run: node scripts/resolve_names_manual.js --apply --file ${outFile}`);
  console.log('\n  NOTE: Apollo extension lookups do NOT count against API credits.\n');
}

// ── Apply resolved names back to the scrubbed batch ─────────────
function applyResolved(resolvedFile, batchFile) {
  const resolved = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
  const rawBatch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  const leads    = Array.isArray(rawBatch) ? rawBatch : (rawBatch.leads || []);

  const resolvedMap = {};
  resolved.forEach(r => { if (r.leadId) resolvedMap[r.leadId] = r; });

  let updated = 0;
  const enrichedLeads = leads.map(lead => {
    const r = resolvedMap[lead.leadId];
    if (!r || (!r.firstName && !r.lastName)) return lead;

    updated++;
    return {
      ...lead,
      firstName:           r.firstName  || lead.firstName,
      lastName:            r.lastName   || lead.lastName,
      title:               r.title      || lead.title,
      email:               r.email      || lead.email,
      linkedInUrl:         r.linkedInProfileUrl || lead.linkedInUrl,
      needsNameResolution: false,
      needsEnrichment:     false,
      enrichmentSource:    'manual_linkedin',
      enrichmentAttempted: true,
      enrichedAt:          new Date().toISOString(),
      status:              'enriched',
    };
  });

  const enrichedDir = path.join(__dirname, 'staging', 'enriched');
  if (!fs.existsSync(enrichedDir)) fs.mkdirSync(enrichedDir, { recursive: true });

  const batchId  = path.basename(batchFile, '.scrubbed.json').replace('.json', '');
  const outFile  = path.join(enrichedDir, `${batchId}.enriched.json`);
  const output   = {
    batchId,
    enrichedAt:      new Date().toISOString(),
    enrichmentAgent: 'manual_linkedin + apollo_extension',
    totalLeads:      enrichedLeads.length,
    enrichedCount:   updated,
    leads:           enrichedLeads,
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  console.log(`\n✅ Applied ${updated} resolved names → ${outFile}`);
  console.log(`\nNext: node scripts/lead_ingest_agent.js --file ${outFile}\n`);
}

// ── Main ─────────────────────────────────────────────────────────
if (APPLY) {
  if (!FILE) {
    console.error('Usage: node scripts/resolve_names_manual.js --apply --file <resolved.json> [--batch <batch>]');
    process.exit(1);
  }
  const batchFile = BATCH_FILES[BATCH] || BATCH_FILES.tradesman;
  applyResolved(FILE, batchFile);
} else {
  const batchFile = BATCH_FILES[BATCH];
  if (!batchFile || !fs.existsSync(batchFile)) {
    // Try to find any scrubbed file for the batch
    const stagingDir = path.join(__dirname, 'staging', 'scrubbed');
    const files = fs.existsSync(stagingDir)
      ? fs.readdirSync(stagingDir).filter(f => f.includes(BATCH) && f.endsWith('.scrubbed.json'))
      : [];
    if (!files.length) {
      console.error(`❌ No scrubbed file found for batch: ${BATCH}`);
      console.error(`   Run the miner + scrubber first.`);
      process.exit(1);
    }
    const found = path.join(stagingDir, files[files.length - 1]);
    const rawBatch = JSON.parse(fs.readFileSync(found, 'utf8'));
    const leads    = Array.isArray(rawBatch) ? rawBatch : (rawBatch.leads || []);
    printChecklist(leads, BATCH);
  } else {
    const rawBatch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    const leads    = Array.isArray(rawBatch) ? rawBatch : (rawBatch.leads || []);
    printChecklist(leads, BATCH);
  }
}
