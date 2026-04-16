'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/build_lead_id.js
// Builds deterministic leadId + duplicateKey per lead
// Used by: scrub_leads.js
// ============================================================

/**
 * Slug-ify a string: lowercase, alphanumeric + underscore only.
 */
function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Build a deterministic, human-readable leadId.
 * Format: {nicheId}_{firstName}_{lastName}_{state}_{externalId}
 * Example: aircraft-owners_dale_hatcher_mn_n812dh
 *
 * Used as Firestore-safe doc ID prefix and for display.
 * @param {object} lead
 * @returns {string}
 */
function buildLeadId(lead) {
  const parts = [
    lead.nicheId   || 'unknown',
    lead.firstName || '',
    lead.lastName  || lead.company || 'entity',
    lead.state     || '',
    lead.externalId || '',
  ].map(slug).filter(Boolean);

  return parts.join('_');
}

/**
 * Build a deduplication key for cross-batch dedup.
 * Same person from different sources → same key.
 * Broader than leadId — intentionally ignores externalId
 * so FAA + LinkedIn versions of the same person collapse.
 * @param {object} lead
 * @returns {string}
 */
function buildDuplicateKey(lead) {
  const parts = [
    lead.nicheId   || '',
    lead.firstName || '',
    lead.lastName  || '',
    lead.state     || '',
    // Include company only if no individual name present
    (!lead.firstName && !lead.lastName) ? (lead.company || '') : '',
  ].map(slug).filter(Boolean);

  return parts.join('_');
}

module.exports = { buildLeadId, buildDuplicateKey };
