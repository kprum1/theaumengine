# AUM ENGINE — Phase C3 Handoff Document
**Date:** April 9, 2026  
**Author:** Antigravity AI (pair programming with Kosal Prum)  
**Repo:** `kprum1/theaumengine` (Firebase Hosting + Firestore)  
**Live URL:** https://theaumengine.web.app  
**Operator Email:** kosal@fin-tegration.com  

---

## ⚠️ CONTEXT WARNING

This conversation is **very long and actively truncating** from the front. This file exists so that any human or AI picking up the work can resume without re-reading the chat. Read this file first before doing anything.

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C3)

### 1A. Outreach Generation Engine — Path A

**Goal:** Every advisor gets 3 personalized email/LinkedIn draft variants for each lead.

**Status: ✅ Complete. 52/52 tests passing.**

| File | Purpose |
|---|---|
| `js/outreach_agent.js` | 13 niches × 4 channels × 3 variants. Angle matrix, template library, safety filter. |
| `js/outreach_controller.js` | 4-agent stack: Research → Strategy → Customization → Cadence. Shared `_outreachState`. |
| `scripts/test_outreach_agent.js` | Node.js test harness — run `node scripts/test_outreach_agent.js` to verify all templates. |

**Yacht Owners niche added this session:**
- Added `yacht-owners` → `yacht_owner` to `PERSONA_TYPES`
- Added `yacht_owner` entry to `ANGLE_MATRIX` with `yacht_lifestyle` angle
- Added `yacht_lifestyle` email templates (3 variants: Direct, Soft, Insight-Led)
- Templates are vessel-signal aware: inject `vesselName`, `vesselLength`, `vesselType`, `hailingPort` from `prospect.signals`
- Also fixed: `charity-boards` alias was missing (only `charity-board-members` existed)

**Test Results:**
```
✅ All 13 niches × 4 channels = 52/52 passed
⚠️  1 warning: C-Suite → executive_transition fires when laid-off signal present (correct behavior)
```

---

### 1B. Funnel Tracker — Background Analytics Layer

**Goal:** Zero-config, fire-and-forget event logging. Advisors never touch it.

**File:** `js/funnel_tracker.js`

**How it works:**
- Writes to Firestore `funnel_events` collection (appended only, never mutated)
- Also buffers last 100 events to `sessionStorage` for instant reads
- All calls wrapped in `typeof FunnelTracker !== 'undefined'` guards — never breaks app

**Events logged automatically:**

| Event | Trigger | Fields |
|---|---|---|
| `lead_viewed` | Advisor opens lead in Outreach Studio | `leadId, nicheId, fitScore` |
| `outreach_drafted` | 4-agent stack finishes | `leadId, channel, angle, variantId` |
| `outreach_sent` | Advisor clicks "Send Now" | `leadId, channel, variantId` |
| `reply_logged` | Advisor taps Reply Tapper | `leadId, replyType` |
| `meeting_booked` | Advisor taps "📅 Meeting Booked" | `leadId, nicheId` |

**Where hooks live (in `js/outreach_controller.js`):**
- Line ~360: `FunnelTracker.outreachDrafted()` — after agent stack completes
- Line ~583: `FunnelTracker.leadViewed()` — in `osInitForProspect()`
- Line ~630: `FunnelTracker.outreachSent()` — in `osLogOutcome({sent:true})`
- Line ~700: `FunnelTracker.replyLogged()` + `meetingBooked()` — in `_tapReplyOutcome()`

**Firestore schema (funnel_events):**
```json
{
  "event": "outreach_sent",
  "advisorUid": "abc123",
  "advisorEmail": "advisor@firmname.com",
  "leadId": "p_001",
  "channel": "email",
  "variantId": "A",
  "sessionId": "sess_1712345678_abc",
  "page": "/",
  "ts": "2026-04-09T17:15:00.000Z",
  "tsMs": 1712686500000,
  "version": "v1"
}
```

---

### 1C. Operator CLI Dashboard — Path B (Manual)

**File:** `scripts/funnel_report.js`

**Usage:**
```bash
node scripts/funnel_report.js --days=30
node scripts/funnel_report.js --days=7 --advisor=advisor@email.com
```

**Requires:** `scripts/serviceAccountKey.json` (Firebase Admin SDK)

**What it shows:**
- Global 6-stage funnel with ASCII progress bars
- Per-advisor scorecard: Assigned / Viewed / Drafted / Sent / Replied / Meetings / SLA⚠️
- Niche distribution (top 8 niches by lead count)
- 🥇🥈🥉 Top performers / 📉 Coaching list
- SLA breach count (leads assigned >7 days ago with status still 'New')

**Note:** This is the manual fallback. The in-app dashboards (see 1D) are what the team uses day-to-day.

---

