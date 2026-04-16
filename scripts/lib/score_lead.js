'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/score_lead.js
// Confidence scoring — produces 0.0–0.99 score + band
// Used by: scrub_leads.js
// ============================================================

/**
 * Score a lead's data quality and verifiability.
 * Base: 0.30 — a lead with nothing useful.
 * Each signal adds weight up to a cap of 0.99.
 *
 * Scoring signals:
 *   +0.10  sourceUrl present
 *   +0.10  externalId present (NPI, N-number, CIK, etc.)
 *   +0.08  city + state both present
 *   +0.08  reasonCodes array has ≥1 entry
 *   +0.07  estimatedAUM present
 *   +0.07  entityType is individual or business (not unknown)
 *   +0.05  source field present
 *   +0.05  firstName + lastName both present
 *   +0.05  needsEnrichment is explicitly set (signals Alfred ran the miner intentionally)
 *   +0.05  signals array has ≥1 entry
 *
 * Max achievable score from miner: ~0.90 (enrichment adds the rest)
 *
 * @param {object} lead
 * @returns {number} 0.0–0.99
 */
function scoreLead(lead) {
  let score = 0.30;

  if (lead.sourceUrl)                                         score += 0.10;
  if (lead.externalId)                                        score += 0.10;
  if (lead.city && lead.state)                                score += 0.08;
  if (Array.isArray(lead.reasonCodes) && lead.reasonCodes.length > 0) score += 0.08;
  if (lead.estimatedAUM)                                      score += 0.07;
  if (lead.entityType === 'individual' || lead.entityType === 'business') score += 0.07;
  if (lead.source)                                            score += 0.05;
  if (lead.firstName && lead.lastName)                        score += 0.05;
  if (lead.needsEnrichment !== undefined)                     score += 0.05;
  if (Array.isArray(lead.signals) && lead.signals.length > 0) score += 0.05;

  return Math.min(parseFloat(score.toFixed(2)), 0.99);
}

/**
 * Convert a numeric confidence score into a human-readable band.
 * @param {number} score
 * @returns {'high'|'medium'|'low'}
 */
function confidenceBand(score) {
  if (score >= 0.80) return 'high';
  if (score >= 0.60) return 'medium';
  return 'low';
}

module.exports = { scoreLead, confidenceBand };
