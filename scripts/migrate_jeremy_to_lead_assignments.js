#!/usr/bin/env node
// =====================================================================
// Migrate Jeremy's al_assignments docs → lead_assignments
// The app (db.js Sprint 4) reads from lead_assignments only.
// Run: node scripts/migrate_jeremy_to_lead_assignments.js [--dry-run]
// =====================================================================
'use strict';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN    = process.argv.includes('--dry-run');
const JEREMY_UID = 'aRvvb3pm92ZZHCiqxJEsduWRbyx2';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   MIGRATE: al_assignments → lead_assignments (Jeremy)   ║');
  console.log(DRY_RUN ? '║   MODE: DRY RUN' : '║   MODE: LIVE');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Pull Jeremy's docs from al_assignments
  const alSnap = await db.collection('al_assignments')
    .where('ownerUid', '==', JEREMY_UID)
    .get();

  console.log(`  Found ${alSnap.docs.length} docs in al_assignments for Jeremy\n`);

  // Check what's already in lead_assignments to avoid dupes
  const existingSnap = await db.collection('lead_assignments')
    .where('ownerUid', '==', JEREMY_UID)
    .get();

  const alreadyMigrated = new Set(
    existingSnap.docs.map(d => d.data().masterLeadId).filter(Boolean)
  );
  console.log(`  Already in lead_assignments: ${existingSnap.docs.length}`);

  const toMigrate = alSnap.docs.filter(d =>
    !alreadyMigrated.has(d.data().masterLeadId)
  );
  console.log(`  To migrate:                  ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log('  ✅ Nothing to migrate — all already in lead_assignments.');
    process.exit(0);
  }

  let migrated = 0;
  const now = new Date().toISOString();

  for (const doc of toMigrate) {
    const data = doc.data();
    const leadName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || doc.id.slice(0, 12);

    if (DRY_RUN) {
      console.log(`  📋 DRY — ${leadName} (${data.nicheId}) | ${data.emailAddress || ''}`);
      migrated++;
      continue;
    }

    // Write to lead_assignments (canonical collection the app reads)
    await db.collection('lead_assignments').doc(doc.id).set({
      ...data,
      // Ensure both uid fields are present (db.js checks ownerUid)
      ownerUid:   JEREMY_UID,
      advisorUid: JEREMY_UID,
      migratedFromAlAssignments: true,
      migratedAt: now,
      updatedAt:  now,
    }, { merge: true });

    console.log(`  ✅ ${leadName} (${data.nicheId})`);
    migrated++;
  }

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  ${DRY_RUN ? 'DRY RUN' : 'MIGRATION'} COMPLETE — ${migrated} docs moved to lead_assignments`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`\n  Jeremy's lead_assignments total: ${existingSnap.docs.length + (DRY_RUN ? 0 : migrated)}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
