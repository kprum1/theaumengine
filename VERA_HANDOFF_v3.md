# THE AUM ENGINE — VERA HANDOFF v3.0
**Date:** April 6, 2026
**Conversation ID:** e73df206-0cf0-4777-83fb-a1c4e4500c2b
**Status:** Phase 1.2.5 COMPLETE — Landing Page + Auth Gate Live
**Live URL:** https://theaumengine.web.app
**Custom Domain:** www.theaumengine.com *(DNS propagating — verify status)*

---

## 🏗️ PROJECT IDENTITY

| Field | Value |
|---|---|
| **External Brand** | The AUM Engine |
| **UI Label** | The AUM Engine — Advisor Growth Cockpit |
| **Internal Codename** | Diamond Mining (keep — don't rename folder) |
| **Repo Folder** | `/Users/kosalprum/Documents/AdvDiamondMining/` |
| **Firebase Project** | `theaumengine` |
| **Deploy Command** | `firebase deploy --only hosting --project theaumengine` |
| **Alfred's Repo** | `https://github.com/kprum1/alfred-clawbot` |
| **Alfred's AUM Docs** | `alfred-clawbot/theaumengine/` folder |

---

## 📁 CODEBASE SNAPSHOT

```
AdvDiamondMining/
├── index.html          513 lines  — two-shell app: public landing + auth cockpit
├── css/
│   └── main.css        ~2650 lines — all styles (cockpit + landing page)
├── js/
│   ├── auth.js         218 lines  — Firebase Auth controller (gate + modal)
│   ├── app.js          16KB       — cockpit router, nav, theme, init
│   ├── data.js         47KB       — prospect data, scoring, niche data
│   ├── niche_engine.js 18KB       — niche mapping/scoring engine
│   └── pages.js        48KB       — all cockpit page renderers
├── assets/             — og-image.png, favicon
├── firebase.json       — hosting config
└── .firebaserc         — project: theaumengine
```

---

## 🏛️ ARCHITECTURE — TWO-SHELL SYSTEM

The app uses a **two-shell DOM architecture** controlled entirely by `auth.js`:

```html
<body>
  <!-- PUBLIC SHELL — shown to unauthenticated visitors -->
  <div id="public-shell">
    [landing page: header, hero, sections, footer, auth modal]
  </div>

  <!-- APP SHELL — shown only after Firebase auth confirms session -->
  <div id="app-shell" style="display:none">
    [cockpit: sidebar, main content area]
  </div>
</body>
```

### Shell Switching Logic (`js/auth.js`)
- `firebase.auth().onAuthStateChanged()` fires on every page load
- **Authenticated** → `showAppShell()` — hides public shell, shows app shell with `display:flex`, adds `body.app-mode`
- **Not authenticated** → `showPublicShell()` — shows public shell with `display:block`, adds `body.public-mode`
- `display:` is controlled **100% via JS inline style** — no CSS `display` defaults on the shells themselves (this avoids conflicts)

### Body Mode Classes
```css
/* Default (public mode) — scrollable landing page */
body { display: block; height: auto; overflow-y: auto; }

/* App mode — cockpit needs fixed-height flex layout */
body.app-mode { display: flex; height: 100vh; overflow: hidden; }
```

---

## 🔑 FIREBASE AUTH

| Field | Value |
|---|---|
| **Project** | `theaumengine` |
| **Auth Method** | Email/Password (only — no Google, no magic links) |
| **Provisioning** | Manual via Firebase Console — invite-only |
| **Authorized Domains** | `localhost`, `theaumengine.web.app`, `theaumengine.firebaseapp.com`, `www.theaumengine.com` |

### Firebase Config (in `js/auth.js` — CORRECT as of April 6, 2026)
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg",  // capital F — was wrong before
  authDomain: "theaumengine.firebaseapp.com",
  projectId: "theaumengine",
  storageBucket: "theaumengine.firebasestorage.app",
  messagingSenderId: "938002241793",
  appId: "1:938002241793:web:756cdb9f01674456e66300"
};
```

> [!CAUTION]
> The `apiKey` had a typo (`AEfh` instead of `AEFh` — lowercase f vs uppercase F) that was blocking ALL login attempts. This was fixed in this session. If login breaks again, this is the first thing to check.

### Test Account
| Email | Password | Purpose |
|---|---|---|
| `test@test.com` | `test2026` | QA / demo testing |

### Pilot Accounts (provision via [Firebase Console](https://console.firebase.google.com/project/theaumengine/authentication/users))
- Add manually: Authentication → Users → Add User
- No self-signup — this is invite-only by design

---

## 🌐 LANDING PAGE — STRUCTURE & SECTIONS

All landing page HTML is inside `#public-shell` in `index.html`.

