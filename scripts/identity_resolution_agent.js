#!/usr/bin/env node
// ============================================================
// AUM ENGINE — IdentityResolutionAgent
// scripts/identity_resolution_agent.js
// ============================================================
// PURPOSE: Match an incoming lead against the global
//          master_contacts collection. Returns a tiered
//          confidence match so the routing pipeline can decide:
//
//   Tier 1 — Exact match  (email OR phone) → auto-link
//   Tier 2 — Strong match (name + state + company) → auto-link
//   Tier 3 — Probable match (name + state) → auto-link with flag
//   Tier 4 — Possible match (name only / fuzzy) → manual review
//   Tier 5 — No match → create new master_contact
//
// This module exports resolveIdentity() for use by the
// Cloud Function routing orchestrator AND can be run as a
// standalone CLI for testing resolution against live data.
//
// USAGE:
//   node scripts/identity_resolution_agent.js --lead '{"firstName":"John","lastName":"Smith","email":"john@co.com","state":"AZ"}'
// ============================================================

const admin  = require('firebase-admin');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// ── Admin init (no-op if already initialised by caller) ────
let _adminReady = false;
function ensureAdmin() {
  if (_adminReady || admin.apps.length) { _adminReady = true; return; }
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('serviceAccountKey.json not found at ' + keyPath);
  }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
  _adminReady = true;
}

// ── Text normalisation ──────────────────────────────────────
const normalize = {
  name:  (s) => (s || '').trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' '),
  email: (s) => (s || '').trim().toLowerCase(),
  phone: (s) => (s || '').replace(/\D/g, '').slice(-10),
  state: (s) => (s || '').toUpperCase().slice(0, 2),
};

