# THE AUM ENGINE — VERA HANDOFF v4.0 (MASTER)
**Session Date:** April 6, 2026
**Conversation ID:** e73df206-0cf0-4777-83fb-a1c4e4500c2b
**Conversation Size:** ~123MB artifacts (LARGE — near context limit, new session recommended)
**Status:** Phase 1.3 COMPLETE — Production live, pilot-ready, GitHub synced
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
| **Alfred's dataset path** | `theaumengine/data/pilot-onboarding-dataset-25.csv` |
| **Alfred's docs path** | `theaumengine/docs/pilot-launch-plan.md` |

---

## 📁 COMPLETE FILE INVENTORY

```
AdvDiamondMining/                    (also at alfred-clawbot/theaumengine/marketing-site/)
├── index.html           549 lines   — two-shell SPA (public landing + auth cockpit)
├── css/
│   └── main.css        ~2841 lines  — all styles (cockpit zones 1-1875 + landing 1876-end)
├── js/
│   ├── auth.js          243 lines   — Firebase Auth controller + form handlers
│   ├── app.js           ~16KB       — cockpit router, nav, theme, init
│   ├── data.js          ~47KB       — prospect/niche data (RIA terminology preserved here)
│   ├── niche_engine.js  ~18KB       — niche mapping/scoring algorithm
│   └── pages.js         ~48KB       — cockpit page renderers
├── assets/
│   └── og-image.png     1200×630px  — dark navy OG social card (generated this session)
├── firebase.json                    — hosting config
├── .firebaserc                      — project: theaumengine
├── VERA_HANDOFF_v3.md               — previous handoff (kept for reference)
├── VERA_HANDOFF_v4.md               — THIS FILE
└── PILOT_LAUNCH_PLAN.md             — full pilot charter, onboarding, metrics, GTM
```

---

## 🔑 FIREBASE AUTH — CRITICAL CONFIG

### Correct API Key (verified April 6, 2026)
```javascript
// js/auth.js — firebaseConfig object
const firebaseConfig = {
  apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg",  // ← capital F — was broken before
  authDomain: "theaumengine.firebaseapp.com",
  projectId: "theaumengine",
  storageBucket: "theaumengine.firebasestorage.app",
  messagingSenderId: "938002241793",
  appId: "1:938002241793:web:756cdb9f01674456e66300"
};
```

> [!CAUTION]
> The apiKey previously had `AEfh` (lowercase f) which caused ALL logins to fail with 400 Bad Request. Fixed this session. If login ever breaks, check this first.

### Auth Method
- Email/Password ONLY (no Google, no magic links)
- Manual provisioning only (no self-signup)
- Authorized domains: `localhost`, `theaumengine.web.app`, `theaumengine.firebaseapp.com`, `www.theaumengine.com`

### Test Account
```
Email:    test@test.com
Password: test2026
```

### Pilot Contact
```
"Need access?" email: kosal@fin-tegration.com
```

### Pilot Accounts — Provision Here
https://console.firebase.google.com/project/theaumengine/authentication/users
→ Add User → firm email + temp password

---

## 🌐 DNS STATUS

```bash
dig www.theaumengine.com +short
# → theaumengine.web.app.
# → 199.36.158.100  ✅ Firebase Anycast — FULLY PROPAGATED

dig theaumengine.com +short
# → 199.36.158.100  ✅ Apex redirect working
```

Firebase Hosting dashboard shows:
- `theaumengine.web.app` — Default ✅
- `theaumengine.firebaseapp.com` — Default ✅
- `theaumengine.com` — Connected (redirect → www) ✅
- `www.theaumengine.com` — Connected (Custom) ✅

---

## 🏛️ TWO-SHELL ARCHITECTURE

```html
<body>
  <div id="public-shell">    <!-- LANDING PAGE — always shown first -->
    [header] [hero] [why] [different] [how] [offer] [faq] [footer]
    [auth-modal-overlay]     <!-- Login modal, triggered by multiple CTAs -->
  </div>
  <div id="app-shell" style="display:none">  <!-- COCKPIT — auth only -->
    [sidebar] [main content area]
  </div>
</body>
```

**Shell switching:** `auth.js` → `firebase.auth().onAuthStateChanged()`
- Authenticated → `showAppShell()` — hides public, shows app, adds `body.app-mode`
- Not authenticated → `showPublicShell()` — shows public, adds `body.public-mode`

**Body mode classes:**
```css
/* Public (default) */
body { display: block; height: auto; overflow-y: auto; }
/* Cockpit */
body.app-mode { display: flex; height: 100vh; overflow: hidden; }
```

---

## 📋 ALL CODE CHANGES THIS SESSION

