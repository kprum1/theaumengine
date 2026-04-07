#!/usr/bin/env node
// ============================================================
// AUM ENGINE — Schema Init Script
// scripts/schema_init.js
// ============================================================
// PURPOSE: Seeds all Layer 1 global collections with
//          placeholder documents so they appear in the
//          Firestore console. Safe to re-run — uses set()
//          with merge so existing data is not overwritten.
//
// USAGE:
//   node scripts/schema_init.js
// ============================================================

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found at', keyPath);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const NOW = new Date().toISOString();

const SEED_DOCS = [
  // ── master_contacts ──
  {
    collection: 'master_contacts',
    id: '_schema',
    data: {
      _schema: true,
      firstNameNorm: '',  lastNameNorm: '',
      emailNorm: '',       phoneNorm: '',
      stateNorm: '',       companyNorm: '',
      currentOwnerUid: null, currentOwnerSince: null,
      ownershipStatus: 'unassigned',
      createdAt: NOW, updatedAt: NOW,
    },
  },

  // ── master_accounts ──
  {
    collection: 'master_accounts',
    id: '_schema',
    data: {
      _schema: true,
      householdName: '', accountType: '',
      primaryContactId: null, secondaryContactIds: [],
      estimatedAUM: null, ownershipStatus: 'unassigned',
      currentOwnerUid: null, createdAt: NOW,
    },
  },

  // ── master_households ──
  {
    collection: 'master_households',
    id: '_schema',
    data: {
      _schema: true,
      displayName: '', primaryContactId: null,
      memberContactIds: [], estimatedAUM: null,
      ownerUid: null, ownerSince: null,
      ownershipStatus: 'unassigned', createdAt: NOW,
    },
  },

  // ── master_leads ──
  {
    collection: 'master_leads',
    id: '_schema',
    data: {
      _schema: true,
      idempotencyKey: '', firstName: '', lastName: '',
      email: '', phone: '', state: '', city: '', title: '',
      company: '', niche: '', nicheId: '',
      masterContactId: null, identityTier: null,
      identityConfidence: null, identityReason: null,
      fitScore: null, timingScore: null, signals: {},
      reasonCodes: [], source: '', rawPayload: {},
      ownershipStatus: 'unassigned',
      currentOwnerUid: null, currentOwnerSince: null,
      ingestedAt: NOW, updatedAt: NOW,
    },
  },

  // ── lead_assignments ──
  {
    collection: 'lead_assignments',
    id: '_schema',
    data: {
      _schema: true,
      masterLeadId: '', masterContactId: '',
      ownerUid: '', assignedAt: '',
      ownershipStatus: 'active',   // active | released | void | transferred
      status: 'new',               // new | contacted | engaged | nurture | booked | dead
      slaDeadline: null, releasedAt: null, releasedReason: null,
      previousOwners: [],
      fitScore: null, timingScore: null, priorityScore: null,
      assignedBy: 'RoutingOrchestrator', createdAt: NOW, updatedAt: NOW,
    },
  },

  // ── routing_queue ──
  {
    collection: 'routing_queue',
    id: '_schema',
    data: {
      _schema: true,
      masterLeadId: '', idempotencyKey: '', source: '',
      status: 'pending', priority: 50, attempts: 0,
      lockedBy: null, lockedUntil: null,
      createdAt: NOW, updatedAt: NOW,
    },
  },

  // ── routing_logs ──
  {
    collection: 'routing_logs',
    id: '_schema',
    data: {
      _schema: true,
      masterLeadId: '', queueItemId: '', event: '',
      agentId: '', timestamp: NOW, detail: '',
    },
  },

  // ── routing_policies ──
  {
    collection: 'routing_policies',
    id: 'default_v1',
    data: {
      _schema: false,
      policyVersion: 'v1',
      description: 'Default routing policy — Phase B1',
      weights: {
        nicheMatch:       0.40,
        geographyMatch:   0.20,
        aumBandMatch:     0.20,
        capacityHeadroom: 0.10,
        fairness:         0.10,
      },
      slaDays: 30,
      maxLeadsPerAdvisor: 25,
      autoAssignTiers: [1, 2, 3],  // Identity tiers that auto-assign
      manualReviewTiers: [4, 5],   // Tiers that go to review queue
      createdAt: NOW, updatedAt: NOW,
    },
  },

  // ── suppression_registry ──
  {
    collection: 'suppression_registry',
    id: '_schema',
    data: {
      _schema: true,
      masterContactId: '', reasonCode: '',
      suppressedAt: NOW, suppressedBy: '', expiresAt: null,
    },
  },

  // ── manual_review_queue ──
  {
    collection: 'manual_review_queue',
    id: '_schema',
    data: {
      _schema: true,
      masterLeadId: '', masterContactId: '',
      identityTier: null, confidence: null, reason: '',
      status: 'open', assignedTo: null,
      slaDeadline: null, createdAt: NOW,
      resolvedAt: null, resolution: null, resolutionNotes: null,
    },
  },
];

async function main() {
  console.log('\n[SchemaInit] 🚀 Seeding Layer 1 global collections…\n');
  for (const { collection, id, data } of SEED_DOCS) {
    await db.collection(collection).doc(id).set(data, { merge: true });
    console.log(`  ✅ ${collection}/${id}`);
  }
  console.log('\n[SchemaInit] ✅ All collections initialized.\n');
  console.log('Next steps:');
  console.log('  1. Open Firestore console → verify all collections appear');
  console.log('  2. Run: node scripts/lead_ingest_agent.js --file ./data/sample_leads.json --source alfred');
  console.log('  3. Run: node scripts/identity_resolution_agent.js --batch');
  process.exit(0);
}

main().catch(e => { console.error('[SchemaInit] Fatal:', e); process.exit(1); });