### 1D. Live In-App Dashboards — Path B (Automatic)

#### Dashboard 1: Kos (Operator) — Admin Dashboard
**File:** `js/admin.js` → `renderAdminKPIs()` function

**Access:** Log in as `kosal@fin-tegration.com` → Admin Dashboard tab

**What it shows:**
- **30-Day Pilot Funnel** — 6 animated progress bars (Assigned → View → Draft → Send → Reply → Meeting)
- **SLA Alert banner** — ⚠️ if any leads untouched >7 days
- **Advisor Scorecard table** — ranked by meetings, real names from `operator_presence`, columns: Assigned / Sent / Replies / Meetings / Rate
- **Outreach Outcomes section** — legacy send analytics: channel split, variant split A/B/C
- **Auto-refreshes every 30 seconds** (inherited from existing presence refresh loop)

**Data sources:** `funnel_events` + `al_assignments` + `operator_presence` (for names)

**Firestore indexes needed:**
```
funnel_events: advisorUid ASC, ts ASC
al_assignments: assignedAt ASC
```

#### Dashboard 2: Advisor — "My Activity" widget in Command Center
**Files:** `js/pages.js` (HTML strip), `js/funnel_tracker.js` → `loadMyActivity()`, `js/app.js` (auto-trigger)

**What it shows:**
4 live stat cards, scoped to the logged-in advisor's UID:
```
✉️ Sent    💬 Replies    📅 Meetings    🎯 Contact Rate
```

**How it loads:**
1. Advisor navigates to Command Center
2. `renderPage()` in `app.js` sets `div.innerHTML = pageCommandCenter()`
3. `app.js` calls `setTimeout(() => FunnelTracker.loadMyActivity(), 300)`
4. `loadMyActivity()` queries `funnel_events` where `advisorUid == currentUser.uid` and `ts >= 30 days ago`
5. Numbers animate in with a fade+slide transition
6. If no data yet: stats remain `—` (graceful)

---

## 2. COMPLETE FILE INVENTORY

### New Files Created This Session
| File | Description |
|---|---|
| `js/funnel_tracker.js` | Auto-fire analytics layer. 5 events. Fire-and-forget. |
| `scripts/funnel_report.js` | CLI operator dashboard. `node scripts/funnel_report.js --days=30` |
| `scripts/test_outreach_agent.js` | Node.js test harness for outreach agent. 52/52 pass. |

### Files Modified This Session
| File | What Changed |
|---|---|
| `js/outreach_agent.js` | Added `yacht-owners` + `charity-boards` to PERSONA_TYPES. Added `yacht_owner` to ANGLE_MATRIX. Added `yacht_lifestyle` angle + 3-variant email templates. |
| `js/outreach_controller.js` | Wired FunnelTracker into 4 touch points: lead view, draft, send, reply. |
| `js/admin.js` | Replaced `renderAdminKPIs()` with full 6-stage funnel. Added `renderAdminOutcomes()` for legacy send analytics. Added second card slot in HTML. |
| `js/pages.js` | Added "My Activity" 4-stat strip between KPI strip and Top 8 section. |
| `js/app.js` | Added `FunnelTracker.loadMyActivity()` auto-call on Command Center navigate. |
| `index.html` | Added `<script src="js/funnel_tracker.js?v=20260409a">` after outreach_agent. |

### Existing Files Relevant to Context
| File | Role |
|---|---|
| `js/outreach_agent.js` | Template library, angle metadata, safety filter, persona types |
| `js/outreach_controller.js` | 4-agent orchestration stack |
| `js/db.js` | All Firestore reads/writes including `saveOutcomeToFirestore`, `loadOperatorOutcomes` |
| `js/admin.js` | Operator-only presence system + dashboard |
| `js/app.js` | Navigation, page routing, `renderPage()` |
| `scripts/data_synthesis/synthesize.js` | Master pipeline orchestrator |
| `scripts/data_synthesis/fetch_dol_5500.js` | DOL EFAST2 API scraper |
| `scripts/data_synthesis/fetch_sec_form4.js` | SEC EDGAR Form 4 scraper |
| `scripts/data_synthesis/enrich_leads.js` | Identity enrichment (OpenCorporates + LinkedIn URL builder) |
| `scripts/identity_resolution_agent.js` | 5-tier Firestore dedup logic |
| `memory/mn_west_metro_leads_preview.json` | West Metro pilot batch (locked to main branch) |

---

## 3. FIRESTORE COLLECTIONS REFERENCE

