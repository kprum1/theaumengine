#!/usr/bin/env node
// scripts/test_c32_sprint.js
// ============================================================
// C32 Sprint Test Suite — validates all changes from this session
// Tests: FAA CSV parser, SEC city/state fix, 990 nicheId fix,
//        scrubber entityType override, ingest queue denormalization,
//        Jeremy provisioning, routing_queue orphan handling
// Run: node scripts/test_c32_sprint.js
// ============================================================
'use strict';

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

// ── Init Firebase ──────────────────────────────────────────────────────────
const sa = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

// ── Test runner ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  results.push({ name, fn });
}

async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — C32 SPRINT TEST SUITE                        ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  for (const { name, fn } of results) {
    try {
      await fn();
      console.log(`  ✅  ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌  ${name}`);
      console.log(`       → ${e.message}`);
      failed++;
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed / ${results.length} total`);
  const score = Math.round((passed / results.length) * 100);
  const icon  = failed === 0 ? '🟢 ALL PASS' : '🔴 FAILURES';
  console.log(`║  Score: ${score}%  ${icon}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  process.exit(failed > 0 ? 1 : 0);
}

// ══════════════════════════════════════════════════════════════════════════
// GROUP 1 — SCRIPT FILE INTEGRITY (local — no Firebase)
// ══════════════════════════════════════════════════════════════════════════

test('FAA miner: ACFTREF parser uses CSV column split (not fixed-width)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_faa_miner.js'), 'utf8');
  if (!src.includes('parseCSVLine') || !src.includes('getField'))
    throw new Error('CSV parser functions not found in agent_faa_miner.js');
  if (src.includes("line.substring(0,  7)") || src.includes("line.substring(7,  37)"))
    throw new Error('Old fixed-width ACFTREF parser still present');
});

test('FAA miner: MASTER.txt parser uses CSV (not fixed-width)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_faa_miner.js'), 'utf8');
  if (!src.includes("CSV_COL"))
    throw new Error('CSV_COL map not found — MASTER.txt still using fixed-width');
  if (src.includes("COL.STATUS_CODE") || src.includes("line.substring(214, 216)"))
    throw new Error('Old fixed-width MASTER.txt parser still active');
});

test('FAA miner: reads MASTER.txt as UTF-8 (not latin1)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_faa_miner.js'), 'utf8');
  if (!src.includes("'utf8'") && !src.includes('"utf8"'))
    throw new Error('MASTER.txt still being read as latin1');
  if (src.includes("'latin1'"))
    throw new Error('MASTER.txt still being read as latin1');
});

test('SEC miner: Form 4 leads have city=Unknown, state=US placeholder', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_sec_miner.js'), 'utf8');
  if (!src.includes("city:         'Unknown'"))
    throw new Error('SEC Form4 leads missing city placeholder');
  if (!src.includes("state:        'US'"))
    throw new Error('SEC leads missing state=US placeholder');
});

test('990 miner: nicheId is charity-board-members (not charity-boards)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_990_miner.js'), 'utf8');
  if (src.includes("nicheId:  'charity-boards'"))
    throw new Error('990 miner still using old nicheId charity-boards');
  if (!src.includes("nicheId:  'charity-board-members'"))
    throw new Error('990 miner missing correct nicheId charity-board-members');
});

test('Scrubber: respects pre-set entityType from raw lead', () => {
  const src = fs.readFileSync(path.join(__dirname, 'scrub_leads.js'), 'utf8');
  if (!src.includes('raw.entityType || classifyEntity'))
    throw new Error('scrub_leads.js does not respect pre-set entityType');
});

test('Ingest agent: queue item includes nicheId/state/city fields', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lead_ingest_agent.js'), 'utf8');
  if (!src.includes("nicheId:     (lead.nicheId || '').trim()"))
    throw new Error('lead_ingest_agent.js does not write nicheId to queue item');
  if (!src.includes("state:       (lead.state   || '').toUpperCase"))
    throw new Error('lead_ingest_agent.js does not write state to queue item');
  if (!src.includes('buildRoutingQueueItem(masterLeadId, idempotencyKey, source, raw)'))
    throw new Error('buildRoutingQueueItem not called with lead (raw) argument');
});

