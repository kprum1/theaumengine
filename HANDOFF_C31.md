# HANDOFF_C31.md — Sprint C31: A12 HENRYs Ingest + Cockpit Blank Name Fix
**Session Date:** 2026-04-17
**Time:** ~12:00 PM – 12:10 PM CT
**Platform:** The AUM Engine — `https://theaumengine.web.app`
**Project Root:** `/Users/kosalprum/Documents/AdvDiamondMining`
**Firebase Project:** `theaumengine`
**Node Path:** `/opt/homebrew/opt/node/bin/node`
**HEAD Commit:** `6106f5d`
**Last Audit:** ✅ 10/10 — All systems go
**master_leads:** 487 docs (+20 HENRYs from 467)

---

## 🎯 Session Objective
Execute top 3 priorities from HANDOFF_C30:
1. ✅ Priority 3 — Cockpit blank name fix for tradesman/business-level leads
2. ✅ Priority 2 — Scrub + ingest A12 HENRYs batch
3. ⏳ Priority 1 — Apollo enrichment (requires manual API key setup — see Open Items)
4. ⏳ Priority 4 — FL probate Vera dispatch (unchanged from C30)

---

## ✅ What Was Built This Session

### Item 1 — Cockpit Blank Name Fix (`6106f5d`)
**Symptom:** Tradesman and business-level leads (with empty `firstName`/`lastName`) appeared as blank name cards in every cockpit view.

**Root cause:** All 7 display points hardcoded `${p.firstName} ${p.lastName}` — no fallback when both are empty.

**Fix — 3 files:**

**`js/data.js`** — Added 2 new utility functions:

```javascript
// Updated: company name as 3rd fallback for initials
function getInitials(first, last, company) {
  // ...if both blank → companies like "Genz-Ryan Plumbing" → "GP"
}

// NEW: returns company name when firstName/lastName are both empty
function getDisplayName(p) {
  const first = (p.firstName || '').trim();
  const last  = (p.lastName  || '').trim();
  if (first || last) return `${first} ${last}`.trim();
  return (p.company || '').trim() || 'Unnamed Lead';
}
```

**`js/app.js`** — 2 locations patched:
- L309: Niche drawer prospect rows → `getDisplayName(p)` + `getInitials(..., p.company)`
- L1449: Prospect detail drawer header → same

**`js/pages.js`** — 6 locations patched:
- L236: Command Center "Top 8" queue
- L405: Lead Scoreboard table rows
- L473: Outreach Studio prospect selector
- L614: Pipeline board (Nurture & Booking)
- L658: Upcoming meetings table
- L695: Meeting Prep selector

**Result:** All 17 tradesman leads now display company name (e.g. "Genz-Ryan Plumbing") instead of blank. Avatars show company initials ("GP"). Fix is backward-compatible — named leads are unaffected.

---

### Item 2 — A12 HENRYs Batch: Mined + Scrubbed + Ingested + Routed (`6106f5d`)

**Miner fixes applied before running:**
1. `agent_henrys_miner.js` — S-1 mode city/state: was `''` → now `'Remote'` / `'US'` so scrubber accepts company-level records (individual location requires LinkedIn enrichment, same pattern as A10 tradesman)
2. `agent_henrys_miner.js` — Stale routing warning removed/corrected: Firestore advisor_pool has **3 advisors covering henrys** (Wight, Germshied, Fin-Tegration). The static local check was a C28 artifact from before henrys coverage was added.

**Pipeline run:**

| Step | File | Result |
|---|---|---|
| Mine | `agent_henrys_miner.js` | 30 H-1B + 6 S-1 = 36 raw |
| Scrub H-1B | `scrub_leads.js` | 15/30 pass, 15 dupes |
| Scrub S-1 | `scrub_leads.js` | 5/6 pass, 1 dupe |
| Ingest H-1B | `lead_ingest_agent.js` | 15/15 created ✅ |
| Ingest S-1 | `lead_ingest_agent.js` | 5/5 created ✅ |
| Route | `trigger_routing.js` | 20/20 → Germshied Wealth ✅ |

**Top leads by priority:**
- Senior Software Engineer at Google LLC — Mountain View, CA (timingScore: 82)
- Staff Engineer at Google LLC — Mountain View, CA (timingScore: 82)
- Employee with equity grant at VisionWave Holdings — Remote (timingScore: 92)
- Employee with equity grant at Ambiq Micro — Remote (timingScore: 92)
- VP at Goldman Sachs — New York, NY (timingScore: 90)

All 20 tagged `needsNameResolution: true` — Apollo enrichment pending (Priority 1 open item).

---

## 📊 Full Session Git Log
```
6106f5d  feat(C31): A12 HENRYs ingest + cockpit blank name fix + miner routing note update
234ef28  docs: session handoff C30 — 14-niche sourcing architecture complete
b2b2633  feat(A14): build agent_yacht_miner.js — USCG vessel seed → AUM Engine raw batch
1968bd2  feat(enrich): build agent_apollo_enrich.js — Apollo.io owner name resolution
```

---

## 📈 Pipeline State

