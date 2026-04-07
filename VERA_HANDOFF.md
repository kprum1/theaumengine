# 💎 Diamond Mining — Advisor Growth Engine
## Deep Technical Handoff for Vera
**Version:** Phase 1 MVP · April 2026
**Product:** `AdvDiamondMining`
**Workspace:** `/Users/kosalprum/Documents/AdvDiamondMining/`
**App entry:** `index.html` → open directly in browser (no build step required)

---

## 1. What This Product Is

Diamond Mining is a **niche advisor growth cockpit** — a command-console style web app that helps financial advisor teams find, score, contact, and book meetings with right-fit prospects in defined niche markets. It is the front-door revenue engine tying together the full prospect-to-meeting workflow in one system.

The product is intentionally positioned around **one plain-English promise**:
> "Every week your team gets a ranked list of best-fit prospects, why they fit, what to say, and a workflow to move them to booked meetings."

The design DNA inherits from the **CAZ Command Console** and **AllPro Command Console** — same left-nav shell, KPI strip, ranked table patterns — but evolved into a lead-generation cockpit rather than territory intelligence. The core object here is **prospect / household**, not firm.

---

## 2. File Structure

```
AdvDiamondMining/
├── index.html          # App shell, sidebar nav, drawer overlay, script loads
├── css/
│   └── main.css        # Full design system — tokens, layout, components, animations
└── js/
    ├── data.js         # All mock data + shared utility functions (loaded first)
    └── app.js          # Router, all 8 page renderers, drawer, events, toast system
```

> **No build tools. No framework. No npm.** Pure HTML + Vanilla CSS + Vanilla JS.
> This is intentional for fast iteration and simple Firebase Hosting deployment.

---

## 3. Architecture Overview

### Rendering Model
The app uses a **client-side string-template SPA** pattern. There is no virtual DOM or reactive framework. Every page is a JavaScript function that returns an HTML string, which gets injected into `#main-content` via `innerHTML`. Navigation triggers a fresh render of the target page function.

```
navigate(page)
  → sets currentPage
  → calls renderPage()
  → calls page function (e.g., pageCommandCenter())
  → page function returns HTML string using template literals
  → string injected into #main-content
  → bindPageEvents() called after injection
```

### State
All app state lives in global JS variables at the top of `app.js`:

| Variable | Type | Purpose |
|---|---|---|
| `currentPage` | `string` | Active page key (matches nav `data-page` attributes) |
| `drawerProspect` | `object \| null` | Currently open prospect in the detail drawer |
| `activeNiche` | `string \| null` | Selected niche ID on the Prospect Mine page |
| `activeFilters` | `{ status, niche }` | Filter state for Lead Scoreboard |
| `activeOutreachType` | `string` | `'email'`, `'call'`, `'linkedin'`, or `'voicemail'` |
| `activeMeetingProspect` | `object \| null` | Prospect selected in Meeting Prep |
| `miningActive` | `boolean` | Whether the mine animation is running |

> **Important for Vera:** When wiring Firebase, these globals become the source of truth that you'll eventually replace with Firestore listeners. Do not add a second state layer until you're ready to fully replace these. Keep it clean.

### Script Load Order (critical)
In `index.html`, scripts load in this exact order:
```html
<script src="js/data.js"></script>   <!-- MUST be first — defines PROSPECTS, NICHES, utilities -->
<script src="js/app.js"></script>    <!-- Depends on data.js globals -->
```
`app.js` calls `navigate('command-center')` at the bottom as its init, which triggers the first render.

---

## 4. Data Layer (`data.js`)

### Core Data Objects (Mock → Will become Firestore)

#### `NICHES` Array
Six pre-defined advisor niches. Each niche is:
```js
{
  id: 'n1',           // Used for filtering (nicheId on prospects)
  icon: '✈️',         // Emoji displayed in UI
  name: 'Aircraft Owners',
  desc: 'Private pilots & aircraft owners in affluent zip codes',
  count: 47,          // Prospect count in this niche
  color: '#60a5fa'    // Accent color used for score bars, tags
}
```
**Current niches:** Aircraft Owners, Business Owners, Charity Board Members, Inheritance Recipients, Physicians & Surgeons, Young Millennial RIAs.

