# THE AUM ENGINE — VERA HANDOFF v5.0 (MASTER)
**Session Date:** April 7, 2026
**Conversation ID:** f13b7f7f-9df7-4fee-9aa1-669bb8a7b09e
**Status:** Phase 2.0 LIVE — Niche Engine v2.1 + Firestore per-user data
**Live URL:** https://www.theaumengine.com ✅ (also https://theaumengine.web.app)

---

## 🏗️ PROJECT IDENTITY

| Field | Value |
|---|---|
| **Brand** | The AUM Engine |
| **Internal codename** | Diamond Mining (do NOT rename) |
| **Local repo** | `/Users/kosalprum/Documents/AdvDiamondMining/` |
| **GitHub repo** | `https://github.com/kprum1/alfred-clawbot` |
| **GitHub path** | `theaumengine/marketing-site/` |
| **Firebase project** | `theaumengine` |
| **Deploy command** | `cd /Users/kosalprum/Documents/AdvDiamondMining && firebase deploy --only hosting --project theaumengine` |
| **GitHub sync** | See Quick Reference section below |

---

## 📁 COMPLETE FILE INVENTORY

```
AdvDiamondMining/
├── index.html           ~550 lines   — two-shell SPA (public landing + auth cockpit)
├── css/
│   └── main.css        ~3,400 lines  — ALL styles (cockpit zones 1–1875 + landing 1876–end)
├── js/
│   ├── auth.js          243 lines    — Firebase Auth controller + form handlers
│   ├── db.js            NEW          — Firestore per-user data layer (Phase 2.0)
│   ├── app.js          ~800 lines    — cockpit router, nav, theme, niche wizard state machine
│   ├── data.js         ~47KB         — prospect/niche data (RIA terminology preserved here)
│   ├── niche_engine.js ~18KB         — 85-question bank + Macro/Meso/Micro adaptive scoring
│   └── pages.js        ~970 lines    — cockpit page renderers (all 8 pages)
├── assets/
│   └── og-image.png     1200×630px   — dark navy OG social card
├── firebase.json                     — hosting config
├── .firebaserc                       — project: theaumengine
├── PILOT_LAUNCH_PLAN.md              — full pilot charter, onboarding, metrics, GTM
├── VERA_HANDOFF_v4.md                — previous handoff (Phase 1.3 — kept for reference)
└── VERA_HANDOFF_v5.md                — THIS FILE (Phase 2.0)
```

---

## 🔑 FIREBASE CONFIG — VERIFIED CORRECT

```javascript
// js/auth.js — firebaseConfig (do NOT change these values)
const firebaseConfig = {
  apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg",  // ← capital F — broken before, fixed v4
  authDomain: "theaumengine.firebaseapp.com",
  projectId: "theaumengine",
  storageBucket: "theaumengine.firebasestorage.app",
  messagingSenderId: "938002241793",
  appId: "1:938002241793:web:756cdb9f01674456e66300"
};
```

> [!CAUTION]
> The apiKey previously had `AEfh` (lowercase f) which broke ALL logins. Always uppercase F. If login breaks, check this first.

### Firebase SDKs loaded in index.html (CDN compat v9.23.0)
```html
<!-- REQUIRED — this order matters -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>  <!-- Added Phase 2.0 -->
```

### Auth Method
- Email/Password ONLY (no Google, no magic links)
- Manual provisioning only — no self-signup
- Authorized domains: `localhost`, `theaumengine.web.app`, `theaumengine.firebaseapp.com`, `www.theaumengine.com`

### Test Account
```
Email:    test@test.com
Password: test2026
```

### Firebase Console Links
| Resource | URL |
|---|---|
| Auth Users | https://console.firebase.google.com/project/theaumengine/authentication/users |
| Firestore | https://console.firebase.google.com/project/theaumengine/firestore |
| Hosting | https://console.firebase.google.com/project/theaumengine/hosting |

---

