# AUM Engine — Phase C5 Handoff
**Date:** 2026-04-09
**Repo:** `kprum1/theaumengine` (Firebase Hosting + Firestore)
**Live URL:** https://theaumengine.web.app
**Operator Email:** kosal@fin-tegration.com

---

## ⚠️ RESUME INSTRUCTIONS
1. Read this file first before touching any code.
2. The app is live and deployed. Test at https://theaumengine.web.app (Pilot Login → test@test.com).
3. All Cloud Functions are on **Node.js 22 (2nd Gen)**.
4. Daily digest fires at **7:00 AM CT** — check `routing_logs` collection for audit entries.
5. All script versions are at `v=20260409e` — do NOT revert them.

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C5)

### 1A. Daily Email Digest Cron (`sendDailyDigest`)
**Status: ✅ Complete. Deployed and live.**

A scheduled Cloud Function that emails each advisor a daily activity summary.

**Schedule:** `'0 12 * * *'` = noon UTC = **7:00 AM Central Time**

**Flow:**
1. Reads `funnel_events` where `ts >= 24 hours ago`
2. Groups events by `advisorUid`
3. For each advisor UID: fetches email + displayName from Firebase Auth
4. Tallies: `outreach_sent`, `reply_logged`, `meeting_booked`, `lead_status_changed`
5. Builds branded HTML + plain-text digest (dark-mode, 4-stat grid, pipeline moves table)
6. Sends via **Nodemailer + Gmail SMTP** (`kosal@fin-tegration.com`)
7. Logs result to `routing_logs` collection (`event: 'daily_digest_sent'`)

**Gmail SMTP config (in `functions/.env`):**
```
GMAIL_USER=kosal@fin-tegration.com
GMAIL_APP_PASSWORD=vnocrseelmmfzyvn
DIGEST_FROM_NAME=The AUM Engine
APP_NAME=TheAumEngine
```

**Email contents:**
- 📤 Outreach Sent / 💬 Replies Logged / 📅 Meetings Booked / 🔄 Status Updates (4 stat cards)
- Pipeline Moves table (up to 10 lead status changes with fromStatus → toStatus)
- "View Full Pipeline →" CTA button → https://theaumengine.web.app
- Advisor email resolved from Firebase Auth `displayName` (falls back to email prefix)

**Key functions in `functions/index.js`:**
| Function | Purpose |
|---|---|
| `sendDailyDigest` | Scheduled handler — reads events, sends per-advisor emails |
| `buildDigestHTML(name, dateStr, stats)` | Generates branded HTML email body |

### 1B. Node.js Runtime Upgrade (20 → 22)
**Status: ✅ Complete. All 5 functions running on Node.js 22.**

- `firebase.json`: `"runtime": "nodejs22"`
- `functions/package.json`: `"engines": { "node": "22" }`
- All 5 functions redeployed: `onLeadIngested`, `processRoutingQueue`, `runGovernance`, `alfredIngest`, `sendDailyDigest`
- Clears the **April 30, 2026** Node.js 20 deprecation deadline

### 1C. Funnel Tracker Verification
**Status: ✅ Verified end-to-end.**

Live browser test on https://theaumengine.web.app confirmed:
- `lead_status_changed` — fires on every status move (pipeline card buttons + modal)
- `outreach_sent` — fires when "Mark Sent" clicked in Nurture Batch modal
- `meeting_booked` — fires when lead moved to Booked status
- Manager Console Pipeline Velocity chart reflects real-time counts
- Meetings Booked counter updated from 2 → 4 during test
- Data persists through page reloads ✅
- No console errors ✅

### 1D. Pilot Advisor Onboarding Doc
**Status: ✅ Written. In repo root.**

`PILOT_ONBOARDING.md` — 8-step guide for pilot advisors:
1. Log in
2. Configure ICP (licensed states, niche, AUM band, lead cap)
3. Set Calendly booking link (via Send Booking Links modal → Edit)
4. Understand the 8-column pipeline
5. Run first outreach (Outreach Studio)
6. Use Nurture Batch + Send Booking Links tools
7. Log replies
8. Check daily email digest (7 AM CT)

---

## 2. COMPLETE FILE INVENTORY

### Modified Files
| File | What Changed |
|---|---|
| `functions/index.js` | Added: `sendDailyDigest`, `buildDigestHTML`. Bumped phase comment to `C5 (Node.js 22)` |
| `functions/package.json` | Added `"engines": { "node": "22" }`. Added `nodemailer ^6.9.13` dependency |
| `functions/.env` | Added: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `DIGEST_FROM_NAME`, `APP_NAME` |
| `firebase.json` | `runtime` bumped from `nodejs20` → `nodejs22` |

### New Files
| File | Purpose |
|---|---|
| `PILOT_ONBOARDING.md` | Pilot advisor onboarding guide (8 steps, ready to email) |

---

## 3. FIRESTORE / DATABASE SCHEMA

No new collections or indexes added this session.

**New `routing_logs` entries written by digest cron:**
```json
{
  "event": "daily_digest_sent",
  "agentId": "sendDailyDigest_v1",
  "advisorCount": 2,
  "sent": 2,
  "failed": 0,
  "since": "2026-04-08T19:00:00.000Z",
  "timestamp": "2026-04-09T12:00:00.000Z"
}
```

