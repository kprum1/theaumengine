#!/usr/bin/env node
// =====================================================================
// THE AUM ENGINE — Jeremy Jackson Provisioning Script
// scripts/provision_jeremy.js
//
// Provisions Jeremy Jackson (Private Wealth Advisor, Ameriprise — Wayzata MN)
// into all three Firestore collections + Firebase Auth.
//
// Run: node scripts/provision_jeremy.js
// =====================================================================

'use strict';

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db   = admin.firestore();
const auth = admin.auth();

// ── Jeremy Jackson Profile ────────────────────────────────────────────
const JEREMY = {
  advisorId:   'jeremy_jackson_ampf',

  // Auth
  email:       'Jeremy.Jackson@ampf.com',
  password:    'AUM2026!',
  displayName: 'Jeremy Jackson',

  // Personal
  firstName:   'Jeremy',
  lastName:    'Jackson',
  firmName:    'Ameriprise Financial — Wayzata',
  advisorType: 'Wirehouse — Private Wealth Advisor',
  phone:       '612.486.0311',

  // Office
  officeAddress: '701 Lake St E Ste 290, Wayzata MN 55391',
  profileUrl:    'https://www.ameripriseadvisors.com/Jeremy.Jackson/',

  // Niche coverage — full western suburbs UHNW stack
  nicheIds: [
    'physicians',
    'dentists',
    'business-owners',
    'c-suite-executives',
    'law-partners',
    'henrys',
    'high-earning-tradesman',
    'aircraft-owners',
    'yacht-owners',
    'inheritance',
  ],

  // Geographic focus — western MN suburbs (Jeremy's home territory)
  geoFocus: {
    cities: [
      'Wayzata', 'Minnetonka', 'Edina', 'Eden Prairie', 'Plymouth',
      'Orono', 'Excelsior', 'Deephaven', 'Minnetrista', 'Chaska', 'Chanhassen',
      'Spring Park', 'Medina', 'Maple Plain', 'Shorewood', 'Tonka Bay',
    ],
    counties: ['Hennepin', 'Carver'],
    zips: [
      '55391',                        // Wayzata
      '55356', '55364',               // Orono / Minnetrista
      '55305', '55343', '55345',      // Minnetonka
      '55424', '55435', '55436',      // Edina
      '55344', '55346', '55347',      // Eden Prairie
      '55441', '55446', '55447',      // Plymouth
      '55331',                        // Excelsior / Deephaven / Shorewood
      '55318',                        // Chaska
      '55317',                        // Chanhassen
      '55359',                        // Medina
    ],
  },

  // Routing config
  states:          ['MN'],
  geography:       'Wayzata',    // primary city for advisor_pool routing
  state:           'MN',
  aumMin:          '$1M+',
  maxLeads:        500,
  activeLeadCap:   500,
  calendarCap:     20,

  // Metadata
  status:        'active',
  tier:          'pilot',
  cohort:        'Cohort-1-April-2026',
  pilotAdvisor:  true,
};

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — JEREMY JACKSON PROVISIONING              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Advisor:  ${JEREMY.displayName}`);
  console.log(`  Firm:     ${JEREMY.firmName}`);
  console.log(`  Email:    ${JEREMY.email}`);
  console.log(`  Office:   ${JEREMY.officeAddress}`);
  console.log(`  Territory: ${JEREMY.geoFocus.cities.slice(0, 5).join(', ')} + ${JEREMY.geoFocus.cities.length - 5} more`);
  console.log(`  Niches:   ${JEREMY.nicheIds.join(', ')}`);
  console.log('');

  // ── Step 1: Create or retrieve Firebase Auth account ─────────────
  let uid;
  try {
    const existing = await auth.getUserByEmail(JEREMY.email);
    uid = existing.uid;
    console.log(`  ✓ Auth account already exists (uid: ${uid})`);
  } catch {
    const userRecord = await auth.createUser({
      email:         JEREMY.email,
      password:      JEREMY.password,
      displayName:   JEREMY.displayName,
      emailVerified: true,
    });
    uid = userRecord.uid;
    console.log(`  ✓ Firebase Auth account created (uid: ${uid})`);
  }

  // ── Step 2: Advisor profile (users/{uid}/data/advisorProfile) ────
  const advisorProfile = {
    uid,
    firstName:           JEREMY.firstName,
    lastName:            JEREMY.lastName,
    email:               JEREMY.email,
    phone:               JEREMY.phone,
    firmName:            JEREMY.firmName,
    advisorType:         JEREMY.advisorType,
    profileUrl:          JEREMY.profileUrl,
    officeAddress:       JEREMY.officeAddress,
    nicheIds:            JEREMY.nicheIds,
    geography:           JEREMY.geography,
    geoFocus:            JEREMY.geoFocus,
    states:              JEREMY.states,
    targetAUMBands:      [JEREMY.aumMin],
    serviceCapabilities: [
      'Private Wealth Management', 'Investment Management',
      'Estate Planning', 'Retirement Income Planning', 'Tax Strategy',
    ],
    activeLeadCap:       JEREMY.activeLeadCap,
    calendarCapacity:    JEREMY.calendarCap,
    officeLocations:     [{ city: 'Wayzata', state: 'MN' }],
    licensedStates:      JEREMY.states,
    pilotAdvisor:        JEREMY.pilotAdvisor,
    pilotCohort:         JEREMY.cohort,
    eligibleForRouting:  true,
    routingTier:         'standard',
    advisorId:           JEREMY.advisorId,
    createdAt:           new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
  };

  await db
    .collection('users').doc(uid)
    .collection('data').doc('advisorProfile')
    .set(advisorProfile, { merge: true });
  console.log('  ✓ users/{uid}/data/advisorProfile written');

  // ── Step 3: Global pilot_advisors registry ───────────────────────
  await db.collection('pilot_advisors').doc(uid).set({
    uid,
    advisorId:   JEREMY.advisorId,
    displayName: JEREMY.displayName,
    email:       JEREMY.email,
    phone:       JEREMY.phone,
    firmName:    JEREMY.firmName,
    advisorType: JEREMY.advisorType,
    nicheIds:    JEREMY.nicheIds,
    geography:   JEREMY.geography,
    geoFocus:    JEREMY.geoFocus,
    states:      JEREMY.states,
    leadCap:     JEREMY.maxLeads,
    cohort:      JEREMY.cohort,
    status:      JEREMY.status,
    tier:        JEREMY.tier,
    createdAt:   new Date().toISOString(),
  }, { merge: true });
  console.log('  ✓ pilot_advisors registry written');

  // ── Step 4: advisor_pool (routing engine reads this) ────────────
  await db.collection('advisor_pool').doc(uid).set({
    uid,
    advisorId:           JEREMY.advisorId,
    firmName:            JEREMY.firmName,
    nicheIds:            JEREMY.nicheIds,
    geography:           JEREMY.geography,
    state:               JEREMY.state,
    geoFocus:            JEREMY.geoFocus,
    states:              JEREMY.states,
    aumMinimum:          JEREMY.aumMin,
    activeLeadCap:       JEREMY.activeLeadCap,
    currentLeadCount:    0,
    calendarCapacity:    JEREMY.calendarCap,
    eligibleForRouting:  true,
    routingScore:        100,
    updatedAt:           new Date().toISOString(),
  }, { merge: true });
  console.log('  ✓ advisor_pool entry created (routing engine ready)');

  // ── Final summary ────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   JEREMY JACKSON PROVISIONED ✅                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Name:     ${JEREMY.displayName}`);
  console.log(`  UID:      ${uid}`);
  console.log(`  Email:    ${JEREMY.email}`);
  console.log(`  Password: ${JEREMY.password}  (have him change on first login)`);
  console.log(`  Login:    https://theaumengine.web.app`);
  console.log(`  Profile:  ${JEREMY.profileUrl}`);
  console.log(`\n  Lead cap: ${JEREMY.maxLeads}`);
  console.log(`  Niches:   ${JEREMY.nicheIds.length} (${JEREMY.nicheIds.join(', ')})`);
  console.log(`  States:   ${JEREMY.states.join(', ')}`);
  console.log(`  Territory: Wayzata / Minnetonka / Edina / Eden Prairie / Plymouth`);
  console.log(`             Orono / Excelsior / Deephaven / Chaska / Chanhassen`);
  console.log('\n  ── NEXT STEPS ──────────────────────────────────────────');
  console.log('  1. Run trigger_routing → leads will auto-assign to Jeremy');
  console.log('     node scripts/trigger_routing.js');
  console.log('  2. Mine geo-focused physicians/dentists for MN:');
  console.log('     node scripts/agent_npi_miner.js --niche physicians --state MN --limit 50');
  console.log('  3. Mine FCM aircraft owners (Eden Prairie, MN):');
  console.log('     node scripts/agent_faa_miner.js --state MN --zip-prefix 553 --limit 50');
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
