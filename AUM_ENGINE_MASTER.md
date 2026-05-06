# AUM ENGINE MASTER REFERENCE
**Single source of truth for all agents — design + architecture + data + rules**
**Last Updated:** 2026-04-23 · C44 Sprint
**Live URL:** https://theaumengine.web.app
**Firebase Project:** `theaumengine`
**Project Root:** `/Users/kosalprum/Documents/AdvDiamondMining`
**Stack:** Vanilla HTML/CSS/JS + Firebase (Firestore, Auth, Hosting) + Node.js (Admin SDK scripts)

> ⚠️ **ALL AGENTS READ THIS FIRST.** This supersedes MASTER_CONTEXT.md and all Sprint handoffs for session startup. If anything conflicts with an older doc, **this file wins.**

---

## PART 1 — PRODUCT OVERVIEW

The AUM Engine is an **advisor growth cockpit** built for independent Financial Professionals at the $50M–$250M AUM plateau. It provides:
- Exclusive, niche-qualified lead households (not shared internet leads)
- A scoring and enrichment pipeline (Apollo, PDL, NPI)
- Advisor outreach tools (email, LinkedIn, call openers)
- Client intake and planning briefs (Al/ED system)
- Operator routing and management console

**Business context:** Built for Kosal Prum's Ameriprise Financial Wayzata branch partnership with Jeremy Jackson, extended to a 7-advisor pilot cohort.

**Operator:** `kosal@fin-tegration.com` (UID prefix `FvEWqsET`) — unlimited lead cap, all admin access.

---

## PART 2 — DESIGN SYSTEM

### Tokens (CSS Custom Properties — `css/main.css`)

```css
/* Backgrounds */
--bg-base:        #080c14   /* outermost page bg */
--bg-surface:     #0d1320   /* sidebar */
--bg-card:        #111827   /* cards, tables */
--bg-card-hover:  #151e2d
--bg-elevated:    #1a2235   /* chips, table headers */
--bg-input:       #0f1824

/* Borders */
--border-subtle:  rgba(96,165,250,0.08)
--border-default: rgba(96,165,250,0.14)
--border-accent:  rgba(96,165,250,0.30)

/* Text */
--text-primary:   #f0f4ff
--text-secondary: #8b9cbf
--text-muted:     #4a5a7a
--text-accent:    #60a5fa

/* Brand colors */
--blue:           #60a5fa   /* primary accent */
--blue-dark:      #3b82f6
--blue-bright:    #93c5fd
--violet:         #a78bfa   /* secondary accent */
--violet-dark:    #7c3aed
--cyan:           #22d3ee
--emerald:        #34d399   /* success / booked */
--amber:          #fbbf24   /* warning / nurture */
--rose:           #fb7185   /* hot / danger */
--orange:         #fb923c   /* contacted */

/* Brand gradient */
--gem-gradient:   linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)
--gem-glow:       0 0 30px rgba(96,165,250,0.2), 0 0 60px rgba(167,139,250,0.1)

/* Status colors */
--status-hot:     #fb7185
--status-warm:    #fbbf24
--status-cold:    #60a5fa
--status-booked:  #34d399
--status-new:     #a78bfa
--status-nurture: #22d3ee
--status-dead:    #4a5a7a

/* Structural */
--sidebar-width:  240px

/* Transitions */
--transition:       0.18s cubic-bezier(0.4, 0, 0.2, 1)
--transition-slow:  0.35s cubic-bezier(0.4, 0, 0.2, 1)

/* Shadows */
--shadow-card:     0 4px 24px rgba(0,0,0,0.4)
--shadow-elevated: 0 8px 40px rgba(0,0,0,0.6)
--shadow-gem:      0 0 40px rgba(96,165,250,0.15)
```

### Light Mode
Token overrides at `[data-theme="light"]`. Gem gradient, accent colors, and status colors stay identical. Only bg/text/border/shadow tokens swap.
- Toggle: `toggleTheme()` — persisted in `localStorage('aumTheme')`, applied via `document.documentElement.dataset.theme`

### Typography
```
Primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif
Mono:    'JetBrains Mono', monospace  (ranks, timestamps, IDs)
Base:    14px root
```