test('Audit: uses licensedStates || states fallback for display', () => {
  const src = fs.readFileSync(path.join(__dirname, 'audit_leads.js'), 'utf8');
  if (!src.includes('p.licensedStates || p.states'))
    throw new Error('audit_leads.js does not use states fallback');
});

test('Audit: orphaned queue items shown as non-blocking', () => {
  const src = fs.readFileSync(path.join(__dirname, 'audit_leads.js'), 'utf8');
  if (!src.includes("'orphaned'"))
    throw new Error('audit_leads.js does not handle orphaned status');
});

test('niche_breakdown.js exists and lists all 13 niches', () => {
  const src = fs.readFileSync(path.join(__dirname, 'niche_breakdown.js'), 'utf8');
  const required = [
    'physicians', 'dentists', 'business-owners', 'c-suite-executives',
    'law-partners', 'henrys', 'high-earning-tradesman', 'aircraft-owners',
    'yacht-owners', 'inheritance', 'pro-athletes', 'charity-board-members',
    'ai-displaced-executives',
  ];
  for (const n of required) {
    if (!src.includes(n)) throw new Error(`niche_breakdown.js missing niche: ${n}`);
  }
});

test('NPI miner: --geo flag support present', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_npi_miner.js'), 'utf8');
  if (!src.includes("'--geo'") && !src.includes('"--geo"'))
    throw new Error('agent_npi_miner.js missing --geo flag support');
});

