# AUM Engine — Phase C8 Handoff
**Date:** 2026-04-12  
**Repo:** `kprum1/theaumengine` (Firebase Hosting + Firestore)  
**Live URL:** https://theaumengine.web.app  
**Operator:** kosal@fin-tegration.com

---

## ⚠️ RESUME INSTRUCTIONS
1. Read this file first before touching any code.
2. The routing engine is now **live and processing leads** — `processRoutingQueue` fires every 5 min automatically.
3. **One outstanding niche gap**: 30 `yacht-owners` leads in `routing_queue` are not being assigned because no advisor has `yacht-owners` in their `nicheIds`. This is the single most important next fix.
4. Cloud Functions are on **Node.js 22 (2nd Gen)**.
5. Run `node scripts/audit_leads.js` from project root at any time for a live health snapshot.
6. Firebase CLI is at `/usr/local/bin/firebase`.

---

## 1. WHAT WAS BUILT THIS SESSION (Phase C8)

### 1A. Security Sentinel Module — Sprint 1 Complete ✅
**Status: Live. Feature-flagged. `sentinel_enabled: true` in Firestore.**

| File | Change |
|---|---|
| `js/sentinel.js` | Full module — config loader, risk scoring, tabs, kill switch, **description banner** |
| `js/pages.js` | `pageSentinelDashboard()` wrapper appended |
| `js/app.js` | `security-sentinel` in pageMap + `loadSentinelConfig()` post-login |
| `js/auth.js` | Sentinel nav reveal block (1500ms timeout) |
| `index.html` | Nav item + sentinel.js script tag (v=20260410e) |
| `firestore.rules` | `sentinel_*` collections: read if authenticated |

**Firestore (17 docs):**
- `sentinel_config/default` — `sentinel_enabled: true`, `sentinel_kill_switch: false`
- `sentinel_orgs/org_theaumengine_internal` — score: 66 / Elevated
- `sentinel_assets/` (5), `sentinel_findings/` (5), `sentinel_tasks/` (3)

**Dashboard shows:** Score 66/Elevated, 5 findings (1 HIGH/2 MEDIUM/2 LOW), 3 tasks.  
**Mythos teaser:** "soon to be powered by Mythos" badge in info banner.

---

### 1B. Leads Engine — Sprint 1 Complete ✅
**Fixes deployed to `v=20260410f`:**

| File | Fix |
|---|---|
| `js/db.js` | Location fallback chain: `city\|\|homeCity\|\|prospect_city`, `state\|\|homeState\|\|prospect_state` — fixes "undefined, undefined" display bug |
| `js/app.js` | Status write-back now routes correctly: `_fromAlAssignment` → `al_assignments` only; legacy → `lead_assignments` only |
| `firestore.rules` | Added `advisor_settings/{uid}` self-read/write (booking link cross-device sync) |
| `scripts/patch_al_location.js` | Idempotent backfill (confirmed all 30 docs already had city/state) |

**All 5 pilot advisors provisioned** (Patrick, Matt, Chuck, Ray, Andy) — `advisor_pool` + `pilot_advisors` + `advisorProfile` all written.

---

### 1C. Leads Engine — Sprint 2 Complete ✅
**Root cause of routing failures fixed:**

| File | Fix |
|---|---|
| `functions/index.js` → `runEligibility()` | **Replaced broken `collectionGroup('data')` query** (was throwing `FAILED_PRECONDITION` on every lead) with flat `advisor_pool` read — fully indexed, no extra index required |
| `functions/index.js` → `runEligibility()` | Added **niche gate** (Gate 1): `lead.nicheId` must be in `advisor.nicheIds[]` |
| `functions/index.js` → `runEligibility()` | **Combined cap check**: now counts both `lead_assignments` + `al_assignments` — advisors can't be overloaded from batch track |
| `functions/index.js` → `scoreNicheMatch()` | **Replaced `return 0.7` placeholder** with real nicheId matching: 1.0 exact / 0.1 no match / 0.5 unknown |

**Scripts added:**

| Script | Purpose |
|---|---|
| `scripts/requeue_failed.js` | Reset 4 failed routing_queue items → pending (ran, confirmed Sandra Okafor and others re-queued) |
| `scripts/migrate_masterleads.js` | Migrate `masterLeads` camelCase → `master_leads` snake_case + add routing_queue entries |
| `scripts/audit_leads.js` | Full leads engine health audit — run any time |

**Migration result:** 30 new leads migrated from `masterLeads` → `master_leads`, 15 skipped (already existed), 30 added to `routing_queue`.

**First successful routing after Sprint 2:** Sandra Okafor (`business-owners`) → Cooper Capital Group ✅

---

## 2. CURRENT SYSTEM STATE

### Collections (as of 2026-04-12 ~5pm CT)

| Collection | Count | Notes |
|---|---|---|
| `al_assignments` | 30 | Ray: 14, Matt: 16. All status: New. All have city/state ✅ |
| `lead_assignments` | 15 | Legacy CF track. All active. |
| `master_leads` | ~46 | Snake_case CF schema. |
| `masterLeads` | 45 | Still exists — do NOT delete yet; migration idempotent |
| `routing_queue` | ~53 | 34 pending (mostly yacht-owners w/ no match), some assigned |
| `advisor_pool` | 5 | All `eligibleForRouting: true` |
| `pilot_advisors` | 5 | Chuck, Patrick, Andy, Ray, Matt |

