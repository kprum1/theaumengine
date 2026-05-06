#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Proxycurl (NinjaPear) Enrichment Agent
// scripts/agent_proxycurl_enrich.js
//
// Targets leads with LinkedIn URL but no email AND no phone.
// Uses NinjaPear/Proxycurl Person Lookup API.
// API key: scripts/config/proxycurl.json → { "apiKey": "..." }
//
// Cost: ~$0.05 per successful lookup (Personal Email add-on)
//   7 remaining leads × $0.05 = ~$0.35
//
// Usage:
//   node scripts/agent_proxycurl_enrich.js --dry-run
//   node scripts/agent_proxycurl_enrich.js
//   node scripts/agent_proxycurl_enrich.js --niche pro-athletes
//   node scripts/agent_proxycurl_enrich.js --limit 10
// ============================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// ── Load API key ─────────────────────────────────────────────
function loadApiKey() {
  if (process.env.PROXYCURL_API_KEY) return process.env.PROXYCURL_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'proxycurl.json'), 'utf8'));
    if (cfg.apiKey) return cfg.apiKey;
  } catch {}
  return '';
}

// ── CLI args ─────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN    = args.includes('--dry-run');
const NICHE_ONLY = getArg('--niche') || null;
const LIMIT      = parseInt(getArg('--limit') || '50', 10);
const DELAY_MS   = 1200;
const sleep      = ms => new Promise(r => setTimeout(r, ms));

