#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — scripts/scrub_leads.js
// Shared scrubber — normalizes, scores, dedupes, and splits
// a .raw.json batch into .scrubbed.json + .rejected.json
//
// Usage:
//   node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_npi_physicians_2026-04-16.raw.json
//   node scripts/scrub_leads.js --file <path>.raw.json --review-only
//   node scripts/scrub_leads.js --file <path>.raw.json --niche physicians
//
// Output:
//   scripts/staging/scrubbed/<basename>.scrubbed.json
//   scripts/staging/rejected/<basename>.rejected.json
//
// --review-only: Prints only confidenceScore >= minConfidenceScore leads to console.
//                No files written. Use for quick human review before committing.
// --niche <id>:  Override niche config lookup (default: reads from lead.nicheId)
// ============================================================

const fs   = require('fs');
const path = require('path');

const { titleCase }                   = require('./lib/normalize_name');
const { classifyEntity, entityShouldReject } = require('./lib/classify_entity');
const { scoreLead, confidenceBand }   = require('./lib/score_lead');
const { buildLeadId, buildDuplicateKey } = require('./lib/build_lead_id');
const { validateLead }                = require('./lib/validate_schema');
const { deriveScrubPaths }            = require('./lib/write_batch');

// ── CLI args ─────────────────────────────────────────────────
const args        = process.argv.slice(2);
const getArg      = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag     = (flag) => args.includes(flag);

const INPUT_FILE  = getArg('--file');
const NICHE_OVERRIDE = getArg('--niche');
const REVIEW_ONLY = hasFlag('--review-only');

if (!INPUT_FILE) {
  console.error('\n[Scrubber] ❌ Usage: node scripts/scrub_leads.js --file path/to/batch.raw.json\n');
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`\n[Scrubber] ❌ File not found: ${INPUT_FILE}\n`);
  process.exit(1);
}

// ── Config loader ─────────────────────────────────────────────
const CONFIG_DIR = path.join(__dirname, 'config');

function loadNicheConfig(nicheId) {
  if (!nicheId) return {};
  const configPath = path.join(CONFIG_DIR, `${nicheId}.json`);
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.warn(`[Scrubber] ⚠️  Could not load config for "${nicheId}": ${e.message}`);
    return {};
  }
}

