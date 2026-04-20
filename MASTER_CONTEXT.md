# THE AUM ENGINE — MASTER CONTEXT
**The Scroll of Knowledge · Single Source of Truth for All Agents**  
**Last Updated:** 2026-04-18 · C38 Sprint  
**Maintained by:** Antigravity (Big Nate) — update at end of every sprint  
**Live URL:** https://theaumengine.web.app  
**Firebase Project:** `theaumengine`  
**Project Root:** `/Users/kosalprum/Documents/AdvDiamondMining`  
**GitHub:** https://github.com/kprum1/theaumengine  

> ⚠️ **ALL AGENTS READ THIS FIRST.** This file is the authoritative state of The AUM Engine. Do not rely on memory, assumptions, or older handoff docs — trust this file. If anything contradicts an older doc, **this file wins.**

---

## SECTION 1 — WHAT THIS SYSTEM IS

The AUM Engine is a **proprietary internal lead generation and routing engine** — not a SaaS product. It is built exclusively for:

- **Kosal Prum** — pursuing the Branch Manager role at Ameriprise Financial, Wayzata MN branch
- **Jeremy Jackson** — Private Wealth Advisor, Ameriprise Financial, Wayzata MN
- **Pilot advisor cohort** — 5 additional advisors across the US

**The engine's purpose:** Given Jeremy (and future recruited advisors) a geo-targeted, pre-built client pipeline in high-AUM niches so outreach begins the moment an advisor joins the branch.

**Stack:** Vanilla HTML/CSS/JS + Firebase (Firestore, Auth, Hosting) + Resend (email) + Node.js (Admin SDK scripts)

---

## SECTION 2 — LIVE PIPELINE STATE (C38 · 2026-04-18)

```
master_leads         : 1,015 docs  ← unique prospect pool (source of truth for Total Prospects KPI)
lead_assignments     : 1,875 docs  ← routing output (advisor ↔ lead linkage)
routing_queue        : 1,005 items (961 queued, 22 failed ❌, 22 orphaned 🗑)
al_assignments       : 0 docs      ✅ demo data purged Sprint 5
```

### Advisor Cap Space (live as of C38 audit)

| UID Prefix | Advisor / Firm | Assigned | Cap | Open Slots | State Gate |
|---|---|---|---|---|---|
| `FvEWqsET` | Kosal Prum / Fin-Tegration (**OPERATOR**) | 882 | Unlimited | ∞ | — |
| `BQhiSqKW` | Chuck Cooper / Cooper Capital Group | 214 | 501 | **287** | 🌐 National |
| `iru1h2jz` | Jeremy Jackson / Ameriprise Wayzata | 207 | 500 | **293** | **MN only** |
| `yzTL1YHa` | Matt Germshied / Germshied Wealth Mgmt | 199 | 500 | **301** | 🌐 National |
| `Iqo8zz5g` | Patrick Wight / Wight Financial | 147 | 500 | **353** | 🌐 National |
| `Zd4H7gaN` | Ray Uncle / Ray Financial Advisors | 143 | 500 | **357** | 🌐 National (soft cap) |
| `NzC6fh3s` | Andy Belly / Duelly Outdoors / Belly Wealth | 83 | 500 | **417** | 🌐 National |

### meta/pipeline_stats (Firestore — source of KPI truth)

```json
{
  "totalMasterLeads": 1015,
  "totalLeads": 1875,
  "totalQueueItems": 1005,
  "nicheBreakdown": {
    "c-suite-executives":     284,
    "physicians":             238,
    "re-developers":           96,
    "dentists":                80,
    "aircraft-owners":         61,
    "business-owners":         58,
    "law-partners":            34,
    "ai-displaced-executives": 33,
    "yacht-owners":            30,
    "charity-board-members":   23,
    "henrys":                  20,
    "pro-athletes":            20,
    "inheritance":             19,
    "high-earning-tradesman":  18,
    "real-estate-investors":    1
  }
}
```

---

## SECTION 3 — FIRESTORE COLLECTIONS MAP