#### `PROSPECTS` Array
Eight sample prospects. Each prospect object is the **most complex data shape** in the app:
```js
{
  id: 'p1',
  firstName: 'David',
  lastName: 'Harrington',
  title: 'CEO & Private Pilot',
  company: 'Harrington Logistics',
  city: 'Scottsdale',
  state: 'AZ',
  niche: 'Aircraft Owners',      // Display label
  nicheId: 'n1',                  // FK to NICHES
  fitScore: 94,                   // 0–100 — how well they match ICP
  timingScore: 88,                // 0–100 — urgency / life event timing
  priorityScore: 92,              // 0–100 — composite ranking score
  status: 'hot',                  // See status system below
  assignedRep: 'Big Nate',
  source: 'Prospect Mine',        // How this lead entered the system
  reasonCodes: [                  // Array of fit signal strings
    'Beechcraft King Air owner',
    'Net worth est. $4.2M',
    'Recent ERP sale proceeds',
    'No current advisor relationship'
  ],
  signals: {                      // Key/value context shown in drawer
    estimatedAssets: '$4.2M',
    ageRange: '58–62',
    relationship: 'Secondary connection via Ron Keller',
    nextEvent: 'AOPA Fly-In (May 12)'
  },
  enrolled: '2026-03-18',
  lastActivity: '2 days ago',
  emailDraft: `...`,              // Full personalized email draft (multi-line template literal)
  activityLog: [                  // Chronological history
    { type: 'Prospect Mined', date: '2026-03-18', note: '...' },
    ...
  ]
}
```

#### Status System
The `status` field drives pill colors, pipeline column assignment, and filter behavior. Current valid values:

| Status | Pill Class | Pipeline Column |
|---|---|---|
| `'hot'` | `pill-hot` (rose) | Contacted |
| `'warm'` | `pill-warm` (amber) | — |
| `'cold'` | `pill-cold` (blue) | Nurture |
| `'New'` | `pill-new` (violet) | New |
| `'Contacted'` | `pill-contacted` (orange) | Contacted |
| `'Engaged'` | `pill-engaged` (emerald) | Engaged |
| `'Nurture'` | `pill-nurture` (cyan) | Nurture |
| `'Meeting Requested'` | `pill-warm` (amber) | Meeting Requested |
| `'Booked'` | `pill-booked` (emerald) | Booked |
| `'Dead'` | `pill-dead` (muted) | Dead |

> **Note:** `'hot'`/`'warm'`/`'cold'` are legacy temperature labels used alongside the stage labels. The pipeline board in `pageNurtureBooking()` maps them with fallback logic. When wiring Firebase, standardize on stage labels only.

#### `TEAM_REPS` Array
```js
{ id: 'r1', initials: 'BN', name: 'Big Nate', role: 'Lead Advisor Rep',
  booked: 5, contacted: 24, converted: 2, color: 'av-blue' }
```
The `color` field maps to CSS classes like `av-blue`, `av-violet`, `av-emerald`, `av-cyan`, `av-rose`, `av-amber`, `av-indigo` defined in `main.css`.

#### `ALERTS` Array
```js
{ id: 'a1', type: 'hot', title: '...', sub: '...', time: '2h ago', prospectId: 'p1' }
```
Alert types: `'hot'`, `'booking'`, `'stale'`, `'new'`, `'reply'`. When `prospectId` is set, clicking the alert opens that prospect's drawer. When null, it navigates to Prospect Mine.

#### `PIPELINE_COLUMNS` Constant
```js
['New', 'Contacted', 'Engaged', 'Nurture', 'Meeting Requested', 'Booked', 'Dead']
```
This drives the Kanban board column order in `pageNurtureBooking()`.

### Shared Utility Functions (defined in `data.js`, used by `app.js`)

```js
getStatusPill(status)
// Returns: <span class="status-pill pill-hot">hot</span>

getScoreBar(score, color)
// Returns: score bar HTML with track + fill + numeric label
// score is 0-100, color is hex string

getAvatarClass(name)
// Deterministic color class from name string
// Returns one of: av-blue, av-violet, av-cyan, av-emerald, av-rose, av-amber, av-indigo

getInitials(firstName, lastName)
// Returns: 'DH' for David Harrington
```

---

## 5. CSS Design System (`main.css`)

### CSS Custom Properties (Design Tokens)
All colors, spacing, and transitions are defined as CSS variables on `:root`. Key tokens:

