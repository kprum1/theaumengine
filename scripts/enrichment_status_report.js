#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Enrichment Status Report
// scripts/enrichment_status_report.js
// Sprint C39 — Contact Enrichment Layer
//
// Purpose: Reads all master_leads from Firestore and reports enrichment
//   coverage by niche: email %, phone %, LinkedIn %, address %.
//   Identifies the best candidates for next Apollo enrichment run.
//
// Usage:
//   node scripts/enrichment_status_report.js
//   node scripts/enrichment_status_report.js --niche physicians
//   node scripts/enrichment_status_report.js --blank-only      (show leads with no contact data)
//   node scripts/enrichment_status_report.js --export          (write JSON to staging/enrichment_audit.json)
// =====================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const KEY   = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

// ── CLI args ──────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const hasFlag    = (f) => args.includes(f);
const getArg     = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const NICHE_FILTER = getArg('--niche');
const BLANK_ONLY   = hasFlag('--blank-only');
const EXPORT       = hasFlag('--export');

// ── Helpers ───────────────────────────────────────────────────────────
function hasValue(v) {
  return v && typeof v === 'string' && v.trim().length > 0;
}

function enrichmentScore(lead) {
  let score = 0;
  if (hasValue(lead.email))      score++;
  if (hasValue(lead.phone))      score++;
  if (hasValue(lead.linkedInUrl))score++;
  if (hasValue(lead.address))    score++;
  return score; // 0-4
}

