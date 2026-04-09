// ============================================================
// AUM ENGINE — Approve & Ingest (Stage 2 of 2)
// ============================================================
// Run ONLY after reviewing scripts/staging/review_report_[date].md
// and confirming all leads are clean.
//
// Usage:
//   node scripts/approve_and_ingest.js --batch=2026-04-09T09-43-00
//   (use the timestamp from the staging filename)
//
// What this does:
//   1. Reads the staged clean JSON from scripts/staging/
//   2. Sets status to 'New' (staging uses 'pending_review')
//   3. Writes to Firestore masterLeads collection (idempotent — safe to re-run)
//   4. Moves processed files to scripts/incoming/processed/ archive
//   5. Logs a receipt to scripts/staging/ingest_log.md
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Init Firebase Admin ──────────────────────────────────────
const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  console.error('   Download from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}
const serviceAccount = require(SA_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Config ───────────────────────────────────────────────────
const STAGING_DIR    = path.join(__dirname, 'staging');
const INCOMING_DIR   = path.join(__dirname, 'incoming');
const PROCESSED_DIR  = path.join(INCOMING_DIR, 'processed');
const INGEST_LOG     = path.join(STAGING_DIR, 'ingest_log.md');
const COLLECTION     = 'masterLeads';     // ← canonical Firestore collection

// ── Parse --batch arg ────────────────────────────────────────
const batchArg = process.argv.find(a => a.startsWith('--batch='));
if (!batchArg) {
  console.error('❌ Usage: node scripts/approve_and_ingest.js --batch=TIMESTAMP');
  console.error('   TIMESTAMP is from the staged_[TIMESTAMP].json filename in scripts/staging/');
  process.exit(1);
}
const batchTimestamp = batchArg.replace('--batch=', '');
const stagingFile    = path.join(STAGING_DIR, `staged_${batchTimestamp}.json`);

if (!fs.existsSync(stagingFile)) {
  console.error(`❌ Staging file not found: ${stagingFile}`);
  console.error('   Run review_alfred_leads.js first.');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const payload = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
  const leads   = payload.leads || [];

  console.log(`\n🚀 Approve & Ingest — Batch ${batchTimestamp}`);
  console.log(`   Leads to ingest: ${leads.length}`);
  console.log(`   Collection: ${COLLECTION}`);
  console.log(`   Project: theaumengine\n`);

  if (leads.length === 0) {
    console.log('⚠️  No approved leads in this batch. Nothing to ingest.');
    process.exit(0);
  }

  let ingested  = 0;
  let skipped   = 0;
  const logLines = [
    `# Alfred Lead Ingest Log`,
    `**Batch:** ${batchTimestamp}`,
    `**Ingested at:** ${new Date().toLocaleString()}`,
    `**Collection:** \`${COLLECTION}\``,
    '',
    '| Name | Niche | City, State | Fit | Timing | Doc ID |',
    '|---|---|---|---|---|---|',
  ];

  // Process in batches of 400 (Firestore limit 500)
  const BATCH_SIZE = 400;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const lead of chunk) {
      // Promote from pending_review → New now that approved
      lead.status      = 'New';
      lead.ingestedAt  = new Date().toISOString();
      lead.batchId     = batchTimestamp;

      // Idempotent doc ID — same lead from same batch won't duplicate
      const docId = `alfred_${batchTimestamp}_${(lead.firstName || 'x').toLowerCase()}_${(lead.lastName || 'x').toLowerCase()}`
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 100);

      const ref = db.collection(COLLECTION).doc(docId);
      batch.set(ref, lead, { merge: true });

      const row = `| ${lead.firstName} ${lead.lastName} | ${lead.niche} | ${lead.city || '—'}, ${lead.state || '—'} | ${lead.fitScore || '—'} | ${lead.timingScore || '—'} | \`${docId}\` |`;
      logLines.push(row);
      console.log(`  ✅ Queued: ${lead.firstName} ${lead.lastName} — ${lead.niche} — ${lead.city}, ${lead.state}`);
      ingested++;
    }

    await batch.commit();
    console.log(`  → Batch committed (${chunk.length} docs)`);
  }

  // ── Archive incoming JSON files ───────────────────────────
  if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  const incomingFiles = fs.readdirSync(INCOMING_DIR).filter(f => f.endsWith('.json'));
  for (const f of incomingFiles) {
    fs.renameSync(
      path.join(INCOMING_DIR, f),
      path.join(PROCESSED_DIR, `${batchTimestamp}_${f}`)
    );
    console.log(`  📦 Archived: ${f} → processed/${batchTimestamp}_${f}`);
  }

  // ── Write ingest log ─────────────────────────────────────
  logLines.push('');
  logLines.push(`**Total ingested:** ${ingested}`);
  logLines.push(`**Total skipped:**  ${skipped}`);

  const existingLog = fs.existsSync(INGEST_LOG) ? fs.readFileSync(INGEST_LOG, 'utf8') : '';
  fs.writeFileSync(INGEST_LOG, logLines.join('\n') + '\n\n---\n\n' + existingLog);

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`🏁 Ingest complete`);
  console.log(`   ✅ Ingested: ${ingested} leads → ${COLLECTION}`);
  console.log(`   📦 Incoming files archived to incoming/processed/`);
  console.log(`   📋 Log appended to staging/ingest_log.md`);
  console.log('─'.repeat(50) + '\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Ingest failed:', err);
  process.exit(1);
});