### Layout Pattern — App Mode
```
body.app-mode {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
/* Sidebar: 240px fixed | Main: flex:1, overflow-y:auto */
```
`body.app-mode` is applied by `auth.js` AFTER login. Before login, `body` is block (landing page scroll).

### Component Patterns

**Cards** — `class="card"` — bg-card, border-subtle, border-radius:12px, padding:16px
**Hover:** border-default, no transform

**KPI Cards** — `class="kpi-card"` — 2px top accent bar via `--kpi-color`, icon at top-right at 0.15 opacity
**Grid:** `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`

**Buttons:**
- `.btn-primary` — gem-gradient bg, white text, glow shadow
- `.btn-secondary` — bg-elevated, border-default
- `.btn-ghost` — transparent, border-subtle
- `.btn-danger` — rose tint bg + border

**Filter Chips** — `.filter-chip` — pill shape (border-radius:20px), toggles to blue active state
**Active state:** `background:rgba(96,165,250,0.1); border-color:var(--border-accent); color:var(--blue)`

**Status Pills** — `.status-pill` with `.pill-{status}` variant
- hot / warm / cold / booked / new / nurture / dead / contacted / engaged / snoozed

**Tables** — `.table-wrap > table.data-table`
- thead: bg-elevated, 10px uppercase labels
- tbody rows: hover bg rgba(96,165,250,0.04), cursor:pointer
- Sortable columns: `sbSortBy(col)` — arrow indicators inline

**Score Bars** — `.score-bar > .score-track > .score-fill`
- Fit = `--blue`, Timing = `--violet`, Priority = `--emerald`
- Width animates via `transition: width 0.6s ease`

**Drawers — Prospect Detail**
- `.prospect-drawer` — fixed right, 480px wide, slides in via `right: -480px → 0`
- `.drawer-overlay` — fixed full-screen semi-transparent backdrop
- z-index: drawer=300, overlay=200

**Niche Drawer (openNicheDrawer)**
- Dynamically created `div#niche-prospect-drawer` — 520px wide, z-index:700
- Backdrop: `div#niche-drawer-backdrop`, z-index:600
- Slide-in animation: `@keyframes nd-slide-in`

**Contact Card Modal (openContactCard)**
- Modal: `div#contact-card-modal` — centered, 460px wide, z-index:900
- Backdrop: `div#contact-card-backdrop`, z-index:800
- Pop animation: `@keyframes cc-pop` scale(.96 → 1)

**Toast Notifications**
- `div#toast-container` — fixed, always accessible outside both shells
- `showToast(message, icon)` — auto-dismiss

**Agent Thinking Indicator** — `.agent-thinking > .agent-dots > span` — staggered pulse animation

**Enrichment Signal Dots** — `.esig-grid` — 2×2 grid of `.esig-dot-sm` colored by signal type:
- `esig-wealth` (amber), `esig-liquidity` (blue), `esig-contact` (violet), `esig-court` (rose)
- `esig-empty` = muted gray

**Avatar Classes** — `.av-blue`, `.av-violet`, `.av-emerald`, `.av-amber`, `.av-rose`, `.av-cyan`
- Assigned deterministically by `getAvatarClass(lastName)` — first letter → color bucket

### Page Structure Pattern
Every cockpit page follows:
```html
<div class="page-header">     <!-- title + actions -->
<div class="kpi-strip">       <!-- optional KPI row -->
<div class="filters-bar">     <!-- chips + search -->
<div class="section">         <!-- content grid -->
```

### Grid Utilities
```css
.grid-2   { grid-template-columns: 1fr 1fr; gap:12px }
.grid-3   { grid-template-columns: 1fr 1fr 1fr; gap:12px }
.grid-12  { grid-template-columns: 1fr 2fr; gap:16px }
.grid-21  { grid-template-columns: 2fr 1fr; gap:16px }
```

