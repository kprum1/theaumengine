# AUM Engine — Phase C4 Handoff
**Date:** 2026-04-09
**Repo:** `kprum1/theaumengine` (Firebase Hosting + Firestore)
**Live URL:** https://theaumengine.web.app
**Operator Email:** kosal@fin-tegration.com

---

## ⚠️ RESUME INSTRUCTIONS

1. Read this file first before touching any code.
2. The app is live and deployed. Test at https://theaumengine.web.app (Pilot Login → test@test.com).
3. All status mutation now routes through `setProspectStatus(id, newStatus)` in `app.js`.
4. All script versions are at `v=20260409e` — do NOT revert them.

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C4)

### 1A. Pipeline Status Update System (Phase 2)
**Status: ✅ Complete. Verified end-to-end.**

Previously `setProspectStatus` was a stub. Now fully wired:
- **In-memory**: mutates `PROSPECTS[]`
- **localStorage**: persists to `aum_prospect_statuses` (survives reload)
- **Firestore**: dual-write to `al_assignments` (routing engine leads) via `updateAlAssignmentStatus()` OR `lead_assignments` (legacy Layer 1)
- **Funnel events**: fires `FunnelTracker.leadStatusChanged` on every move, `FunnelTracker.meetingBooked` when status = Booked

### 1B. Pipeline Card Interactive Buttons
**Status: ✅ Complete. Verified.**

Each pipeline card now has two action buttons:
- **Blue quick-advance button** — one-tap to next logical stage (📞 Contacted, 💬 Engaged, 🌱 Nurture, 📅 Meeting Requested, 🎉 Booked)
- **⋯ button** — opens full `showStatusModal()` for non-linear moves

### 1C. Status Modal (`showStatusModal`)
**Status: ✅ Complete.**

- 7-option picker: New / Contacted / Engaged / Nurture / Meeting Requested / Booked / Dead
- Triggered from: drawer "Update Status" button AND pipeline card ⋯ button
- Closes on backdrop click

### 1D. Re-engage / Snooze System
**Status: ✅ Complete. Verified end-to-end.**

Flow: Dead lead → ♻️ Re-engage button → `showSnoozeModal()` → pick interval → `snoozeProspect(id, days)` → lead moves to Snoozed column → auto-promotes to New after interval.

Key functions in `app.js`:
| Function | Purpose |
|---|---|
| `snoozeProspect(id, days)` | Sets status=Snoozed, writes `snoozeUntil` to `aum_snooze_cache` in localStorage |
| `_checkSnoozedLeads()` | Runs on every `navigate()` call + at boot — auto-promotes expired leads back to New |
| `showSnoozeModal(id)` | Amber interval picker: 90 / 120 / 180 / 365 days + custom input (7–730 days) |

**Pipeline changes for Snoozed:**
- `PIPELINE_COLUMNS` expanded to 8 (added `'Snoozed'`)
- `.pipeline-board` CSS grid → `repeat(8, 1fr)` / `min-width: 1020px`
- Dead cards show `♻️ Re-engage` button (amber)
- Snoozed cards show `⏰ Returns [date] · [N]d` countdown badge

**localStorage keys:**
- `aum_snooze_cache` — `{ [prospectId]: { snoozeUntil, days, snoozedAt } }`
- `aum_prospect_statuses` — updated with Snoozed/New on promote

### 1E. Batch Action Modals (Run Nurture Batch + Send Booking Links)
**Status: ✅ Complete. Verified.**

Both buttons on the Nurture & Booking page header are now real:

**Run Nurture Batch (`openNurtureBatch()`):**
- Pulls all `status === 'Nurture'` leads
- Shows scrollable pre-generated email draft per lead (first 280 chars)
- `✉️ Mark Sent → Move to Contacted` — advances status, fires `FunnelTracker.outreachSent()`, fades card
- `Edit in Studio` — navigates to Outreach Studio for that lead
- Empty state: toast "No leads in Nurture right now"

**Send Booking Links (`openBookingLinksBatch()`):**
- Pulls all `status === 'Meeting Requested'` leads
- Generates booking-link email draft using `ICP_CONFIG.bookingLink`
- `📅 Mark Sent → Move to Booked` — advances status, fires `FunnelTracker.meetingBooked()`
- `Copy Link` — clipboard copy of Calendly URL
- **Footer inline link editor** (replaces broken `prompt()`):
  - Default: shows link as clickable href OR `⚠️ Not set` warning in rose
  - Edit click: swaps to amber-bordered `<input>` + Save/Cancel inline
  - Save: writes to `ICP_CONFIG.bookingLink` + `localStorage('aum_booking_link')`, re-opens modal

**Booking link persistence:**
- `ICP_CONFIG.bookingLink` reads from `localStorage.getItem('aum_booking_link')` at boot
- Survives page reloads independently of full ICP config

---

## 2. COMPLETE FILE INVENTORY

### Modified Files
| File | What Changed |
|---|---|
| `js/app.js` | Added: `setProspectStatus`, `_restoreStatusCache`, `showStatusModal`, `snoozeProspect`, `_checkSnoozedLeads`, `showSnoozeModal`, `openNurtureBatch`, `openBookingLinksBatch`. Patched: `navigate()` calls `_checkSnoozedLeads`, drawer "Update Status" now calls `showStatusModal` |
| `js/pages.js` | Pipeline cards upgraded with quick-advance + ⋯ buttons; Dead cards show ♻️ Re-engage; Snoozed cards show ⏰ countdown; header buttons wired to real functions |
| `js/db.js` | Added `updateAlAssignmentStatus(assignmentId, newStatus)` — writes to `al_assignments` collection |
| `js/data.js` | Added `'Snoozed'` to `PIPELINE_COLUMNS`; added `'Snoozed': 'pill-snoozed'` to `getStatusPill`; added `bookingLink: localStorage.getItem('aum_booking_link') || ''` to `ICP_CONFIG` |
| `css/main.css` | Added `.pill-snoozed` style (amber); bumped `.pipeline-board` grid to `repeat(8, 1fr)` / `min-width: 1020px` |
| `index.html` | Version strings bumped to `v=20260409e` (app.js, pages.js, data.js), `v=20260409c` (db.js), `v=10` (main.css) |