| Collection | Purpose | Written By |
|---|---|---|
| `funnel_events` | Auto-fire advisor action tracking | `funnel_tracker.js` |
| `outreach_outcomes` | Manual "Send Now" outcome log | `outreach_controller.js → osLogOutcome()` |
| `al_assignments` | Leads assigned to advisors | `lead_ingest_agent.js` |
| `operator_presence` | Advisor online/offline heartbeat | `admin.js → writePresence()` |
| `master_contacts` | Dedup target — all known contacts | `identity_resolution_agent.js` |
| `bouncer_dnc` | DNC list | `bouncer_agent.js` |

---

## 4. PIPELINE SEQUENCE (Full 7-Step)

```
MINE      → scripts/data_synthesis/synthesize.js
             └─ fetch_dol_5500.js     (DOL EFAST2 API → 401k business owners)
             └─ fetch_sec_form4.js    (SEC EDGAR API → RSU vesting C-suite)
             └─ fetch_uscg_vessels.js (USCG NVDC API → Yacht owners 40ft+)
             └─ Drops JSON → scripts/incoming/

REVIEW    → Alfred reviews incoming/*.json, approves leads

BOUNCE    → Bouncer Agent checks against DNC list + dedup
             └─ bouncer_agent.js runs identity_resolution_agent.js 5-tier check

APPROVE   → Alfred moves clean leads to staging/

ENRICH    → scripts/data_synthesis/enrich_leads.js
             └─ OpenCorporates API → company officers
             └─ Generates LinkedIn/USCG search URLs for manual verification
             └─ Auto-resolves or creates alfred_enrich_queue_[date].json

DEDUP     → identity_resolution_agent.js against master_contacts

ROUTE     → lead_ingest_agent.js → al_assignments collection
             └─ Advisor receives assigned lead
             └─ funnel_events: lead_viewed fires automatically on open
```

---

## 5. THE 13 NICHES

| ID | Name | Data Source | AUM Signal |
|---|---|---|---|
| `business-owners` | Business Owners | DOL Form 5500 | 401k plan >$1M = $5M+ AUM likely |
| `physicians` | Physicians & Surgeons | NPI Registry + state license | $500k-$5M+ |
| `c-suite-executives` | C-Suite Executives | SEC Form 4 (RSU vesting) | $1M-$10M+ |
| `ai-displaced-executives` | AI-Displaced Executives | LinkedIn layoff signals | $500k-$3M |
| `aircraft-owners` | Aircraft Owners | FAA Registry | $2M+ (aircraft cost proxy) |
| `yacht-owners` | Yacht Owners ⭐ NEW | USCG NVDC (documented vessels 40ft+) | $2M-$10M+ |
| `law-partners` | Law Partners | State Bar + firm filings | $1M-$5M+ |
| `dentists-specialists` | Dentists & Specialists | NPI Registry | $500k-$3M |
| `henrys` | HENRYs | Occupation income modelling | $250k-$1M income |
| `inheritance-recipients` | Inheritance Recipients | Probate court records | Variable |
| `real-estate-developers` | Real Estate Developers | County permit + SEC filings | $1M-$10M+ |
| `charity-boards` | Charity Board Members | IRS 990 filings | $1M-$5M+ |
| `high-earning-tradesman` | High Earning Tradesmen | Contractor license + permit volume | $500k-$2M |

---

## 6. OUTREACH AGENT — ANGLE/VARIANT SYSTEM

### How a Draft Gets Generated

1. Advisor selects a lead → `osInitForProspect(leadId)` fires
2. **ResearchAgent** → enriches prospect (warmth, planning pain, wealth complexity)
3. **StrategyAgent** → looks up `PERSONA_TYPES[nicheId]` → `ANGLE_MATRIX[persona][triggerType]` → picks angle + CTA + tone
4. **CustomizationAgent** → `_TEMPLATES[channel][angle](ctx, strategy, tone)` → 3 variants (A/B/C)
5. **CadenceAgent** → generates 5-touch sequence for this persona type
6. Safety filter runs on all variants — strips banned phrases
7. UI renders: meta bar + 3 variant tabs + cadence strip + Reply Tapper zone

### Tone Logic
| Condition | Tone |
|---|---|
| Warmth = warm | B (Soft) |
| Wealth complexity = high + cold | C (Insight-Led) |
| Default | A (Direct) |

### Adding a New Niche (Checklist)
- [ ] Add to `PERSONA_TYPES` in `outreach_agent.js`
- [ ] Add to `ANGLE_MATRIX` in `outreach_agent.js`
- [ ] Add email templates in `_TEMPLATES.email[angle]`
- [ ] Add LinkedIn note template in `_TEMPLATES.linkedin[angle]`
- [ ] Add to `painMap` in `_inferPlanningPain()` in `outreach_controller.js`
- [ ] Add cadence sequence in `CadenceAgent._sequences` in `outreach_controller.js`
- [ ] Add to `data.js` niche list (for UI display)
- [ ] Run `node scripts/test_outreach_agent.js` — verify 4/4 channels pass

---

