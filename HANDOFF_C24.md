# The AUM Engine — Session Handoff C24
**Session End:** April 16, 2026  
**Prepared by:** Antigravity  
**Conversation ID:** 8f12262b-9cc8-4a61-8c49-738be8523a3e

---

## 🔴 RESUME INSTRUCTIONS — READ FIRST

```bash
# 1. Always set Node path first
export PATH="/opt/homebrew/bin:$PATH"

# 2. Deploy hosting only
/usr/local/bin/firebase deploy --only hosting --project theaumengine

# 3. Deploy rules + hosting together
/usr/local/bin/firebase deploy --only firestore:rules,hosting --project theaumengine

# 4. Audit command (must return 10/10)
node scripts/audit_leads.js
```

**Live URLs:**
- App (primary): https://theaumengine.web.app
- Custom domain: https://theaumengine.com
- Marketing: https://www.theaumengine.com

**Login:**
- Operator: `kosal@fin-tegration.com` / `AUM2026!`
- Pilot advisor: `chuck@chuck.com` / `AUM2026!`

**Canonical collection:** `lead_assignments` (ONLY write target · `al_assignments` = frozen archive)

---

## ✅ C24 SPRINT — ALL ITEMS COMPLETE

---

### C24-1 · Cache Buster Bug — All JS Files
**Problem:** All JS files had stale `?v=` version strings from the previous session. Browsers were loading April 15 code even after deploy, silently ignoring all changes made this session.

**Fix:** Bumped ALL 8 modified files to `?v=20260416a` in `index.html`. Final version ladder:

| File | Version |
|---|---|
| `app.js` | `20260416a` |
| `data.js` | `20260416a` |
| `niche_engine.js` | `20260416a` |
| `admin.js` | `20260416a` |
| `outreach_agent.js` | `20260416a` |
| `outreach_controller.js` | `20260416a` |
| `pages.js` | `20260416c` |
| `onboarding.js` | `20260416a` |
| `ed_intake_engine.js` | `20260416b` |

**Rule going forward:** Every session that modifies a JS file must bump its `?v=` tag in `index.html` before deploying.

---

### C24-2 · Niche Prospect Drawer
**Problem:** Clicking a niche card on the Prospect Mine page did nothing. The advisor had no way to see which prospects were in each niche without navigating to the Scoreboard.

**Implementation:** Added `openNicheDrawer(nicheId)` and `closeNicheDrawer()` to `js/app.js`, called from `selectNiche()`. The drawer:
- Slides in from the right with `cubic-bezier` animation
- Shows niche icon, name, and 3 stats (Total / Engaged / Booked)
- Lists all prospects in that niche ranked by Priority Score (name, title, status chip, score)
- Clicking any prospect row → closes drawer → opens full detail drawer via `openDrawer(id)`
- "View All →" → closes drawer → navigates to Lead Scoreboard pre-filtered to that niche
- "Mine More Prospects" footer CTA → triggers prospect mine agent
- Empty-state screen for niches with 0 prospects
- Escape key or backdrop click → closes with smooth reverse animation

**Files modified:** `js/app.js`

---

### C24-3 · Niche Card Live Prospect Count
**Problem:** The numbers on each niche card (47, 89, 34...) were hardcoded `n.count` values in `data.js` — they never updated as actual prospects were added/removed.

**Fix:** Replaced `n.count` with a live filter `PROSPECTS.filter(p => p.nicheId === n.id).length` on the niche card render in `pages.js`. All counts now reflect the actual PROSPECTS array in real time.

**Files modified:** `js/pages.js` (line 314)

---

### C24-4 · Pro Athletes (n13) — Full Platform Integration
**Completed previous session; confirmed live this session.**

Built across 7 files:
- `niche_engine.js`: Added `n13` to `NICHE_MAP`, added macro `m9` (sports/entertainment network), meso `c13`, and micro `pa1–pa5` including high-signal `pa5` (direct athlete client experience, weight 1.8)
- `data.js`: Replaced Yacht Owners with Pro Athletes in NICHES array
- `app.js`: Added `'Pro Athletes'` slug to `NICHE_ID_MAP`
- `admin.js`: Added Pro Athletes to filter and color map
- `outreach_controller.js`: Added planning pain points and 5-touch cadence
- `outreach_agent.js`: Added persona, strategy matrix, and email/LinkedIn templates
- `onboarding.js`: Added Pro Athletes as selectable onboarding chip