### CSS Do / Don't Rules
| ✅ DO | ❌ DON'T |
|---|---|
| Use CSS custom properties for all colors | Hardcode hex colors in JS templates |
| Use `--transition` / `--transition-slow` for animations | Add random `transition` values |
| Use `border-radius:12px` for cards, `8px` for buttons/inputs, `20px` for chips/pills | Mix border-radius values inconsistently |
| Use `font-size:12.5px` for table body text | Go below 10px for any interactive element |
| Add `font-family:inherit` to all `<button>` elements | Let buttons default to system font |
| score bars: 3–5px height | Use tall score bars (they look wrong) |

---

## PART 3 — ARCHITECTURE

### File Map
```
/Users/kosalprum/Documents/AdvDiamondMining/
├── index.html                  811 lines — public shell + app shell
├── css/
│   └── main.css               3,845 lines — full design system
├── js/
│   ├── data.js                ~843  lines — NICHES[], PROSPECTS[], computeNicheMetrics()
│   ├── niche_engine.js        ~500  lines — wizard scoring, path selection
│   ├── db.js                   738  lines — all Firestore reads/writes
│   ├── auth.js                ~634  lines — Firebase Auth, login/logout, role gate
│   ├── admin.js              ~1,184 lines — Admin Dashboard (operator only)
│   ├── outreach_agent.js      ~400  lines — AI outreach draft generation
│   ├── outreach_controller.js ~500  lines — outreach state machine
│   ├── funnel_tracker.js      ~300  lines — event analytics
│   ├── ed_intake_engine.js    ~600  lines — Client Intake (ED) flow
│   ├── planning_agent.js      ~347  lines — Al brief generation
│   ├── pages.js              2,292  lines — all page renderers
│   ├── onboarding.js          ~200  lines — first-run onboarding
│   ├── sentinel.js            ~200  lines — Security Sentinel page
│   └── app.js                2,392  lines — router, state, event handlers
└── scripts/
    ├── serviceAccountKey.json  ← GITIGNORED — never commit
    ├── lead_ingest_agent.js    — ingest Alfred batch to Firestore
    ├── trigger_routing.js      — run routing engine pass
    ├── write_pipeline_meta.js  — update meta/pipeline_stats
    ├── audit_leads.js          — pipeline health check
    ├── agent_apollo_enrich_v2.js — Apollo enrichment engine
    ├── agent_pdl_enrich.js     — PDL enrichment engine
    ├── enrichment_status_report.js
    ├── enrichment_truth_count.js
    ├── spot_check_enriched.js
    └── audit_name_quality.js
```

### Script Load Order (index.html)
```
data.js → niche_engine.js → db.js → admin.js → outreach_agent.js →
funnel_tracker.js → outreach_controller.js → ed_intake_engine.js →
planning_agent.js → pages.js → onboarding.js → sentinel.js →
app.js → auth.js
```
`auth.js` loads LAST. It calls `bootstrapUserData()` on login which hydrates state.

### Two-Shell Architecture
```html
#public-shell  — landing page, always in DOM, hidden on auth
#app-shell     — cockpit, always in DOM, hidden until auth
```
`auth.js` toggles visibility via `display:none/flex`.

### Router (`app.js`)
```javascript
let currentPage = 'command-center';
let activeFilters = { status:'all', niche:'all', enrichment:'all' };

function navigate(page) { ... renderPage(); }
function renderPage() { main.innerHTML = ''; div.innerHTML = pageMap[currentPage](); }
```
All pages are rendered as HTML strings by functions in `pages.js`.
`bindPageEvents()` is called after every render (no event delegation — re-bind each time).

### State Variables (app.js globals)
| Variable | Purpose |
|---|---|
| `currentPage` | Active page ID |
| `activeFilters.status` | Lead status filter: `'all'` \| `'enriched'` \| `'needs-data'` \| pipeline status |
| `activeFilters.niche` | Niche filter: `'all'` \| nicheId |
| `activeFilters.enrichment` | Enrichment segment: `'all'` \| `'has-phone'` \| `'has-email'` \| `'has-linkedin'` \| `'has-address'` \| `'has-home'` \| `'fully-contactable'` |
| `window._cohortView` | `true` = bypass `isReady` gate in Lead Scoreboard |
| `window._scoreboardPage` | Current pagination page (1-indexed) |
| `window._sbSort` | `{ col: 'priority', dir: 'desc' }` |
| `window._firestoreLeadTotal` | Live count from meta/pipeline_stats |
| `window._firestoreNicheBreakdown` | Per-niche lead counts from meta |
| `window._advisorProfile` | Loaded from Firestore on login |
| `window._currentUser` | Firebase Auth user object |
| `nicheWizardStage` | 0–4 (wizard progression) |
| `nicheProfile` | Computed niche match result |

