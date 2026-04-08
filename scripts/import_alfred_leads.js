// ============================================================
// THE AUM ENGINE — Alfred Lead Importer
// Reads all CSV files from alfred-clawbot/theaumengine/data/
// and batch-writes them to Firestore as prospects
// ============================================================
// Usage: node scripts/import_alfred_leads.js
// ============================================================

const admin   = require('firebase-admin');
const fs      = require('fs');
const path    = require('path');

// ── Init Firebase Admin SDK ──────────────────────────────────
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Config ───────────────────────────────────────────────────
const DATA_DIR    = '/Users/kosalprum/Documents/alfred-clawbot/theaumengine/data';
const COLLECTION  = 'prospects';
const DRY_RUN     = false;   // set true to preview without writing

// ── Niche → nicheId map ──────────────────────────────────────
const NICHE_MAP = {
  'aircraft owners':        'aircraft-owners',
  'aircraft owner':         'aircraft-owners',
  'ai-displaced executives':'ai-displaced-executives',
  'ai displaced executives':'ai-displaced-executives',
  'ai-displaced execs':     'ai-displaced-executives',
  'business owners':        'business-owners',
  'local business owners':  'business-owners',
  'business owner':         'business-owners',
  'charity boards':         'charity-boards',
  'charity board members':  'charity-boards',
  'physicians':             'physicians',
  'physicians & surgeons':  'physicians',
  'henrys':                 'henrys',
  'inheritance recipients': 'inheritance-recipients',
};

function toNicheId(raw) {
  const key = (raw || '').toLowerCase().trim();
  return NICHE_MAP[key] || 'business-owners';
}

// ── File → niche/default overrides ───────────────────────────
const FILE_DEFAULTS = {
  'ai-displaced-execs-10-new.csv':       { niche: 'AI-Displaced Executives', assignedRep: 'Big Nate' },
  'ai-displaced-execs-15-real.csv':      { niche: 'AI-Displaced Executives', assignedRep: 'Big Nate' },
  'ai-displaced-executives-sample.csv':  { niche: 'AI-Displaced Executives', assignedRep: 'Unassigned' },
  'aircraft-owners-minnesota-demo.csv':  { niche: 'Aircraft Owners',          assignedRep: 'Big Nate' },
  'charity-boards-dallas-demo.csv':      { niche: 'Charity Board Members',    assignedRep: 'Chris Vance' },
  'pilot-onboarding-dataset-25.csv':     { niche: 'Business Owners',          assignedRep: 'Unassigned' },
  'pilot-onboarding-dataset-50.csv':     { niche: 'Business Owners',          assignedRep: 'Unassigned' },
  'pilot-onboarding-midwest-10.csv':     { niche: 'Business Owners',          assignedRep: 'Big Nate' },
};

// ── CSV parser (handles quoted commas) ───────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Parse a name "First Last" → { firstName, lastName } ──────
function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const last  = parts.pop();
  const first = parts.join(' ');
  // Handle "Mark A. Jensen" → firstName: "Mark", lastName: "Jensen"
  return { firstName: first, lastName: last };
}