### routing_queue Health
- ✅ No `failed` items (4 re-queued, `_schema` garbage doc skipped)
- ⚠️ **~30 `yacht-owners` leads have NO advisor match** — no advisor has `yacht-owners` in their `nicheIds[]`

---

## 3. NEXT STEPS (Prioritized)

### 🔴 P0 — Add `yacht-owners` niche to at least one advisor
**This unblocks routing of 30 leads immediately.**

The 30 Yacht Owner leads that Ray and Matt already have in `al_assignments` were assigned by the batch script (`route_batch.js`) bypassing the routing engine. The 30 new ones in `routing_queue` will sit there forever until an advisor in `advisor_pool` has `yacht-owners` in their `nicheIds`.

**Fix:** Update `advisor_pool` docs for Matt and/or Andy to add `yacht-owners`:
```bash
node -e "
const a=require('firebase-admin');
a.initializeApp({credential:a.credential.cert(require('./scripts/serviceAccountKey.json'))});
// Andy Belly (aircraft + business owners → add yacht)
a.firestore().collection('advisor_pool').doc('NzC6fh3sXKVuDmgfPAaaEea3Ovm2').update({
  nicheIds: ['aircraft-owners','business-owners','yacht-owners']
});
// Matt Germshied (already serving yacht owners via batch)
a.firestore().collection('advisor_pool').doc('yzTL1YHadINFrMwxCMrrh0fbhZp2').update({
  nicheIds: ['business-owners','aircraft-owners','yacht-owners']
}).then(()=>{ console.log('done'); process.exit(0); });
"
```
Then run: `node scripts/trigger_routing.js`

### 🟡 P1 — Add `real-estate-investors` niche coverage
Two failed items were `nicheId: real-estate-investors` — no advisor covers this niche. Either add to an advisor or log these as out-of-scope.

### 🟡 P1 — Verify routing engine correctly assigns new leads end-to-end
After fixing the niche gap, run `node scripts/audit_leads.js` and confirm:
- `routing_queue` pending count drops
- `lead_assignments` or `al_assignments` count increases
- Advisor cockpit shows new leads after login

### 🟠 P2 — Decide: retire `masterLeads` collection
Once confirmed all leads are migrated (idempotencyKey dedup ensures no duplicates), the `masterLeads` camelCase collection can be archived. Don't delete — just stop writing to it.

### 🟢 P3 — Add `routing_policies/default_v1` doc to Firestore
The scoring weights fall back to hardcoded defaults if this doc doesn't exist. Seed it so weights are tunable from console:
```json
{ "nicheMatch": 0.40, "geographyMatch": 0.20, "aumBandMatch": 0.20, "capacityHeadroom": 0.10, "fairness": 0.10 }
```

---

## 4. PILOT ADVISOR CREDENTIALS

| Name | Email | Password | Niches | UID |
|---|---|---|---|---|
| Patrick Wight | patrick@patrick.com | AUM2026! | business-owners, physicians | `Iqo8zz5g…` |
| Matt Germshied | matt@matt.com | AUM2026! | business-owners, aircraft-owners | `yzTL1YHa…` |
| Chuck Cooper | chuck@chuck.com | AUM2026! | ai-displaced-executives, business-owners | `BQhiSqKW…` |
| Ray Uncle | ray@ray.com | AUM2026! | physicians, charity-board-members | `Zd4H7gaN…` |
| Andy Belly | andy@andy.com | AUM2026! | aircraft-owners, business-owners | `NzC6fh3s…` |

**Operator:** kosal@fin-tegration.com / AUM2026!

---

## 5. LAST 5 GIT COMMITS

```
4342f3f chore: add audit_leads.js, requeue_failed.js, migrate_masterleads.js scripts to repo
4803e40 fix(routing): Sprint 2 — eligibility, niche scoring, lead cap, migration scripts
ad525bd fix(leads-engine): Sprint 1 — location, status write-back, advisor_settings rules
8e74e07 fix(sentinel): add padding-right to 'What it does' column to align with Mythos badge
8ca011e feat(sentinel): add description banner + Mythos teaser
```

---

## 6. VERSION STRINGS (index.html)

| File | Version |
|---|---|
| `db.js` | v=20260410f |
| `app.js` | v=20260410f |
| `auth.js` | v=20260410c |
| `pages.js` | v=20260410c |
| `sentinel.js` | v=20260410e |

---

## 7. OPEN ARCHITECTURAL DECISIONS

| # | Decision | Status |
|---|---|---|
| A | Standardize on `al_assignments` OR `lead_assignments` as the single truth? | ⏳ Deferred — both coexist safely, Sprint 3 decision |
| B | Remove orphaned materialized view write in `finalizeAssignment()` (writes `users/{uid}/data/ap_{id}` that nobody reads)? | ⏳ Low urgency — cleanup Sprint 3 |
| C | `masterLeads` retirement — safe to delete after confirming all 45 migrated? | ⏳ Confirm via audit first |

---

**START YOUR NEXT SESSION WITH:**
> "Read HANDOFF_C8.md first. The top priority is adding `yacht-owners` to Andy Belly's and Matt Germshied's advisor_pool nicheIds so the routing engine can assign the 30 queued yacht-owner leads."
