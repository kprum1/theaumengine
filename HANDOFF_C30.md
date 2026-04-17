# HANDOFF_C30.md — Sprint C30: 14-Niche Sourcing Architecture Complete
**Session Date:** 2026-04-17
**Time:** ~11:20 AM – 12:00 PM CT
**Platform:** The AUM Engine — `https://theaumengine.web.app`
**Project Root:** `/Users/kosalprum/Documents/AdvDiamondMining`
**Firebase Project:** `theaumengine`
**Node Path:** `/opt/homebrew/opt/node/bin/node`
**HEAD Commit:** `b2b2633`
**Last Audit:** ✅ 10/10 — All systems go
**master_leads:** 467 docs

---

## 🎯 Session Objective
Execute all 5 remaining items from HANDOFF_C29 one at a time:
1. Resolve 4 unresolved AZ probate cases + fix ingest agent wrapper bug
2. Scrub + ingest A10 tradesman batch
3. Scrub + ingest A11 athlete batch (4 sports)
4. Build `agent_apollo_enrich.js` for owner name resolution
5. Build `agent_yacht_miner.js` to complete the 14-niche architecture

All 5 delivered in full.

---

## ✅ What Was Built This Session

### Item 1 — AZ Probate: 4 Remaining Cases Resolved (`26facfb`)

**File:** `scripts/resolve_probate_names.js` (updated)

Pulled live petitioner names from Maricopa County court portal for the 4 cases that were skipped in C29 because they weren't in `COURT_RESOLUTIONS`:

| Case | Decedent | Petitioner | Role |
|---|---|---|---|
| PB2026-002300 | Samly Khongkhoune | **Bantri Khongkhoune** | Personal Rep |
| PB2026-000500 | Hassell Bernace Moores | **Sara Compton** | Unlicensed Fiduciary |
| PB2026-000300 | Nandadevi Govindarajalu | **Sumithra Ramesh** | Personal Rep |
| PB2026-000001 | Marsha M. Nitchman | **James S. Nitchman** | Petitioner |

> ⚠️ **Case # Correction:** PB2026-000300 belongs to Douglas L. Small — the correct case for Govindarajalu is PB2026-000301 (miner was off by one). Flagged in `courtNote` field.

**Resolution score: 12/12 AZ cases court-verified.** Only 3 FL county placeholders remain (Vera task).
4 net-new leads ingested + routed in same run.

---

### Item 1b — Ingest Agent Wrapper Bug Fixed (`26facfb`)

**File:** `scripts/lead_ingest_agent.js` — Line 217 (one-liner)

```diff
- leads = Array.isArray(raw) ? raw : [raw];
+ leads = Array.isArray(raw) ? raw : (raw.leads ? raw.leads : [raw]);
```

`lead_ingest_agent.js` now accepts both flat arrays and `{ leads: [...] }` wrapper objects. No more manual `.ingest.json` flattening required.

---

### Item 2 — A10 Tradesman Batch Ingested

**Source:** `scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json`

18 MN trade business leads (HVAC, plumbing, electrical, roofing, construction):
- **Scrub:** 18/18 passed, 0 rejected, all high confidence (0.85)
- **Ingest:** 18/18 created in `master_leads`, 0 errors, 0 skips
- **Route:** 18/18 → Germshied Wealth Management (Chicago)
- 17 of 18 tagged `needsNameResolution: true` — Apollo enrichment pending (Item 4)

Top leads (fit 98): Genz-Ryan Plumbing, Sedgwick Heating, Hunt Electric, Egan Company, Baker Roofing, Sunram Construction, Keys Well Drilling

---

### Item 3 — A11 Pro Athletes Batch: All 4 Sports (`ca1f73b`)

**Root cause fixed:** 6 athletes initially rejected because their teams weren't in `teamCities` lookup in `agent_athlete_miner.js`. Patched raw files + expanded all 4 sport team maps to cover every team in the curated seed.

| Sport | Leads | Result |
|---|---|---|
| NFL | 8 | Jordan Addison, Justin Jefferson, Sam Darnold, Danielle Hunter, Brock Purdy, Caleb Williams, Maxx Crosby, Jayden Daniels |
| NBA | 5 | Anthony Edwards, Karl-Anthony Towns, Rudy Gobert, LeBron James, Victor Wembanyama |
| MLB | 4 | Byron Buxton, Carlos Correa, Shohei Ohtani, Juan Soto |
| NHL | 3 | Kirill Kaprizov, Marc-Andre Fleury, Connor McDavid |
| **Total** | **20** | **20/20 ingested, 0 errors, split evenly Cooper Capital + Duelly Outdoors** |

**Miner fix:** Added missing teams to `teamCities` across all 4 sports — future runs will never hit city/state scrub rejections.

---

### Item 4 — `agent_apollo_enrich.js` Built (`1968bd2`)

**File:** `scripts/agent_apollo_enrich.js`
**Config template:** `scripts/config/apollo.json.example`

