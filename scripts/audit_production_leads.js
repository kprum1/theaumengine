#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Deep Field Audit: Production-Ready Leads
// scripts/audit_production_leads.js
//
// Audits every field of production-ready leads for usability.
// Checks: phone format, address completeness, email validity,
//         name quality, NPI validity, home value, specialty clarity.
//
// Produces:
//   • Per-field pass/fail counts
//   • Sample of problematic records by issue type
//   • Auto-fix suggestions (e.g. phone re-formatting)
//   • Final "advisor-ready" count (all fields pass)
//
// Usage:
//   node scripts/audit_production_leads.js
//   node scripts/audit_production_leads.js --fix      (auto-fix phone formatting)
//   node scripts/audit_production_leads.js --niche physicians
//   node scripts/audit_production_leads.js --sample 10  (print N full records)
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const args     = process.argv.slice(2);
const FIX      = args.includes('--fix');
const NICHE    = args.find((a, i) => args[i - 1] === '--niche') || null;
const SAMPLE_N = parseInt(args.find((a, i) => args[i - 1] === '--sample') || '0', 10);

// ── Field validators ──────────────────────────────────────────────────────────

function checkPhone(raw) {
  if (!raw || !raw.trim()) return { ok: false, issue: 'missing', clean: '' };
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1);
    return { ok: true, clean: `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`, issue: null };
  }
  if (digits.length === 10) {
    // Reject obviously fake numbers
    if (/^(\d)\1{9}$/.test(digits)) return { ok: false, issue: 'repeated-digits', clean: '' };
    if (digits.startsWith('000') || digits.startsWith('555555')) return { ok: false, issue: 'fake-number', clean: '' };
    return { ok: true, clean: `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`, issue: null };
  }
  if (digits.length < 10) return { ok: false, issue: `too-short (${digits.length} digits)`, clean: '' };
  return { ok: false, issue: `too-long (${digits.length} digits)`, clean: '' };
}

function checkEmail(raw) {
  if (!raw || !raw.trim()) return { ok: false, issue: 'missing' };
  const e = raw.trim().toLowerCase();
  if (!e.includes('@') || !e.includes('.')) return { ok: false, issue: 'invalid-format' };
  const [local, domain] = e.split('@');
  if (!local || local.length < 1) return { ok: false, issue: 'empty-local' };
  if (!domain || !domain.includes('.')) return { ok: false, issue: 'invalid-domain' };
  if (domain.endsWith('.con') || domain.endsWith('.cmo')) return { ok: false, issue: 'typo-domain' };
  return { ok: true, issue: null };
}

function checkName(first, last) {
  if (!first || !first.trim()) return { ok: false, issue: 'missing-first' };
  if (!last  || !last.trim())  return { ok: false, issue: 'missing-last' };
  if (first.length === 1) return { ok: false, issue: 'initial-only-first' };
  if (last.length  === 1) return { ok: false, issue: 'initial-only-last' };
  if (/\d/.test(first) || /\d/.test(last)) return { ok: false, issue: 'contains-digit' };
  if (first.toUpperCase() === first && first.length > 2)
    return { ok: true, issue: 'all-caps-first' }; // fixable
  return { ok: true, issue: null };
}

function checkAddress(lead) {
  const issues = [];
  if (!lead.propertyAddress || !lead.propertyAddress.trim()) issues.push('missing-property-address');
  if (!lead.city            || !lead.city.trim())            issues.push('missing-city');
  if (!lead.state           || !lead.state.trim())           issues.push('missing-state');
  // Check city name quality
  if (lead.city && lead.city.toUpperCase() === lead.city && lead.city.length > 3)
    issues.push('city-all-caps'); // fixable
  return { ok: issues.length === 0, issues };
}

function checkNPI(npi) {
  if (!npi) return { ok: false, issue: 'missing' };
  const s = String(npi).replace(/\D/g, '');
  if (s.length !== 10) return { ok: false, issue: `wrong-length (${s.length})` };
  return { ok: true, issue: null };
}

function checkSpecialty(specialty, credential) {
  if (!specialty && !credential) return { ok: false, issue: 'missing-both' };
  if (!specialty) return { ok: true, issue: 'no-specialty-but-has-credential' };
  // Flag low-signal specialties that slipped through
  const LOW = /student|transport|supplier|vendor|equipment/i;
  if (LOW.test(specialty)) return { ok: false, issue: 'low-signal-specialty' };
  return { ok: true, issue: null };
}

function checkHomeValue(v) {
  if (!v || v === 0) return { ok: false, issue: 'missing' };
  if (v < 1000000)   return { ok: false, issue: `below-1M ($${(v/1000).toFixed(0)}K)` };
  return { ok: true, issue: null };
}

