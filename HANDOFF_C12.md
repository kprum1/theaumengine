# AUM Engine — Session Handoff C12
**Date:** 2026-04-13  
**Session:** C12 — Governance Hardening + System Documentation  
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
3. `lead_assignments` is **the only canonical collection**. Do NOT write to `al_assignments`.
4. `al_assignments` is **frozen read-only** — 30 docs, all migrated. Never write to it again.
5. All 5 Cloud Functions are deployed on Node.js 22 (2nd Gen).
6. `serviceAccountKey.json` lives in `scripts/` — never commit.

---

## 1. WHAT WAS BUILT THIS SESSION

### P2 — `capWarningPct` governance logic (`functions/index.js`)
`runGovernance` now runs a **two-track daily audit**:

**Track 1 (SLA):** Unchanged — flags leads past `slaDeadline`.

**Track 2 (Cap Warning — NEW):**
- Reads `capWarningPct` from `routing_policies/default_v1` (default: 0.90)
- Soft-cap advisors: threshold = `capWarningPct - 0.05` (85%)
- `warnAt = floor(cap × threshold)` — e.g. 90% of 30 = 27 leads
- Writes `governance_flags/cap_warning_{uid}` (`reason: 'approaching_cap'`) with: `totalActive`, `cap`, `warnAt`, `pctFull`, `capPolicy`, `firmName`
- **Idempotent:** active flag → refresh count only; resolved flag → re-raise fresh
- **Auto-resolve:** advisor drops below threshold → writes `resolution: 'cap_dropped_below_threshold'`
- Logs `cap_warning_flagged` event to `routing_logs`

**Matt Germshied** is at 30/35 (86%) — will trigger a cap warning on the next `runGovernance` run (within 24 hours of session end).

---

### P2b — Admin Dashboard SLA Alerts card (`js/admin.js` v=20260413c)
Redesigned `renderGovernanceFlags()` to partition active flags into two visually distinct sections:

| Section | Color | Hover | Columns |
|---|---|---|---|
| ⏰ SLA Breaches | Red (`#f87171`) | Rose | Advisor, Type, Assigned age, Flagged age, Resolve |
| ⚡ At-Cap Warnings | Amber (`var(--amber)`) | Amber | Advisor + `[soft]/[hard]` badge, Leads/Cap (%), Flagged age, Resolve |

- Shared `makeResolveBtn(id)` helper replaces duplicated inline buttons
- Card meta line shows per-type count: `⏰ N SLA breaches · ⚡ M at-cap warnings`
- Empty state updated: "No active governance flags — all leads in SLA window + all advisors below cap"

---

### P3 — Firestore composite indexes (`firestore.indexes.json`)
Added 5 new indexes (19 total, valid JSON confirmed):

| Index | Purpose |
|---|---|
| `lead_assignments: ownerUid + assignedAt DESC` | §10 Open Decision C — scale |
| `lead_assignments: ownerUid + ownershipStatus + assignedAt DESC` | Advisor dashboard query |
| `al_assignments: advisorUid + assignedAt DESC` | Archive analytics |
| `governance_flags: reason + flaggedAt DESC` | Filter by flag type |
| `governance_flags: resolvedAt + flaggedAt DESC` | Resolved history view |

---

### Pilot Funnel bug fix (`js/admin.js`)
`renderAdminKPIs()` was querying `al_assignments` (frozen archive) for the "Assigned" count column — always returned 0. Fixed to query `lead_assignments` (Sprint 4 canonical).

---

### Firestore policy patch
`capWarningPct: 0.90` written to `routing_policies/default_v1` — was missing, causing function to fall back to hardcoded default. Now operator-tunable.

---

### System Documentation (`AUM_ENGINE_SYSTEM_OVERVIEW.md`)
Comprehensive 17-section technical overview written and Vera-hardened. Lives in repo root. Covers:
- Full architecture, all user journeys, lead lifecycle diagram
- Every Firestore collection with schemas
- Security rules table + explicit multi-tenant isolation statement
- All 5 Cloud Functions documented
- §16: Deployed features with acceptance criteria (not "unfinished" framing)
- §17: Known managed risks + 3 explicit questions for Vera (retention, ED consent, anonymization)

---

## 2. FILES MODIFIED

| File | Change |
|---|---|
| `functions/index.js` | P2: capWarningPct two-track governance. Comment: `Phase C5 (Node.js 22) \| Sprint 4 + P2 cap-warning` |
| `js/admin.js` | P2b cap-warning UI; Pilot Funnel lead_assignments fix. v=20260413c |
| `index.html` | Cache-bust admin.js → v=20260413c |
| `firestore.indexes.json` | P3: 5 new composite indexes (19 total) |
| `AUM_ENGINE_SYSTEM_OVERVIEW.md` | NEW — full system doc for Vera review |

---

## 3. FIRESTORE CHANGES

### Collections written this session
- `routing_policies/default_v1` — patched: `capWarningPct: 0.90` added

