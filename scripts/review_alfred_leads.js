// ============================================================
// AUM ENGINE — Alfred Lead Review & Containment Script
// ============================================================
// STEP 1 OF 2 — Run this first. Nothing goes to Firestore.
//
// What this does:
//   1. Reads JSON files Alfred dropped in the incoming/ folder
//   2. Validates and sanitizes every field (whitelist only)
//   3. Strips any dangerous content (scripts, URLs in name fields, etc.)
//   4. Scores each lead for quality (missing fields, suspicious data)
//   5. Outputs a human-readable review report + a clean staging JSON
//
// Usage:
//   node scripts/review_alfred_leads.js
//
// After running:
//   - Check scripts/staging/review_report_[date].md
//   - If everything looks good: node scripts/approve_and_ingest.js
//   - If anything is suspicious: DO NOT approve — review manually
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────
const INCOMING_DIR = path.join(__dirname, 'incoming');           // Alfred drops files here
const STAGING_DIR  = path.join(__dirname, 'staging');            // Reviewed/clean files go here
const TIMESTAMP    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Allowed fields whitelist (only these survive) ─────────────
const ALLOWED_FIELDS = new Set([
  'firstName', 'lastName', 'title', 'company',
  'city', 'state', 'linkedIn',
  'niche', 'nicheId',
  'fitScore', 'timingScore',
  'estimatedAUM',
  'reasonCodes', 'signals',
  'email', 'phone',
  'source', 'sourceFile', 'assignedRep',
  'status'
]);

// ── Known valid niches ────────────────────────────────────────
const VALID_NICHES = new Set([
  'aircraft-owners', 'business-owners', 'charity-boards',
  'charity-board-members', 'physicians', 'ai-displaced-executives',
  'henrys', 'inheritance-recipients', 'high-earning-tradesman',
  'real-estate-developers', 'law-partners', 'dentists-specialists',
  'c-suite-executives'
]);

// ── Niche label → nicheId normalizer ─────────────────────────
const NICHE_MAP = {
  'aircraft owners':         'aircraft-owners',
  'aircraft owner':          'aircraft-owners',
  'ai-displaced executives': 'ai-displaced-executives',
  'ai displaced executives': 'ai-displaced-executives',
  'ai-displaced execs':      'ai-displaced-executives',
  'business owners':         'business-owners',
  'business owner':          'business-owners',
  'charity boards':          'charity-boards',
  'charity board members':   'charity-board-members',
  'physicians':              'physicians',
  'physicians & surgeons':   'physicians',
  'henrys':                  'henrys',
  'inheritance recipients':  'inheritance-recipients',
  'high earning tradesman':  'high-earning-tradesman',
  'law partners':            'law-partners',
  'c-suite executives':      'c-suite-executives',
};

function toNicheId(raw) {
  return NICHE_MAP[(raw || '').toLowerCase().trim()] || null;
}

// ── Security: detect suspicious strings ───────────────────────
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,          // onclick=, onload=, etc.
  /\beval\s*\(/i,
  /\bdocument\./i,
  /\bwindow\./i,
  /rm\s+-rf/i,
  /\bexec\s*\(/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /https?:\/\//i,        // URLs in name fields
];

function hasSuspiciousContent(value) {
  if (typeof value !== 'string') return false;
  return SUSPICIOUS_PATTERNS.some(p => p.test(value));
}

function deepCheckSuspicious(obj, path = '') {
  const flags = [];
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && hasSuspiciousContent(v)) {
      flags.push({ field: keyPath, value: v.slice(0, 80) });
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      flags.push(...deepCheckSuspicious(v, keyPath));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'string' && hasSuspiciousContent(item)) {
          flags.push({ field: `${keyPath}[${i}]`, value: item.slice(0, 80) });
        }
      });
    }
  }
  return flags;
}