function titleCase(s) {
  return (s || '').split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Production Lead Field Audit                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Load production-ready leads
  process.stdout.write('  Loading production-ready leads... ');
  let q = db.collection('master_leads').where('enrichmentStatus', '==', 'production-ready');
  if (NICHE) q = q.where('nicheId', '==', NICHE);
  const snap = await q.get();
  const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${leads.length} leads loaded\n`);

  if (leads.length === 0) { console.log('  No production-ready leads found.\n'); process.exit(0); }

  // ── Optional: print full sample records ──────────────────────────────────
  if (SAMPLE_N > 0) {
    console.log(`═══ FULL RECORD SAMPLE (first ${SAMPLE_N}) ═══════════════════════════\n`);
    leads.slice(0, SAMPLE_N).forEach((lead, i) => {
      console.log(`\n─── Record ${i + 1}: ${lead.firstName} ${lead.lastName} ───`);
      const FIELDS = [
        'firstName','lastName','name','city','state','zip',
        'propertyAddress','homeValue','phone','email','linkedInUrl',
        'npiNumber','credential','specialty','nicheId','niche',
        'fitScore','source','enrichmentStatus','qualityBucket',
        'assets','signals','tags','createdAt','updatedAt',
      ];
      FIELDS.forEach(f => {
        const v = lead[f];
        if (v !== undefined) {
          const display = Array.isArray(v) ? JSON.stringify(v).slice(0,100) : String(v).slice(0,100);
          console.log(`  ${f.padEnd(22)}: ${display}`);
        }
      });
    });
    console.log('\n' + '═'.repeat(66) + '\n');
  }

  // ── Run field audits ──────────────────────────────────────────────────────
  const results = leads.map(lead => {
    const phone   = checkPhone(lead.phone);
    const email   = checkEmail(lead.email);
    const name    = checkName(lead.firstName, lead.lastName);
    const address = checkAddress(lead);
    const npi     = checkNPI(lead.npiNumber);
    const spec    = checkSpecialty(lead.specialty, lead.credential);
    const val     = checkHomeValue(lead.homeValue);

    // "Advisor-ready" = phone + name + address + NPI all pass (email optional but noted)
    const advisorReady = phone.ok && name.ok && address.ok && npi.ok && spec.ok && val.ok;

    // Auto-fixable issues
    const fixable = {};
    if (phone.ok && phone.clean && phone.clean !== lead.phone) fixable.phone = phone.clean;
    if (name.issue === 'all-caps-first') fixable.firstName = titleCase(lead.firstName);
    if (address.issues.includes('city-all-caps')) fixable.city = titleCase(lead.city);

    return { lead, phone, email, name, address, npi, spec, val, advisorReady, fixable };
  });

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const total = results.length;
  const passes = f => results.filter(r => r[f].ok).length;
  const fails  = f => results.filter(r => !r[f].ok).length;

  console.log('═'.repeat(66));
  console.log('  FIELD-BY-FIELD PASS RATES');
  console.log('═'.repeat(66));

  const fields = [
    { key: 'name',    label: 'Full name (first + last)' },
    { key: 'phone',   label: 'Phone number (valid 10-digit)' },
    { key: 'email',   label: 'Email address' },
    { key: 'address', label: 'Property address (addr+city+state)' },
    { key: 'npi',     label: 'NPI number (10-digit)' },
    { key: 'spec',    label: 'Clinical specialty' },
    { key: 'val',     label: 'Home value ($1M+)' },
  ];

  function bar(n, t, w = 20) {
    const f = Math.round(w * n / (t || 1));
    return '█'.repeat(f) + '░'.repeat(w - f);
  }
  function pct(n, t) { return `${Math.round(100 * n / (t || 1))}%`; }

  fields.forEach(({ key, label }) => {
    const p = passes(key);
    const icon = p === total ? '✅' : p > total * 0.8 ? '🟡' : '🔴';
    console.log(`\n  ${icon} ${label}`);
    console.log(`     Pass: ${p}/${total}  ${pct(p, total).padStart(4)}  ${bar(p, total)}`);
    if (p < total) {
      // Show issue breakdown
      const issues = {};
      results.filter(r => !r[key].ok).forEach(r => {
        const iss = key === 'address'
          ? (r[key].issues || []).join('+') || 'unknown'
          : r[key].issue || 'unknown';
        issues[iss] = (issues[iss] || 0) + 1;
      });
      Object.entries(issues).sort((a,b)=>b[1]-a[1]).forEach(([iss, cnt]) => {
        console.log(`       └─ ${iss}: ${cnt}`);
      });
    }
  });

  // ── Advisor-ready summary ─────────────────────────────────────────────────
  const advisorReady = results.filter(r => r.advisorReady).length;
  const fixableCount = results.filter(r => Object.keys(r.fixable).length > 0).length;

  console.log(`\n${'═'.repeat(66)}`);
  console.log('  ADVISOR-READY SUMMARY');
  console.log('═'.repeat(66));
  console.log(`\n  Total production-ready leads: ${total}`);
  console.log(`  ✅ Fully advisor-ready:        ${advisorReady}  (${pct(advisorReady, total)})`);
  console.log(`     (has: name + phone + address + NPI + specialty + $1M+ home)`);
  console.log(`  🔧 Auto-fixable formatting:    ${fixableCount}  (phone format, city casing)`);
  console.log(`  📧 Has email (bonus):          ${passes('email')}  (${pct(passes('email'), total)})`);
  console.log(`  ⚠️  Need attention:             ${total - advisorReady - fixableCount}`);

  // ── Phone issue deep-dive ─────────────────────────────────────────────────
  const badPhones = results.filter(r => !r.phone.ok);
  if (badPhones.length > 0) {
    console.log(`\n${'─'.repeat(66)}`);
    console.log(`  📞 PHONE ISSUES (${badPhones.length} leads)`);
    badPhones.slice(0, 10).forEach(({ lead, phone }) => {
      const name = `${lead.firstName} ${lead.lastName}`.slice(0, 25).padEnd(26);
      const raw  = (lead.phone || 'BLANK').slice(0, 20).padEnd(21);
      console.log(`  ${name} raw: "${raw}"  issue: ${phone.issue}`);
    });
    if (badPhones.length > 10) console.log(`  ... and ${badPhones.length - 10} more`);
  }

  // ── NPI deep-dive ─────────────────────────────────────────────────────────
  const badNPI = results.filter(r => !r.npi.ok);
  if (badNPI.length > 0) {
    console.log(`\n${'─'.repeat(66)}`);
    console.log(`  🏥 NPI ISSUES (${badNPI.length} leads)`);
    badNPI.slice(0, 8).forEach(({ lead, npi }) => {
      const name = `${lead.firstName} ${lead.lastName}`.slice(0, 25).padEnd(26);
      console.log(`  ${name} NPI: "${lead.npiNumber || 'BLANK'}"  issue: ${npi.issue}`);
    });
  }

  // ── Address deep-dive ─────────────────────────────────────────────────────
  const badAddr = results.filter(r => !r.address.ok);
  if (badAddr.length > 0) {
    console.log(`\n${'─'.repeat(66)}`);
    console.log(`  🏠 ADDRESS ISSUES (${badAddr.length} leads)`);
    badAddr.slice(0, 8).forEach(({ lead, address }) => {
      const name = `${lead.firstName} ${lead.lastName}`.slice(0, 25).padEnd(26);
      console.log(`  ${name} city:"${lead.city||'—'}"  addr:"${lead.propertyAddress || '—'}"  issues: ${address.issues.join(', ')}`);
    });
    if (badAddr.length > 8) console.log(`  ... and ${badAddr.length - 8} more`);
  }

  // ── Example advisor-ready records ────────────────────────────────────────
  const ready = results.filter(r => r.advisorReady);
  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  ✅ ADVISOR-READY SAMPLE (first 15)`);
  console.log('═'.repeat(66));
  console.log('  ' +
    'Name'.padEnd(26) +
    'City'.padEnd(14) +
    'Specialty'.padEnd(28) +
    'Phone'.padEnd(18) +
    'Home Val'
  );
  console.log('  ' + '─'.repeat(100));
  ready.slice(0, 15).forEach(({ lead }) => {
    const name  = `${lead.firstName} ${lead.lastName}`.slice(0, 25).padEnd(25);
    const city  = (lead.city || '').slice(0, 12).padEnd(13);
    const spec  = (lead.specialty || lead.credential || '').slice(0, 26).padEnd(27);
    const phone = (lead.phone || '').padEnd(17);
    const val   = lead.homeValue ? `$${(lead.homeValue / 1e6).toFixed(1)}M` : '—';
    console.log(`  ${name}  ${city}  ${spec}  ${phone}  ${val}`);
  });

  // ── Niche breakdown of advisor-ready ─────────────────────────────────────
  const byNiche = {};
  ready.forEach(({ lead }) => {
    byNiche[lead.nicheId] = (byNiche[lead.nicheId] || 0) + 1;
  });
  console.log(`\n  By niche:`);
  Object.entries(byNiche).sort((a,b)=>b[1]-a[1]).forEach(([n, c]) => {
    console.log(`    ${n.padEnd(20)} ${c} leads`);
  });

  // ── Auto-fix ─────────────────────────────────────────────────────────────
  if (FIX && fixableCount > 0) {
    console.log(`\n${'═'.repeat(66)}`);
    console.log(`  🔧 AUTO-FIXING ${fixableCount} RECORDS...`);
    const toFix = results.filter(r => Object.keys(r.fixable).length > 0);
    const BATCH_SIZE = 400;
    let written = 0;
    for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
      const chunk = toFix.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ lead, fixable }) => {
        batch.update(db.collection('master_leads').doc(lead.id), {
          ...fixable,
          updatedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
      written += chunk.length;
      console.log(`  ✅ Fixed ${written}/${toFix.length}`);
    }
    console.log(`  Done. Re-run audit to confirm.`);
  } else if (!FIX && fixableCount > 0) {
    console.log(`\n  🔧 ${fixableCount} records have auto-fixable formatting issues.`);
    console.log(`     Run with --fix to apply: node scripts/audit_production_leads.js --fix`);
  }

  console.log(`\n  Next: node scripts/route_new_leads.js --advisor jeremy --quality production-ready`);
  console.log('');
  process.exit(0);
}

main().catch(e => {
  console.error('[FieldAudit] FATAL:', e.message);
  process.exit(1);
});
