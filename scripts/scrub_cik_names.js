#!/usr/bin/env node
// ============================================================
// AUM ENGINE — scripts/scrub_cik_names.js
// C41 Track 3: SEC CIK identifier scrub
//
// Scans master_leads where firstName, lastName, fullName, or
// company fields contain raw SEC CIK identifiers (7-10 digit
// numeric strings, e.g. "0001234567").
//
// These leak in when EDGAR's entity_name field returns a raw
// CIK instead of a resolved company/person name.
//
// Usage:
//   node scripts/scrub_cik_names.js              # dry-run (default)
//   node scripts/scrub_cik_names.js --dry-run    # explicit dry-run
//   node scripts/scrub_cik_names.js --execute    # write flags to Firestore
//   node scripts/scrub_cik_names.js --show-all   # show all detected docs
//
// Action on --execute:
//   Sets firstName:'', lastName:'', needsNameResolution:true, _cikScrubbed:true
//   Does NOT delete the lead — flags it for human review/enrichment
// ============================================================

'use strict';

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const args    = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const DRY_RUN = !EXECUTE;
const SHOW_ALL = args.includes('--show-all');

// CIK pattern: 7–10 digit numeric string (with or without leading zeros)
const CIK_PATTERN = /^\d{7,10}$/;

function hasCIK(value) {
  if (!value) return false;
  const v = String(value).trim();
  return CIK_PATTERN.test(v);
}

function detectCIKFields(data) {
  const flaggedFields = [];
  if (hasCIK(data.firstName))   flaggedFields.push({ field: 'firstName',  value: data.firstName });
  if (hasCIK(data.lastName))    flaggedFields.push({ field: 'lastName',   value: data.lastName });
  if (hasCIK(data.fullName))    flaggedFields.push({ field: 'fullName',   value: data.fullName });
  if (hasCIK(data.company))     flaggedFields.push({ field: 'company',    value: data.company });
  return flaggedFields;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — CIK Name Scrubber (C41 Track 3)       ║');
  console.log(`║  Mode: ${DRY_RUN ? '🔍 DRY RUN — no writes' : '⚡ EXECUTE — flagging CIK docs'}      ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Load all master_leads ─────────────────────────────────────────
  console.log('Loading master_leads...');
  const mlSnap = await db.collection('master_leads').get();
  console.log(`Total master_leads: ${mlSnap.size}\n`);

  const cikDocs    = [];
  const cleanDocs  = [];
  const alreadyFlagged = [];

  for (const doc of mlSnap.docs) {
    const data = doc.data();

    // Skip docs already flagged in a previous run
    if (data._cikScrubbed || data._cikFlagged) {
      alreadyFlagged.push(doc.id);
      continue;
    }

    const flaggedFields = detectCIKFields(data);
    if (flaggedFields.length > 0) {
      cikDocs.push({ id: doc.id, data, flaggedFields });
    } else {
      cleanDocs.push(doc.id);
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log('── Scan Results ─────────────────────────────────────────────');
  console.log(`  ✅ Clean docs:             ${cleanDocs.length}`);
  console.log(`  ⚠️  CIK-contaminated docs:  ${cikDocs.length}`);
  console.log(`  ℹ️  Already flagged:        ${alreadyFlagged.length}`);

  if (cikDocs.length > 0) {
    const showCount = SHOW_ALL ? cikDocs.length : Math.min(cikDocs.length, 20);
    console.log(`\n── CIK Docs Detected (showing ${showCount} of ${cikDocs.length}) ─────────────────`);
    cikDocs.slice(0, showCount).forEach((item, i) => {
      const d = item.data;
      console.log(`  ${i + 1}. doc:${item.id.slice(0, 10)}…`);
      item.flaggedFields.forEach(f => {
        console.log(`     field "${f.field}": "${f.value}" ← CIK value`);
      });
      // Show other context fields to understand what this lead is
      const context = [
        d.niche     ? `niche:${d.niche}` : null,
        d.source    ? `source:${d.source}` : null,
        d.ingestedAt ? `ingested:${(d.ingestedAt||'').slice(0,10)}` : null,
      ].filter(Boolean).join(' | ');
      if (context) console.log(`     context: ${context}`);
    });
    if (cikDocs.length > showCount) {
      console.log(`  ... and ${cikDocs.length - showCount} more. Use --show-all to see all.`);
    }
  } else {
    console.log('\n  ✅ No CIK-contaminated names found — master_leads is clean.');
  }

  // ── Niche breakdown of contaminated docs ─────────────────────────
  if (cikDocs.length > 0) {
    const byNiche = {};
    cikDocs.forEach(item => {
      const n = item.data.niche || item.data.nicheId || 'unknown';
      byNiche[n] = (byNiche[n] || 0) + 1;
    });
    console.log('\n── CIK Docs by Niche ────────────────────────────────────────');
    Object.entries(byNiche).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => {
      console.log(`  ${c}× ${n}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n── DRY RUN SUMMARY ──────────────────────────────────────────');
    console.log(`  Would flag: ${cikDocs.length} docs with needsNameResolution:true`);
    console.log('  Run with --execute to apply flags.\n');
    process.exit(0);
  }

  if (cikDocs.length === 0) {
    console.log('\n  ✅ Nothing to flag. All done.\n');
    process.exit(0);
  }

  // ── Execute: flag affected docs ───────────────────────────────────
  console.log(`\n── Flagging ${cikDocs.length} docs... ────────────────────────────────`);
  const now = new Date().toISOString();
  let flagged = 0;
  let errored = 0;

  const BATCH_SIZE = 450;
  const chunks = [];
  for (let i = 0; i < cikDocs.length; i += BATCH_SIZE) {
    chunks.push(cikDocs.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(item => {
      const update = {
        needsNameResolution: true,
        _cikScrubbed:        true,
        _cikScrubFields:     item.flaggedFields.map(f => f.field),
        _cikScrubAt:         now,
      };
      // Clear contaminated name fields — prevent garbage names in cockpit
      item.flaggedFields.forEach(f => {
        // Only clear firstName/lastName — keep fullName/company for context
        if (f.field === 'firstName') update.firstName = '';
        if (f.field === 'lastName')  update.lastName  = '';
      });
      batch.update(db.collection('master_leads').doc(item.id), update);
    });

    try {
      await batch.commit();
      flagged += chunk.length;
      console.log(`  ✅ Flagged batch of ${chunk.length}`);
    } catch (e) {
      errored += chunk.length;
      console.error(`  ❌ Batch update failed: ${e.message}`);
    }
  }

  console.log('\n── Execution Complete ────────────────────────────────────────');
  console.log(`  Flagged: ${flagged} docs with needsNameResolution + _cikScrubbed`);
  console.log(`  Errors:  ${errored}`);
  console.log('\n  Next steps:');
  console.log('  1. Use Apollo/PDL enrichment on docs where _cikScrubbed:true');
  console.log('  2. Or run resolve_sec_names.js to manually resolve these leads');
  console.log('  3. Run scrub_cik_names.js --dry-run to verify clean state\n');
  process.exit(0);
}

main().catch(e => {
  console.error('[scrub_cik_names] FATAL:', e.message, e.stack);
  process.exit(1);
});