**localStorage keys (unchanged from C4):**
| Key | Contents |
|---|---|
| `aum_prospect_statuses` | `{ [prospectId]: { status, updatedAt } }` |
| `aum_snooze_cache` | `{ [prospectId]: { snoozeUntil, days, snoozedAt } }` |
| `aum_booking_link` | String — advisor's Calendly URL |

---

## 4. CLOUD FUNCTIONS INVENTORY (Current State)

| Function | Runtime | Schedule/Trigger | Purpose |
|---|---|---|---|
| `onLeadIngested` | Node.js 22 | HTTP POST | Alfred / manual lead ingest |
| `alfredIngest` | Node.js 22 | HTTP POST | Alfred batch ingest |
| `processRoutingQueue` | Node.js 22 | Every 5 min | Routing pipeline (ownership → eligibility → scoring → assignment) |
| `runGovernance` | Node.js 22 | Every 24 hours | SLA breach audit |
| `sendDailyDigest` | Node.js 22 | `'0 12 * * *'` (7 AM CT) | Daily advisor email digest |

---

## 5. PIPELINE / ARCHITECTURE (Current State)

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

Every status move → funnel_events (Firestore) → daily digest (7 AM CT email)
```

---

## 6. PENDING / NEXT STEPS

### High Priority (C5 complete — move to medium)
- [x] ~~Daily Email Digest Cron~~ — shipped in C5
- [x] ~~Verify Funnel Tracker events~~ — verified in C5
- [x] ~~Node.js 22 upgrade~~ — done in C5

### Medium Priority (Next Session = C6)
- [ ] **Yacht Scraper** — Build `fetch_uscg_vessels.js` to populate the Yacht Owners niche. USCG vessel documentation registry is the source. Script should output Alfred-compatible JSON for `alfredIngest`.
- [ ] **Reply Tapper persistence** — Reply tapper state (which leads replied) is not persisted to Firestore for `al_assignments` leads. Should write to `al_assignments/{id}` with `replyType` and `repliedAt`.
- [ ] **Snoozed column visibility** — The 8th column (Snoozed) always renders even when empty. Add: hide column when `snoozedCount === 0`, OR show a count badge when > 0.
- [ ] **Pilot advisor onboarding** — Each advisor needs: (a) login credentials, (b) ICP configured in Settings & ICP, (c) Calendly link set via Send Booking Links modal.

### Low Priority
- [ ] **Custom snooze input validation** — Currently accepts 7–730 days but no UX feedback on invalid entries
- [ ] **Nurture Batch full email preview** — Currently shows first 280 chars. Add "Show full draft" expand toggle.
- [ ] **Digest: pull advisor name from Firestore** — Currently uses `displayName` from Firebase Auth. For advisors without a display name set, falls back to email prefix. Should pull from `users/{uid}/data/advisorProfile.name`.
- [ ] **Booking link → Firestore** — Currently localStorage only. Should write to `advisor_settings/{uid}` for cross-device persistence.

---

## 7. OPEN DECISIONS

| Decision | Options | Recommendation |
|---|---|---|
| Booking link storage | Currently localStorage only | Write to Firestore `advisor_settings/{uid}` for cross-device sync (Phase C6) |
| Snooze column visibility | Always show column 8 vs. hide when empty | Hide when empty — saves horizontal space |
| Digest email sender | Currently `kosal@fin-tegration.com` | For scale: swap to SendGrid with a noreply@theaumengine.com domain |
| Digest: no-activity days | Currently skips send if no events | Consider a "quiet day" email with encouragement/pipeline tips |

---

## 8. CREDENTIALS & CONFIG

| Item | Location |
|---|---|
| Firebase Admin SDK key | `/Users/kosalprum/Downloads/theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json` (DO NOT COMMIT) |
| Firebase project | `theaumengine` |
| Functions env | `functions/.env` |
| Gmail App Password | `GMAIL_APP_PASSWORD=vnocrseelmmfzyvn` (in `.env`, DO NOT COMMIT) |
| Pilot login | test@test.com / [password in 1Password] |
| Booking link (pilot) | Set via Send Booking Links modal → Edit → paste Calendly URL |

---

## 9. GIT LOG (This Session)

```
b59657c feat(cron+runtime): daily email digest cron, Node.js 22 upgrade, pilot onboarding doc
97e28b1 docs: session handoff C4
241c2cc fix(batch): replace prompt() booking link editor with proper inline input
1129df4 feat(pipeline): replace stub buttons with real batch action modals
be7dd74 feat(pipeline): re-engage snooze system — Dead leads return to queue after 90/120/180/365-day or custom interval
e1bae0a feat(pipeline): full status update system — Phase 2 of Nurture & Booking
```

---

## 10. HOW TO START NEXT SESSION

Paste this as your opening message:

```
Read HANDOFF_C5.md first. We're continuing Phase C5 → C6 of the AUM Engine.
Live at https://theaumengine.web.app. Pilot login: test@test.com.
Top priority: Yacht Scraper (fetch_uscg_vessels.js) + Reply Tapper Firestore persistence.
```