function enrichmentLabel(score) {
  if (score >= 3) return '🟢 Full';
  if (score >= 1) return '🟡 Partial';
  return '🔴 Blank';
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Enrichment Status Report                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Load all master_leads ──────────────────────────────────────────
  console.log('Loading master_leads from Firestore...');
  let query = db.collection('master_leads');
  if (NICHE_FILTER) {
    query = query.where('nicheId', '==', NICHE_FILTER);
    console.log(`Filter: nicheId = "${NICHE_FILTER}"`);
  }

  const snap = await query.get();
  const leads = [];
  snap.forEach(doc => leads.push({ id: doc.id, ...doc.data() }));

  console.log(`Total leads loaded: ${leads.length}\n`);

  if (BLANK_ONLY) {
    leads = leads.filter(l => enrichmentScore(l) === 0);
    console.log(`Blank-only filter: ${leads.length} leads with zero contact data\n`);
  }

  // ── Overall counts ────────────────────────────────────────────────
  const withEmail    = leads.filter(l => hasValue(l.email)).length;
  const withPhone    = leads.filter(l => hasValue(l.phone)).length;
  const withLinkedIn = leads.filter(l => hasValue(l.linkedInUrl)).length;
  const withAddress  = leads.filter(l => hasValue(l.address)).length;
  const fullyEnriched  = leads.filter(l => enrichmentScore(l) >= 3).length;
  const partialEnriched = leads.filter(l => enrichmentScore(l) > 0 && enrichmentScore(l) < 3).length;
  const blankLeads   = leads.filter(l => enrichmentScore(l) === 0).length;

  const pct = (n) => `${n}/${leads.length} (${Math.round(100*n/leads.length)}%)`;

  console.log('── OVERALL ENRICHMENT COVERAGE ──────────────────────────────');
  console.log(`  📧 Email:        ${pct(withEmail)}`);
  console.log(`  📞 Phone:        ${pct(withPhone)}`);
  console.log(`  🔗 LinkedIn:     ${pct(withLinkedIn)}`);
  console.log(`  🏠 Address:      ${pct(withAddress)}`);
  console.log('');
  console.log(`  🟢 Fully enriched (3+ fields): ${pct(fullyEnriched)}`);
  console.log(`  🟡 Partial (1-2 fields):        ${pct(partialEnriched)}`);
  console.log(`  🔴 Blank (0 fields):            ${pct(blankLeads)}`);
  console.log('');

  // ── Per-niche breakdown ───────────────────────────────────────────
  console.log('── PER-NICHE BREAKDOWN ──────────────────────────────────────');
  console.log(
    'Niche'.padEnd(30) +
    'Total'.padStart(7) +
    'Email'.padStart(7) +
    'Phone'.padStart(7) +
    'LinkedIn'.padStart(10) +
    'Address'.padStart(9) +
    '  Status'
  );
  console.log('─'.repeat(85));

  const byNiche = {};
  leads.forEach(l => {
    const n = l.nicheId || 'unknown';
    if (!byNiche[n]) byNiche[n] = { total:0, email:0, phone:0, linkedin:0, address:0, blank:0 };
    byNiche[n].total++;
    if (hasValue(l.email))       byNiche[n].email++;
    if (hasValue(l.phone))       byNiche[n].phone++;
    if (hasValue(l.linkedInUrl)) byNiche[n].linkedin++;
    if (hasValue(l.address))     byNiche[n].address++;
    if (enrichmentScore(l) === 0) byNiche[n].blank++;
  });

  Object.entries(byNiche)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([niche, d]) => {
      const emailPct = Math.round(100*d.email/d.total);
      const bestCoverage = Math.max(emailPct, Math.round(100*d.phone/d.total), Math.round(100*d.linkedin/d.total));
      const status = bestCoverage >= 50 ? '🟢' : bestCoverage >= 20 ? '🟡' : '🔴 Needs enrichment';
      console.log(
        niche.padEnd(30) +
        String(d.total).padStart(7) +
        String(d.email).padStart(7) +
        String(d.phone).padStart(7) +
        String(d.linkedin).padStart(10) +
        String(d.address).padStart(9) +
        '  ' + status
      );
    });

  console.log('');

  // ── Recommend next action ─────────────────────────────────────────
  console.log('── RECOMMENDED NEXT ACTIONS ─────────────────────────────────');

  // Niches with NPI phone data (free backfill available)
  const npiNiches = ['physicians', 'dentists'];
  const npiTargets = leads.filter(l => npiNiches.includes(l.nicheId) && !hasValue(l.phone));
  if (npiTargets.length > 0) {
    console.log(`  1. 🆓 Registry Backfill available:`);
    console.log(`     ${npiTargets.length} physicians/dentists missing phone — run:`);
    console.log(`     node scripts/agent_registry_backfill.js`);
    console.log('');
  }

  // Leads with no enrichment at all
  const apolloTargets = leads.filter(l => enrichmentScore(l) < 2);
  console.log(`  2. 🎯 Apollo enrichment candidates: ${apolloTargets.length} leads with <2 contact fields`);
  console.log(`     Priority order:`);

  const priorityNiches = ['physicians', 'c-suite-executives', 'dentists', 'business-owners', 'law-partners', 'aircraft-owners'];
  priorityNiches.forEach(n => {
    const count = apolloTargets.filter(l => l.nicheId === n).length;
    if (count > 0) console.log(`       - ${n}: ${count} leads need enrichment`);
  });

  console.log('');
  console.log(`     Run: node scripts/agent_apollo_enrich_v2.js --niche physicians --limit 50`);
  console.log('');

  // ── Leads with LinkedIn but no email/phone (Proxycurl targets) ────
  const proxycurlTargets = leads.filter(l => hasValue(l.linkedInUrl) && !hasValue(l.email) && !hasValue(l.phone));
  if (proxycurlTargets.length > 0) {
    console.log(`  3. 🔗 Proxycurl targets: ${proxycurlTargets.length} leads have LinkedIn but no email/phone`);
    console.log(`     These can be enriched via Proxycurl API (linkedin profile → contact data)`);
  }

  // ── Export JSON ───────────────────────────────────────────────────
  if (EXPORT) {
    const outPath = path.join(__dirname, 'staging', 'enrichment_audit.json');
    const report = {
      generatedAt: new Date().toISOString(),
      totalLeads: leads.length,
      coverage: { email: withEmail, phone: withPhone, linkedIn: withLinkedIn, address: withAddress },
      fullyEnriched,
      partialEnriched,
      blankLeads,
      byNiche,
      blankLeadIds: leads.filter(l => enrichmentScore(l) === 0).map(l => ({
        id: l.id,
        name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.company || '—',
        nicheId: l.nicheId,
        city: l.city,
        state: l.state,
      })),
    };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`  📄 Full audit exported to: ${outPath}`);
  }

  console.log('\n── DONE ─────────────────────────────────────────────────────\n');
  process.exit(0);
}

run().catch(e => { console.error('[EnrichmentReport] FATAL:', e.message); process.exit(1); });
