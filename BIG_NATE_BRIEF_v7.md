# BIG NATE BRIEF — AUM Engine Phase C2
**Project:** `theaumengine` (Firebase)
**Live URLs:** https://www.theaumengine.com · https://theaumengine.web.app
**GitHub:** `kprum1/theaumengine` · branch: `main`
**Last known commit:** `a647a3c` — mobile hero top padding fix
**Date:** April 9, 2026
**Prepared by:** Vera / Perplexity — DO NOT modify architecture outside tasks listed below

---

## ⚠️ CRITICAL: READ BEFORE TOUCHING ANYTHING

### What is already working and must NOT be touched
The following are live, tested, and in use by 10 active pilots. Do not rename, move, or refactor any of these:

| Component | Status | Rule |
|---|---|---|
| All 8 deployed agents (onLeadIngested, Alfred Ingest, etc.) | Live on us-central1 | ❌ DO NOT TOUCH |
| Firestore collections + schema | Phase C1 complete | ❌ DO NOT ADD/REMOVE FIELDS on existing docs |
| Reply Tapper (4-tap: reply/meeting/not_now/dead) | Live via osLogReply | ❌ DO NOT TOUCH |
| loadOperatorOutcomes dashboard | Live | ❌ DO NOT TOUCH |
| Auth gate + openAuthModal() | Live | ❌ DO NOT TOUCH |
| HubSpot lead capture form at footer | Live (confirm form ID active — see Open Items) | ❌ DO NOT TOUCH WIRING |
| `js/intake_engine.js` · `js/planning_agent.js` · `js/pages.js` · `js/auth.js` | Live scripts | ❌ DO NOT MODIFY LOGIC |
| `css/main.css` design token block (lines 1–80) | All tokens live | ❌ ONLY ADD tokens, never remove/rename existing |

### What you ARE allowed to work on
Only the tasks numbered in Section 2 below. If a task is not listed, do not do it.

---

## Design System Reference (from VERA v6)
All styling must use these exact tokens. Do not introduce new color values.

```
--blue:           #60a5fa   ← Primary accent (CTAs, labels, active states)
--blue-hover:     #3b82f6   ← Hover state for all blue elements
--bg-primary:     #07111f   ← Hero + shell background
--bg-elevated:    #0f1d2e   ← Cards, drawers
--bg-surface:     #142033   ← Input backgrounds
--text-primary:   #f1f5f9   ← Headlines
--text-secondary: #94a3b8   ← Body copy
--text-muted:     #64748b   ← Labels, captions
--border-subtle:  rgba(148,163,184,0.08)
--border-default: rgba(148,163,184,0.14)
--border-accent:  rgba(96,165,250,0.3)
--gem-gradient:   linear-gradient(135deg,#60a5fa,#3b82f6)
```

CSS cache-buster pattern: `main.css?v=10` (increment from current v=9)

---

## TASKS — Phase C2

### TASK 1 — HIGH PRIORITY: Fix Open Items from VERA v6
These are known issues from the April 8 audit. Fix these first.

**1A — Demo Inbox (HIGH)**
- `openDemoEmail()` currently sends to `hello@theaumengine.com` as a placeholder
- **Action:** Confirm with operator (user) what the real monitored inbox is. If not yet confirmed, add a `console.warn` that flags it and a visible `<!-- TODO: confirm demo inbox -->` HTML comment above the handler in `js/app.js`
- Do NOT change the mailto structure itself — just update the `to:` address when confirmed

**1B — HubSpot Form ID Verification (MEDIUM)**
- The footer lead capture form uses a HubSpot embed
- **Action:** Load the live site, inspect the form element, confirm the `formId` in the script matches a currently active HubSpot form. If it loads properly, add a comment `<!-- HubSpot form ID verified [date] -->` in the HTML. If broken, flag it — DO NOT attempt to fix without the real form ID from operator.

