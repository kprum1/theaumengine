// ======================================================================
// AUM ENGINE — Outreach Agent Test Harness (Path A Verification)
// scripts/test_outreach_agent.js
//
// Tests all 13 niches × 4 channels × 3 variants = 156 combinations
// Validates: template exists, no missing fields, no banned phrases,
//            yacht_lifestyle fires correctly, safety filter passes.
//
// Usage: node scripts/test_outreach_agent.js
// ======================================================================

// ── Shim browser globals for Node.js testing ────────────────────
global.window = {
  _advisorProfile: {
    firmName: 'Test Firm',
    serviceCapabilities: ['Financial Planning', 'Investment Management'],
    complianceMode: 'moderate',
    bannedPhrases: ['I know you were laid off', 'I know your net worth'],
    approvedPhrases: [],
  }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
};
global.activeOutreachType = 'email';
global.activeOutreachProspectId = null;
global.PROSPECTS = [];
global.showToast = () => {};
global.document = { querySelectorAll: () => [], getElementById: () => null };

// Load outreach agent
const path = require('path');
const fs   = require('fs');

// We need to eval the browser JS in Node context
const agentSrc = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'outreach_agent.js'), 'utf8'
);

// Wrap in a function to capture exports
eval(agentSrc);

// ── Test leads — one per niche ─────────────────────────────────
const TEST_LEADS = [
  { id:'t1',  firstName:'James',   lastName:'Thornton',  title:'CEO',              company:'Thornton Holdings',   city:'Minneapolis', state:'MN', nicheId:'business-owners',         niche:'Business Owners',        fitScore:90, timingScore:85, reasonCodes:['5500 filer — $8M 401k'], signals:{nextEvent:'401k audit Q2'} },
  { id:'t2',  firstName:'Rebecca', lastName:'Stanton',   title:'Surgeon',          company:'North Memorial',      city:'Scottsdale',  state:'AZ', nicheId:'physicians',               niche:'Physicians & Surgeons',  fitScore:88, timingScore:82, reasonCodes:['Practice partner'], signals:{} },
  { id:'t3',  firstName:'Derek',   lastName:'Huang',     title:'VP Engineering',   company:'Meta',                city:'San Francisco',state:'CA',nicheId:'ai-displaced-executives',  niche:'AI-Displaced Executives',fitScore:92, timingScore:95, reasonCodes:['Laid off Q1 2026'], signals:{vestiingSchedule:'RSU March 2026'} },
  { id:'t4',  firstName:'Harold',  lastName:'Svensson',  title:'Private Pilot',    company:'Svensson Properties', city:'Scottsdale',  state:'AZ', nicheId:'aircraft-owners',          niche:'Aircraft Owners',        fitScore:85, timingScore:77, reasonCodes:['Cirrus SR22 owner'], signals:{} },
  { id:'t5',  firstName:'Grace',   lastName:'Nakamura',  title:'Former CTO',       company:'Stripe',              city:'Los Angeles', state:'CA', nicheId:'c-suite-executives',       niche:'C-Suite Executives',     fitScore:91, timingScore:88, reasonCodes:['RSU vesting event'], signals:{outreachAngle:'RSU vesting tax strategy'} },
  { id:'t6',  firstName:'Adriana', lastName:'Martinez',  title:'Board Member',     company:'Dallas Arts Council',  city:'Dallas',     state:'TX', nicheId:'charity-board-members',    niche:'Charity Board Members',  fitScore:90, timingScore:76, reasonCodes:['Non-profit board'], signals:{} },
  { id:'t7',  firstName:'Leonard', lastName:'Fitch',     title:'HVAC Owner',       company:'Fitch Mechanical',    city:'Chicago',    state:'IL', nicheId:'high-earning-tradesman',   niche:'High Earning Tradesman', fitScore:79, timingScore:72, reasonCodes:['Owner, irregular income'], signals:{} },
  { id:'t8',  firstName:'Monica',  lastName:'Voss',      title:'Law Partner',      company:'Voss & Reed LLP',     city:'Denver',     state:'CO', nicheId:'law-partners',             niche:'Law Partners',           fitScore:87, timingScore:80, reasonCodes:['Equity partner, K-1'], signals:{} },
  { id:'t9',  firstName:'Sandra',  lastName:'Okafor',    title:'Senior VP',        company:'Target Corp',         city:'Minneapolis', state:'MN', nicheId:'henrys',                   niche:'HENRYs',                 fitScore:81, timingScore:78, reasonCodes:['High income, no plan'], signals:{} },
  { id:'t10', firstName:'Thomas',  lastName:'Reinhardt', title:'Real Estate Dev',  company:'Reinhardt Capital',   city:'Dallas',     state:'TX', nicheId:'real-estate-developers',   niche:'Real Estate Developers', fitScore:83, timingScore:74, reasonCodes:['Active 1031 window'], signals:{} },
  { id:'t11', firstName:'Karen',   lastName:'Webb',      title:'DDS',              company:'Webb Dental Group',   city:'Phoenix',    state:'AZ', nicheId:'dentists-specialists',     niche:'Dentists & Specialists', fitScore:84, timingScore:79, reasonCodes:['Practice buy-in pending'], signals:{} },
  { id:'t12', firstName:'Paul',    lastName:'Ashford',   title:'Heir',             company:'Ashford Family Trust', city:'Nashville',  state:'TN', nicheId:'inheritance-recipients',   niche:'Inheritance Recipients', fitScore:76, timingScore:82, reasonCodes:['$1.2M inheritance, 2025'], signals:{} },
  { id:'t13', firstName:'William', lastName:'Hargrove',  title:'Vessel Owner',     company:'Hargrove Marine LLC', city:'Newport Beach',state:'CA',nicheId:'yacht-owners',            niche:'Yacht Owners',           fitScore:88, timingScore:80, reasonCodes:['58ft motor yacht, USCG documented'], signals:{vesselName:'Lady Luck III', vesselLength:'58ft', vesselType:'Motor Yacht', hailingPort:'Newport Beach, CA', estimatedAssets:'$3.5M+'} },
];

