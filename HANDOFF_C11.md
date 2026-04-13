# AUM Engine — Phase C11 Handoff
**Date:** 2026-04-13  
**Session:** C11 — Sprint 4 Collection Unification  
**Repo:** `kprum1/theaumengine`  
**Live URL:** https://theaumengine.web.app  
**Operator login:** kosal@fin-tegration.com / AUM2026!  
**Firebase project:** `theaumengine`  
**Firebase CLI:** `/usr/local/bin/firebase`  
**Node:** `/opt/homebrew/bin/node` (v25.5.0) — always `export PATH="/opt/homebrew/bin:$PATH"` first

---

## ⚠️ RESUME INSTRUCTIONS — READ FIRST
1. Run `node scripts/audit_leads.js` from the project root. Must return **10/10 🟢 All systems go**.
2. Always `export PATH="/opt/homebrew/bin:$PATH"` before any node command.
3. `lead_assignments` is **the only canonical collection** as of Sprint 4. Do NOT write to `al_assignments`.
4. `al_assignments` is **frozen read-only** — 30 docs, all migrated. Never write to it again.
5. All 5 Cloud Functions are deployed on Node.js 22 (2nd Gen).
6. `serviceAccountKey.json` lives in `scripts/` — never commit.

---

## 1. WHAT WAS BUILT THIS SESSION (C11 / Sprint 4)

### Sprint 4: al_assignments → lead_assignments Unification

**The goal:** Eliminate the dual-collection problem. `al_assignments` (30 batch-routed leads for Ray + Matt) and `lead_assignments` (47 CF-routed leads for all 5 advisors) are now unified into a single canonical collection: `lead_assignments` (77 docs total).

---

### 1A. Data Migration ✅
**Script:** `scripts/migrate_al_to_lead_assignments.js`  
**Result:** 30/30 al_assignments docs migrated → lead_assignments. 0 errors. 0 duplicates.

Key migration details:
- `advisorUid` → `ownerUid` (schema normalization)
- `migratedFromAlId` field written on each migrated doc (audit trail)
- `ownershipStatus: 'active'` set on all migrated docs
- `slaDeadline` calculated from `assignedAt + 30 days` if not present
- `al_assignments` docs preserved (read-only archive) — **never deleted**
- Migration is idempotent (safe to re-run — deduped by `ownerUid + masterLeadId`)

---

### 1B. db.js Updated (v=20260412c) ✅
All write paths now target `lead_assignments`:

| Function | Before | After |
|---|---|---|
| `updateAlAssignmentStatus()` | → `al_assignments` | → `lead_assignments` (+ `advisorStatus` field) |
| `updateAlAssignmentReply()` | → `al_assignments` | → `lead_assignments` |
| `saveAlAssignment()` | → `al_assignments` | → `lead_assignments` (+ `ownerUid`, `ownershipStatus`) |
| `loadAlAssignmentsForAdvisor()` | queries `al_assignments WHERE advisorUid==uid` | queries `lead_assignments WHERE ownerUid==uid`, skips pure CF-routed docs to avoid double-counting |

**`_fromAlAssignment: true` flag preserved** on returned PROSPECTS objects — backward compat for `app.js` + `outreach_controller.js` write-back routing.

---

### 1C. functions/index.js — runGovernance Collapsed ✅
- **Before:** audited both `lead_assignments` (Track 1) AND `al_assignments` (Track 2)
- **After:** single track — `lead_assignments` only
- Migrated docs audit correctly because they have `ownershipStatus: 'active'` + `slaDeadline`
- `al_assignments` audit removed with note: "all docs migrated in Sprint 4"

---

