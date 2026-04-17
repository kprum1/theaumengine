// =====================================================================
// THE AUM ENGINE — ADVISOR NICHE PATCH SCRIPT
// scripts/patch_advisor_niches.js
// Sprint C29 — Unblocks routing for A10, A11, A12, A13 batches
//
// Adds missing niches to existing pilot advisors via Firestore merge:
//   henrys                → Fin-Tegration Consulting (kosal@fin-tegration.com)
//   high-earning-tradesman → Fin-Tegration Consulting (kosal@fin-tegration.com)
//   pro-athletes          → Cooper Capital Group + Fin-Tegration
//   inheritance           → Ray Financial Advisors + Fin-Tegration
//
// Run: node scripts/patch_advisor_niches.js (from project root)
// =====================================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Niche patches: match by firmName (advisor_pool docs are UID-keyed) ─
const NICHE_PATCHES = [
  // Fin-Tegration (Kosal) — unlimited, gets ALL new niches
  {
    firmName: 'Fin-Tegration Consulting',
    addNiches: ['henrys', 'high-earning-tradesman', 'pro-athletes', 'inheritance', 'c-suite-executives'],
    note: 'Operator account — receives all new niches for routing coverage',
  },
  // Cooper Capital Group (Chuck) — add pro-athletes, inheritance
  {
    firmName: 'Cooper Capital Group',
    addNiches: ['pro-athletes', 'inheritance', 'c-suite-executives'],
    note: 'Dallas TX — suited for pro athletes (DFW market) and inheritance',
  },
  // Ray Financial Advisors — add inheritance (Miami FL, probate-heavy market)
  {
    firmName: 'Ray Financial Advisors',
    addNiches: ['inheritance', 'pro-athletes'],
    note: 'Miami FL — probate/inheritance is a high-volume FL market',
  },
  // Wight Financial — add henrys, high-earning-tradesman, inheritance
  {
    firmName: 'Wight Financial',
    addNiches: ['henrys', 'high-earning-tradesman', 'inheritance', 'pro-athletes'],
    note: 'Phoenix AZ — AZ probate coverage needed for Maricopa batch',
  },
  // Duelly Outdoors / Belly Wealth — add pro-athletes, inheritance
  {
    firmName: 'Duelly Outdoors / Belly Wealth',
    addNiches: ['pro-athletes', 'inheritance', 'high-earning-tradesman'],
    note: 'Denver CO — outdoors/lifestyle brand — athletes and tradesman fit',
  },
  // Germshied Wealth Management — add henrys, high-earning-tradesman
  {
    firmName: 'Germshied Wealth Management',
    addNiches: ['henrys', 'high-earning-tradesman', 'c-suite-executives'],
    note: 'Chicago IL — high-tech / exec market (HENRYs + C-Suite)',
  },
];

async function patchAdvisorNiches() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — ADVISOR NICHE PATCH (Sprint C29)         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log('Adding missing niches to unblock A10/A11/A12/A13 routing...\n');

  // ── Preload all advisor_pool docs once ───────────────────────────────
  const allPoolSnap = await db.collection('advisor_pool').get();
  const poolDocsByFirm = {};
  allPoolSnap.forEach(doc => {
    const d = doc.data();
    if (d.firmName) poolDocsByFirm[d.firmName] = { doc, id: doc.id };
  });

  for (const patch of NICHE_PATCHES) {
    console.log(`\n→ Patching: ${patch.firmName}`);
    console.log(`  Adding niches: ${patch.addNiches.join(', ')}`);
    console.log(`  Reason: ${patch.note}`);

    // ── Find by firmName ──────────────────────────────────────────────
    const match = poolDocsByFirm[patch.firmName];

    if (!match) {
      console.log(`  ⚠️  Could not find advisor_pool entry for "${patch.firmName}" — skipping`);
      console.log(`  Available firms: ${Object.keys(poolDocsByFirm).join(', ')}`);
      continue;
    }

    const advisorPoolDoc = match.doc;
    const advisorPoolId  = match.id;

    const currentData  = advisorPoolDoc.data();
    const currentNiches = currentData.nicheIds || [];
    const combined     = [...new Set([...currentNiches, ...patch.addNiches])];
    const added        = combined.filter(n => !currentNiches.includes(n));

    console.log(`  Current niches: [${currentNiches.join(', ')}]`);
    console.log(`  New niches:     [${combined.join(', ')}]`);
    console.log(`  Net additions:  [${added.join(', ')}]`);

    if (added.length === 0) {
      console.log(`  ✅ All target niches already present — no patch needed`);
      continue;
    }

    // ── Patch advisor_pool ────────────────────────────────────────────
    await db.collection('advisor_pool').doc(advisorPoolId).update({
      nicheIds:  combined,
      updatedAt: new Date().toISOString(),
    });
    console.log(`  ✅ advisor_pool updated`);

    // ── Patch pilot_advisors registry ────────────────────────────────
    try {
      await db.collection('pilot_advisors').doc(advisorPoolId).update({
        nicheIds:  combined,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✅ pilot_advisors registry updated`);
    } catch (err) {
      console.log(`  ℹ️  pilot_advisors entry not found (may be keyed differently) — skipping`);
    }

    // ── Patch users/{uid}/data/advisorProfile ─────────────────────────
    try {
      const profileSnap = await db.collection('users').doc(advisorPoolId)
        .collection('data').doc('advisorProfile').get();
      if (profileSnap.exists) {
        const profNiches = profileSnap.data().nicheIds || [];
        const profCombined = [...new Set([...profNiches, ...patch.addNiches])];
        await db.collection('users').doc(advisorPoolId)
          .collection('data').doc('advisorProfile').update({
            nicheIds:  profCombined,
            updatedAt: new Date().toISOString(),
          });
        console.log(`  ✅ advisorProfile subcollection updated`);
      }
    } catch (err) {
      console.log(`  ℹ️  advisorProfile subcollection not accessible — continuing`);
    }
  }

  // ── Final niche coverage report ───────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   POST-PATCH NICHE COVERAGE REPORT                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const targetNiches = ['henrys', 'high-earning-tradesman', 'pro-athletes', 'inheritance', 'c-suite-executives'];
  const allPool = await db.collection('advisor_pool').get();

  const coverageMap = {};
  targetNiches.forEach(n => coverageMap[n] = []);

  allPool.forEach(doc => {
    const d = doc.data();
    const niches = d.nicheIds || [];
    niches.forEach(n => {
      if (targetNiches.includes(n)) {
        coverageMap[n].push(d.firmName || doc.id);
      }
    });
  });

  let allCovered = true;
  targetNiches.forEach(niche => {
    const advisors = coverageMap[niche];
    const icon = advisors.length > 0 ? '✅' : '❌';
    if (advisors.length === 0) allCovered = false;
    console.log(`  ${icon} ${niche.padEnd(28)} → ${advisors.length} advisor(s): ${advisors.join(', ') || 'NONE — routing will fail!'}`);
  });

  console.log('\n');
  if (allCovered) {
    console.log('  🟢 All 5 target niches now have advisor coverage.');
    console.log('  → Run: node scripts/audit_leads.js to verify 10/10');
  } else {
    console.log('  🔴 Some niches still have no coverage — routing will fail for those batches.');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   NEXT STEPS:                                            ║');
  console.log('║   1. node scripts/audit_leads.js                         ║');
  console.log('║   2. node scripts/lead_ingest_agent.js \\                  ║');
  console.log('║      --file scripts/staging/scrubbed/                    ║');
  console.log('║      alfred_batch_probate_real_2026-04-17.scrubbed.json  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

patchAdvisorNiches().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