## 🏛️ TWO-SHELL ARCHITECTURE (unchanged from v4)

```html
<body>
  <div id="public-shell">   <!-- LANDING PAGE — always shown first -->
    [header] [hero] [why] [different] [how] [offer] [faq] [footer]
    [auth-modal-overlay]     <!-- Login modal -->
  </div>
  <div id="app-shell" style="display:none">  <!-- COCKPIT — auth only -->
    [sidebar] [main content area]
  </div>
</body>
```

**Shell switching:** `auth.js` → `firebase.auth().onAuthStateChanged()`
- Authenticated → `showAppShell()` → hides public, shows cockpit, adds `body.app-mode`
- Not authenticated → `showPublicShell()`

---

## 🗄️ FIRESTORE DATA LAYER — Phase 2.0 (NEW THIS SESSION)

### Why Firestore?
Previously all advisor data (niche profile, ICP config, answers) was in `localStorage` — 
browser/device specific, not user-specific. Advisors logging in on a second device 
lost all their data. Phase 2.0 moves critical data to Firestore keyed by Firebase Auth UID.

### Firestore Collection Structure

```
/users/{uid}/
  ├── nicheProfile        (document)   — completed assessment results
  │     ├── top3[]                     — top 3 niches with scores + zoneBreakdown
  │     ├── messagingAngle             — recommended messaging copy
  │     ├── icpBlock                   — generated ICP fields
  │     ├── completedAt                — ISO timestamp
  │     └── path                       — { macro, meso, micro } question sets used
  │
  ├── nicheAnswers        (document)   — in-progress partial answers (for auto-resume)
  │     └── answers: { [questionId]: answerIndex }
  │
  └── icpConfig           (document)   — advisor's ICP settings
        ├── primaryNiche
        ├── minAssets
        ├── geography
        └── ...
```

### Firestore Security Rules (apply in Firebase console)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own documents
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> [!IMPORTANT]
> Apply these rules in Firebase Console → Firestore → Rules tab. Without them, data is either open or completely locked.

### js/db.js — Firestore Helper Functions

```javascript
// Firestore is available globally as firebase.firestore() after auth.js initializes
// All functions are async and return Promises

saveNicheProfileToFirestore(uid, profile)   // saves completed profile
loadNicheProfileFromFirestore(uid)           // returns profile or null
saveNicheAnswersToFirestore(uid, answers)    // saves partial answers
loadNicheAnswersFromFirestore(uid)           // returns answers object or {}
clearNicheDataFromFirestore(uid)             // deletes profile + answers docs
saveICPConfigToFirestore(uid, cfg)           // saves ICP config
loadICPConfigFromFirestore(uid)             // returns config or null
```

### Dual-Mode Persistence Pattern (Firestore + localStorage fallback)

```
Phase 2.0 writes to BOTH Firestore AND localStorage simultaneously:
  - Firestore: primary, cross-device, per-user
  - localStorage: offline fallback, instant reads

Priority on load:
  1. Firestore (if authenticated + online)
  2. localStorage (fallback if Firestore unavailable)
```

This means pilots still work offline and the UX is still instant (no waiting for Firestore).

### Phase A (This Session) vs Phase B (Future)

| Data | Phase A Status | Phase B |
|---|---|---|
| Niche profile | ✅ Firestore | — |
| Niche answers (partial) | ✅ Firestore | — |
| ICP Config | ✅ Firestore | — |
| Prospects / Leads | ❌ Still in data.js | Phase B — migrate to `users/{uid}/prospects/` |
| Notes | ❌ localStorage | Phase B |
| Feedback (thumbs) | ❌ localStorage | Phase B |
| Pipeline status | ❌ localStorage | Phase B |

---

## 🧭 NICHE MAPPING ENGINE v2.1 (NEW THIS SESSION)

### Flow Architecture

```
Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4
 Macro      Quick    Cluster   Niche      Results
  Scan      Preview  Refinement Deep Dive  (saved)
  (8q)      (scored   (8-9q)    (6-10q)
            preview)
```