```css
/* Backgrounds */
--bg-base: #080c14         /* darkest — body bg */
--bg-surface: #0d1320      /* sidebar */
--bg-card: #111827         /* card default */
--bg-card-hover: #151e2d
--bg-elevated: #1a2235     /* table header, toolbar */
--bg-input: #0f1824

/* Borders */
--border-subtle: rgba(96, 165, 250, 0.08)
--border-default: rgba(96, 165, 250, 0.14)
--border-accent: rgba(96, 165, 250, 0.3)

/* Text */
--text-primary: #f0f4ff
--text-secondary: #8b9cbf
--text-muted: #4a5a7a
--text-accent: #60a5fa

/* Accent Colors */
--blue: #60a5fa
--violet: #a78bfa
--cyan: #22d3ee
--emerald: #34d399
--amber: #fbbf24
--rose: #fb7185
--orange: #fb923c

/* Gem Gradient (primary brand) */
--gem-gradient: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)
```

**Critical rule:** Never hardcode color hex values in component HTML. Use CSS variables. If you need a new color, add it to `:root` first.

### Layout System
The app uses a fixed sidebar + scrolling main area:
```
body (display: flex, height: 100vh, overflow: hidden)
├── .sidebar (width: 240px, fixed, flex-column)
└── .main-content (flex: 1, overflow-y: auto)
```

Page content is always rendered inside `.main-content`. The drawer slides in from the right as a fixed overlay using `position: fixed; right: -480px` → `right: 0`.

### Grid Utilities
Four CSS grid helper classes are used throughout pages:

| Class | Columns |
|---|---|
| `.grid-2` | `1fr 1fr` |
| `.grid-3` | `1fr 1fr 1fr` |
| `.grid-12` | `1fr 2fr` (narrow left, wide right) |
| `.grid-21` | `2fr 1fr` (wide left, narrow right) |

All grids collapse to `1fr` at `max-width: 900px`.

### Component Reference

| Component Class | What It Is |
|---|---|
| `.kpi-card` | Dashboard KPI metric card with `--kpi-color` CSS var for top border |
| `.gem-metric` | Larger metric card (Manager Console), has background 💎 watermark |
| `.queue-item` | Row in "Top to work" lists — rank + avatar + info + score + action |
| `.alert-item` | Alert row with colored dot, title, subtitle, timestamp |
| `.niche-card` | Selectable niche card with icon, name, desc, count badge |
| `.pipeline-col` | Kanban column for Nurture & Booking board |
| `.pipeline-item` | Card inside a kanban column |
| `.outreach-type-btn` | Message type selector button (Email, Call, LinkedIn, Voicemail) |
| `.message-editor` | Email draft editor with toolbar + `.message-body` |
| `.dossier-card` | Meeting prep card with header + body sections |
| `.reason-tag` | Blue pill-style tag for lead fit signals |
| `.status-pill` | Colored status badge (see status system above) |
| `.score-bar` | Track + fill + number for fit/timing/priority scores |
| `.perf-bar-item` | Horizontal performance bar for Manager Console |
| `.agent-thinking` | Animated "agent running" indicator (pulsing blue bar) |
| `.tab-bar` + `.tab-btn` | Segmented control tabs |
| `.filter-chip` | Toggleable filter tag in filters bar |
| `.form-input/select/textarea` | Dark-styled form controls |
| `.btn-primary/secondary/ghost/danger` | Button variants |
| `.toast` | Notification popup (bottom-right, auto-dismiss) |

### Animations
Key animation names (do not override without understanding deps):
- `gemPulse` — sidebar logo glow cycle
- `badgePulse` — nav badge ring pulse  
- `agentBlink` — agent thinking bar fade
- `dotBounce` — three-dot agent indicator
- `mining-gems span` — prospect mining spinner
- `fadeIn` — page transition (applied to `.fade-in` wrapper on every navigate)
- `toastIn` — toast slide-in from right

---

## 6. App Engine (`app.js`) — Page by Page

### Router Pattern
```js
navigate(page)        // Call this anywhere to change page
  // page keys: 'command-center', 'prospect-mine', 'lead-scoreboard',
  //            'outreach-studio', 'nurture-booking', 'meeting-prep',
  //            'manager-console', 'settings'
```
Navigation is also bound to sidebar `<a>` tags in `index.html` via:
```js
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});
```
The `data-page` attribute on each `<a>` must match a case in the `renderPage()` switch.