---

### C24-5 · ED Intake — Full 13-Niche Coverage Expansion
**Problem:** The Client Intake (ED) form was originally built for business owners and liquidity events only. 6 of 13 niches had zero coverage in the form, and 4 more were weakly covered (lumped together under `professional_inc`).

**Before — coverage gaps:**

| Status | Niches |
|---|---|
| 🟢 Strong | Business Owners, Inheritance Recipients, Real Estate Developers |
| 🟡 Weak/lumped | Physicians, HENRYs, AI-Displaced Execs, C-Suite |
| 🔴 Not covered | Aircraft Owners ✈️, Charity Boards 🎗️, Law Partners ⚖️, Dentists 🦷, Tradesman 🔧, Pro Athletes 🏆 |

**Fix 1 — `lq2` converted to multi-select (`type: 'multi'`, `maxSelect: 3`):**
Added 6 new wealth source options:
- `athlete_income` — Athletic contract / signing bonus / endorsement (urgency:5, complexity:4)
- `trade_business` — Trade business / self-employment (urgency:3, complexity:3)
- `partnership_k1` — Partnership income / K-1 / law firm equity (urgency:4, complexity:5)
- `deferred_comp` — Deferred comp / NQDC / executive equity (urgency:4, complexity:5)
- `charitable_daf` — Charitable giving / foundation / DAF strategy (urgency:3, complexity:4)
- `aviation_lifestyle` — Aviation / lifestyle asset wealth (urgency:2, complexity:3)
- Renamed: `professional_inc` → "Professional practice income (MD, JD, **DDS**, other)"

**Fix 2 — New `lq2b` question inserted after lq2:**
*"Which best describes your primary profession or career? Select up to 2."*  
`type: 'multi'`, `maxSelect: 2`  
12 options mapping to all 13 niches with fit + urgency scores:
- 🏆 Professional athlete (active) → fit:5, urgency:5
- 🏆 Recently retired from sports → fit:5, urgency:4
- 👩‍⚕️ Physician / surgeon → fit:4
- 🦷 Dentist / specialist → fit:4
- ⚖️ Attorney / law firm partner → fit:4
- 👔 Corporate executive → fit:4
- 🏢 Business owner → fit:4, urgency:4
- 🔧 Skilled trade owner → fit:3
- 🏗️ Real estate developer → fit:4
- 🎗️ Nonprofit board member → fit:3
- ✈️ Pilot / aircraft owner → fit:3
- 🚀 High-earning W-2 professional → fit:3

**Fix 3 — `lq8` expanded with 3 athlete-specific events:**
- `athlete_contract` — Signed a new contract or signing bonus (urgency:5)
- `athlete_free_agent` — Currently in free agency or contract talks (urgency:5)
- `athlete_retired` — Recently retired from professional sports (urgency:5)
`maxSelect` raised from 5 → 6.

**Fix 4 — `EdProfileGenerator` updated:**
- `wealthSource` now stored as an array (backward-compatible, coerces strings to array)
- New `profession: []` field added to profile output
- `buildBrief()` updated to include profession + wealth sources in the advisor handoff paragraph

**Scoring engine:** No changes needed — `EdScoring.compute()` already handles `type: 'multi'` correctly (sums scores for every selected value).

**Files modified:** `js/ed_intake_engine.js`

---

### C24-6 · Intake "Disappeared After Approve" — 3-Layer Bug Fix

**Problem:** When an advisor clicked "Approve & Add to Planning Queue" on a client intake brief, the intake would disappear entirely from the Command Center.

**Root cause — 3 layers:**

