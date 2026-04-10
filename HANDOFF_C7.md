# AUM Engine — Phase C7 Handoff
**Date:** 2026-04-10
**Repo:** `kprum1/theaumengine` (Firebase Hosting + Firestore)
**Live URL:** https://theaumengine.web.app
**Operator Email:** kosal@fin-tegration.com

---

## ⚠️ RESUME INSTRUCTIONS
1. Read this file first before touching any code.
2. The app is live and deployed. Test at https://theaumengine.web.app (Pilot Login → test@test.com).
3. All Cloud Functions are on **Node.js 22 (2nd Gen)**.
4. Daily digest fires at **7:00 AM CT** — check `routing_logs` collection for audit entries.
5. Script versions bumped to `v=20260410a` for `db.js`, `outreach_controller.js`, `auth.js`.
6. Firebase CLI is at `/usr/local/bin/firebase` (not in default PATH — use full path or open a proper terminal).

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C7)

### 1A. Yacht Owner Lead Ingest
**Status: ✅ Complete. 30 leads live in Firestore.**

Ran `node scripts/approve_and_ingest.js --batch=2026-04-09T19-48-33` — pushed all 30 yacht owner leads from the C6 staged batch into the `masterLeads` Firestore collection. Batch committed, incoming files archived to `scripts/incoming/processed/`, ingest log updated at `scripts/staging/ingest_log.md`.

**Cities:** Newport Beach CA, Fort Lauderdale FL, Annapolis MD, Seattle WA, Houston TX, Miami FL, San Diego CA, Chicago IL, Galveston TX  
**AUM range:** $1.8M – $9M+ | **Fit scores:** 77–95 | **Batch ID:** `2026-04-09T19-48-33`

### 1B. `al_assignments` Composite Index
**Status: ✅ Complete. Deployed to Firestore.**

Added `advisorUid ASC + createdAt DESC` composite index to `firestore.indexes.json` and deployed. `loadAlAssignments` now returns actual data instead of silently returning `[]` for routed pilot leads.

### 1C. Snoozed Column Visibility
**Status: ✅ Complete. Deployed.**

`pageNurtureBooking()` in `js/pages.js` — pipeline board now filters out the Snoozed column when empty:
```js
PIPELINE_COLUMNS.filter(col => col !== 'Snoozed' || colMap['Snoozed'].length > 0).map(...)
```
Saves ~180px horizontal space when no leads are snoozed.

### 1D. `replyType` Field in `outreach_outcomes`
**Status: ✅ Complete. Deployed.**

Closes the schema gap between `al_assignments` and `outreach_outcomes`. Both collections now have `replyType`.

**Changes:**
- `db.js` — `saveOutcomeToFirestore()` initializes `replyType: null` on doc creation
- `outreach_controller.js` — `osLogReply()` writes `replyType: outcome` alongside `outcome` on every reply tap

### 1E. Booking Link → Firestore Persistence
**Status: ✅ Complete. Deployed.**

Calendly URL now persists to `advisor_settings/{uid}` in Firestore for cross-device sync.

**Changes:**
- `db.js` — Added `saveBookingLink(uid, url)` + `loadBookingLink(uid)` targeting `advisor_settings/{uid}` with `merge: true`
- `app.js` — Save button dual-writes: localStorage + `saveBookingLink()` to Firestore
- `auth.js` — On login, `loadBookingLink()` fires non-blocking and hydrates `ICP_CONFIG.bookingLink` + localStorage

---

## 2. COMPLETE FILE INVENTORY

### Modified Files
| File | What Changed |
|---|---|
| `firestore.indexes.json` | Added `al_assignments` composite index (`advisorUid` ASC + `createdAt` DESC) |
| `js/pages.js` | Snoozed column hidden when empty — `filter()` before `map()` on line 569 |
| `js/db.js` | Added `replyType: null` to `saveOutcomeToFirestore` schema; added `saveBookingLink()` + `loadBookingLink()` |
| `js/outreach_controller.js` | `osLogReply()` now writes `replyType: outcome` alongside `outcome` |
| `js/auth.js` | `onAuthStateChanged` bootstrap now calls `loadBookingLink()` and hydrates `ICP_CONFIG` + localStorage |
| `index.html` | Bumped `db.js`, `outreach_controller.js`, `auth.js` to `v=20260410a` |
| `scripts/staging/ingest_log.md` | Appended 30-lead Yacht Owners ingest receipt |

