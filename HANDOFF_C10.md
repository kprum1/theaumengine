# AUM Engine — Phase C10 Handoff
**Date:** 2026-04-12  
**Session:** C10 — Pilot Hardening (Cap Policy, Governance UI, Soft-Cap Routing)  
**Repo:** `kprum1/theaumengine`  
**Live URL:** https://theaumengine.web.app  
**Operator login:** kosal@fin-tegration.com / AUM2026!  
**Firebase project:** `theaumengine`  
**Firebase CLI:** `/usr/local/bin/firebase`  
**Node:** `/opt/homebrew/bin/node` (v25.5.0)

---

## ⚠️ RESUME INSTRUCTIONS — READ FIRST
1. Run `node scripts/audit_leads.js` from the project root. Must return **9/9 🟢 All systems go** before touching anything.
2. Use `export PATH="/opt/homebrew/bin:$PATH"` before running any node command — `node` is not on the default shell PATH.
3. The routing engine (`processRoutingQueue`) fires automatically every 5 minutes via Cloud Scheduler — do **not** trigger manually unless you're testing a specific lead batch.
4. All 5 Cloud Functions are deployed on **Node.js 22 (2nd Gen)**.
5. The `serviceAccountKey.json` lives in `scripts/` — never commit this file.

---

## 1. WHAT WAS ACCOMPLISHED THIS SESSION (Phase C10)

### 1A. Matt Germshied Cap Raised ✅
**Problem:** Matt was at 30/25 (soft cap overflow) since the C9 session.  
**Fix:** Ran `scripts/patch_matt_cap.js` — updated `advisor_pool` doc for Matt:
- `activeLeadCap`: `25 → 35`
- `capPolicy`: `soft` (preserved)
- `capWarningPct`: `90` (preserved)
- `capRaisedAt` + `capRaisedNote` fields written for audit trail

**Matt is now `30/35` — 5 headroom, no overflow warning.**

**Script:** `scripts/patch_matt_cap.js` (idempotent, safe to re-run)  
**Commit:** `bb43921`

---

### 1B. Governance Flags UI Card — `⚠️ SLA Alerts` ✅
**Added** a new `⚠️ SLA Alerts` card to the Admin Dashboard (`js/admin.js` v=20260412b).

**Features:**
- Reads `governance_flags` collection, filtered to `resolvedAt == null` (active breaches only)
- Renders a table: Advisor name, Collection badge (`al_assign` / `lead_assign`), Flag ID, Reason, Assigned age, Flagged age
- Clean empty state when zero active breaches
- Idempotent `↻ Refresh` button clears `_govFlagsCache` and re-fetches
- Wired into `renderAdminDashboard()` parallel load block alongside funnel, outcomes, master leads

**Implementation details:**
- `renderGovernanceFlags(forceRefresh = false)` function in `admin.js`
- `_govFlagsCache` module-level cache — same pattern as `_masterLeadsCache`
- Advisor name resolved from `operator_presence` collection (same as other panels)
- Firestore rule for `governance_flags` was already operator-only read (set in C9)

**Current state:** 0 active flags (leads were just assigned — no SLA breaches yet).

**Commit:** `bb43921`

---

### 1C. Collection Duality — Decision Made ✅
**Decision:** Standardize on **`lead_assignments`** as the canonical collection going forward.

- `lead_assignments` — written by Cloud Function router (`finalizeAssignment`) — **canonical, keep**
- `al_assignments` — written by batch script (`route_batch.js`) for the pre-CF pilot leads — **frozen, read-only**

**Sprint 4 migration plan (deferred):**
1. Migrate the 30 existing `al_assignments` docs → `lead_assignments` (with same schema)
2. Update `db.js` write paths: `updateAlAssignmentStatus()` and `persistReplyOutcome()` → point to `lead_assignments`
3. Update `loadAlAssignmentsForAdvisor()` in `db.js` → become a single `lead_assignments` query
4. Update `runGovernance` Track 2 → collapse into Track 1
5. Update `audit_leads.js` → single-collection table
6. Update `route_batch.js` → write to `lead_assignments` instead of `al_assignments`
7. Drop `al_assignments` Firestore rules after migration verified