// ── Sanitize a single string value ────────────────────────────
function sanitizeStr(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>/g, '')          // strip any HTML tags
    .replace(/[^\w\s.,\-'&@$%#()/:]/g, '') // allow safe chars only
    .trim()
    .slice(0, 200);                    // max 200 chars per field
}

// ── Validate + sanitize a single lead ─────────────────────────
function processLead(raw, index) {
  const issues   = [];
  const warnings = [];
  const securityFlags = deepCheckSuspicious(raw);

  // 1 — Security check first
  if (securityFlags.length > 0) {
    return {
      status: 'REJECTED',
      reason: 'SECURITY_FLAG',
      index,
      flags: securityFlags,
      original: raw
    };
  }

  // 2 — Strip to whitelist only
  const clean = {};
  const extraFields = [];
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_FIELDS.has(k)) {
      clean[k] = v;
    } else {
      extraFields.push(k);
    }
  }
  if (extraFields.length > 0) {
    warnings.push(`Stripped unknown fields: ${extraFields.join(', ')}`);
  }

  // 3 — Required field validation
  if (!clean.firstName || clean.firstName.trim() === '') issues.push('Missing firstName');
  if (!clean.lastName  || clean.lastName.trim()  === '') issues.push('Missing lastName');
  if (!clean.niche     || clean.niche.trim()     === '') issues.push('Missing niche');

  // 4 — Normalize niche
  const nicheId = toNicheId(clean.niche);
  if (!nicheId) {
    warnings.push(`Unrecognized niche "${clean.niche}" — will store as-is, review manually`);
    clean.nicheId = clean.niche?.toLowerCase().replace(/\s+/g, '-');
  } else {
    clean.nicheId = nicheId;
  }

  // 5 — Score validation
  if (clean.fitScore !== undefined) {
    clean.fitScore = Math.min(100, Math.max(0, parseInt(clean.fitScore) || 0));
  }
  if (clean.timingScore !== undefined) {
    clean.timingScore = Math.min(100, Math.max(0, parseInt(clean.timingScore) || 0));
  }

  // 6 — Sanitize string fields
  for (const field of ['firstName','lastName','title','company','city','state','niche']) {
    if (clean[field]) clean[field] = sanitizeStr(clean[field]);
  }

  // 7 — Sanitize reasonCodes array
  if (Array.isArray(clean.reasonCodes)) {
    clean.reasonCodes = clean.reasonCodes.map(r => sanitizeStr(String(r))).filter(Boolean).slice(0, 8);
  }

  // 8 — Sanitize signals object
  if (clean.signals && typeof clean.signals === 'object') {
    const safeSigs = {};
    for (const [k, v] of Object.entries(clean.signals)) {
      safeSigs[sanitizeStr(k)] = sanitizeStr(String(v));
    }
    clean.signals = safeSigs;
  }

  // 9 — Add system fields (additive, safe)
  clean.status          = 'pending_review';  // NOT 'New' — must be approved first
  clean.source          = clean.source || 'Alfred Wealth Trigger Miner';
  clean.alfredQueuedAt  = new Date().toISOString();

  // 10 — Compute priorityScore if missing
  if (!clean.priorityScore && clean.fitScore && clean.timingScore) {
    clean.priorityScore = Math.round((clean.fitScore + clean.timingScore) / 2);
  }

  if (issues.length > 0) {
    return { status: 'FLAGGED', issues, warnings, index, lead: clean, original: raw };
  }

  return { status: warnings.length > 0 ? 'APPROVED_WITH_WARNINGS' : 'APPROVED', warnings, index, lead: clean };
}