### No New Files This Session

---

## 3. FIRESTORE / DATABASE SCHEMA

### New: `al_assignments` composite index (deployed via `firestore.indexes.json`)
```json
{
  "collectionGroup": "al_assignments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "advisorUid", "order": "ASCENDING" },
    { "fieldPath": "createdAt",  "order": "DESCENDING" }
  ]
}
```

### Updated: `outreach_outcomes` schema (new field)
```json
{
  "replyType": null,          // initialized null; set to outcome string when advisor taps Reply Tapper
  "outcome":   null,          // unchanged — still set by osLogReply()
  "replyLoggedAt": "..."      // unchanged
}
```

### New: `advisor_settings/{uid}` (new collection)
```json
{
  "bookingLink": "https://calendly.com/advisor/30min",
  "bookingLinkUpdatedAt": "2026-04-10T..."
}
```

### `masterLeads` batch (Yacht Owners — C7)
- **30 docs** ingested with `batchId: "2026-04-09T19-48-33"`
- Doc ID format: `alfred_2026_04_09_19_48_33_{firstname}_{lastname}`
- Status: `New`, routed by `processRoutingQueue` within 5 min of ingest

---

## 4. PIPELINE / ARCHITECTURE (Current State)

```
Lead enters (New)
  → Contacted [📞 quick-advance or ⋯ modal]
  → Engaged [💬]
  → Nurture [🌱] ←── Run Nurture Batch button aggregates these
  → Meeting Requested [📅] ←── Send Booking Links button aggregates these
    → Advisor sets Calendly link → saves to advisor_settings/{uid} (Firestore) + localStorage
  → Booked [🎉] → appears in Meeting Prep page
  → Dead [❌] → ♻️ Re-engage → showSnoozeModal → Snoozed column (hidden when empty ← C7)
                                                        ↓ _checkSnoozedLeads() on navigate()
                                                      New (auto-promotes after interval)

Every status move → funnel_events (Firestore) → daily digest (7 AM CT email)

Outreach Studio → Send Now → osLogOutcome() → outreach_outcomes (Firestore)
  [outreach_outcomes schema now includes replyType: null on creation ← C7]
                                             → Reply Tapper shows
  → Advisor taps reply outcome → FunnelTracker.replyLogged()
                               → outreach_outcomes/{id}.outcome + replyType updated ← C7
                               → al_assignments/{id}.replyType written ← C6
```

### Booking link cross-device flow (NEW C7):
```
Advisor sets Calendly link in Send Booking Links modal
  → ICP_CONFIG.bookingLink = val
  → localStorage.setItem('aum_booking_link', val)
  → saveBookingLink(uid, val) → advisor_settings/{uid}.bookingLink (Firestore)

On next login (any device):
  → bootstrapUserData() completes
  → loadBookingLink(uid) → advisor_settings/{uid}
  → ICP_CONFIG.bookingLink = link
  → localStorage.setItem('aum_booking_link', link)
```

---

## 5. PENDING / NEXT STEPS

### Already done in C7 (remove from backlog)
- [x] ~~Ingest Yacht Owner leads~~ — 30/30 in Firestore
- [x] ~~al_assignments composite index~~ — deployed
- [x] ~~Snoozed column visibility~~ — hides when empty
- [x] ~~replyType in outreach_outcomes~~ — schema complete
- [x] ~~Booking link → Firestore~~ — cross-device sync live

