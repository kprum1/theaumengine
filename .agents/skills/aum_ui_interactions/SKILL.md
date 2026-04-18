# AUM Engine — UI Interactions & Data Flow Skill

## name: aum_ui_interactions
## description: Complete wiring map for every clickable UI element in The AUM Engine cockpit. Documents what fires on click, which function handles it, and how the data flows from Firestore → PROSPECTS array → rendered component. Use this before editing any click handler, modal, or drawer.

---

## Architecture Overview

```
Firestore (master_leads, lead_assignments)
    ↓  loadAssignedLeadsFromFirestore(uid)   [db.js]
    ↓  bootstrapUserData(uid)                [db.js]
PROSPECTS[]  (in-memory, global, sorted by priorityScore)
    ↓  computeNicheMetrics()                 [data.js]
    ↓  computeAlerts()  → refreshAlerts()    [data.js]
    ↓  computeMetrics()                      [data.js]
NM[], ALERTS[], M{}  (computed views)
    ↓  pageCommandCenter() / pageProspectMine() etc.
UI Rendered HTML
    ↓  User clicks
openContactCard() | openNicheDrawer() | openDrawer() | navigate()
```

---

## PROSPECTS Array

### Source
- **Primary**: `loadAssignedLeadsFromFirestore(uid)` in `db.js`
  - Queries `lead_assignments` where `ownerUid == uid` AND `ownershipStatus in [active, pending]`
  - Joins each assignment → `master_leads` to get full prospect data
  - Maps to PROSPECTS schema with `id: 'fs_' + assignmentDocId`
- **Secondary (Alfred)**: `loadProspectsFromFirestore()` reads `prospects` collection
- **Demo gate**: `_flushDemoLeads()` removes all `id.startsWith('p')` entries once real data loads

### ID Format
| Origin | ID Format | Example |
|---|---|---|
| Firestore lead_assignment | `fs_<assignmentDocId>` | `fs_abc123xyz` |
| Demo/hardcoded | `p1`–`p25` | `p7` |
| Alfred (prospects col) | `alf_<docId>` | `alf_xyz` |

### Required Fields (Firestore leads)
Firestore leads may be **missing** these demo-only fields. Always use fallbacks:
```js
const reasonCodes = Array.isArray(p.reasonCodes) ? p.reasonCodes : [];
const signals     = (p.signals && typeof p.signals === 'object' && !Array.isArray(p.signals)) ? p.signals : {};
const emailDraft  = p.emailDraft || `Hi ${p.firstName},\n\nI came across your profile…`;
const activityLog = Array.isArray(p.activityLog) ? p.activityLog : [];
const fitScore    = p.fitScore    || 72;
const timingScore = p.timingScore || 65;
const priorityScore = p.priorityScore || 70;
```

---

## Niche IDs — Canonical Map

> **CRITICAL**: `nicheId` in Firestore `master_leads` MUST match `id` in the `NICHES` array in `data.js`. Any mismatch causes count = 0 in the UI.

| Niche Name | Canonical ID | Firestore Count |
|---|---|---|
| C-Suite Executives | `c-suite-executives` | 284 |
| Physicians & Surgeons | `physicians` | 238 |
| Real Estate Developers | `re-developers` | 96 |
| Dentists & Specialists | `dentists` | 80 |
| Aircraft Owners | `aircraft-owners` | 61 |
| Business Owners | `business-owners` | 58 |
| Law Partners | `law-partners` | 34 |
| AI-Displaced Executives | `ai-displaced-executives` | 33 |
| Yacht Owners | `yacht-owners` | 30 |
| Charity Boards | `charity-board-members` | 23 |
| HENRYs | `henrys` | 20 |
| Pro Athletes | `pro-athletes` | 20 |
| Inheritance Recipients | `inheritance` | 19 |
| High Earning Tradesman | `high-earning-tradesman` | 18 |

> Note: `real-estate-investors` (1 doc) is a stale typo — should be `re-developers`.

---

## Click Wiring Map

