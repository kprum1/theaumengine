# HANDOFF_C48.md — AUM Engine
**Sprint:** C48 — Jeremy Provisioning + Outreach Agent Repair  
**Date:** 2026-05-05  
**Session:** Antigravity  
**Status:** ⏸ Paused — context limit hit mid-task  
**Live URL:** https://theaumengine.web.app

---

## ✅ What Was Completed This Session

### 1. Niche Performance Cards — Dynamic Sort Fix
**File:** `js/data.js` (line 605 — `computeNicheMetrics()`)

**Problem:** Niche boxes were showing static niches in hardcoded NICHES array order, not Jeremy's actual top 3.

**Fix:** Added `.sort((a, b) => b.total - a.total)` to the return of `computeNicheMetrics()` so `NM.slice(0,3)` in pages.js always shows the 3 niches with the most prospects for that advisor.

---

### 2. Outreach Agent — Critical SyntaxError Fix
**File:** `js/outreach_agent.js` (line 358)

**Problem:** The `athlete_wealth_window` email template was accidentally placed OUTSIDE the `email:{}` block in `_TEMPLATES` due to a stray `},` after `yacht_lifestyle`. This caused a **JavaScript SyntaxError** that silently prevented the entire `outreach_agent.js` from loading. The result: all functions (`buildDraftContext`, `_TEMPLATES`, `generateCustomizedDraft`) were undefined, the controller's try/catch swallowed the error, and the UI froze at "Generating draft…"

**Fix:** Removed the premature `},` at line 358 so `athlete_wealth_window` stays inside `email:{}`. Line 372's `},` now correctly closes the email block.

**Verified:** `node --check js/outreach_agent.js` → ✅ Syntax OK

---

### 3. Outreach Agent Auto-Trigger Fix
**File:** `js/pages.js` (line 750)

**Problem:** The auto-trigger on Outreach Studio load was calling `osRunAgentStack()` without first setting the prospect ID in `_outreachState`. The agent then couldn't find the correct prospect and produced no output.

**Fix:** Changed auto-trigger from `osRunAgentStack()` → `osInitForProspect(prospect.id)` which correctly seeds `_outreachState.prospectId`, `channel`, and `stage` before the agent stack fires.

Also: Draft body now starts as `"Generating draft…"` (italic placeholder) instead of the static `getDraft()` text, so the agent output renders cleanly.

---

### 4. Outreach Agent Placeholder Style Clear
**File:** `js/outreach_controller.js` (`_applyVariantToEditor`)

**Fix:** After the agent writes real content to `#draft-body`, it now also clears `fontStyle` and `color` that were set by the italic placeholder, so text renders in normal style.

---

## 🔴 NEXT PRIORITY — Incomplete Task

### Outreach Agent Deep Personalization (NOT YET DONE)
**The user's core request:** Make the drafts unique per lead — use each person's actual `reasonCodes`, `signals.nextEvent`, `signals.relationship`, `title`, `company`, `city` to generate genuinely different copy.  Wire this across ALL 4 channels: Email, Call Opener, LinkedIn Note, Voicemail.

**Current state:** Templates exist in `js/outreach_agent.js` lines 224–433 (`_TEMPLATES` object). They do niche-level customization (physician vs. business owner) but every physician gets the same generic email — just with a name swap.

**What needs to happen:**

#### Step 1 — Add personalization helpers above `const _TEMPLATES = {`
```js
// Returns how we found them (referral name, event, linkedin, cold)
function _pOpener(ctx) { ... }

// Returns their #1 specific signal from reasonCodes
function _pSignal(ctx) { ... }

// Returns their #2 signal for depth
function _pSignal2(ctx) { ... }

// Returns nextEvent timing hook
function _pTiming(ctx) { ... }

// Returns city/state geo string
function _pGeo(ctx) { ... }
```

#### Step 2 — Rewrite `_TEMPLATES.email` angles to use these helpers
Each template function already receives `ctx` with the full prospect data. They just don't use most of it. Example of what Direct/A should look like for `executive_transition`:

```
${firstName},

${_pOpener(ctx)} — specifically your background at ${company} and ${_pSignal(ctx)}.

Executives navigating transitions like yours often find that the first 90 days set the tone for everything — pension timing, equity treatment, severance tax strategy. Most get to those decisions too late.

I specialize in this window specifically. Worth ${cta}?

[Your Name]
[Firm]
```

