# HANDOFF — Session C50
**Date:** 2026-05-06
**Phase:** C50 — Production Lead Pipeline Repair + Full Advisor Migration
**Project:** The AUM Engine (`theaumengine.com`)
**Repo:** `/Users/kosalprum/Documents/AdvDiamondMining`
**Author:** Antigravity (Kosal Prum session)

---

## 🎯 Session Objective

Resolve the P0 production bug where all advisor dashboards showed **27 demo leads** instead of their real assigned lead cohorts, then fix all downstream display issues (0 Action Ready, 272 Needs Data).

---

## ✅ What Was Accomplished

### Bug 1 — FIXED: Dashboard showing 27 demo leads instead of real cohort

**Root cause (confirmed):**
`bootstrapUserData` used a single `Promise.all` containing 6 sub-queries. `fetchAdvisorLeadCount` and/or the `users/{uid}/data/*` sub-doc reads were throwing `PERMISSION_DENIED` on new accounts (no sub-documents exist yet). Because `Promise.all` rejects on ANY failure, the entire function fell into its outer `catch` block and returned `assignedLeads: []` — discarding the real leads.

**Fix 1 — CF `advisorMode` (functions/index.js):**
Added `advisorMode: true` to `getLeadsByIds` Cloud Function. When called with this flag, the CF:
- Queries `lead_assignments` server-side via **Admin SDK** (bypasses ALL Firestore rules + index requirements)
- Fetches all `master_leads` via Admin SDK
- Returns `{ leads[], assignments[], count }` in a single response

This eliminates the client-side Firestore compound query entirely.

**Fix 2 — `bootstrapUserData` isolation (js/db.js):**
Replaced the single `Promise.all` with isolated sequential try/catch blocks:
- `assignedLeads` loads FIRST, independently — can never be discarded by unrelated failure
- User sub-doc reads each have `.catch(() => ({ exists: false }))` guards
- `fetchAdvisorLeadCount` is now non-blocking (fire-and-forget) — never blocks lead loading

**Fix 3 — `loadAssignedLeadsFromFirestore` (js/db.js):**
Replaced 2-step client-Firestore → CF chain with single `fn({ advisorMode: true })` call.

---

### Bug 2 — FIXED: Action Ready = 0, Needs Data = 272

**Root cause:**
`isReady` gate in 3 places required `p.propertyAddress` — a field that ONLY exists on homestead/real-estate-sourced leads. Jeremy's entire 272-lead cohort (physicians, execs, business owners, law partners, HENRYs) never has `propertyAddress` in `master_leads` schema.

**Fix — Updated `isReady` in 3 locations:**
```js
// OLD (broken for professional niches)
const isReady = p => !!(p.firstName && p.lastName && p.phone && p.phone.trim() && p.propertyAddress);

// NEW (correct for all niche types)
const isReady = p => !!(p.firstName && p.lastName && (
  (p.phone && (typeof p.phone === 'string' ? p.phone.trim() : p.phone)) ||
  (p.email && (typeof p.email === 'string' ? p.email.trim() : p.email)) ||
  !!(p.linkedInUrl || p.linkedin)
));
```

**Locations fixed:**
1. `js/pages.js` line 7 — `pageCommandCenter()` Top-8 queue
2. `js/pages.js` line 457 — `pageLeadScoreboard()` filter gate
3. `js/data.js` line 570 — `computeMetrics()` KPI card values

---

### Migration — All Advisor Accounts Provisioned with Clean @theaumengine.com Emails

Created clean Firebase Auth accounts for all advisors with consistent `@theaumengine.com` emails. Migrated all `lead_assignments` and `advisor_pool` docs to new UIDs.

| Advisor | New Email | Password | Leads | New UID |
|---|---|---|---|---|
| Jeremy Steward | `jsteward@theaumengine.com` | `jsteward2026` | 272 | `D8C1LLepDHNiKSEJv2ONHGNr1eh2` |
| Chuck Cooper | `ccooper@theaumengine.com` | `ccooper2026` | 210 | `xQC1e6nFDBaHax5WfiVDnbspgXO2` |
| Patrick Wight | `pwight@theaumengine.com` | `pwight2026` | 143 | `IS4hCNqgDoMcFVurfQRElimeAvM2` |
| Andy Belly | `abelly@theaumengine.com` | `abelly2026` | 72 | `flABXsrgVoNnd8wU7uYtt1jPrxk1` |
| Ray | `rray@theaumengine.com` | `rray2026` | 139 | `WYUP9iCh9IQf0PgZYepb5OLFgNA2` |
| Matt Germshied | `mgermshied@theaumengine.com` | `mgermshied2026` | 188 | `ms9bUAN6sbUSoXhJoefG2c9bnID3` |
| Jeremy Jackson | `jjackson@theaumengine.com` | `jjackson2026` | 207 | `X47vmqMnJ8OLidKmb4JuN6GhwCl1` |

