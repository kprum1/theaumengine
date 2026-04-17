#!/usr/bin/env node
// scripts/niche_breakdown.js
// Shows lead count per nicheId + fixes Jeremy's missing states field
'use strict';

const admin = require('firebase-admin');
const sa    = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const ALL_13_NICHES = [
  'physicians', 'dentists', 'business-owners', 'c-suite-executives',
  'law-partners', 'henrys', 'high-earning-tradesman', 'aircraft-owners',
  'yacht-owners', 'inheritance', 'pro-athletes', 'charity-board-members',
  'ai-displaced-executives',
];

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — NICHE BREAKDOWN + JEREMY FIX            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Fix Jeremy's missing states field ────────────────────────────────────
  const poolSnap = await db.collection('advisor_pool').get();
  for (const doc of poolSnap.docs) {
    const d = doc.data();
    if (d.firmName && d.firmName.includes('Ameriprise')) {
      const states = d.states;
      if (!states || states.length === 0) {
        await doc.ref.update({ states: ['MN'], licensedStates: ['MN'] });
        console.log('  ✓ Fixed Jeremy states → [MN]');
      } else {
        console.log(`  ✓ Jeremy states already set: [${states}]`);
      }
    }
  }

  // ── niche breakdown from master_leads ────────────────────────────────────
  const snap = await db.collection('master_leads').get();
  const nicheCounts = {};
  snap.forEach(doc => {
    const d = doc.data();
    const n = d.nicheId || 'unknown';
    nicheCounts[n] = (nicheCounts[n] || 0) + 1;
  });

  console.log('\n── master_leads by nicheId (' + snap.size + ' total) ───────────────────');
  console.log('  nicheId'.padEnd(34) + 'count    status');
  console.log('  ' + '─'.repeat(52));

  // Show all 13 niches, mark missing
  for (const niche of ALL_13_NICHES) {
    const count = nicheCounts[niche] || 0;
    const bar   = '█'.repeat(Math.min(Math.round(count/5), 20));
    const flag  = count === 0 ? '  ← 🔴 ZERO LEADS' : count < 10 ? '  ← ⚠️ thin' : '';
    console.log(`  ${niche.padEnd(34)}${String(count).padStart(3)}  ${bar}${flag}`);
  }

  // Show any unexpected niches
  const known = new Set(ALL_13_NICHES);
  const extra = Object.entries(nicheCounts).filter(([k]) => !known.has(k));
  if (extra.length) {
    console.log('\n  ── Non-standard nicheIds ──────────────────────────────');
    extra.forEach(([k, v]) => console.log(`  ${k.padEnd(34)}${v}`));
  }

  console.log('\n── Gap Summary ──────────────────────────────────────────────');
  const zeros = ALL_13_NICHES.filter(n => !nicheCounts[n]);
  const thin  = ALL_13_NICHES.filter(n => nicheCounts[n] > 0 && nicheCounts[n] < 15);
  if (zeros.length) console.log('  🔴 Zero coverage: ' + zeros.join(', '));
  if (thin.length)  console.log('  ⚠️  Thin (<15):    ' + thin.join(', '));
  if (!zeros.length && !thin.length) console.log('  ✅ All niches have 15+ leads');

  console.log('\n── Mining commands to fill gaps ─────────────────────────────');
  console.log('  # Physicians (MN geo runs):');
  console.log('  node scripts/agent_npi_miner.js --niche physicians --geo "Eden Prairie, MN" --limit 30');
  console.log('  node scripts/agent_npi_miner.js --niche physicians --geo "Plymouth, MN" --limit 30');
  console.log('  node scripts/agent_npi_miner.js --niche physicians --geo "Edina, MN" --limit 30');
  console.log('  node scripts/agent_npi_miner.js --niche physicians --geo "Minnetonka, MN" --limit 30');
  console.log('  # Dentists (MN):');
  console.log('  node scripts/agent_npi_miner.js --niche dentists --state MN --limit 50');
  console.log('  # Aircraft (MN):');
  console.log('  node scripts/agent_faa_miner.js --state MN --limit 60');
  console.log('  # HENRYs (MN employers now in list):');
  console.log('  node scripts/agent_henrys_miner.js --mode h1b --limit 30');
  console.log('');

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