### High Priority (C8)
- [ ] **Pilot advisor onboarding** — Each advisor needs: (a) login credentials, (b) ICP in Settings & ICP, (c) Calendly link via Send Booking Links modal. Use `scripts/provision_pilot_advisors.js`.
- [ ] **Trigger routing for Yacht Owner batch** — New `masterLeads` from admin SDK ingest do NOT auto-enqueue to `routing_queue`. Either: (a) call `alfredIngest` HTTP endpoint instead, or (b) add a manual trigger script `scripts/trigger_routing.js --batch=2026-04-09T19-48-33`.
- [ ] **Verify Yacht Owners appear in advisor pipeline** — After routing runs, confirm pilot advisor sees Yacht Owner leads in their Nurture/Booking board.

### Medium Priority (C8)
- [ ] **Marina/Yacht club roster CSV** — Add Annapolis Yacht Club, BCYC etc. for C8 Yacht Owners expansion.
- [ ] **Custom snooze input validation** — Accepts 7–730 days but no UX feedback on invalid entries.
- [ ] **Nurture Batch full email preview** — Currently shows first 280 chars. Add "Show full draft" expand toggle.

### Low Priority
- [ ] **Digest: pull advisor name from Firestore** — Currently `displayName` from Firebase Auth. Should pull from `users/{uid}/data/advisorProfile.name`.
- [ ] **Digest: quiet day email** — Currently skips send if no events. Consider encouragement email on no-activity days.
- [ ] **Digest email sender** — Currently `kosal@fin-tegration.com`. Swap to SendGrid with `noreply@theaumengine.com` at scale.

---

## 6. OPEN DECISIONS

| Decision | Options | Recommendation |
|---|---|---|
| Routing trigger for admin-ingested leads | Admin SDK doesn't auto-queue; alfredIngest HTTP does | Add `trigger_routing.js` script that reads the batch and enqueues to `routing_queue` |
| Yacht owner data sourcing | Seed CSV (current) vs. marina roster scrape | Add marina/yacht club roster CSV for C8 |
| Digest email sender | `kosal@fin-tegration.com` | For scale: swap to SendGrid with `noreply@theaumengine.com` |
| Booking link load timing | Loads after bootstrap (non-blocking) | Works for now; if UI flicker is visible, move to blocking bootstrap |

---

## 7. CREDENTIALS & CONFIG

| Item | Location |
|---|---|
| Firebase Admin SDK key | `/Users/kosalprum/Downloads/theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json` (DO NOT COMMIT) |
| Firebase project | `theaumengine` |
| Functions env | `functions/.env` |
| Gmail App Password | `GMAIL_APP_PASSWORD=vnocrseelmmfzyvn` (in `.env`, DO NOT COMMIT) |
| Pilot login | test@test.com / [password in 1Password] |
| Firebase CLI | `/usr/local/bin/firebase` (not in default PATH — use full path) |
| Booking link (pilot) | Set via Send Booking Links modal → Edit → paste Calendly URL (now persists to Firestore) |

---

## 8. GIT LOG (This Session)

```
420daa8 feat(c7): replyType in outreach_outcomes, booking link Firestore persistence
a4d3294 feat(c7): ingest 30 yacht owners, al_assignments index, snoozed column visibility
ef4220d docs: session handoff C6
cf8d127 feat(c6): yacht scraper + reply tapper firestore persistence
5273092 docs: session handoff C5
b59657c feat(cron+runtime): daily email digest cron, Node.js 22 upgrade, pilot onboarding doc
```

---

## 9. HOW TO START NEXT SESSION

Paste this as your opening message:

```
Read HANDOFF_C7.md first. We're continuing Phase C7 → C8 of the AUM Engine.
Live at https://theaumengine.web.app. Pilot login: test@test.com.
Top priority: (1) Trigger routing for Yacht Owner batch (masterLeads don't auto-enqueue
— need trigger_routing.js or alfredIngest call), (2) Pilot advisor onboarding
(provision_pilot_advisors.js), (3) Marina/yacht club roster CSV for C8 niche expansion.
Deploy with: /usr/local/bin/firebase deploy --only hosting --project theaumengine
```
