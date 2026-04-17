# Decision Memo: AUM Engine KPI Count Fix
**Date:** 2026-04-17
**Project:** AUM Engine
**Wing:** aum_engine + aum_cockpit
**Sprint:** C33 (post-C32 hardening)

---

## Context

After Sprint C32 stabilized the pipeline at 1,030 total `lead_assignments` across 7 advisors,
the operator account (`kosal@fin-tegration.com`) saw **437** in the Command Center
"Total Prospects" KPI instead of the correct **1,030**.

---

## Root Cause (3 stacked bugs)

### Bug 1: `loadAlAssignmentsForAdvisor` — `.limit(100)`
- File: `js/db.js` line ~538
- Truncated advisor pipelines to 100 docs. Kosal has 410 assigned leads → 310 silently dropped.

### Bug 2: `loadAssignedLeadsFromFirestore` — N+1 master_lead fetches
- File: `js/db.js` line ~130
- Fetched each `master_lead` doc individually (one `.get()` per assignment).
- With 410+ assignments, many timed out or failed silently → `return null` → filtered out.
- No explicit `.limit()` was set.

### Bug 3: `computeMetrics()` used `PROSPECTS.length`
- File: `js/data.js` line ~461
- `PROSPECTS[]` = 28 hardcoded demo leads + hydrated Firestore leads that succeeded.
- ≈437 after partial hydration. The missing 593 never made it into PROSPECTS[].

### Bug 4 (attempted fix): Firebase compat SDK does not support `.count()`
- Firebase compat SDK v9.23.0 (loaded via CDN in index.html) does NOT implement `.count()` aggregation.
- Calling `.count().get()` throws silently → catch block returns 0 → fallback to `PROSPECTS.length`.
- This caused our first fix attempt to appear to do nothing.

---

## Decisions Made

### Decision A: Raise query limits to 500
- `loadAssignedLeadsFromFirestore`: added `.limit(500)`
- `loadAlAssignmentsForAdvisor`: raised from `.limit(100)` to `.limit(500)`

### Decision B: Write a `meta/pipeline_stats` summary doc
**Rejected alternatives:**
- `.count()` aggregation → not in compat SDK, silent failure
- Fetching all docs to count → 1030 reads, expensive
- Storing count in `advisor_pool` → requires updating all 7 advisor docs on every ingest

**Chosen approach:**
- `scripts/write_pipeline_meta.js` (Admin SDK) writes one doc: `meta/pipeline_stats`
  with `totalLeads`, `totalMasterLeads`, `leadsByAdvisor` map
- `db.js → fetchAdvisorLeadCount()` reads this single doc (1 Firestore read)
- `computeMetrics()` prefers `window._firestoreLeadTotal` over `PROSPECTS.length`

### Decision C: Operator gets global total; advisors get their personal count
- Operator email `kosal@fin-tegration.com` → `meta.totalLeads` (1,030)
- Any other advisor → `meta.leadsByAdvisor[uid]`
- Detection: `window._currentUser.email === 'kosal@fin-tegration.com'`
  (safe: `window._currentUser` is set before `fetchAdvisorLeadCount` runs)

### Decision D: Make count fetch BLOCKING in bootstrapUserData
- Added `fetchAdvisorLeadCount(uid)` to the `Promise.all([...])` in `bootstrapUserData`
- Ensures `window._firestoreLeadTotal` is set before the first `renderPage()` call
- Adds ~200-400ms to login (acceptable — within the auth round-trip time)

---

## Files Changed

| File | Change |
|---|---|
| `js/db.js` | Raised limits to 500, replaced `.count()` with meta doc read, added `fetchAdvisorLeadCount` |
| `js/data.js` | `computeMetrics()` uses `window._firestoreLeadTotal` if set, added `newThisWeek` metric |
| `js/pages.js` | KPI delta uses dynamic `M.newThisWeek` instead of hardcoded "↑ 6 new this week" |
| `firestore.rules` | Added `match /meta/{docId}` rule (read: auth != null, write: false) |
| `scripts/write_pipeline_meta.js` | NEW — writes pipeline summary to Firestore. Run after every ingest. |
| `.agents/skills/alfred_lead_ingest/SKILL.md` | Added §11 Pipeline Meta / KPI Sync |

---

## Next Implications

- **`write_pipeline_meta.js` must run after every ingest** — add to ingest checklist (§11 of SKILL.md)
- If `meta/pipeline_stats` is missing or stale, the KPI falls back to `PROSPECTS.length` (safe but inaccurate)
- When pipelines exceed 500 leads per advisor, `loadAssignedLeadsFromFirestore` will again truncate — consider pagination at that point
- The 28 demo leads in `data.js` PROSPECTS array should eventually be gated behind a feature flag to prevent confusion

---

## Verification

After fix:
- `node scripts/audit_leads.js` → 10/10 ✅
- `meta/pipeline_stats.totalLeads` = 1,030 ✅  
- Cockpit KPI displays 1,030 for operator after hard refresh ✅
