#!/usr/bin/env node
// ============================================================
// AUM ENGINE — LeadIngestAgent
// scripts/lead_ingest_agent.js
// ============================================================
// PURPOSE: Admin-side script to ingest a raw lead into the
//          global platform Layer 1. Enforces idempotency so
//          the same Alfred drop / CSV row cannot create a
//          duplicate routing_queue item.
//
// USAGE (from AdvDiamondMining/):
//   node scripts/lead_ingest_agent.js --file ./data/leads.json
//   node scripts/lead_ingest_agent.js --single '{"firstName":"John",...}'
//
// REQUIRES: Firebase Admin SDK service account key at:
//           scripts/serviceAccountKey.json
//           (never commit this file — it's in .gitignore)
// ============================================================

const admin  = require('firebase-admin');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Init Firebase Admin ────────────────────────────────────
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('[LeadIngestAgent] ❌ serviceAccountKey.json not found at', keyPath);
  console.error('  Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key');
  process.exit(1);
}
const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Normalise helpers ──────────────────────────────────────
function normalizeName(str) {
  return (str || '').trim().toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizePhone(str) {
  return (str || '').replace(/\D/g, '').slice(-10); // last 10 digits
}

function normalizeEmail(str) {
  return (str || '').trim().toLowerCase();
}

/**
 * Compute a stable idempotency key from the core identity fields.
 * Same person → same key, regardless of source.
 */
function computeIdempotencyKey(lead) {
  const parts = [
    normalizeName(lead.firstName),
    normalizeName(lead.lastName),
    normalizeEmail(lead.email),
    normalizePhone(lead.phone),
  ].filter(Boolean);

  if (parts.length < 2) {
    throw new Error(`Lead missing sufficient identity fields: ${JSON.stringify(lead)}`);
  }
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

// ── Schema ─────────────────────────────────────────────────
function buildMasterLead(raw, idempotencyKey, source) {
  const now = new Date().toISOString();
  return {
    idempotencyKey,

    // Identity
    firstName:    (raw.firstName  || '').trim(),
    lastName:     (raw.lastName   || '').trim(),
    email:        normalizeEmail(raw.email || ''),
    phone:        normalizePhone(raw.phone || ''),
    linkedInUrl:  (raw.linkedInUrl || '').trim(),

    // Demographics / wealth signals
    title:        (raw.title       || '').trim(),
    company:      (raw.company     || '').trim(),
    city:         (raw.city        || '').trim(),
    state:        (raw.state       || '').toUpperCase().slice(0, 2),
    estimatedAUM: raw.estimatedAUM || null,
    niche:        (raw.niche       || '').trim(),
    nicheId:      (raw.nicheId     || '').trim(),

    // Signals
    signals:      raw.signals      || {},
    reasonCodes:  raw.reasonCodes  || [],
    fitScore:     raw.fitScore     || null,
    timingScore:  raw.timingScore  || null,

    // Provenance
    source,
    rawPayload:   raw,
    ingestedAt:   now,
    updatedAt:    now,

    // Ownership (set by OwnershipAgent, not here)
    ownershipStatus:   'unassigned',  // unassigned | assigned | in_review | released | void
    currentOwnerUid:   null,
    currentOwnerSince: null,
  };
}

function buildRoutingQueueItem(masterLeadId, idempotencyKey, source) {
  return {
    masterLeadId,
    idempotencyKey,
    source,
    status:      'pending',   // pending | processing | assigned | failed
    priority:    50,          // 0-100, overridden by ScoringAgent
    attempts:    0,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    lockedBy:    null,
    lockedUntil: null,
  };
}

// ── Core ingest function ────────────────────────────────────
async function ingestLead(raw, source = 'script') {
  // 1. Compute idempotency key
  let idempotencyKey;
  try {
    idempotencyKey = computeIdempotencyKey(raw);
  } catch(e) {
    return { status: 'error', reason: e.message, lead: raw };
  }

  // 2. Check routing_queue for duplicate (idempotency gate)
  const existing = await db.collection('routing_queue')
    .where('idempotencyKey', '==', idempotencyKey)
    .where('status', 'in', ['pending', 'processing', 'assigned'])
    .limit(1)
    .get();

  if (!existing.empty) {
    console.log(`  ⏭  SKIP — already queued: ${raw.firstName} ${raw.lastName} (${idempotencyKey})`);
    return { status: 'skipped', reason: 'duplicate_in_queue', idempotencyKey };
  }

  // 3. Check master_leads for existing record (global dedup)
  const masterExists = await db.collection('master_leads')
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
    .get();

  let masterLeadId;
  if (!masterExists.empty) {
    masterLeadId = masterExists.docs[0].id;
    console.log(`  ♻️  EXISTS in master — re-queuing: ${raw.firstName} ${raw.lastName}`);
  } else {
    // 4. Write to master_leads
    const masterLead = buildMasterLead(raw, idempotencyKey, source);
    const masterRef  = await db.collection('master_leads').add(masterLead);
    masterLeadId     = masterRef.id;
    console.log(`  ✅ CREATED master_lead: ${masterLeadId} — ${raw.firstName} ${raw.lastName}`);
  }

  // 5. Write to routing_queue
  const queueItem = buildRoutingQueueItem(masterLeadId, idempotencyKey, source);
  const queueRef  = await db.collection('routing_queue').add(queueItem);

  // 6. Write to routing_logs (append-only audit)
  await db.collection('routing_logs').add({
    masterLeadId,
    queueItemId:  queueRef.id,
    idempotencyKey,
    event:        'lead_ingested',
    source,
    agentId:      'LeadIngestAgent_v1',
    timestamp:    new Date().toISOString(),
    detail:       `Ingested from ${source}. Queue item: ${queueRef.id}`,
  });

  return { status: 'queued', masterLeadId, queueItemId: queueRef.id, idempotencyKey };
}

// ── CLI entry point ─────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const singleIdx = args.indexOf('--single');
  const sourceIdx = args.indexOf('--source');
  const source  = sourceIdx >= 0 ? args[sourceIdx + 1] : 'script';

  let leads = [];

  if (fileIdx >= 0) {
    const filePath = args[fileIdx + 1];
    if (!fs.existsSync(filePath)) {
      console.error(`[LeadIngestAgent] ❌ File not found: ${filePath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    leads = Array.isArray(raw) ? raw : [raw];
  } else if (singleIdx >= 0) {
    leads = [JSON.parse(args[singleIdx + 1])];
  } else {
    console.error('[LeadIngestAgent] Usage: --file <path.json> | --single \'<json>\'');
    process.exit(1);
  }

  console.log(`\n[LeadIngestAgent] 🚀 Ingesting ${leads.length} lead(s) from source: "${source}"\n`);

  let queued = 0, skipped = 0, errors = 0;
  for (const lead of leads) {
    const result = await ingestLead(lead, source);
    if (result.status === 'queued')   queued++;
    if (result.status === 'skipped')  skipped++;
    if (result.status === 'error') {
      errors++;
      console.error(`  ❌ ERROR: ${result.reason} — ${JSON.stringify(lead).slice(0, 80)}`);
    }
  }

  console.log(`\n[LeadIngestAgent] ✅ Done — Queued: ${queued} | Skipped: ${skipped} | Errors: ${errors}`);
  process.exit(0);
}

main().catch(e => { console.error('[LeadIngestAgent] Fatal:', e); process.exit(1); });