**Not blocked — both tracks work correctly today. No user impact until Sprint 4.**

**Commit:** `bb43921` (decision in commit message)

---

### 1D. `capPolicy: soft` Enforcement in `runEligibility()` ✅
**Problem:** `capPolicy: 'soft'` field existed on Ray Uncle's and Matt Germshied's `advisor_pool` docs but `runEligibility()` still did a hard `>=` cap check — soft cap had no effect.

**Fix:** Updated Gate 3 in `runEligibility()` (`functions/index.js`):

```
Before: if (totalActive >= cap) → skip (always hard block)
After:
  effectiveCap = capPolicy === 'soft' ? cap + 1 : cap
  if (totalActive >= effectiveCap) → skip
  if (soft AND totalActive >= cap) → log cap_overflow_warning + continue
```

**Behavior:**
- `capPolicy: 'hard'` (default) → strict block at `>= cap` (unchanged)
- `capPolicy: 'soft'` → allows exactly 1 overflow slot; logs `cap_overflow_warning` event to `routing_logs` with firmName, totalActive, cap, capPolicy
- `capWarningPct` field exists on docs but is not yet read by routing engine — reserved for Phase C11 governance reporting

**All 5 Cloud Functions redeployed after this change.**  
**Commit:** `bb43921`

---

## 2. CURRENT SYSTEM STATE (as of 2026-04-12 ~7:47pm CT)

### 2A. Firestore Collections
| Collection | Count | Status |
|---|---|---|
| `master_leads` | 46 | ✅ Canonical snake_case. All leads have city/state. |
| `masterLeads` | 0 | ✅ Archived — fully empty |
| `al_assignments` | 30 | ✅ Ray: 14, Matt: 16. All `status: New`. FROZEN (read-only going forward). |
| `lead_assignments` | 47 | ✅ Active. Chuck: 5, Patrick: 7, Andy: 14, Ray: 6, Matt: 14 |
| `routing_queue` | 45 | ✅ All `status: assigned`. Zero pending/failed. |
| `advisor_pool` | 5 | ✅ All `eligibleForRouting: true`. All national. |
| `pilot_advisors` | 5 | ✅ Chuck, Patrick, Andy, Ray, Matt |
| `routing_policies` | 1 | ✅ `default_v1` live — weights tunable via console |
| `governance_flags` | 0 | ✅ Empty — no SLA breaches yet |
| `sentinel_config` | 1 | ✅ `sentinel_enabled: true` |

### 2B. Advisor Capacity
| Advisor | Firm | Total | Cap | Headroom | Policy |
|---|---|---|---|---|---|
| Matt Germshied | Germshied Wealth Management | **30** | **35** | 5 | soft |
| Ray Uncle | Ray Financial Advisors | **20** | 30 | 10 | soft |
| Andy Belly | Duelly Outdoors / Belly Wealth | **14** | 20 | 6 | hard |
| Patrick Wight | Wight Financial | **7** | 25 | 18 | hard |
| Chuck Cooper | Cooper Capital Group | **5** | 30 | 25 | hard |

### 2C. Niche Coverage Matrix
| Advisor | Niches |
|---|---|
| Chuck Cooper | ai-displaced-executives, business-owners, real-estate-developers, real-estate-investors |
| Patrick Wight | business-owners, physicians, yacht-owners |
| Andy Belly | aircraft-owners, business-owners, yacht-owners, real-estate-developers, real-estate-investors |
| Ray Uncle | physicians, charity-board-members, yacht-owners |
| Matt Germshied | business-owners, aircraft-owners, yacht-owners |