### Stage Numbers (CRITICAL — DO NOT CHANGE ORDER)
```
nicheWizardStage === 0  → Macro Scan (8 questions, always shown)
nicheWizardStage === 1  → Quick Preview (no questions — shows top 3 from macro scoring only)
nicheWizardStage === 2  → Cluster Refinement / Meso (adaptive, 8-9 questions)
nicheWizardStage === 3  → Niche Deep Dive / Micro (adaptive, 6-10 questions)
nicheWizardStage === 4  → Results (saved profile displayed)
```

> [!WARNING]
> Stage numbering shifted from earlier versions. Old code used 3 stages (0/1/2/3). Current v2.1 uses 5 stages (0/1/2/3/4). If you see results rendering at stage 3 instead of 4, check app.js `_computeAndShowResults()` and force `nicheWizardStage = 4`.

### Quick Preview (Stage 1) — What it is
After completing the 8 macro questions, the engine:
1. Builds the adaptive path (`selectAssessmentPath()`)
2. Scores macro answers only against all 12 niches
3. Shows a "Your Early Niche Read" page with:
   - Top 3 preliminary niche cards (scored from 8q only, labeled "Early Est.")
   - Zone bars at reduced opacity
   - Info callout: "This is your early signal — not your final score"
   - CTA: "Refine My Results → (N more questions)" OR "Use Early Results" to skip

### Question Bank
- **Total questions:** 85 (in `js/niche_engine.js`)
- **Layers:** MACRO_QUESTIONS (fixed 8), MESO_QUESTIONS (adaptive cluster), MICRO_QUESTIONS (niche deep dive)
- **Zones:** fit / focus / market / access / service
- **Shown per advisor:** max 25 (8 macro + ~9 meso + ~8 micro)
- **Routing:** `selectAssessmentPath(nicheAnswers, 25)` in `niche_engine.js`

### Key Functions
```javascript
// niche_engine.js
selectAssessmentPath(answers, maxTotal)  // builds {macro, meso, micro} path
scoreNicheMapping(answers, path)         // returns {nicheScores, zoneScores}
generateNicheProfile(scores, path)       // returns profile object with top3, ICP, messaging

// app.js
advanceNicheWizard()      // advances stage, builds path at stage 0, shows preview at stage 1
_computeAndShowResults()  // scores full answers, generates profile, sets stage 4
resetNicheWizard()        // clears all state + localStorage + Firestore answers
printNicheProfile()       // opens branded print window → PDF
downloadNicheProfile()    // saves profile as .json file
```

### localStorage Keys (local cache — Firestore is primary in Phase 2.0)
```
aumNicheAnswers      — partial answers JSON (in-progress session)
aumNicheProfile      — completed profile JSON (fallback for Firestore)
aumEngineICP         — ICP config JSON
aumEngineNotes       — notes store JSON
aumEngineFeedback    — feedback store JSON  
aumTheme             — 'dark' | 'light' (device preference, stays localStorage)
```

---

## 📋 ALL CODE CHANGES THIS SESSION (April 7, 2026)

### CHANGE 1 — Niche Engine v2.1: Quick Preview Stage
**Files:** `js/pages.js`, `js/app.js`

Added Stage 1 (Quick Preview) between Macro and Cluster Refinement:
- After 8 macro questions complete, `advanceNicheWizard()` now:
  1. Calls `selectAssessmentPath()` to build the adaptive path
  2. Runs `scoreNicheMapping()` on macro answers only → stores in `nichePreviewScores`
  3. Sets `nicheWizardStage = 1` (preview)
- `pageNicheMapping()` renders the Quick Preview if `stage === 1 && nichePreviewScores`
- Progress bar now has 5 labels: Macro Scan → Quick Preview → Cluster Refinement → Niche Deep Dive → Results

---

### CHANGE 2 — Results Page: Save/Change Niche UX
**File:** `js/pages.js` (stage 4 block)