---

### Page 1: Command Center (`pageCommandCenter`)
**Purpose:** Daily growth cockpit — what to do right now.

**Renders:**
- `page-header` with "Mine Prospects" → `navigate('prospect-mine')` and "Create Outreach" → `navigate('outreach-studio')`
- `kpi-strip` — 5 hardcoded KPI cards (New Qualified Leads, Hot Leads Today, Meetings Booked, Reply Rate, Top Niche Conv.)
- `grid-21` split:
  - Left: Top 6 prospects sorted by `priorityScore` descending from `PROSPECTS` — each row clicking `openDrawer(p.id)`; "Draft" button → `navigate('outreach-studio')`
  - Right: Alerts loop from `ALERTS` — clicking opens drawer or navigates to Prospect Mine
- `grid-3`: First 3 niches from `NICHES` with contact rate bar

**Known TODO:** KPIs are hardcoded strings. Wire to computed values from `PROSPECTS` when Firebase is connected.

---

### Page 2: Prospect Mine (`pageProspectMine`)
**Purpose:** Configure and run the AI prospect miner.

**Renders:**
- `grid-12` split:
  - Left: 6 niche cards (`NICHES.map(...)`) — clicking calls `selectNiche(id)` which sets `activeNiche` and toggles `.active` class
  - Right: Mine parameters form (Geography, Asset Min, Age Range, Life Event chips, Exclude Clients), "Run Prospect Mine Agent" button → `startMining()`, Recent Cohorts list
- `#mining-status` div is the injection point for agent status feedback

**`startMining()` flow:**
1. Injects `.agent-thinking` with animated 💎💎💎 dots into `#mining-status`
2. After 3200ms timeout, replaces with success message (green styled)
3. Shows toast — "23 new prospects mined!"

**Known TODO:** Replace `startMining()` timeout mock with actual Firebase Cloud Function call or AI agent API call.

---

### Page 3: Lead Scoreboard (`pageLeadScoreboard`)
**Purpose:** Full ranked prospect table with filter/search.

**Renders:**
- Filter bar: Search input with `oninput="filterProspects(this.value)"` for live table filtering; Status filter chips calling `setFilter('status', val); navigate('lead-scoreboard')`
- Full `<table>` with all `PROSPECTS` filtered by `activeFilters` and sorted by `priorityScore` desc
- Each row: rank #, avatar, name/title, niche tag, 3 score bars (blue/violet/green), status pill, rep, last activity, View button
- Row `onclick="openDrawer(p.id)"` — opens prospect drawer
- View button: `event.stopPropagation(); openDrawer(p.id)` — prevents double-fire

**`filterProspects(q)` function:**
Client-side text filter — hides `<tr>` elements where `textContent` doesn't include the search string. Works on all visible text in any column.

**`setFilter(key, val)`:** Mutates `activeFilters[key]`, then `navigate('lead-scoreboard')` triggers a fresh render with the filter applied.

---

### Page 4: Outreach Studio (`pageOutreachStudio`)
**Purpose:** Generate and edit personalized multi-channel outreach.

**Current limitation:** This page always loads `PROSPECTS[0]` (David Harrington) as the selected prospect. The prospect selector list shows 5 prospects but clicking them currently only shows a toast ("Prospect loaded"). Full prospect-switching needs Phase 2 wiring.

**Renders:**
- Left column: Prospect selector (top 5 from PROSPECTS) + 4 message type buttons (Email, Call, LinkedIn, Voicemail)
- Right column: Prospect context card (name, niche signals), message editor with toolbar, Send/Schedule/Save Template buttons, follow-up cadence

**Message type switching — `selectOutreachType(type, draft)`:**
- Sets `activeOutreachType`
- Updates `#draft-body` contenteditable div with the new draft text
- Toggles `.active` on the clicked type button using a `typeMap` index lookup

**Message editor — `#draft-body`:**
- `contenteditable="true"` — fully editable by user
- "Regenerate" button calls `regenerateDraft()` — fades opacity to 0.4, restores after 1200ms + shows toast (mock; wire to AI API in Phase 2)
- "Compliance Check" and "Copy" buttons are UI-only (no behavior yet)