### 2D. Cloud Functions (all Node.js 22 / 2nd Gen)
| Function | Trigger | Status |
|---|---|---|
| `onLeadIngested` | HTTP POST | ✅ Live |
| `processRoutingQueue` | Every 5 min | ✅ Live — soft-cap enforcement active |
| `runGovernance` | Every 24 hours | ✅ Live — audits BOTH collections |
| `alfredIngest` | HTTP POST | ✅ Live |
| `sendDailyDigest` | 7am CT daily | ✅ Live |

### 2E. Version Strings (index.html)
| File | Version |
|---|---|
| `admin.js` | v=20260412b |
| `db.js` | v=20260410f |
| `app.js` | v=20260410f |
| `auth.js` | v=20260410c |
| `pages.js` | v=20260410c |
| `sentinel.js` | v=20260410e |

---

## 3. GIT LOG (last 7 commits)
```
bb43921 fix(c9+1): Matt cap→35, governance_flags UI card, soft-cap enforcement in runEligibility
f83e3e2 docs: Phase C9 handoff — full session summary
70f0cdb fix(p2): duplicate dedup, governance both-track SLA audit, Firestore rules
10ac9d7 fix(p1): routing_policies Firestore + remove orphaned materialised view
77c643b fix(routing): expand advisor licensed states to national + real-estate niches + requeue 10 failed items
7700a04 feat(admin): Master Leads Pool panel + routing engine niche fix
16fb0cc docs: session handoff C8 — leads engine Sprint 1+2, routing engine fixed
```

---

## 4. PILOT ADVISOR CREDENTIALS
| Name | Email | Password | UID | Cap | Current |
|---|---|---|---|---|---|
| Patrick Wight | patrick@patrick.com | AUM2026! | `Iqo8zz5g…` | 25 | 7 |
| Matt Germshied | matt@matt.com | AUM2026! | `yzTL1YHa…` | **35** | 30 |
| Chuck Cooper | chuck@chuck.com | AUM2026! | `BQhiSqKW…` | 30 | 5 |
| Ray Uncle | ray@ray.com | AUM2026! | `Zd4H7gaN…` | 30 | 20 |
| Andy Belly | andy@andy.com | AUM2026! | `NzC6fh3s…` | 20 | 14 |

**Operator:** kosal@fin-tegration.com / AUM2026!

---

## 5. SCRIPTS REFERENCE
All scripts in `scripts/` — require `serviceAccountKey.json` in same directory.

| Script | Usage | What it does |
|---|---|---|
| `audit_leads.js` | `node scripts/audit_leads.js` | Full health audit — run first every session |
| `patch_matt_cap.js` | `node scripts/patch_matt_cap.js` | One-off: raised Matt cap 25→35. Idempotent, safe to re-run. |
| `trigger_routing.js` | `node scripts/trigger_routing.js` | Manually process all `pending` routing_queue items |
| `route_batch.js` | `node scripts/route_batch.js --batch=TIMESTAMP [--dry-run]` | Route a specific batch of leads from `master_leads` |
| `requeue_failed.js` | `node scripts/requeue_failed.js` | Reset `failed` routing_queue items → `pending` |
| `provision_pilot_advisors.js` | `node scripts/provision_pilot_advisors.js` | Provision / re-provision all 5 pilot advisors |

---

## 6. KNOWN LIMITATIONS & OPEN DECISIONS

| # | Item | Status | Notes |
|---|---|---|---|
| A | **Collection duality: `al_assignments` vs `lead_assignments`** | 🟡 Sprint 4 | Decision made: standardize on `lead_assignments`. Migration plan in §1C. Estimate ~4 hours of careful work. |
| B | **`capWarningPct` field not yet read by routing engine** | 🟢 Low priority | Field exists on Ray and Matt's `advisor_pool` docs. Future: `runGovernance` should flag advisor when `totalActive / cap >= capWarningPct`. |
| C | **`governance_flags` resolve mechanism** | 🟢 Low priority | Flags are written with `resolvedAt: null`. Currently must be resolved manually in Firestore console. Future: add "Mark Resolved" button in SLA Alerts card. |
| D | **`al_assignments` composite index** | 🟢 Low priority | `.where('advisorUid','==',uid).orderBy('createdAt','desc')` will need a Firestore index as dataset grows. Add to `firestore.indexes.json` before scaling beyond ~50 leads/advisor. |
| E | **`governance_flags` SLA breaches — 0 today** | ✅ Healthy | Leads were just assigned. First potential breaches appear after 7 days if advisors don't work leads. Watch after 2026-04-19. |