/** Levenshtein distance for fuzzy name matching */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((v, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function nameSimilarity(a, b) {
  const la = normalize.name(a), lb = normalize.name(b);
  if (!la || !lb) return 0;
  const dist = levenshtein(la, lb);
  return 1 - dist / Math.max(la.length, lb.length);
}

// ── Resolution logic ────────────────────────────────────────
/**
 * @param {Object} lead   - master_lead document (already normalised fields)
 * @returns {Object}      - { tier, matchId, masterContactId, confidence, reason }
 */
async function resolveIdentity(lead) {
  ensureAdmin();
  const db = admin.firestore();

  const inEmail = normalize.email(lead.email);
  const inPhone = normalize.phone(lead.phone);
  const inFirst = normalize.name(lead.firstName);
  const inLast  = normalize.name(lead.lastName);
  const inState = normalize.state(lead.state);
  const inCo    = normalize.name(lead.company);

  // ── Tier 1: Email exact match ───────────────────────────
  if (inEmail) {
    const snap = await db.collection('master_contacts')
      .where('emailNorm', '==', inEmail).limit(1).get();
    if (!snap.empty) {
      return tier(1, snap.docs[0].id, 0.99, 'email_exact');
    }
  }

  // ── Tier 1: Phone exact match ───────────────────────────
  if (inPhone) {
    const snap = await db.collection('master_contacts')
      .where('phoneNorm', '==', inPhone).limit(1).get();
    if (!snap.empty) {
      return tier(1, snap.docs[0].id, 0.97, 'phone_exact');
    }
  }

  // ── Tier 2: Name + State + Company ─────────────────────
  if (inFirst && inLast && inState) {
    const snap = await db.collection('master_contacts')
      .where('lastNameNorm', '==', inLast)
      .where('stateNorm', '==', inState)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      const fnSim = nameSimilarity(d.firstNameNorm, inFirst);
      const coSim = inCo && d.companyNorm ? nameSimilarity(d.companyNorm, inCo) : 0;
      if (fnSim >= 0.9 && coSim >= 0.8) {
        return tier(2, doc.id, 0.92, 'name_state_company');
      }
    }

    // ── Tier 3: Name + State (no company) ──────────────
    for (const doc of snap.docs) {
      const d = doc.data();
      const fnSim = nameSimilarity(d.firstNameNorm, inFirst);
      if (fnSim >= 0.9) {
        return tier(3, doc.id, 0.78, 'name_state');
      }
    }

    // ── Tier 4: Fuzzy name match (≥80% similarity) ─────
    for (const doc of snap.docs) {
      const d = doc.data();
      const fnSim = nameSimilarity(d.firstNameNorm, inFirst);
      if (fnSim >= 0.8) {
        return tier(4, doc.id, 0.60, 'name_fuzzy');
      }
    }
  }

  // ── Tier 5: No match — create new master_contact ───────
  const newContact = {
    firstNameNorm: inFirst,
    lastNameNorm:  inLast,
    emailNorm:     inEmail,
    phoneNorm:     inPhone,
    stateNorm:     inState,
    companyNorm:   inCo,
    // Raw display fields
    firstName:  lead.firstName,
    lastName:   lead.lastName,
    email:      lead.email,
    phone:      lead.phone,
    state:      lead.state,
    company:    lead.company,
    city:       lead.city,
    title:      lead.title,
    // Ownership (set by OwnershipAgent)
    currentOwnerUid:   null,
    currentOwnerSince: null,
    ownershipStatus:   'unassigned',
    // Audit
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    sourceLeadIds: [lead.masterLeadId || null].filter(Boolean),
  };

  const ref = await db.collection('master_contacts').add(newContact);
  console.log(`  🆕 Created master_contact: ${ref.id} — ${lead.firstName} ${lead.lastName}`);
  return tier(5, ref.id, 1.0, 'new_contact');
}

function tier(tierNum, masterContactId, confidence, reason) {
  return { tier: tierNum, masterContactId, confidence, reason };
}

// ── Batch resolution ────────────────────────────────────────
/**
 * Resolve all unresolved master_leads (no masterContactId set).
 * Updates master_leads and logs to routing_logs.
 */
async function resolveAllPending(limit = 50) {
  ensureAdmin();
  const db = admin.firestore();

  const raw = await db.collection('master_leads')
    .limit(limit + 10)
    .get();

  // Filter: exclude _schema docs and docs that already have masterContactId resolved
  const snap = { docs: raw.docs.filter(d => {
    const data = d.data();
    return !data._schema && !data.masterContactId;
  }), size: 0 };
  snap.size = snap.docs.length;

  if (snap.empty) { console.log('[IdentityRes] No pending leads.'); return; }

  console.log(`[IdentityRes] Resolving ${snap.size} pending lead(s)…`);
  const batch = db.batch();

  for (const doc of snap.docs) {
    const lead = { ...doc.data(), masterLeadId: doc.id };
    const result = await resolveIdentity(lead);

    console.log(`  T${result.tier} (${result.confidence.toFixed(2)}) [${result.reason}] → ${lead.firstName} ${lead.lastName}`);

    // Patch master_lead with resolution result
    batch.update(doc.ref, {
      masterContactId:       result.masterContactId,
      identityTier:          result.tier,
      identityConfidence:    result.confidence,
      identityReason:        result.reason,
      identityResolvedAt:    new Date().toISOString(),
      // Tier 4 leads go to manual_review_queue
      ownershipStatus: result.tier >= 4 ? 'pending_review' : 'unassigned',
    });

    // Log to routing_logs
    await db.collection('routing_logs').add({
      masterLeadId:    doc.id,
      masterContactId: result.masterContactId,
      event:           'identity_resolved',
      tier:            result.tier,
      confidence:      result.confidence,
      reason:          result.reason,
      agentId:         'IdentityResolutionAgent_v1',
      timestamp:       new Date().toISOString(),
    });

    // If Tier 4 → write to manual_review_queue
    if (result.tier === 4) {
      await db.collection('manual_review_queue').add({
        masterLeadId:      doc.id,
        masterContactId:   result.masterContactId,
        identityTier:      result.tier,
        confidence:        result.confidence,
        reason:            result.reason,
        status:            'open',         // open | resolved | dismissed
        assignedTo:        null,
        slaDeadline:       new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h
        createdAt:         new Date().toISOString(),
        resolvedAt:        null,
        resolution:        null,
        resolutionNotes:   null,
      });
      console.log(`    ⚠️  → manual_review_queue (Tier 4)`);
    }
  }

  await batch.commit();
  console.log(`[IdentityRes] ✅ Done.`);
}

// ── CLI ─────────────────────────────────────────────────────
if (require.main === module) {
  const args     = process.argv.slice(2);
  const leadIdx  = args.indexOf('--lead');
  const batchMode = args.includes('--batch');

  if (batchMode) {
    const limitIdx = args.indexOf('--limit');
    const limit    = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 50;
    resolveAllPending(limit).catch(e => { console.error(e); process.exit(1); });
  } else if (leadIdx >= 0) {
    const lead = JSON.parse(args[leadIdx + 1]);
    ensureAdmin();
    resolveIdentity(lead).then(r => {
      console.log('\n[IdentityRes] Result:');
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });
  } else {
    console.log('Usage:');
    console.log('  node scripts/identity_resolution_agent.js --lead \'{"firstName":"John",...}\'');
    console.log('  node scripts/identity_resolution_agent.js --batch [--limit 100]');
    process.exit(1);
  }
}

module.exports = { resolveIdentity, resolveAllPending };