- Page title changed from "Niche Mapping Results" → "Your Niche Profile"
- Subtitle shows completion date + "auto-saved to this device"
- Added green "💾 Profile saved to this device" banner with "Change Niche" button
- Added "↺ Retake from Scratch" to header (ghost button)
- Added "Go to Mine →" shortcut button
- Results intro updated: "Your results are saved — you won't need to redo this unless you want to change niches"

---

### CHANGE 3 — Print to PDF
**File:** `js/app.js` → `printNicheProfile()`

- Opens a new branded print window (`window.open`)
- Clean white layout: header, niche cards with zone bars, ICP table, footer
- "Confidential advisor use only · theaumengine.com" footer
- Auto-triggers `window.print()` after 600ms delay
- `.no-print` class hides the on-screen "Print / Save as PDF" button during actual print

---

### CHANGE 4 — Download JSON
**File:** `js/app.js` → `downloadNicheProfile()`

- Creates a Blob with structured JSON export
- Filename: `aum-niche-profile-[niche-name]-[date].json`
- Fields: top3 scores, zoneBreakdown, icpProfile, messagingAngle, completedAt

---

### CHANGE 5 — Firestore Per-User Data Layer
**Files:** `index.html` (add Firestore SDK), `js/db.js` (new), `js/app.js` (updated), `js/auth.js` (uid threading)

- Firestore SDK loaded: `firebase-firestore-compat.js` v9.23.0
- `js/db.js`: thin async wrapper — read/write nicheProfile, nicheAnswers, icpConfig per uid
- `app.js`: on auth, loads profile from Firestore → falls back to localStorage
- Dual-write: every save goes to BOTH Firestore (primary) and localStorage (fallback)
- `resetNicheWizard()`: clears both Firestore docs AND localStorage keys

---

## 🧱 CSS ARCHITECTURE RULES (DO NOT BREAK)

`css/main.css` has two zones:

**Zone 1 (lines 1–1875):** Cockpit CSS — sidebar, nav, data tables, wizard, pipeline board  
**Zone 2 (lines 1876–end):** Landing page CSS — all public shell sections

> [!WARNING]
> ALWAYS prefix new landing page styles with `#public-shell`, `.lp-`, `.vp-`, `.hero-`, `.pub-`. Cockpit uses global class names. Specificity conflicts are the #1 source of layout bugs.

### CSS Variable Reference (`:root`)
```css
--blue: #60a5fa
--violet: #a78bfa
--cyan: #22d3ee
--emerald: #34d399
--amber: #fbbf24
--rose: #fb7185
--gem-gradient: linear-gradient(135deg, #60a5fa, #a78bfa)
--bg-card: rgba(255,255,255,0.04)
--text-primary: #f0f4ff
--text-secondary: #94a3b8
--text-muted: #64748b
--border-default: rgba(255,255,255,0.08)
--border-accent: rgba(96,165,250,0.3)
--transition: 0.2s ease
```

### Key CSS Classes for Niche Wizard
```css
.wizard-shell          — container (max-width 820px, centered)
.wizard-progress-wrap  — 5-stage progress bar wrapper
.wizard-question       — question card (has .answered state)
.likert-btn            — answer button (has .selected state)
.niche-result-card     — result card (.rank-1/.rank-2/.rank-3 modifiers)
.match-ring            — circular score indicator (uses --pct + --niche-color CSS vars)
.zone-breakdown-row    — zone bar row
.saved-profile-banner  — green "saved" banner on results page
.zone-badge            — zone label pill (zone-fit/focus/market/access/service)
```

---

## 🚀 COCKPIT PAGES (all 8)