### Section Map
| Section | ID | Notes |
|---|---|---|
| Public Header | `#pub-header` | Fixed nav — Logo, Why It Exists, How It Works, Founding Offer, Login btn |
| Hero | `#hero` | Two-shell wrapper + single-column content + 12-pill niche grid |
| Why This Exists | `#why` | Comparison strip (Old Playbook vs AUM Engine) |
| What Makes It Different | `#different` | 3 value prop cards (icon centered, no numbers) |
| How It Works | `#how` | 4-step process cards |
| Founding Offer | `#offer` | Pricing card + offer details |
| FAQ | `#faq` | Accordion — JS-powered |
| Footer | `#pub-footer` | Simple footer |

### Auth Modal
- ID: `#auth-modal-overlay`
- Triggered by: Login btn, Hero CTA, Founding Offer CTA ("Apply for founding cohort")
- Fields: `#auth-email`, `#auth-password`
- Error display: `#auth-error`
- Submit: `#auth-submit-btn`

---

## 🎨 HERO SECTION — TECHNICAL DETAILS

### Structure
```html
<div class="hero-wrapper" id="hero">     <!-- full-bleed dark bg, position:relative, overflow:hidden -->
  <div class="hero-bg-glow"></div>        <!-- radial gradient decorations — absolute, fills wrapper -->
  <div class="hero-grid-overlay"></div>   <!-- subtle grid lines — needs -webkit-mask-image for Safari -->
  <section class="hero-section">          <!-- max-width 820px, single column, flex column, centered -->
    <div class="hero-content">            <!-- all copy: badge, headline, subhead, CTAs, trust strip -->
      <div class="hero-pills">            <!-- 12-pill niche grid — 3 columns × 4 rows -->
        ...
      </div>
    </div>
  </section>
</div>
```

### Niche Pills (12 total — 3-col CSS grid, 4×3)
```
[✈️ Aircraft Owners]      [👩‍⚕️ Physicians]           [🏢 Business Owners]
[⚖️ Law Partners]         [💸 HENRYs]                [💼 C-Suite Executives]
[🤖 AI-Displaced Execs]   [🦷 Dentists & Specialists] [🔧 High-Income Trades]
[💰 Inheritance Recipients] [🏗️ Real Estate Developers] [🎗️ Charity Boards]
```

**CSS:**
```css
.hero-pills {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: start;
  gap: 10px;
  margin-top: 30px;   /* 30px below the trust strip quote */
}
```

Pills have a staggered `--delay` CSS variable (0s → 1.1s) and a `floatPill` keyframe animation.

### Safari Compatibility Applied
- `-webkit-mask-image` on grid overlay
- `-webkit-backdrop-filter` on pills
- `transform: translateZ(0)` on animated elements (force GPU layer)
- `-webkit-tap-highlight-color: transparent` on buttons
- `-webkit-animation-delay` alongside standard `animation-delay`

---

## 📋 ALL CHANGES MADE THIS SESSION (April 6, 2026)

### 1. Terminology — "RIA" → "Financial Professionals"
**10 swaps in `index.html`:** meta description, OG tags, Twitter card, hero subhead, Why This Exists (×2), Founding Offer (×2), FAQ title, FAQ answer.
**Left untouched:** `data.js` lines 185-186 (prospect data — "RIA firm sale in progress" — factual, not brand language).

### 2. CSS Layout Fix — Shell Conflict
**Problem:** Body was globally `display:flex; height:100vh; overflow:hidden` — the cockpit's layout was leaking into the public landing page.
**Fix:** Removed static `display:` from `#public-shell` and `#app-shell`. JS controls `display` entirely via `style=` attribute. `body.app-mode` applies cockpit flex layout; default body is block/scroll.

### 3. Hero Layout Redesign
- Moved from scattered `position:absolute` pills to a CSS grid inline with the copy
- Hero is now single-column max-width 820px, vertically centered via flexbox
- Pills sit 30px below the trust strip in a `repeat(3, auto)` grid
- Background glow/grid moved from inside `<section>` to `hero-wrapper` so they always fill 100vw

### 4. Niche Pills — Expanded from 6 → 12
| Previous (6) | Current (12) |
|---|---|
| Aircraft Owners | Aircraft Owners |
| Physicians | Physicians |
| Business Owners | Business Owners |
| AI-Displaced Execs | ⚖️ Law Partners *(new)* |
| Inheritance Recipients | 💸 HENRYs *(new)* |
| Charity Boards | 💼 C-Suite Executives *(new)* |
| | AI-Displaced Execs |
| | 🦷 Dentists & Specialists *(new)* |
| | 🔧 High-Income Trades *(new)* |
| | Inheritance Recipients |
| | 🏗️ Real Estate Developers *(new)* |
| | Charity Boards |

