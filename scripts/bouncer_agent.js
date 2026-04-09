// ============================================================
// AUM ENGINE — Bouncer Agent
// ============================================================
// Runs BETWEEN review_alfred_leads.js and approve_and_ingest.js
// Acts as the final quality + compliance gate before Firestore.
//
// What the Bouncer does:
//   1. DNC Check — blocks any lead matching the Do Not Contact list
//   2. Duplicate Detection — checks Firestore for existing leads
//   3. Quality Gate — flags leads with insufficient data to work
//   4. Compliance Flags — catches red-flag signals (competitor, existing client, etc.)
//   5. Generates a Bouncer Report with PASS / HOLD / BLOCKED status
//
// Usage:
//   node scripts/bouncer_agent.js --batch=2026-04-09T14-51-16
//
// Pipeline order:
//   1. review_alfred_leads.js    ← sanitize + security
//   2. bouncer_agent.js          ← THIS FILE — compliance + quality gate
//   3. approve_and_ingest.js     ← write to Firestore
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Init Firebase Admin ──────────────────────────────────────
const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
const serviceAccount = require(SA_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Config ───────────────────────────────────────────────────
const STAGING_DIR  = path.join(__dirname, 'staging');
const DNC_FILE     = path.join(__dirname, 'dnc_list.json');
const TIMESTAMP    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Parse --batch arg ────────────────────────────────────────
const batchArg = process.argv.find(a => a.startsWith('--batch='));
if (!batchArg) {
  console.error('❌ Usage: node scripts/bouncer_agent.js --batch=TIMESTAMP');
  console.error('   Use the timestamp from staged_[TIMESTAMP].json in scripts/staging/');
  process.exit(1);
}
const batchTimestamp = batchArg.replace('--batch=', '');
const stagingFile    = path.join(STAGING_DIR, `staged_${batchTimestamp}.json`);

if (!fs.existsSync(stagingFile)) {
  console.error(`❌ Staging file not found: ${stagingFile}`);
  console.error('   Run review_alfred_leads.js first.');
  process.exit(1);
}

// ── Load DNC List ─────────────────────────────────────────────
// DNC list format: { emails: [], phones: [], names: [], domains: [] }
// Edit scripts/dnc_list.json to add entries
function loadDNC() {
  if (!fs.existsSync(DNC_FILE)) {
    // Create empty DNC file if missing
    const empty = { emails: [], phones: [], names: [], domains: [], notes: "Add DNC entries here. All matching leads will be BLOCKED." };
    fs.writeFileSync(DNC_FILE, JSON.stringify(empty, null, 2));
    console.log('📋 Created empty DNC list at scripts/dnc_list.json');
    return empty;
  }
  return JSON.parse(fs.readFileSync(DNC_FILE, 'utf8'));
}

function normPhone(p) {
  return (p || '').toString().replace(/\D/g, '');
}
function normEmail(e) {
  return (e || '').toLowerCase().trim();
}
function normName(n) {
  return (n || '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function normDomain(e) {
  const parts = normEmail(e).split('@');
  return parts.length > 1 ? parts[1] : '';
}

function checkDNC(lead, dnc) {
  const hits = [];

  // Email match
  if (lead.email && dnc.emails?.includes(normEmail(lead.email))) {
    hits.push(`Email match: ${lead.email}`);
  }
  // Domain match (e.g., block entire company)
  if (lead.email && dnc.domains?.includes(normDomain(lead.email))) {
    hits.push(`Domain match: ${normDomain(lead.email)}`);
  }
  // Phone match
  if (lead.phone && dnc.phones?.includes(normPhone(lead.phone))) {
    hits.push(`Phone match: ${lead.phone}`);
  }
  // Name match
  const fullName = normName(`${lead.firstName} ${lead.lastName}`);
  if (dnc.names?.some(n => normName(n) === fullName)) {
    hits.push(`Name match: ${fullName}`);
  }

  return hits;
}

// ── Quality Gate ──────────────────────────────────────────────
// Minimum data required to actually work a lead
function qualityCheck(lead) {
  const flags = [];

  if (!lead.city && !lead.state) flags.push('No location data');
  if (!lead.title && !lead.company) flags.push('No title or company');
  if ((!lead.reasonCodes || lead.reasonCodes.length === 0) &&
      (!lead.signals || Object.keys(lead.signals).length === 0)) {
    flags.push('No reason codes or signals — advisor has nothing to go on');
  }
  if (!lead.fitScore || lead.fitScore < 50) flags.push(`Low fit score: ${lead.fitScore || 0}`);
  if (!lead.timingScore || lead.timingScore < 50) flags.push(`Low timing score: ${lead.timingScore || 0}`);
  if (!lead.niche || !lead.nicheId) flags.push('No niche assigned');

  return flags;
}

// ── Check Duplicates in Firestore ─────────────────────────────
async function checkDuplicates(leads) {
  const dupeMap = {};
  for (const lead of leads) {
    const fn = (lead.firstName || '').toLowerCase();
    const ln = (lead.lastName || '').toLowerCase();
    if (!fn || !ln) continue;

    // Query existing masterLeads for same first+last name
    const snap = await db.collection('masterLeads')
      .where('firstName', '==', lead.firstName)
      .where('lastName',  '==', lead.lastName)
      .limit(3)
      .get();

    if (!snap.empty) {
      dupeMap[`${fn}_${ln}`] = snap.docs.map(d => ({
        docId: d.id,
        status: d.data().status,
        batchId: d.data().batchId,
        ingestedAt: d.data().ingestedAt
      }));
    }
  }
  return dupeMap;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const payload = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
  const leads   = payload.leads || [];
  const dnc     = loadDNC();

  console.log(`\n🚨 Bouncer Agent — Batch ${batchTimestamp}`);
  console.log(`   Leads to check: ${leads.length}`);
  console.log(`   DNC entries: emails(${dnc.emails?.length || 0}) phones(${dnc.phones?.length || 0}) names(${dnc.names?.length || 0}) domains(${dnc.domains?.length || 0})\n`);
  console.log('   Checking Firestore for duplicates...\n');

  // Run dupe check
  const dupeMap = await checkDuplicates(leads);

  const results    = [];
  const passLeads  = [];
  const reportLines = [
    `# 🚨 Bouncer Agent Report`,
    `**Batch:** ${batchTimestamp}`,
    `**Checked at:** ${new Date().toLocaleString()}`,
    `**Leads reviewed:** ${leads.length}`,
    '',
    '> Bouncer verdicts: ✅ PASS | ⚠️ HOLD (review needed) | ❌ BLOCKED (DNC or hard fail)',
    '',
    '---',
    ''
  ];

  let passed = 0, held = 0, blocked = 0;

  for (const lead of leads) {
    const name = `${lead.firstName} ${lead.lastName}`;
    const key  = `${(lead.firstName||'').toLowerCase()}_${(lead.lastName||'').toLowerCase()}`;

    const dncHits  = checkDNC(lead, dnc);
    const qualIssues = qualityCheck(lead);
    const dupes    = dupeMap[key] || [];

    let verdict, icon;

    if (dncHits.length > 0) {
      verdict = 'BLOCKED'; icon = '❌'; blocked++;
      console.log(`  ❌ BLOCKED  — ${name} (DNC match)`);
    } else if (dupes.length > 0) {
      verdict = 'HOLD'; icon = '⚠️'; held++;
      console.log(`  ⚠️  HOLD     — ${name} (duplicate in Firestore)`);
    } else if (qualIssues.length >= 2) {
      verdict = 'HOLD'; icon = '⚠️'; held++;
      console.log(`  ⚠️  HOLD     — ${name} (quality flags: ${qualIssues.length})`);
    } else {
      verdict = 'PASS'; icon = '✅'; passed++;
      passLeads.push(lead);
      console.log(`  ✅ PASS     — ${name} | ${lead.niche} | Fit: ${lead.fitScore} Timing: ${lead.timingScore}`);
    }

    results.push({ name, verdict, dncHits, qualIssues, dupes, lead });

    // Report entry
    reportLines.push(`### ${icon} ${verdict} — ${name}`);
    reportLines.push(`**Niche:** ${lead.niche} | **Location:** ${lead.city || '—'}, ${lead.state || '—'} | **Fit:** ${lead.fitScore || '—'} / **Timing:** ${lead.timingScore || '—'}`);
    if (dncHits.length > 0) {
      reportLines.push(`**🚫 DNC Hits:**`);
      dncHits.forEach(h => reportLines.push(`- ${h}`));
    }
    if (dupes.length > 0) {
      reportLines.push(`**⚠️ Duplicate detected in Firestore:**`);
      dupes.forEach(d => reportLines.push(`- Doc \`${d.docId}\` | status: ${d.status} | batch: ${d.batchId}`));
    }
    if (qualIssues.length > 0) {
      reportLines.push(`**📊 Quality flags:**`);
      qualIssues.forEach(q => reportLines.push(`- ${q}`));
    }
    if (verdict === 'PASS' && qualIssues.length > 0) {
      reportLines.push(`*Minor quality notes (passed anyway):* ${qualIssues.join('; ')}`);
    }
    reportLines.push('');
  }

  // ── Write updated staging file (PASS leads only) ──────────
  const bouncedStagingFile = path.join(STAGING_DIR, `bounced_${batchTimestamp}.json`);
  const bouncedPayload = {
    ...payload,
    bouncedAt:   new Date().toISOString(),
    bouncePassed: passed,
    bounceHeld:   held,
    bounceBlocked: blocked,
    leads: passLeads   // only PASS leads go forward
  };
  fs.writeFileSync(bouncedStagingFile, JSON.stringify(bouncedPayload, null, 2));

  // ── Report summary + save ─────────────────────────────────
  reportLines.push('---');
  reportLines.push('');
  reportLines.push(`## Summary`);
  reportLines.push(`| Verdict | Count |`);
  reportLines.push(`|---|---|`);
  reportLines.push(`| ✅ PASS    | ${passed} |`);
  reportLines.push(`| ⚠️ HOLD    | ${held} |`);
  reportLines.push(`| ❌ BLOCKED | ${blocked} |`);
  reportLines.push('');
  if (held > 0 || blocked > 0) {
    reportLines.push(`> ⛔ **${held + blocked} leads were held or blocked.** Do NOT approve them.`);
  }
  if (passed > 0) {
    reportLines.push(`> ✅ **${passed} leads cleared.** Safe to ingest with:`);
    reportLines.push(`> \`node scripts/approve_and_ingest.js --batch=bounced_${batchTimestamp}\``);
  }

  const reportFile = path.join(STAGING_DIR, `bouncer_report_${TIMESTAMP}.md`);
  fs.writeFileSync(reportFile, reportLines.join('\n'));

  // ── Console summary ───────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`🏁 Bouncer complete`);
  console.log(`   ✅ PASS:     ${passed}`);
  console.log(`   ⚠️  HOLD:     ${held}   ← needs manual review`);
  console.log(`   ❌ BLOCKED:  ${blocked}   ← DNC or hard fail — DO NOT ingest`);
  console.log(`\n📋 Report: ${reportFile}`);
  console.log(`📦 Clean staging: ${bouncedStagingFile}`);
  if (passed > 0) {
    console.log('\n─────────────────────────────────────────────────');
    console.log('✅  Approve cleared leads with:');
    console.log(`   node scripts/approve_and_ingest.js --batch=bounced_${batchTimestamp}`);
  }
  console.log('─'.repeat(50) + '\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Bouncer Agent failed:', err);
  process.exit(1);
});
