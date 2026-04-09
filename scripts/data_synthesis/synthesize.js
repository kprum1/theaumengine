// ======================================================================
// AUM ENGINE — Master Data Synthesis Orchestrator
// scripts/data_synthesis/synthesize.js
//
// Runs all data scrapers in sequence and drops results into incoming/
// ready for the review → bouncer → approve → route pipeline.
//
// Usage:
//   node scripts/data_synthesis/synthesize.js [options]
//
// Options:
//   --sources=dol,sec,warn   Comma-separated list (default: all)
//   --state=MN               State code to filter (default: MN)
//   --limit=25               Leads per source (default: 25)
//   --dry-run                Don't write files, just show what would run
//
// Sources:
//   dol   → DOL Form 5500    (business owners with 401k data)
//   sec   → SEC Form 4       (C-suite RSU/equity events)
//   warn  → WARN Act notices (AI-displaced execs / layoffs)
//
// After running:
//   node scripts/review_alfred_leads.js
//   node scripts/bouncer_agent.js --batch=[timestamp]
//   node scripts/approve_and_ingest.js --batch=bounced_[timestamp]
//   node scripts/routing_engine.js
// ======================================================================

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const stateArg = args.find(a => a.startsWith('--state='));
const limitArg = args.find(a => a.startsWith('--limit='));
const srcArg   = args.find(a => a.startsWith('--sources='));
const STATE    = stateArg ? stateArg.replace('--state=', '').toUpperCase() : 'MN';
const LIMIT    = limitArg ? limitArg.replace('--limit=', '') : '25';
const SOURCES  = srcArg   ? srcArg.replace('--sources=', '').split(',') : ['dol', 'sec', 'warn'];

const SCRIPTS_DIR    = path.join(__dirname);
const INCOMING_DIR   = path.join(__dirname, '..', 'incoming');
const DATE           = new Date().toISOString().slice(0, 10);

// ── Source definitions ─────────────────────────────────────────
const SOURCE_CONFIGS = {
  dol: {
    label:   'DOL Form 5500 (Business Owners / 401k)',
    script:  path.join(SCRIPTS_DIR, 'fetch_dol_5500.js'),
    flags:   [`--state=${STATE}`, `--limit=${LIMIT}`, '--min-assets=3000000'],
    niche:   'business-owners',
    timing:  'Standard (file within 7 days)',
  },
  sec: {
    label:   'SEC Form 4 (C-Suite RSU Vesting)',
    script:  path.join(SCRIPTS_DIR, 'fetch_sec_form4.js'),
    flags:   [STATE ? `--state=${STATE}` : '', `--limit=${LIMIT}`, '--days=7'].filter(Boolean),
    niche:   'c-suite-executives',
    timing:  '⚡ URGENT (route within 48hrs of filing)',
  },
  warn: {
    label:   'WARN Act (AI-Displaced / Layoff Events)',
    script:  path.join(SCRIPTS_DIR, 'fetch_warn_act.js'),
    flags:   [`--state=${STATE}`, `--limit=${LIMIT}`],
    niche:   'ai-displaced-executives',
    timing:  'High (401k rollover window — 30-60 days)',
  },
};

// ── Simple WARN Act inline fetch (no separate file needed for MVP) ──
function createWarnLeads(state, limit) {
  // WARN Act data is state-specific and harder to get via API.
  // Most states publish PDFs or Excel files — not ideal for automation yet.
  // For now: generate placeholder referencing the real DOL source.
  // Alfred (OpenClaw) is better suited to pull WARN Act notices manually.
  console.log(`   ℹ️  WARN Act: State-by-state PDF/Excel sources — best handled by Alfred.`);
  console.log(`   📎 ${state} WARN Act notices: https://www.dol.gov/agencies/eta/layoffs/warn`);
  console.log(`   💡 Ask Alfred to pull ${state} WARN notices and drop to incoming/\n`);
  return null;
}

// ── Run a single scraper ───────────────────────────────────────
function runScraper(config, sourceKey) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`🔬 Running: ${config.label}`);
  console.log(`   Niche: ${config.niche} | Timing: ${config.timing}`);

  if (sourceKey === 'warn') {
    createWarnLeads(STATE, parseInt(LIMIT));
    return { success: true, skipped: true };
  }

  if (!fs.existsSync(config.script)) {
    console.log(`   ❌ Script not found: ${config.script}`);
    return { success: false };
  }

  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would run: node ${path.basename(config.script)} ${config.flags.join(' ')}`);
    return { success: true, dryRun: true };
  }

  const result = spawnSync(
    'node',
    [config.script, ...config.flags],
    { cwd: path.join(__dirname, '..', '..'), stdio: 'inherit', timeout: 60000 }
  );

  if (result.status !== 0) {
    console.log(`   ⚠️  Scraper exited with code ${result.status}`);
    return { success: false, code: result.status };
  }

  return { success: true };
}

// ── Count files dropped ────────────────────────────────────────
function countIncoming() {
  if (!fs.existsSync(INCOMING_DIR)) return 0;
  return fs.readdirSync(INCOMING_DIR).filter(f => f.endsWith('.json')).length;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — Data Synthesis Engine                 ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   State: ${STATE.padEnd(5)} | Limit: ${LIMIT.padEnd(4)} | Sources: ${SOURCES.join(',')}`.padEnd(55) + '║');
  console.log(DRY_RUN ?
  '║   MODE: DRY RUN — no files written                   ║' :
  '║   MODE: LIVE — writing to scripts/incoming/          ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const startCount = countIncoming();
  const results = {};

  for (const src of SOURCES) {
    const config = SOURCE_CONFIGS[src];
    if (!config) {
      console.log(`\n⚠️  Unknown source: "${src}" — skipping. Valid: dol, sec, warn`);
      continue;
    }
    results[src] = runScraper(config, src);
  }

  const endCount = countIncoming();
  const newFiles = endCount - startCount;

  console.log(`\n${'─'.repeat(55)}`);
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Synthesis complete                                 ║');
  console.log(`║   New files in incoming/: ${String(newFiles).padEnd(28)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  if (newFiles > 0 && !DRY_RUN) {
    console.log('🚀 Pipeline next steps:');
    console.log('');
    console.log('   1. REVIEW (sanitize + security check):');
    console.log('      node scripts/review_alfred_leads.js');
    console.log('');
    console.log('   2. BOUNCE (DNC + dupe check):');
    console.log('      node scripts/bouncer_agent.js --batch=[timestamp from step 1]');
    console.log('');
    console.log('   3. APPROVE (write to Firestore masterLeads):');
    console.log('      node scripts/approve_and_ingest.js --batch=bounced_[timestamp]');
    console.log('');
    console.log('   4. ROUTE (assign to advisors via al_assignments):');
    console.log('      node scripts/routing_engine.js --dry-run  # preview first');
    console.log('      node scripts/routing_engine.js             # live assign');
    console.log('');
  }
}

main().catch(err => {
  console.error('❌ Synthesis orchestrator failed:', err.message);
  process.exit(1);
});
