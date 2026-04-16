# AUM Engine — Session Handoff C25
**Date:** April 16, 2026  
**Session:** C25 — Lead Pipeline Overhaul + 13-Niche Agent Architecture  
**Prepared by:** Antigravity (Big Nate)  
**Conversation ID:** c83ddf98-b838-4ae7-af37-fe92a569117c  
**Repo:** `kprum1/theaumengine`  
**Live URL:** https://theaumengine.web.app  
**Custom domain:** https://theaumengine.com  

---

## 🔴 RESUME INSTRUCTIONS — READ FIRST

```bash
# 1. Always set Node path first
export PATH="/opt/homebrew/bin:$PATH"

# 2. Run audit — must return 10/10 before touching anything
node scripts/audit_leads.js

# 3. Deploy hosting only
/usr/local/bin/firebase deploy --only hosting --project theaumengine

# 4. Deploy rules + hosting
/usr/local/bin/firebase deploy --only firestore:rules,hosting --project theaumengine

# 5. Run real physician agent (tested live — works now)
node scripts/agent_npi_miner.js --niche physicians --state TX --limit 50
```

**Credentials:**
- Operator: `kosal@fin-tegration.com` / `AUM2026!`
- Pilot advisor: `chuck@chuck.com` / `AUM2026!`
- Firebase project: `theaumengine`
- Firebase CLI: `/usr/local/bin/firebase`

---

## ✅ C25 Sprint — What Was Built

### C25-1 · Alfred Audit — Synthetic Lead Pipeline Confirmed & Quarantined

**Problem discovered:** Alfred (OpenClaw / `kprum1/alfred-clawbot`) has been generating 100% synthetic leads for every batch since the project started.

**Evidence:**
- April 13 batch (`scripts/staging/alfred_mined_leads_apr13.json` — 50 leads): all `@example.com` emails, all `555-` phones, source = `"Alfred Master AUM Miner"`, identical reason codes on every lead, `Minnetonka, IA` (wrong state)
- Alfred's "real FAA" batch on clawbot repo: names include `"James Bond"`, `"Bat Flying"`, `"Salt Aerial"` — fabricated
- Alfred's `generate_leads.js` code uses `Math.random()` to generate names — confirmed via browser audit

**Action:** April 13 batch is **quarantined** in `scripts/staging/`. Do NOT ingest. Run `node scripts/audit_leads.js` to confirm it's not in Firestore.

---

### C25-2 · Phase 1 Real Data Sourcing Agents — Built & Pushed ✅

Four new scripts in `scripts/`:

#### `agent_faa_miner.js` — Aircraft Owners
- Downloads `registry.faa.gov/database/ReleasableAircraft.zip` (free, 350K records)
- Parses `MASTER.txt` + `ACFTREF.txt` with fixed-width column layout
- Filters: Individual/LLC owners, HNW manufacturers (Beech, Cirrus, Pilatus, Gulfstream, etc.), multi-engine/turbine
- AUM estimator by aircraft class, FAA verification URL per lead
- Output: `scripts/staging/alfred_batch_faa_YYYY-MM-DD.json`
- **Usage:** `node scripts/agent_faa_miner.js --state TX --limit 50`

#### `agent_npi_miner.js` — Physicians & Dentists ✅ LIVE TESTED
- Queries CMS NPI Registry API (free, no key)
- 14 high-income physician taxonomy codes + 7 dental codes
- Filters: NPI-1 individual providers, by state, by specialty
- **LIVE TEST RESULT:** Real TX orthopedic surgeons returned — Cyrus Abbaschian MD (NPI 1265662100, verifiable at CMS)
- Output: `scripts/staging/alfred_batch_npi_{physicians|dentists}_YYYY-MM-DD.json`
- **Usage:** `node scripts/agent_npi_miner.js --niche physicians --state TX --limit 50`

#### `agent_sec_miner.js` — C-Suite & AI-Displaced Executives
- SEC EDGAR full-text search API (free, no key)
- A5a: Form 4 insider stock sales → `csuite-executives`
- A5b: Form 8-K Item 5.02 executive departures → `ai-displaced-executives`
- A5c: DEF 14A proxy compensation tables → `csuite-executives`
- 8-K and proxy leads flag `needsNameResolution: true` (name must be pulled from filing text)
- **Usage:** `node scripts/agent_sec_miner.js --mode 8k --days 60`

#### `agent_warn_miner.js` — AI-Displaced Executives (DOL WARN Act)
- Fetches state labor department WARN Act portals (15 states)
- Scores by industry keyword, employee count, and recency
- Company-level leads with LinkedIn research instructions + embedded search URL
- Generates `warn_research_manifest_YYYY-MM-DD.json` for Vera to pull live data
- **Usage:** `node scripts/agent_warn_miner.js --states CA,TX,NY,WA,IL`

---

### C25-3 · 13 Niche SKILL.md Templates — All Built & Pushed ✅