Apollo.io People Search agent that resolves owner/principal names for business-level leads (A10 tradesman, A12 HENRYs):

**Key features:**
- POST `/v1/people/search` — company name + owner title + city/state
- Smart title targeting:
  - Tradesman: Owner, Co-Owner, President, Founder, Principal, CEO
  - HENRYs: Sr Engineer, Staff Engineer, Principal Engineer, PM, Director, VP
- Best-candidate scoring (Owner > Founder > President > verified email > phone)
- Rate limiting: 1200ms between calls (free tier safe)
- Credit tracker: shows `N/50` free tier usage before running
- Dry-run mode: prints exact search params without any API calls
- Graceful no-key mode: prints setup instructions, previews what would be searched
- Output: `staging/enriched/<batchId>.enriched.json`

**Activation:**
```bash
# Get free key (no credit card) at:
# https://app.apollo.io/#/settings/integrations/api

# Create config:
echo '{ "apiKey": "YOUR_KEY" }' > scripts/config/apollo.json

# Run on A10 tradesman (17 leads needing names):
node scripts/agent_apollo_enrich.js \
  --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json \
  --limit 17

# Re-ingest with resolved names:
node scripts/lead_ingest_agent.js \
  --file scripts/staging/enriched/alfred_batch_tradesman_2026-04-17.enriched.json
```

---

### Item 5 — A14 Yacht Owners Miner (`b2b2633`)

**File:** `scripts/agent_yacht_miner.js`

Completes the 14-niche sourcing architecture. Reads `scripts/data/yacht_owners_seed.csv` (30 curated USCG-documented vessel owners) and produces standard raw batch JSON.

**Vessel length → AUM proxy:**
| Length | AUM Proxy | Advisors |
|---|---|---|
| 40–54 ft | $1.5M–$3M | 5 with `yacht-owners` |
| 55–64 ft | $4M–$8M | — |
| 65–79 ft | $7M–$15M | — |
| 80ft+ | $12M+ | — |

**Batch stats (30 leads, dry-run verified):**
- Distribution: CA:8, FL:8, TX:5, MD:4, WA:4, IL:1
- Top by priority: Thomas Ashford (80ft Miami, 98), Arthur Vance (82ft FL, 98), Sandra Whitfield (72ft FL, 96)
- 30 correctly skipped on ingest (idempotency gate — already ingested in prior sprint)
- `yacht-owners` niche: 5-advisor coverage confirmed ✅

**Usage:**
```bash
node scripts/agent_yacht_miner.js                    # all 30 records
node scripts/agent_yacht_miner.js --state FL         # Florida only
node scripts/agent_yacht_miner.js --min-length 55    # 55ft+ only
node scripts/agent_yacht_miner.js --dry-run          # preview only
```

---

## 📊 Full Session Git Log

```
b2b2633  feat(A14): build agent_yacht_miner.js — USCG vessel seed → AUM Engine raw batch
1968bd2  feat(enrich): build agent_apollo_enrich.js — Apollo.io owner name resolution
ca1f73b  fix(A11): expand teamCities lookup in agent_athlete_miner.js — all 4 sports complete
26facfb  fix(A13): complete 12-case AZ probate name resolution + ingest agent wrapper fix
b886e37  docs: session handoff C29 — routing gate clearance + A13 first live ingest
d912519  feat(agents): Sprint C29 — niche provisioning + A13 name resolution
```

---

## 🏆 14-Niche Sourcing Architecture — COMPLETE

| Agent | Niche | nicheId | Script | Advisor Coverage |
|---|---|---|---|---|
| A1 | Physicians | `physicians` | `agent_npi_miner.js` | 3 |
| A2 | Dentists | `dentists` | `agent_npi_miner.js` | 3 |
| A3 | Business Owners | `business-owners` | `agent_sba_miner.js` | 6 |
| A4 | Real Estate Developers | `real-estate-developers` | `agent_re_miner.js` | 3 |
| A5 | Aircraft Owners | `aircraft-owners` | `agent_faa_miner.js` | 3 |
| A6 | Charity Board Members | `charity-board-members` | `agent_990_miner.js` | 3 |
| A7 | Law Partners | `law-partners` | `agent_law_miner.js` | 6 |
| A8 | AI-Displaced Executives | `ai-displaced-executives` | `agent_aiwatch_miner.js` | 1 |
| A9 | C-Suite Executives | `c-suite-executives` | `agent_sec_miner.js` | 3 |
| A10 | High-Earning Tradesman | `high-earning-tradesman` | `agent_tradesman_miner.js` | 4 |
| A11 | Pro Athletes | `pro-athletes` | `agent_athlete_miner.js` | 5 |
| A12 | HENRYs | `henrys` | `agent_henrys_miner.js` | 3 |
| A13 | Inheritance | `inheritance` | `agent_probate_miner.js` | 5 |
| A14 | Yacht Owners | `yacht-owners` | `agent_yacht_miner.js` | 5 |

---

## 📈 Pipeline State

