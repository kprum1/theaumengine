'use strict';
// ============================================================
// AUM ENGINE — scripts/lib/validate_schema.js
// Validates a lead against required fields + hard rejection rules
// Used by: scrub_leads.js
// ============================================================

// Default required fields if no niche config overrides
const DEFAULT_REQUIRED = ['nicheId', 'source', 'sourceUrl', 'city', 'state'];

// Fields that are NEVER allowed to be placeholder values
const BANNED_EMAIL_PATTERNS = [/@example\.com$/i, /^test@/i, /^placeholder@/i, /^fake@/i];
const BANNED_PHONE_PATTERNS = [/^555[-.\s]/, /^0{7,}/, /^123456789/];
const BANNED_SOURCES        = ['Alfred Master AUM Miner', 'generate_leads', 'synthetic'];

/**
 * Validate a lead record against required fields and hard rejection rules.
 * @param {object} lead - Already normalized lead
 * @param {object} [config] - Niche config with requiredFields override
 * @returns {{ ok: boolean, missing: string[], violations: string[] }}
 */
function validateLead(lead, config = {}) {
  const requiredFields = config.requiredFields || DEFAULT_REQUIRED;
  const missing        = requiredFields.filter(k => !lead[k] || String(lead[k]).trim() === '');
  const violations     = [];

  // Hard rejection: banned email values
  if (lead.email) {
    const emailStr = String(lead.email);
    if (BANNED_EMAIL_PATTERNS.some(p => p.test(emailStr))) {
      violations.push(`Synthetic email detected: ${emailStr}`);
    }
  }

  // Hard rejection: banned phone values
  if (lead.phone) {
    const phoneStr = String(lead.phone);
    if (BANNED_PHONE_PATTERNS.some(p => p.test(phoneStr))) {
      violations.push(`Synthetic phone detected: ${phoneStr}`);
    }
  }

  // Hard rejection: banned source names (Alfred synthetic batches)
  if (lead.source) {
    if (BANNED_SOURCES.some(s => String(lead.source).toLowerCase().includes(s.toLowerCase()))) {
      violations.push(`Banned source: ${lead.source}`);
    }
  }

  // Hard rejection: entity type not allowed for this niche
  if (
    config.allowedEntityTypes &&
    config.allowedEntityTypes.length > 0 &&
    lead.entityType &&
    !config.allowedEntityTypes.includes(lead.entityType)
  ) {
    violations.push(`Entity type '${lead.entityType}' not allowed for ${lead.nicheId}`);
  }

  // Hard rejection: confidence below niche minimum (applied post-scoring)
  // Note: this is checked separately in scrub_leads.js after score is assigned

  return {
    ok:         missing.length === 0 && violations.length === 0,
    missing,
    violations,
  };
}

module.exports = { validateLead };