Every niche now has `.agents/skills/agent_{niche}/SKILL.md` with:
- Exact script run commands
- Public data source URLs (government databases)
- Ideal prospect profile + AUM floor
- Trigger events with timing score guidance
- Red flag / disqualify criteria
- Required output schema with example JSON (shows what a passing lead looks like)
- Outreach angle (the exact hook)
- Vera research brief

**Skill files created:**

| File | Niche | nicheId | Primary Source |
|---|---|---|---|
| `agent_aircraft_owners/SKILL.md` | ✈️ Aircraft Owners | `aircraft-owners` | FAA Registry |
| `agent_physicians/SKILL.md` | 👩‍⚕️ Physicians | `physicians` | CMS NPI |
| `agent_dentists/SKILL.md` | 🦷 Dentists | `dentists` | CMS NPI |
| `agent_business_owners/SKILL.md` | 🏢 Business Owners | `business-owners` | SoS + LinkedIn |
| `agent_law_partners/SKILL.md` | ⚖️ Law Partners | `law-partners` | State Bar Dirs |
| `agent_henrys/SKILL.md` | 🚀 HENRYs | `henrys` | LinkedIn + RSU calendars |
| `agent_ai_displaced/SKILL.md` | 🤖 AI-Displaced | `ai-displaced-executives` | DOL WARN + SEC 8-K |
| `agent_csuite/SKILL.md` | 👔 C-Suite | `csuite-executives` | SEC EDGAR Form 4 + DEF 14A |
| `agent_re_developers/SKILL.md` | 🏗️ RE Developers | `real-estate-developers` | County Recorder + Permits |
| `agent_inheritance/SKILL.md` | 💰 Inheritance | `inheritance-recipients` | Probate Courts |
| `agent_charity_boards/SKILL.md` | 🎗️ Charity Boards | `charity-boards` | IRS 990 / ProPublica |
| `agent_tradesman/SKILL.md` | 🔧 Tradesman | `high-earning-tradesman` | SoS + BBB + NAICS |
| `agent_pro_athletes/SKILL.md` | 🏆 Pro Athletes | `pro-athletes` | Spotrac + OTC + ESPN |

---

### C25-4 · Master Scrubbing Spec Document Written

**File:** `.agents/skills/alfred_lead_ingest/alfred_scrubbing_spec.md`

Documents the nicheId schema conflict (found and resolved):
- UI PROSPECTS array uses `n1`–`n13` short IDs (display only)
- Routing engine + Alfred batch JSON must use **slug format** (`physicians`, `aircraft-owners`, etc.)

Full per-niche scrubbing spec with trigger signals, disqualifiers, required fields, source URLs.

---

### C25-5 · MemPalace Status Confirmed

MemPalace is installed and indexed:
```
Wing: aum_engine
  Room: general     — 840 drawers
  Room: scripts     — 776 drawers
  Room: css         — 644 drawers
  Room: functions   — 326 drawers
  Room: design       — 88 drawers
  Room: documentation — 53 drawers
Total: 2,727 drawers
```

---

## 🚨 Critical Architecture Note — nicheId Schema

```
UI PROSPECTS array (data.js):  n1, n2, n3... n13  ← display IDs only
Routing engine (functions/):   slug format         ← aircraft-owners, physicians
Alfred batch JSON:              MUST use slug format ← or routing fails
Firestore advisor_pool docs:   nicheIds[] = slug   ← verify before next batch
```

**If Alfred sends n1 format → routing engine cannot match advisors → leads go unrouted.**

---

## 📁 Key Files — Current State

| File | Status | Purpose |
|---|---|---|
| `scripts/agent_faa_miner.js` | ✅ New C25 | Aircraft owner leads from FAA |
| `scripts/agent_npi_miner.js` | ✅ New C25 · Live tested | Physician/dentist leads from CMS |
| `scripts/agent_sec_miner.js` | ✅ New C25 | C-Suite/exec leads from SEC EDGAR |
| `scripts/agent_warn_miner.js` | ✅ New C25 | AI-displaced leads from DOL WARN |
| `scripts/staging/alfred_mined_leads_apr13.json` | 🔴 QUARANTINED | Synthetic — do not ingest |
| `scripts/audit_leads.js` | ✅ Active | 10/10 audit — run before any ingest |
| `scripts/lead_ingest_agent.js` | ✅ Active | Ingest validated batches to Firestore |
| `.agents/skills/agent_*/SKILL.md` | ✅ New C25 (×13) | Sourcing specs for each niche |
| `js/niche_engine.js` | ✅ Stable | 13-niche scoring and routing logic |
| `functions/index.js` | ✅ Stable | Cloud Functions — routing orchestrator |
| `firestore.rules` | ✅ Stable | Security rules — last updated C24 |

---

## 📋 Next Steps — Prioritized