| Metric | Value |
|---|---|
| `master_leads` total | **487 docs** (+20) |
| Advisors provisioned | 6 (5 pilot + Kosal) |
| Niches with advisor coverage | 14/14 |
| Routing queue pending | 0 (all cleared) |
| Routing queue failed | 0 |
| Audit score | **10/10** |

**Germshied Wealth Management load:** 99/500 (was 79 at start of session, +20 HENRYs)

---

## 🚧 Open Items for Next Session

### Priority 1 — Apollo Owner Name Enrichment (A10 tradesman + A12 HENRYs)
**35 total leads** now need name resolution:
- 17 tradesman leads (already queued since C30)
- 18 additional HENRYs leads (15 H-1B + 3 S-1 that passed scrub — all `needsNameResolution: true`)

```bash
# One-time setup (free, no credit card):
# https://app.apollo.io/#/settings/integrations/api
echo '{ "apiKey": "YOUR_KEY" }' > scripts/config/apollo.json

# Enrich A10 tradesman batch (17 credits):
node scripts/agent_apollo_enrich.js \
  --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json \
  --limit 17

# Enrich A12 HENRYs H-1B batch (15 credits):
node scripts/agent_apollo_enrich.js \
  --file scripts/staging/scrubbed/alfred_batch_henrys_h1b_2026-04-17.scrubbed.json \
  --limit 15

# Re-ingest enriched batches with resolved names:
node scripts/lead_ingest_agent.js --file scripts/staging/enriched/alfred_batch_tradesman_2026-04-17.enriched.json
node scripts/lead_ingest_agent.js --file scripts/staging/enriched/alfred_batch_henrys_h1b_2026-04-17.enriched.json
```
Apollo free tier: 50 credits/month. 32 leads = 32 credits. Have 18 remaining for HENRYs S-1 companies.

### Priority 2 — FL Probate: Vera Dispatch (unchanged from C30)
3 FL county placeholders in Firestore with `needsNameResolution: true`.
Dispatch file: `scripts/staging/vera_probate_fl_dispatch_2026-04-17.json`

Vera task (Perplexity Computer):
- Portal: `myflcourtaccess.com`
- Target: Collier County → Case Type: Probate → Filed After: 2026-01-17
- Return petitioner names in `COURT_RESOLUTIONS` format (see `resolve_probate_names.js`)

### Priority 3 — Expand Yacht Seed CSV (unchanged from C30)
Current: 30 records in `scripts/data/yacht_owners_seed.csv`
Target: 50 records for a second production batch
Sources: CGMIX, Marina public rosters, Yacht club commodore lists

### Priority 4 — Deploy to Firebase Hosting
Code changes from this session (blank name fix) haven't been deployed yet.
```bash
firebase deploy --only hosting
```

---

## 🔧 Technical Reference

### Files Modified This Session
```
js/
├── data.js               ← getInitials() + getDisplayName() updated/added
├── app.js                ← 2 name display locations patched
└── pages.js              ← 6 name display locations patched

scripts/
└── agent_henrys_miner.js ← S-1 city/state fix + routing warning corrected
```

### Staging Files From This Session
```
scripts/staging/
├── raw/
│   ├── alfred_batch_henrys_h1b_2026-04-17.raw.json    (30 leads)
│   └── alfred_batch_henrys_s1_2026-04-17.raw.json     (6 leads)
├── scrubbed/
│   ├── alfred_batch_henrys_h1b_2026-04-17.scrubbed.json  (15 leads)
│   └── alfred_batch_henrys_s1_2026-04-17.scrubbed.json   (5 leads)
└── rejected/
    ├── alfred_batch_henrys_h1b_2026-04-17.rejected.json  (15 dupes)
    └── alfred_batch_henrys_s1_2026-04-17.rejected.json   (1 dupe)
```

### Essential Commands
```bash
# Verify system health
/opt/homebrew/opt/node/bin/node scripts/audit_leads.js

# Deploy front-end changes
firebase deploy --only hosting

# Apollo enrichment (requires scripts/config/apollo.json)
/opt/homebrew/opt/node/bin/node scripts/agent_apollo_enrich.js \
  --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json \
  --limit 17

# Re-mine HENRYs (generates fresh batch)
/opt/homebrew/opt/node/bin/node scripts/agent_henrys_miner.js
```

---

## 📣 START NEXT SESSION WITH
```
Read HANDOFF_C31.md first.
HEAD: 6106f5d | master_leads: 487 | Audit: 10/10

Priority 1 — Apollo enrichment for 32 leads (tradesman + HENRYs) — requires free API key:
  https://app.apollo.io/#/settings/integrations/api
  Create scripts/config/apollo.json and run agent_apollo_enrich.js twice

Priority 2 — Deploy front-end blank name fix:
  firebase deploy --only hosting

Priority 3 — FL probate Vera dispatch (3 Collier County cases)
  Dispatch file: scripts/staging/vera_probate_fl_dispatch_2026-04-17.json

Priority 4 — Expand yacht seed CSV to 50 records
  scripts/data/yacht_owners_seed.csv (currently 30)

Audit: /opt/homebrew/opt/node/bin/node scripts/audit_leads.js  (expect 10/10, 487 master_leads)
```