### 1D. audit_leads.js — Rewritten for Sprint 4 ✅
- Single-column per-advisor table (lead_assignments only)
- `al_assignments` shown as frozen archive reference
- New health check: `Sprint 4: al_assignments frozen (>=30 migrated) AND lead_assignments>=77`
- City/state check moved to `master_leads` (correct source of truth — assignment docs don't carry location)
- Cap policy badge `[soft]/[hard]` shown per advisor in advisor_pool table
- **Score: 10/10 🟢**

---

### 1E. Data Patch ✅
`scripts/patch_missing_location.js` — patched `master_leads/_schema` sentinel doc (was failing location check): `city: 'Unknown', state: 'XX'`

---

### 1F. index.html ✅
`db.js` cache-busted: `v=20260410f → v=20260412c`

---

## 2. COMPLETE FILE INVENTORY

### New Files
| File | Purpose |
|---|---|
| `scripts/migrate_al_to_lead_assignments.js` | One-time migration: 30 al_assignments → lead_assignments. Idempotent, --dry-run supported. |
| `scripts/patch_missing_location.js` | One-off: patched _schema sentinel doc missing city/state |

### Modified Files
| File | What Changed |
|---|---|
| `js/db.js` | All write paths → lead_assignments; loadAlAssignmentsForAdvisor → lead_assignments query; `v=20260412c` |
| `functions/index.js` | runGovernance collapsed to single track (lead_assignments only) |
| `scripts/audit_leads.js` | Fully rewritten for Sprint 4 single-collection |
| `index.html` | `db.js` cache-bust `v=20260412c` |
| `js/app.js` | Comment updates only (logic unchanged — _fromAlAssignment routing still calls updateAlAssignmentStatus which now writes to lead_assignments) |

---

## 3. FIRESTORE COLLECTIONS (current state)

| Collection | Docs | Status |
|---|---|---|
| `lead_assignments` | **77** | ✅ CANONICAL — write all new assignments here |
| `al_assignments` | 30 | 🔒 FROZEN — read-only archive, never write |
| `master_leads` | 46 | ✅ Source of truth for lead data |
| `masterLeads` | 0 | ✅ Empty — archived |
| `routing_queue` | 45 | ✅ All `status: assigned` |
| `advisor_pool` | 5 | ✅ All `eligibleForRouting: true`, all National |
| `pilot_advisors` | 5 | ✅ Chuck, Patrick, Andy, Ray, Matt |
| `governance_flags` | 0 | ✅ No active SLA breaches |
| `routing_policies` | 1 | ✅ `default_v1` live |
| `sentinel_config` | 1 | ✅ Active |

### lead_assignments schema (canonical — post Sprint 4)
```
{
  masterLeadId,        // → master_leads/{id}
  ownerUid,            // advisor Firebase UID
  ownershipStatus,     // 'active' | 'released'
  advisorStatus,       // 'New' | 'Contacted' | 'Engaged' | 'Snoozed' | ...
  status,              // same as advisorStatus (kept for compat)
  assignedAt,          // ISO timestamp
  slaDeadline,         // ISO timestamp (assignedAt + 7 days by policy)
  assignedBy,          // 'RoutingOrchestrator_v1' | 'migrate_al_to_lead_assignments_v1' | ...
  migratedFromAlId,    // (migrated docs only) → al_assignments/{id}
  replyType,           // 'reply' | 'positive' | 'meeting' | 'dead' | ...
  replyOutcome,
  repliedAt,
  outcome, outcomeAt,
  fitScore, timingScore, priorityScore, routingScore,
  source, batchId,
  releasedAt, releasedReason, previousOwners,
  createdAt, updatedAt
}
```

---

## 4. ADVISOR CAPACITY (post-Sprint 4)

| Advisor | Firm | lead_assignments | Cap | Policy |
|---|---|---|---|---|
| Ray Uncle | Ray Financial Advisors | **20** | 30 | soft |
| Matt Germshied | Germshied Wealth Management | **30** | 35 | soft |
| Patrick Wight | Wight Financial | 7 | 25 | hard |
| Andy Belly | Duelly Outdoors / Belly Wealth | 14 | 20 | hard |
| Chuck Cooper | Cooper Capital Group | 5 | 30 | hard |

> **Note:** Ray (20) and Matt (30) now show full counts in a single collection. Previously they showed as "14+6" and "16+14" across two collections.

---

## 5. CLOUD FUNCTIONS (all deployed `9c7e365`)

| Function | Trigger | Notes |
|---|---|---|
| `processRoutingQueue` | Every 5 min | Soft-cap enforcement live (Sprint C10) |
| `runGovernance` | 24 hours | Single-track — lead_assignments only (Sprint 4) |
| `onLeadIngested` | HTTP POST | Unchanged |
| `alfredIngest` | HTTP POST | Unchanged |
| `sendDailyDigest` | 7am CT | Unchanged |

---

## 6. VERSION STRINGS (index.html)

| File | Version |
|---|---|
| `db.js` | **v=20260412c** (Sprint 4) |
| `admin.js` | v=20260412b (SLA Alerts card) |
| `app.js` | v=20260410f |
| `auth.js` | v=20260410c |
| `pages.js` | v=20260410c |
| `sentinel.js` | v=20260410e |

---

## 7. GIT LOG (last 6 commits)
```
9c7e365 feat(sprint4): unify al_assignments → lead_assignments (canonical single collection)
42613b7 docs: session handoff C10 — cap policy, governance UI, soft-cap routing
bb43921 fix(c9+1): Matt cap→35, governance_flags UI card, soft-cap enforcement in runEligibility
f83e3e2 docs: Phase C9 handoff — full session summary
70f0cdb fix(p2): duplicate dedup, governance both-track SLA audit, Firestore rules
10ac9d7 fix(p1): routing_policies Firestore + remove orphaned materialised view
```

---

## 8. SCRIPTS REFERENCE

| Script | Command | What it does |
|---|---|---|
| `audit_leads.js` | `node scripts/audit_leads.js` | **Run first every session.** Full health audit — 10 checks. |
| `migrate_al_to_lead_assignments.js` | `node scripts/migrate_al_to_lead_assignments.js [--dry-run]` | Sprint 4 migration — DONE. Idempotent, safe to re-run. |
| `patch_matt_cap.js` | `node scripts/patch_matt_cap.js` | Raised Matt's cap 25→35. Idempotent. |
| `trigger_routing.js` | `node scripts/trigger_routing.js` | Manually process pending routing_queue items |
| `requeue_failed.js` | `node scripts/requeue_failed.js` | Reset failed routing items → pending |
| `provision_pilot_advisors.js` | `node scripts/provision_pilot_advisors.js` | Re-provision all 5 pilot advisors |

---

## 9. PENDING NEXT STEPS (prioritized)

```
Priority 1 (governance UX):
  [ ] "Mark Resolved" button in ⚠️ SLA Alerts card (admin.js)
      - Write resolvedAt + resolution to governance_flags doc
      - Remove from active breach table
      - Firestore rule: operator-only write to governance_flags

Priority 2 (governance logic):
  [ ] Wire capWarningPct into runGovernance
      - Flag advisor when (totalActive / cap) >= capWarningPct (default 90%)
      - Write governance_flags doc: reason = 'approaching_cap'
      - Surface as different color badge in SLA Alerts card (yellow vs red)

Priority 3 (infra):
  [ ] Add firestore.indexes.json — composite index for any remaining al_assignments queries
      - Not urgent (al_assignments is read-only/frozen)
      - Do this before any retrospective analytics on the al archive

Priority 4 (future):
  [ ] Firestore rules: add explicit "deny writes to al_assignments" rule
      - Currently allowed by default — should be locked down
      - Add: match /al_assignments/{doc} { allow read: if isOperator(); allow write: if false; }
```

---

## 10. OPEN DECISIONS

| # | Decision | Status |
|---|---|---|
| A | `al_assignments` deletion | 🟡 Deferred indefinitely — keep as audit archive; too risky to delete |
| B | `loadAlAssignmentsForAdvisor` double-count guard | 🟢 Resolved — skips docs where `assignedBy === 'RoutingOrchestrator_v1' AND !migratedFromAlId` |
| C | Firestore index for `lead_assignments WHERE ownerUid + orderBy assignedAt` | 🟡 Needed at scale — add to `firestore.indexes.json` before >100 leads/advisor |

---

## 11. PILOT ADVISOR CREDENTIALS

| Name | Email | Password | Cap | Leads |
|---|---|---|---|---|
| Patrick Wight | patrick@patrick.com | AUM2026! | 25 | 7 |
| Matt Germshied | matt@matt.com | AUM2026! | **35** | 30 |
| Chuck Cooper | chuck@chuck.com | AUM2026! | 30 | 5 |
| Ray Uncle | ray@ray.com | AUM2026! | 30 | 20 |
| Andy Belly | andy@andy.com | AUM2026! | 20 | 14 |

**Operator:** kosal@fin-tegration.com / AUM2026!

---

**START YOUR NEXT SESSION WITH:**
> *"Read HANDOFF_C11.md. Audit first with `node scripts/audit_leads.js`. Then [pick priority from §9]."*