---

## PART 4 — DATA MODEL

### PROSPECTS Schema (in-memory array)
```javascript
{
  id:              'fs_' + assignmentDocId,   // or 'al_' + id for migrated
  firstName:       String,
  lastName:        String,
  title:           String,
  company:         String,
  city:            String,
  state:           String,
  zip:             String,
  niche:           String,     // display label
  nicheId:         String,     // routing key (see valid list below)
  assets:          String,     // '$1M+' display string
  priorityScore:   Number,     // 0-100
  fitScore:        Number,     // 0-100
  timingScore:     Number,     // 0-100
  status:          String,     // 'New' | 'Contacted' | 'Engaged' | 'Nurture' | 'Meeting Requested' | 'Booked' | 'Dead' | 'Snoozed'
  phone:           String,
  email:           String,
  linkedInUrl:     String,     // always absolute (https://)
  npiNumber:       String,
  specialty:       String,
  propertyAddress: String,
  homeValue:       Number,
  reasonCodes:     Array,
  signals:         Object,
  source:          String,
  assignedRep:     String,
  lastActivity:    String,
  masterLeadId:    String,
  assignmentId:    String,     // Firestore doc ID for write-back
  _fromFirestore:  Boolean,
}
```

### isReady Gate
```javascript
const isReady = p => !!(p.firstName && p.lastName && p.phone && p.phone.trim() && p.propertyAddress);
```
Used in: Command Center Top-8, Lead Scoreboard default view.
**Cohort view** (`window._cohortView = true`) bypasses this gate to show all niche leads.

### Firestore Collections
| Collection | Purpose |
|---|---|
| `master_leads` | Raw lead records — operator writes, advisors read via CF gateway |
| `lead_assignments` | Advisor ↔ lead — `ownerUid`, `ownershipStatus: 'active'|'pending'` |
| `routing_queue` | Ingested leads awaiting routing pass |
| `advisor_pool` | Advisor eligibility, niches, leadCap, geography |
| `meta/pipeline_stats` | Aggregated counts — source of KPI truth |
| `users/{uid}/data/nicheProfile` | Advisor's niche wizard result |
| `users/{uid}/data/nicheAnswers` | In-progress wizard answers |
| `users/{uid}/data/icpConfig` | ICP settings |
| `users/{uid}/data/advisorProfile` | Advisor routing profile |
| `advisor_settings/{uid}` | Booking link, display preferences |
| `ed_situations` | Client ED intake submissions |
| `ed_consent_log` | Immutable consent audit trail |
| `outreach_outcomes` | Per-advisor outreach log |
| `operator_presence` | Real-time session tracking |
| `funnel_events` | Analytics events |

### Lead Count KPI Rule
**Always use `window._firestoreLeadTotal`** (from `meta/pipeline_stats`) — NOT `PROSPECTS.length`.
`PROSPECTS.length` includes 28 hardcoded demo leads + partial Firestore hydration.

### Enrichment Data Model
Stored on Firestore lead doc at `enrichment:{}` sub-object and mirrored to `ENRICHMENT_STORE[leadId]` in browser:
```javascript
{
  wealthScore, estimatedNetWorth,
  liquidityEvent, liquidityEventType, liquidityEventDate,
  personalEmail, personalPhone, contactConfidence,
  courtSignal, courtSignalType, courtSignalDate,
  enrichedAt, enrichmentSources: []  // arrayUnion prevents stomping
}
```

---

## PART 5 — PAGES INVENTORY

