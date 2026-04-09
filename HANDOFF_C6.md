# AUM Engine — Phase C6 Handoff
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
5. All script versions are at `v=20260409f` for `db.js` and `outreach_controller.js`.
6. **Yacht Owners JSON is ready to ingest** — run `node scripts/approve_and_ingest.js --batch=2026-04-09T19-48-33` to push 30 leads to Firestore.

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C6)

### 1A. Yacht Scraper (`fetch_uscg_vessels.js`)
**Status: ✅ Complete. Script + seed data + Alfred JSON all committed.**

A two-mode Node.js scraper that populates the Yacht Owners niche.

**Why two modes?**
USCG removed owner PII from public CGMIX search results in 2018 — no bulk API exists. Mode B (Seed CSV Transformer) is the realistic pilot path.

**Mode A:** Explains CGMIX workflow + gives query params for manual data pull. No bulk scrape possible without PII.

**Mode B:** Reads a curated seed CSV and transforms it into Alfred-compatible JSON for `alfredIngest`.

**CLI usage:**
```bash
# Generate Alfred JSON from seed (primary mode for pilot)
node scripts/fetch_uscg_vessels.js --mode=B --seed=scripts/data/yacht_owners_seed.csv

# Filter to one state
node scripts/fetch_uscg_vessels.js --mode=B --seed=scripts/data/yacht_owners_seed.csv --state=FL

# Dry run (preview without writing)
node scripts/fetch_uscg_vessels.js --mode=B --dry-run
```

**Output:**
- 30 yacht owner leads in Alfred-compatible JSON
- Spread across: Newport Beach CA, Fort Lauderdale FL, Annapolis MD, Seattle WA, Houston TX, Miami FL, San Diego CA, Chicago IL
- AUM range: $1.8M – $9M+
- Vessel types: Motor Yacht, Sloop, Ketch, Catamaran — all 40ft+
- Fit scores: 77–95 / Timing: 68–92

**Review result:** 30/30 APPROVED, 0 flagged, 0 rejected
**Staged batch:** `2026-04-09T19-48-33`

**To ingest to Firestore:**
```bash
node scripts/approve_and_ingest.js --batch=2026-04-09T19-48-33
```

### 1B. Reply Tapper Firestore Persistence
**Status: ✅ Complete. Deployed and live.**

Closes the gap between the Reply Tapper UI and the routing governance layer.

**Gap that existed:** When an advisor tapped a reply outcome (✉️ They Replied, 📅 Meeting Booked, etc.), the event fired to `funnel_events` and `outreach_outcomes` — but `al_assignments/{id}` was never updated. The `runGovernance` cron couldn't see reply rates per assignment.

**Fix:**
- `db.js` — new `updateAlAssignmentReply(assignmentId, replyType)` function
- `outreach_controller.js` — `_tapReplyOutcome()` now calls it as a silent background write for any prospect with `_fromFirestore: true` + `assignmentId`

**New fields written to `al_assignments/{id}`:**
```json
{
  "replyType":    "reply | positive | meeting | dead | objection | not_now | unsubscribe",
  "replyOutcome": "reply",
  "repliedAt":    "2026-04-09T19:00:00.000Z",
  "updatedAt":    "2026-04-09T19:00:00.000Z"
}
```

Zero UI changes — pure background write. Non-breaking for demo/non-routed leads (no-op if no `assignmentId`).

---

## 2. COMPLETE FILE INVENTORY

### New Files
| File | Purpose |
|---|---|
| `scripts/fetch_uscg_vessels.js` | Two-mode USCG vessel scraper (CGMIX guide + seed CSV transformer) |
| `scripts/data/yacht_owners_seed.csv` | 30 pilot yacht owner leads — source of truth for Yacht Owners niche |
| `scripts/incoming/yacht-owners-uscg-2026-04-09.json` | Pre-built Alfred JSON — 30/30 reviewed, ready to ingest |

### Modified Files
| File | What Changed |
|---|---|
| `js/db.js` | Added `updateAlAssignmentReply(assignmentId, replyType)` — writes reply to `al_assignments` |
| `js/outreach_controller.js` | `_tapReplyOutcome()` now calls `updateAlAssignmentReply` for routing-engine leads |
| `index.html` | Bumped `db.js` + `outreach_controller.js` to `v=20260409f` |

---

## 3. FIRESTORE / DATABASE SCHEMA

### New field writes on `al_assignments/{id}` (Reply Tapper — C6)
```json
{
  "replyType":    "reply",
  "replyOutcome": "reply",
  "repliedAt":    "2026-04-09T19:00:00.000Z",
  "updatedAt":    "2026-04-09T19:00:00.000Z"
}
```

### Yacht Owners prospect schema (when ingested to `prospects` collection)
```json
{
  "firstName":   "Thomas",
  "lastName":    "Ashford",
  "title":       "Managing Director",
  "company":     "Ashford Investment Partners",
  "city":        "Miami",
  "state":       "FL",
  "niche":       "Yacht Owners",
  "nicheId":     "yacht-owners",
  "fitScore":    94,
  "timingScore": 89,
  "priorityScore": 91,
  "reasonCodes": ["80ft USCG-documented Motor Yacht — $2M+ wealth signal", "Hailing port: Miami, FL"],
  "signals": {
    "vesselName":      "Grand Monarch",
    "vesselLength":    "80ft",
    "vesselType":      "Motor Yacht",
    "hailingPort":     "Miami, FL",
    "uscgDocNum":      "7890536",
    "estimatedAssets": "$8M+",
    "relationship":    "None — cold (USCG data)"
  }
}
```