**1C — FAQ + Founding Cohort Section Font Sizes (LOW)**
- Operator requested larger font sizes in the FAQ and Founding Offer sections
- **Action:** Locate `.faq-*` and `.offer-*` (or equivalent) CSS blocks. Increase question text to minimum `1.05rem` and answer text to `0.95rem`. Keep within the design token system — use `var(--text-secondary)` for answers, `var(--text-primary)` for questions.
- **Do NOT change layout or padding — font size only.**

**1D — Mobile Nav Auth State (LOW — optional this sprint)**
- Mobile drawer always shows "Pilot Login" even when user is authenticated
- **Action only if safe:** in `toggleMobileNav()`, check for an existing auth session token before rendering the login button. If the auth module does not expose a simple `isLoggedIn()` or `currentUser` flag, skip this task and leave a `<!-- TODO: hide login when authed -->` comment. DO NOT touch `js/auth.js` internals.

---

### TASK 2 — HIGH PRIORITY: Funnel Tracking Layer (Additive Only)
Add a lightweight, non-breaking analytics layer to track where prospects stall. This is read-only logging — no changes to existing write paths.

**What to add:**
Create a new file `js/funnel_tracker.js` with a single exported function:

```js
// js/funnel_tracker.js
// Additive only — does not modify any existing Firestore writes
function logFunnelEvent(eventName, metadata = {}) {
  // Logs to: Firestore collection 'funnelEvents' (NEW collection — additive)
  // Fields: { event, advisorId, timestamp, ...metadata }
  // If Firebase not ready, silently no-ops (no errors)
  try {
    const db = firebase.firestore();
    const advisorId = window._currentAdvisorId || 'anonymous';
    db.collection('funnelEvents').add({
      event: eventName,
      advisorId: advisorId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ...metadata
    });
  } catch(e) { /* silent fail — never break UI */ }
}
window.logFunnelEvent = logFunnelEvent;
```

**Where to call it (small additive additions to existing files):**
Add ONE line per event below — do not restructure the surrounding code:

| File | Location | Event call to add |
|---|---|---|
| `js/app.js` | Inside `openDemoEmail()` | `logFunnelEvent('demo_email_opened')` |
| `js/auth.js` | After successful login | `logFunnelEvent('pilot_login_success')` |
| `index.html` | After HubSpot form submit callback | `logFunnelEvent('hubspot_form_submitted')` |
| `js/app.js` | Inside `toggleMobileNav()` when opening | `logFunnelEvent('mobile_nav_opened')` |

**Load the new script in `index.html` BEFORE `app.js`:**
```html
<script src="js/funnel_tracker.js?v=1"></script>
```

---

### TASK 3 — MEDIUM PRIORITY: Cockpit Mockup Quality Polish
The Command Center cockpit card in the hero is currently static and hardcoded. Keep it fully static (no Firestore wiring this sprint). Polish the presentation only.

**Current hardcoded data (DO NOT CHANGE names/niches — these are representative):**
| Name | Niche | Status | Score |
|---|---|---|---|
| Nuria Molina | AI-Displaced Exec · Miami FL | NEW | 99 |
| Kirk McDonald | AI-Displaced Exec · Bend OR | NEW | 97 |
| David Harrington | Aircraft Owner · Scottsdale AZ | CONTACTED | 92 |
| Corinne Sklar | Aircraft Owner · New York NY | NEW | 92 |
| Sandra Westhoff | Business Owner · Overland Park KS | REPLIED 🔔 | — |

**Polish tasks (CSS/HTML only — no JS changes):**
- Ensure `.hc-card` renders cleanly at all viewports from 320px to 1440px
- The `.hc-alert` row (Sandra Westhoff) should pulse gently — add a subtle CSS keyframe:
  ```css
  @keyframes alert-pulse {
    0%, 100% { background: rgba(96,165,250,0.06); }
    50%       { background: rgba(96,165,250,0.14); }
  }
  .hc-alert { animation: alert-pulse 2.4s ease-in-out infinite; }
  ```
- Status pills: use token colors consistently:
  - `NEW` → `background: rgba(96,165,250,0.12); color: #60a5fa;`
  - `CONTACTED` → `background: rgba(148,163,184,0.12); color: #94a3b8;`
  - `REPLIED` → `background: rgba(96,165,250,0.18); color: #60a5fa; font-weight:700;`
