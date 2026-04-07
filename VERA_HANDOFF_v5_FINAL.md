# THE AUM ENGINE
## VERA MASTER HANDOFF — v5 FINAL
**Prepared:** April 7, 2026 · 10:10 AM CDT
**Conversation:** f13b7f7f-9df7-4fee-9aa1-669bb8a7b09e (current session)
**Previous:** a0019c6d (Niche Engine v2.0), 4065a723 (Enterprise Intelligence)
**Status:** Production LIVE · Phase 2.0 Complete · Firestore per-user data active
**Prepared by:** Antigravity AI (Kosal's dev agent)

---

## TABLE OF CONTENTS
1. [Project Identity & Credentials](#1-project-identity--credentials)
2. [Live URLs & Environment](#2-live-urls--environment)
3. [Complete File Inventory](#3-complete-file-inventory)
4. [Architecture Overview](#4-architecture-overview)
5. [Firebase Configuration](#5-firebase-configuration)
6. [Firestore Per-User Data Layer](#6-firestore-per-user-data-layer)
7. [Authentication System](#7-authentication-system)
8. [Cockpit Navigation & Routing](#8-cockpit-navigation--routing)
9. [Niche Mapping Engine v2.1](#9-niche-mapping-engine-v21)
10. [Complete Function Reference](#10-complete-function-reference)
11. [Data Layer (data.js)](#11-data-layer-datajs)
12. [CSS Architecture](#12-css-architecture)
13. [localStorage Key Registry](#13-localstorage-key-registry)
14. [Deployment Procedures](#14-deployment-procedures)
15. [Audit Results (April 7, 2026)](#15-audit-results-april-7-2026)
16. [Known Issues & Watch List](#16-known-issues--watch-list)
17. [Next Session Priorities](#17-next-session-priorities)
18. [Quick Reference Card](#18-quick-reference-card)

---

## 1. PROJECT IDENTITY & CREDENTIALS

| Field | Value |
|---|---|
| **Brand name** | The AUM Engine |
| **Internal codename** | Diamond Mining (NEVER rename the folder) |
| **Local path** | `/Users/kosalprum/Documents/AdvDiamondMining/` |
| **GitHub repo** | `https://github.com/kprum1/alfred-clawbot` |
| **GitHub path within repo** | `theaumengine/marketing-site/` |
| **Firebase project ID** | `theaumengine` |
| **Firebase plan** | Spark (free) — sufficient for pilot phase |
| **Owner email** | kprum1@gmail.com |
| **Test login** | test@test.com / test2026 |

### GitHub Sync Command
```bash
rsync -av --exclude='.firebase' /Users/kosalprum/Documents/AdvDiamondMining/ \
  /Users/kosalprum/Documents/alfred-clawbot/theaumengine/marketing-site/

cd /Users/kosalprum/Documents/alfred-clawbot
git add theaumengine/marketing-site/
git commit -m "feat(theaumengine): describe changes here"
git push
```

---

## 2. LIVE URLs & ENVIRONMENT

| URL | Status | Notes |
|---|---|---|
| `https://www.theaumengine.com` | ✅ Live (primary) | Custom domain via Firebase |
| `https://theaumengine.web.app` | ✅ Live (Firebase) | Always works, same content |
| `https://theaumengine.firebaseapp.com` | ✅ Live (Firebase) | Alias |
| `file:///Users/kosalprum/Documents/AdvDiamondMining/index.html` | ✅ Local preview | Open in browser for fast dev iteration |

### DNS (Verified April 6, 2026 — Stable)
- `www.theaumengine.com` → Firebase Anycast `199.36.158.100` ✅
- `theaumengine.com` naked domain → redirects to www ✅
- Firebase Auth authorized domains: all four above ✅

---

## 3. COMPLETE FILE INVENTORY

```
/Users/kosalprum/Documents/AdvDiamondMining/
│
├── index.html              557 lines   — Two-shell SPA (public landing + authenticated cockpit)
│
├── css/
│   └── main.css          3,429 lines  — ALL styles. Two zones: cockpit (1–1875) + landing (1876+)
│
├── js/
│   ├── auth.js             252 lines  — Firebase Auth controller, login form, onAuthStateChanged
│   ├── db.js               101 lines  — Firestore per-user data layer (Phase 2.0 — NEW)
│   ├── data.js           ~350 lines   — All prospect/niche/ICP data; ICP_CONFIG initialized here
│   ├── niche_engine.js     555 lines  — 85-question bank + adaptive path selection + scoring
│   ├── pages.js            969 lines  — All 8 cockpit page renderers (HTML template functions)
│   └── app.js              843 lines  — Router, state machine, all action handlers
│
├── assets/
│   └── og-image.png     1200×630px   — Dark navy social card (used as favicon too)
│
├── firebase.json                      — Hosting config (rewrites all to index.html)
├── .firebaserc                        — Project: theaumengine
│
├── PILOT_LAUNCH_PLAN.md               — Full pilot charter: onboarding, metrics, GTM, 30/60/90
├── VERA_HANDOFF_v4.md                 — Previous handoff (Phase 1.3 · April 6 · SUPERSEDED)
├── VERA_HANDOFF_v5.md                 — Phase 2.0 handoff (April 7 · use this)
└── VERA_HANDOFF_v5_FINAL.md           — THIS FILE
```

### Script Load Order in index.html (CRITICAL — do not reorder)
```html
<!-- Firebase SDKs must load before any app scripts -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>

<!-- App scripts in dependency order -->
<script src="js/data.js"></script>          <!-- 1st: defines ICP_CONFIG, NICHES, PROSPECTS -->
<script src="js/niche_engine.js"></script>  <!-- 2nd: depends on nothing, defines engine fns -->
<script src="js/db.js"></script>            <!-- 3rd: depends on firebase being loaded -->
<script src="js/pages.js"></script>         <!-- 4th: depends on data.js and niche_engine.js -->
<script src="js/app.js"></script>           <!-- 5th: depends on all above -->
<script src="js/auth.js"></script>          <!-- 6th: LAST — triggers auth state, calls app fns -->
```

> **Why auth.js is LAST:** `onAuthStateChanged` fires immediately, calling `initWithUserData()`, `navigate()`, and `bindPageEvents()` which all live in app.js. If app.js isn't loaded first, these will throw undefined errors.

---

## 4. ARCHITECTURE OVERVIEW

### Two-Shell SPA Pattern
```
┌─────────────────────────────────────────────────────┐
│  index.html                                         │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ #public-shell  (display:block by default)    │   │
│  │   pub-header, hero, why, different,          │   │
│  │   how, offer, faq, pub-footer                │   │
│  │   auth-modal-overlay (always in DOM)         │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ #app-shell  (display:none by default)        │   │
│  │   .sidebar → nav-items (8 pages)             │   │
│  │   .main-content → rendered by pages.js       │   │
│  │   .prospect-drawer → slide-in details        │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  #toast-container (outside both shells)             │
└─────────────────────────────────────────────────────┘
```

**Shell switching** is handled exclusively by `auth.js → onAuthStateChanged()`:
- User authenticated → `showAppShell()` → hides public, shows cockpit, `body.app-mode`
- User not authenticated → `showPublicShell()` → hides cockpit, shows landing, `body.public-mode`

### Page Render Pipeline
```
User clicks nav-item
  → navigate(pageId)            [app.js:95]
    → currentPage = pageId
    → updates .nav-item .active state
    → renderPage()              [app.js:117]
      → calls pageXxx()         [pages.js]
        → returns HTML string
      → document.getElementById('main-content').innerHTML = html
      → bindPageEvents()        [app.js:827]
```

### Data Flow on Login
```
User submits email + password
  → auth.js: auth.signInWithEmailAndPassword()
    → Firebase Auth succeeds
      → onAuthStateChanged(user) fires
        → currentUID = user.uid          [auth.js global]
        → showAppShell()                 [auth.js]
        → updateUserDisplay(user)        [auth.js]
        → bootstrapUserData(uid)         [db.js — ASYNC]
          → Promise.all([
              nicheProfile doc,
              nicheAnswers doc,
              icpConfig doc
            ])
          → initWithUserData(data)       [app.js]
            → hydrates nicheProfile, nicheAnswers, ICP_CONFIG
            → sets nicheWizardStage = 4 if profile exists
        → navigate('command-center')    [app.js]
        → bindPageEvents()              [app.js]
```

---

## 5. FIREBASE CONFIGURATION

### Config Object (in auth.js — DO NOT CHANGE)
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg",  // ← CAPITAL F — was broken before
  authDomain: "theaumengine.firebaseapp.com",
  projectId: "theaumengine",
  storageBucket: "theaumengine.firebasestorage.app",
  messagingSenderId: "938002241793",
  appId: "1:938002241793:web:756cdb9f01674456e66300"
};
```

> ⚠️ **CRITICAL BUG HISTORY:** The `apiKey` previously had lowercase `f` in `AEFh` (`AEfh2b7...`). This broke ALL logins for multiple sessions. Always verify the key starts `AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg`. Capital F.

### Firebase Console URLs
| Resource | Direct URL |
|---|---|
| Project overview | https://console.firebase.google.com/project/theaumengine/overview |
| Auth users | https://console.firebase.google.com/project/theaumengine/authentication/users |
| Firestore | https://console.firebase.google.com/project/theaumengine/firestore |
| Firestore Rules | https://console.firebase.google.com/project/theaumengine/firestore/rules |
| Hosting | https://console.firebase.google.com/project/theaumengine/hosting |

### Auth Method
- Email/Password ONLY — no Google, no magic links, no self-signup
- Accounts provisioned manually in Firebase Auth console by admin
- Password reset flow available (uses `sendPasswordResetEmail`)

---

## 6. FIRESTORE PER-USER DATA LAYER

### Why It Exists (Phase 2.0 Rationale)
Before April 7, all advisor data (niche profile, in-progress answers, ICP config) lived in `localStorage` — browser-specific, not user-specific. An advisor who logged in on a second browser or device lost all their data. Phase 2.0 moves critical data to Firestore, keyed by Firebase Auth UID.

### Collection Structure
```
Firestore root
└── users/                              (collection)
    └── {uid}/                          (document — one per advisor)
        └── data/                       (sub-collection)
            ├── nicheProfile            (document)
            │   ├── top3[]
            │   │   ├── id              string  — niche identifier (e.g. 'n1')
            │   │   ├── name            string  — e.g. "Aircraft Owners"
            │   │   ├── icon            string  — emoji
            │   │   ├── score           number  — 0–100
            │   │   ├── rank            number  — 1, 2, or 3
            │   │   ├── zoneBreakdown   object  — {fit, focus, market, access, service}
            │   │   └── description     string  — niche description
            │   ├── messagingAngle      string  — recommended positioning copy
            │   ├── icpBlock            object  — generated ICP fields
            │   ├── completedAt         string  — ISO timestamp
            │   ├── path                object  — {macro[], meso[], micro[]} question IDs used
            │   └── updatedAt           string  — ISO timestamp (auto-set by db.js)
            │
            ├── nicheAnswers            (document — partial session cache)
            │   ├── answers             object  — {[questionId]: answerIndex (0-4)}
            │   └── updatedAt           string
            │
            └── icpConfig               (document)
                ├── primaryNiche        string
                ├── minAssets           string
                ├── geography           string
                ├── professions         string
                ├── lifeEventTriggers   string
                ├── messagingAngle      string
                └── updatedAt           string
```

### Firestore Security Rules (LIVE as of April 7, 9:55 AM)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
**Translation:** Each authenticated user can ONLY read/write documents under their own `users/{their-uid}/` path. No cross-user data access. Service accounts bypass rules.

### db.js — Full API Reference
All functions are `async` and return Promises. Errors are caught internally with `console.warn` — they NEVER throw, so the app degrades gracefully to localStorage if Firestore is unavailable.

```javascript
// ── Internal ──────────────────────────────────────────────────────────────
_getDB()
  // Returns firebase.firestore() instance (lazy-initialized, cached in _db)

_userDoc(uid, docName)
  // Returns DocumentReference: users/{uid}/data/{docName}

// ── Niche Profile ──────────────────────────────────────────────────────────
async saveNicheProfileToFirestore(uid, profile)
  // Saves completed niche profile. Adds updatedAt timestamp automatically.
  // Called from: app.js _computeAndShowResults()

async loadNicheProfileFromFirestore(uid)
  // Returns profile object or null if no profile exists yet.
  // Called from: db.js bootstrapUserData() on login

// ── Niche Answers (in-progress cache) ────────────────────────────────────
async saveNicheAnswersToFirestore(uid, answers)
  // Saves partial answers {questionId: answerIndex} — called after EVERY answer selection.
  // If answers is {} (empty object), effectively clears the answers doc.

async loadNicheAnswersFromFirestore(uid)
  // Returns answers object or {} empty object. Never returns null.

// ── ICP Config ────────────────────────────────────────────────────────────
async saveICPConfigToFirestore(uid, cfg)
  // Saves ICP settings. Called from app.js saveICP() after advisor edits.

async loadICPConfigFromFirestore(uid)
  // Returns icpConfig object or null.

// ── Bulk Operations ───────────────────────────────────────────────────────
async clearNicheDataFromFirestore(uid)
  // Batch-deletes BOTH nicheProfile and nicheAnswers docs in one commit.
  // Called from: app.js resetNicheWizard()

async bootstrapUserData(uid)
  // Parallel fetch of all 3 docs. Returns:
  // { nicheProfile: object|null, nicheAnswers: object, icpConfig: object|null }
  // Called from: auth.js onAuthStateChanged() on every login.
```

### Dual-Write Pattern (Firestore + localStorage)
The system writes to BOTH simultaneously on every save:

```
advisor answers question
  → selectNicheAnswer(questionId, idx)   [app.js]
    → nicheAnswers[questionId] = idx     (in-memory)
    → _saveAnswersCache()                [app.js]
      → localStorage.setItem('aumNicheAnswers', JSON.stringify(nicheAnswers))
      → saveNicheAnswersToFirestore(currentUID, nicheAnswers)   [db.js — async, fire-and-forget]

advisor completes assessment
  → _computeAndShowResults()            [app.js]
    → nicheProfile = generateNicheProfile(scores, path)
    → localStorage.setItem('aumNicheProfile', JSON.stringify(nicheProfile))
    → saveNicheProfileToFirestore(currentUID, nicheProfile)    [db.js — async]
    → saveNicheAnswersToFirestore(currentUID, {})               [db.js — clears partial answers]
```

**Priority on load:**
1. Firestore (loaded asynchronously on login via `bootstrapUserData`)
2. localStorage (used as immediate fallback if Firestore unavailable or offline)

### Phase A vs Phase B
| Data | Phase A (Live) | Phase B (Future) |
|---|---|---|
| Niche profile | ✅ Firestore | — |
| Niche answers (partial) | ✅ Firestore | — |
| ICP Config | ✅ Firestore | — |
| Prospects / Leads | ❌ Hardcoded in data.js | Migrate to `users/{uid}/prospects/` |
| Notes | ❌ localStorage only | Phase B |
| Feedback (thumbs) | ❌ localStorage only | Phase B |

---

## 7. AUTHENTICATION SYSTEM

### auth.js Key Responsibilities
1. **Firebase init** → `firebase.initializeApp(firebaseConfig)` (only happens once)
2. **Auth state listener** → `onAuthStateChanged(async user => {...})`
3. **Modal management** → `openAuthModal()` / `closeAuthModal()` (exposed as `window.*` globals)
4. **Login form** → email + password → `signInWithEmailAndPassword()`
5. **Password reset** → `sendPasswordResetEmail(email)`
6. **Logout** → `auth.signOut()` on `#logout-btn` click
7. **UI updates** → Sets `#user-display-name` and `#user-display-email` in sidebar footer
8. **Public UX** → Scroll effect on `.pub-header`, FAQ accordion, sample board click → modal

### Global Variables Exposed by auth.js
```javascript
let currentUID = null;
// Set to user.uid when authenticated, null when logged out.
// Used by ALL Firestore functions in db.js and save functions in app.js.
// This is the ONLY cross-file UID reference — everything reads from here.

window.openAuthModal  = function() {...}
window.closeAuthModal = function() {...}
// Exposed as window.* so inline onclick handlers in the HTML can call them.
```

### Error Message Map (login form)
```javascript
'auth/user-not-found'     → 'No account found with that email.'
'auth/wrong-password'     → 'Incorrect password. Please try again.'
'auth/invalid-email'      → 'Please enter a valid email address.'
'auth/too-many-requests'  → 'Too many attempts. Please wait a moment.'
'auth/invalid-credential' → 'Invalid email or password.'
// Catch-all:             → 'Sign-in failed. Please try again.'
```

### Adding a New Pilot Account
Go to: Firebase Console → Authentication → Users → Add user
- Enter email + password manually
- User gets access immediately on next login

---

## 8. COCKPIT NAVIGATION & ROUTING

### All 8 Pages
| Page Title | Route Key | Render Function | nav-item id |
|---|---|---|---|
| Command Center | `command-center` | `pageCommandCenter()` | `nav-command-center` |
| Prospect Mine | `prospect-mine` | `pageProspectMine()` | `nav-prospect-mine` |
| Lead Scoreboard | `lead-scoreboard` | `pageLeadScoreboard()` | `nav-lead-scoreboard` |
| Niche Mapping | `niche-mapping` | `pageNicheMapping()` | `nav-niche-mapping` |
| Outreach Studio | `outreach-studio` | `pageOutreachStudio()` | `nav-outreach-studio` |
| Nurture & Booking | `nurture-booking` | `pageNurtureBooking()` | `nav-nurture-booking` |
| Meeting Prep | `meeting-prep` | `pageMeetingPrep()` | `nav-meeting-prep` |
| Manager Console | `manager-console` | `pageManagerConsole()` | `nav-manager-console` |
| Settings & ICP | `settings` | `pageSettingsICP()` | `nav-settings` |

### Router Logic (app.js:95 `navigate()`)
```javascript
function navigate(page) {
  currentPage = page;
  // Remove active from all nav-items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // Add active to current
  document.getElementById('nav-' + page)?.classList.add('active');
  // Special handling: niche-mapping checks stage and maybe restores saved profile
  if (page === 'niche-mapping') { /* auto-restore logic */ }
  renderPage();
}
```

### Auto-Restore on Niche Mapping Nav
When user navigates to `niche-mapping`, `navigate()` checks:
1. If `nicheProfile !== null` AND `nicheWizardStage === 0` → sets stage to 4 (show results)
2. If `nicheProfile === null` → stage stays 0 (show fresh assessment)
This ensures the profile is always shown without re-running the quiz.

---

## 9. NICHE MAPPING ENGINE v2.1

### 5-Stage Flow
```
Stage 0 → Stage 1 → Stage 2   → Stage 3  → Stage 4
Macro     Quick     Cluster     Niche      Results
Scan      Preview   Refinement  Deep Dive  (saved)
8 Q's     (scored   8-9 Q's    6-10 Q's
           preview)
```

**Stage number meanings (in `nicheWizardStage`):**
```
0 = Macro Scan       — 8 baseline questions, always shown
1 = Quick Preview    — No questions; shows top-3 preliminary matches
2 = Cluster Refine   — Meso-layer questions (niche cluster focus)
3 = Niche Deep Dive  — Micro-layer questions (specific niche deep)
4 = Results          — Final profile displayed, saved to Firestore
```

### Stage 1 — Quick Preview (NEW in v2.1)
After all 8 macro questions are answered and advisor clicks "Next":
1. `advanceNicheWizard()` detects `stage === 0` and all macro questions answered
2. Calls `selectAssessmentPath(nicheAnswers, 25)` → builds adaptive path → stores in `nichePath`
3. Calls `scoreNicheMapping(nicheAnswers, path)` → scores macro-only → stores in `nichePreviewScores`
4. Sets `nicheWizardStage = 1`
5. `pageNicheMapping()` renders "Your Early Niche Read" page:
   - Blue info callout: "This is your early signal — not your final score"
   - Top 3 preliminary niche cards (labeled "Early Lead / Strong Candidate / Possible Fit")
   - Zone bars at 70% opacity with asterisk: "*Scores will sharpen after N more questions"
   - Two CTAs: "Use Early Results" (skips to results immediately) | "Refine My Results → (N questions)"

### niche_engine.js — Key Functions
```javascript
// ── Public API ────────────────────────────────────────────────────────────

selectAssessmentPath(answers, maxTotal = 25)
  // Takes macro answers, returns adaptive path object:
  // { macro: Question[], meso: Question[], micro: Question[], topNiches: string[] }
  // maxTotal caps total questions shown (default 25: 8 macro + ~9 meso + ~8 micro)
  // Adaptive: picks meso cluster based on macro scores, picks micro niche based on meso

scoreNicheMapping(answers, path)
  // Scores all answered questions against all 12 niches
  // Returns { nicheScores: {[nicheId]: number}, zoneScores: {[nicheId]: {zone: %}} }
  // Note: only works on answered questions — safe to call on partial answers for preview

generateNicheProfile(scores, path)
  // Converts scores into final profile object:
  // { top3[], messagingAngle, icpBlock, completedAt, path }
  // top3 sorted descending by score, max 3
```

### Question Bank Structure
```
niche_engine.js contains 3 layers:

MACRO_QUESTIONS (8 questions — always shown, in fixed order)
  id: 'm1' through 'm8'
  zones: fit / access / focus / service / market
  4-point Likert scale (0=Not at all → 4=Absolutely/Strongly)

MESO_QUESTIONS (~25 questions — adaptive, shown based on macro scores)
  id: 'c1' through ~'c25'
  clusters: licensed-professionals / owners-builders / corporate-executives / money-in-motion
  Selected based on which clusters scored highest in macro

MICRO_QUESTIONS (~52 questions — niche-specific deep dive)
  id format: '{nicheId}-{n}' (e.g., 'n1-1', 'n5-3')
  3-5 questions per niche, across all zones
  Selected based on top 2 niches from meso scoring
```

### The 12 Niches
| ID | Icon | Name | Color |
|---|---|---|---|
| n1 | ✈️ | Aircraft Owners | #60a5fa |
| n2 | 🏢 | Business Owners | #a78bfa |
| n3 | 🎗️ | Charity Board Members | #34d399 |
| n4 | 💰 | Inheritance Recipients | #fbbf24 |
| n5 | 👩‍⚕️ | Physicians & Surgeons | #fb7185 |
| n6 | 🚀 | HENRYs | #22d3ee |
| n7 | 🤖 | AI-Displaced Executives | #f59e0b |
| n8 | 🦷 | Dentists & Specialists | #818cf8 |
| n9 | 🔧 | High Earning Tradesman | #38bdf8 |
| n10 | ⚖️ | Law Partners | #e879f9 |
| n11 | 💼 | C-Suite Executives | #94a3b8 |
| n12 | 🏗️ | Real Estate Developers | #2dd4bf |

### 5 Scoring Zones
| Zone | What It Measures |
|---|---|
| `fit` | Background alignment — have you worked with this niche before? |
| `focus` | Specialization depth — how much of your book is this niche? |
| `market` | Local market opportunity — is this niche present in your market? |
| `access` | Network entry points — do you have relationships or referral paths in? |
| `service` | Service model match — does your planning approach fit this niche's needs? |

### Results Page (Stage 4)
```javascript
// Header actions (4 compact buttons):
↺ Retake         → resetNicheWizard()      — clears everything + Firestore
⬇ JSON           → downloadNicheProfile()  — saves .json file
🖨️ Print / PDF   → printNicheProfile()     — opens print window
✓ Apply to ICP   → applyProfileToSettings() — auto-fills Settings & ICP form + navigates

// Sub-header:
"Completed [date] · 25 questions · auto-saved to this device"

// Progress bar:
MACRO SCAN → QUICK PREVIEW → CLUSTER REFINEMENT → NICHE DEEP DIVE → RESULTS

// Green saved banner:
"💾 Profile saved to this device · Automatically restored on every visit"
[Change Niche] button → calls resetNicheWizard()

// For each of top-3 niches:
- Rank badge (#1 BEST FIT / #2 STRONG MATCH / #3 GOOD MATCH)
- Score ring (colored, CSS custom property --pct)
- Zone bars (5 bars: fit/focus/market/access/service)
- Recommended messaging angle (blockquote)

// Bottom section:
- GENERATED ICP PROFILE table (Primary Niche, Min Assets, Geography, etc.)
- Apply CTA: [Go to Mine →] [Apply ICP + Go to Settings]
```

### Print to PDF (`printNicheProfile()`)
```javascript
// Opens new window with branded white-background HTML
// Content: header, niche cards, zone bars, ICP table, footer
// Footer text: "Confidential advisor use only · theaumengine.com"
// Auto-prints after 600ms delay via window.print()
// .no-print CSS class hides on-screen Print button during actual print
// Advisor uses browser "Save as PDF" option
```

### JSON Export (`downloadNicheProfile()`)
```javascript
// Creates Blob with {top3, zoneBreakdown, icpProfile, messagingAngle, completedAt}
// Filename: aum-niche-profile-[niche-name]-[YYYY-MM-DD].json
// Triggers browser download via URL.createObjectURL + click
```

---

## 10. COMPLETE FUNCTION REFERENCE

### app.js — All 48 Functions

#### Theme Management
| Function | Line | Description |
|---|---|---|
| `toggleTheme()` | 11 | Switches dark/light, saves to `aumTheme` localStorage |
| `syncThemeButton()` | 20 | Syncs button icons to current theme (called on login) |
| `_syncAllThemeButtons(theme)` | 25 | Updates cockpit sidebar + landing header theme buttons |

#### Firestore / Cache
| Function | Line | Description |
|---|---|---|
| `_saveAnswersCache()` | 55 | Dual-writes nicheAnswers to localStorage + Firestore |
| `_loadAnswersCache()` | 62 | Reads from localStorage (fallback) |
| `_clearAnswersCache()` | 68 | Removes aumNicheAnswers + aumNicheProfile from localStorage |
| `initWithUserData(data)` | 73 | Called by auth.js on login; hydrates app state from Firestore bootstrap data |

#### Navigation & Rendering
| Function | Line | Description |
|---|---|---|
| `navigate(page)` | 95 | Updates currentPage, sets nav active state, calls renderPage() |
| `renderPage()` | 117 | Calls the right pageXxx() function and injects HTML into main-content |

#### Prospect Actions
| Function | Line | Description |
|---|---|---|
| `startMining()` | 140 | Triggers mining animation toast (demo) |
| `selectNiche(id)` | 153 | Sets activeNiche for filtering |
| `setFilter(key, val)` | 425 | Updates activeFilters for prospect board |
| `filterProspects(q)` | 426 | Filters PROSPECTS by query + activeFilters |

#### Niche Wizard State Machine
| Function | Line | Description |
|---|---|---|
| `selectNicheAnswer(questionId, idx)` | 162 | Records answer, saves answer cache, updates UI |
| `_currentStageQuestions()` | 176 | Returns questions for current stage from nichePath |
| `refreshWizardNavState()` | 184 | Updates Next button enabled/disabled state |
| `advanceNicheWizard()` | 205 | Advances stage; builds path at stage 0→1, shows preview at stage 1 |
| `_computeAndShowResults()` | 239 | Full scoring pass → profile → dual-write → stage 4 |
| `backNicheWizard()` | 258 | Goes back one stage (used in Quick Preview) |
| `scoreAndShowResults()` | 263 | Legacy alias → calls `_computeAndShowResults()` |
| `resetNicheWizard()` | 267 | Clears all niche state, localStorage, Firestore, re-renders |
| `viewSavedProfile()` | 281 | Sets stage = 4, renders results from cached nicheProfile |
| `printNicheProfile()` | 291 | Generates branded print window → PDF |
| `downloadNicheProfile()` | 394 | Downloads niche profile as .json file |
| `applyProfileToSettings()` | 417 | Pre-fills ICP form from profile, navigates to settings |

#### Outreach
| Function | Line | Description |
|---|---|---|
| `setOutreachProspect(id)` | 433 | Selects prospect in Outreach Studio |
| `selectOutreachType(type)` | 437 | Switches email/LinkedIn tab |
| `regenerateDraft()` | 451 | Simulates draft regeneration (demo) |
| `copyDraft()` | 458 | Copies draft to clipboard |

#### Pipeline / CRM
| Function | Line | Description |
|---|---|---|
| `setActiveMeeting(id)` | 465 | Navigates to Meeting Prep with selected prospect |
| `saveICP()` | 471 | Reads ICP form, saves to ICP_CONFIG, localStorage, Firestore |
| `saveNotes(prospectId)` | 490 | Saves meeting notes to NOTES_STORE + localStorage |
| `saveFeedback(prospectId, vote)` | 499 | Saves thumbs up/down + notes to FEEDBACK_STORE + localStorage |
| `getFeedbackHTML(prospectId)` | 528 | Returns feedback UI HTML for a prospect |

#### Data Import/Export
| Function | Line | Description |
|---|---|---|
| `triggerCSVImport()` | 549 | Opens file picker for CSV import |
| `handleCSVImport(input)` | 554 | Parses CSV and merges into PROSPECTS array |
| `exportCSV()` | 574 | Exports PROSPECTS array to .csv download |
| `triggerEnrichmentImport()` | 757 | Opens file picker for enrichment CSV |
| `handleEnrichmentCSV(input)` | 769 | Merges enrichment data into existing prospects |

#### Prospect Drawer
| Function | Line | Description |
|---|---|---|
| `openDrawer(id)` | 587 | Finds prospect, renders drawer HTML, slides in |
| `closeDrawer()` | 654 | Slides out drawer, clears content |
| `buildEnrichmentPanel(prospectId)` | 660 | Renders the enrichment signals tab |

#### UI Utilities
| Function | Line | Description |
|---|---|---|
| `switchTab(btn, groupId)` | 812 | Generic tab switcher for drawer tabs |
| `showToast(msg, icon)` | 818 | Shows green toast notification (2.5s auto-dismiss) |
| `bindPageEvents()` | 827 | Binds any post-render event listeners needed |

### db.js — All 9 Functions
(See Section 6 for full API reference)

### auth.js — Key Functions
| Function | Description |
|---|---|
| `showAppShell()` | Hides public-shell, shows app-shell, adds body.app-mode |
| `showPublicShell()` | Hides app-shell, shows public-shell, adds body.public-mode |
| `openAuthModal()` | Shows login modal, focused on email field |
| `closeAuthModal()` | Hides login modal, resets form |
| `setAuthError(msg)` | Shows error message in modal |
| `clearAuthError()` | Clears error message |
| `setAuthLoading(loading)` | Enables/disables submit button with loading text |
| `updateUserDisplay(user)` | Sets sidebar name + email from Firebase user object |

---

## 11. DATA LAYER (data.js)

### ICP_CONFIG (Default Values)
```javascript
const ICP_CONFIG = JSON.parse(localStorage.getItem('aumEngineICP') || 'null') || {
  primaryNiche:       'Business Owners (50–65)',
  minAssets:          '$1M',
  ageMin:             50,
  ageMax:             65,
  geography:          'Phoenix Metro AZ, Dallas TX, Overland Park KS',
  professions:        'Business owners, Physicians, Pilots, Board members',
  lifeEventTriggers:  'Business sale, Inheritance, Retirement, Divorce',
  messagingAngle:     'We help [niche] who are navigating [key transition] build a...'
};
```
Note: ICP_CONFIG is initialized in data.js but mutated by `saveICP()` in app.js and `initWithUserData()` when Firestore data is loaded.

### PROSPECTS Schema
```javascript
{
  id:            string   // 'p1' through 'p25'
  name:          string   // "First Last"
  niche:         string   // matches NICHES[].name
  nicheId:       string   // 'n1' through 'n7' (7 niches in demo data)
  title:         string   // job title
  company:       string
  location:      string
  assets:        string   // "$Xm" estimated AUM
  fitScore:      number   // 0–100
  timingScore:   number   // 0–100
  priorityScore: number   // 0–100 (composite)
  status:        string   // pipeline stage (see below)
  assignedRep:   string   // 'Big Nate' | 'Chris Vance' | 'Maria Lopes' | 'Unassigned'
  signals:       string[] // wealth/timing signals list
  source:        string   // data source label
  tags:          string[] // optional tags
  enrichment:    object   // optional: {linkedIn, email, phone, notes}
}
```

### Pipeline Stages (7 stages)
```
'New'               → Just added, not yet touched
'Contacted'         → Initial outreach sent
'Engaged'           → Response received
'Nurture'           → Long-term follow-up cadence
'Meeting Requested' → Advisor asked for meeting
'Booked'            → Meeting confirmed on calendar
'Dead'              → Disqualified or ghosted
```

### Demo Prospect Count
- 25 prospects in data.js (demo/pilot data)
- 7 niches represented across the 25 prospects

---

## 12. CSS ARCHITECTURE

### Two-Zone System
```
css/main.css (3,429 lines total)
├── Zone 1: Lines 1–1875    → COCKPIT CSS
│   - :root variables
│   - body.app-mode layout
│   - sidebar, nav-items
│   - page-header, page-actions
│   - wizard-shell, wizard-progress
│   - likert buttons, niche cards
│   - prospect drawer, enrichment panel
│   - pipeline board
│   - toast notifications
│
└── Zone 2: Lines 1876–end  → LANDING PAGE CSS
    - All prefixed: .pub-*, .lp-*, .hero-*, .vp-*, .faq-*
    - Auth modal: .auth-modal-overlay, .auth-modal
    - Comparison strip, offer block, social proof
```

> ⚠️ **DO NOT mix zones.** Landing styles MUST use `.pub-` / `.lp-` / `.hero-` prefixes. Cockpit uses unprefixed class names. Mixing causes layout bleed.

### CSS Variables (`:root`)
```css
--blue:         #60a5fa
--violet:       #a78bfa
--cyan:         #22d3ee
--emerald:      #34d399
--amber:        #fbbf24
--rose:         #fb7185
--gem-gradient: linear-gradient(135deg, #60a5fa, #a78bfa)
--bg-card:      rgba(255,255,255,0.04)
--text-primary: #f0f4ff
--text-secondary: #94a3b8
--text-muted:   #64748b
--border-default: rgba(255,255,255,0.08)
--border-accent:  rgba(96,165,250,0.3)
--transition:   0.2s ease
```

### Light Mode
Theme is toggled via `data-theme="light"` on `<html>`. The CSS has `:root[data-theme="light"]` overrides. Key differences:
- `--bg-card` → lighter rgba
- `--text-primary` → near-black
- Sidebar background lightens

### Key Component CSS Classes
```css
/* Niche Wizard */
.wizard-shell          — max-width:820px, centered, padding
.wizard-progress-wrap  — 5-step progress bar
.wizard-question       — question card (has .answered state)
.likert-btn            — 5 answer buttons (has .selected state)
.niche-result-card     — result card (.rank-1/.rank-2/.rank-3 color modifiers)
.match-ring            — circular score ring (--pct and --niche-color CSS vars)
.zone-breakdown-row    — zone bar row inside result card
.saved-profile-banner  — green "saved" banner block
.zone-badge            — colored zone label pill

/* Layout */
.page-header           — flex row: left title + right actions
.page-header-left      — title + subtitle stack
.page-actions          — flex gap-8px, flex-shrink:0 (buttons DON'T wrap)
.page-title            — 20px semibold
.page-subtitle         — 12px muted

/* Buttons */
.btn                   — base button style
.btn-primary           — blue gradient fill
.btn-secondary         — glass/outline style
.btn-ghost             — transparent, subtle hover

/* Apply CTA (bottom of results) */
.apply-cta             — flex row with text + action buttons
.apply-cta-actions     — button group
```

---

## 13. LOCALSTORAGE KEY REGISTRY

| Key | Type | Set By | Content |
|---|---|---|---|
| `aumTheme` | string | `toggleTheme()` | `'dark'` or `'light'` — device preference, stays localStorage forever |
| `aumNicheAnswers` | JSON | `_saveAnswersCache()` | `{questionId: answerIndex}` — in-progress wizard answers |
| `aumNicheProfile` | JSON | `_computeAndShowResults()` | Full profile object — offline fallback for Firestore |
| `aumEngineICP` | JSON | `saveICP()`, `data.js init` | ICP config fields — offline fallback for Firestore |
| `aumEngineNotes` | JSON | `saveNotes()` | `{prospectId: noteText}` — Phase B will migrate to Firestore |
| `aumEngineFeedback` | JSON | `saveFeedback()` | `{prospectId: {vote, note, ts}}` — Phase B will migrate to Firestore |

**Clear all niche data (browser console):**
```javascript
localStorage.removeItem('aumNicheProfile');
localStorage.removeItem('aumNicheAnswers');
localStorage.removeItem('aumEngineICP');
// Then: resetNicheWizard() to also clear Firestore and reset in-memory state
```

---

## 14. DEPLOYMENT PROCEDURES

### Standard Deploy
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
firebase deploy --only hosting --project theaumengine
```
Expected output: "✔  Deploy complete!" + Hosting URL and Project Console links.
Deploy time: ~15–30 seconds.

### GitHub Sync (run after every successful deploy)
```bash
rsync -av --exclude='.firebase' --exclude='node_modules' \
  /Users/kosalprum/Documents/AdvDiamondMining/ \
  /Users/kosalprum/Documents/alfred-clawbot/theaumengine/marketing-site/

cd /Users/kosalprum/Documents/alfred-clawbot
git add theaumengine/marketing-site/
git commit -m "feat(theaumengine): [describe what changed]"
git push origin main
```

### firebase.json (current)
```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```
The rewrite sends all paths to index.html (SPA mode).

### Deployment History
| Date | Version | Key Changes |
|---|---|---|
| April 5 | v1.0 | Initial landing page + cockpit shell |
| April 6 | v1.3 | Firebase Auth, niche engine v1.0, enterprise intelligence |
| April 7 AM | v2.0 | Niche engine v2.1 (Quick Preview stage), print/PDF, JSON export, save/cache |
| April 7 10:08 AM | v2.0.1 | Compact header buttons (fix overflow on narrow viewports) |
| April 7 10:09 AM | v2.0.1 | Firestore SDK + db.js + per-user data (Phase 2.0) |

---

## 15. AUDIT RESULTS (April 7, 2026)

Full live test run against https://theaumengine.web.app at 10:00 AM CDT.

### Test Results
| # | Component | Status | Detail |
|---|---|---|---|
| 1 | Landing page | ✅ PASS | Hero, 12 niche pills, Pilot Login CTA all visible |
| 2 | Login (test@test.com) | ✅ PASS | Cockpit loads, sidebar nav renders, user name shown |
| 3 | Niche Mapping — results | ✅ PASS | Stage 4 renders correctly from saved profile |
| 4 | 5-stage progress bar | ✅ PASS | All 5 labels visible, "RESULTS" highlighted |
| 5 | "Saved" green banner | ✅ PASS | "💾 Profile saved to this device" visible |
| 6 | Header action buttons (4) | ✅ PASS | ↺ Retake · ⬇ JSON · 🖨️ Print/PDF · ✓ Apply to ICP |
| 7 | JS Console errors | ✅ PASS | Zero red errors, no Firestore permission-denied |
| 8 | Settings & ICP form | ✅ PASS | Fields visible, Save ICP works |
| 9 | Firestore rules | ✅ PASS | Published 9:55 AM, per-user isolation enforced |
| 10 | Dual-write (ICP save) | ✅ PASS | No console errors on save, Firestore confirms write |

### Issues Found & Fixed During Audit
| Issue | Root Cause | Fix Applied |
|---|---|---|
| Print/PDF + Save JSON buttons invisible | 4 buttons overflowed `page-actions` at browser subagent viewport size | Shortened labels: "Retake from Scratch" → "↺ Retake", "Save JSON" → "⬇ JSON", "Apply to ICP & Settings" → "✓ Apply to ICP" |

### Static Code Audit
| Check | Result |
|---|---|
| Duplicate functions in app.js | ✅ None — all 48 functions unique |
| Script load order | ✅ Correct — Firebase → db.js → pages.js → app.js → auth.js |
| All onclick functions resolvable | ✅ All referenced functions exist in app.js |
| localStorage keys consistent | ✅ 6 keys, all with `aum` prefix |
| Firestore wiring | ✅ 5 dual-write sites in app.js confirmed |

---

## 16. KNOWN ISSUES & WATCH LIST

| # | Issue | Severity | Status | Action |
|---|---|---|---|---|
| 1 | HubSpot form inactive | Medium | Open | Replace `YOUR_PORTAL_ID` and `YOUR_FORM_ID` in index.html line 280 |
| 2 | Loom video not embedded | Low | Open | User recording Loom — get URL and put in `#how` section |
| 3 | Social proof is placeholder | Low | Open | Replace with real pilot quote after first 30-day cohort |
| 4 | Prospect data is hardcoded | High | Phase B | Migrate to Firestore `users/{uid}/prospects/` |
| 5 | Notes/Feedback localStorage-only | Medium | Phase B | Migrate to Firestore |
| 6 | No pilot accounts provisioned | High | Pre-launch | Create accounts in Firebase Auth for each pilot advisor |
| 7 | Spark plan quota | Low | Monitor | 50K reads/day free — more than enough for 10 pilots; upgrade to Blaze if scaling |
| 8 | Mobile QA not done | Medium | Pre-launch | QA pass on Safari iOS (iPhone 14 Pro breakpoint) |
| 9 | Niche scores too uniform | Medium | Next session | Test scores showing 20/100 on "Use Early Results" — macro-only scoring may need weight tuning |
| 10 | `backNicheWizard()` Quick Preview | Low | Monitor | "← Back" button in Quick Preview — verify it correctly returns to stage 0 |

---

## 17. NEXT SESSION PRIORITIES

### P0 — Before Pilot Launch
```
[ ] Provision pilot advisor accounts in Firebase Auth console
    → Go to: console.firebase.google.com/project/theaumengine/authentication/users
    → Add user for each pilot: name@firm.com + temporary password
    → Send credentials manually via email

[ ] Mobile QA pass (Safari iOS)
    → Check: hero section, auth modal, cockpit sidebar, niche wizard
    → Priority breakpoints: 390px (iPhone 14), 768px (iPad)
```

### P1 — Near Term
```
[ ] Niche score calibration
    → Problem: "Use Early Results" after only 8 macro questions gives low scores (20/100)
    → Fix: Weight macro-only scoring differently, or update messaging to set expectations
    → File: js/niche_engine.js → scoreNicheMapping() → look at weight normalization

[ ] Embed Loom walkthrough video
    → Location: index.html → #how section → replace placeholder OR add after how-steps div
    → Format: <div class="video-embed"><iframe src="[LOOM_URL]" ...></iframe></div>

[ ] HubSpot form activation
    → Get portalId + formId from HubSpot account
    → Edit index.html lines 279-282: replace YOUR_PORTAL_ID and YOUR_FORM_ID
```

### P2 — Phase B (Post-Pilot)
```
[ ] Firestore Phase B — Prospects per user
    → Add: Firestore collection users/{uid}/prospects/
    → Migration: move PROSPECTS array from data.js to Firestore on first login
    → Each prospect doc mirrors current PROSPECTS schema
    → Alfred's miner outputs new prospects into this collection
    → App reads from Firestore instead of data.js array

[ ] Firestore Phase B — Notes and Feedback sync
    → NOTES_STORE → users/{uid}/data/notes
    → FEEDBACK_STORE → users/{uid}/data/feedback

[ ] Alfred miner pipeline integration
    → Alfred runs his OSINT/mining scripts → outputs to Firestore directly
    → App reads `users/{uid}/prospects/` instead of hardcoded data.js
    → New tab on Command Center: "Alfred's Queue" → shows latest miner drops

[ ] Niche Comparison View
    → On results page: toggle between #1 and #2 niche to compare zone breakdowns
    → Button: "Compare vs. #2 HENRYs"

[ ] Pipeline status persistence
    → Currently: status changes in the boardwork done in memory, not saved
    → Fix: write status changes to Firestore users/{uid}/prospects/{id}
```

---

## 18. QUICK REFERENCE CARD

```
┌─────────────────────────────────────────────────────────────────────────┐
│  THE AUM ENGINE — QUICK REFERENCE                          April 7, 2026 │
├─────────────────────────────────────────────────────────────────────────┤
│  LIVE URLs                                                              │
│  Primary:  https://www.theaumengine.com                                 │
│  Firebase: https://theaumengine.web.app                                 │
│  Local:    file:///Users/kosalprum/Documents/AdvDiamondMining/index.html│
│                                                                         │
│  TEST LOGIN                                                             │
│  Email:    test@test.com                                                │
│  Password: test2026                                                     │
│                                                                         │
│  DEPLOY                                                                 │
│  cd /Users/kosalprum/Documents/AdvDiamondMining                         │
│  firebase deploy --only hosting --project theaumengine                  │
│                                                                         │
│  FIREBASE CONSOLE                                                       │
│  Auth:      console.firebase.google.com/project/theaumengine/auth       │
│  Firestore: console.firebase.google.com/project/theaumengine/firestore  │
│                                                                         │
│  NICHE WIZARD STAGES                                                    │
│  0=MacroScan  1=QuickPreview  2=ClusterRefine  3=NicheDeepDive  4=Results│
│                                                                         │
│  BROWSER CONSOLE RESET                                                  │
│  resetNicheWizard()  ← clears everything (memory + localStorage + FS)  │
│                                                                         │
│  FIRESTORE PATH                                                         │
│  users/{uid}/data/nicheProfile                                          │
│  users/{uid}/data/nicheAnswers                                          │
│  users/{uid}/data/icpConfig                                             │
│                                                                         │
│  API KEY (DO NOT CHANGE)                                                │
│  AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg  ← capital F in AFh          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*VERA HANDOFF v5 FINAL — The AUM Engine*
*Prepared: April 7, 2026 · Conversation: f13b7f7f-9df7-4fee-9aa1-669bb8a7b09e*
*By: Antigravity AI (Kosal's dev agent)*
*Next handoff: Create v6 after Phase B Firestore (prospects + notes) is implemented*