**Outreach drafts per prospect:**
Each prospect in `PROSPECTS` has an `emailDraft` field. The other message types (call, linkedin, voicemail) are currently hardcoded to David Harrington's content in `pageOutreachStudio()`. When wiring multi-prospect switching, move draft content into the prospect object or generate via API.

---

### Page 5: Nurture & Booking (`pageNurtureBooking`)
**Purpose:** Kanban pipeline board + upcoming meetings table.

**Pipeline column mapping logic:**
```js
PROSPECTS.forEach(p => {
  const st = p.status;
  if (colMap[st]) colMap[st].push(p);        // exact match on status string
  else if (st === 'hot') colMap['Contacted'].push(p);
  else if (st === 'cold') colMap['Nurture'].push(p);
  else colMap['New'].push(p);                // fallback
});
```

**Renders:**
- Scrollable kanban board (`.scroll-x` wrapper, `.pipeline-board` grid with 7 columns)
- Each column: header with count, pipeline items — each item clickable → `openDrawer(p.id)`
- Upcoming meetings table below: 2 hardcoded rows (Thomas Castellano + Sandra Westhoff) with "View Prep" → `navigate('meeting-prep')` and "Resend Link" → toast

**Known TODO:** Drag-and-drop between columns, automated nurture batch actions, booking link generation. These are all Phase 2 items.

---

### Page 6: Meeting Prep (`pageMeetingPrep`)
**Purpose:** AI-generated pre-meeting dossier for booked/requested meetings.

**`activeMeetingProspect` selection:**
- Page first tries `activeMeetingProspect` global
- Falls back to first prospect where `status === 'Booked'`
- Falls back to `PROSPECTS[0]`

**Meeting selector in left column:**
Filters `PROSPECTS` for status `'Booked'` or `'Meeting Requested'` — clicking a row calls `setActiveMeeting(id)` which sets `activeMeetingProspect` and re-navigates to `'meeting-prep'`.

**Dossier sections:**
1. Header: Avatar, name, title, next event date, priority score
2. Why This Meeting Matters: Prose generated from `p.niche`, `p.signals.estimatedAssets`, `p.reasonCodes[0]`, `p.reasonCodes[1]`, `p.signals.relationship`
3. Key Signals: All `p.reasonCodes` as `.reason-tag` pills
4. Likely Planning Gaps: Hardcoded 4-item list (will need AI generation in Phase 2)
5. Discovery Questions: 4 hardcoded questions with `[key signal from reason codes]` placeholder in #4
6. Pre-Meeting Notes: Live `<textarea>` — "Save Notes" button shows toast (no persistence yet)

**Known TODO:** Wire "Save Notes" to Firestore. Generate planning gaps and discovery questions from AI based on actual prospect signals. Export PDF (html2pdf.js pattern per existing KI).

---

### Page 7: Manager Console (`pageManagerConsole`)
**Purpose:** Team performance, niche conversion, pipeline velocity, source quality.

**Renders:**
- Period tabs (This Month / Last 90 Days / YTD) — `switchTab(btn, groupId)` toggles `.active` class, no data change yet
- `kpi-strip` of 5 `.gem-metric` cards (all hardcoded values)
- `grid-2` split:
  - Left: Rep Leaderboard from `TEAM_REPS` + Niche Conversion bars (random percentages — see known issue)
  - Right: Pipeline Velocity bars (from `PIPELINE_COLUMNS` with estimated counts) + Source Quality table

**Known Issue — random data:** Niche conversion percentages use `Math.floor(Math.random()*35)` — this means values change on every navigation. Wire to real computed values when connecting data layer.

---

### Page 8: Settings & ICP (`pageSettings`)
**Purpose:** ICP configuration + agent status + team management.

**Renders:**
- `grid-2` split:
  - Left: ICP form (Primary Niche, Min Assets, Age Range, Geography, Professions, Life Event Triggers, Messaging Angle) — all form inputs are static (no save behavior beyond toast)
  - Right: Agent Configuration list (8 agents with Active/Beta status) + Team Members from `TEAM_REPS` + "Add Team Member" button
- "Save ICP" button → toast only

**Known TODO:** Persist ICP settings to Firestore. Wire agent configuration toggles. Build team invite flow.

---

### Prospect Drawer (`openDrawer` / `closeDrawer`)

**Trigger:** Any prospect row or "View" button calls `openDrawer(prospectId)`.