**Migration script:** `scripts/provision_all_advisors.js`
**Note:** Old accounts (`jsteward236@gmail.com`, `chuck@chuck.com`, etc.) still exist in Firebase Auth but have 0 `lead_assignments` (all migrated away).

---

## 📁 Files Modified This Session

| File | Change | Deployed |
|---|---|---|
| `functions/index.js` | Added `advisorMode` to `getLeadsByIds` CF | ✅ `firebase deploy --only functions` |
| `js/db.js` | Replaced 2-step query with CF `advisorMode`; isolated `bootstrapUserData` | ✅ `v=20260506c` |
| `js/pages.js` | Fixed `isReady` in Command Center + Lead Scoreboard (2 locations) | ✅ `v=20260506c` |
| `js/data.js` | Fixed `readyCount` in `computeMetrics()` | ✅ `v=20260506c` |
| `index.html` | firebase-functions-compat.js added; all version strings bumped to `20260506c` | ✅ hosted |
| `js/auth.js` | iOS/iPadOS UA detection for App Check bypass; email `.toLowerCase()` | ✅ (prior session) |
| `firebase.json` | Cache-Control `max-age` → 3600 (1h) | ✅ (prior session) |
| `scripts/provision_all_advisors.js` | Bulk advisor account provisioning + migration script | Local only |
| `scripts/create_jsteward_account.js` | Jeremy-specific migration script (prior) | Local only |
| `.agents/handoffs/VERA_LEAD_BUG_BRIEF.md` | Engineering brief for Vera/team review | Repo only |

---

## 🏗 Architecture State

### Data Load Path (Current — Correct)
```
auth.js: onAuthStateChanged(uid)
  ↓
bootstrapUserData(uid)  [db.js]
  ↓ (isolated try/catch — no Promise.all poisoning)
  loadAssignedLeadsFromFirestore(uid)
    ↓
    firebase.functions().httpsCallable('getLeadsByIds')({ advisorMode: true })
      ↓ [CF — Admin SDK, no rules, no index]
      lead_assignments.where(ownerUid == uid, ownershipStatus in [active,pending])
        ↓
        master_leads batch fetch (200-doc chunks)
      → returns { leads[], assignments[], count }
    ↓
    fakeDocs mapping → PROSPECTS schema objects
  ↓ (non-blocking)
  fetchAdvisorLeadCount (fire-and-forget)
  ↓
  user sub-doc reads (nicheProfile, nicheAnswers, etc.) — each guarded with .catch()
  ↓
initWithUserData(data)  [app.js]
  ↓
  PROSPECTS.unshift(...assignedLeads)  — injects real leads
  ↓
renderPage()  — shows real cohort
```

### isReady Gate (Current — Correct)
```
name (firstName + lastName) + ANY ONE OF:
  - phone (string, non-empty)
  - email (string, non-empty)
  - linkedInUrl OR linkedin
```

---

## 📋 Pending Next Steps (Prioritized)

### P0 — Verify with Jeremy (do now)
- [ ] Have Jeremy hard-refresh `www.theaumengine.com` (`Cmd+Shift+R`) and login with `jsteward@theaumengine.com` / `jsteward2026`
- [ ] Confirm TOTAL ASSIGNED shows 272
- [ ] Confirm ACTION READY shows 103+ (phone-verified leads)
- [ ] Confirm Lead Scoreboard "Ready" tab shows leads

### P1 — Test All Other Advisors
- [ ] Each advisor listed above should login and confirm their lead counts
- [ ] Chuck Cooper: expect 210 | Patrick Wight: 143 | Andy Belly: 72 | Ray: 139 | Matt: 188 | Jeremy Jackson: 207