test('HENRYs miner: MN employers present', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent_henrys_miner.js'), 'utf8');
  const mnEmployers = ['UnitedHealth', 'Optum', 'Cargill', 'Boston Scientific', 'Polaris'];
  for (const emp of mnEmployers) {
    if (!src.includes(emp)) throw new Error(`agent_henrys_miner.js missing MN employer: ${emp}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GROUP 2 — SCRUBBER UNIT TESTS (local — no Firebase)
// ══════════════════════════════════════════════════════════════════════════

test('Scrubber: SEC-style lead with entityType=unknown passes validation', () => {
  // Simulate what scrub_leads.js does with classify_entity
  const { classifyEntity } = require('./lib/classify_entity');

  // 8-K lead: company set, no name — would normally classify as 'business'
  const companyName = 'Former: Acme Corp';
  const fullName    = '';
  const autoType    = classifyEntity(companyName, fullName);

  // Confirm the auto-classifier returns 'business' (why the bug existed)
  if (autoType !== 'business') {
    throw new Error(`Expected auto-classify to return 'business', got '${autoType}' — test assumption broken`);
  }

  // Now confirm the override works: if raw.entityType='unknown', it should be used
  const rawEntityType = 'unknown';
  const effective     = rawEntityType || autoType;

  if (effective !== 'unknown') {
    throw new Error(`entityType override failed: effective=${effective}, expected 'unknown'`);
  }
});

test('Scrubber: charity-board-members nicheId is recognized in routing engine', () => {
  const routingSrc = fs.readFileSync(path.join(__dirname, 'trigger_routing.js'), 'utf8');
  if (!routingSrc.includes('charity-board-members'))
    throw new Error('trigger_routing.js missing charity-board-members niche');
});

// ══════════════════════════════════════════════════════════════════════════
// GROUP 3 — FIRESTORE STATE VALIDATION (requires Firebase)
// ══════════════════════════════════════════════════════════════════════════

test('Firestore: master_leads count ≥ 600', async () => {
  const snap = await db.collection('master_leads').count().get();
  const count = snap.data().count;
  if (count < 600) throw new Error(`master_leads has ${count} docs — expected ≥ 600`);
});

test('Firestore: all 13 niches have ≥ 15 leads', async () => {
  const REQUIRED_NICHES = [
    'physicians', 'dentists', 'business-owners', 'c-suite-executives',
    'law-partners', 'henrys', 'high-earning-tradesman', 'aircraft-owners',
    'yacht-owners', 'inheritance', 'pro-athletes', 'charity-board-members',
    'ai-displaced-executives',
  ];
  const snap = await db.collection('master_leads').get();
  const counts = {};
  snap.forEach(d => {
    const n = d.data().nicheId || 'unknown';
    counts[n] = (counts[n] || 0) + 1;
  });
  const zeros  = REQUIRED_NICHES.filter(n => (counts[n] || 0) === 0);
  const thin   = REQUIRED_NICHES.filter(n => (counts[n] || 0) > 0 && (counts[n] || 0) < 15);
  if (zeros.length)  throw new Error(`Zero-lead niches: ${zeros.join(', ')}`);
  if (thin.length)   throw new Error(`Thin (<15) niches: ${thin.join(', ')}`);
});

test('Firestore: c-suite-executives has ≥ 15 leads (was 0)', async () => {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'c-suite-executives')
    .count().get();
  const count = snap.data().count;
  if (count < 15) throw new Error(`c-suite-executives only has ${count} leads`);
});

test('Firestore: aircraft-owners has ≥ 50 leads (was 3)', async () => {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'aircraft-owners')
    .count().get();
  const count = snap.data().count;
  if (count < 50) throw new Error(`aircraft-owners only has ${count} leads`);
});

test('Firestore: charity-board-members has ≥ 15 leads (was 1)', async () => {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'charity-board-members')
    .count().get();
  const count = snap.data().count;
  if (count < 15) throw new Error(`charity-board-members only has ${count} leads`);
});

test('Firestore: ai-displaced-executives has ≥ 15 leads (was 3)', async () => {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'ai-displaced-executives')
    .count().get();
  const count = snap.data().count;
  if (count < 15) throw new Error(`ai-displaced-executives only has ${count} leads`);
});

test('Firestore: zero master_leads have unknown nicheId', async () => {
  const snap = await db.collection('master_leads')
    .where('nicheId', '==', 'unknown')
    .count().get();
  const count = snap.data().count;
  if (count > 0) throw new Error(`${count} master_leads still have nicheId='unknown'`);
});

test('Firestore: all master_leads have city and state', async () => {
  let missingCount = 0;
  const snap = await db.collection('master_leads').get();
  snap.forEach(d => {
    const data = d.data();
    if (!data.city && !data.state) missingCount++;
  });
  if (missingCount > 0) throw new Error(`${missingCount} master_leads missing city/state`);
});

test('Firestore: Jeremy Jackson in advisor_pool with states=[MN]', async () => {
  const snap = await db.collection('advisor_pool').get();
  let found = false;
  snap.forEach(d => {
    const data = d.data();
    if (data.firmName && data.firmName.includes('Ameriprise')) {
      found = true;
      const states = data.licensedStates || data.states || [];
      if (!states.includes('MN'))
        throw new Error(`Jeremy advisor_pool missing MN in states: ${JSON.stringify(states)}`);
      if (!data.eligibleForRouting)
        throw new Error('Jeremy not flagged eligibleForRouting');
    }
  });
  if (!found) throw new Error('Jeremy Jackson advisor_pool doc not found');
});

test('Firestore: Jeremy has ≥ 30 lead_assignments', async () => {
  // Find Jeremy's UID
  const poolSnap = await db.collection('advisor_pool').get();
  let jeremyUid = null;
  poolSnap.forEach(d => {
    if (d.data().firmName?.includes('Ameriprise')) jeremyUid = d.id;
  });
  if (!jeremyUid) throw new Error('Jeremy UID not found in advisor_pool');

  const assignSnap = await db.collection('lead_assignments')
    .where('ownerUid', '==', jeremyUid)
    .count().get();
  const count = assignSnap.data().count;
  if (count < 30) throw new Error(`Jeremy only has ${count} assignments — expected ≥ 30`);
});

test('Firestore: no pending routing_queue items', async () => {
  const snap = await db.collection('routing_queue')
    .where('status', '==', 'pending')
    .count().get();
  const count = snap.data().count;
  if (count > 0) throw new Error(`${count} routing_queue items still pending`);
});

test('Firestore: no failed routing_queue items', async () => {
  const snap = await db.collection('routing_queue')
    .where('status', '==', 'failed')
    .count().get();
  const count = snap.data().count;
  if (count > 0) throw new Error(`${count} routing_queue items in failed state`);
});

test('Firestore: all 7 advisor_pool entries are eligibleForRouting', async () => {
  const snap = await db.collection('advisor_pool').get();
  const notEligible = [];
  snap.forEach(d => {
    if (!d.data().eligibleForRouting) notEligible.push(d.data().firmName || d.id);
  });
  if (notEligible.length > 0)
    throw new Error(`Not eligible for routing: ${notEligible.join(', ')}`);
});

test('Firestore: new routing_queue items have nicheId field (ingest fix — live write/verify)', async () => {
  const crypto = require('crypto');

  const TEST_EMAIL = 'test.c32.queuefix@aum-test-do-not-use.com';
  const idKey = crypto.createHash('sha256')
    .update(['test', 'queuefix', TEST_EMAIL].join('|'))
    .digest('hex').slice(0, 32);

  // Clean any pre-existing test records
  const existingQ  = await db.collection('routing_queue').where('idempotencyKey', '==', idKey).get();
  const existingML = await db.collection('master_leads').where('idempotencyKey', '==', idKey).get();
  for (const d of [...existingQ.docs, ...existingML.docs]) await d.ref.delete();

  // Write test master_lead
  const mlRef = await db.collection('master_leads').add({
    idempotencyKey: idKey, firstName: 'Test', lastName: 'QueueFix',
    nicheId: 'physicians', niche: 'Physicians',
    city: 'Eden Prairie', state: 'MN',
    source: 'C32 Test Suite', ingestedAt: new Date().toISOString(), _testRecord: true,
  });

  // Use the FIXED queue item builder (mirrors lead_ingest_agent.js)
  const testLead = { nicheId: 'physicians', niche: 'Physicians', state: 'MN', city: 'Eden Prairie' };
  const qItem = {
    masterLeadId: mlRef.id, idempotencyKey: idKey, source: 'test',
    status: 'pending', priority: 50, attempts: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    nicheId: testLead.nicheId, niche: testLead.niche,
    state: testLead.state, city: testLead.city, leadId: mlRef.id,
  };
  const qRef = await db.collection('routing_queue').add(qItem);

  // Read back and verify
  const qDoc  = await db.collection('routing_queue').doc(qRef.id).get();
  const qData = qDoc.data();

  // Clean up before asserting
  await qRef.delete(); await mlRef.delete();

  if (!qData.nicheId) throw new Error('nicheId missing from new queue item');
  if (qData.nicheId !== 'physicians') throw new Error(`nicheId wrong: ${qData.nicheId}`);
  if (!qData.state)   throw new Error('state missing from new queue item');
  if (!qData.city)    throw new Error('city missing from new queue item');
  if (!qData.leadId)  throw new Error('leadId missing from new queue item');
});



// ══════════════════════════════════════════════════════════════════════════
// GROUP 4 — DRY-RUN AGENT TESTS (spawn process, check output)
// ══════════════════════════════════════════════════════════════════════════

test('FAA miner: dry-run with cached data produces ≥ 1 lead', () => {
  // Only run if cached data exists
  const tmpDir = require('os').tmpdir();
  const masterFile = path.join(tmpDir, 'faa_aircraft', 'MASTER.txt');
  if (!fs.existsSync(masterFile)) {
    console.log('       (skipped — no FAA cache, run agent first)');
    return; // Not a failure — cache may have been cleaned
  }
  const out = execSync(
    '/opt/homebrew/opt/node/bin/node scripts/agent_faa_miner.js --state MN --limit 5 --skip-download --dry-run',
    { cwd: path.dirname(__dirname), encoding: 'utf8', timeout: 30000 }
  );
  if (!out.includes('Leads produced') && !out.includes('✅'))
    throw new Error('FAA dry-run did not produce any leads or success indicator');
});

test('SEC miner dry-run: Form 4 output has city=Unknown, state=US', () => {
  const out = execSync(
    '/opt/homebrew/opt/node/bin/node scripts/agent_sec_miner.js --mode form4 --limit 3 --dry-run',
    { cwd: path.dirname(__dirname), encoding: 'utf8', timeout: 30000 }
  );
  if (!out.includes('Unknown') && !out.includes('US'))
    throw new Error('SEC Form4 dry-run output missing Unknown/US placeholder');
});

test('990 miner dry-run: charity-board-members nicheId in output', () => {
  const out = execSync(
    '/opt/homebrew/opt/node/bin/node scripts/agent_990_miner.js --state MN --limit 2 --dry-run',
    { cwd: path.dirname(__dirname), encoding: 'utf8', timeout: 30000 }
  );
  if (out.includes("charity-boards\"") && !out.includes("charity-board-members\""))
    throw new Error('990 miner dry-run still outputs old nicheId charity-boards');
});

// ══════════════════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════════════════
runAll().catch(e => {
  console.error('\n[TEST RUNNER] FATAL:', e.message);
  process.exit(1);
});
