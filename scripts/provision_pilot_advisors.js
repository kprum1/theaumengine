// =====================================================================
// THE AUM ENGINE — PILOT ADVISOR PROVISIONING SCRIPT
// scripts/provision_pilot_advisors.js
// Run: node scripts/provision_pilot_advisors.js (from project root)
// Creates Firebase Auth accounts + Firestore advisor profiles for each pilot.
// =====================================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db   = admin.firestore();
const auth = admin.auth();

// ── Pilot Advisor Roster ─────────────────────────────────────────────────
const ADVISORS = [
  {
    firstName:   'Patrick',
    lastName:    'Wight',
    email:       'patrick@patrick.com',
    password:    'AUM2026!',
    firmName:    'Wight Financial',
    nicheIds:    ['business-owners', 'physicians'],
    geography:   'Phoenix, AZ',
    aumMin:      '$1M+',
    leadCap:     25,
    calendarCap: 8,
  },
  {
    firstName:   'Matt',
    lastName:    'Germshied',
    email:       'matt@matt.com',
    password:    'AUM2026!',
    firmName:    'Germshied Wealth Management',
    nicheIds:    ['business-owners', 'aircraft-owners'],
    geography:   'Chicago, IL',
    aumMin:      '$1M+',
    leadCap:     25,
    calendarCap: 8,
  },
  {
    firstName:   'Chuck',
    lastName:    'Cooper',
    email:       'chuck@chuck.com',
    password:    'AUM2026!',
    firmName:    'Cooper Capital Group',
    nicheIds:    ['ai-displaced-executives', 'business-owners'],
    geography:   'Dallas, TX',
    aumMin:      '$500K+',
    leadCap:     30,
    calendarCap: 10,
  },
  {
    firstName:   'Ray',
    lastName:    'Uncle',          // Placeholder last name
    email:       'ray@ray.com',
    password:    'AUM2026!',
    firmName:    'Ray Financial Advisors',
    nicheIds:    ['physicians', 'charity-board-members'],
    geography:   'Miami, FL',
    aumMin:      '$1M+',
    leadCap:     20,
    calendarCap: 6,
  },
  {
    firstName:   'Andy',
    lastName:    'Belly',
    email:       'andy@andy.com',
    password:    'AUM2026!',
    firmName:    'Duelly Outdoors / Belly Wealth',
    nicheIds:    ['aircraft-owners', 'business-owners'],
    geography:   'Denver, CO',
    aumMin:      '$500K+',
    leadCap:     20,
    calendarCap: 8,
  },
];

// ── Main Provisioning Loop ────────────────────────────────────────────────
async function provisionAdvisors() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — PILOT PROVISIONING               ║');
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
      // Create new account
      const userRecord = await auth.createUser({
        email:         advisor.email,
        password:      advisor.password,
        displayName:   `${advisor.firstName} ${advisor.lastName}`,
        emailVerified: true, // skip email verification for pilot
      });
      uid = userRecord.uid;
      console.log(`  ✓ Created Auth account (uid: ${uid})`);
    }

    // ── Step 2: Write Firestore advisor profile ─────────────────────────
    const advisorProfile = {
      uid,
      firstName:          advisor.firstName,
      lastName:           advisor.lastName,
      email:              advisor.email,
      firmName:           advisor.firmName,
      advisorType:        'Independent RIA',
      nicheIds:           advisor.nicheIds,
      geography:          advisor.geography,
      targetAUMBands:     [advisor.aumMin],
      serviceCapabilities:['Financial Planning', 'Investment Management', 'Estate Planning'],
      activeLeadCap:      advisor.leadCap,
      calendarCapacity:   advisor.calendarCap,
      officeLocations:    [{ city: advisor.geography.split(',')[0], state: advisor.geography.split(',')[1]?.trim() || '' }],
      licensedStates:     [advisor.geography.split(',')[1]?.trim() || 'AZ'],
      pilotAdvisor:       true,
      pilotCohort:        'Cohort-1-April-2026',
      eligibleForRouting: true,    // ← flag that processRoutingQueue checks
      routingTier:        'standard',
      createdAt:          new Date().toISOString(),
      updatedAt:          new Date().toISOString(),
    };

    // Write to users/{uid}/data/advisorProfile (same path db.js reads)
    await db
      .collection('users').doc(uid)
      .collection('data').doc('advisorProfile')
      .set(advisorProfile, { merge: true });
    console.log(`  ✓ Firestore advisorProfile written`);

    // ── Step 3: Write to global pilot_advisors registry ─────────────────
    await db.collection('pilot_advisors').doc(uid).set({
      uid,
      displayName:  `${advisor.firstName} ${advisor.lastName}`,
      email:        advisor.email,
      firmName:     advisor.firmName,
      nicheIds:     advisor.nicheIds,
      geography:    advisor.geography,
      leadCap:      advisor.leadCap,
      cohort:       'Cohort-1-April-2026',
      status:       'active',
      createdAt:    new Date().toISOString(),
    }, { merge: true });
    console.log(`  ✓ pilot_advisors registry updated`);

    // ── Step 4: Write to advisor_pool (used by routing engine) ──────────
    await db.collection('advisor_pool').doc(uid).set({
      uid,
      firmName:            advisor.firmName,
      nicheIds:            advisor.nicheIds,
      geography:           advisor.geography.split(',')[0].trim(),
      state:               advisor.geography.split(',')[1]?.trim() || '',
      aumMinimum:          advisor.aumMin,
      activeLeadCap:       advisor.leadCap,
      currentLeadCount:    0,
      calendarCapacity:    advisor.calendarCap,
      eligibleForRouting:  true,
      routingScore:        100,   // start fresh — governance will tune this
      updatedAt:           new Date().toISOString(),
    }, { merge: true });
    console.log(`  ✓ advisor_pool entry created (routing engine can assign leads)`);

    results.push({ name: `${advisor.firstName} ${advisor.lastName}`, email: advisor.email, uid });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PROVISIONING COMPLETE — PILOT CREDENTIALS     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('\nSend these credentials to each pilot advisor:\n');
  console.log('  Login URL:  https://www.theaumengine.com');
  console.log('  Password:   AUM2026!  (ask them to change on first login)\n');

  results.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.name}`);
    console.log(`     Email:   ${r.email}`);
    console.log(`     UID:     ${r.uid}`);
    console.log('');
  });

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   NEXT: Run processRoutingQueue to assign leads  ║');
  console.log('║   It runs every 5 min automatically, OR run:    ║');
  console.log('║   node scripts/trigger_routing.js               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  process.exit(0);
}

provisionAdvisors().catch(err => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