| Page | Renderer | Access | Key Logic |
|---|---|---|---|
| `command-center` | `pageCommandCenter()` | All | Top-8 (isReady), KPI strip, Alerts, Niche Performance, Al Briefs |
| `prospect-mine` | `pageProspectMine()` | All | Niche cards, Mine Parameters, Recent Cohorts (Firestore meta) |
| `lead-scoreboard` | `pageLeadScoreboard()` | All | Filterable table, cohort view, enrichment segment bar, pagination 200/page |
| `niche-mapping` | `pageNicheMapping()` | All | 5-stage wizard: macro→preview→meso→micro→results |
| `outreach-studio` | `pageOutreachStudio()` | All | Channel + stage selection, AI draft, agent stack |
| `nurture-booking` | `pageNurtureBooking()` | All | Kanban pipeline board |
| `meeting-prep` | `pageMeetingPrep()` | All | Pre-meeting brief for selected prospect |
| `client-intake` | `pageClientIntake()` | Operator only | ED situation inbox |
| `ed-disclosure` | `pageEdDisclosure()` | All (pre-auth ok) | Disclosure consent gate |
| `ed-intake` | `pageEdIntake()` | Intake flow | Multi-step client intake form |
| `manager-console` | `pageManagerConsole()` | Operator | Advisor management panel |
| `settings` | `pageSettings()` | All | ICP Config, booking link, display name |
| `admin-dashboard` | `pageAdminDashboard()` | Operator | Full advisor CRM + routing stats |
| `security-sentinel` | `pageSentinelDashboard()` | Operator | App Check telemetry |
| `privacy` | `pagePrivacyPolicy()` | Public | Legal — linked from footer |
| `terms` | `pageTermsOfService()` | Public | Legal — linked from footer |

### Cohort View Mode (C44)
```javascript
// Entering cohort mode (from Prospect Mine "Load →" button):
window.loadCohort = function(nicheId) {
  activeFilters.niche      = nicheId;
  activeFilters.status     = 'all';
  activeFilters.enrichment = 'all';
  window._cohortView       = true;   // bypasses isReady gate
  window._scoreboardPage   = 1;
  navigate('lead-scoreboard');
};

// Exiting cohort mode:
// setFilter('niche','all') resets _cohortView = false
// "Exit to All Ready" link: window._cohortView=false; setFilter('niche','all')
```

### Enrichment Segment Bar (C44)
Second filter row below status chips. Shows only chips with count > 0.
Chips: `fully-contactable` | `has-phone` | `has-email` | `has-linkedin` | `has-address` | `has-home`
AND-filtered on top of niche + status filters. Clicking active chip toggles off (→ 'all').

---

## PART 6 — VALID NICHE IDs

| nicheId | Display Label |
|---|---|
| `physicians` | Physicians & Surgeons |
| `dentists` | Dentists / Specialists |
| `c-suite-executives` | C-Suite Executives |
| `henrys` | HENRYs |
| `aircraft-owners` | Aircraft Owners |
| `business-owners` | Business Owners |
| `law-partners` | Law Partners |
| `re-developers` | Real Estate Developers |
| `ai-displaced-executives` | AI-Displaced Executives |
| `charity-board-members` | Charity Board Members |
| `pro-athletes` | Pro Athletes |
| `inheritance` | Inheritance Recipients |
| `high-earning-tradesman` | High-Earning Tradesmen |
| `yacht-owners` | Yacht Owners |
| `real-estate-investors` | Real Estate Investors |

⚠️ `re-developers` and `real-estate-developers` are two different strings — tech debt. Some old agents wrote the wrong one. Wrong nicheId = `eligibility_empty` = lead never assigned.

---

## PART 7 — ENRICHMENT PIPELINE

### Data State (C44 · 2026-04-23)
```
Total master leads:  10,067
📧 Email:             240 (2%)
📞 Phone:           1,429 (14%)
🔗 LinkedIn:          142 (1%)
🟢 Fully enriched (3+ fields): 25
🟡 Partial (1-2 fields):    1,583
🔴 Blank:                   8,459
```

### Enrichment Sources
| Tool | Use Case | Status |
|---|---|---|
| Apollo v2 | B2B: phone, email, title, LinkedIn | ✅ Active — Professional plan |
| PDL | Consumer: personal email for HENRYs | ✅ Configured — Basic plan (upgrade to Pro for HENRYs) |
| Proxycurl | LinkedIn URL → email/phone reverse | Ready (28 leads with LinkedIn, no email) |
| NPI Registry | Physician/Dentist: phone, credential, specialty | ✅ Built-in via sourcing agents |