- `.hc-stats-row` 4-block stat row: verify it doesn't overflow on mobile. If it does, wrap to 2×2 grid at `max-width: 480px`.

---

### TASK 4 — MEDIUM PRIORITY: Advisor Onboarding UX — Niche Intake Tightening
This is a **frontend-only** change to the advisor intake/onboarding flow. Do not touch intake_engine.js logic.

**Goal:** Reduce friction from "advisor signs up" to "advisor sees their first 10 prospects"

**What to change:**
- Locate the niche intake form (likely in a modal or onboarding panel loaded by `pages.js`)
- Reduce visible fields at Step 1 to these 4 only (others can remain in DOM but be hidden with `display:none` until Step 2):
  1. Advisor name / firm
  2. Primary niche (dropdown or text — whatever is already there)
  3. Target geography (optional)
  4. AUM range of ideal client
- Add a visible progress indicator: "Step 1 of 2 — Your niche" above the form
- Add helper microcopy under the niche field: *"Don't overthink it — you can refine this later. Example: 'Tech employees with equity comp' or 'Business owners planning an exit in 3–5 years.'"*
- Keep all existing field names and IDs — just hide non-essential ones. Do NOT change the submit handler or what gets written to Firestore.

---

### TASK 5 — LOW PRIORITY: CSS Cache-Buster Increment
- Current: `main.css?v=9`
- After any CSS change in this sprint: bump to `main.css?v=10`
- Same pattern for any JS files changed: increment their `?v=` query string by 1

---

## Open Items Tracker (from VERA v6 + this sprint)
| # | Item | Priority | Owner | Status |
|---|---|---|---|---|
| 1 | Confirm real demo inbox for `openDemoEmail()` | HIGH | Operator | ⏳ Pending |
| 2 | Cockpit mockup → live Firestore wiring | MEDIUM | Big Nate Phase C3 | 🔜 Next sprint |
| 3 | FAQ / Founding Cohort font sizes | LOW | Big Nate Task 1C | This sprint |
| 4 | HubSpot form ID active verification | MEDIUM | Big Nate Task 1B | This sprint |
| 5 | Mobile nav auth state hiding | LOW | Big Nate Task 1D | Optional this sprint |
| 6 | Outreach Log Migration (localStorage → Firestore `outreachLogs`) | HIGH | Phase C3 | 🔜 Next sprint |
| 7 | ED/Al Analytics Panel | MEDIUM | Phase C3 | 🔜 Next sprint |
| 8 | `al_assignments.status` field normalization | MEDIUM | Phase C3 | �� Next sprint |

---

## Deployment Checklist (do after all tasks)
1. Run site locally and verify hero renders correctly at 375px, 768px, and 1280px
2. Confirm both CTAs fire correctly: `openDemoEmail()` and `openAuthModal()`
3. Confirm mobile hamburger opens/closes and both drawer buttons work
4. Open browser console — zero errors, zero warnings
5. Increment CSS cache-buster to `v=10` in `<head>`
6. Commit with message: `feat: Phase C2 — funnel tracker, cockpit polish, intake UX, open item fixes`
7. `firebase deploy --project theaumengine`
8. Verify live at both `theaumengine.web.app` AND `www.theaumengine.com`

---

## What is NOT in scope for this sprint
- ❌ Any changes to Firestore security rules
- ❌ Any new agents or cloud functions
- ❌ Cockpit live data wiring (Phase C3)
- ❌ ED/Al/Tim analytics panel (Phase C3)
- ❌ `al_assignments` status normalization (Phase C3)
- ❌ Any changes to `js/auth.js` logic
- ❌ Any changes to `js/intake_engine.js` processing logic
- ❌ New pages or routing changes

---

*This brief is derived from VERA HANDOFF v6 (April 8–9, 2026) and VERA MASTER HANDOFF v5 FINAL (April 7, 2026). If anything in this brief conflicts with what you see in the actual repo, the repo is the source of truth — flag the conflict before proceeding.*