### CHANGE 1 — Terminology sweep: "RIA" → "Financial Professionals"
**File:** `index.html`  
**Locations:** meta description, OG tags, Twitter card, hero subhead, Why section ×2, Founding Offer ×2, FAQ ×2  
**NOT changed:** `data.js` (prospect raw data — preserves factual accuracy)

---

### CHANGE 2 — Hero layout: single-column centered design
**File:** `css/main.css` lines 1880–2118  
**What changed:**
- Removed the two-column grid that was breaking the hero
- Hero is now `max-width: 820px`, single column, `flex-direction: column`
- `hero-wrapper` is full-bleed with `position: relative; overflow: hidden`
- Background glow/grid overlays moved to wrapper (fills 100vw)
- Safari fixes: `-webkit-` prefixes, `translateZ(0)` GPU compositing

---

### CHANGE 3 — Value prop cards: centered emoji, no numbers
**File:** `index.html` lines 151–168  
**What changed:**
- Removed `<div class="vp-number">01</div>` etc. from all 3 cards
- **File:** `css/main.css`  
- `.vp-icon { display: block; text-align: center; font-size: 32px; margin-bottom: 16px; }`

---

### CHANGE 4 — Niche pill grid: 6 → 9 → 12 pills
**File:** `index.html` lines 97–118  
**Final state — 12 pills (3-col desktop, 2-col mobile):**
```
✈️ Aircraft Owners       👩‍⚕️ Physicians           🏢 Business Owners
⚖️ Law Partners          💸 HENRYs               💼 C-Suite Executives
🤖 AI-Displaced Execs    🦷 Dentists & Specialists 🔧 High Earning Tradesman
💰 Inheritance Recipients 🏗️ Real Estate Developers 🎗️ Charity Boards
```

**CSS — `css/main.css`:**
```css
/* Desktop: 3×4 */
.hero-pills {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: start;
  gap: 10px;
  margin-top: 30px;
}

/* Mobile ≤767px: 2×6 */
@media (max-width: 767px) {
  .hero-pills {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .niche-pill {
    font-size: 12px;
    padding: 8px 12px;
    text-align: center;
    white-space: normal;
    width: 100%;
    box-sizing: border-box;
  }
}
```

Pills have staggered `--delay` CSS var (0s → 1.1s) + `floatPill` keyframe animation.

---

### CHANGE 5 — Header nav: Book Demo + Pilot Login
**File:** `index.html` lines 63–68  
**Before:** Single "Login" button  
**After:**
```html
<button class="pub-demo-btn" id="nav-demo-btn" onclick="window.openAuthModal()">Book Demo</button>
<button class="pub-login-btn" id="login-btn">Pilot Login</button>
```
**CSS added:** `.pub-demo-btn` (ghost bordered button), `.pub-login-btn` (gradient filled)

---

### CHANGE 6 — Hero: 3 trust bullets + Pilot Login CTA
**File:** `index.html` lines 90–96  
**Before:** Primary CTA + "See a sample niche board →" link  
**After:**
```html
<div class="hero-ctas">
  <button class="hero-cta-primary" id="hero-login-cta">Book a 20-minute demo</button>
  <button class="hero-cta-pilot" id="hero-pilot-cta" onclick="window.openAuthModal()">Pilot Login →</button>
</div>
<ul class="hero-trust-bullets">
  <li>Built for Financial Professionals at the $50M–$250M AUM growth plateau.</li>
  <li>Exclusive, niche-qualified prospect discovery — not shared internet leads.</li>
  <li>Outreach drafts in your voice, always approved by you before sending.</li>
</ul>
```

---

### CHANGE 7 — Auth modal: "Need access?" link
**File:** `index.html` line ~403  
**Added:**
```html
<a href="mailto:kosal@fin-tegration.com" class="auth-forgot-link">Need access? Request pilot info</a>
```

---

### CHANGE 8 — Social proof quote block
**File:** `index.html` after line 178 (inside `#different` section)  
```html
<div class="social-proof-block">
  <blockquote class="social-proof-quote">
    "This is the first prospecting tool that actually feels like it understands how an
    independent advisor grows. The niche scoring alone saved us months of chasing the
    wrong market."
  </blockquote>
  <div class="social-proof-attribution">
    <span class="social-proof-badge">Pilot Advisor</span>
    <span class="social-proof-meta">Independent Financial Professional · $180M AUM · Midwest</span>
  </div>
</div>
```
**CSS:** `.social-proof-block` — left blue border accent, centered, 18px italic serif quote

> [!NOTE]
> Replace with a real pilot quote after first 30-day cohort. This is a placeholder.

---