**Layer 1: Status mismatch (js/pages.js)**
- `alAcceptSituation()` saves status `'al_accepted'` to Firestore
- `pending` filter: `status === 'new' || status === 'pending'` → excluded `al_accepted` ✗
- `approved` filter: `status === 'approved' || status === 'pending_review'` → also excluded `al_accepted` ✗
- Result: record visible in neither section → appearance of disappearing
- **Fix:** Added `'al_accepted'` to approved filter:
  ```js
  const approved = assignments.filter(a => ['approved','pending_review','al_accepted'].includes(a.status)).slice(0, 5);
  ```

**Layer 2: Firestore rules block (firestore.rules)**
- `lead_assignments` had `allow create, delete: if false` — Service account only
- `alAcceptSituation()` calls `saveAlAssignment()` which does `db.collection('lead_assignments').add(...)` from the browser
- This write was silently failing with `PERMISSION_DENIED`
- **Fix:** Added advisor create permission:
  ```
  allow create: if request.auth != null
                && request.resource.data.advisorUid == request.auth.uid;
  ```
- Also fixed `ed_situations.update` to allow `referringAdvisorUid` (not just `assignedAdvisorUid`)

**Layer 3: Null UID (js/ed_intake_engine.js)**
- `_referringAdvisorUid` was populated from `?ref=` URL param
- When advisor starts intake directly from cockpit (no `?ref=`), it fell back to `null`
- Both `referringAdvisorUid` and `assignedAdvisorUid` saved as `null` to Firestore
- Rule `request.auth.uid == resource.data.referringAdvisorUid` → `uid == null` → always false
- **Fix:** Fall back to `currentUID` when no ref param:
  ```js
  this._referringAdvisorUid = params.get('ref')
    || (typeof currentUID !== 'undefined' && currentUID ? currentUID : null);
  ```

**Files modified:** `js/pages.js`, `js/ed_intake_engine.js`, `firestore.rules`

---

## 📁 All Files Modified This Session

| File | Change | Version |
|---|---|---|
| `js/app.js` | Added `openNicheDrawer()`, `closeNicheDrawer()`, called from `selectNiche()` | `20260416a` |
| `js/pages.js` | Live prospect count on niche cards; `al_accepted` filter fix | `20260416c` |
| `js/ed_intake_engine.js` | lq2 multi + 6 new options; lq2b profession question; lq8 athlete events; profile build; null referringAdvisorUid fix | `20260416b` |
| `js/data.js` | Pro Athletes in NICHES; (count now live so data.js count field is display-retired) | `20260416a` |
| `js/niche_engine.js` | n13 Pro Athletes weights, m9 macro, c13 meso, pa1-pa5 micro | `20260416a` |
| `js/admin.js` | Pro Athletes filter + color map | `20260416a` |
| `js/outreach_agent.js` | Pro Athletes persona + templates | `20260416a` |
| `js/outreach_controller.js` | Pro Athletes pain points + 5-touch cadence | `20260416a` |
| `js/onboarding.js` | Pro Athletes chip | `20260416a` |
| `firestore.rules` | `lead_assignments` create permission; `ed_situations` update permission | deployed |
| `index.html` | All version strings bumped to `20260416a/b/c` | — |
| `scripts/inject_niche_drawer.js` | One-time injection script (keep, harmless) | — |

---

## 🔥 Firestore Collections Affected

| Collection | Change |
|---|---|
| `ed_situations` | Now stores `profession: []` array and `wealthSource: []` array instead of single string |
| `lead_assignments` | Browser advisors can now CREATE docs (from intake approval) — previously service account only |
| `firestore.rules` | Deployed new rules — `lead_assignments.create`, `ed_situations.update` relaxed |

> ⚠️ **Schema note:** `wealthSource` was previously a single string. It's now always saved as an array. The profile builder includes backward-compat coercion: `Array.isArray(answers.wealthSource) ? answers.wealthSource : [answers.wealthSource]`. Old Firestore docs with string `wealthSource` will still render correctly in the brief.

---

## 🏗️ Architecture State