### 5. Value Prop Cards Fix
- Removed `01` / `02` / `03` number labels (`.vp-number` divs deleted from HTML)
- Emoji icons centered: `display: block; text-align: center; font-size: 32px; margin-bottom: 16px`

### 6. Firebase API Key Fix (Critical)
**Bug:** `apiKey` had a single-character typo — lowercase `f` instead of uppercase `F` at position 26 (`AEfh` → `AEFh`).
**Result:** Every sign-in returned `400 Bad Request — API key not valid` from Google Identity Toolkit.
**Fix:** Corrected in `js/auth.js` line 23. Verified against Firebase Project Settings.

---

## 🚧 KNOWN ISSUES & WATCH LIST

| Item | Status | Notes |
|---|---|---|
| Custom domain `www.theaumengine.com` | ⚠️ DNS propagating | Verify via `dig www.theaumengine.com` — may need 24–48h |
| OG image | ⚠️ Placeholder | `/assets/og-image.png` needs a real 1200×630 branded image for social sharing |
| Login error messages | ✅ Fixed | `auth/invalid-credential` now shows "Invalid email or password" instead of raw Firebase code |
| Mobile Safari layout | ✅ Fixed | `-webkit-` prefixes added, `translateZ(0)` GPU compositing applied |
| Cockpit CSS bleed | ✅ Fixed | Body mode classes prevent cockpit flex layout from affecting landing page |
| Session persistence | ✅ Working | Firebase handles automatically via `onAuthStateChanged` |

---

## 🔧 CSS ARCHITECTURE NOTES

`css/main.css` is a single file with two logical zones:

**Lines 1–1875:** Cockpit styles (sidebar, nav, data tables, niche board, pipeline, etc.)

**Lines 1876–end:** Landing page styles, organized as:
```
/* ── Public Header ── */
/* HERO — hero-wrapper, hero-section, hero-content, hero-pills, niche-pill */
/* ── LP Section Foundation ── */ (lp-section, lp-container, etc.)
/* ── Why This Exists ── */
/* ── Value Props ── */
/* ── How It Works ── */
/* ── Founding Offer ── */
/* ── FAQ ── */
/* ── Footer ── */
/* Light theme overrides (data-theme="light") */
```

> [!WARNING]
> When adding new landing page styles, always prefix with `#public-shell` or use LP-specific class names (`.lp-`, `.vp-`, `.hero-`, `.pub-`). The cockpit uses global class names and CSS specificity conflicts are the #1 source of layout bugs in this codebase.

---

## 🚀 NEXT STEPS — PRIORITY ORDER

### Immediate (before pilot launch)
- [ ] **Verify `www.theaumengine.com`** DNS is fully propagated — add to Firebase authorized domains if not already there
- [ ] **Create OG image** — 1200×630 dark branded card for social previews
- [ ] **Provision pilot accounts** — manually add each pilot user in Firebase Console
- [ ] **Test full auth flow on mobile Safari** — Login → Cockpit → Logout

### Phase 1.4 — Landing Page Polish
- [ ] Add advisor testimonial(s) to the landing page
- [ ] Add a lead-capture email field on the Founding Offer section (Mailchimp or Formspree)
- [ ] Animate hero headline on load (fade/slide up)
- [ ] Consider adding a short video or screenshot of the cockpit in the "How It Works" section

### Phase 2 — Firestore Data Layer
- [ ] Migrate user preferences (ICP settings, niche selections) from `localStorage` to Firestore
- [ ] Per-user prospect board persistence
- [ ] Cross-device sync

### Phase 3 — Alfred Integration
- [ ] Connect Alfred's mining pipeline output to Firestore `prospects` collection
- [ ] Auto-populate new prospects monthly per user's niche config
- [ ] Outreach draft generation per prospect

---

## 📞 QUICK REFERENCE

### Deploy
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
firebase deploy --only hosting --project theaumengine
```

### Test Login
- URL: https://theaumengine.web.app
- Email: `test@test.com`
- Password: `test2026`

### Add Pilot User
1. Go to https://console.firebase.google.com/project/theaumengine/authentication/users
2. Click "Add user"
3. Enter email + temp password
4. Share credentials with pilot via secure channel

### Firebase Project Links
- [Console Overview](https://console.firebase.google.com/project/theaumengine/overview)
- [Authentication Users](https://console.firebase.google.com/project/theaumengine/authentication/users)
- [Project Settings](https://console.firebase.google.com/project/theaumengine/settings/general)
- [Hosting Dashboard](https://console.firebase.google.com/project/theaumengine/hosting)

---

*Handoff prepared by Antigravity AI (Vera) — April 6, 2026*
*Conversation ID: e73df206-0cf0-4777-83fb-a1c4e4500c2b*
