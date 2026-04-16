'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/classify_entity.js
// Classifies entity type from name string
// Returns: individual | business | trust | government | unknown
// Used by: scrub_leads.js and all niche miners
// ============================================================

const BUSINESS_PATTERNS   = /\b(llc|l\.l\.c\.?|inc\.?|corp\.?|corporation|co\.|ltd\.?|lp|llp|pllc|pc|pty|group|holdings|ventures|partners|associates|enterprise|enterprises)\b/i;
const TRUST_PATTERNS      = /\b(trust|trustee|revocable|irrevocable|family trust|living trust|fbo)\b/i;
const GOVERNMENT_PATTERNS = /\b(government|city of|county of|state of|dept of|department of|municipal|federal|u\.s\.|united states)\b/i;
const FLIGHT_SCHOOL       = /\b(flight school|flight academy|aviation academy|charter|air service|airways|airlines?|air express|air cargo)\b/i;

/**
 * Classify the entity type from a name string.
 * Checks company name first; falls back to full name.
 * @param {string} companyName
 * @param {string} [fullName]
 * @returns {'individual'|'business'|'trust'|'government'|'unknown'}
 */
function classifyEntity(companyName, fullName) {
  const corp = String(companyName || '');
  const name = String(fullName || '');
  const combined = `${corp} ${name}`;

  if (GOVERNMENT_PATTERNS.test(combined)) return 'government';
  if (FLIGHT_SCHOOL.test(combined))       return 'business';  // still business, but flagged by config
  if (TRUST_PATTERNS.test(combined))      return 'trust';
  if (BUSINESS_PATTERNS.test(combined))   return 'business';

  // If the "company" field has any text but no business suffix, still call it business
  // (e.g. "HATCHER AVIATION" without LLC)
  if (corp.trim().length > 0 && name.trim().length > 0 && corp.trim() !== name.trim()) {
    return 'business';
  }

  if (corp.trim().length > 0) return 'business';
  return 'individual';
}

/**
 * Check if the entity should be auto-rejected based on niche config.
 * @param {string} name  - combined company + full name
 * @param {string[]} rejectPatterns - from niche config rejectIfContains[]
 * @returns {boolean}
 */
function entityShouldReject(name, rejectPatterns = []) {
  const lower = String(name || '').toLowerCase();
  return rejectPatterns.some(pattern => lower.includes(pattern.toLowerCase()));
}

module.exports = { classifyEntity, entityShouldReject };