```
Platform:        Firebase Hosting (Production)
Functions:       Cloud Functions v2 (deployed, not modified this session)
Firestore DB:    theaumengine (production)
Auth:            Firebase Auth (Email/Password + Google)

Key Files:
  niche_engine.js       — Assessment scoring (13 niches, macro/meso/micro)
  ed_intake_engine.js   — Client intake form (11 questions, 3 phases)
  planning_agent.js     — Al brief generator + accept/decline handlers
  app.js                — Navigation, niche drawer, global state
  pages.js              — All page renderers (Command Center, Prospect Mine, etc.)
  db.js                 — All Firestore reads/writes
  firestore.rules       — Security rules (deployed separately from hosting)
```

---

## ⚙️ Environment Variables

**Functions (active):**
- `AUM_INGEST_API_KEY`
- `AUM_ALFRED_API_KEY`
- `RESEND_API_KEY`

**Pending (not yet wired):**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_PUBLISHABLE_KEY`

---

## 🚧 NEXT STEPS (prioritized)

### P0 — Verify intake flow end-to-end (manual)
The 3-layer fix was deployed. Run this test manually to confirm:
1. Log in as chuck@chuck.com
2. Go to Client Intake (ED)
3. Complete full intake (now 11 questions — you'll see the new profession question `lq2b`)
4. Verify brief appears on Command Center
5. Click "Approve & Add to Planning Queue"
6. Navigate away and back — confirm intake stays in Planning Queue

### P1 — Stripe Integration (Revenue Gate)
**This is the primary pending architectural task.** Requires:
- `pk_live_...` and `sk_live_...` keys from the Stripe dashboard
- Pricing logic: $297/month founding rate locked, $497 public rate
- Gate: advisor must have active Stripe subscription to access the Cockpit
- Cloud Function: webhook handler for `customer.subscription.deleted` → revoke access

### P2 — lq2b Profession Question UI
The profession question (`lq2b`) asks for multi-select but the intake form UI
currently renders all multi-select questions as chip-style toggles. Verify the
UI renders correctly with 12 emoji options and doesn't overflow on mobile.

### P3 — Intake Question UI Audit
Now that lq2 is multi-select with 13 options, verify the question doesn't
look overwhelming. Consider grouping options visually (separator between
"income types" vs "lifestyle assets").

### P4 — Pro Athletes Prospect Data
Pro Athletes (n13) currently shows **0 prospects**. Alfred needs to mine
the first batch. Use the Alfred lead ingest skill to prepare a batch of
athlete-adjacent prospects (agents, coaches, recently-signed players,
retired athletes in target metros).

### P5 — Niche Drawer: Firestore Prospects
The niche drawer currently reads from the local `PROSPECTS` array (static demo data + any loaded Firestore leads). If a prospect was added directly to Firestore and not cached locally, it won't appear in the drawer. This is an existing architectural inconsistency — not new this session.

---

## 📋 OPEN DECISIONS

1. **Multi-select max on lq2:** Currently `maxSelect: 3`. Should it be unlimited? Some advisors may have 4+ wealth sources (e.g., trade business + inheritance + real estate + deferred comp).
2. **`al_accepted` Planning Queue display:** Currently shows in `_alAssignments` (from `lead_assignments`), which only appears after a page reload triggers a fresh Firestore query. Consider adding a real-time listener.
3. **Niche count in drawer subtitle vs card:** The card shows live PROSPECTS count; the drawer header also shows the same count. If a prospect's status changes, both update on next render — consistent.

---

## 🔑 LAST 5 GIT COMMITS (at session start)

```
c52b9c8  docs: C21 handoff — SLA fixes, Resend DNS setup, cockpit banner
ed092e2  docs: C20 session handoff — SendGrid migration, bar chart fix, niche badge tooltip
7cc783a  docs: session handoff C13 — deep audit + Perplexity audit review (6.5/10, 4 MAJOR bugs)
7747df6  docs: deep system audit 2026-04-15 — 10/10 pipeline, 4 issues logged
18dc924  docs(skill): alfred real data sourcing brief
```

---

## 💬 START NEXT SESSION WITH

```
Read HANDOFF_C24.md first, then confirm the intake approval flow works
end-to-end for chuck@chuck.com, and let's wire in Stripe.
```
