#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Comprehensive Data Audit
// scripts/audit_data_quality.js
//
// Produces a full health report on master_leads pipeline data:
//
//   1. PIPELINE OVERVIEW    — total counts by source, niche, status
//   2. CONTACT COVERAGE     — email/phone/LinkedIn by source and niche
//   3. DATA QUALITY         — name completeness, bad parses, address-only
//   4. HOMESTEAD TIER       — Hennepin + Carver value distribution
//   5. ENRICHMENT STATUS    — pending vs enriched vs failed breakdown
//   6. ROUTING HEALTH       — lead_assignments vs master_leads alignment
//   7. SCORE DISTRIBUTION   — fitScore tiers across all leads
//   8. ACTION ITEMS         — ranked list of highest-leverage next steps
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

function fmtVal(n) {
  if (!n || n === 0) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function pct(num, den) {
  if (!den) return '0%';
  return `${Math.round(100 * num / den)}%`;
}

function bar(num, den, width = 20) {
  const filled = Math.round(width * num / (den || 1));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function sep(char = '─', len = 64) { return char.repeat(len); }

async function main() {
  console.log('\n' + '═'.repeat(66));
  console.log('  THE AUM ENGINE — DATA QUALITY AUDIT');
  console.log('  ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('═'.repeat(66));

  // ── Load all collections ─────────────────────────────────────────────────
  process.stdout.write('\n  Loading data...');
  const [leadsSnap, assignSnap] = await Promise.all([
    db.collection('master_leads').get(),
    db.collection('lead_assignments').get(),
  ]);
  const leads  = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const assigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(` ${leads.length} master_leads, ${assigns.length} lead_assignments loaded\n`);

  // ══════════════════════════════════════════════════════════════
  // 1. PIPELINE OVERVIEW
  // ══════════════════════════════════════════════════════════════
  console.log(sep('═'));
  console.log('  1. PIPELINE OVERVIEW');
  console.log(sep('═'));

  // By source
  const bySrc = {};
  leads.forEach(l => {
    const s = l.source || 'unknown';
    bySrc[s] = (bySrc[s] || 0) + 1;
  });
  console.log('\n  By source:');
  Object.entries(bySrc)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => {
      console.log(`    ${s.padEnd(45)} ${String(n).padStart(5)} leads`);
    });

  // By niche
  const byNiche = {};
  leads.forEach(l => {
    const n = l.nicheId || 'unclassified';
    byNiche[n] = (byNiche[n] || 0) + 1;
  });
  console.log('\n  By niche:');
  Object.entries(byNiche)
    .sort((a, b) => b[1] - a[1])
    .forEach(([n, cnt]) => {
      console.log(`    ${n.padEnd(35)} ${String(cnt).padStart(5)} leads`);
    });

  // By status
  const byStatus = {};
  leads.forEach(l => {
    const s = l.status || 'unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  console.log('\n  By status:');
  Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).forEach(([s,n]) => {
    console.log(`    ${s.padEnd(20)} ${n}`);
  });

  // ══════════════════════════════════════════════════════════════
  // 2. CONTACT COVERAGE
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  2. CONTACT COVERAGE');
  console.log(sep('═'));

  const total    = leads.length;
  const hasEmail = leads.filter(l => l.email && l.email.trim()).length;
  const hasPhone = leads.filter(l => l.phone && l.phone.trim()).length;
  const hasLI    = leads.filter(l => l.linkedInUrl && l.linkedInUrl.trim()).length;
  const hasAny   = leads.filter(l => (l.email || l.phone)).length;
  const hasNone  = leads.filter(l => !l.email && !l.phone && !l.linkedInUrl).length;

  console.log(`\n  Overall (${total} total leads):`);
  console.log(`    Has email:    ${hasEmail.toString().padStart(5)} ${pct(hasEmail,total).padStart(5)}  ${bar(hasEmail,total)}`);
  console.log(`    Has phone:    ${hasPhone.toString().padStart(5)} ${pct(hasPhone,total).padStart(5)}  ${bar(hasPhone,total)}`);
  console.log(`    Has LinkedIn: ${hasLI.toString().padStart(5)} ${pct(hasLI,total).padStart(5)}  ${bar(hasLI,total)}`);
  console.log(`    Has either:   ${hasAny.toString().padStart(5)} ${pct(hasAny,total).padStart(5)}  ${bar(hasAny,total)}`);
  console.log(`    Has NONE:     ${hasNone.toString().padStart(5)} ${pct(hasNone,total).padStart(5)}  ← gap to close`);

  // Contact by source
  console.log('\n  Contact coverage by source:');
  console.log('    ' + 'Source'.padEnd(40) + 'Total'.padStart(6) + ' Email'.padStart(7) + ' Phone'.padStart(7) + ' Either'.padStart(8) + ' Coverage');
  Object.entries(bySrc).sort((a,b) => b[1]-a[1]).forEach(([src, cnt]) => {
    const srcLeads = leads.filter(l => (l.source||'') === src);
    const e = srcLeads.filter(l => l.email).length;
    const p = srcLeads.filter(l => l.phone).length;
    const any = srcLeads.filter(l => l.email || l.phone).length;
    const shortSrc = src.length > 38 ? src.slice(0, 36) + '..' : src;
    console.log(`    ${shortSrc.padEnd(40)} ${String(cnt).padStart(5)} ${String(e).padStart(6)} ${String(p).padStart(6)} ${String(any).padStart(7)}  ${pct(any, cnt)}`);
  });

  // Contact by niche (non-homestead niches only)
  console.log('\n  Contact by niche (non-homestead):');
  const HNW_SOURCES = ['HennepinCounty_GIS_$1M+_Homestead', 'CarverCounty_GIS_$1M+_Homestead'];
  Object.entries(byNiche)
    .filter(([n]) => n !== 'henrys' || true)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 10)
    .forEach(([niche, cnt]) => {
      const nicheLeads = leads.filter(l => l.nicheId === niche);
      const e = nicheLeads.filter(l => l.email).length;
      const p = nicheLeads.filter(l => l.phone).length;
      const any = nicheLeads.filter(l => l.email || l.phone).length;
      console.log(`    ${niche.padEnd(35)} ${String(cnt).padStart(5)}  ${String(any).padStart(4)} contactable  ${pct(any, cnt)}`);
    });

  // ══════════════════════════════════════════════════════════════
  // 3. DATA QUALITY
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  3. DATA QUALITY');
  console.log(sep('═'));

  const noFirstName  = leads.filter(l => !l.firstName || !l.firstName.trim()).length;
  const noLastName   = leads.filter(l => !l.lastName || !l.lastName.trim()).length;
  const addrOnly     = leads.filter(l => l.enrichmentStatus === 'address-only').length;
  const badTitle     = leads.filter(l => (l.title||'').includes('Homeowner')).length;
  const hasHomeVal   = leads.filter(l => l.homeValue && l.homeValue > 0).length;
  const noCity       = leads.filter(l => !l.city || !l.city.trim()).length;

  console.log(`\n  Name completeness:`);
  console.log(`    Has firstName:       ${total - noFirstName} / ${total}  (${pct(total-noFirstName, total)})`);
  console.log(`    Has lastName:        ${total - noLastName} / ${total}  (${pct(total-noLastName, total)})`);
  console.log(`    Address-only (no name): ${addrOnly}  — need PDL address lookup`);

  console.log(`\n  Title quality:`);
  console.log(`    "Homeowner" title (legacy):   ${badTitle}  ← reclassify via enrichment`);
  console.log(`    Has homeValue (deed-verified): ${hasHomeVal}  ${pct(hasHomeVal, total)}`);

  console.log(`\n  Location:`);
  console.log(`    Has city:  ${total - noCity} / ${total}`);
  const inMN = leads.filter(l => l.state === 'MN').length;
  console.log(`    In MN:     ${inMN} / ${total}  (${pct(inMN, total)})`);

  // Check for bad emails (obviously wrong format)
  const withEmail = leads.filter(l => l.email);
  const suspectEmails = withEmail.filter(l => {
    const e = l.email;
    return !e.includes('@') || !e.includes('.') || e.length < 6;
  });
  console.log(`\n  Email quality:`);
  console.log(`    Total with email:    ${withEmail.length}`);
  console.log(`    Suspect format:      ${suspectEmails.length}`);
  if (suspectEmails.length > 0) {
    suspectEmails.slice(0, 3).forEach(l => {
      console.log(`      ${l.firstName} ${l.lastName}: "${l.email}"`);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 4. HOMESTEAD TIER ANALYSIS
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  4. HOMESTEAD TIER ANALYSIS');
  console.log(sep('═'));

  const homesteadLeads = leads.filter(l =>
    l.source === 'HennepinCounty_GIS_$1M+_Homestead' ||
    l.source === 'CarverCounty_GIS_$1M+_Homestead'
  );

  const henn = leads.filter(l => l.source === 'HennepinCounty_GIS_$1M+_Homestead');
  const carv = leads.filter(l => l.source === 'CarverCounty_GIS_$1M+_Homestead');

  const v5m = homesteadLeads.filter(l => l.homeValue >= 5000000).length;
  const v3m = homesteadLeads.filter(l => l.homeValue >= 3000000 && l.homeValue < 5000000).length;
  const v2m = homesteadLeads.filter(l => l.homeValue >= 2000000 && l.homeValue < 3000000).length;
  const v1m = homesteadLeads.filter(l => l.homeValue >= 1000000 && l.homeValue < 2000000).length;

  console.log(`\n  Total deed-verified homestead leads: ${homesteadLeads.length}`);
  console.log(`    Hennepin County: ${henn.length}`);
  console.log(`    Carver County:   ${carv.length}`);

  console.log(`\n  Value distribution:`);
  console.log(`    $5M+:    ${v5m.toString().padStart(5)}  ${bar(v5m, homesteadLeads.length, 15)}  ${pct(v5m, homesteadLeads.length)}`);
  console.log(`    $3M–5M:  ${v3m.toString().padStart(5)}  ${bar(v3m, homesteadLeads.length, 15)}  ${pct(v3m, homesteadLeads.length)}`);
  console.log(`    $2M–3M:  ${v2m.toString().padStart(5)}  ${bar(v2m, homesteadLeads.length, 15)}  ${pct(v2m, homesteadLeads.length)}`);
  console.log(`    $1M–2M:  ${v1m.toString().padStart(5)}  ${bar(v1m, homesteadLeads.length, 15)}  ${pct(v1m, homesteadLeads.length)}`);

  // Top cities by homestead lead count
  const byCityCount = {};
  homesteadLeads.forEach(l => {
    byCityCount[l.city || '?'] = (byCityCount[l.city || '?'] || 0) + 1;
  });
  console.log(`\n  Top cities:`);
  Object.entries(byCityCount).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([city, cnt]) => {
    console.log(`    ${city.padEnd(20)} ${cnt} leads`);
  });

  // Homestead contact coverage
  const hstContact = homesteadLeads.filter(l => l.email || l.phone).length;
  console.log(`\n  Homestead contact coverage: ${hstContact} / ${homesteadLeads.length}  (${pct(hstContact, homesteadLeads.length)})`);
  console.log(`  Still need contact info:    ${homesteadLeads.length - hstContact} leads`);

  // ══════════════════════════════════════════════════════════════
  // 5. ENRICHMENT STATUS
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  5. ENRICHMENT STATUS');
  console.log(sep('═'));

  const byEnrichStatus = {};
  leads.forEach(l => {
    const s = l.enrichmentStatus || 'unknown';
    byEnrichStatus[s] = (byEnrichStatus[s] || 0) + 1;
  });

  console.log('\n  Enrichment status breakdown:');
  Object.entries(byEnrichStatus).sort((a,b)=>b[1]-a[1]).forEach(([s, n]) => {
    const icon = s === 'enriched' ? '✅' : s === 'pending' ? '⏳' : s === 'failed' ? '❌' : '📍';
    console.log(`    ${icon} ${s.padEnd(20)} ${n}`);
  });

  // Enriched but no contact ("falsely enriched")
  const enrichedNoContact = leads.filter(l =>
    l.enrichmentStatus === 'enriched' && !l.email && !l.phone
  ).length;
  console.log(`\n  ⚠️  "Falsely enriched" (enriched status but zero contact): ${enrichedNoContact}`);
  console.log(`     → These need a PDL second pass with --no-contact-only`);

  // ══════════════════════════════════════════════════════════════
  // 6. ROUTING HEALTH
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  6. ROUTING HEALTH');
  console.log(sep('═'));

  console.log(`\n  master_leads:     ${leads.length}`);
  console.log(`  lead_assignments: ${assigns.length}`);
  console.log(`  Unrouted gap:     ${leads.length - assigns.length} leads not yet assigned`);

  // Assignments by advisor
  const byAdvisor = {};
  assigns.forEach(a => {
    const id = a.advisorId || 'unknown';
    byAdvisor[id] = (byAdvisor[id] || 0) + 1;
  });
  console.log('\n  Assignments by advisor:');
  Object.entries(byAdvisor).sort((a,b)=>b[1]-a[1]).forEach(([id, n]) => {
    console.log(`    ${id.padEnd(30)} ${n} leads assigned`);
  });

  // ══════════════════════════════════════════════════════════════
  // 7. SCORE DISTRIBUTION
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  7. SCORE DISTRIBUTION');
  console.log(sep('═'));

  const score90 = leads.filter(l => l.fitScore >= 90).length;
  const score80 = leads.filter(l => l.fitScore >= 80 && l.fitScore < 90).length;
  const score70 = leads.filter(l => l.fitScore >= 70 && l.fitScore < 80).length;
  const scoreBelow = leads.filter(l => (l.fitScore || 0) < 70).length;
  const noScore = leads.filter(l => !l.fitScore).length;

  console.log(`\n  fitScore distribution:`);
  console.log(`    90–100 (ultra-HNW):  ${score90.toString().padStart(5)} ${pct(score90, total).padStart(5)}  ${bar(score90, total)}`);
  console.log(`    80–89 (high-value):  ${score80.toString().padStart(5)} ${pct(score80, total).padStart(5)}  ${bar(score80, total)}`);
  console.log(`    70–79 (solid):       ${score70.toString().padStart(5)} ${pct(score70, total).padStart(5)}  ${bar(score70, total)}`);
  console.log(`    <70 (lower signal):  ${scoreBelow.toString().padStart(5)} ${pct(scoreBelow, total).padStart(5)}`);
  console.log(`    No score:            ${noScore.toString().padStart(5)}`);

  // ══════════════════════════════════════════════════════════════
  // 8. ACTION ITEMS
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  8. ACTION ITEMS — ranked by impact');
  console.log(sep('═'));

  const actions = [];

  // Falsely enriched
  if (enrichedNoContact > 0) {
    actions.push({
      priority: '🔴 HIGH',
      impact: enrichedNoContact,
      action: `Re-enrich ${enrichedNoContact} leads marked 'enriched' with no contact data`,
      cmd: `node scripts/agent_pdl_enrich.js --state MN --no-contact-only --limit 100`,
    });
  }

  // Address-only Carver
  if (addrOnly > 0) {
    actions.push({
      priority: '🔴 HIGH',
      impact: addrOnly,
      action: `Resolve ${addrOnly} address-only Carver leads (no name yet)`,
      cmd: `node scripts/agent_pdl_enrich.js --state MN --cities "Chaska,Chanhassen,Victoria" --no-contact-only --limit 100`,
    });
  }

  // $1M–2M tier homesteads with no contact
  const lowerTierNoContact = leads.filter(l =>
    l.source && l.source.includes('GIS_$1M+') &&
    l.homeValue >= 1000000 && l.homeValue < 2000000 &&
    !l.email && !l.phone
  ).length;
  if (lowerTierNoContact > 100) {
    actions.push({
      priority: '🟡 MED',
      impact: lowerTierNoContact,
      action: `Enrich ${lowerTierNoContact} $1M–2M homesteads with no contact`,
      cmd: `node scripts/agent_apollo_enrich_v2.js --state MN --force --limit 100`,
    });
  }

  // Bad title homeowners
  if (badTitle > 0) {
    actions.push({
      priority: '🟡 MED',
      impact: badTitle,
      action: `Reclassify ${badTitle} "Homeowner" titled leads via PDL profession discovery`,
      cmd: `node scripts/agent_pdl_enrich.js --state MN --force --limit 200`,
    });
  }

  // Unrouted leads
  const unrouted = leads.length - assigns.length;
  if (unrouted > 500) {
    actions.push({
      priority: '🟡 MED',
      impact: unrouted,
      action: `Route ${unrouted} unassigned master_leads to Jeremy via routing pipeline`,
      cmd: `node scripts/route_new_leads.js --advisor jeremy`,
    });
  }

  // Suspect emails
  if (suspectEmails.length > 0) {
    actions.push({
      priority: '🟢 LOW',
      impact: suspectEmails.length,
      action: `Validate ${suspectEmails.length} suspect email addresses`,
      cmd: `(review manually — check for missing @, short strings, etc.)`,
    });
  }

  actions.forEach((a, i) => {
    console.log(`\n  ${i+1}. ${a.priority} — ${a.action}`);
    console.log(`     Impact: ${a.impact} leads`);
    console.log(`     Run:    ${a.cmd}`);
  });

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log('\n' + sep('═'));
  console.log('  AUDIT SUMMARY');
  console.log(sep('═'));
  console.log(`\n  📊 Total leads in pipeline:     ${total}`);
  console.log(`  🏡 Deed-verified HNW homesteads: ${homesteadLeads.length}  (${pct(homesteadLeads.length, total)})`);
  console.log(`  📞 Contactable (email or phone): ${hasAny}  (${pct(hasAny, total)})`);
  console.log(`  📋 Routed to advisors:           ${assigns.length}  (${pct(assigns.length, total)})`);
  console.log(`  ⚠️  Action items identified:      ${actions.length}`);
  console.log('');

  process.exit(0);
}

main().catch(e => {
  console.error('[Audit] FATAL:', e.message);
  process.exit(1);
});