### Command Center — Top 8 To Work Now

| Element | File | Handler | Destination |
|---|---|---|---|
| Prospect row click | `pages.js:234` | `openContactCard(p.id)` | Contact Card modal |
| "Draft" button | `pages.js:243` | `setOutreachProspect(p.id); navigate('outreach-studio')` | Outreach Studio |

### Command Center — Alerts Box

| Element | File | Handler | Destination |
|---|---|---|---|
| Alert with `prospectId` | `pages.js:252` | `openContactCard(prospectId)` | Contact Card modal |
| Batch alert (no prospectId) | `pages.js:252` | `navigate('prospect-mine')` | Prospect Mine |

> **Alerts are live**: `ALERTS` is computed by `computeAlerts()` from PROSPECTS on every load. `refreshAlerts()` is called after both `bootstrapUserData` and `loadProspectsFromFirestore` complete.

### Command Center — Niche Performance Cards

| Element | File | Handler | Destination |
|---|---|---|---|
| Niche card click | `pages.js:267` | `openNicheDrawer(n.id)` | Niche Prospect Drawer |

> Cards show `NM.slice(0,3)` — top 3 niches ranked by total prospects count. Data comes from `computeNicheMetrics()` which filters PROSPECTS by `nicheId`.

### Prospect Mine — Niche Cards

| Element | File | Handler | Destination |
|---|---|---|---|
| Niche card click | `pages.js:311` | `selectNiche(n.id)` | Expands/selects niche |

### Lead Scoreboard

| Element | File | Handler | Destination |
|---|---|---|---|
| Prospect row click | `pages.js` | `openDrawer(p.id)` | Full Profile Drawer |

---

## Modal & Drawer Functions

### `openContactCard(prospectId)` — `app.js:473`

Quick action modal. Shows: avatar, name, title, company, location, AUM, niche badge, priority score, fit + timing bars, signal tags.

**4 action buttons:**
| Button | Action |
|---|---|
| ✉️ Draft Email | `closeContactCard(); setOutreachProspect(id); navigate('outreach-studio')` |
| 📞 Log Call | `closeContactCard(); _ccLogCall(id)` → sets status=Contacted |
| 📅 Book Meeting | `closeContactCard(); setProspectStatus(id,'Meeting Requested')` |
| 🔍 Full Profile | `closeContactCard(); setTimeout(()=>openDrawer(id), 80)` |

**Status strip**: Contacted → Engaged → Nurture → Booked → Dead

**Close**: `closeContactCard()` — also triggered by backdrop click or `Escape` key.

> **IMPORTANT**: Full Profile uses `setTimeout(80ms)` so the modal DOM fully removes before the drawer renders. Without the delay, the drawer DOM injection fails silently.

### `openNicheDrawer(nicheId)` — `app.js:269`

Slide-in right panel (520px). Shows all PROSPECTS filtered by `nicheId`, sorted by `priorityScore` desc.

Each row shows: avatar, name, title·company, 📍 location, 💰 AUM, source badge, fit/timing score bars, status, ✉️ Draft button.

**Row click**: `closeNicheDrawer(); openDrawer(p.id)`
**Draft button**: `closeNicheDrawer(); setOutreachProspect(p.id); navigate('outreach-studio')`
**View All →**: `closeNicheDrawer(); setFilter('niche', nicheId); navigate('lead-scoreboard')`
**Footer CTA**: `closeNicheDrawer(); startMining()`

**Close**: `closeNicheDrawer()` — backdrop click or `Escape`.

### `openDrawer(id)` — `app.js:1651`

Full profile side drawer. Sections: Scores, Why This Lead Fits, Enterprise Intelligence, Signals & Context, Suggested Outreach, Activity History, Pilot Feedback.

**Bottom buttons:**
- Draft Outreach → `setOutreachProspect(id); navigate('outreach-studio'); closeDrawer()`
- Update Status → `showStatusModal(id)`
- Meeting Prep → `setActiveMeeting(id); closeDrawer()`