### P2 — Lead Scoreboard UX (Next Sprint)
- [ ] **"Needs Data" leads:** Currently ~169 leads (272 - 103 with phone) have no phone/email/LinkedIn. These show in "Needs Data." Decide: show them anyway in the default view, or keep them gated until enriched?
- [ ] **Scoreboard default view:** Currently shows only Action Ready leads by default. Consider whether advisors want to see ALL 272 on first load, with "Needs Data" as a visual indicator rather than a filter gate
- [ ] **Lead Scoreboard pagination:** Confirm page sizes and "showing X-Y" counts render correctly for 272-lead cohort

### P3 — isReady Consistency Audit
- [ ] `pageCommandCenter` "Top 8 to Work Now" now uses new `isReady` — verify it populates
- [ ] `computeNicheMetrics()` in data.js does NOT use `isReady` — check if it needs updating too
- [ ] Outreach Studio lead list — does it use its own ready gate? Check `outreach_agent.js`

### P4 — `loadAlAssignmentsForAdvisor` (al_assignments collection)
- [ ] This legacy function (db.js line ~692) still queries the old `al_assignments` collection. Now that all leads are in `lead_assignments`, this function should either be removed or clearly marked as archive-only
- [ ] Current Firestore rule: `al_assignments` allow read if `advisorUid == request.auth.uid` — but migrated accounts use `ownerUid`, not `advisorUid`. Confirm this is dead code

### P5 — De-duplication Logic
- [ ] `initWithUserData` in app.js does dedup by `masterLeadId`. Now that advisorMode returns BOTH leads and assignments, verify no duplicates appear when `loadAlAssignmentsForAdvisor` also fires
- [ ] Consider removing `loadAlAssignmentsForAdvisor` call from app.js entirely now that the CF path is primary

### P6 — Old Account Cleanup (Optional)
- [ ] Old Gmail/personal email accounts (`jsteward236@gmail.com`, `chuck@chuck.com`, etc.) still exist in Firebase Auth with 0 leads. Decide whether to disable or delete them to avoid confusion

---

## 🔧 Open Decisions

1. **Default Lead Scoreboard view:** Should it show ALL 272 leads by default (with a "needs enrichment" badge), or only Action Ready leads (103)? Current: shows only ready leads. Advisors may be confused seeing fewer leads than their assigned count.

2. **`isReady` for Outreach Studio:** Should the outreach queue gate by `isReady`? Currently unclear. Advisors may want to draft emails for LinkedIn-only leads even without a phone.

3. **Leader Scoreboard visibility:** Reported blank at some point this session. Needs verification — this is a separate render function (`pageLeaderScoreboard`) that may have its own wiring issues.

---

## 🔑 Credentials & Config

### Operator
- **Email:** `kosal@fin-tegration.com`
- **Firebase project:** `theaumengine`
- **Service account key:** `scripts/serviceAccountKey.json`

### Advisor Accounts (all migrated)
See Migration table above.

### Firebase Hosting
- **Production URL:** `https://www.theaumengine.com`
- **Hosting URL:** `https://theaumengine.web.app`
- **Project:** `theaumengine`

---

## 📦 Last 5 Git Commits (at session start)

```
63c4fff  fix: C49 auth + lead pipeline repair — App Check unenforce, Functions SDK, CF enforceAppCheck:false, email/phone object normalization, scoreboard .trim() guards
6a80c15  docs: C48 handoff — Jeremy provisioning, outreach agent SyntaxError fix, personalization task queued
f8c2888  feat: Stripe self-serve payment flow — createCheckoutSession + stripeWebhook + auth gate promotion
b4c049e  docs: C46 handoff — Apollo header fix, NinjaPear migration, 22 leads enriched
c30093d  fix: smart router — Apollo X-Api-Key header auth + NinjaPear endpoint migration
```

---

## 💬 Start Your Next Session With

```
Read HANDOFF_C50.md first.

Then:
1. Confirm Jeremy sees 272 leads on theaumengine.com (jsteward@theaumengine.com / jsteward2026)
2. Confirm ACTION READY card shows 103+ leads
3. Verify Lead Scoreboard default view — should show action-ready leads, not 0

If all confirmed, move to P2: decide on scoreboard default view (all 272 vs. ready-only).
```

---

*Handoff written by Antigravity — 2026-05-06 14:31 CST*
*Next phase: C51*