// ── Read + process all JSON files in incoming/ ────────────────
async function main() {
  if (!fs.existsSync(INCOMING_DIR)) {
    fs.mkdirSync(INCOMING_DIR, { recursive: true });
    console.log(`📁 Created incoming/ folder at:\n   ${INCOMING_DIR}`);
    console.log('\n   Alfred should drop JSON files there. Run this script again after.');
    return;
  }
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });

  const files = fs.readdirSync(INCOMING_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('⚠️  No JSON files found in incoming/. Ask Alfred to drop files there first.');
    return;
  }

  console.log(`\n🔍 Alfred Lead Review — ${files.length} file(s) found\n`);

  const allResults   = [];
  const approvedLeads = [];
  const reportLines  = [
    `# Alfred Lead Review Report`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Files processed:** ${files.length}`,
    `**Run by:** node scripts/review_alfred_leads.js`,
    '',
    '> ⚠️ Review this report before running `approve_and_ingest.js`.',
    '> Leads with status REJECTED or FLAGGED must NOT be approved without manual review.',
    '',
    '---',
    ''
  ];

  for (const file of files) {
    const filePath = path.join(INCOMING_DIR, file);
    reportLines.push(`## 📄 File: \`${file}\``);

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) {
      reportLines.push(`**❌ PARSE ERROR** — Invalid JSON. File rejected entirely.`);
      reportLines.push(`Error: ${e.message}`);
      reportLines.push('');
      console.log(`❌ ${file} — JSON parse error: ${e.message}`);
      continue;
    }

    if (!Array.isArray(raw)) raw = [raw];  // treat single object as array
    reportLines.push(`**Leads in file:** ${raw.length}`);
    reportLines.push('');

    let approved = 0, flagged = 0, rejected = 0;

    for (let i = 0; i < raw.length; i++) {
      const result = processLead(raw[i], i);
      allResults.push({ file, ...result });

      const name = result.lead
        ? `${result.lead.firstName || '?'} ${result.lead.lastName || '?'}`
        : (raw[i].firstName ? `${raw[i].firstName} ${raw[i].lastName || ''}` : `Row ${i+1}`);

      if (result.status === 'REJECTED') {
        rejected++;
        reportLines.push(`### ❌ REJECTED — Row ${i+1}`);
        reportLines.push(`**Reason:** ${result.reason}`);
        if (result.flags?.length) {
          result.flags.forEach(f => reportLines.push(`- Field \`${f.field}\`: \`${f.value}\``));
        }
        reportLines.push('```');
        reportLines.push(JSON.stringify(result.original, null, 2).slice(0, 500));
        reportLines.push('```');
        console.log(`  ❌ REJECTED  — ${name} (security flag)`);

      } else if (result.status === 'FLAGGED') {
        flagged++;
        reportLines.push(`### ⚠️  FLAGGED — ${name} (Row ${i+1})`);
        result.issues.forEach(issue => reportLines.push(`- ❌ ${issue}`));
        result.warnings.forEach(w => reportLines.push(`- ⚠️  ${w}`));
        reportLines.push('');
        console.log(`  ⚠️  FLAGGED   — ${name} | Issues: ${result.issues.join('; ')}`);

      } else {
        approved++;
        approvedLeads.push(result.lead);
        const scoreStr = result.lead.fitScore ? ` | Fit: ${result.lead.fitScore} Timing: ${result.lead.timingScore}` : '';
        reportLines.push(`### ✅ ${result.status === 'APPROVED_WITH_WARNINGS' ? 'APPROVED ⚠️' : 'APPROVED'} — ${name} (Row ${i+1})`);
        reportLines.push(`**Niche:** ${result.lead.niche} → \`${result.lead.nicheId}\`${scoreStr}`);
        if (result.warnings.length) {
          result.warnings.forEach(w => reportLines.push(`- ⚠️  ${w}`));
        }
        console.log(`  ✅ APPROVED  — ${name}${scoreStr}`);
      }
      reportLines.push('');
    }

    reportLines.push(`**File summary:** ✅ ${approved} approved / ⚠️ ${flagged} flagged / ❌ ${rejected} rejected`);
    reportLines.push('');
    reportLines.push('---');
    reportLines.push('');
  }

  // ── Write staging file (approved leads only) ─────────────────
  const stagingFile  = path.join(STAGING_DIR, `staged_${TIMESTAMP}.json`);
  const reportFile   = path.join(STAGING_DIR, `review_report_${TIMESTAMP}.md`);

  const stagingPayload = {
    reviewedAt:    new Date().toISOString(),
    totalApproved: approvedLeads.length,
    totalResults:  allResults.length,
    leads:         approvedLeads
  };

  fs.writeFileSync(stagingFile,  JSON.stringify(stagingPayload, null, 2));
  fs.writeFileSync(reportFile,   reportLines.join('\n'));

  // ── Final summary ────────────────────────────────────────────
  const totalApproved = allResults.filter(r => r.status.startsWith('APPROVED')).length;
  const totalFlagged  = allResults.filter(r => r.status === 'FLAGGED').length;
  const totalRejected = allResults.filter(r => r.status === 'REJECTED').length;

  console.log('\n' + '─'.repeat(50));
  console.log(`🏁 Review complete`);
  console.log(`   ✅ Approved:  ${totalApproved}`);
  console.log(`   ⚠️  Flagged:   ${totalFlagged}  ← DO NOT ingest without manual review`);
  console.log(`   ❌ Rejected:  ${totalRejected}  ← BLOCKED — suspected bad data`);
  console.log(`\n📋 Report saved: ${reportFile}`);
  console.log(`📦 Staging file: ${stagingFile}`);
  console.log('\n─────────────────────────────────────────────────');
  if (totalFlagged > 0 || totalRejected > 0) {
    console.log('⛔  STOP — Review flagged/rejected leads before proceeding.');
    console.log('   Open the report, verify manually, then decide.');
  } else {
    console.log('✅  All leads approved. Safe to run:');
    console.log(`   node scripts/approve_and_ingest.js --batch=${TIMESTAMP}`);
  }
  console.log('─────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('❌ Review script failed:', err);
  process.exit(1);
});