---

## 7. NEXT SESSION — RECOMMENDED PRIORITIES

```
Priority order for next session (Phase C11):

1. [SPRINT 4] Unify collections: migrate al_assignments → lead_assignments
   - Write migration script: scripts/migrate_al_to_lead_assignments.js
   - Update db.js write paths (updateAlAssignmentStatus, persistReplyOutcome)
   - Update loadAlAssignmentsForAdvisor → single lead_assignments query
   - Update runGovernance → collapse to single track
   - Verify audit + dashboard still show correct counts
   - Drop al_assignments Firestore rules

2. [GOVERNANCE] Add "Mark Resolved" button to ⚠️ SLA Alerts card
   - Writes resolvedAt + resolution fields to governance_flags doc
   - Removes item from active breach table

3. [GOVERNANCE] Wire capWarningPct into runGovernance
   - Flag advisor when totalActive / cap >= capWarningPct (default 90%)
   - Write governance_flags doc with reason: 'approaching_cap'
   - Surface in SLA Alerts card with different badge color

4. [INFRA] Add firestore.indexes.json for al_assignments composite index
   - advisorUid + createdAt desc
```

**Start your next session with:**
> "Read HANDOFF_C10.md. Audit first. Then begin Sprint 4 collection unification — migrate al_assignments into lead_assignments."

---

## 8. ARCHITECTURE DIAGRAM (Current State)

```
New Lead Source (Alfred CSV / USCG scrape / manual)
  ↓
scripts/approve_and_ingest.js  OR  alfredIngest Cloud Function
  → validate schema
  → write to master_leads/{autoId}   ← snake_case, canonical
  → write to routing_queue/{autoId}  ← status: 'pending'
  ↓
processRoutingQueue (Cloud Function — fires every 5 min)
  → for each pending item:
      Gate 1: licensedStates includes lead.state  (all advisors = National ✅)
      Gate 2: nicheIds includes lead.nicheId      (real niche matching ✅)
      Gate 3: totalActive (al + lead) < effectiveCap
              capPolicy='soft' → effectiveCap = cap+1 (1 overflow allowed) ✅
              capPolicy='hard' → effectiveCap = cap (strict) ✅
      Gate 4: AUM band match (soft)
  → runScoring() — reads weights from routing_policies/default_v1
      nicheMatch (40%) + geoMatch (20%) + aumBand (20%) + capacity (10%) + fairness (10%)
  → finalizeAssignment()
      batch write 1: lead_assignments/{id}  ← ownership record
      batch write 2: routing_queue/{id}     ← status: assigned
      batch write 3: master_leads/{id}      ← ownershipStatus: assigned
  ↓
runGovernance (Cloud Function — fires every 24 hours)
  → reads slaWindowDays from routing_policies/default_v1 (7 days)
  → audits lead_assignments WHERE slaDeadline < now
  → audits al_assignments WHERE age > slaWindowDays
  → writes governance_flags/{id} per breach (idempotent)
  ↓
Advisor login — bootstrapUserData() + loadAlAssignmentsForAdvisor()
  → reads lead_assignments (Track A: CF routing)
  → reads al_assignments (Track B: batch routing — FROZEN)
  → merged into PROSPECTS[] in browser
  ↓
Admin Dashboard (operator login only)
  → Live Sessions panel        (operator_presence)
  → Pilot Funnel panel         (funnel_events + al_assignments)
  → Master Leads Pool panel    (master_leads + lead_assignments)
  → ⚠️ SLA Alerts panel [NEW]  (governance_flags where resolvedAt==null)
  → Outreach Outcomes panel    (outreach_outcomes)
```
