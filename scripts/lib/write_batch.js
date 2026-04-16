'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/write_batch.js
// Centralized output writer — enforces naming conventions
// Used by: scrub_leads.js and all niche miners
//
// File naming:
//   staging/raw/       alfred_batch_{prefix}_{date}.raw.json
//   staging/scrubbed/  alfred_batch_{prefix}_{date}.scrubbed.json
//   staging/rejected/  alfred_batch_{prefix}_{date}.rejected.json
//   staging/enriched/  alfred_batch_{prefix}_{date}.enriched.json
//   staging/approved/  alfred_batch_{prefix}_{date}.approved.json
// ============================================================

const fs   = require('fs');
const path = require('path');

// Root staging dir (relative to scripts/lib/ → resolve to scripts/staging/)
const STAGING_ROOT = path.join(__dirname, '..', 'staging');

// Valid stage → subfolder map
const STAGE_DIRS = {
  raw:      'raw',
  scrubbed: 'scrubbed',
  rejected: 'rejected',
  enriched: 'enriched',
  approved: 'approved',
};

/**
 * Today's date in YYYY-MM-DD format.
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Write a JSON batch to the appropriate staging subfolder.
 * Creates the subfolder if it doesn't exist.
 *
 * @param {string} prefix - Output prefix (e.g. "alfred_batch_faa", "alfred_batch_npi_physicians")
 * @param {any[]} leads   - Array of lead objects to write
 * @param {'raw'|'scrubbed'|'rejected'|'enriched'|'approved'} stage
 * @param {string} [date] - Override date; defaults to today
 * @returns {string} Absolute path of the written file
 */
function writeBatch(prefix, leads, stage = 'raw', date) {
  if (!STAGE_DIRS[stage]) {
    throw new Error(`Invalid stage: "${stage}". Must be one of: ${Object.keys(STAGE_DIRS).join(', ')}`);
  }

  const dir = path.join(STAGING_ROOT, STAGE_DIRS[stage]);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const dateStr   = date || today();
  const filename  = `${prefix}_${dateStr}.${stage}.json`;
  const filePath  = path.join(dir, filename);

  fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), 'utf8');
  return filePath;
}

/**
 * Derive the scrubbed/rejected output paths from a raw input path.
 * E.g.: staging/raw/alfred_batch_faa_2026-04-16.raw.json
 *     → { scrubbed: staging/scrubbed/alfred_batch_faa_2026-04-16.scrubbed.json,
 *          rejected: staging/rejected/alfred_batch_faa_2026-04-16.rejected.json }
 * @param {string} rawFilePath
 * @returns {{ scrubbed: string, rejected: string }}
 */
function deriveScrubPaths(rawFilePath) {
  const base     = path.basename(rawFilePath, '.raw.json');
  const scrubDir = path.join(STAGING_ROOT, 'scrubbed');
  const rejectDir = path.join(STAGING_ROOT, 'rejected');
  if (!fs.existsSync(scrubDir))  fs.mkdirSync(scrubDir,  { recursive: true });
  if (!fs.existsSync(rejectDir)) fs.mkdirSync(rejectDir, { recursive: true });
  return {
    scrubbed: path.join(scrubDir,  `${base}.scrubbed.json`),
    rejected: path.join(rejectDir, `${base}.rejected.json`),
  };
}

module.exports = { writeBatch, deriveScrubPaths, today, STAGING_ROOT };