| Metric | Value |
|---|---|
| `master_leads` total | **467 docs** |
| Advisors provisioned | 6 (5 pilot + Kosal) |
| Niches with advisor coverage | 14/14 |
| Routing queue pending | 0 (all cleared) |
| Routing queue failed | 0 |
| Audit score | **10/10** |

---

## 🚧 Open Items for Next Session

### Priority 1 — Apollo Owner Name Enrichment (A10 tradesman)
17 tradesman leads are business-level (`needsNameResolution: true`) in Firestore.
Advisor cockpit shows blank names for these leads.

```bash
# One-time setup (free, no credit card):
# https://app.apollo.io/#/settings/integrations/api
echo '{ "apiKey": "YOUR_KEY" }' > scripts/config/apollo.json

# Enrich (17 credits from free 50/month):
node scripts/agent_apollo_enrich.js \
  --file scripts/staging/scrubbed/alfred_batch_tradesman_2026-04-17.scrubbed.json \
  --limit 17

# Re-ingest enriched batch:
node scripts/lead_ingest_agent.js \
  --file scripts/staging/enriched/alfred_batch_tradesman_2026-04-17.enriched.json
```

### Priority 2 — A12 HENRYs: Scrub + Ingest
HENRYs batch was staged but never ingested.

```bash
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_henrys_*.raw.json
node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/alfred_batch_henrys_*.scrubbed.json
node scripts/trigger_routing.js
```

### Priority 3 — FL Probate: Vera Dispatch
3 FL county placeholders are in Firestore with `needsNameResolution: true`.
Dispatch file exists: `scripts/staging/vera_probate_fl_dispatch_2026-04-17.json`

Vera task (Perplexity Computer):
- Portal: `myflcourtaccess.com`
- Target: Collier County → Case Type: Probate → Filed After: 2026-01-17
- Return petitioner names in the same format as `COURT_RESOLUTIONS` in `resolve_probate_names.js`

### Priority 4 — Expand Yacht Seed CSV
Current: 30 records in `scripts/data/yacht_owners_seed.csv`
Target: 50 records for a second production batch

Sources for new rows:
- CGMIX query: `cgmix.uscg.mil/psix/psixsearch.aspx` — filter by state + length 55ft+
- Marina public rosters: Lake Minnetonka Yacht Club, White Bear Yacht Club (MN)
- Yacht club commodore lists (LinkedIn search: site:linkedin.com "yacht club" "commodore" OR "rear commodore")

### Priority 5 — Advisor Cockpit: Blank Name UI Fix
Tradesman leads display `" "` (blank) in the advisor cockpit because `firstName`/`lastName` are empty. The cockpit's `getInitials()` function already has a crash guard, but the display shows an empty name card — needs a fallback to `company` name when `firstName` is empty.

**Fix location:** `js/app.js` — `hydrateLead()` or lead card render block.

```javascript
// Current (shows blank):
displayName = `${lead.firstName} ${lead.lastName}`.trim();

// Fix:
displayName = (lead.firstName || lead.lastName)
  ? `${lead.firstName} ${lead.lastName}`.trim()
  : (lead.company || 'Unnamed Lead');
```

---

## 🔧 Technical Reference

### File Map (scripts added this session)
```
scripts/
├── resolve_probate_names.js    ← A13: 12-case AZ name resolution (updated C30)
├── lead_ingest_agent.js        ← Wrapper bug fixed C30 (line 217)
├── agent_athlete_miner.js      ← A11: teamCities expanded C30
├── agent_apollo_enrich.js      ← NEW C30: Apollo owner name resolution
├── agent_yacht_miner.js        ← NEW C30: A14 USCG yacht owners miner
├── config/
│   └── apollo.json.example     ← NEW C30: Apollo API key template
└── data/
    └── yacht_owners_seed.csv   ← 30 curated USCG records (pre-existing)
```

### Essential Commands
```bash
# Verify system health
node scripts/audit_leads.js

# Re-run A14 yacht miner (for new seeds)
node scripts/agent_yacht_miner.js
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_yacht_*.raw.json
node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/alfred_batch_yacht_*.scrubbed.json

# Route any pending queue items
node scripts/trigger_routing.js

# Check lead counts by niche (Firestore)
# Use Firebase Console → master_leads → filter by nicheId
```

---

## 📣 START NEXT SESSION WITH

```
Read HANDOFF_C30.md first.

Priority 1 — Apollo enrichment for 17 tradesman leads (requires free Apollo API key):
  https://app.apollo.io/#/settings/integrations/api
  Create scripts/config/apollo.json and run agent_apollo_enrich.js --limit 17

Priority 2 — Scrub + ingest A12 HENRYs batch
  node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_henrys_*.raw.json
  node scripts/lead_ingest_agent.js --file <scrubbed>

Priority 3 — Cockpit blank name fix for tradesman leads
  js/app.js — hydrateLead() displayName fallback to company when firstName is empty

Priority 4 — FL probate: dispatch Vera for Collier County petitioner names

Audit: node scripts/audit_leads.js   (expect 10/10, 467 master_leads)
```
