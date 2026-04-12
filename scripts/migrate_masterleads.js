// AUM ENGINE — Migrate masterLeads → master_leads + routing_queue
// scripts/migrate_masterleads.js
// Run: node scripts/migrate_masterleads.js
//
// Reads every doc in masterLeads (camelCase batch-ingest path),
// writes it to master_leads (snake_case CF path) with an
// idempotency key, then adds a routing_queue entry if one
// doesn't already exist. Idempotent — safe to re-run.
'use strict';
const admin  = require('firebase-admin');
const crypto = require('crypto');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const normalize = {
  name:  s => (s||'').trim().toLowerCase().replace(/[^a-z\s]/g,'').replace(/\s+/g,' '),
  email: s => (s||'').trim().toLowerCase(),
  phone: s => (s||'').replace(/\D/g,'').slice(-10),
  state: s => (s||'').toUpperCase().slice(0,2),
};

function computeKey(lead) {
  const parts = [
    normalize.name(lead.firstName),
    normalize.name(lead.lastName),
    normalize.email(lead.email),
    normalize.phone(lead.phone),
  ].filter(Boolean);
  if (parts.length < 2) return null;
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

async function migrate() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   masterLeads → master_leads Migration             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const snap = await db.collection('masterLeads').get();
  console.log(`Found ${snap.size} docs in masterLeads.\n`);

  let migrated = 0;
  let alreadyExists = 0;
  let queued = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const src = doc.data();

    const idKey = computeKey(src);
    if (!idKey) {
      console.log(`  ⚠️  Skipping ${doc.id} — insufficient identity fields`);
      skipped++;
      continue;
    }

    // Check if already in master_leads (by idempotencyKey)
    const existing = await db.collection('master_leads')
      .where('idempotencyKey', '==', idKey)
      .limit(1).get();

    let masterLeadId;

    if (!existing.empty) {
      masterLeadId = existing.docs[0].id;
      console.log(`  ⏭  ${src.firstName} ${src.lastName} — already in master_leads (${masterLeadId})`);
      alreadyExists++;
    } else {
      // Write to master_leads with the CF snake_case schema
      const now = new Date().toISOString();
      const masterLead = {
        idempotencyKey:  idKey,
        firstName:       (src.firstName || '').trim(),
        lastName:        (src.lastName  || '').trim(),
        email:           normalize.email(src.email || ''),
        phone:           normalize.phone(src.phone || ''),
        title:           (src.title   || '').trim(),
        company:         (src.company || '').trim(),
        city:            (src.city    || '').trim(),
        state:           normalize.state(src.state || ''),
        estimatedAUM:    src.estimatedAUM || null,
        niche:           (src.niche   || '').trim(),
        nicheId:         (src.nicheId || '').trim(),
        signals:         src.signals      || {},
        reasonCodes:     src.reasonCodes  || [],
        fitScore:        src.fitScore     || null,
        timingScore:     src.timingScore  || null,
        priorityScore:   src.priorityScore || null,
        source:          src.source || 'masterLeads_migration',
        rawPayload:      src,
        ownershipStatus: 'unassigned',
        currentOwnerUid: null, currentOwnerSince: null,
        masterContactId: null, identityTier: null,
        ingestedAt:      src.ingestedAt || src.alfredQueuedAt || now,
        migratedAt:      now,
        updatedAt:       now,
      };

      const ref = await db.collection('master_leads').add(masterLead);
      masterLeadId = ref.id;
      console.log(`  ✅ Migrated: ${src.firstName} ${src.lastName} → master_leads/${masterLeadId}`);
      migrated++;
    }

    // Check if already in routing_queue (by masterLeadId, avoiding duplicates)
    const qExisting = await db.collection('routing_queue')
      .where('masterLeadId', '==', masterLeadId)
      .where('status', 'in', ['pending', 'processing', 'assigned'])
      .limit(1).get();

    if (!qExisting.empty) {
      console.log(`     ↳ Already in routing_queue (${qExisting.docs[0].data().status}) — skipping queue`);
    } else {
      const now = new Date().toISOString();
      await db.collection('routing_queue').add({
        masterLeadId,
        idempotencyKey: idKey,
        source: src.source || 'masterLeads_migration',
        status: 'pending',
        priority: src.priorityScore || src.fitScore || 50,
        attempts: 0, lockedBy: null, lockedUntil: null,
        createdAt: now, updatedAt: now,
        migratedFromDoc: doc.id,
      });
      console.log(`     ↳ Added to routing_queue ✅`);
      queued++;
    }
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log(`  Migrated to master_leads : ${migrated}`);
  console.log(`  Already existed (skipped): ${alreadyExists}`);
  console.log(`  Added to routing_queue   : ${queued}`);
  console.log(`  Skipped (bad data)       : ${skipped}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\n  processRoutingQueue will pick them up within 5 minutes.');
  console.log('  Or run: node scripts/trigger_routing.js to fire now.\n');
  process.exit(0);
}

migrate().catch(e => { console.error('[ERROR]', e.message, e.stack); process.exit(1); });