| Page | Route | Key Function |
|---|---|---|
| Command Center | `command-center` | `pageCommandCenter()` |
| Prospect Mine | `prospect-mine` | `pageProspectMine()` |
| Lead Scoreboard | `lead-scoreboard` | `pageLeadScoreboard()` |
| Outreach Studio | `outreach-studio` | `pageOutreachStudio()` |
| Nurture & Booking | `nurture-booking` | `pageNurtureBooking()` |
| Meeting Prep | `meeting-prep` | `pageMeetingPrep()` |
| Manager Console | `manager-console` | `pageManagerConsole()` |
| Niche Mapping | `niche-mapping` | `pageNicheMapping()` |
| Settings & ICP | `settings-icp` | `pageSettingsICP()` |

---

## 🌐 DNS STATUS (verified April 6, 2026 — stable)

- `www.theaumengine.com` → Firebase Anycast `199.36.158.100` ✅
- `theaumengine.com` → apex redirect to www ✅
- Firebase Auth authorized domains: all four ✅

---

## 🚧 KNOWN ISSUES & WATCH LIST

| Issue | Status | Notes |
|---|---|---|
| Firestore security rules | ⚠️ Apply in console | See rules block above — must apply manually |
| HubSpot form inactive | ⚠️ Pending | Needs `portalId` + `formId` swapped in |
| Walkthrough video | ❌ Not recorded | User recording Loom — embed URL in `#how` section |
| Real pilot quote | ❌ Placeholder | Replace social proof after first 30-day cohort |
| Phase B Firestore | ❌ Future | Migrate prospects, notes, feedback to per-user Firestore |
| `backNicheWizard()` | ⚠️ Check | Quick Preview has a "← Back" button calling this — verify it exists in app.js |
| Pilot accounts | ❌ Not provisioned | Provision via Firebase Auth console |

---

## 🛠️ QUICK REFERENCE

### Deploy
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
firebase deploy --only hosting --project theaumengine
```

### GitHub Sync
```bash
rsync -av --exclude='.firebase' /Users/kosalprum/Documents/AdvDiamondMining/ \
  /Users/kosalprum/Documents/alfred-clawbot/theaumengine/marketing-site/

cd /Users/kosalprum/Documents/alfred-clawbot
git add theaumengine/marketing-site/
git commit -m "feat(theaumengine): [describe changes]"
git push
```

### Test Login
```
URL:      https://www.theaumengine.com
Email:    test@test.com
Password: test2026
```

### Niche Wizard Reset (in browser console)
```javascript
// Hard reset everything (clears localStorage + Firestore + in-memory state)
resetNicheWizard();

// Or manual localStorage clear:
localStorage.removeItem('aumNicheProfile');
localStorage.removeItem('aumNicheAnswers');
localStorage.removeItem('aumEngineICP');
```

---

## 🤝 ALFRED COORDINATION

Alfred (Big Nate) works independently in `alfred-clawbot` repo:

| File | Purpose |
|---|---|
| `theaumengine/data/pilot-onboarding-dataset-25.csv` | 25 demo prospects for cockpit demo |
| `theaumengine/docs/pilot-launch-plan.md` | Pilot launch plan reference copy |

> [!IMPORTANT]
> Our deploys overwrite Alfred's `index.html` in the repo. Alfred must `git pull origin main` before making site changes to avoid conflicts.

---

## 🎯 NEXT SESSION PRIORITIES

```
[ ] Phase B Firestore — migrate prospects/leads to users/{uid}/prospects/
[ ] Wire Alfred's miner output → Firestore prospects collection  
[ ] Embed Loom walkthrough video URL in #how section (need URL from user)
[ ] Replace social proof placeholder with real pilot quote (after 30 days)
[ ] HubSpot form activation (get portalId + formId)
[ ] Provision 10 pilot accounts in Firebase Auth console
[ ] Mobile QA pass on www.theaumengine.com (Safari iOS)
[ ] Niche "Comparison View" — toggle between #1 and #2 match on results page
```

---

*Handoff v5.0 — Prepared by Antigravity AI — April 7, 2026*
*Conversation: f13b7f7f-9df7-4fee-9aa1-669bb8a7b09e*
*Previous handoff: VERA_HANDOFF_v4.md (April 6, 2026)*
