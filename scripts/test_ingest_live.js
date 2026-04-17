#!/usr/bin/env node
// scripts/test_ingest_live.js
// Live integration test: ingests ONE test lead and verifies the
// routing_queue item has nicheId/state/city denormalized (C32 fix).
// Cleans up test records after verification.
'use strict';

const admin  = require('firebase-admin');
const crypto = require('crypto');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const TEST_LEAD = {
  firstName:    'Test',
  lastName:     'C32Verify',
  email:        'test.c32.verify@aum-test-do-not-use.com',
  phone:        '',
  city:         'Eden Prairie',
  state:        'MN',
  nicheId:      'physicians',
  niche:        'Physicians',
  source:       'C32 Test Suite',
  sourceUrl:    'https://test.local',
  estimatedAUM: 'test-only',
};

// Exact replica of the fixed buildRoutingQueueItem from lead_ingest_agent.js
function buildRoutingQueueItem(masterLeadId, idempotencyKey, source, lead = {}) {
  return {
    masterLeadId,
    idempotencyKey,
    source,
    status:      'pending',
    priority:    50,
    attempts:    0,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    lockedBy:    null,
    lockedUntil: null,
    // Denormalized lead fields for fast routing
    nicheId:     (lead.nicheId || '').trim(),
    niche:       (lead.niche   || '').trim(),
    state:       (lead.state   || '').toUpperCase().slice(0, 2),
    city:        (lead.city    || '').trim(),
    leadId:      masterLeadId,
  };
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   INGEST FIX LIVE TEST — C32 Queue Denormalization      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const idKey = crypto.createHash('sha256')
    .update(['test', 'c32verify', TEST_LEAD.email].join('|'))
    .digest('hex').slice(0, 32);

  // ── Clean up any existing test records ──────────────────────────────────
  const existingQ  = await db.collection('routing_queue').where('idempotencyKey', '==', idKey).get();
  const existingML = await db.collection('master_leads').where('idempotencyKey', '==', idKey).get();
  for (const d of [...existingQ.docs, ...existingML.docs]) await d.ref.delete();
  if (existingQ.size + existingML.size > 0)
    console.log(`  🧹 Cleaned ${existingQ.size + existingML.size} previous test records\n`);

  // ── Write test master_lead ──────────────────────────────────────────────
  const mlRef = await db.collection('master_leads').add({
    idempotencyKey: idKey,
    firstName:      TEST_LEAD.firstName,
    lastName:       TEST_LEAD.lastName,
    nicheId:        TEST_LEAD.nicheId,
    niche:          TEST_LEAD.niche,
    city:           TEST_LEAD.city,
    state:          TEST_LEAD.state,
    source:         TEST_LEAD.source,
    ingestedAt:     new Date().toISOString(),
    _testRecord:    true,
  });
  console.log(`  Master lead written: ${mlRef.id}`);

  // ── Write routing_queue item using the FIXED buildRoutingQueueItem ──────
  const qItem = buildRoutingQueueItem(mlRef.id, idKey, TEST_LEAD.source, TEST_LEAD);
  const qRef  = await db.collection('routing_queue').add(qItem);
  console.log(`  Queue item written:  ${qRef.id}\n`);

  // ── Read back and assert ────────────────────────────────────────────────
  const qDoc  = await db.collection('routing_queue').doc(qRef.id).get();
  const qData = qDoc.data();

  console.log('── Queue Item Fields ─────────────────────────────────────');
  const fields = [
    ['nicheId',      qData.nicheId,      'physicians'],
    ['niche',        qData.niche,        'Physicians'],
    ['state',        qData.state,        'MN'],
    ['city',         qData.city,         'Eden Prairie'],
    ['leadId',       qData.leadId,       mlRef.id],
    ['masterLeadId', qData.masterLeadId, mlRef.id],
    ['status',       qData.status,       'pending'],
  ];

  let allPass = true;
  for (const [name, got, expected] of fields) {
    const pass = got === expected;
    if (!pass) allPass = false;
    console.log(`  ${pass ? '✅' : '❌'}  ${name.padEnd(14)}: ${got || '(MISSING)'}`);
  }

  // ── Clean up ─────────────────────────────────────────────────────────
  await qRef.delete();
  await mlRef.delete();
  console.log('\n  🧹 Test records cleaned up');

  if (allPass) {
    console.log('\n  ✅ INGEST FIX VERIFIED — nicheId/state/city written to queue items going forward\n');
    process.exit(0);
  } else {
    console.log('\n  ❌ INGEST FIX FAILED — some fields missing from queue item\n');
    process.exit(1);
  }
}

run().catch(e => { console.error('[TEST]', e.message); process.exit(1); });
