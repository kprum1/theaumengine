#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Assign ALL Enriched Leads to Jeremy Steward
// scripts/assign_all_enriched_to_jeremy.js
//
// Assigns every unassigned lead that has an email to Jeremy (all niches).
// Also updates his advisor_pool nicheIds to ['all'] so future routing
// sends him enriched leads automatically.
//
// Run: node scripts/assign_all_enriched_to_jeremy.js [--dry-run]
// =====================================================================
'use strict';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN    = process.argv.includes('--dry-run');
const JEREMY_UID = 'aRvvb3pm92ZZHCiqxJEsduWRbyx2';
const LEAD_CAP   = 500;

function extractEmail(lead) {
  const raw = lead.emailAddress || lead.email || lead.workEmail || lead.personalEmail;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] || '';
  if (typeof raw === 'object') return raw.address || raw.value || raw.email || '';
  return '';
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — BULK ENRICHED ASSIGNMENT (Jeremy)        ║');
  console.log(DRY_RUN
    ? '║   MODE: DRY RUN (no writes)                              ║'
    : '║   MODE: LIVE (writing to Firestore)                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Expand Jeremy's niches to ALL + update cap/profile ──────────
  if (!DRY_RUN) {
    await db.collection('advisor_pool').doc(JEREMY_UID).set({
      nicheIds:           ['all'],
      activeLeadCap:      LEAD_CAP,
      requiresEmail:      true,
      updatedAt:          new Date().toISOString(),
    }, { merge: true });

    await db
      .collection('users').doc(JEREMY_UID)
      .collection('data').doc('advisorProfile')
      .set({ nicheIds: ['all'], updatedAt: new Date().toISOString() }, { merge: true });

    await db.collection('pilot_advisors').doc(JEREMY_UID).set({
      nicheIds: ['all'], updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log('  ✓ Jeremy nicheIds expanded to [all] across all collections');
    console.log(`  ✓ Lead cap: ${LEAD_CAP}\n`);
  }

  // ── Step 2: Check current assignments ────────────────────────────────────
  const existingSnap = await db.collection('al_assignments')
    .where('ownerUid', '==', JEREMY_UID)
    .get();
  const existingCount = existingSnap.docs.length;
  const alreadyAssigned = new Set(
    existingSnap.docs.map(d => d.data().masterLeadId).filter(Boolean)
  );
  const slotsAvailable = LEAD_CAP - existingCount;

  console.log(`  Current assignments: ${existingCount}`);
  console.log(`  Slots available:     ${slotsAvailable}\n`);

  if (slotsAvailable <= 0) {
    console.log('  ⚠️  Jeremy is at cap. Increase LEAD_CAP or remove existing assignments.\n');
    process.exit(0);
  }

  // ── Step 3: Pull ALL unassigned enriched leads ───────────────────────────
  console.log('  Scanning master_leads for enriched unassigned leads...\n');
  const allLeadsSnap = await db.collection('master_leads').get();

  const enrichedUnassigned = allLeadsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(lead => {
      const email = extractEmail(lead);
      const isUnassigned = (lead.ownershipStatus || '') !== 'assigned';
      const notAlreadyJeremy = !alreadyAssigned.has(lead.id);
      return email && isUnassigned && notAlreadyJeremy;
    })
    .sort((a, b) => {
      // Sort: action-ready (email+phone) first, then by fitScore desc
      const aPhone = !!(a.phone || a.phoneNumber || a.mobilePhone);
      const bPhone = !!(b.phone || b.phoneNumber || b.mobilePhone);
      if (aPhone && !bPhone) return -1;
      if (!aPhone && bPhone) return 1;
      return (b.fitScore || 70) - (a.fitScore || 70);
    });

  // Tally by niche for reporting
  const byNiche = {};
  enrichedUnassigned.forEach(l => {
    byNiche[l.nicheId] = (byNiche[l.nicheId] || 0) + 1;
  });

  console.log('  Enriched unassigned leads by niche:');
  Object.keys(byNiche).sort().forEach(n => {
    console.log(`     ${n.padEnd(28)} ${byNiche[n]}`);
  });

  const toAssign = enrichedUnassigned.slice(0, slotsAvailable);
  const actionReadyCount = toAssign.filter(l =>
    !!(l.phone || l.phoneNumber || l.mobilePhone)
  ).length;

  console.log(`\n  📋 Total enriched unassigned: ${enrichedUnassigned.length}`);
  console.log(`  📋 Assigning:                 ${toAssign.length} (cap: ${slotsAvailable})`);
  console.log(`  📋 Action-ready (e+ph):       ${actionReadyCount}\n`);

  if (toAssign.length === 0) {
    console.log('  ⚠️  No new enriched unassigned leads found.\n');
    process.exit(0);
  }

  // ── Step 4: Assign each lead ─────────────────────────────────────────────
  const now = new Date().toISOString();
  let assigned = 0;

  for (const lead of toAssign) {
    const leadName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.id.slice(0, 12);
    const email    = extractEmail(lead);
    const phone    = lead.phone || lead.phoneNumber || lead.mobilePhone || '';
    const actionReady = !!(phone);

    if (DRY_RUN) {
      const badge = actionReady ? '🎯 ACTION' : '📧 EMAIL ';
      console.log(`  ${badge} — ${leadName} (${lead.nicheId}) | ${email}${phone ? ' | ' + phone : ''}`);
      assigned++;
      continue;
    }

    const batch    = db.batch();
    const assignId = `route_${lead.id}_${JEREMY_UID}`.slice(0, 100);

    batch.set(db.collection('al_assignments').doc(assignId), {
      masterLeadId:    lead.id,
      ownerUid:        JEREMY_UID,
      advisorUid:      JEREMY_UID,
      ownerFirmName:   'Steward Financial',
      ownerEmail:      'Jsteward236@gmail.com',

      // Lead fields
      firstName:       lead.firstName   || '',
      lastName:        lead.lastName    || '',
      title:           lead.title       || '',
      company:         lead.company     || '',
      city:            lead.city        || '',
      state:           lead.state       || '',
      niche:           lead.niche       || lead.nicheId || '',
      nicheId:         lead.nicheId     || '',
      emailAddress:    email,
      phone:           phone,
      linkedInUrl:     lead.linkedInUrl  || '',
      fitScore:        lead.fitScore    || 70,
      timingScore:     lead.timingScore || 70,
      priorityScore:   lead.priorityScore || Math.round(((lead.fitScore || 70) + (lead.timingScore || 70)) / 2),
      reasonCodes:     lead.reasonCodes || [],
      signals:         lead.signals     || {},
      source:          lead.source      || '',
      estimatedAUM:    lead.estimatedAUM || '',
      enriched:        true,
      actionReady:     actionReady,

      // Assignment metadata
      status:          'New',
      ownershipStatus: 'active',
      assignedAt:      now,
      routingScore:    actionReady ? 95 : 85,
      routingReason:   actionReady
        ? 'Action-ready (email+phone) — enriched all-niche assignment'
        : 'Enriched (email) — bulk all-niche assignment',
      slaDeadline:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      batchId:         lead.batchId || '',
      createdAt:       now,
      updatedAt:       now,
    });

    batch.update(db.collection('master_leads').doc(lead.id), {
      ownershipStatus:   'assigned',
      currentOwnerUid:   JEREMY_UID,
      currentOwnerSince: now,
      updatedAt:         now,
    });

    await batch.commit();
    const badge = actionReady ? '🎯' : '✅';
    console.log(`  ${badge} ${leadName} (${lead.nicheId}) → Jeremy | ${email}${phone ? ' | ' + phone : ''}`);
    assigned++;
  }

  // ── Update Jeremy's currentLeadCount ────────────────────────────────────
  if (!DRY_RUN && assigned > 0) {
    await db.collection('advisor_pool').doc(JEREMY_UID).update({
      currentLeadCount: admin.firestore.FieldValue.increment(assigned),
      updatedAt:        now,
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const finalTotal = existingCount + (DRY_RUN ? 0 : assigned);
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ${DRY_RUN ? 'DRY RUN' : 'LIVE'} COMPLETE                                          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  New leads assigned:    ${assigned}`);
  console.log(`  Jeremy total:          ${finalTotal} leads`);
  console.log(`  Action-ready (e+ph):   ${actionReadyCount}`);
  console.log(`  Slots remaining:       ${LEAD_CAP - finalTotal}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