// ── Core normalization ────────────────────────────────────────
function normalizeLead(raw, config) {
  // Name normalization
  const firstName  = titleCase(raw.firstName || '');
  const lastName   = titleCase(raw.lastName  || '');
  const fullName   = titleCase(
    raw.fullName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim()
  );
  const company    = titleCase(raw.company   || '');
  const city       = titleCase(raw.city      || '');
  const state      = String(raw.state || '').toUpperCase().slice(0, 2);

  // Entity classification
  const entityType = classifyEntity(company, fullName);

  // Build normalized lead
  const lead = {
    // Identification
    leadId:           '',
    duplicateKey:     '',

    // Name fields
    firstName,
    lastName,
    fullName:         fullName || company,
    title:            raw.title    || '',
    company,
    entityType,

    // Location
    city,
    state,

    // Niche
    niche:            raw.niche    || '',
    nicheId:          NICHE_OVERRIDE || raw.nicheId || '',

    // AUM signals
    estimatedAUM:     raw.estimatedAUM  || '',
    aumBand:          raw.aumBand       || '',
    fitScore:         raw.fitScore      || null,
    timingScore:      raw.timingScore   || null,

    // Source provenance
    source:           raw.source        || '',
    sourceUrl:        raw.sourceUrl     || '',
    externalId:       raw.externalId    || raw.npi || raw.nNumber || raw.cik || '',

    // Signal arrays
    reasonCodes:      Array.isArray(raw.reasonCodes) ? raw.reasonCodes : [],
    signals:          Array.isArray(raw.signals)
                        ? raw.signals
                        : (raw.signals && typeof raw.signals === 'object')
                          ? Object.values(raw.signals).filter(v => v && typeof v === 'string')
                          : [],

    // Contact (enrichment adds real values — blanks here are intentional)
    email:            raw.email || '',
    phone:            raw.phone || '',
    linkedInUrl:      raw.linkedInUrl || '',

    // Enrichment status
    needsEnrichment:  raw.needsEnrichment !== false,
    needsNameResolution: raw.needsNameResolution || false,

    // Pipeline fields — set below
    confidenceScore:  0,
    confidenceBand:   'low',
    status:           'raw',
    validationErrors: [],
    rejectionViolations: [],
    duplicateOf:      null,

    // Audit
    reviewedBy:       raw.reviewedBy  || '',
    reviewedAt:       raw.reviewedAt  || '',
    batchId:          raw.batchId     || '',
    scrubbedAt:       new Date().toISOString(),
  };

  // Assign IDs
  lead.leadId       = buildLeadId(lead);
  lead.duplicateKey = buildDuplicateKey(lead);

  // Score
  lead.confidenceScore = scoreLead(lead);
  lead.confidenceBand  = confidenceBand(lead.confidenceScore);

  // Check hard rejection rules
  const rejectPatterns = config.rejectIfContains || [];
  const entityRejected = entityShouldReject(`${company} ${fullName}`, rejectPatterns);
  if (entityRejected) {
    lead.rejectionViolations.push(`Matched niche rejection pattern: ${rejectPatterns.join(', ')}`);
  }

  // Schema validation
  const { ok, missing, violations } = validateLead(lead, config);
  lead.validationErrors    = missing;
  lead.rejectionViolations = [...lead.rejectionViolations, ...violations];

  // Confidence gate
  const minScore = config.minConfidenceScore || 0.50;
  const scoreTooLow = lead.confidenceScore < minScore;
  if (scoreTooLow && missing.length === 0 && violations.length === 0) {
    lead.rejectionViolations.push(
      `Confidence ${lead.confidenceScore} < minimum ${minScore} for ${lead.nicheId}`
    );
  }

  // Set final status
  const rejected = !ok || entityRejected || (scoreTooLow && lead.confidenceScore < 0.40);
  lead.status = rejected ? 'rejected' : 'scrubbed';

  return lead;
}

// ── Deduplication ─────────────────────────────────────────────
function dedupeLeads(leads) {
  const seen = new Map(); // duplicateKey → index
  const deduped = [];

  for (const lead of leads) {
    if (seen.has(lead.duplicateKey)) {
      // Mark as duplicate but keep for rejected log
      const dupe = { ...lead, status: 'rejected', duplicateOf: seen.get(lead.duplicateKey) };
      dupe.rejectionViolations = [...(dupe.rejectionViolations || []), 'Duplicate record'];
      deduped.push(dupe);
    } else {
      seen.set(lead.duplicateKey, lead.leadId);
      deduped.push(lead);
    }
  }
  return deduped;
}