| Collection | Purpose | Who reads | Who writes |
|---|---|---|---|
| `master_leads` | Raw lead records — source of truth | Browser (auth'd) | Admin SDK (ingest scripts) |
| `lead_assignments` | Advisor ↔ lead routing output | Browser (scoped to ownerUid) | Admin SDK (routing engine) |
| `routing_queue` | Ingested leads awaiting routing | Admin SDK only | Admin SDK (ingest) |
| `advisor_pool` | Advisor eligibility, niches, cap | Browser + Admin SDK | Advisor (own doc), Admin SDK |
| `meta/pipeline_stats` | Aggregated KPI counts | Any auth'd user | Admin SDK (`write_pipeline_meta.js`) |
| `advisorProfiles` | Advisor display settings | Advisor (own) | Browser |
| `ed_situations` | Client ED intake submissions | Assigned advisor + operator | Browser (advisor) |
| `outreach_outcomes` | Advisor outreach log | Advisor (own) | Browser |
| `operator_presence` | Real-time advisor session tracking | Operator only | Browser (on nav) |
| `funnel_events` | Advisor funnel analytics | Operator | Browser |
| `routing_logs` | Immutable routing event log | Admin SDK | Admin SDK |

---

## SECTION 4 — PERMANENT ARCHITECTURAL RULES

These are non-negotiable decisions made after bugs. Never violate them.

### Rule 1 — NEVER use `.count()` aggregation
**Firebase compat SDK v9.23.0** (loaded via CDN) does **NOT** support `.count()`. It throws silently into the catch block and returns 0. Always use `meta/pipeline_stats` via `write_pipeline_meta.js` instead.

### Rule 2 — Always run `write_pipeline_meta.js` after every ingest
If skipped, the cockpit KPI shows a stale count. No exceptions.

### Rule 3 — Operator is `kosal@fin-tegration.com` (FvEWqsET)
Operator has `isOperator: true`, `leadCap: 999999` in `advisorProfiles`. The role gate pattern:
```javascript
const isOp = email === 'kosal@fin-tegration.com'
          || window._advisorProfile?.role === 'operator'
          || window._advisorProfile?.isOperator === true;
```

### Rule 4 — KPI uses `window._firestoreLeadTotal` not `PROSPECTS.length`
`PROSPECTS.length` is a mix of 28 hardcoded demo leads + partially-hydrated Firestore leads. Always prefer `window._firestoreLeadTotal` (set from `meta/pipeline_stats` on login).

### Rule 5 — Idempotency key = SHA-256(firstName + lastName + email + phone)
Exact duplicates are silently skipped on ingest. You cannot fix a bad record by re-ingesting — you must delete from Firestore and re-ingest.

### Rule 6 — `serviceAccountKey.json` never leaves the machine
Located at `scripts/serviceAccountKey.json`. Gitignored. Alfred never touches it. Only Admin SDK scripts use it. Never commit, never share.

### Rule 7 — `test@test.com` is intentionally kept in advisor_pool
Operator chose to keep it. Do NOT remove unless explicitly asked.

---

## SECTION 5 — THE FULL INGEST CHECKLIST

Run exactly in this order after every Alfred batch:

```bash
export PATH="/opt/homebrew/opt/node/bin:/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

# 1. Pre-audit
node scripts/audit_leads.js

# 2. Ingest the batch
node scripts/lead_ingest_agent.js --file scripts/staging/alfred_batch_YYYY_MM_DD.json

# 3. Trigger routing engine
node scripts/trigger_routing.js

# 4. ⚠️ REQUIRED — update cockpit KPI
node scripts/write_pipeline_meta.js

# 5. Post-audit confirm
node scripts/audit_leads.js
```

---

## SECTION 6 — VALID NICHE IDs (ROUTING ENGINE)

The `nicheId` field MUST exactly match one of these. Wrong value = `eligibility_empty` = lead never assigned.

| nicheId | Label | Who Covers |
|---|---|---|
| `physicians` | Physicians & Surgeons | Ray, Patrick, Jeremy (MN only) |
| `aircraft-owners` | Aircraft Owners | Matt, Andy, Jeremy (MN only) |
| `yacht-owners` | Yacht Owners | Matt, Andy, Ray, Patrick, Jeremy (MN only) |
| `business-owners` | Business Owners | Matt, Patrick, Chuck, Andy, Jeremy (MN only) |
| `charity-board-members` | Charity Board Members | Ray |
| `ai-displaced-executives` | AI-Displaced Executives | Chuck |
| `re-developers` | Real Estate Developers | Chuck, Andy, Jeremy (MN only) |
| `real-estate-investors` | Real Estate Investors | Chuck, Andy |
| `c-suite-executives` | C-Suite Executives | Chuck, Matt, Jeremy (MN only) |
| `law-partners` | Law Partners | Chuck, Andy, Ray, Patrick, Jeremy (MN only) |
| `henrys` | HENRYs | Jeremy (MN only) |
| `inheritance` | Inheritance Recipients | Chuck, Patrick |
| `pro-athletes` | Pro Athletes | Chuck, Andy, Ray, Patrick |
| `dentists` | Dentists / Specialists | Ray, Patrick, Jeremy (MN only) |
| `high-earning-tradesman` | High-Earning Tradesmen | Patrick, Andy, Jeremy (MN only) |

> ⚠️ **Known issue:** `real-estate-developers` (hyphenated) and `re-developers` are two different strings in the engine. Some agents use one, some use the other. This is C38 tech debt — not yet normalized.

---

## SECTION 7 — SOURCING AGENTS (17 live)

| Agent | File | Source | Cadence |
|---|---|---|---|
| A1 | `agent_npi_miner.js` | CMS NPI Registry (physicians/dentists) | On demand |
| A2 | `agent_faa_miner.js` | FAA Aircraft Registry | On demand |
| A3 | `agent_sba_miner.js` | SBA Business Owners | On demand |
| A4 | `agent_sec_miner.js` | SEC EDGAR 8-K/10-K | On demand |
| A5 | `agent_hud_miner.js` | HUD Real Estate Developers | On demand |
| A6 | `agent_law_miner.js` | State Bar Law Partners | On demand |
| A7 | `agent_athlete_miner.js` | Pro Athletes (MLB/NBA/NFL/NHL) | On demand |
| A8 | `agent_yacht_miner.js` | USCG Vessel Registry | On demand |
| A9 | `agent_henrys_miner.js` | DOL H-1B / S-1 earners | On demand |
| A10 | `agent_tradesman_miner.js` | Licensed Tradesmen | On demand |
| A11 | `agent_990_miner.js` | IRS Form 990 Charity Boards | On demand |
| A12 | `agent_probate_miner.js` | Probate / Inheritance | On demand |
| A13 | `agent_warn_miner.js` | WARN Act AI-Displaced | On demand |
| A14 | `agent_insider_miner.js` | SEC Form 4 Insider Transactions | Weekly |
| A15 | `agent_assessor_miner.js` | Hennepin County GIS Parcels | Monthly |
| A16 | `agent_fec_miner.js` | OpenFEC Political Donors ≥$10K | Quarterly |
| Support | `agent_apollo_enrich.js` | Apollo enrichment (phone/email) | Post-ingest |

---

## SECTION 8 — KEY FILE LOCATIONS

```
Project root:       /Users/kosalprum/Documents/AdvDiamondMining
Service account:    scripts/serviceAccountKey.json  ← NEVER commit
Firebase CLI:       /usr/local/bin/firebase
Node:               /opt/homebrew/opt/node/bin/node

Source files:
  js/pages.js      ~2,057 lines  — all page renderers
  js/app.js        ~2,278 lines  — navigation, state, filters
  js/admin.js      ~1,184 lines  — Admin Dashboard
  js/db.js           ~650 lines  — Firestore reads/writes
  js/auth.js         ~634 lines  — Firebase Auth
  js/data.js         ~843 lines  — NICHES, PROSPECTS, computeNicheMetrics
  js/planning_agent.js ~347 lines — Al brief generation
  css/main.css      ~3,844 lines  — full design system

Scripts:
  scripts/audit_leads.js           — pipeline health check
  scripts/lead_ingest_agent.js     — ingest batch file to Firestore
  scripts/trigger_routing.js       — run routing engine pass
  scripts/write_pipeline_meta.js   — update meta/pipeline_stats KPI doc
  scripts/scrub_leads.js           — validate + scrub raw Alfred batch
  scripts/requeue_failed.js        — retry eligibility_empty leads

Staging:
  scripts/staging/raw/             — raw Alfred batch files (before scrub)
  scripts/staging/scrubbed/        — ready-to-ingest files
  scripts/staging/rejected/        — rejection log files

Agent skills:       .agents/skills/
Sprint handoffs:    .agents/handoffs/
Memory Palace:      ~/Documents/Memory Palace /
```

---

## SECTION 9 — ALL PAGES / NAVIGATION MAP

| data-page | Renderer | Access |
|---|---|---|
| `command-center` | `pageCommandCenter()` | All advisors |
| `prospect-mine` | `pageProspectMine()` | All advisors |
| `lead-scoreboard` | `pageLeadScoreboard()` | All advisors |
| `niche-mapping` | `pageNicheMapping()` | All advisors |
| `outreach-studio` | `pageOutreachStudio()` | All advisors |
| `nurture-booking` | `pageNurtureBooking()` | All advisors |
| `meeting-prep` | `pageMeetingPrep()` | All advisors |
| `client-intake` | `pageClientIntake()` | **Operator only** (role-gated C37) |
| `manager-console` | `pageManagerConsole()` | Operator |
| `settings` | `pageSettings()` | All advisors |
| `admin-dashboard` | `pageAdminDashboard()` | Operator |
| `security-sentinel` | `pageSecuritySentinel()` | Operator |
| `ed-disclosure` | `pageEdDisclosure()` | Public (pre-auth, intake start) |
| `ed-intake` | `pageEdIntake()` | Intake flow |
| `ed-complete` | `pageEdComplete()` | Intake flow |
| `login` | `pageLogin()` | Pre-auth |

---

## SECTION 10 — SPRINT HISTORY (what was built, in order)

| Sprint | Key Deliverables | Pipeline After |
|---|---|---|
| C19 | Legal pages (Privacy/Terms), Calendly enforcement, RBAC Manager Console | Early stage |
| C20 | Daily digest email (Resend), niche badge tooltip, activity bar chart fix | — |
| C23 | Stripe subscription gating, legal compliance deep-links | — |
| C32 | Lead schema unification (`masterLeads` → `master_leads` migration) | — |
| C33 | KPI count bug fix (4-layer: limit 100→500, no .count(), computeMetrics, meta/pipeline_stats), Jeremy +65 leads | 1,116 |
| C34 | 3 new agents (SEC Form 4, Hennepin GIS, OpenFEC), 288 new leads ingested, Jeremy expanded to 11 niches | 1,221 |
| C35 | Pro Athletes niche, multi-select wealth sources, scoring engine update | — |
| C36 | Client Intake inbox, Admin Advisor Management Panel, PWA (manifest.json + sw.js), Recent Cohorts live data, KPI 1,015 fix | 1,875 assignments / 1,015 unique |
| C37 | Role gate on Client Intake, CIK name scrub in getDisplayName(), service worker passthrough | 1,875 / 1,015 |
| **C38** | Alfred Guardrails Strategy v2.0, MASTER_CONTEXT.md (this file) | 1,875 / 1,015 |

---

## SECTION 11 — KNOWN ISSUES / TECH DEBT (C38)

| Issue | Priority | Status |
|---|---|---|
| `real-estate-developers` vs `re-developers` niche ID split | 🔴 High | Open — some agents use each, leads don't cross-route |
| 22 `eligibility_empty` failures in routing_queue | 🔴 High | Open — likely niche ID mismatch |
| `patch_cik_names.js` — DB-level CIK cleanup | 🟡 Medium | Script not yet written. Display fixed in C37 but DB still has raw records |
| `test@test.com` in advisor_pool | 🟡 Medium | Intentional — operator chose to keep. Do NOT remove. |
| `status: "new"` (lowercase) vs `"New"` — 107 records | 🟡 Medium | `normalize_status_casing.js` needed |
| 28 demo leads in `PROSPECTS[]` | 🟡 Medium | Gate behind `window._isDemoMode` |
| "New this week" KPI hardcoded | 🟡 Medium | Wire to live `createdAt` Firestore query |
| SLA banner — advisors or operator-only? | 🟡 Medium | Q1 open from C37 — operator decision pending |
| DMARC record for fin-tegration.com | 🟡 Medium | DNS change in registrar — operator action |
| `real-estate-investors` — only 1 lead | 🟢 Low | May merge with `re-developers` |
| Trust suffix names (`Michael Trste`) | 🟢 Low | Hennepin GIS parsing artifact — enrichment resolves |

---

## SECTION 12 — C38 OPEN QUESTIONS (operator must answer)

| # | Question | Impact |
|---|---|---|
| Q1 | **SLA Banner:** Should advisors see an SLA/compliance banner on their dashboard? | Build it or close the ticket |
| Q2 | **Niche Performance "View prospects →":** Navigate to filtered Scoreboard or stay as side panel? | UX nav fix |
| Q3 | **Reply Rate tile:** Navigate to `outreach-studio` or keep `nurture-booking`? | Minor nav fix |

---

## SECTION 13 — ALFRED OPERATING RULES (Summary)

Full guardrails: `.agents/skills/alfred_lead_ingest/ALFRED_GUARDRAILS_STRATEGY.md`

**Alfred's only deliverable:** A valid JSON array written to `scripts/staging/alfred_batch_YYYY_MM_DD.json`

**Alfred's 8-point self-check (run per lead, reject if any fail):**
1. `sourceUrl` exists and resolves to a real person
2. `firstName`/`lastName` match what's at `sourceUrl`
3. `nicheId` is in the valid list above AND is routable
4. Scores justified by real signals (not inflated)
5. `state` is a valid 2-letter code
6. `estimatedAUM` is plausible for the niche
7. No CIK contamination in name fields
8. `reasonCodes` are evidence-based, not generic

**Never use:** `henrys` or `inheritance` unless operator unlocks (thin advisor coverage)  
**Target batch:** 40–50 leads · Saturday cadence · Use Last Known State from guardrails doc

---

## SECTION 14 — THE AI CREW

| Agent | Platform | What They Do | Memory |
|---|---|---|---|
| **Kosal** (CEO) | Human | Direction, approvals, DNS/config changes | Full |
| **Big Nate** | Antigravity (Claude Sonnet) | Builds + deploys code, runs scripts, architecture | KI system + this file |
| **Vera** | Perplexity Computer | Independent production auditor, research | **Zero** — needs full brief every session |
| **Alfred** | OpenClaw (Clawbot) | Lead sourcing from public registries | **Zero** — reads SKILL.md + this file |
| **Mini Nate** | Antigravity (Claude Haiku) | Task coordination, quick formatting | Via handoffs |

**Memory Palace:** `~/Documents/Memory Palace /` — ChromaDB vector DB with `aum_engine` wing  
**Mine after each sprint:** `mempalace --palace "$PALACE" mine ~/Documents/AdvDiamondMining --wing aum_engine --agent nate`

---

## SECTION 15 — HOW TO START ANY NEW SESSION

### For Big Nate (Antigravity)
Paste at the top of the new conversation:
```
Starting [SPRINT] for The AUM Engine.
Read first: /Users/kosalprum/Documents/AdvDiamondMining/MASTER_CONTEXT.md
Live URL: https://theaumengine.web.app
Operator: kosal@fin-tegration.com
```

### For Alfred (OpenClaw)
Paste at the top of the OpenClaw session:
```
You are Alfred. Read these two files in full before producing any leads:
1. /Users/kosalprum/Documents/AdvDiamondMining/MASTER_CONTEXT.md
2. /Users/kosalprum/Documents/AdvDiamondMining/.agents/skills/alfred_lead_ingest/ALFRED_GUARDRAILS_STRATEGY.md

Then begin the Saturday Protocol using the Last Known State in Section 2 of MASTER_CONTEXT and Part 11 of the Guardrails. Do not ask the operator to run any commands. Start sourcing immediately.
```

### For Vera (Perplexity Computer)
Paste at the top of the Perplexity session:
```
You are Vera, the independent production auditor for The AUM Engine.
Read this file: /Users/kosalprum/Documents/AdvDiamondMining/MASTER_CONTEXT.md
Then audit the live app at: https://theaumengine.web.app
Login: kosal@fin-tegration.com
```

---

## SECTION 16 — HOW BIG NATE UPDATES THIS FILE

At the end of every sprint, update:
- Section 2 (pipeline numbers) — run `node scripts/audit_leads.js` and paste
- Section 10 (sprint history) — add new sprint row
- Section 11 (tech debt) — add/close items
- Section 12 (open questions) — answer or carry forward
- Header "Last Updated" date and sprint label

**Do NOT** let this file grow beyond ~600 lines. Archive old sprint detail to handoff docs. Keep this lean and current.

---

*MASTER_CONTEXT.md — The AUM Engine Universal Scroll*  
*Supersedes all older handoff docs as the starting context for any agent session.*  
*Sprint C19 → C38 synthesized · April 18, 2026*