### New governance_flags schema (P2 cap warning)
```json
{
  "reason": "approaching_cap",
  "ownerUid": "...",
  "firmName": "Matt Germshied Wealth Management",
  "cap": 35,
  "capPolicy": "soft",
  "capWarningPct": 0.85,
  "warnAt": 29,
  "totalActive": 30,
  "pctFull": 86,
  "flaggedAt": "ISO",
  "updatedAt": "ISO",
  "resolvedAt": null,
  "resolvedBy": null,
  "resolution": null,
  "sourceCollection": "lead_assignments"
}
```

### Indexes deployed
All 19 indexes live in Firestore — deployed via `firebase deploy --only firestore:indexes`.

---

## 4. DEPLOYMENTS THIS SESSION

| Deploy | Command | Status |
|---|---|---|
| hosting + rules + indexes | `firebase deploy --only hosting,firestore:rules,firestore:indexes` | ✅ |
| `runGovernance` function | `firebase deploy --only functions:runGovernance` | ✅ |
| hosting (Pilot Funnel fix) | `firebase deploy --only hosting` | ✅ |

---

## 5. GIT LOG (last 8 commits)

```
13fd341 fix(admin): Pilot Funnel assigned count — query lead_assignments not al_assignments
a5defc6 feat(p2+p3): capWarningPct governance + composite Firestore indexes
787730e feat(p1+p4): Mark Resolved button in SLA Alerts card; freeze al_assignments in Firestore rules
3929d6e docs: session handoff C11 — Sprint 4 collection unification complete
9c7e365 feat(sprint4): unify al_assignments → lead_assignments (canonical single collection)
42613b7 docs: session handoff C10 — cap policy, governance UI, soft-cap routing
bb43921 fix(c9+1): Matt cap→35, governance_flags UI card, soft-cap enforcement in runEligibility
f83e3e2 docs: Phase C9 handoff — full session summary
```

---

## 6. CURRENT SYSTEM STATE

| Collection | Count | Status |
|---|---|---|
| `lead_assignments` | 77 | ✅ Canonical |
| `al_assignments` | 30 | 🔒 Frozen archive |
| `master_leads` | 46 | ✅ |
| `routing_queue` | 45 | ✅ All `assigned` |
| `advisor_pool` | 5 | ✅ All eligible |
| `governance_flags` | 0 active | ✅ Clean |
| `outreach_outcomes` | 0 | 🟡 No advisor sends yet |
| `funnel_events` | 0 | 🟡 No advisor activity yet |

**All 77 leads are `advisorStatus: New`** — no outreach logged. Core business risk: advisors not yet active.

### Pilot Advisor Cap Status
| Advisor | Leads | Cap | Policy | % Full | Warning Tonight? |
|---|---|---|---|---|---|
| Matt Germshied | 30 | 35 | soft | 86% | ⚡ YES (>85%) |
| Andy Belly | 14 | 20 | hard | 70% | No |
| Ray Uncle | 20 | 30 | soft | 67% | No |
| Patrick Wight | 7 | 25 | hard | 28% | No |
| Chuck Cooper | 5 | 30 | hard | 17% | No |

---

## 7. PENDING NEXT STEPS (prioritized)

### Priority 1 — Get Advisors Active
77 leads assigned, zero activity. This is the #1 business risk. Advisors need to log in, work leads, and log outreach.

### Priority 2 — Investigate eligibility_empty failures
The `routing_queue` currently shows 0 failed items (previously 5 — may have auto-cleared or been requeueued). Confirm with `node scripts/requeue_failed.js` and check niche coverage if any new failures appear.

### Priority 3 — Vera Response on System Overview
`AUM_ENGINE_SYSTEM_OVERVIEW.md` sent to Vera. Awaiting answers on:
- **Q1:** Data retention policy for `funnel_events` / `outreach_outcomes`
- **Q2:** ED Intake consent requirements before real prospect use
- **Q3:** Routing log anonymization requirements

### Priority 4 — Validate Matt's Cap Warning
First `runGovernance` run after session end should write `governance_flags/cap_warning_{matt_uid}`. Confirm in Admin Dashboard SLA Alerts → ⚡ section.

### Priority 5 — Alfred Ingest Next Batch
46 leads, 45 routed. Pipeline is empty. Alfred needs to POST a new batch to `/alfredIngest` before advisors run out of new leads.

---

## 8. OPEN DECISIONS

| Code | Decision | Status |
|---|---|---|
| A | `al_assignments` permanent deletion | 🟡 Deferred — keep as audit archive |
| B | `slaWindowDays: 7` vs `slaDeadline = +30d` — clarify or align | 🟢 Documented in §11 of overview — no code change needed |
| C | Firestore index for `lead_assignments ownerUid + assignedAt` | ✅ Added P3 |
| D | Pilot Funnel card `al_assignments` bug | ✅ Fixed this session |
| E | `capWarningPct` in Firestore routing_policies | ✅ Patched this session |

---

## 9. START YOUR NEXT SESSION WITH

```
Read HANDOFF_C12.md. Run node scripts/audit_leads.js.
Check Admin Dashboard → SLA Alerts → confirm Matt Germshied ⚡ cap warning fired.
Then focus on: getting advisors active + Alfred next ingest batch.
```

---

*Handoff written 2026-04-13 by Antigravity (C12 session end)*
