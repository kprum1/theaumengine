#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Assign Enriched Leads to Jeremy Steward
// scripts/assign_enriched_to_jeremy.js
//
// Queries master_leads for:
//   - nicheId IN ['henrys', 'physicians', 'business-owners']
//   - Has email (emailAddress != null)
//   - ownershipStatus == 'unassigned'
//
// Assigns up to 500 leads to Jeremy Steward's advisor_pool UID.
// Run: node scripts/assign_enriched_to_jeremy.js [--dry-run]
// =====================================================================

'use strict';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN    = process.argv.includes('--dry-run');
const JEREMY_UID = 'aRvvb3pm92ZZHCiqxJEsduWRbyx2';  // from provisioning output
const NICHES     = ['henrys', 'physicians', 'business-owners'];
const LEAD_CAP   = 500;

// Email fields to check — different leads may store email in different fields
// Normalize: some fields stored as objects/arrays instead of plain strings
function extractEmail(lead) {
  const raw = lead.emailAddress || lead.email || lead.workEmail || lead.personalEmail;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] || '';
  if (typeof raw === 'object') return raw.address || raw.value || raw.email || '';
  return '';
}

function hasEmail(lead) {
  return !!extractEmail(lead);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — ENRICHED LEAD ASSIGNMENT (Jeremy)        ║');
  console.log(DRY_RUN
    ? '║   MODE: DRY RUN (no writes)                              ║'
    : '║   MODE: LIVE (writing to Firestore)                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Target UID:  ${JEREMY_UID}`);
  console.log(`  Niches:      ${NICHES.join(', ')}`);
  console.log(`  Lead Cap:    ${LEAD_CAP}`);
  console.log(`  Filter:      enriched only (has email)\n`);

  // ── Step 1: Update Jeremy's advisor_pool cap to 500 ─────────────────────
  if (!DRY_RUN) {
    await db.collection('advisor_pool').doc(JEREMY_UID).set({
      activeLeadCap:    LEAD_CAP,
      requiresEmail:    true,   // flag for future routing engine enforcement
      updatedAt:        new Date().toISOString(),
    }, { merge: true });
    console.log(`  ✓ advisor_pool cap updated to ${LEAD_CAP}, requiresEmail: true\n`);
  }

  // ── Step 2: Check how many leads Jeremy already has ──────────────────────
  const existingSnap = await db.collection('al_assignments')
    .where('ownerUid', '==', JEREMY_UID)
    .get();
  const existingCount = existingSnap.docs.length;
  const slotsAvailable = LEAD_CAP - existingCount;

  console.log(`  ✓ Jeremy currently has ${existingCount} assigned leads`);
  console.log(`  ✓ Slots available: ${slotsAvailable}\n`);

  if (slotsAvailable <= 0) {
    console.log('  ⚠️  Jeremy is already at or over cap. Exiting.');
    process.exit(0);
  }

  // Build set of already-assigned masterLeadIds to avoid duplicates
  const alreadyAssigned = new Set(existingSnap.docs.map(d => d.data().masterLeadId).filter(Boolean));

  // ── Step 3: Pull enriched leads from each niche ──────────────────────────
  let collected = [];

  for (const niche of NICHES) {
    console.log(`  → Querying niche: ${niche}...`);

    // Query unassigned leads in this niche
    const snap = await db.collection('master_leads')
      .where('nicheId', '==', niche)
      .where('ownershipStatus', '==', 'unassigned')
      .get();

    const nicheLeads = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(lead => hasEmail(lead) && !alreadyAssigned.has(lead.id));

    console.log(`     Found ${snap.docs.length} unassigned — ${nicheLeads.length} have email ✅`);
    collected.push(...nicheLeads);
  }

  // Sort by fitScore desc (best leads first), then cap at slotsAvailable
  collected.sort((a, b) => (b.fitScore || 70) - (a.fitScore || 70));
  const toAssign = collected.slice(0, slotsAvailable);

  console.log(`\n  📋 Total enriched leads found: ${collected.length}`);
  console.log(`  📋 Assigning: ${toAssign.length} (capped at available slots)\n`);

  if (toAssign.length === 0) {
    console.log('  ⚠️  No enriched unassigned leads found in target niches.');
    console.log('  → Run smart_enrich_router.js to enrich more leads first.\n');
    process.exit(0);
  }

  // ── Step 4: Assign each lead ─────────────────────────────────────────────
  const now = new Date().toISOString();
  let assigned = 0;

  for (const lead of toAssign) {
    const leadName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.id.slice(0, 12);
    const email    = extractEmail(lead);

    if (DRY_RUN) {
      console.log(`  📋 DRY — ${leadName} (${lead.nicheId}) | email: ${email}`);
      assigned++;
      continue;
    }

    const batch     = db.batch();
    const assignId  = `route_${lead.id}_${JEREMY_UID}`.slice(0, 100);

    // Write al_assignment
    batch.set(db.collection('al_assignments').doc(assignId), {
      masterLeadId:    lead.id,
      ownerUid:        JEREMY_UID,
      advisorUid:      JEREMY_UID,
      ownerFirmName:   'Steward Financial',
      ownerEmail:      'Jsteward236@gmail.com',

      // Lead fields
      firstName:       lead.firstName  || '',
      lastName:        lead.lastName   || '',
      title:           lead.title      || '',
      company:         lead.company    || '',
      city:            lead.city       || '',
      state:           lead.state      || '',
      niche:           lead.niche      || lead.nicheId || '',
      nicheId:         lead.nicheId    || '',
      emailAddress:    email,
      phone:           lead.phone      || lead.phoneNumber || '',
      linkedInUrl:     lead.linkedInUrl || '',
      fitScore:        lead.fitScore   || 70,
      timingScore:     lead.timingScore || 70,
      priorityScore:   lead.priorityScore || Math.round(((lead.fitScore || 70) + (lead.timingScore || 70)) / 2),
      reasonCodes:     lead.reasonCodes || [],
      signals:         lead.signals    || {},
      source:          lead.source     || '',
      estimatedAUM:    lead.estimatedAUM || '',
      enriched:        true,

      // Assignment metadata
      status:          'New',
      ownershipStatus: 'active',
      assignedAt:      now,
      routingScore:    85,   // enriched leads get higher base score
      routingReason:   'Enriched-only assignment — has email | Niche match',
      slaDeadline:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      batchId:         lead.batchId || '',
      createdAt:       now,
      updatedAt:       now,
    });

    // Mark master_lead as assigned
    batch.update(db.collection('master_leads').doc(lead.id), {
      ownershipStatus:   'assigned',
      currentOwnerUid:   JEREMY_UID,
      currentOwnerSince: now,
      updatedAt:         now,
    });

    await batch.commit();

    console.log(`  ✅ ${leadName} (${lead.nicheId}) → Jeremy | ${email}`);
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
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ${DRY_RUN ? 'DRY RUN' : 'LIVE'} COMPLETE — Assigned: ${String(assigned).padEnd(34)} ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Jeremy now has: ${existingCount + (DRY_RUN ? 0 : assigned)} assigned enriched leads`);
  console.log(`  Lead cap:       ${LEAD_CAP}`);
  console.log(`  Remaining:      ${LEAD_CAP - existingCount - (DRY_RUN ? 0 : assigned)} slots\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
