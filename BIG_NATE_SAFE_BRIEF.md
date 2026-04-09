# AUM Engine — Big Nate Safe Brief + Vera Audit
**Date:** April 9, 2026
**Prepared by:** Antigravity (Mini Nate)
**For:** Big Nate (Build Agent) + Vera (Documentation/QA)
**Canonical Source:** `VERA_HANDOFF.md` + `VERA_HANDOFF_v5_FINAL.md` + `VERA_HANDOFF_v6_HERO_UI.md`

---

## PART 1 — Vera Task Audit (Status Check)

This section reviews `VERA_HANDOFF.md` Phase 2 sprint list against the current production codebase.

### Sprint 1 — Data Layer
| Task | Status | Notes |
|---|---|---|
| Set up Firebase project | ✅ DONE | `theaumengine` project live on Firebase Hosting + Firestore + Functions |
| Create Firestore collections | ✅ DONE | `advisors`, `masterLeads`, `al_assignments`, `ed_situations`, `advisor_pool` wired |
| Replace `data.js` mocks with Firestore reads | ✅ DONE | `db.js` handles all Firestore reads on auth; `PROSPECTS` hydrated from `al_assignments` |
| Loading states | ✅ DONE | `.agent-thinking` spinner pattern used throughout |
| Wire "Save ICP" settings to Firestore | ✅ DONE | `saveICPConfigToFirestore()` in `db.js` — dual-writes localStorage + Firestore |

### Sprint 2 — Prospect-Switching in Outreach Studio
| Task | Status | Notes |
|---|---|---|
| Track `activeOutreachProspect` | ✅ DONE | `activeOutreachProspectId` in `app.js` global state |
| Prospect row click sets active prospect | ✅ DONE | `setOutreachProspect(id)` wired to rows |
| Re-render right panel on prospect change | ✅ DONE | `outreach_agent.js` + `outreach_controller.js` handle multi-variant generation |
| Per-prospect message types in Firestore | ✅ DONE (Phase B+) | Via `outreach_agent.js` — 4-agent orchestration stack |

### Sprint 3 — Real Agent Integration
| Task | Status | Notes |
|---|---|---|
| Wire Prospect Mine to Cloud Function | ✅ DONE | `alfredIngest` Cloud Function deployed — JSON lead injection |
| AI draft generation | ✅ DONE | `outreach_agent.js` calls Gemini — Research → Strategy → Customization → Cadence agents |
| Refresh Scoreboard after mining | ✅ DONE | Firestore real-time listener updates `PROSPECTS` on assignment |

### Sprint 4 — Status & Pipeline Updates
| Task | Status | Notes |
|---|---|---|
| Pipeline kanban drag-and-drop | ❌ NOT DONE | Static kanban; drag events not implemented |
| Activity log on status change | ⚠️ PARTIAL | Activity log exists in prospect objects; Firestore write-back not yet wired for all status changes |
| Alerts from Firestore triggers | ❌ NOT DONE | Alerts still hardcoded in `data.js`; no Firestore trigger → alert flow built |

### Sprint 5 — Auth & Multi-Team
| Task | Status | Notes |
|---|---|---|
| Firebase Auth login page | ✅ DONE | `auth.js` handles Google Auth + email/password via Firebase Auth |
| Role-based views (rep vs. manager) | ✅ DONE | `admin.js` + `pageAdminDashboard()` — admin role gates manager-level views |
| `assignedRep` field drives filtering | ✅ DONE | Each advisor sees only their `al_assignments` from Firestore, keyed by UID |

### Known Bugs — Fixed Status
| Bug | Status |
|---|---|
| Niche conversion % re-randomizes on every navigate | ❌ STILL PRESENT — random in `pageManagerConsole()` |
| Outreach Studio always loads Harrington | ✅ FIXED — `activeOutreachProspectId` switches properly |
| `startMining()` re-fires without guard | ✅ FIXED — `if (miningActive) return;` guard added |
| Drawer overlay double-click | ✅ FIXED — overlay binds correctly via `bindPageEvents()` |
| Pipeline board doesn't update on status change | ❌ STILL PRESENT — awaiting Phase 2 Firestore listener |

### Remaining Open Items (not in original sprints)
| Item | Priority |
|---|---|
| Outreach log migration (localStorage → Firestore `outreachLogs`) | HIGH |
| `al_assignments.status` normalization (cleanup legacy values) | MEDIUM |
| ED/Al Analytics Panel (advisor-facing intel dashboard) | MEDIUM |
| Funnel tracking dashboard (mined → approved → contacted → replied → booked) | MEDIUM |
| Demo inbox for `hello@theaumengine.com` (currently placeholder) | HIGH |
| Kanban drag-and-drop with Firestore status update | LOW |

---

## PART 2 — Big Nate Safe Brief

### Canonical Sources
Before starting **any** task, Big Nate must anchor in:
1. `VERA_HANDOFF.md` — original architecture, data model, agent definitions, design rules
2. `VERA_HANDOFF_v5_FINAL.md` — Firestore schema, multi-tenant architecture, ingestion pipeline
3. `VERA_HANDOFF_v6_HERO_UI.md` — hero redesign, button wiring, mobile nav, color system