**Defensive fallbacks**: All optional fields (reasonCodes, signals, emailDraft, activityLog) default gracefully so Firestore leads never crash the drawer.

---

## Alerts Engine

### `computeAlerts()` — `data.js`

Derives up to ~9 alerts from live PROSPECTS sorted by priorityScore:

| Type | Trigger | Count |
|---|---|---|
| 🔥 `hot` | `priorityScore >= 95` AND `status = New` | max 2 |
| 💬 `reply` | `status in [Engaged, Meeting Requested, Booked]` | max 2 |
| 📅 `booking` | `status in [Meeting Requested, Booked]` | max 2 |
| ⏰ `stale` | `status in [New, Contacted]` AND last activity > 15 days | max 2 |
| 💎 `new` | > 10 leads with `status = New` | 1 |

### `refreshAlerts()` — `data.js`

Called at:
1. `auth.js:139` — after `bootstrapUserData` loads assigned leads
2. `auth.js:203` — after `loadProspectsFromFirestore` merges Alfred prospects

---

## Status Flow

```
New → Contacted → Engaged → Meeting Requested → Booked
                                             ↘ Dead
                                     Nurture ↗
                                     Snoozed (auto-returns after N days)
```

Status persists to:
1. In-memory `PROSPECTS` array (immediate)
2. `localStorage['aum_prospect_statuses']` (session persistence)
3. Firestore `lead_assignments.advisorStatus` (non-blocking write-back)

---

## Common Bugs & Fixes

| Bug | Root Cause | Fix |
|---|---|---|
| Niche card click navigates to scoreboard | `onclick` hardcoded to `navigate('lead-scoreboard')` | Change to `openNicheDrawer(n.id)` |
| Full Profile button does nothing | `closeContactCard()` and `openDrawer()` race — drawer renders before modal DOM clears | `setTimeout(()=>openDrawer(id), 80)` |
| openDrawer crashes on Firestore leads | `.map()` on undefined `p.reasonCodes` / `p.signals` / `p.activityLog` | Defensive `Array.isArray()` fallbacks before render |
| Niche counts show 0 | `nicheId` mismatch between NICHES array and Firestore | Verify canonical IDs match exactly (see table above) |
| Alerts show stale demo data | ALERTS was a hardcoded const array | Replaced with `computeAlerts()` + `refreshAlerts()` hooks |
| PROSPECTS shows demo p1–p25 leads | `_flushDemoLeads` not firing | Check that `bootstrapUserData` returns `assignedLeads.length > 0` |

---

## Adding a New Clickable Interaction

1. **In `pages.js`**: Set `onclick="openContactCard('${p.id}')"` for prospect rows
2. **In `app.js`**: All modal/drawer functions live here
3. **Always test with a real `fs_` prefixed ID** — demo `p1` IDs are flushed on login
4. **Syntax check before deploy**: `/opt/homebrew/bin/node -e "const fs=require('fs');try{new Function(fs.readFileSync('js/app.js','utf8'));console.log('✅ OK')}catch(e){console.error(e.message)}"`
5. **Deploy**: `/usr/local/bin/firebase deploy --only hosting --project theaumengine`

---

## Verification Checklist

Run after any UI interaction change:

- [ ] Click Top 8 row → Contact Card modal opens with real prospect name
- [ ] Click "Full Profile" in modal → drawer opens (after ~80ms delay)
- [ ] Click "Draft Email" in modal → Outreach Studio opens with that prospect
- [ ] Click Alert item (with prospectId) → Contact Card modal opens
- [ ] Click Batch alert (no prospectId) → Prospect Mine opens
- [ ] Click Niche Performance card → Niche drawer opens with correct filtered list
- [ ] Niche drawer "View All →" → Lead Scoreboard filtered to that niche
- [ ] Niche drawer "Draft" button → Outreach Studio with that prospect
- [ ] Status move buttons → status updates in-memory + localStorage + Firestore
- [ ] Escape key closes any open modal/drawer
- [ ] Backdrop click closes any open modal/drawer