// ── Normalize LinkedIn URL ────────────────────────────────────
function normalizeLinkedInUrl(raw) {
  if (!raw) return null;
  let url = raw.trim();
  url = url.replace(/^(https?:\/\/)?(www\.)?/i, '');
  if (!url.startsWith('linkedin.com/in/')) return null;
  const slug = url.replace(/^linkedin\.com\/in\//i, '').replace(/\/+$/, '');
  return `https://www.linkedin.com/in/${slug}`;
}

// ── Proxycurl API call ────────────────────────────────────────
function proxycurlLookup(linkedInUrl, apiKey) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      url:                     linkedInUrl,
      personal_email:          'include',
      personal_contact_number: 'include',
      fallback_to_cache:       'on-error',
      use_cache:               'if-present',
    });

    const options = {
      hostname: 'nubela.co',
      path:     `/proxycurl/api/v2/linkedin?${params.toString()}`,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept':        'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ ok: true, data: JSON.parse(body) }); }
          catch { resolve({ ok: false, error: 'JSON parse error' }); }
        } else {
          resolve({ ok: false, error: `HTTP ${res.statusCode}`, status: res.statusCode });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Proxycurl Enrichment Agent                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const API_KEY = loadApiKey();
  if (!API_KEY) {
    console.error('❌ No Proxycurl key found in scripts/config/proxycurl.json');
    process.exit(1);
  }

  if (DRY_RUN) console.log('  🔍 DRY RUN — no API calls or writes\n');
  if (NICHE_ONLY) console.log(`  Niche filter: ${NICHE_ONLY}`);
  console.log(`  Limit: ${LIMIT} leads\n`);

  // ── Load candidates ──────────────────────────────────────
  console.log('Loading leads from Firestore...');
  const snap = await db.collection('master_leads').get();

  const candidates = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (NICHE_ONLY && d.nicheId !== NICHE_ONLY) return;
    if (d._purgeFlag) return;

    const hasLinkedIn = !!(d.linkedInUrl && typeof d.linkedInUrl === 'string' && d.linkedInUrl.includes('linkedin.com'));
    const hasEmail    = !!(d.email && typeof d.email === 'string' && d.email.trim());
    const hasPhone    = !!(d.phone && typeof d.phone === 'string' && d.phone.trim());
    const normalUrl   = normalizeLinkedInUrl(d.linkedInUrl);

    if (hasLinkedIn && !hasEmail && !hasPhone && normalUrl) {
      candidates.push({
        docId:       doc.id,
        name:        `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        nicheId:     d.nicheId,
        linkedInUrl: normalUrl,
        city:        d.city  || '',
        state:       d.state || '',
      });
    }
  });

  const toProcess = candidates.slice(0, LIMIT);
  console.log(`Candidates:  ${candidates.length} LinkedIn-only leads (no email, no phone)`);
  console.log(`Processing:  ${toProcess.length} this run`);
  console.log(`Est. cost:   ~$${(toProcess.length * 0.05).toFixed(2)} (@ $0.05/lead)\n`);

  if (toProcess.length === 0) {
    console.log('✅ No candidates — all LinkedIn leads already have contact data.');
    process.exit(0);
  }

  // ── Process ───────────────────────────────────────────────
  const stats  = { enriched: 0, noContact: 0, error: 0, credits: 0 };
  const toWrite = [];

  for (let i = 0; i < toProcess.length; i++) {
    const lead  = toProcess[i];
    const idx   = `[${String(i + 1).padStart(3)}/${toProcess.length}]`;
    const lbl   = `${idx} ${lead.name.padEnd(36)}`;

    if (DRY_RUN) {
      console.log(`  ${lbl} → 🔍 ${lead.linkedInUrl}`);
      continue;
    }

    const res = await proxycurlLookup(lead.linkedInUrl, API_KEY);

    if (!res.ok) {
      if (res.status === 401 || res.status === 402) {
        console.log(`  ${lbl} → ❌ FATAL: ${res.error}`);
        break;
      }
      console.log(`  ${lbl} → ❌ ${res.error}`);
      stats.error++;
      if (i < toProcess.length - 1) await sleep(DELAY_MS);
      continue;
    }

    const d = res.data;
    stats.credits++;

    const emails = d.personal_emails || [];
    const phones = d.personal_numbers || [];
    const gotEmail = emails.length > 0;
    const gotPhone = phones.length > 0;

    if (!gotEmail && !gotPhone) {
      console.log(`  ${lbl} → ⚠️  Profile found — no personal email/phone`);
      stats.noContact++;
      if (i < toProcess.length - 1) await sleep(DELAY_MS);
      continue;
    }

    const fields = [];
    if (gotEmail) fields.push('email');
    if (gotPhone) fields.push('phone');
    if (d.public_identifier) fields.push('LinkedIn✓');
    console.log(`  ${lbl} → ✅ Got: ${fields.join(', ')}`);
    stats.enriched++;

    const update = {
      _proxycurlEnriched:   true,
      _proxycurlEnrichedAt: new Date().toISOString(),
    };
    if (gotEmail) update.email = emails[0];
    if (gotPhone) update.phone = phones[0];
    if (d.public_identifier) update.linkedInUrl = `https://www.linkedin.com/in/${d.public_identifier}`;
    if (d.city  && !lead.city)  update.city  = d.city;
    if (d.state && !lead.state) update.state = d.state;

    // Title from current position
    if (d.experiences && d.experiences.length > 0) {
      const cur = d.experiences.find(e => !e.ends_at) || d.experiences[0];
      if (cur.title)   update.title   = cur.title;
      if (cur.company) update.company = cur.company;
    }
    toWrite.push({ docId: lead.docId, update });

    if (i < toProcess.length - 1) await sleep(DELAY_MS);
  }

  // ── Write to Firestore ────────────────────────────────────
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n── Writing ${toWrite.length} enrichment updates to Firestore...`);
    const batch = db.batch();
    toWrite.forEach(({ docId, update }) => {
      batch.update(db.collection('master_leads').doc(docId), update);
    });
    await batch.commit();
    console.log(`  ✅ Batch committed (${toWrite.length} docs)`);
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PROXYCURL ENRICHMENT SUMMARY                            ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Enriched (email/phone written):  ${String(stats.enriched).padEnd(20)}║`);
  console.log(`║  ⚠️  Profile found, no contact:      ${String(stats.noContact).padEnd(20)}║`);
  console.log(`║  ❌ Error / not found:               ${String(stats.error).padEnd(20)}║`);
  console.log(`║  💳 Credits used:                    ${String(stats.credits).padEnd(20)}║`);
  console.log(`║  💰 Est. cost:                       $${String((stats.credits * 0.05).toFixed(2)).padEnd(19)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!DRY_RUN && stats.enriched > 0) {
    console.log('\n  node scripts/enrichment_status_report.js');
  } else if (DRY_RUN) {
    console.log('\n  DRY RUN — run without --dry-run to execute.\n');
  }
  process.exit(0);
}

main().catch(e => { console.error('[Proxycurl] FATAL:', e.message); process.exit(1); });
