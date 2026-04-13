// ============================================================
// AUM ENGINE — Cloud Functions Routing Orchestrator
// functions/index.js — Phase C5 (Node.js 22)
// ============================================================
// AGENTS (in pipeline order):
//   1. onLeadIngested    — HTTP endpoint (Alfred / CSV / manual)
//   2. processRoutingQueue — scheduled every 5 min
//      ├── checkOwnership
//      ├── runEligibility
//      ├── runScoring
//      └── finalizeAssignment
//   3. runGovernance     — scheduled daily (SLA + stale audit)
//
// ALL writes to Layer 1 collections use Admin SDK.
// Advisor reads use users/{uid}/data/ (Layer 3).
// ============================================================

'use strict';

const functions  = require('firebase-functions');
const { onRequest }    = require('firebase-functions/v2/https');
const { onSchedule }   = require('firebase-functions/v2/scheduler');
const admin      = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── Shared helpers ──────────────────────────────────────────
const normalize = {
  name:  s => (s||'').trim().toLowerCase().replace(/[^a-z\s]/g,'').replace(/\s+/g,' '),
  email: s => (s||'').trim().toLowerCase(),
  phone: s => (s||'').replace(/\D/g,'').slice(-10),
  state: s => (s||'').toUpperCase().slice(0,2),
};

const crypto = require('crypto');

function computeIdempotencyKey(lead) {
  const parts = [
    normalize.name(lead.firstName),
    normalize.name(lead.lastName),
    normalize.email(lead.email),
    normalize.phone(lead.phone),
  ].filter(Boolean);
  if (parts.length < 2) throw new Error('Insufficient identity fields');
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0,32);
}

