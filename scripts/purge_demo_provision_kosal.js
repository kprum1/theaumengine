'use strict';
// purge_demo_provision_kosal.js
// 1. Deletes prospects collection (112 synthetic Alfred Wealth Trigger Miner leads)
// 2. Deletes al_assignments collection (30 frozen archive synthetic leads)
// 3. Provisions Kosal (kosal@fin-tegration.com) as advisor in advisor_pool
// 4. Re-routes all 432 pipeline leads to include Kosal's ownerUid

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const KOSAL_UID  = 'FvEWqsETjbU602nLfHaJUaUkWkS2';
const KOSAL_NAME = 'Kosal P';
const KOSAL_FIRM = 'Fin-Tegration Consulting';

// ── Helper: delete entire collection in batches ───────────────
async function deleteCollection(colName) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(colName).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`  Deleting ${colName}: ${deleted} deleted...\r`);
  }
  console.log(`  ✅ ${colName}: ${deleted} docs deleted`);
  return deleted;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Purge Demo + Provision Kosal               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── STEP 1: Purge prospects ───────────────────────────────────
  console.log('STEP 1: Purging synthetic prospects collection...');
  await deleteCollection('prospects');

  // ── STEP 2: Purge al_assignments ──────────────────────────────
  console.log('STEP 2: Purging al_assignments archive...');
  await deleteCollection('al_assignments');

  // ── STEP 3: Provision Kosal in advisor_pool ───────────────────
  console.log('\nSTEP 3: Provisioning Kosal in advisor_pool...');
  const now = new Date().toISOString();

  await db.collection('advisor_pool').doc(KOSAL_UID).set({
    uid:                KOSAL_UID,
    name:               KOSAL_NAME,
    firmName:           KOSAL_FIRM,
    email:              'kosal@fin-tegration.com',
    eligibleForRouting: true,
    activeLeadCap:      500,
    currentLeadCount:   0,
    nicheIds:           [
      'physicians', 'dentists', 'business-owners', 'real-estate-developers',
      'law-partners', 'charity-board-members', 'aircraft-owners',
      'ai-displaced-executives', 'yacht-owners', 'real-estate-investors',
    ],
    licensedStates:     ['all'],
    role:               'operator-advisor',
    provisionedAt:      now,
    createdAt:          now,
    updatedAt:          now,
  }, { merge: true });

  console.log(`  ✅ advisor_pool/${KOSAL_UID} provisioned (Kosal — Fin-Tegration Consulting)`);

  // ── STEP 4: Create lead_assignments for Kosal from all master_leads ────
  console.log('\nSTEP 4: Creating lead assignments for Kosal from all 410 master_leads...');

  const masterSnap = await db.collection('master_leads').get();
  console.log(`  Found ${masterSnap.size} master_leads docs`);

  // Check which ones already have an assignment for Kosal
  const existingSnap = await db.collection('lead_assignments')
    .where('ownerUid', '==', KOSAL_UID)
    .get();
  const existingMasterIds = new Set();
  existingSnap.forEach(d => {
    const mid = d.data().masterLeadId;
    if (mid) existingMasterIds.add(mid);
  });
  console.log(`  Existing Kosal assignments: ${existingSnap.size}`);

  let created = 0;
  let skipped = 0;
  const toCreate = [];

  masterSnap.forEach(d => {
    if (d.id === '_schema') return; // skip sentinel
    if (existingMasterIds.has(d.id)) { skipped++; return; }
    const lead = d.data();
    if (!lead.nicheId && !lead.niche) { skipped++; return; } // skip schema/junk docs
    toCreate.push({ masterLeadId: d.id, lead });
  });

  console.log(`  Will create: ${toCreate.length} | Skip existing: ${skipped}`);

  const BATCH_SIZE = 400;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ masterLeadId, lead }) => {
      const ref = db.collection('lead_assignments').doc();
      batch.set(ref, {
        masterLeadId,
        masterLeadRef:   db.collection('master_leads').doc(masterLeadId),
        ownerUid:        KOSAL_UID,
        ownerFirmName:   KOSAL_FIRM,
        ownershipStatus: 'active',
        advisorStatus:   'New',
        assignedAt:      now,
        slaDeadline:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        finalScore:      lead.fitScore    ? lead.fitScore / 100    : 0.75,
        timingScore:     lead.timingScore ? lead.timingScore / 100 : 0.65,
        source:          lead.source || 'AUM Engine Pipeline',
        createdAt:       now,
        updatedAt:       now,
      });
    });
    await batch.commit();
    created += chunk.length;
    process.stdout.write(`  Creating assignments: ${created}/${toCreate.length}...\r`);
  }

  console.log(`\n  ✅ Created ${created} lead_assignments for Kosal`);

  // ── STEP 5: Update Kosal's currentLeadCount ───────────────────
  const totalKosal = existingSnap.size + created;
  await db.collection('advisor_pool').doc(KOSAL_UID).update({
    currentLeadCount: totalKosal,
    updatedAt: now,
  });
  console.log(`  ✅ advisor_pool currentLeadCount updated: ${totalKosal}`);

  // ── STEP 6: Final count ───────────────────────────────────────
  console.log('\n── Verification ──────────────────────────────────────────');
  const prospectsLeft = await db.collection('prospects').get();
  const alLeft        = await db.collection('al_assignments').get();
  const kosaLAssign   = await db.collection('lead_assignments').where('ownerUid','==',KOSAL_UID).get();

  console.log(`  prospects remaining:    ${prospectsLeft.size} (should be 0)`);
  console.log(`  al_assignments remaining: ${alLeft.size} (should be 0)`);
  console.log(`  Kosal lead_assignments:   ${kosaLAssign.size}`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ DONE — Log in as kosal@fin-tegration.com to verify   ║');
  console.log('║  Cockpit should now show ALL pipeline leads (not 139)    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
