'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/normalize_name.js
// Shared name normalization utilities
// Used by: scrub_leads.js and all niche miners
// ============================================================

/**
 * Collapse multiple spaces and trim.
 * Handles ALL CAPS input from FAA registry.
 */
function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Title-case a string — handles ALL CAPS FAA names, hyphenated names.
 * Examples:
 *   "DALE HATCHER"        → "Dale Hatcher"
 *   "O'BRIEN"             → "O'Brien"
 *   "SMITH-JONES"         → "Smith-Jones"
 *   "  MARY   ANN  LEE  " → "Mary Ann Lee"
 */
function titleCase(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/-(\w)/g, (_, c) => '-' + c.toUpperCase())     // hyphenated
    .replace(/O'(\w)/g, (_, c) => "O'" + c.toUpperCase());  // O'Brien etc.
}

/**
 * Split a full name string into { firstName, lastName }.
 * Handles "Last, First" format from FAA master file.
 */
function splitFullName(fullName) {
  const clean = normalizeWhitespace(fullName);

  // FAA format: "HATCHER DALE W" or "HATCHER, DALE W" → last first
  // We detect comma-first format
  if (clean.includes(',')) {
    const [last, ...rest] = clean.split(',');
    return {
      firstName: titleCase(rest.join(' ').trim().split(' ')[0] || ''),
      lastName:  titleCase(last.trim()),
    };
  }

  const parts = titleCase(clean).split(' ');
  return {
    firstName: parts[0] || '',
    lastName:  parts.slice(1).join(' ') || '',
  };
}

module.exports = { normalizeWhitespace, titleCase, splitFullName };