### Apollo v2 Key Improvements (C44)
- **Phone anchor:** Pass existing `p.phone` as match signal → boosts hit confidence
- **Score threshold:** Raised 30 → 50 — prevents weak cross-niche matches
- **Title signal:** Injects `titleSignal` from `title`, `specialty`, or niche hint

### Enrichment Runbook
```bash
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

# Status check
node scripts/enrichment_status_report.js

# Apollo run (live)
node scripts/agent_apollo_enrich_v2.js --niche physicians --limit 100

# Apollo run (dry-run — no writes)
node scripts/agent_apollo_enrich_v2.js --niche henrys --limit 50 --dry-run

# PDL run
node scripts/agent_pdl_enrich.js --niche aircraft-owners

# Audit name field quality (detect company-name pollution)
node scripts/audit_name_quality.js
```

### Company-Name Pollution (Known Issue — C44)
5 niches stored company/firm names in `firstName`/`lastName` instead of individual names. Apollo returns 0 because no person to match:
| Niche | Source | Fix |
|---|---|---|
| `law-partners` | AmLaw firm names | Re-mine with partner name extraction |
| `business-owners` | SBA company names | Re-parse raw CSVs for owner field |
| `re-developers` | HUD property names | Re-mine with principal resolution |
| `high-earning-tradesman` | BBB company names | Re-parse with owner extraction |
| `ai-displaced-executives` | SEC CIK artifacts | Purge + re-mine from WARN Act data |

---

## PART 8 — PIPELINE STATE & ROUTING

### Current Pipeline (C44 · 2026-04-23)
```
master_leads:       10,067 unique prospects
lead_assignments:    2,854 advisor assignments
```

### Ingest Checklist (run in order after every Alfred batch)
```bash
export PATH="/opt/homebrew/opt/node/bin:/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

node scripts/audit_leads.js                                        # 1. pre-audit
node scripts/lead_ingest_agent.js --file scripts/staging/alfred_batch_YMD.json  # 2. ingest
node scripts/trigger_routing.js                                    # 3. route
node scripts/write_pipeline_meta.js                                # 4. ⚠️ REQUIRED — update KPI
node scripts/audit_leads.js                                        # 5. confirm
```

### meta/pipeline_stats
- Written by `write_pipeline_meta.js` (Admin SDK)
- Read by `fetchAdvisorLeadCount()` in `db.js` on login
- Powers `window._firestoreLeadTotal` and `window._firestoreNicheBreakdown`

---

## PART 9 — PERMANENT ARCHITECTURAL RULES

### Rule 1 — NEVER use `.count()` aggregation
Firebase compat SDK v9.23.0 does NOT support `.count()`. It silently fails → returns 0.
Always use `meta/pipeline_stats` via `write_pipeline_meta.js`.

### Rule 2 — Always run `write_pipeline_meta.js` after every ingest
Cockpit KPI will be stale otherwise. No exceptions.

### Rule 3 — Operator detection pattern
```javascript
const isOp = window._currentUser?.email === 'kosal@fin-tegration.com'
          || window._advisorProfile?.role === 'operator'
          || window._advisorProfile?.isOperator === true;
```

### Rule 4 — Idempotency key = SHA-256(firstName + lastName + email + phone)
Exact duplicates are silently skipped on ingest. To fix a bad record: delete from Firestore, re-ingest.

### Rule 5 — `serviceAccountKey.json` never leaves the machine
At `scripts/serviceAccountKey.json`. Gitignored. Never commit. Alfred never touches it.

### Rule 6 — Apollo API key not in repo
Configured directly in `scripts/agent_apollo_enrich_v2.js` line 1 or via env. NOT committed.

### Rule 7 — `lead_assignments` is the canonical routing collection (Sprint 4+)
`al_assignments` collection is deprecated. All reads/writes go to `lead_assignments`.
`ownerUid` field links to advisor UID. `ownershipStatus: 'active'|'pending'`.

### Rule 8 — LinkedIn URLs must be absolute
`getDisplayName()` normalizes to `https://` prefix. Raw LinkedIn paths (`/in/...`) break links.