// ── Main ──────────────────────────────────────────────────────
function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Lead Scrubber                         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`  Input: ${INPUT_FILE}`);

  const rawLeads = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  if (!Array.isArray(rawLeads)) {
    console.error('[Scrubber] ❌ Input file must be a JSON array of lead objects.');
    process.exit(1);
  }
  console.log(`  Raw leads: ${rawLeads.length}`);

  // Detect niche from first lead (or override)
  const sampleNicheId = NICHE_OVERRIDE || (rawLeads[0] && rawLeads[0].nicheId) || '';
  const config    = loadNicheConfig(sampleNicheId);
  const minScore  = config.minConfidenceScore || 0.50;
  console.log(`  Niche:     ${sampleNicheId || '(auto-detect per lead)'}`);
  console.log(`  Min score: ${minScore}`);
  if (config.nicheName) console.log(`  Config:    ${config.nicheName} loaded ✅`);
  console.log('');

  // Normalize all leads
  const normalized = rawLeads.map(raw => normalizeLead(raw, config));

  // Dedup
  const deduped = dedupeLeads(normalized);

  // Split
  const scrubbed = deduped.filter(l => l.status === 'scrubbed');
  const rejected = deduped.filter(l => l.status === 'rejected');
  const highConf = scrubbed.filter(l => l.confidenceScore >= minScore)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // ── Review-only mode ──────────────────────────────────────
  if (REVIEW_ONLY) {
    console.log(`── Review Queue (score ≥ ${minScore}) ─────────────────────`);
    if (highConf.length === 0) {
      console.log('  No leads above confidence threshold.\n');
    } else {
      highConf.forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.firstName} ${l.lastName}${l.title ? ` — ${l.title}` : ''}`);
        console.log(`     ${l.city}, ${l.state} | ${l.nicheId}`);
        console.log(`     Score: ${l.confidenceScore} (${l.confidenceBand}) | ${l.source}`);
        if (l.sourceUrl) console.log(`     Verify: ${l.sourceUrl}`);
        console.log('');
      });
    }
    console.log(`── Totals ───────────────────────────────────────────────`);
    console.log(`  Scrubbed: ${scrubbed.length}`);
    console.log(`  Rejected: ${rejected.length}`);
    console.log(`  In review queue (≥ ${minScore}): ${highConf.length}\n`);
    return;
  }

  // ── Write output files ────────────────────────────────────
  const { scrubbed: scrubbedPath, rejected: rejectedPath } = deriveScrubPaths(INPUT_FILE);

  fs.writeFileSync(scrubbedPath, JSON.stringify(scrubbed, null, 2), 'utf8');
  fs.writeFileSync(rejectedPath, JSON.stringify(rejected, null, 2), 'utf8');

  // ── Summary ───────────────────────────────────────────────
  console.log('── Results ─────────────────────────────────────────────');
  console.log(`  ✅ Scrubbed : ${scrubbed.length}`);
  console.log(`  ❌ Rejected : ${rejected.length}`);
  console.log(`  🎯 Review Q : ${highConf.length} (score ≥ ${minScore})`);
  console.log('');
  console.log('── Confidence Distribution ─────────────────────────────');
  const high   = scrubbed.filter(l => l.confidenceBand === 'high').length;
  const medium = scrubbed.filter(l => l.confidenceBand === 'medium').length;
  const low    = scrubbed.filter(l => l.confidenceBand === 'low').length;
  console.log(`  High   (≥0.80): ${high}`);
  console.log(`  Medium (≥0.60): ${medium}`);
  console.log(`  Low    (<0.60): ${low}`);

  if (rejected.length > 0) {
    console.log('\n── Top Rejection Reasons ───────────────────────────────');
    const reasons = {};
    rejected.forEach(l => {
      const allReasons = [...(l.validationErrors || []), ...(l.rejectionViolations || []), l.duplicateOf ? 'Duplicate' : null].filter(Boolean);
      allReasons.forEach(r => { reasons[r] = (reasons[r] || 0) + 1; });
    });
    Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([r, c]) => console.log(`  ${c}× — ${r}`));
  }

  if (highConf.length > 0) {
    console.log('\n── Top 3 for Review ────────────────────────────────────');
    highConf.slice(0, 3).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.firstName} ${l.lastName} — ${l.city}, ${l.state} (${l.confidenceScore})`);
      if (l.sourceUrl) console.log(`     ${l.sourceUrl}`);
    });
  }

  console.log('\n── Output Files ─────────────────────────────────────────');
  console.log(`  Scrubbed: ${scrubbedPath}`);
  console.log(`  Rejected: ${rejectedPath}`);

  console.log('\n── Next Steps ───────────────────────────────────────────');
  console.log(`  1. Review:  node scripts/scrub_leads.js --file ${INPUT_FILE} --review-only`);
  console.log(`  2. Enrich:  node scripts/agent_apollo_enrich.js --file ${scrubbedPath}`);
  console.log(`  3. Ingest:  node scripts/lead_ingest_agent.js --file ${scrubbedPath}`);
  console.log('');
}

main();