## 7. RUNNING THE SYSTEM

### Development
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining

# Firebase Auth
firebase login
firebase use theaumengine

# Deploy to prod
firebase deploy --only hosting --project theaumengine

# Test outreach agent (no Firebase needed)
node scripts/test_outreach_agent.js

# Operator dashboard (requires serviceAccountKey.json)
node scripts/funnel_report.js --days=30
node scripts/funnel_report.js --days=7 --advisor=advisor@email.com
```

### Pipeline (Alfred runs these)
```bash
# Step 1: Mine leads
node scripts/data_synthesis/synthesize.js

# Step 2: Enrich queue
node scripts/data_synthesis/enrich_leads.js

# Step 3: Run through Bouncer
node scripts/bouncer_agent.js

# Step 4: Ingest approved leads
node scripts/lead_ingest_agent.js
```

---

## 8. PENDING / NEXT STEPS

### High Priority
- [ ] **Firestore Indexes** — Create composite indexes for `funnel_events`:
  - `advisorUid ASC + ts ASC` (for My Activity widget)
  - `ts ASC` (for Admin Dashboard 30-day funnel)
  - Firebase will throw errors + link you to the index creation page on first run
- [ ] **serviceAccountKey.json** — Must be at `scripts/serviceAccountKey.json` for CLI tools to work. Currently lives in Downloads (`theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json`) — copy it.

### Medium Priority
- [ ] **Path B — Option 3 (Daily Email Digest)** — Firebase Cloud Function (cron) that runs nightly, queries `funnel_events`, and emails Kos a summary. Foundation is already in `functions/index.js`.
- [ ] **Yacht Owners data scraper** — `fetch_uscg_vessels.js` needs to be built (USCG NVDC API or web scrape of documented vessels list). The niche exists in the UI and outreach templates, but the data source isn't scraped yet.
- [ ] **Routing Rules Engine** — Programmatic advisor matching based on niche + geography + AUM tier. Currently Alfred assigns manually.
- [ ] **Reply Tapper persistence** — Right now the Reply Tapper disappears on page reload. Should persist in `al_assignments` doc as `lastOutcomeLogged`.

### Low Priority / Nice to Have
- [ ] **My Activity — 30-day trend line** — Small sparkline chart below the 4 stat cards showing weekly sends over time
- [ ] **Admin Dashboard — Niche breakdown** — Which niches are converting best across all advisors
- [ ] **Advisor self-service SLA view** — "You have 3 leads you haven't contacted yet" warning in Command Center

---

## 9. OPEN ARCHITECTURE DECISIONS

### Why funnel_events vs outreach_outcomes?
`outreach_outcomes` is the Phase C1 dual-write (Firestore primary + localStorage fallback). It records the final outcome after manual "Send Now". `funnel_events` is Phase C3 — it records the entire journey (view → draft → send → reply → meeting) as it happens. Both exist and are read by different parts of the admin dashboard.

### Why fire-and-forget on FunnelTracker?
All FunnelTracker calls are wrapped in `try/catch` and never `await`-ed in the UI path. This is intentional — analytics must never block or break advisor UX. Firestore write failures are silently swallowed.

### Why deferred loadMyActivity (300ms timeout)?
The Command Center HTML is in the DOM, but Firestore auth token resolution can take a tick after navigation. The 300ms buffer ensures `firebase.auth().currentUser` is available before the query runs.

---

## 10. GIT LOG (This Session)

```
a08e398  feat(dashboards): live Pilot Funnel admin dashboard + My Activity widget
2839627  feat(tracking): wire FunnelTracker into all 4 key touch points
c80bba1  feat(path-a-b): yacht outreach templates, funnel tracker, operator dashboard — 52/52 tests
5e83864  [previous session commits...]
```

---

## 11. CREDENTIALS & CONFIG

| Item | Location | Notes |
|---|---|---|
| Firebase Service Account | `~/Downloads/theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json` | Copy to `scripts/serviceAccountKey.json` for CLI tools |
| Firebase Project | `theaumengine` | `firebase use theaumengine` |
| Operator Login | `kosal@fin-tegration.com` | Only this email sees Admin Dashboard |
| Firestore Rules | `firestore.rules` | Verify `funnel_events` is writable by authenticated users |

---

## 12. FIRESTORE RULES — REQUIRED UPDATE

The `funnel_events` collection needs to be writable by authenticated advisors. Add this rule to `firestore.rules` if not already present:

```javascript
match /funnel_events/{docId} {
  allow create: if request.auth != null;
  allow read: if request.auth.token.email == 'kosal@fin-tegration.com';
}
```

---

*Last updated: April 9, 2026 — End of Phase C3 session*
*Next session: Start with Firestore indexes, then serviceAccountKey.json copy, then verify My Activity loads for a real advisor login.*