> **RULE #1: Do not change agents, functions, or Firestore structure unless a task explicitly and by number authorizes it.**

---

### What Is Off-Limits (No Touch Without Explicit Task)

| Area | Why |
|---|---|
| `alfredIngest` Cloud Function | Production ingestion — any change breaks the live lead pipeline |
| `db.js` — existing read/write functions | Dozens of advisor sessions depend on these paths |
| Firestore collection names or field names | Changes break auth.js, db.js, admin.js simultaneously |
| `auth.js` auth flow | 30+ pilot advisors authenticate through this today |
| `outreach_agent.js` / `outreach_controller.js` | 4-agent orchestration stack; fragile by design |
| `niche_engine.js` scoring weights | Calibrated scoring attached to live advisor profiles |
| `data.js` — `NICHES` array or utility functions | Used by mock + production rendering; changing breaks scoreboard + drawers |
| Firestore security rules (`firestore.rules`) | Multi-tenant isolation; any loosening is a data breach risk |
| `index.html` script load order | `data.js` must precede `app.js` — breaking this causes silent failures |

---

### What Big Nate IS Allowed to Do

**Category A — Frontend / Website Only (no backend changes)**

These changes touch only `index.html` and `css/main.css`. Zero backend risk.

1. Refine hero and section copy using the value prop: niche prospecting cockpit, exclusive leads, scoring, advisor-approved outreach.
2. Improve section layouts: "Why It Exists," "How It Works," "Founding Offer," "FAQ" — font size, spacing, visual hierarchy.
3. Add or update CTA routing to point to existing registration/onboarding flow (`openDemoEmail()` or `openAuthModal()`).
4. Fix mobile responsiveness issues (padding, font scaling, overflow).
5. Update nav link labels, order, or styling without changing their `href` targets.

**Category B — Read-Only Dashboards (additive — new UI panels reading existing data)**

These can read from existing Firestore collections but must NOT write new fields or modify existing documents.

6. Build a funnel visibility panel showing: mined → approved → contacted → replied → booked → closed (per advisor, per niche). Read from: `al_assignments`, `masterLeads`, `outreachLogs`.
7. Add a rep performance panel to `pageManagerConsole()` using existing `al_assignments` data — replace the `Math.random()` conversion percentages with real computed values.
8. Build an outreach log read view: shows all outreach sent per prospect from `outreachLogs` collection.

**Category C — Additive Fields Only (no renames, no deletes)**

These add optional fields to existing documents that agents or operators can write to — but existing logic must not depend on these fields being present.

9. Add `fitReason: string` to prospect/assignment docs — human-readable explanation of why this lead was scored highly.
10. Add `urgencyTrigger: string` to prospect docs — the specific life event or signal driving timing score.
11. Add `sourceNotes: string` to prospect docs — operator notes on where/how this lead was sourced.

> These must be written with null-safety (`?.` checks) everywhere they're read, so existing advisor sessions with no new fields don't break.

---

### Safe Testing Protocol (Before Any Deploy)

1. **Test locally** using `file:///` on `index.html` — all public shell changes are visible without auth.
2. **Test on `theaumengine.web.app`** (staging alias) before touching `www.theaumengine.com`.
3. **Never deploy Category B or C changes without Kos approval** — they touch live data.
4. For Category A changes: deploy freely via `firebase deploy --only hosting --project theaumengine`.
5. After every deploy: increment the CSS cache-buster in `index.html`: `main.css?v=10` (current: `v=9`).

---

### Deployment Command (safe)
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
firebase deploy --only hosting --project theaumengine
git add -A && git commit -m "feat: [description]" && git push origin main
```

---

### Agent System — Quick Reference (Do Not Modify)

| Agent File | Role | Status |
|---|---|---|
| `js/outreach_agent.js` | 4-agent outreach orchestration (Research/Strategy/Customization/Cadence) | Production |
| `js/outreach_controller.js` | Routes prospect → agent, manages variants | Production |
| `js/niche_engine.js` | Macro → meso → micro niche scoring | Production |
| `js/ed_intake_engine.js` | ED client intake flow | Production |
| `js/planning_agent.js` | Meeting planning brief generator | Production |
| `js/admin.js` | Admin dashboard + operator view | Production |
| `functions/index.js` → `alfredIngest` | Lead ingestion Cloud Function | Production |

---

### Key Firestore Collections (Do Not Rename/Delete)

| Collection | Purpose |
|---|---|
| `advisors/{uid}` | Per-advisor profile, ICP config, niche settings |
| `masterLeads/{leadId}` | Canonical lead records, enriched |
| `al_assignments/{docId}` | Lead → advisor routing assignments |
| `ed_situations/{docId}` | AI-Displaced Executive situation records |
| `advisor_pool/{uid}` | Advisor eligibility + niche routing config |

---

*Prepared by Antigravity (Mini Nate) — April 9, 2026*
*Questions → Kos. Code source of truth → live files in `/Users/kosalprum/Documents/AdvDiamondMining/`. If this doc conflicts with the code, the code wins.*