### CHANGE 9 — HubSpot lead capture in Founding Offer
**File:** `index.html` lines ~266–292 (inside `#offer` section)

**TO ACTIVATE:** Get Portal ID + Form ID from HubSpot → Forms → Share → Embed
```javascript
hbspt.forms.create({
  region: "na1",
  portalId: "YOUR_PORTAL_ID",   // ← swap this
  formId: "YOUR_FORM_ID",       // ← swap this
  target: "#hubspot-form-target"
});
```
The HubSpot JS SDK is loaded from `//js.hsforms.net/forms/embed/v2.js`.  
HubSpot is already configured in the KYEAI project — same portal works across sites.

---

### CHANGE 10 — OG Image
**File:** `assets/og-image.png`  
**Spec:** 1200×630 dark navy card — gem logo, "Niche Growth Engine for Financial Professionals," niche pill tags  
**Used by:** `<meta property="og:image">`, Twitter card, favicon fallback  
**Shows on:** LinkedIn share, Twitter/X, iMessage, SMS previews

---

### CHANGE 11 — Firebase API key fix (CRITICAL)
**File:** `js/auth.js` line 23  
```diff
- apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEfh2b7F9m_Mn8Sg"   ← caused ALL logins to 400
+ apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg"   ← correct uppercase F
```

---

### CHANGE 12 — GitHub push
**Repo:** `kprum1/alfred-clawbot`  
**Commit:** `cb2d101`  
**Branch:** `main`  
**Path in repo:** `theaumengine/marketing-site/`  
**14 files changed, 7,431 insertions**

---

## 🎯 LANDING PAGE SECTION MAP

| Section | HTML ID | Key Elements |
|---|---|---|
| Public header | `#pub-header` | Logo, Why/How/Offer nav links, Book Demo, Pilot Login |
| Hero | `#hero` | Headline, subhead, CTAs, 3 trust bullets, trust strip quote, 12 pills |
| Why It Exists | `#why` | Comparison strip (Old Playbook vs AUM Engine) |
| What Makes It Different | `#different` | 3 value prop cards (centered emoji, no numbers) + social proof quote |
| How It Works | `#how` | 4-step process cards |
| Founding Offer | `#offer` | $297 pricing, 5 bullets, Apply CTA, HubSpot form, pricing card |
| FAQ | `#faq` | Accordion (JS-powered click handlers in auth.js) |
| Footer | `#pub-footer` | Simple |
| Auth Modal | `#auth-modal-overlay` | Pilot Access, sign-in form, forgot password, Need Access link |

---

## 🚧 KNOWN ISSUES & WATCH LIST

| Issue | Status | Notes |
|---|---|---|
| HubSpot form inactive | ⚠️ Pending | Needs `portalId` + `formId` swapped in from HubSpot account |
| `www.theaumengine.com` in Firebase Auth authorized domains | ⚠️ Verify | Check Firebase console → Auth → Settings → Authorized Domains |
| OG image shows social preview | ✅ Live | `assets/og-image.png` deployed and in OG meta tags |
| Walkthrough video | ❌ Not done | User recording Loom — will embed in `#how` section when ready |
| Real pilot quote | ❌ Placeholder | Replace social proof quote after first cohort |
| Pilot accounts | ❌ Not provisioned | 10 firms need Firebase Auth accounts |
| Demo dataset | ✅ Alfred pushed | `theaumengine/data/pilot-onboarding-dataset-25.csv` in alfred-clawbot repo |

---

## 🧱 CSS ARCHITECTURE RULES (DO NOT BREAK)

`css/main.css` has two zones:

**Zone 1 (lines 1–1875):** Cockpit CSS — sidebar, nav, data tables, pipeline board  
**Zone 2 (lines 1876–end):** Landing page CSS — all public shell sections

> [!WARNING]
> ALWAYS prefix new landing page styles with `#public-shell`, `.lp-`, `.vp-`, `.hero-`, `.pub-` or another LP-specific class. Cockpit uses global class names. Specificity conflicts are the #1 source of layout bugs.

**CSS variable reference (defined in `:root`):**
```css
--blue: #60a5fa
--gem-gradient: linear-gradient(135deg, #60a5fa, #a78bfa)
--emerald: #34d399
--bg-card: rgba(255,255,255,0.04)
--text-primary: #f0f4ff
--text-secondary: #94a3b8
--text-muted: #64748b
--border-default: rgba(255,255,255,0.08)
--border-subtle: rgba(255,255,255,0.04)
--border-accent: rgba(96,165,250,0.3)
--transition: 0.2s ease
```

---

## 🤝 ALFRED COORDINATION

Alfred (Big Nate) is working in `alfred-clawbot` repo independently:

| Alfred's File | Purpose | Used by |
|---|---|---|
| `theaumengine/data/pilot-onboarding-dataset-25.csv` | 25 demo prospects (Meta/Apple execs + TX business owners) with fit scores, outreach angles | Import to Firebase for demo cockpit |
| `theaumengine/docs/pilot-launch-plan.md` | Alfred's copy of the pilot launch plan | Reference for onboarding |
| `theaumengine/marketing-site/index.html` | Alfred's copy of the site (less complete) | Superseded by our v4 push |

> [!IMPORTANT]
> Our `cb2d101` commit overwritten Alfred's `index.html` with the full production version. Alfred should pull before making further changes to the marketing site to avoid conflicts.

**Alfred's pull command:**
```bash
git pull origin main
```

---

## 🚀 PILOT LAUNCH — REMAINING ACTION ITEMS

### You do these (can't be automated):

**Week 1 — Before first pilot logs in:**
```
[ ] 1. Open HubSpot → Forms → get Portal ID + Form ID → swap into index.html ~line 280
        Then: firebase deploy --only hosting --project theaumengine
[ ] 2. Firebase console → Authentication → Settings → Authorized Domains
        Verify: www.theaumengine.com is listed → Add if missing
[ ] 3. Run QA from www.theaumengine.com (NOT .web.app) on your phone (mobile Safari):
        Landing → Login → Cockpit → Logout → Relogin
[ ] 4. Provision 10 pilot accounts in Firebase Auth:
        console.firebase.google.com/project/theaumengine/authentication/users
        → Add User (firm email + temp password)
[ ] 5. Send each firm: Pilot Brief + credentials + Calendly link (45-min onboarding call)
[ ] 6. Record 60–90s Loom → embed URL in #how section (message Vera with URL)
```

**Quick Loom script (90 seconds):**
```
[0-8s]   Open www.theaumengine.com — scroll hero + pills
[8-20s]  "Built for advisors stuck at $50–$250M who are done renting leads"
[20-32s] Click Pilot Login → cockpit loads — "This is what pilots see"
[32-46s] Niche Board — open a prospect card — "Pre-scored. In your niche. Exclusive."
[46-62s] Outreach Studio — show a draft — "AI-written in your voice. You approve it."
[62-75s] "25 niche-qualified households per month. Every month."
[75-90s] Back to landing — "This is what founding cohort access looks like."
```

### Vera/Nate does these (next build session):
```
[ ] Embed Loom URL in #how section (need URL from user first)
[ ] Replace social proof placeholder with real pilot quote (after 30 days)
[ ] Add pilot feedback panel in cockpit (thumbs up/down per prospect)
[ ] Manager Console summary tile: "This month: X prospects, Y contacted, Z meetings"
[ ] Phase 2: Migrate ICP + prospect data from localStorage → Firestore
[ ] Phase 2: Wire Alfred's miner output → Firestore prospects collection
```

---

## 🛠️ QUICK REFERENCE

### Deploy
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
firebase deploy --only hosting --project theaumengine
```

### GitHub Sync
```bash
# After making changes to AdvDiamondMining, sync to GitHub:
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

### Firebase Console Links
| Resource | URL |
|---|---|
| Auth Users | https://console.firebase.google.com/project/theaumengine/authentication/users |
| Auth Settings (Authorized Domains) | https://console.firebase.google.com/project/theaumengine/authentication/settings |
| Hosting Dashboard | https://console.firebase.google.com/project/theaumengine/hosting |
| Project Settings | https://console.firebase.google.com/project/theaumengine/settings/general |

---

## 📐 PILOT CHARTER (send to each pilot firm)

**Subject:** The AUM Engine — Your Pilot Access

**What you get (30 days):**
- 25–50 niche-qualified, pre-scored prospect households
- AI-drafted email + LinkedIn outreach for each
- Full Advisor Growth Cockpit access
- 1 onboarding call (45 min) + 1 check-in at Day 15

**What we ask:**
- Complete Niche Mapping Assessment Week 1
- Process ≥10 prospects through Outreach Studio
- Attend 30-min feedback call at Day 30
- Rate prospect quality (thumbs up/down)

**Login:**
- URL: https://www.theaumengine.com
- Email: [PROVIDED]
- Password: [PROVIDED — change after first login]

**Pilot metrics (pre-agreed):**
- Prospects reviewed: ≥15
- Messages sent: ≥5
- Meetings requested: ≥2
- Meetings booked: ≥1

---

*Handoff v4.0 — Prepared by Antigravity AI — April 6, 2026*  
*Conversation: e73df206-0cf0-4777-83fb-a1c4e4500c2b (~123MB — start new session)*
