// ============================================================
// AUM ENGINE — al_assignments Location Backfill
// scripts/patch_al_location.js
//
// Run: node scripts/patch_al_location.js (from project root)
//
// Reads all al_assignments docs, fetches the corresponding
// masterLeads doc (or master_leads doc) to get city/state,
// and writes city + state back to the al_assignment doc.
//
// Idempotent: skips docs that already have both fields.
// ============================================================

'use strict';

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function patchAlLocation() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   al_assignments — city/state backfill          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const snap = await db.collection('al_assignments').get();
  console.log(`Found ${snap.size} al_assignment docs.\n`);

  let patched  = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const doc of snap.docs) {
    const a = doc.data();

    // Already has both fields — skip
    if (a.city && a.state) {
      skipped++;
      continue;
    }

    let city  = a.city  || a.homeCity  || a.prospect_city  || '';
    let state = a.state || a.homeState || a.prospect_state || '';

    // If still missing, try to pull from masterLeads (camelCase collection)
    if ((!city || !state) && a.masterLeadId) {
      try {
        // Try masterLeads first (batch-ingest path)
        const mlSnap = await db.collection('masterLeads').doc(a.masterLeadId).get();
        if (mlSnap.exists) {
          const ml = mlSnap.data();
          city  = city  || ml.city  || ml.homeCity  || ml.prospect_city  || '';
          state = state || ml.state || ml.homeState || ml.prospect_state || '';
        }
      } catch(e) { /* collection may not exist */ }

      // Fallback: try master_leads (snake_case CF path)
      if (!city || !state) {
        try {
          const mlSnap2 = await db.collection('master_leads').doc(a.masterLeadId).get();
          if (mlSnap2.exists) {
            const ml2 = mlSnap2.data();
            city  = city  || ml2.city  || '';
            state = state || ml2.state || '';
          }
        } catch(e) { /* ignore */ }
      }
    }

    if (!city && !state) {
      console.warn(`  ⚠️  No location found for al_assignment ${doc.id} (masterLeadId: ${a.masterLeadId})`);
      failed++;
      continue;
    }

    try {
      await doc.ref.update({
        city:      city  || '',
        state:     state || '',
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ Patched ${doc.id} → ${city}, ${state}`);
      patched++;
    } catch(e) {
      console.error(`  ✗ Failed to patch ${doc.id}:`, e.message);
      failed++;
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log(`  Patched : ${patched}`);
  console.log(`  Skipped : ${skipped} (already had city/state)`);
  console.log(`  Failed  : ${failed}`);
  console.log('──────────────────────────────────────────────────\n');
  process.exit(0);
}

patchAlLocation().catch(e => {
  console.error('[ERROR]', e.message || e);
  process.exit(1);
});
