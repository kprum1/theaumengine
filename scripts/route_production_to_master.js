#!/usr/bin/env node
// =============================================================================
// THE AUM ENGINE — Route Production-Ready Leads to Master Account
// scripts/route_production_to_master.js
//
// Routes all leads with enrichmentStatus='production-ready' directly to
// the master operator account (kosal@fin-tegration.com).
//
// Unlike route_batch.js (which uses advisor_pool scoring), this script
// routes directly by email so the operator sees every verified lead
// regardless of niche cap or scoring.
//
// Usage:
//   node scripts/route_production_to_master.js --dry-run
//   node scripts/route_production_to_master.js
//   node scripts/route_production_to_master.js --limit 100
// =============================================================================

'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = parseInt(args.find((a, i) => args[i-1] === '--limit') || '9999', 10);

const MASTER_EMAIL  = 'kosal@fin-tegration.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Route Production Leads → Master Account      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Target:  ${MASTER_EMAIL}`);
  console.log(`  Mode:    ${DRY_RUN ? '🔍 DRY RUN — no writes' : '✍️  LIVE'}`);
  console.log(`  Limit:   ${LIMIT === 9999 ? 'no limit' : LIMIT}\n`);

  // ── 1. Find master advisor record ───────────────────────────────────────
  process.stdout.write('  Looking up master account in advisor_pool... ');
  const apSnap = await db.collection('advisor_pool')
    .where('email', '==', MASTER_EMAIL)
    .limit(1)
    .get();

  let masterAdvisor = null;

  if (!apSnap.empty) {
    masterAdvisor = { id: apSnap.docs[0].id, ...apSnap.docs[0].data() };
    console.log(`found (${masterAdvisor.id})`);
  } else {
    // Not in advisor_pool — check users collection
    process.stdout.write('\n  Not in advisor_pool. Checking users... ');
    const uSnap = await db.collection('users')
      .where('email', '==', MASTER_EMAIL)
      .limit(1)
      .get();

    if (!uSnap.empty) {
      const u = uSnap.docs[0].data();
      masterAdvisor = {
        id:         uSnap.docs[0].id,
        email:      MASTER_EMAIL,
        firmName:   u.firmName || 'Fin-Tegration',
        firstName:  u.firstName || 'Kosal',
        lastName:   u.lastName  || 'Prum',
        nicheIds:   ['all'],   // master sees everything
        states:     [],
        activeLeadCap: 99999,
        currentLeadCount: 0,
        role: u.role || 'admin',
      };
      console.log(`found in users (${uSnap.docs[0].id})`);
    } else {
      // Use UID from firebase auth — create a virtual advisor record
      console.log('not found. Will use email as identifier.');
      masterAdvisor = {
        id:         'master_kosal',
        email:      MASTER_EMAIL,
        firmName:   'Fin-Tegration (Master)',
        firstName:  'Kosal',
        lastName:   'Prum',
        nicheIds:   ['all'],
        states:     [],
        activeLeadCap: 99999,
        currentLeadCount: 0,
        role: 'admin',
      };
    }
  }

  console.log(`  Routing to: ${masterAdvisor.firmName || masterAdvisor.email} (${masterAdvisor.id})\n`);

  // ── 2. Load all production-ready leads ──────────────────────────────────
  process.stdout.write('  Loading production-ready leads... ');
  let q = db.collection('master_leads')
    .where('enrichmentStatus', '==', 'production-ready');
  const snap = await q.get();
  let leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Cap
  if (leads.length > LIMIT) leads = leads.slice(0, LIMIT);
  console.log(`${leads.length} leads ready\n`);

  // ── 3. Dedup: check which are already in lead_assignments ───────────────
  process.stdout.write('  Checking for already-routed leads... ');
  const existSnap = await db.collection('lead_assignments')
    .where('advisorUid', '==', masterAdvisor.id)
    .select('masterLeadId')
    .get();
  const alreadyRouted = new Set(existSnap.docs.map(d => d.data().masterLeadId).filter(Boolean));
  console.log(`${alreadyRouted.size} already assigned to master\n`);

  const toRoute = leads.filter(l => !alreadyRouted.has(l.id));
  const skipped = leads.length - toRoute.length;

  console.log(`  To route:  ${toRoute.length}`);
  console.log(`  Skipped:   ${skipped} (already assigned)\n`);

  if (toRoute.length === 0) {
    console.log('  ✅ All production-ready leads already routed.\n');
    process.exit(0);
  }

  // ── 4. Preview ────────────────────────────────────────────────────────
  console.log('  Sample (first 10):');
  console.log('  ' +
    'Name'.padEnd(26) +
    'City'.padEnd(14) +
    'Specialty'.padEnd(28) +
    'Phone'.padEnd(18) +
    'Home Value'
  );
  console.log('  ' + '─'.repeat(100));
  toRoute.slice(0, 10).forEach(lead => {
    const name  = `${lead.firstName} ${lead.lastName}`.slice(0, 25).padEnd(25);
    const city  = (lead.city || '').slice(0, 12).padEnd(13);
    const spec  = (lead.specialty || lead.credential || '').slice(0, 26).padEnd(27);
    const phone = (lead.phone || '').padEnd(17);
    const val   = lead.homeValue ? `$${(lead.homeValue / 1e6).toFixed(1)}M` : '—';
    console.log(`  ${name}  ${city}  ${spec}  ${phone}  ${val}`);
  });
  if (toRoute.length > 10) console.log(`  ... and ${toRoute.length - 10} more\n`);

  if (DRY_RUN) {
    console.log(`\n  🔍 DRY RUN — would route ${toRoute.length} leads to ${MASTER_EMAIL}`);
    console.log(`     Remove --dry-run to execute.\n`);
    process.exit(0);
  }

  // ── 5. Write to lead_assignments + update master_leads ────────────────
  console.log(`\n── Writing ${toRoute.length} assignments to Firestore...`);
  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const BATCH_SIZE = 200; // 200 batches (2 writes per lead = 400 ops, under 500 limit)
  let written = 0;
  let batchNum = 0;

  for (let i = 0; i < toRoute.length; i += BATCH_SIZE) {
    const chunk = toRoute.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    batchNum++;

    chunk.forEach(lead => {
      const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();

      // Write to lead_assignments (what the cockpit reads)
      const assignRef = db.collection('lead_assignments').doc();
      batch.set(assignRef, {
        masterLeadId:    lead.id,
        advisorUid:      masterAdvisor.id,
        ownerUid:        masterAdvisor.id,
        ownerEmail:      MASTER_EMAIL,
        ownerFirmName:   masterAdvisor.firmName || 'Fin-Tegration',

        // Lead identity
        firstName:       lead.firstName  || '',
        lastName:        lead.lastName   || '',
        fullName,
        title:           lead.credential || lead.specialty || lead.title || '',
        company:         lead.specialty  || lead.niche || '',

        // Location
        city:            lead.city       || '',
        state:           lead.state      || '',
        zip:             lead.zip        || '',
        propertyAddress: lead.propertyAddress || '',

        // Contact
        phone:           lead.phone      || '',
        email:           lead.email      || '',
        linkedInUrl:     lead.linkedInUrl || '',

        // Wealth signals
        homeValue:       lead.homeValue  || 0,
        assets:          lead.assets     || '',

        // Professional
        npiNumber:       lead.npiNumber  || '',
        credential:      lead.credential || '',
        specialty:       lead.specialty  || '',

        // Niche + scoring
        niche:           lead.niche      || '',
        nicheId:         lead.nicheId    || 'physicians',
        fitScore:        lead.fitScore   || 85,
        timingScore:     lead.timingScore || 72,
        priorityScore:   lead.priorityScore || lead.fitScore || 85,

        // Source
        source:          lead.source     || 'HennepinCounty_GIS_$1M+_Homestead',
        signals:         lead.signals    || [],
        tags:            lead.tags       || [],

        // Assignment metadata
        status:          'New',
        ownershipStatus: 'active',
        assignedAt:      now,
        routingMethod:   'route_production_to_master.js',
        routingScore:    99, // direct master assignment
        slaDeadline,
        replyType:       null,
        createdAt:       now,
        updatedAt:       now,
      });

      // Update master_leads doc
      batch.update(db.collection('master_leads').doc(lead.id), {
        ownershipStatus:  'assigned',
        currentOwnerUid:  masterAdvisor.id,
        currentOwnerFirm: masterAdvisor.firmName || 'Fin-Tegration',
        routedAt:         now,
        updatedAt:        now,
      });
    });

    await batch.commit();
    written += chunk.length;
    console.log(`  ✅ Batch ${batchNum} committed — ${written}/${toRoute.length}`);

    if (i + BATCH_SIZE < toRoute.length) await sleep(300);
  }

  // ── 6. Update pipeline meta ──────────────────────────────────────────
  const metaRef = db.collection('meta').doc('pipeline_stats');
  await metaRef.set({
    lastRoutedAt: now,
    lastRoutedCount: written,
    lastRoutedTo: MASTER_EMAIL,
    updatedAt: now,
  }, { merge: true });

  // ── 7. Summary ────────────────────────────────────────────────────────
  const byNiche = {};
  toRoute.forEach(l => { byNiche[l.nicheId] = (byNiche[l.nicheId] || 0) + 1; });

  const byVal = {
    '$3M+': toRoute.filter(l => l.homeValue >= 3000000).length,
    '$2M-3M': toRoute.filter(l => l.homeValue >= 2000000 && l.homeValue < 3000000).length,
    '$1M-2M': toRoute.filter(l => l.homeValue >= 1000000 && l.homeValue < 2000000).length,
  };

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ROUTING COMPLETE                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  ✅ Routed:    ${written} leads → ${MASTER_EMAIL}`);
  console.log(`  ⏭  Skipped:   ${skipped} (already assigned)`);
  console.log('\n  By niche:');
  Object.entries(byNiche).sort((a,b)=>b[1]-a[1]).forEach(([n,c]) => {
    console.log(`    ${n.padEnd(22)} ${c}`);
  });
  console.log('\n  By home value:');
  Object.entries(byVal).forEach(([v,c]) => {
    console.log(`    ${v.padEnd(12)} ${c}`);
  });
  console.log('\n  View in cockpit: https://theaumengine.web.app');
  console.log('  Filter by: enrichmentStatus = production-ready\n');

  process.exit(0);
}

main().catch(e => {
  console.error('[RouteToMaster] FATAL:', e.message);
  process.exit(1);
});