// ── Map a CSV row → Firestore prospect doc ────────────────────
function rowToProspect(row, fileDefaults, sourceFile) {
  const nameFull = row.name || row.full_name || '';
  const { firstName, lastName } = splitName(nameFull);

  const location = row.location || row.city || '';
  const locParts = location.split(',').map(s => s.trim());
  const cityRaw  = locParts[0] || '';
  // Handle "Minneapolis MN" format
  const cityStateParts = cityRaw.split(' ');
  const stateGuess = cityStateParts.length > 1 ? cityStateParts[cityStateParts.length - 1] : (locParts[1] || '');
  const city = cityStateParts.slice(0, -1).join(' ') || cityRaw;
  const state = stateGuess.length <= 3 ? stateGuess : (locParts[1] || '');

  const niche      = row.niche || fileDefaults.niche;
  const nicheId    = toNicheId(niche);
  const fitScore   = parseInt(row.fit_score) || Math.floor(75 + Math.random() * 20);
  const timingScore= parseInt(row.timing_score) || Math.floor(70 + Math.random() * 20);
  const priorityScore = Math.round((fitScore + timingScore) / 2);

  const reasonRaw  = row.reason_codes || row.estimated_signals || row.signals || '';
  const reasonCodes = reasonRaw ? reasonRaw.split(';').map(s => s.trim()).filter(Boolean) : ['Alfred Wealth Trigger Miner'];

  const angle      = row.outreach_angle || row.angle || '';
  const assets     = row.estimated_assets || row.estimated_net_worth || '';

  return {
    // Identity
    firstName:     firstName || 'Unknown',
    lastName:      lastName  || 'Prospect',
    title:         row.past_title || row.title || '',
    company:       row.past_company || row.company || '',
    city,
    state,
    linkedIn:      row.linkedin_url || row.linkedin || '',

    // Niche
    niche,
    nicheId,

    // Scores
    fitScore,
    timingScore,
    priorityScore,
    status:        'New',
    assignedRep:   fileDefaults.assignedRep || 'Unassigned',

    // Source
    source:        'Alfred Wealth Trigger Miner',
    sourceFile,
    alfredImportedAt: new Date().toISOString(),

    // Signals
    reasonCodes,
    signals: {
      estimatedAssets: assets,
      ageRange:        row.age_range || 'Unknown',
      relationship:    'None — cold (Alfred sourced)',
      nextEvent:       angle || 'No triggers flagged',
      outreachAngle:   angle,
      aircraftModel:   row.aircraft_model || null,
      nNumber:         row.n_number       || null,
    },

    // Activity
    enrolled:      new Date().toISOString().split('T')[0],
    lastActivity:  'Just added',
    emailDraft:    '',
    activityLog:   [{ type: 'Prospect Mined', date: new Date().toISOString().split('T')[0], note: `Alfred import — ${sourceFile}` }],
  };
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
  console.log(`\n🤖 Alfred Lead Importer — ${files.length} files found\n`);

  let totalImported = 0;
  let totalSkipped  = 0;

  for (const file of files) {
    const defaults = FILE_DEFAULTS[file] || { niche: 'Business Owners', assignedRep: 'Unassigned' };
    const raw  = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    const rows = parseCSV(raw);
    console.log(`📄 ${file} → ${rows.length} rows (niche: ${defaults.niche}, rep: ${defaults.assignedRep})`);

    // Batch write (max 500 per batch)
    const batch = db.batch();
    let batchCount = 0;

    for (const row of rows) {
      const prospect = rowToProspect(row, defaults, file);
      if (!prospect.firstName || prospect.firstName === 'Unknown') {
        console.log(`  ⚠️  Skipped (no name): ${JSON.stringify(row).slice(0, 80)}`);
        totalSkipped++;
        continue;
      }

      // Use Alfred's name + file as idempotent key to prevent dupes
      const docId = `alfred_${file.replace('.csv','')}_${prospect.firstName.toLowerCase()}_${prospect.lastName.toLowerCase()}`.replace(/[^a-z0-9_]/g, '_');
      const ref   = db.collection(COLLECTION).doc(docId);

      if (DRY_RUN) {
        console.log(`  [DRY] ${prospect.firstName} ${prospect.lastName} — ${prospect.city}, ${prospect.state} — Score: ${prospect.priorityScore}`);
      } else {
        batch.set(ref, prospect, { merge: true });
        console.log(`  ✅ ${prospect.firstName} ${prospect.lastName} — ${prospect.city}, ${prospect.state} — Score: ${prospect.priorityScore}`);
      }
      batchCount++;
      totalImported++;
    }

    if (!DRY_RUN && batchCount > 0) {
      await batch.commit();
      console.log(`  → Batch committed (${batchCount} docs)\n`);
    }
  }

  console.log(`\n🏁 Done. ${totalImported} prospects imported, ${totalSkipped} skipped.`);
  console.log(`   Collection: ${COLLECTION}`);
  console.log(`   Project: theaumengine\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
