# THE AUM ENGINE — VERA HANDOFF v2.0
**Date:** April 6, 2026  
**Conversation ID ending:** a0019c6d (phase 1.2 + start of 1.3)  
**Status:** Phase 1.2 COMPLETE · Phase 1.3 READY TO BUILD  
**Live URL:** https://theaumengine.web.app  
**Custom Domain:** www.theaumengine.com (DNS propagating — ~24h)

---

## 🏗️ PROJECT IDENTITY

| Field | Value |
|---|---|
| **External Brand** | The AUM Engine |
| **UI Label** | The AUM Engine — Advisor Growth Cockpit |
| **Internal Codename** | Diamond Mining (keep — don't rename folder) |
| **Repo Folder** | `/Users/kosalprum/Documents/AdvDiamondMining/` |
| **Firebase Project** | `theaumengine` |
| **Deploy Command** | `firebase deploy --only hosting --project theaumengine` |
| **Alfred's Repo** | `https://github.com/kprum1/alfred-clawbot` |
| **Alfred's AUM Docs** | `alfred-clawbot/theaumengine/` folder |

---

## 📁 CODEBASE SNAPSHOT

```
AdvDiamondMining/
├── index.html          158 lines  — app shell, sidebar, all page views
├── css/
│   └── main.css       1346 lines  — full design system, dark/light tokens
├── js/
│   ├── app.js          295 lines  — nav routing, all page renderers
│   └── data.js         568 lines  — all data: niches, prospects, alerts, utils
├── firebase.json                  — SPA hosting config
├── .firebaserc                    — project alias: theaumengine
├── og-image.png                   — social preview image
└── VERA_HANDOFF_v2.md             — this file
```

---

## ✅ PHASE 1.2 — FULLY SHIPPED (DO NOT RE-DO)

Every item below is live at theaumengine.web.app:

- [x] **Rebrand** — "The AUM Engine" in all UI, meta tags, OG image
- [x] **Outreach Studio** — prospect switching fully wired (activeOutreachProspectId state)
- [x] **Status normalization** — New / Contacted / Engaged / Nurture / Meeting Requested / Booked / Dead
- [x] **Manager Console** — stable computed metrics (no Math.random)
- [x] **CSV Import/Export** — manual CRM bridge working
- [x] **localStorage** — ICP settings + Meeting Notes persist across sessions
- [x] **Empty states** — filter shows helpful empty-state UI
- [x] **Dark / Light mode toggle** — ☀️/🌙 button in sidebar footer, persists in localStorage as `aumTheme`
- [x] **OG/Twitter social preview** — og-image.png linked in index.html
- [x] **Firebase deployed** — live at theaumengine.web.app
- [x] **DNS configured** — Squarespace has 4 custom records for www.theaumengine.com

---

## 🗂️ DATA LAYER — CURRENT STATE

### Niches (7 total — `NICHES` array in data.js)

| ID | Icon | Name | Count | Color |
|---|---|---|---|---|
| n1 | ✈️ | Aircraft Owners | 47 | #60a5fa |
| n2 | 🏢 | Business Owners | 89 | #a78bfa |
| n3 | 🎗️ | Charity Board Members | 34 | #34d399 |
| n4 | 💰 | Inheritance Recipients | 28 | #fbbf24 |
| n5 | 👩‍⚕️ | Physicians & Surgeons | 61 | #fb7185 |
| n6 | 🚀 | HENRYs | 19 | #22d3ee |
| **n7** | 🤖 | **AI-Displaced Executives** | **10** | **#f59e0b** |

### Prospects (29 total — `PROSPECTS` array in data.js)
- p1–p8: Aircraft Owners + Business Owners (original cohort)
- p9–p23: Full coverage across n1–n5 (expanded in phase 1.2)
- p24: HENRYs (Jordan Pierce, Denver)
- **p25: Kirk McDonald** — Apple Director, Bend OR, Fit 98 🔥 (AI-Exec)
- **p26: Nuria Molina** — IBM VP, Miami FL, Fit 99 🔥 (AI-Exec)
- **p27: Tim Sneath** — Apple/Google Director, SF CA, Fit 91 (AI-Exec)
- **p28: Ajay Punjabi** — Salesforce Exec, LA CA, Fit 88 (AI-Exec)
- **p29: Corinne Sklar** — IBM/Salesforce VP, NY NY, Fit 93 (AI-Exec)

### Alfred also has more AI-exec CSVs in his repo:
- `alfred-clawbot/theaumengine/data/ai-displaced-execs-15-real.csv` — 15 more
- `alfred-clawbot/theaumengine/data/ai-displaced-executives-sample.csv` — sample set

---

## 🎨 DESIGN SYSTEM (css/main.css)

### Token Architecture
- **Dark mode** = `:root` defaults (navy/slate palette)
- **Light mode** = `[data-theme="light"]` overrides
- Toggle: `toggleTheme()` in app.js, persists as `localStorage.aumTheme`
- Button: `#theme-toggle-btn` in sidebar footer, below Big Nate's rep card

### Key CSS Classes
```
.sidebar           — left nav (250px)
.main-content      — flex-fill scrollable area
.prospect-drawer   — slide-in detail panel (right)
.status-pill       — colored status labels
.score-bar         — fit/timing score visualization
.empty-state       — no-results placeholder
.theme-toggle      — dark/light toggle button
```

### Avatar Color Classes
`av-blue` `av-violet` `av-cyan` `av-emerald` `av-rose` `av-amber` `av-indigo`

---

## 🧭 APP NAVIGATION (app.js)

Pages wired via `navigate(page)` and `data-page` attributes on nav items:

| Page ID | Label | Key Function |
|---|---|---|
| `command-center` | Command Center | `pageCommandCenter()` |
| `prospect-mine` | Prospect Mine | `pageProspectMine()` |
| `lead-scoreboard` | Lead Scoreboard | `pageLeadScoreboard()` |
| `outreach-studio` | Outreach Studio | `pageOutreachStudio()` |
| `nurture-booking` | Nurture & Booking | `pageNurtureBooking()` |
| `meeting-prep` | Meeting Prep | `pageMeetingPrep()` |
| `manager-console` | Manager Console | `pageManagerConsole()` |
| `settings-icp` | Settings & ICP | `pageSettingsICP()` |

### Key State Variables
```js
let currentPage             // active page ID
let drawerProspect          // currently open drawer prospect object
let activeOutreachProspectId  // selected prospect in Outreach Studio
let miningActive            // boolean — prevents double-trigger on mine
```

### localStorage Keys
- `aumEngineICP` — ICP config JSON
- `aumEngineNotes` — per-prospect meeting notes `{prospectId: noteText}`
- `aumTheme` — `'dark'` or `'light'`

---

## 🚀 PHASE 1.3 — NICHE MAPPING ENGINE (NEXT BUILD)

### What It Is
A short guided intake (20–30 questions) that helps an RIA advisor identify their best niche match. Outputs a niche recommendation + generated ICP rules, mining filters, and messaging angles.

### Architecture (adapted from AllPro's eval engine)
**Source material:** `/Users/kosalprum/Documents/AllProCC/data.js` line 25650+  
AllPro has a full zone/archetype/scoring engine we can DIRECTLY port and remap.

### The 5 AUM Niche Buckets (Alfred's spec)
| Bucket | AllPro Zone Equivalent | What It Measures |
|---|---|---|
| **Fit** | `client_community` (niche expertise) | Does your background match this niche? |
| **Focus** | `strengths` (financial strategy) | How specialized can you go in this market? |
| **Market** | `growth_ma` (geographic/market) | Is the niche accessible in your geography? |
| **Access** | `behavioral` + `business_ownership` | Do you have warm entry points into the niche? |
| **Service Match** | `orientation` + `tech_ai` | Does your style fit what this niche needs? |

### Target Niche Archetypes (output results)
Score the advisor against each of the 7 niches above and recommend top 3 matches.

### AllPro Engine Pattern to Reuse
```js
// Zone config with weights
const NICHE_ZONE_CONFIG = { fit: {...}, focus: {...}, market: {...}, access: {...}, service: {...} }

// Question bank (20–30 screener-style questions, 1–5 Likert scale)
const NICHE_QUESTIONS = [{ id, text, zone, nicheWeights: {n1: 1.2, n2: 0.8, ...}, reverse }]

// Scoring: for each niche, sum weighted answers → normalize to 0–100
// Output: sorted niche ranking + generated ICP block + messaging angle

// Persist result to localStorage as 'aumNicheProfile'
```

### New Page to add to index.html
```html
<div id="page-niche-mapping" class="page-view">...</div>
```
Nav item label: **"Niche Mapping"** with icon 🧭, position: between Lead Scoreboard and Outreach Studio

### Deliverables for Phase 1.3
1. **`js/niche_engine.js`** — question bank, scoring engine, output generator
2. **`pageNicheMapping()`** in `app.js` — wizard UI renderer
3. **New nav item** in `index.html`
4. **Result card** showing: Top 3 Niches, ICP summary, Mining filter config, messaging angle
5. **Auto-populate Settings & ICP** from the result (link the two pages)

---

## 🔭 ALFRED'S DOCS (in alfred-clawbot/theaumengine/)

| File | Contents |
|---|---|
| `docs/aum-engine-gtm-playbook.md` | Pricing tiers, cold email scripts, homepage copy |
| `docs/aum-engine-phase-1.2-build-spec.md` | Full Phase 1.2 spec (DONE) + Phase 1.3 spec |
| `docs/niche-advisor-growth-engine-strategy.md` | ICP research, Vera's GTM playbook, Big Nate tech specs |
| `docs/advisor-competitor-research.md` | Competitive intel |
| `docs/wealth-trigger-mining-playbook.md` | Alfred's wealth signal mining methodology |
| `data/ai-displaced-execs-10-new.csv` | 10 real prospects (5 injected, 5 still available) |
| `data/ai-displaced-execs-15-real.csv` | 15 more real prospects |
| `scripts/wealth_miner_orchestrator.py` | Alfred's Python miner |
| `scripts/scrape_apollo_execs.py` | Apollo.io executive scraper |

---

## 💰 GTM / PRICING (from Alfred's playbook)

| Tier | Price | What's Included |
|---|---|---|
| Pilot / Solo | $297/mo founding → $497/mo public | 1 niche, 25 prospects/mo, AI outreach, CSV export |
| Growth Team | $997/mo | 2–3 niches, 50 prospects/mo, intake questionnaire |
| Enterprise | $2,497/mo | Unlimited niches, 150+ prospects, CRM webhook |
| + Performance kicker | +$150–$250/meeting | Per booked first meeting delivered |

**Founding Pilot Offer:** $297/mo locked for life, 30-day "meetings or we comp month 2" guarantee

---

## 🌐 DOMAIN / DNS STATUS

**Squarespace DNS — 4 custom records added:**
| Type | Name | Data |
|---|---|---|
| CNAME | `www` | `theaumengine.web.app` |
| A | `@` | `199.36.158.100` |
| TXT | `@` | `hosting-site=theaumengine` |
| TXT | `_acme-challenge.www` | `cDGMueu_H6xHo6jDZMhC4r6z-_lEhcj5wH1CJ7nKnH0` |

Firebase verification pending propagation (~24h). Once green → SSL auto-issues.

---

## ⛔ KNOWN ISSUES / WATCH LIST

1. **CSS empty rulesets** (3 warnings, lines 326, 1016, 1223 in main.css) — cosmetic, non-blocking
2. **CSV parser** — basic split on comma, doesn't handle quoted commas. Fine for demo, needs upgrading before real import
3. **localStorage only** — no Firestore yet. Data resets on different devices/browsers. Phase 2 wires this to Firebase.
4. **Niche count** in NICHES array is hardcoded, not computed from PROSPECTS. Stays accurate as long as counts are updated manually.

---

## 🎯 NEXT CONVERSATION PRIORITIES

**Start here:**
1. Build `js/niche_engine.js` — Niche Fit Mapping question bank + scoring  
   → Port AllPro's zone/archetype engine, remap to 5 AUM buckets + 7 niche scoring outputs

2. Build `pageNicheMapping()` in app.js — Wizard UI (screener → core → results)  
   → Reuse AllPro's screener → core flow, adapt for niche recommendations instead of advisor archetypes

3. Add "Niche Mapping" nav item in index.html

4. Wire results to auto-populate Settings & ICP

**After that:**
5. Build theaumengine.com landing page (Alfred already wrote all the copy in GTM playbook)
6. Import remaining 15 AI-exec prospects from alfred-clawbot CSVs
7. Firestore backend (Phase 2)

---

*Handoff prepared by Big Nate (Antigravity) — April 6, 2026*  
*Next agent: Vera or Big Nate in fresh conversation*