vs. the current generic: *"I work with executives who are navigating career transitions..."*

#### Step 3 — Rewrite LinkedIn, Call, Voicemail templates the same way
- **LinkedIn:** 300 char max. Use `_pOpener` + `_pSignal` compressed into one punchy connection note
- **Call Opener:** 2 sentences. Use their specific signal as the hook line
- **Voicemail:** 15-second script. Open with their name, 1 specific hook, soft ask

#### Files to edit:
- `js/outreach_agent.js` lines 220–433 (the entire `_TEMPLATES` block + helpers)

#### Key data fields available on every `ctx.prospect`:
| Field | Example Value |
|---|---|
| `firstName` | `"James"` |
| `lastName` | `"Okafor"` |
| `title` | `"Orthopedic Surgeon"` |
| `company` | `"Southwest Ortho Group"` |
| `city`, `state` | `"Phoenix", "AZ"` |
| `reasonCodes[0]` | `"Partner in 12-physician group"` |
| `reasonCodes[1]` | `"Income est. $700K/yr"` |
| `signals.nextEvent` | `"AMA Conference (Jun 4)"` |
| `signals.relationship` | `"Mutual connection — Dr. Kim"` |
| `signals.estimatedAssets` | `"$2.9M"` |
| `nicheId` | `"physicians"` |

**COMPLIANCE RULE:** Never state asset figures directly. Never say "I know you were laid off." Reference signals obliquely — "your background at X", "your transition timing", "the work you've built at Y."

---

## 📁 Files Modified This Session

| File | Change |
|---|---|
| `js/data.js` | `computeNicheMetrics()` — sort by total desc |
| `js/outreach_agent.js` | Fixed SyntaxError (stray brace after yacht_lifestyle) |
| `js/pages.js` | Auto-trigger → `osInitForProspect()`, draft body placeholder |
| `js/outreach_controller.js` | `_applyVariantToEditor` clears italic placeholder style |

---

## 🏗 Architecture State

### Canonical Lead Collection
- App reads from `lead_assignments` (Firestore)
- `ownerUid` = advisor's Firebase Auth UID
- Jeremy Steward (`Jsteward236@gmail.com`) has **272 enriched leads** assigned

### Jeremy's Account
- UID: set in Firestore under `advisor_pool`
- Niches: `all` (expanded from henrys/physicians/business-owners)
- Lead cap: 500
- Password: js2026

### Outreach Agent Stack (4 agents in `outreach_controller.js`)
1. **ResearchAgent** — gathers prospect context into `enrichedCtx`
2. **StrategyAgent** — picks angle, CTA, channel recommendation
3. **CustomizationAgent** (`outreach_agent.js`) — generates 3 variants (A/B/C)
4. **CadenceAgent** — builds 5-touch follow-up sequence

Entry point: `osInitForProspect(prospectId)` → sets state → calls `OutreachController.run()`

---

## 🔑 Credentials & Config

| Item | Value |
|---|---|
| Firebase Project | `theaumengine` |
| Live URL | https://theaumengine.web.app |
| Jeremy login | Jsteward236@gmail.com / js2026 |
| Apollo credits | Exhausted — enrichment paused |
| PDL | Active dashboard at dashboard.peopledatalabs.com |
| NinjaPear | Active at nubela.co/dashboard/api |

---

## 📌 Last 5 Git Commits

```
f8c2888 feat: Stripe self-serve payment flow
b4c049e docs: C46 handoff — Apollo header fix, NinjaPear migration
c30093d fix: smart router — Apollo X-Api-Key header + NinjaPear migration
f2f933c docs: C45 handoff — name pollution patch, PDL LinkedIn enrichment
8fe613f docs: C44 master handoff — Apollo full sweep, cohort wiring fixes
```

---

## 🚀 Start Next Session With

```
Read HANDOFF_C48.md first.

Then: "Continue the Outreach Agent deep personalization task —
rewrite js/outreach_agent.js _TEMPLATES block with the
_pOpener/_pSignal/_pTiming helpers and wire personalization
into all 4 channels (email, linkedin, call, voicemail).
All context is in HANDOFF_C48.md."
```