**localStorage keys (unchanged from C5):**
| Key | Contents |
|---|---|
| `aum_prospect_statuses` | `{ [prospectId]: { status, updatedAt } }` |
| `aum_snooze_cache` | `{ [prospectId]: { snoozeUntil, days, snoozedAt } }` |
| `aum_booking_link` | String — advisor's Calendly URL |

---

## 4. CLOUD FUNCTIONS INVENTORY (unchanged from C5)

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

Outreach Studio → Send Now → osLogOutcome() → outreach_outcomes (Firestore)
                                             → Reply Tapper shows
  → Advisor taps reply outcome → FunnelTracker.replyLogged()
                               → outreach_outcomes/{id}.outcome updated
                               → al_assignments/{id}.replyType written ← NEW C6
```

### Yacht Owners data pipeline (NEW C6):
```
scripts/data/yacht_owners_seed.csv
  → node scripts/fetch_uscg_vessels.js --mode=B
  → scripts/incoming/yacht-owners-uscg-[date].json
  → node scripts/review_alfred_leads.js         ← review/validate
  → scripts/staging/staged_[timestamp].json
  → node scripts/approve_and_ingest.js          ← Kos approves
  → Firestore prospects collection
  → Advisor pipeline (Yacht Owners niche)
```

---

## 6. PENDING / NEXT STEPS

### Already done in C6 (remove from backlog)
- [x] ~~Yacht Scraper~~ — `fetch_uscg_vessels.js` + seed CSV + 30 leads ready
- [x] ~~Reply Tapper persistence~~ — `al_assignments` write-back deployed

### High Priority (C7)
- [ ] **Ingest Yacht Owner leads** — Run `node scripts/approve_and_ingest.js --batch=2026-04-09T19-48-33` (ready now, just needs approval)
- [ ] **Fix al_assignments composite index** — Firestore console has a direct link to create the composite index for the `al_assignments` query (`advisorUid` + `createdAt desc`). Without it, `loadAlAssignments` silently returns `[]`. Takes 60 seconds in Firebase Console.
- [ ] **Snoozed column visibility** — The 8th pipeline column always renders even when empty. Add: hide column when `snoozedCount === 0`.

### Medium Priority (C7)
- [ ] **Pilot advisor onboarding** — Each advisor needs: (a) login credentials, (b) ICP in Settings & ICP, (c) Calendly link via Send Booking Links modal.
- [ ] **Booking link → Firestore** — Currently localStorage only. Write to `advisor_settings/{uid}` for cross-device persistence.
- [ ] **Reply Tapper persistence** — add `replyType` to `outreach_outcomes` schema too (currently only writes to `al_assignments`). Low effort.

### Low Priority
- [ ] **Custom snooze input validation** — Accepts 7–730 days but no UX feedback on invalid entries
- [ ] **Nurture Batch full email preview** — Currently shows first 280 chars. Add "Show full draft" expand toggle.
- [ ] **Digest: pull advisor name from Firestore** — Currently `displayName` from Firebase Auth. Should pull from `users/{uid}/data/advisorProfile.name`.
- [ ] **Digest: quiet day email** — Currently skips send if no events. Consider encouragement email on no-activity days.

---

## 7. OPEN DECISIONS

| Decision | Options | Recommendation |
|---|---|---|
| Yacht owner data sourcing | Seed CSV (current) vs. marina roster scrape | Add marina/yacht club roster CSV for C7 — Annapolis Yacht Club, BCYC, etc. |
| al_assignments composite index | Missing — silently returns [] for routed leads | Fix in Firestore Console (60 seconds) — high value |
| Booking link storage | localStorage only | Write to Firestore `advisor_settings/{uid}` for cross-device sync (C7) |
| Snooze column visibility | Always show column 8 | Hide when empty — saves horizontal space |
| Digest email sender | `kosal@fin-tegration.com` | For scale: swap to SendGrid with noreply@theaumengine.com |

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
cf8d127 feat(c6): yacht scraper + reply tapper firestore persistence
5273092 docs: session handoff C5
b59657c feat(cron+runtime): daily email digest cron, Node.js 22 upgrade, pilot onboarding doc
97e28b1 docs: session handoff C4
241c2cc fix(batch): replace prompt() booking link editor with proper inline input
```

---

## 10. HOW TO START NEXT SESSION

Paste this as your opening message:

```
Read HANDOFF_C6.md first. We're continuing Phase C6 → C7 of the AUM Engine.
Live at https://theaumengine.web.app. Pilot login: test@test.com.
Top priority: (1) Ingest Yacht Owner leads (approve_and_ingest --batch=2026-04-09T19-48-33),
(2) Fix al_assignments composite index in Firestore Console,
(3) Snoozed column visibility (hide when empty).
```