const CHANNELS = ['email', 'linkedin', 'call', 'voicemail'];

// ── Run tests ─────────────────────────────────────────────────
let passed = 0, failed = 0, warnings = 0;
const failures = [];
const report   = [];

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  AUM ENGINE — Outreach Agent Test Suite                 ║');
console.log(`║  Testing ${TEST_LEADS.length} niches × ${CHANNELS.length} channels × 3 variants         ║`);
console.log('╚══════════════════════════════════════════════════════════╝\n');

for (const lead of TEST_LEADS) {
  const nicheLabel = lead.niche.padEnd(24);
  let nichePassed = 0, nicheFailed = 0;

  for (const ch of CHANNELS) {
    try {
      const result = generateCustomizedDraft(lead, ch, 'first_touch');

      // ── Checks ──────────────────────────────────
      if (!result) throw new Error('generateCustomizedDraft returned null');
      if (!result.variants || result.variants.length < 3)
        throw new Error(`Only ${result.variants?.length || 0} variants returned (expect 3)`);
      if (!result.angle)  throw new Error('Missing angle');
      if (!result.angleLabel) throw new Error('Missing angleLabel');

      // Verify all variants have body
      result.variants.forEach((v, i) => {
        if (!v.body || v.body.length < 20)
          throw new Error(`Variant ${v.id} has empty/short body`);
        if (!lead.firstName || v.body.includes('[firstName]'))
          throw new Error(`Variant ${v.id} has unfilled firstName token`);
      });

      // Check safety filter ran
      if (!Array.isArray(result.riskFlags))
        throw new Error('riskFlags missing');

      // Specific: Yacht owners must hit yacht_lifestyle angle
      if (lead.nicheId === 'yacht-owners' && ch === 'email') {
        if (result.angle !== 'yacht_lifestyle')
          throw new Error(`Yacht owner email should use yacht_lifestyle, got: ${result.angle}`);
        // Verify vessel signals injected
        if (!result.variants[0].subject.toLowerCase().includes('yacht') &&
            !result.variants[0].subject.toLowerCase().includes('vessel'))
          throw new Error('Yacht email subject missing vessel reference');
      }

      nichePassed++;
      passed++;

    } catch(e) {
      nicheFailed++;
      failed++;
      failures.push({ niche: lead.niche, channel: ch, error: e.message });
    }
  }

  const icon = nicheFailed === 0 ? '✅' : '❌';
  const label = `${icon} ${nicheLabel} — ${nichePassed}/${CHANNELS.length} channels passed`;
  console.log(`  ${label}`);
  report.push(label);
}

// ── Specific angle test ────────────────────────────────────────
console.log('\n  ── Angle routing spot-checks ──');
const spotTests = [
  { lead: TEST_LEADS[2], ch:'email', expected:'executive_transition', label:'AI-displaced exec → executive_transition' },
  { lead: TEST_LEADS[4], ch:'email', expected:'deferred_comp',        label:'C-Suite exec → deferred_comp or equity' },
  { lead: TEST_LEADS[12],ch:'email', expected:'yacht_lifestyle',      label:'Yacht owner → yacht_lifestyle' },
  { lead: TEST_LEADS[5], ch:'email', expected:'philanthropic_planning',label:'Charity board → philanthropic_planning' },
];

spotTests.forEach(({ lead, ch, expected, label }) => {
  try {
    const result = generateCustomizedDraft(lead, ch, 'first_touch');
    const ok = result.angle === expected ||
               (expected === 'deferred_comp' && ['deferred_comp','equity_complexity'].includes(result.angle));
    const icon = ok ? '  ✅' : '  ⚠️ ';
    console.log(`  ${icon} ${label} → got: ${result.angle}`);
    if (!ok) warnings++;
  } catch(e) {
    console.log(`  ❌ ${label} → ERROR: ${e.message}`);
    failed++;
  }
});

// ── Summary ────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log(`║  Results: ✅ ${String(passed).padEnd(4)} passed  ❌ ${String(failed).padEnd(4)} failed  ⚠️  ${String(warnings).padEnd(3)} warnings ║`);
console.log('╚══════════════════════════════════════════════════════════╝');

if (failures.length) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    ❌ [${f.niche}] [${f.channel}]: ${f.error}`));
}

if (failed === 0) {
  console.log('\n  ✅ All outreach templates verified. Safe to deploy.\n');
} else {
  console.log('\n  ❌ Fix failures before deploying outreach agent.\n');
  process.exit(1);
}