**Mechanism:**
1. Looks up `PROSPECTS.find(x => x.id === id)`
2. Injects HTML into `#drawer-content`
3. Adds `.open` class to both `#prospect-drawer` and `#drawer-overlay`

**Drawer closes via:**
- ✕ button (`onclick="closeDrawer()"`)
- Click on `#drawer-overlay` (bound in `bindPageEvents()`)

**Drawer sections:**
1. Header: Avatar, name, title, company, status pill, close button
2. Scores: 3-column grid — Fit (blue), Timing (violet), Priority (green) as large numerics
3. Why This Lead Fits: All `reasonCodes` as `.reason-tag` pills
4. Signals & Context: `Object.entries(p.signals)` as `.signal-row` rows (key → camelCase → space split display)
5. Suggested Outreach: First 4 lines of `emailDraft` as clickable `.msg-draft` → `navigate('outreach-studio')`
6. Activity History: `activityLog` as timeline dots
7. Action buttons: "Draft Outreach" → outreach-studio + close; "Update Status" → toast + close; "Meeting Prep" → meeting-prep + close

---

### Toast System (`showToast`)
```js
showToast('Message text', '✅')   // icon is any emoji or string
```
Creates a `.toast` element, appends to `#toast-container`, auto-removes after 3000ms with a slide-out animation. Safe to call from anywhere.

---