### New Files
None this session — all work was additive edits to existing files.

---

## 3. FIRESTORE / DATABASE SCHEMA

No new collections or indexes added this session. All new persistence is localStorage.

**localStorage keys added this session:**
| Key | Contents |
|---|---|
| `aum_prospect_statuses` | `{ [prospectId]: { status, updatedAt } }` — status override cache |
| `aum_snooze_cache` | `{ [prospectId]: { snoozeUntil, days, snoozedAt } }` — active snoozes |
| `aum_booking_link` | String — advisor's Calendly URL, set via Send Booking Links modal |

---

## 4. PIPELINE / ARCHITECTURE (Current State)

```
Lead enters (New)
  → Contacted [📞 quick-advance or ⋯ modal]
  → Engaged [💬]
  → Nurture [🌱] ←── Run Nurture Batch button aggregates these
  → Meeting Requested [📅] ←── Send Booking Links button aggregates these
  → Booked [🎉] → appears in Meeting Prep page
  → Dead [❌] → ♻️ Re-engage → showSnoozeModal → Snoozed column
                                                        ↓ _checkSnoozedLeads() on navigate()
                                                      New (auto-promotes after interval)
```

Status mutation canonical path:
```
setProspectStatus(id, status)
  → PROSPECTS[] (in-memory)
  → localStorage['aum_prospect_statuses']
  → Firestore: al_assignments OR lead_assignments (non-blocking)
  → FunnelTracker event
  → navigate(currentPage) [re-renders board]
  → showToast()
```

---

## 5. PENDING / NEXT STEPS

### High Priority
- [ ] **Calendly link setup for pilot advisors** — Every pilot advisor needs to set their booking link in the Send Booking Links modal. Guide them to open the modal, click Edit, paste their Calendly URL, Save.
- [ ] **Verify Funnel Tracker events in Firestore** — Open Manager Console → Pilot Funnel tab and confirm `outreachSent` and `meetingBooked` events are writing to `funnel_events` collection.
- [ ] **Path B: Daily Email Digest Cron** — `functions/index.js` needs a scheduled Cloud Function that reads `funnel_events` and emails the advisor a daily summary. Data layer is ready.

### Medium Priority
- [ ] **Yacht Scraper** — Build `fetch_uscg_vessels.js` to populate the Yacht Owners niche. USCG vessel documentation registry is the source.
- [ ] **Reply Tapper persistence** — The reply tapper state (which leads replied) is not persisted to Firestore for `al_assignments` leads.
- [ ] **Snoozed column visibility** — The 8th column (Snoozed) only appears when a lead is snoozed. Consider adding a count badge or hiding the column when empty to save horizontal space.
- [ ] **Pilot advisor onboarding** — Each advisor needs: (a) login credentials, (b) their ICP configured in Settings & ICP, (c) their Calendly link set.

### Low Priority
- [ ] **Custom snooze input validation** — Currently accepts 7–730 days but no UX feedback on invalid entry.
- [ ] **Nurture Batch email preview full-length** — Currently shows first 280 chars of draft. Add a "Show full draft" expand toggle.

---

## 6. OPEN DECISIONS

| Decision | Options | Recommendation |
|---|---|---|
| Booking link storage | Currently localStorage only | Should write to Firestore `advisor_settings/{uid}` so it persists across devices for real advisors |
| Snooze visibility in Dead column | Dead col shows snoozed leads with countdown OR separate Snoozed col | Current: separate column. Consider hiding when empty. |
| Nurture Batch "Mark Sent" | Currently just advances status locally | Phase 2: integrate with actual email send via SendGrid/Resend |
| Batch modal email drafts | Using base `emailDraft` from PROSPECTS | Phase 2: run through OutreachController for situation-aware variants |

---

## 7. CREDENTIALS & CONFIG

| Item | Location |
|---|---|
| Firebase Admin SDK key | `/Users/kosalprum/Downloads/theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json` (DO NOT COMMIT) |
| Firebase project | `theaumengine` |
| Functions env | `functions/.env` |
| Pilot login | test@test.com / [password in 1Password] |
| Booking link (pilot) | Set via Send Booking Links modal → Edit → paste Calendly URL |

---

## 8. GIT LOG (This Session)

```
241c2cc fix(batch): replace prompt() booking link editor with proper inline input
1129df4 feat(pipeline): replace stub buttons with real batch action modals
be7dd74 feat(pipeline): re-engage snooze system — Dead leads return to queue after 90/120/180/365-day or custom interval
e1bae0a feat(pipeline): full status update system — Phase 2 of Nurture & Booking
36f9ad0 fix(routing+math): 4 bugs resolved — collection name, UID field alignment, dual-write, new index
9094931 feat(firestore): funnel_events rules + composite indexes — Phase C3 analytics layer
```

---

## 9. HOW TO START NEXT SESSION

Paste this as your opening message:

```
Read HANDOFF_C4.md first. We're continuing Phase C4 → C5 of the AUM Engine.
Live at https://theaumengine.web.app. Pilot login: test@test.com.
Top priority: [pick from Section 5 above]
```