### Rule 9 — `window._cohortView` resets on niche filter change
`setFilter('niche', x)` auto-clears `_cohortView` when niche is reset to `'all'`.

### Rule 10 — Score normalization
Old routing engine stored scores as 0.0–1.0 floats. New scripts use 0–100 integers.
Detection: `if (score > 0 && score <= 1) { score = Math.round(score * 100); }`

---

## PART 10 — SECURITY

| Layer | Implementation |
|---|---|
| Firebase App Check | reCAPTCHA Enterprise v3 — silently blocks non-browser traffic |
| Invite-only auth gate | Allowlist checked on login — unauthorized emails rejected |
| Firestore rules | Per-UID scoping — advisors only see own assignments |
| Security headers | X-Frame-Options, X-Content-Type-Options — firebase.json |
| Service account key | `scripts/serviceAccountKey.json` — gitignored |
| API keys | Apollo, PDL — in scripts directly, NOT committed |

---

## PART 11 — THE AI CREW

| Agent | Platform | Role |
|---|---|---|
| **Kosal** (CEO) | Human | Direction, approvals, DNS/config |
| **Big Nate** | Antigravity (Claude Sonnet) | Builds + deploys code, runs scripts |
| **Alfred** | OpenClaw (Clawbot) | Lead sourcing from public registries |
| **Vera** | Perplexity Computer | Independent production auditor |
| **Mini Nate** | Antigravity (Claude Haiku) | Task coordination, quick formatting |

### Session Startup Prompts

**Big Nate (Antigravity):**
```
Starting [SPRINT] for The AUM Engine.
Read first: /Users/kosalprum/Documents/AdvDiamondMining/AUM_ENGINE_MASTER.md
Live URL: https://theaumengine.web.app
Operator: kosal@fin-tegration.com
```

**Alfred (OpenClaw):**
```
You are Alfred. Read these files in full before producing any leads:
1. /Users/kosalprum/Documents/AdvDiamondMining/AUM_ENGINE_MASTER.md
2. /Users/kosalprum/Documents/AdvDiamondMining/.agents/skills/alfred_lead_ingest/ALFRED_GUARDRAILS_STRATEGY.md
Then begin the Saturday Protocol.
```

**Vera (Perplexity):**
```
You are Vera. Read: /Users/kosalprum/Documents/AdvDiamondMining/AUM_ENGINE_MASTER.md
Audit: https://theaumengine.web.app (login: kosal@fin-tegration.com)
```

---

## PART 12 — CURRENT SPRINT (C45) PRIORITY QUEUE

### 🔴 P0
1. **Fix company-name pollution** — law-partners, business-owners, re-developers, high-earning-tradesman, ai-displaced-executives → re-mine with individual names → re-run Apollo
2. **PDL Pro upgrade ($98/mo)** → run HENRYs personal email enrichment (8,056 leads, ~0 emails)

### 🟡 P1
3. **Proxycurl** — 28 LinkedIn-only leads → reverse-enrich email/phone (~$1.40 total)
4. **HENRYs propertyAddress backfill** — GIS `situs_address` was never mapped to `propertyAddress` field
5. **Apollo re-force physicians** — ~1,134 un-enriched physicians remain

### 🟢 P2
6. Lead Scoreboard — sortable enrichment signals column
7. Export Enriched CSV (email, phone, LinkedIn, title, homeValue)
8. Cohort View — `← Back to Prospect Mine` button
9. Niche score resync — leads with `priorityScore` stuck at 75 (default)

---

## PART 13 — HOW TO MAINTAIN THIS FILE

**Update at end of every sprint:**
- Part 12 (priority queue) — replace with new sprint items
- Part 8 (pipeline state numbers) — run `enrichment_status_report.js` and paste
- Header "Last Updated" date and sprint label

**Keep under 850 lines.** Archive sprint detail to `.agents/handoffs/`. Keep this lean and loadable in one shot.

---

*AUM_ENGINE_MASTER.md — The AUM Engine Universal Reference*
*Supersedes MASTER_CONTEXT.md and all handoff docs as session startup context.*
*C44 synthesized — 2026-04-23*