### `bindPageEvents()`
Called after every `renderPage()`. Currently only binds the drawer overlay click handler. Add any post-render event bindings here (e.g., drag handlers, dynamic button groups that can't use inline `onclick`).

---

## 7. What Is Wired vs. What Is Mocked

| Feature | Current State | Phase 2 Action |
|---|---|---|
| Prospect data | Mock array in `data.js` | Firestore `prospects` collection |
| Niche data | Mock array in `data.js` | Firestore `niches` collection per team |
| KPI numbers | Hardcoded strings | Computed from Firestore queries |
| Prospect filter/search | Client-side only | Server-side query or Firestore filter |
| Niche conversion % | `Math.random()` | Real computed conversion rates |
| Prospect Mine Agent | setTimeout mock | Firebase Cloud Function → AI API |
| Outreach drafts | Hardcoded in prospect objects | Gemini/Claude API call per prospect |
| Compliance Check | UI button only | AI check API + flagging |
| Send Now / Schedule | Toast only | Email integration (SendGrid? Gmail API?) |
| Meeting notes save | Toast only | Firestore `activityLog` update |
| Pipeline drag-drop | Not built | Drag events + Firestore status update |
| Nurture sequences | UI only | Firebase Scheduled Functions |
| Booking links | Toast only | Calendly embed or native booking |
| Source attribution | Hardcoded table | Firestore source tracking on prospects |
| Rep assignment | Static data | Team member assignment modal |
| CRM import | Import button only | CSV parse → Firestore batch write |
| Authentication | None | Firebase Auth (rep + manager roles) |

---

## 8. Phase 2 Build Priorities (in order)

### Sprint 1 — Data Layer
1. Set up Firebase project (Firestore + Hosting + Functions)
2. Create Firestore collections: `teams`, `niches`, `prospects`, `activities`, `meetings`
3. Replace `data.js` mock arrays with Firestore `getDocs()` calls on page load
4. Add loading states (use `.agent-thinking` pattern for data loading UX)
5. Wire "Save ICP" settings to Firestore team document

### Sprint 2 — Prospect-Switching in Outreach Studio
1. Track `activeOutreachProspect` in state (global or module)
2. When a prospect row is clicked in the selector, set `activeOutreachProspect`
3. Re-render the right-side panel with that prospect's draft and context
4. Move per-prospect message drafts from hardcoded to Firestore (or generate on-the-fly)

### Sprint 3 — Real Agent Integration
1. Wire "Run Prospect Mine Agent" to a Firebase Cloud Function
2. Cloud Function calls AI API with ICP parameters, returns structured prospect list
3. Write results to Firestore `prospects` collection
4. Refresh Lead Scoreboard after mining completes
5. Wire "Regenerate" button in Outreach Studio to AI draft API

### Sprint 4 — Status & Pipeline Updates
1. Make pipeline kanban drag-and-drop update Firestore `status` field
2. Activity log entries written on every status change
3. Alerts generated from Firestore triggers (e.g., no contact in 7 days → alert)

### Sprint 5 — Auth & Multi-Team
1. Firebase Auth login page
2. Role-based views: rep sees their prospects; manager sees all
3. `assignedRep` field drives filtering per logged-in user

---

## 9. Firestore Data Model (Recommended)

```
/teams/{teamId}
  name: string
  adminUsers: string[]    // UIDs
  defaultICP: {
    primaryNiche: string,
    minAssets: number,
    ageMin: number,
    ageMax: number,
    geography: string[],
    lifeEventTriggers: string[],
    messagingAngle: string
  }

/teams/{teamId}/reps/{repId}
  name: string
  email: string
  role: 'rep' | 'manager' | 'admin'
  initials: string
  color: string           // av-blue, av-violet, etc.

/teams/{teamId}/niches/{nicheId}
  name: string
  icon: string
  desc: string
  color: string
  scoringWeights: {}

/teams/{teamId}/prospects/{prospectId}
  firstName: string
  lastName: string
  title: string
  company: string
  city: string
  state: string
  nicheId: string
  fitScore: number
  timingScore: number
  priorityScore: number
  status: string          // Use stage labels only: New/Contacted/Engaged/Nurture/Meeting Requested/Booked/Dead
  assignedRepId: string
  source: string
  reasonCodes: string[]
  signals: {}
  enrichedAt: Timestamp
  enrolledAt: Timestamp
  lastActivityAt: Timestamp

/teams/{teamId}/prospects/{prospectId}/activities/{activityId}
  type: string
  note: string
  repId: string
  channel: string         // email/call/linkedin/voicemail
  sentAt: Timestamp
  openedAt: Timestamp | null
  repliedAt: Timestamp | null
  nextActionDate: Timestamp | null

/teams/{teamId}/meetings/{meetingId}
  prospectId: string
  repId: string
  scheduledAt: Timestamp
  bookedAt: Timestamp
  qualificationResult: string
  notes: string
  nextStep: string
  linkedCaseId: string | null   // For future Fin-tegration handoff
```

---

## 10. Firebase Hosting Deployment

This app is 3 static files — ideal for Firebase Hosting.

```bash
# One-time setup
npm install -g firebase-tools
firebase login
firebase init hosting   # public dir: . (root) — index.html at root

# Deploy
firebase deploy --only hosting
```

`firebase.json` should look like:
```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

**No `.htaccess` needed.** All routing is client-side via `navigate()`. The rewrite rule above ensures direct URL access always lands on `index.html`.

---

## 11. Design Rules for Future Additions

1. **Never add a page without adding it to the `renderPage()` switch AND adding a nav item in `index.html`** with a matching `data-page` attribute and `id="nav-{page}"`.

2. **New page functions must return an HTML string.** They cannot use `document.createElement`. The pattern is: function returns a template literal, which gets set as `innerHTML` of the main div.

3. **Inline `onclick` handlers are acceptable** for simple actions. For complex handlers that need post-render binding (e.g., drag events, custom inputs), add them inside `bindPageEvents()`.

4. **All new components must use CSS variable tokens** from `:root`. Never add hardcoded `#hex` colors to HTML or component CSS.

5. **The gem brand gradient** — `--gem-gradient: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)` — is the primary brand signal. Use it for CTAs, active states, logo, and priority indicators. Don't dilute it with too many gradient uses.

6. **Score bars** must use `getScoreBar(score, color)` from `data.js`. Do not roll custom progress indicators.

7. **Toasts for all user-triggered actions** that would otherwise give no feedback. `showToast(msg, icon)` is lightweight and already implemented — use it freely.

8. **The drawer is a singleton.** There is one `#prospect-drawer` in the DOM. Opening a new prospect replaces content in `#drawer-content`. Do not try to open multiple drawers.

9. **Outreach type buttons** must stay in the `['email','call','linkedin','voicemail']` order to match the `typeMap` index lookup in `selectOutreachType()`.

10. **Never break the script load order.** `data.js` must always load before `app.js`.

---

## 12. Known Bugs & Edge Cases

| Issue | Location | Fix |
|---|---|---|
| Niche conversion % re-randomizes on every navigate | `pageManagerConsole()` line with `Math.random()` | Replace with stored values |
| Outreach Studio always loads Harrington regardless of selected prospect | `pageOutreachStudio()` — `const prospect = PROSPECTS[0]` | Add `activeOutreachProspect` state and re-render right panel |
| Filter chips don't visually deselect after navigating away | `setFilter()` mutates global but chip re-renders fresh | Already works correctly on re-render; not a bug |
| Drawer overlay sometimes needs double-click if bindPageEvents races | `bindPageEvents()` runs after innerHTML set | Add `removeEventListener` before re-adding in bindPageEvents to be safe |
| Pipeline board doesn't update when prospect status changes | Pipeline uses `PROSPECTS` array which is static | Wire to Firestore real-time listener in Phase 2 |
| `startMining()` re-fires if called while already running | `miningActive` flag is set but never checked | Add `if (miningActive) return;` guard at function start |

---

## 13. Agent System — What Vera Needs to Know

The product markets 8 AI agents as distinct capabilities. In Phase 1, all agent UX is simulated. Here is the real agent intent so Vera can wire them correctly in Phase 2:

| Agent | What It Actually Does | Integration Point |
|---|---|---|
| **ICP Agent** | Takes form inputs from Settings & ICP, validates and scores the profile, suggests niche refinements | AI API call on "Save ICP" → returns suggested weight adjustments |
| **Prospect Miner Agent** | Takes niche + geography + filters → queries data sources → returns structured prospect list | Firebase Cloud Function → AI API + external data enrichment (e.g., People Data Labs, ZoomInfo, or manual import) |
| **Enrichment Agent** | Takes raw prospect name + company → returns enriched profile (assets, signals, timing) | Cloud Function triggered on new prospect creation |
| **Fit Score Agent** | Takes enriched prospect data + ICP weights → returns fitScore, timingScore, priorityScore + reason codes | Cloud Function (can run in same function as enrichment) |
| **Outreach Agent** | Takes prospect data + message type + niche context → returns personalized draft | Gemini/Claude API call on demand (triggered by "Regenerate" or first load) |
| **Nurture Agent** | Runs on schedule → identifies prospects with no activity in N days → triggers follow-up sequences | Firebase Scheduled Function (daily or hourly) |
| **Meeting Prep Agent** | Takes prospect ID → generates dossier (planning gaps, discovery questions, talking points) | AI API call on navigate to Meeting Prep with a booked prospect |
| **Manager Agent** | Aggregates Firestore data → generates weekly summary, coaching flags, conversion insights | Cloud Function + optional AI narrative summary |

---

## 14. Quick Reference — Key IDs and Selectors

| Element | Selector / ID | Purpose |
|---|---|---|
| Main content area | `#main-content` | All page HTML is injected here |
| Prospect drawer | `#prospect-drawer` | Slides in from right |
| Drawer content | `#drawer-content` | Drawer HTML injected here |
| Drawer overlay | `#drawer-overlay` | Dark background behind drawer |
| Toast container | `#toast-container` | Toast notifications appended here |
| Nav items | `.nav-item[data-page="..."]` | One per page, `id="nav-{page}"` |
| Mining status | `#mining-status` | Injection point for agent feedback |
| Draft body | `#draft-body` | Contenteditable email draft |
| Search input | `#search-prospects` | Live table search on scoreboard |
| Scoreboard table body | `#scoreboard-body` | All prospect rows |
| Period tab group | `#period-tab` | Manager Console time period tabs |

---

## 15. Contacts & Ownership

| Role | Person | Responsibility |
|---|---|---|
| Product Owner | Kos | Strategy, ICP, agent definitions, GTM |
| Lead Dev | Big Nate | Build execution, Firebase wiring, Phase 2 sprints |
| Developer | Vera | Documentation, code review, Phase 2 support, QA |
| AI Agent | Antigravity (Mini Nate) | Code generation, architecture, handoffs |

**Vera's primary focus on handoff:**
- Review this document against the live codebase before Big Nate begins Phase 2
- Flag any inconsistencies between this doc and the actual files
- Maintain this document as the single source of truth for the codebase architecture
- Update the "What Is Wired vs. Mocked" table as Phase 2 items are completed

---

*Last updated: April 6, 2026 — Phase 1 MVP complete, Phase 2 pending.*
*Questions → Kos or Mini Nate (Antigravity). If something in here doesn't match the code, the code wins — update this doc.*