### P0 — Run Real Agents Now (Do This First)
```bash
# Physicians — Texas (fastest, no download needed)
node scripts/agent_npi_miner.js --niche physicians --state TX --limit 50

# Dentists — Florida (DSO-hot market)
node scripts/agent_npi_miner.js --niche dentists --state FL --limit 30

# Review output
cat scripts/staging/alfred_batch_npi_physicians_$(date +%Y-%m-%d).json | python3 -c "
import json,sys; d=json.load(sys.stdin)
print(f'{len(d)} leads')
[print(f\"{l['firstName']} {l['lastName']} — {l['city']}, {l['state']} | NPI: {l['npi']}\") for l in d[:5]]
"
```

### P1 — Run FAA Agent (Aircraft Owners)
```bash
# Downloads ~10MB FAA ZIP first time
node scripts/agent_faa_miner.js --state MN --limit 40
# Subsequent runs use cache:
node scripts/agent_faa_miner.js --skip-download --state TX --limit 60
```

### P2 — Run SEC Agent (C-Suite)
```bash
node scripts/agent_sec_miner.js --mode 8k --days 60 --limit 40
# Then: open the sourceUrl on each 8k lead, find the exec name, update firstName/lastName
```

### P3 — Verify Advisor Pool nicheIds are Slug Format
```bash
# Check Firestore advisor_pool docs — run this script:
node -e "
const admin = require('./node_modules/firebase-admin');
const sa = require('./scripts/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
admin.firestore().collection('advisor_pool').get().then(snap => {
  snap.forEach(d => {
    const data = d.data();
    console.log(data.name, '→', data.nicheIds);
  });
  process.exit(0);
});
"
```
Expected: nicheIds should be `['physicians', 'aircraft-owners', ...]` (slugs), not `['n1', 'n5', ...]`

### P4 — Build Agent A6 (IRS 990 — Charity Boards)
Next agent to build. ProPublica API is free:
```
https://projects.propublica.org/nonprofits/api/v2/search.json?state[id]=IL&ntee[id]=A&c_code[id]=3
```

### P5 — Apollo Enrichment Agent
Build `scripts/agent_apollo_enrich.js` — takes any NPI/FAA/SEC batch and adds real email + phone via Apollo.io API.  
**Requires:** Apollo API key from operator.

### P6 — Stripe Integration (Deferred from C23)
Implementation plan ready at: `.gemini/antigravity/brain/c83ddf98-b838-4ae7-af37-fe92a569117c/implementation_plan.md`  
**Do not start until lead pipeline is verified clean.**

---

## 🤖 Alfred Redirect Instructions

Send this to Alfred in OpenClaw before the next session:

> **Alfred — your `generate_leads.js` and `generate_leads_batch2.js` are banned. The entire batch from April 13 has been quarantined.**
>
> **Your new role:**  
> 1. Clone `kprum1/theaumengine`  
> 2. Read `.agents/skills/agent_{niche}/SKILL.md` for whatever niche you're running  
> 3. Run the agent script from `scripts/agent_*.js`  
> 4. Commit the output JSON to `scripts/staging/` and push  
> 5. Paste the first 5 lead records as a message to operator for review  
> 6. Do NOT modify agent scripts. Do NOT generate names. Run them, commit output, notify.

---

## 🧠 MemPalace Status

Installed at: `/Users/kosalprum/Library/Python/3.9/lib/python/site-packages/mempalace/`  
Wing: `aum_engine` | Total drawers: **2,727**

**Query command:**
```bash
mempalace search "routing engine" --wing aum_engine
mempalace search "nicheId" --wing aum_engine --room scripts
```

**From the MemPalace session (conv 370e6754):** The palace was initialized with the full AUM Engine codebase mined into it. Mini Nate can query it for prior decisions before writing new code.

---

## 🔗 GitHub Status

```
Repo:        kprum1/theaumengine
Branch:      main
Latest commit: 27a7017 — feat(skills): 13 niche lead agent SKILL.md templates
               b5abc9f — feat(agents): Phase 1 lead sourcing agents — FAA, NPI, SEC EDGAR, DOL WARN
               be18dac — docs: session handoff C24
```

**Live on GitHub:**
- `scripts/agent_faa_miner.js`
- `scripts/agent_npi_miner.js`  
- `scripts/agent_sec_miner.js`
- `scripts/agent_warn_miner.js`
- `.agents/skills/agent_*/SKILL.md` (×13)

---

## 💳 Stripe (Deferred — P6)

Paywall implementation plan is documented and ready. Do not start until lead pipeline outputs verified real leads and advisor cockpit is confirmed stable.

Plan location: `/Users/kosalprum/.gemini/antigravity/brain/c83ddf98-b838-4ae7-af37-fe92a569117c/implementation_plan.md`

---

## START YOUR NEXT SESSION WITH:

```
"Read HANDOFF_C25.md first. We're continuing the AUM Engine lead pipeline build.
The real agents are built — next priority is running agent_npi_miner.js on TX  
physicians, checking advisor_pool nicheIds are slug format in Firestore, then  
building the Apollo enrichment agent. Alfred has been redirected to run our  
scripts instead of his hallucination engine."
```