async function log(event, payload) {
  await db.collection('routing_logs').add({
    event,
    ...payload,
    agentId:   payload.agentId || 'RoutingOrchestrator_v1',
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// AGENT 1: onLeadIngested — HTTP endpoint
// POST https://{region}-theaumengine.cloudfunctions.net/onLeadIngested
// Body: { lead: {...}, source: "alfred|csv|manual", apiKey: "..." }
// ============================================================
exports.onLeadIngested = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  // Auth guard
  const expectedKey = process.env.AUM_INGEST_API_KEY;
  if (expectedKey && req.body.apiKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  const { lead, source = 'api' } = req.body;
  if (!lead) return res.status(400).json({ error: 'Missing lead payload' });

  try {
    // Idempotency key
    let idempotencyKey;
    try { idempotencyKey = computeIdempotencyKey(lead); }
    catch(e) { return res.status(400).json({ error: e.message }); }

    // Check for duplicate in routing_queue
    const existing = await db.collection('routing_queue')
      .where('idempotencyKey', '==', idempotencyKey)
      .where('status', 'in', ['pending', 'processing', 'assigned'])
      .limit(1).get();

    if (!existing.empty) {
      return res.status(200).json({
        status: 'skipped',
        reason: 'duplicate_in_queue',
        idempotencyKey,
        existingQueueId: existing.docs[0].id,
      });
    }

    // Write master_lead
    const now = new Date().toISOString();
    const masterLead = {
      idempotencyKey,
      firstName:    (lead.firstName||'').trim(),
      lastName:     (lead.lastName||'').trim(),
      email:        normalize.email(lead.email||''),
      phone:        normalize.phone(lead.phone||''),
      title:        (lead.title||'').trim(),
      company:      (lead.company||'').trim(),
      city:         (lead.city||'').trim(),
      state:        normalize.state(lead.state||''),
      estimatedAUM: lead.estimatedAUM || null,
      niche:        (lead.niche||'').trim(),
      nicheId:      (lead.nicheId||'').trim(),
      signals:      lead.signals || {},
      reasonCodes:  lead.reasonCodes || [],
      fitScore:     lead.fitScore || null,
      timingScore:  lead.timingScore || null,
      source, rawPayload: lead,
      ownershipStatus: 'unassigned',
      currentOwnerUid: null, currentOwnerSince: null,
      masterContactId: null, identityTier: null,
      ingestedAt: now, updatedAt: now,
    };
    const masterRef = await db.collection('master_leads').add(masterLead);

    // Write routing_queue item
    const queueRef = await db.collection('routing_queue').add({
      masterLeadId: masterRef.id,
      idempotencyKey, source,
      status: 'pending', priority: 50,
      attempts: 0, lockedBy: null, lockedUntil: null,
      createdAt: now, updatedAt: now,
    });

    await log('lead_ingested', {
      masterLeadId: masterRef.id,
      queueItemId:  queueRef.id,
      idempotencyKey, source,
      agentId: 'onLeadIngested_v1',
      detail: `Ingested via HTTP from ${source}`,
    });

    return res.status(201).json({
      status: 'queued',
      masterLeadId: masterRef.id,
      queueItemId:  queueRef.id,
      idempotencyKey,
    });

  } catch(e) {
    console.error('[onLeadIngested] Error:', e);
    return res.status(500).json({ error: 'Internal error — see function logs' });
  }
});

// ============================================================
// AGENT 2: processRoutingQueue — runs every 5 minutes
// Picks up to 10 pending queue items and runs the full
// ownership → eligibility → scoring → assignment pipeline.
// ============================================================
exports.processRoutingQueue = onSchedule('every 5 minutes', async (event) => {
    console.info('[RoutingQueue] Tick — scanning pending items…');

    const snap = await db.collection('routing_queue')
      .where('status', '==', 'pending')
      .orderBy('createdAt')
      .limit(10)
      .get();

    if (snap.empty) {
      console.info('[RoutingQueue] No pending items.');
      return;
    }

    for (const queueDoc of snap.docs) {
      await processQueueItem(queueDoc);
    }
  });

// ── Sub-pipeline for a single queue item ───────────────────
async function processQueueItem(queueDoc) {
  const q    = queueDoc.data();
  const qRef = queueDoc.ref;

  // Lock the item (prevent duplicate processing)
  const lockUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  await qRef.update({
    status: 'processing', lockedBy: 'RoutingOrchestrator',
    lockedUntil: lockUntil, attempts: (q.attempts || 0) + 1,
    updatedAt: new Date().toISOString(),
  });

  try {
    const leadSnap = await db.collection('master_leads').doc(q.masterLeadId).get();
    if (!leadSnap.exists) {
      await qRef.update({ status: 'failed', updatedAt: new Date().toISOString() });
      return;
    }
    const lead = leadSnap.data();

    // ── Step A: checkOwnership ──────────────────────────
    const ownership = await checkOwnership(lead, q.masterLeadId);
    if (ownership.alreadyOwned) {
      await qRef.update({ status: 'assigned', updatedAt: new Date().toISOString() });
      await log('ownership_exists', {
        masterLeadId: q.masterLeadId,
        ownerUid: ownership.ownerUid,
        agentId: 'checkOwnership_v1',
        detail: 'Lead already assigned — skipping.',
      });
      return;
    }

    // ── Step B: runEligibility ──────────────────────────
    const eligibleAdvisors = await runEligibility(lead);
    if (!eligibleAdvisors.length) {
      await qRef.update({ status: 'failed', updatedAt: new Date().toISOString() });
      await log('eligibility_empty', {
        masterLeadId: q.masterLeadId,
        agentId: 'runEligibility_v1',
        detail: 'No eligible advisors found for this lead.',
      });
      return;
    }

    // ── Step C: runScoring ──────────────────────────────
    const scored = await runScoring(lead, eligibleAdvisors);
    const winner = scored[0]; // Highest score wins

    // ── Step D: finalizeAssignment ──────────────────────
    await finalizeAssignment(lead, q.masterLeadId, winner, qRef);

  } catch(e) {
    console.error('[processQueueItem] Error:', e);
    await qRef.update({
      status: 'failed',
      lastError: e.message,
      updatedAt: new Date().toISOString(),
    });
  }
}

// ── checkOwnership ──────────────────────────────────────────
async function checkOwnership(lead, masterLeadId) {
  // Check lead_assignments for an active assignment of this lead
  const snap = await db.collection('lead_assignments')
    .where('masterLeadId', '==', masterLeadId)
    .where('ownershipStatus', 'in', ['active', 'pending'])
    .limit(1).get();

  if (!snap.empty) {
    return { alreadyOwned: true, ownerUid: snap.docs[0].data().ownerUid };
  }
  return { alreadyOwned: false };
}

// ── runEligibility ──────────────────────────────────────────
// Reads from advisor_pool (flat collection, fully indexed — no
// collectionGroup query needed). Filters on: eligibility flag,
// niche match, licensed state, and combined lead cap.
async function runEligibility(lead) {
  const poolSnap = await db.collection('advisor_pool')
    .where('eligibleForRouting', '==', true)
    .get();

  const eligible = [];
  const leadState = (lead.state || '').toUpperCase();
  const leadNiche = (lead.nicheId || '').toLowerCase();
  const leadAUM   = parseAUM(lead.estimatedAUM);

  for (const doc of poolSnap.docs) {
    const ap  = doc.data();
    const uid = doc.id; // advisor_pool/{uid}

    // Gate 1: Niche match — advisor must serve this lead's niche
    const nicheIds = (ap.nicheIds || []).map(n => n.toLowerCase());
    if (leadNiche && nicheIds.length > 0 && !nicheIds.includes(leadNiche)) continue;

    // Gate 2: Licensed state match (skip gate if licensedStates not set)
    const licensedStates = ap.licensedStates || [];
    if (licensedStates.length > 0 && !licensedStates.includes(leadState)) continue;

    // Gate 3: Combined lead cap — count BOTH lead_assignments + al_assignments
    const cap = ap.activeLeadCap || 25;
    const [legacySnap, alSnap] = await Promise.all([
      db.collection('lead_assignments')
        .where('ownerUid', '==', uid)
        .where('ownershipStatus', '==', 'active')
        .get(),
      db.collection('al_assignments')
        .where('advisorUid', '==', uid)
        .where('status', 'in', ['New', 'active', 'Contacted', 'In Progress'])
        .get(),
    ]);
    const totalActive = legacySnap.size + alSnap.size;
    if (totalActive >= cap) {
      console.info(`[Eligibility] ${uid} at cap (${totalActive}/${cap}) — skipping`);
      continue;
    }

    // Gate 4: AUM band match (soft)
    const bandOK = checkAUMBand(leadAUM, ap.targetAUMBands || []);

    eligible.push({ uid, profile: ap, activeCount: totalActive, bandOK });
  }

  return eligible;
}

// ── runScoring ──────────────────────────────────────────────
// Applies the weighted routing policy to score each eligible advisor.
// Weights come from routing_policies/default_v1.
async function runScoring(lead, advisors) {
  // Load routing policy
  const policySnap = await db.collection('routing_policies').doc('default_v1').get();
  const weights    = policySnap.exists
    ? policySnap.data().weights
    : { nicheMatch: 0.40, geographyMatch: 0.20, aumBandMatch: 0.20, capacityHeadroom: 0.10, fairness: 0.10 };

  const scored = advisors.map(({ uid, profile, activeCount, bandOK }) => {
    const cap = profile.activeLeadCap || 25;

    // Component scores (0–1)
    const nicheScore     = scoreNicheMatch(lead, profile);
    const geoScore       = scoreGeoMatch(lead, profile);
    const aumScore       = bandOK ? 1.0 : 0.4;
    const capacityScore  = Math.max(0, 1 - activeCount / cap);
    const fairnessScore  = capacityScore; // Simplified: lower load = more fair

    const total =
      nicheScore    * weights.nicheMatch +
      geoScore      * weights.geographyMatch +
      aumScore      * weights.aumBandMatch +
      capacityScore * weights.capacityHeadroom +
      fairnessScore * weights.fairness;

    return { uid, profile, score: Math.round(total * 100), activeCount };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ── Scoring sub-functions ───────────────────────────────────
function scoreNicheMatch(lead, profile) {
  // Real nicheId matching against advisor_pool nicheIds array.
  // Exact match = 1.0, no match = 0.1 (soft — still eligible, just scores low).
  const leadNiche    = (lead.nicheId || '').toLowerCase();
  const advisorNiches = (profile.nicheIds || []).map(n => n.toLowerCase());
  if (!leadNiche || advisorNiches.length === 0) return 0.5; // unknown = neutral
  return advisorNiches.includes(leadNiche) ? 1.0 : 0.1;
}

function scoreGeoMatch(lead, profile) {
  const leadState = (lead.state || '').toUpperCase();
  if (!profile.licensedStates || !profile.licensedStates.length) return 0.5;
  return profile.licensedStates.includes(leadState) ? 1.0 : 0.0;
}

function parseAUM(str) {
  if (!str) return 0;
  const s = str.toUpperCase().replace(/[^0-9MKB\.]/g,'');
  if (s.includes('M')) return parseFloat(s) * 1_000_000;
  if (s.includes('K')) return parseFloat(s) * 1_000;
  if (s.includes('B')) return parseFloat(s) * 1_000_000_000;
  return parseFloat(s) || 0;
}

function checkAUMBand(aum, bands) {
  if (!bands || !bands.length) return true;
  return bands.some(band => {
    if (band === '<500k')   return aum > 0 && aum < 500_000;
    if (band === '500k-1m') return aum >= 500_000 && aum < 1_000_000;
    if (band === '1m-5m')   return aum >= 1_000_000 && aum < 5_000_000;
    if (band === '5m+')     return aum >= 5_000_000;
    return false;
  });
}

// ── finalizeAssignment ──────────────────────────────────────
async function finalizeAssignment(lead, masterLeadId, winner, queueRef) {
  const now = new Date().toISOString();
  const sla = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const batch = db.batch();

  // 1. Write lead_assignment (source of truth)
  const assignRef = db.collection('lead_assignments').doc();
  batch.set(assignRef, {
    masterLeadId,
    masterContactId: lead.masterContactId || null,
    ownerUid:        winner.uid,
    assignedAt:      now,
    ownershipStatus: 'active',
    status:          'new',
    fitScore:        lead.fitScore || null,
    timingScore:     lead.timingScore || null,
    priorityScore:   winner.score,
    slaDeadline:     sla,
    releasedAt:      null,
    releasedReason:  null,
    previousOwners:  [],
    assignedBy:      'RoutingOrchestrator_v1',
    createdAt:       now,
    updatedAt:       now,
  });

  // 2. Update routing_queue item → assigned
  queueRef && batch.update(queueRef, {
    status: 'assigned',
    assignedTo: winner.uid,
    assignedAt: now,
    updatedAt:  now,
  });

  // 3. Update master_lead → ownershipStatus
  batch.update(db.collection('master_leads').doc(masterLeadId), {
    ownershipStatus:   'assigned',
    currentOwnerUid:   winner.uid,
    currentOwnerSince: now,
    updatedAt:         now,
  });

  await batch.commit();

  await log('lead_assigned', {
    masterLeadId, assignmentId: assignRef.id,
    ownerUid:    winner.uid,
    routingScore: winner.score,
    agentId:     'finalizeAssignment_v1',
    detail:      `Assigned to ${winner.uid} with score ${winner.score}`,
  });

  functions.logger.info(`[Assignment] ✅ ${lead.firstName} ${lead.lastName} → ${winner.uid} (score: ${winner.score})`);
}

// ============================================================
// AGENT 3: runGovernance — daily SLA + stale audit
// ============================================================
// Checks BOTH lead_assignments and al_assignments for stale leads.
// Reads slaWindowDays from routing_policies/default_v1 (default: 7).
// Writes a governance_flags doc per stale lead so Admin Dashboard
// can surface them without a separate query.
exports.runGovernance = onSchedule('every 24 hours', async (event) => {
    console.info('[Governance] Daily audit starting…');
    const now = new Date().toISOString();
    let flagged = 0;

    // Load SLA window from policy doc (fallback: 7 days)
    const policySnap = await db.collection('routing_policies').doc('default_v1').get();
    const slaWindowDays = (policySnap.exists ? policySnap.data().slaWindowDays : null) || 7;
    const slaThreshold  = new Date(Date.now() - slaWindowDays * 24 * 60 * 60 * 1000).toISOString();
    console.info(`[Governance] SLA window: ${slaWindowDays} days | Threshold: ${slaThreshold}`);

    // ── Track 1: lead_assignments (CF routing track) ─────────────────
    const laBreached = await db.collection('lead_assignments')
      .where('ownershipStatus', '==', 'active')
      .where('slaDeadline', '<', now)
      .get();

    for (const doc of laBreached.docs) {
      const a = doc.data();
      await _flagStale({
        collection: 'lead_assignments', docId: doc.id,
        masterLeadId: a.masterLeadId, ownerUid: a.ownerUid,
        assignedAt: a.assignedAt, status: a.status,
        slaWindowDays, now,
      });
      flagged++;
    }
    console.info(`[Governance] lead_assignments SLA breaches: ${laBreached.size}`);

    // ── Track 2: al_assignments (batch routing track) ────────────────
    // al_assignments uses slaDeadline too; fall back to assignedAt age check
    const alSnap = await db.collection('al_assignments')
      .where('ownershipStatus', '==', 'active')
      .where('status', 'in', ['New', 'new'])
      .get();

    let alFlagged = 0;
    for (const doc of alSnap.docs) {
      const a = doc.data();
      const assignedAt = a.assignedAt || a.createdAt || '';

      // SLA check: slaDeadline field OR age > slaWindowDays
      const slaBreached = a.slaDeadline
        ? a.slaDeadline < now
        : assignedAt < slaThreshold;

      if (!slaBreached) continue;

      await _flagStale({
        collection: 'al_assignments', docId: doc.id,
        masterLeadId: a.masterLeadId, ownerUid: a.advisorUid || a.ownerUid,
        assignedAt, status: a.status,
        slaWindowDays, now,
      });
      flagged++;
      alFlagged++;
    }
    console.info(`[Governance] al_assignments SLA breaches: ${alFlagged}`);
    console.info(`[Governance] ✅ Total flagged: ${flagged}`);
  });

// Helper: write a governance_flags doc (idempotent by docId)
async function _flagStale({ collection, docId, masterLeadId, ownerUid, assignedAt, status, slaWindowDays, now }) {
  const flagId = `${collection}_${docId}`;
  const existing = await db.collection('governance_flags').doc(flagId).get();
  if (existing.exists) return; // already flagged

  await db.collection('governance_flags').doc(flagId).set({
    sourceCollection: collection,
    sourceDocId:      docId,
    masterLeadId:     masterLeadId || null,
    ownerUid:         ownerUid     || null,
    assignedAt:       assignedAt   || null,
    lastStatus:       status       || null,
    reason:           'sla_breach',
    slaWindowDays,
    flaggedAt:        now,
    resolvedAt:       null,
    resolution:       null,
  });

  await log('sla_breach_flagged', {
    masterLeadId: masterLeadId || null,
    assignmentId: docId,
    ownerUid:     ownerUid    || null,
    agentId:      'runGovernance_v1',
    detail:       `SLA breached (${slaWindowDays}d) in ${collection}/${docId}`,
  });
}


// ============================================================
// AGENT 4: Alfred Miner HTTP endpoint
// POST /alfredIngest — identical to onLeadIngested but
// authenticated with Alfred's dedicated API key header.
// Alfred drops a batch of leads; each is processed individually.
// ============================================================
exports.alfredIngest = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const alfredKey = process.env.AUM_ALFRED_API_KEY;
  if (alfredKey && req.headers['x-alfred-key'] !== alfredKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const leads = Array.isArray(req.body) ? req.body : [req.body];
  const results = [];

  for (const lead of leads) {
    try {
      const key = computeIdempotencyKey(lead);
      const existing = await db.collection('routing_queue')
        .where('idempotencyKey', '==', key)
        .where('status', 'in', ['pending','processing','assigned'])
        .limit(1).get();

      if (!existing.empty) {
        results.push({ status: 'skipped', idempotencyKey: key });
        continue;
      }

      const now      = new Date().toISOString();
      const masterRef = await db.collection('master_leads').add({
        idempotencyKey: key,
        firstName: (lead.firstName||'').trim(),
        lastName:  (lead.lastName||'').trim(),
        email:     normalize.email(lead.email||''),
        phone:     normalize.phone(lead.phone||''),
        title:     (lead.title||'').trim(),
        company:   (lead.company||'').trim(),
        city:      (lead.city||'').trim(),
        state:     normalize.state(lead.state||''),
        niche:     (lead.niche||'').trim(),
        nicheId:   (lead.nicheId||'').trim(),
        fitScore:  lead.fitScore || null,
        timingScore: lead.timingScore || null,
        signals:   lead.signals || {},
        reasonCodes: lead.reasonCodes || [],
        source: 'alfred', rawPayload: lead,
        ownershipStatus: 'unassigned',
        currentOwnerUid: null, masterContactId: null,
        ingestedAt: now, updatedAt: now,
      });
      const qRef = await db.collection('routing_queue').add({
        masterLeadId: masterRef.id, idempotencyKey: key,
        source: 'alfred', status: 'pending', priority: 60,
        attempts: 0, lockedBy: null, lockedUntil: null,
        createdAt: now, updatedAt: now,
      });
      results.push({ status: 'queued', masterLeadId: masterRef.id, queueItemId: qRef.id, idempotencyKey: key });
    } catch(e) {
      results.push({ status: 'error', reason: e.message });
    }
  }

  const summary = {
    total:   leads.length,
    queued:  results.filter(r => r.status === 'queued').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors:  results.filter(r => r.status === 'error').length,
    results,
  };

  return res.status(207).json(summary);
});

// ============================================================
// AGENT 5: sendDailyDigest — 7:00 AM CT daily advisor email
// Schedule: '0 12 * * *' = noon UTC = 7:00 AM Central Time
//
// Reads funnel_events from last 24h, groups by advisorUid,
// fetches advisor email from Firebase Auth, sends HTML digest
// via Nodemailer + Gmail SMTP (env: GMAIL_USER / GMAIL_APP_PASSWORD).
//
// Logs outcome to routing_logs collection.
// ============================================================
const nodemailer = require('nodemailer');

function buildDigestHTML(name, dateStr, stats) {
  const { outreachSent, repliesLogged, meetingsBooked, statusChanges } = stats;

  const statusRows = statusChanges.slice(0, 10).map(e => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;font-size:13px;">
        Lead ${e.leadId ? e.leadId.slice(0, 8) + '…' : '—'}
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#64748b;font-size:13px;">
        ${e.fromStatus || '—'}
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#475569;font-size:13px;">→</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#4ade80;font-weight:600;font-size:13px;">
        ${e.toStatus || '—'}
      </td>
    </tr>`).join('');

  const pipelineSection = statusChanges.length > 0 ? `
    <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #334155;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6366f1;margin-bottom:12px;font-weight:600;">
        ── Pipeline Moves
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${statusRows}
      </table>
    </div>` : `
    <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:24px;border:1px solid #334155;color:#475569;font-size:13px;text-align:center;">
      No pipeline moves in the last 24 hours.
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>AUM Engine Daily Report</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:36px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;padding:6px 16px;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#fff;margin-bottom:16px;">
        THE AUM ENGINE
      </div>
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px;">
        Daily Report
      </h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:14px;">${dateStr}</p>
    </div>

    <!-- Greeting -->
    <p style="color:#94a3b8;margin:0 0 28px;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#e2e8f0;">${name}</strong>, here's your activity summary for the past 24 hours.
    </p>

    <!-- Stats Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;">
      <div style="background:#1e293b;border-radius:12px;padding:24px 20px;text-align:center;border:1px solid #334155;">
        <div style="font-size:36px;font-weight:800;color:#6366f1;line-height:1;">${outreachSent}</div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:1.5px;">📤 Outreach Sent</div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:24px 20px;text-align:center;border:1px solid #334155;">
        <div style="font-size:36px;font-weight:800;color:#06b6d4;line-height:1;">${repliesLogged}</div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:1.5px;">💬 Replies Logged</div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:24px 20px;text-align:center;border:1px solid #334155;">
        <div style="font-size:36px;font-weight:800;color:#4ade80;line-height:1;">${meetingsBooked}</div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:1.5px;">📅 Meetings Booked</div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:24px 20px;text-align:center;border:1px solid #334155;">
        <div style="font-size:36px;font-weight:800;color:#f59e0b;line-height:1;">${statusChanges.length}</div>
        <div style="font-size:11px;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:1.5px;">🔄 Status Updates</div>
      </div>
    </div>

    <!-- Pipeline Moves -->
    ${pipelineSection}

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://theaumengine.web.app"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.3px;">
        View Full Pipeline →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#475569;font-size:12px;border-top:1px solid #1e293b;padding-top:24px;line-height:1.8;">
      <p style="margin:0;">
        Sent by <a href="https://theaumengine.web.app" style="color:#6366f1;text-decoration:none;font-weight:600;">The AUM Engine</a>
      </p>
      <p style="margin:4px 0 0;">kosal@fin-tegration.com</p>
      <p style="margin:8px 0 0;color:#334155;">You're receiving this because you're an active AUM Engine pilot advisor.</p>
    </div>

  </div>
</body>
</html>`;
}

exports.sendDailyDigest = onSchedule('0 12 * * *', async (event) => {
  console.info('[DigestCron] ⏰ Daily digest starting…');

  // Email transport (Gmail SMTP via app password)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  // Verify SMTP config before doing Firestore work
  try {
    await transporter.verify();
    console.info('[DigestCron] ✅ SMTP connection verified');
  } catch (e) {
    console.error('[DigestCron] ❌ SMTP verify failed:', e.message);
    return;
  }

  // Pull all funnel events from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const eventsSnap = await db.collection('funnel_events')
    .where('ts', '>=', since)
    .get();

  if (eventsSnap.empty) {
    console.info('[DigestCron] No events in last 24h — skipping send.');
    return;
  }

  // Group events by advisorUid
  const byAdvisor = {};
  eventsSnap.docs.forEach(doc => {
    const e = doc.data();
    const uid = e.advisorUid;
    if (!uid || uid === 'anonymous') return;
    if (!byAdvisor[uid]) byAdvisor[uid] = [];
    byAdvisor[uid].push(e);
  });

  const uids = Object.keys(byAdvisor);
  console.info(`[DigestCron] Found activity for ${uids.length} advisor(s)`);

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  let sent = 0, failed = 0;

  for (const uid of uids) {
    const events = byAdvisor[uid];
    try {
      // Resolve advisor email + name from Firebase Auth
      const userRecord = await admin.auth().getUser(uid);
      const email = userRecord.email;
      if (!email) { console.warn(`[DigestCron] No email for uid ${uid} — skip`); continue; }
      const name = userRecord.displayName || email.split('@')[0];

      // Tally event types
      const outreachSent    = events.filter(e => e.event === 'outreach_sent').length;
      const repliesLogged   = events.filter(e => e.event === 'reply_logged').length;
      const meetingsBooked  = events.filter(e => e.event === 'meeting_booked').length;
      const statusChanges   = events.filter(e => e.event === 'lead_status_changed');

      // Plain-text fallback
      const statusLines = statusChanges.slice(0, 10)
        .map(e => `  • Lead ${e.leadId || '?'} → ${e.toStatus || 'updated'}`)
        .join('\n') || '  (none)';

      const text = [
        `AUM Engine Daily Report — ${dateStr}`,
        '',
        `Hi ${name},`,
        '',
        `Here's your activity summary for the past 24 hours:`,
        '',
        `📤 Outreach Sent:    ${outreachSent}`,
        `💬 Replies Logged:   ${repliesLogged}`,
        `📅 Meetings Booked:  ${meetingsBooked}`,
        `🔄 Status Updates:   ${statusChanges.length}`,
        '',
        '── Pipeline Moves ──────────────────────',
        statusLines,
        '',
        'View your full pipeline:',
        'https://theaumengine.web.app',
        '',
        '— The AUM Engine',
      ].join('\n');

      const html = buildDigestHTML(name, dateStr, {
        outreachSent, repliesLogged, meetingsBooked, statusChanges,
      });

      await transporter.sendMail({
        from:    `"${process.env.DIGEST_FROM_NAME || 'The AUM Engine'}" <${process.env.GMAIL_USER}>`,
        to:      email,
        subject: `📊 Your AUM Engine Daily Report — ${dateStr}`,
        text,
        html,
      });

      sent++;
      console.info(`[DigestCron] ✅ Sent to ${email} (${outreachSent} sent, ${meetingsBooked} booked)`);

    } catch (e) {
      failed++;
      console.error(`[DigestCron] ❌ Failed for uid ${uid}:`, e.message);
    }
  }

  // Audit log
  await db.collection('routing_logs').add({
    event:         'daily_digest_sent',
    agentId:       'sendDailyDigest_v1',
    advisorCount:  uids.length,
    sent,
    failed,
    since,
    timestamp:     now.toISOString(),
  });

  console.info(`[DigestCron] 🏁 Done — Sent: ${sent} | Failed: ${failed}`);
});
