#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Jeremy Steward Provisioning Script
// scripts/provision_jeremy_steward.js
//
// Run: node scripts/provision_jeremy_steward.js
// =====================================================================

'use strict';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db   = admin.firestore();
const auth = admin.auth();

// ── Advisors to provision ─────────────────────────────────────────────────
// Add staff members below by duplicating the Jeremy entry with their details
const ADVISORS = [
  {
    firstName:   'Jeremy',
    lastName:    'Steward',
    email:       'Jsteward236@gmail.com',
    password:    'js2026',
    firmName:    'Steward Financial',   // ← UPDATE if firm name is different
    nicheIds:    ['henrys', 'physicians', 'business-owners'],
    geography:   'Minneapolis, MN',     // ← UPDATE if different
    aumMin:      '$1M+',
    leadCap:     50,
    calendarCap: 10,
    cohort:      'Cohort-2-May-2026',
  },
  // ── Jeremy's staff (add entries here) ────────────────────────────────
  // {
  //   firstName:   'Staff',
  //   lastName:    'Name',
  //   email:       'staff@gmail.com',
  //   password:    'js2026',
  //   firmName:    'Steward Financial',
  //   nicheIds:    ['henrys', 'physicians', 'business-owners'],
  //   geography:   'Minneapolis, MN',
  //   aumMin:      '$1M+',
  //   leadCap:     25,
  //   calendarCap: 8,
  //   cohort:      'Cohort-2-May-2026',
  // },
];

// ── Main Provisioning Loop ────────────────────────────────────────────────
async function provisionAdvisors() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — JEREMY STEWARD PROVISIONING      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const results = [];

  for (const advisor of ADVISORS) {
    console.log(`\n→ Provisioning: ${advisor.firstName} ${advisor.lastName} <${advisor.email}>`);

    // ── Step 1: Create or get Firebase Auth account ─────────────────────
    let uid;
    try {
      const existing = await auth.getUserByEmail(advisor.email);
      uid = existing.uid;
      console.log(`  ✓ Auth account already exists (uid: ${uid})`);
    } catch (notFound) {
      const userRecord = await auth.createUser({
        email:         advisor.email,
        password:      advisor.password,
        displayName:   `${advisor.firstName} ${advisor.lastName}`,
        emailVerified: true,
      });
      uid = userRecord.uid;
      console.log(`  ✓ Firebase Auth account created (uid: ${uid})`);
    }

    // ── Step 2: Firestore advisor profile ───────────────────────────────
    const advisorProfile = {
      uid,
      firstName:           advisor.firstName,
      lastName:            advisor.lastName,
      email:               advisor.email,
      firmName:            advisor.firmName,
      advisorType:         'Independent RIA',
      nicheIds:            advisor.nicheIds,
      geography:           advisor.geography,
      targetAUMBands:      [advisor.aumMin],
      serviceCapabilities: ['Financial Planning', 'Investment Management', 'Estate Planning'],
      activeLeadCap:       advisor.leadCap,
      calendarCapacity:    advisor.calendarCap,
      officeLocations:     [{ city: advisor.geography.split(',')[0], state: advisor.geography.split(',')[1]?.trim() || '' }],
      licensedStates:      [advisor.geography.split(',')[1]?.trim() || 'MN'],
      pilotAdvisor:        true,
      pilotCohort:         advisor.cohort,
      eligibleForRouting:  true,
      routingTier:         'standard',
      createdAt:           new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
    };

    await db
      .collection('users').doc(uid)
      .collection('data').doc('advisorProfile')
      .set(advisorProfile, { merge: true });
    console.log(`  ✓ users/{uid}/data/advisorProfile written`);

    // ── Step 3: pilot_advisors registry ─────────────────────────────────
    await db.collection('pilot_advisors').doc(uid).set({
      uid,
      displayName: `${advisor.firstName} ${advisor.lastName}`,
      email:       advisor.email,
      firmName:    advisor.firmName,
      nicheIds:    advisor.nicheIds,
      geography:   advisor.geography,
      leadCap:     advisor.leadCap,
      cohort:      advisor.cohort,
      status:      'active',
      createdAt:   new Date().toISOString(),
    }, { merge: true });
    console.log(`  ✓ pilot_advisors registry updated`);

    // ── Step 4: advisor_pool (routing engine) ───────────────────────────
    await db.collection('advisor_pool').doc(uid).set({
      uid,
      firmName:           advisor.firmName,
      nicheIds:           advisor.nicheIds,
      geography:          advisor.geography.split(',')[0].trim(),
      state:              advisor.geography.split(',')[1]?.trim() || '',
      aumMinimum:         advisor.aumMin,
      activeLeadCap:      advisor.leadCap,
      currentLeadCount:   0,
      calendarCapacity:   advisor.calendarCap,
      eligibleForRouting: true,
      routingScore:       100,
      updatedAt:          new Date().toISOString(),
    }, { merge: true });
    console.log(`  ✓ advisor_pool entry created (routing engine ready)`);

    results.push({ name: `${advisor.firstName} ${advisor.lastName}`, email: advisor.email, uid });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PROVISIONING COMPLETE ✅                       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('\n  Login URL:  https://theaumengine.web.app');
  console.log('  Password:   js2026  ← have Jeremy change this\n');

  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name}`);
    console.log(`     Email:  ${r.email}`);
    console.log(`     UID:    ${r.uid}`);
    console.log('');
  });

  console.log('  NEXT: Run routing to assign leads to Jeremy:');
  console.log('  node scripts/trigger_routing.js\n');

  process.exit(0);
}

provisionAdvisors().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
