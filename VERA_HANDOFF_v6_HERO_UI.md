# VERA HANDOFF v6 — Hero & UI Overhaul
**Project:** The AUM Engine (`theaumengine`)
**Date:** April 8–9, 2026
**Branch:** `main` → deployed to `theaumengine.web.app` / `theaumengine.com`
**Last commit:** `a647a3c` — mobile hero top padding fix

---

## 1. Session Objective

Transform the AUM Engine landing page hero from a generic SaaS/AI template into a professional advisor-platform interface that visually maps to the internal Command Center. Aligned to Vera's design brief: "closer to SmartAsset AMP / Zoe than a startup AI page."

---

## 2. Design System — Current Color Tokens

All values are defined in `css/main.css` inside `:root` (dark mode) and `[data-theme="light"]`.

| Token | Dark Value | Notes |
|---|---|---|
| `--blue` | `#60a5fa` | Primary accent — CTAs, labels, highlights |
| `--blue-hover` | `#3b82f6` | Hover state for all blue CTAs |
| `--bg-primary` | `#07111f` | Hero + shell background |
| `--bg-elevated` | `#0f1d2e` | Cards, drawers |
| `--bg-surface` | `#142033` | Input backgrounds |
| `--text-primary` | `#f1f5f9` | Headlines |
| `--text-secondary` | `#94a3b8` | Body copy |
| `--text-muted` | `#64748b` | Labels, captions |
| `--border-subtle` | `rgba(148,163,184,0.08)` | Dividers |
| `--border-default` | `rgba(148,163,184,0.14)` | Default borders |
| `--border-accent` | `rgba(96,165,250,0.3)` | Active/focus borders |
| `--gem-gradient` | `linear-gradient(135deg,#60a5fa,#3b82f6)` | Pilot Login button fill |

---

## 3. Hero Section — Final Architecture

### 3.1 HTML Structure (`index.html`)

```
<body>
  <div id="public-shell">
    <header class="pub-header" id="pub-header">   ← Fixed nav, z-index:500
      <div class="pub-header-inner">
        .pub-logo                                   ← SVG gem + "The AUM Engine"
        nav.pub-nav#pub-nav-desktop                ← Desktop nav (hidden <768px)
        div.pub-nav-mobile-right                   ← Hamburger + theme toggle (visible <768px)
      </div>
      div.pub-mobile-drawer#pub-mobile-drawer      ← Slide-down mobile menu
    </header>

    <div class="hero-wrapper" id="hero">
      <section class="hero-section">
        <div class="hero-content">                 ← LEFT column
          .hero-pilot-badge                        ← "Pilot access · Founding-cohort pricing"
          h1.hero-headline                         ← Main H1
          p.hero-subhead                           ← Descriptor paragraph
          div.hero-ctas                            ← Book Demo + Pilot Login buttons
          ul.hero-trust-bullets                    ← 4 benefit bullets
          div.hero-trust-strip                     ← Origin/trust quote
          div.hero-niche-grid                      ← 10-niche text grid
        </div>
        <div class="hero-cockpit">                 ← RIGHT column
          div.hc-card                              ← Static Command Center mockup
        </div>
      </section>
    </div>

    <!-- ...rest of landing page sections... -->
  </div>
</body>
```

### 3.2 Layout Rules

```css
/* Desktop (>900px) — two-column grid */
.hero-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 48px;
  padding: 120px 40px 80px;
}

/* Mobile (≤900px) — single column, copy first, cockpit below */
@media (max-width: 900px) {
  .hero-section {
    grid-template-columns: 1fr;
    padding: 120px 28px 60px;   /* 120px clears 64px fixed nav + 30px breathing room */
    gap: 40px;
  }
}

@media (max-width: 767px) {
  .hero-section { padding: 110px 20px 48px; }
}
```

> **IMPORTANT:** `order: -1` was intentionally REMOVED from `.hero-cockpit` on mobile. This means the Command Center card renders BELOW the copy on narrow screens (correct per user request).

---

## 4. Hero Visual Design Decisions

### 4.1 Removed (per Vera brief)
- ❌ `.hero-bg-glow` — glow orb animations
- ❌ `.hero-grid-overlay` — grid line overlay
- ❌ Animated pill cloud (niche pills) → replaced with static `hero-niche-grid`
- ❌ Gradient text on H1 (was `-webkit-background-clip: text`) → plain `color: var(--text-primary)`
- ❌ Multi-color gradient logo → flat single-color `#60a5fa` SVG polygon gem
- ❌ Diamond watermark (`body::before`) — added and removed per user request

### 4.2 Kept / Added
- ✅ Dark `#07111f` hero background — solid charcoal, no gradients
- ✅ Pilot badge — small label above H1: `"Pilot access · Founding-cohort pricing"`
- ✅ H1 weight: `font-weight: 800`, `font-size: clamp(2.2rem, 5vw, 3.6rem)`
- ✅ Static Command Center cockpit card (white card on dark hero)
- ✅ Trust bullets (4 items with `✓` marks in `--blue`)
- ✅ Niche grid — 2-column text layout, 10 niches

---

## 5. CTA Button Color System

All CTA buttons are now unified on the `#60a5fa` blue token.

### 5.1 Primary CTA — "Book a 20-minute demo"
```css
.hero-cta-primary {
  background: #60a5fa;
  color: #fff;
  border: none;
}
.hero-cta-primary:hover { background: #3b82f6; }
```

### 5.2 Secondary CTA — "Pilot Login →"
```css
.hero-cta-pilot {
  background: transparent;
  color: #60a5fa;
  border: 2px solid #60a5fa;
}
.hero-cta-pilot:hover {
  background: rgba(96,165,250,0.08);
  border-color: #3b82f6;
  color: #3b82f6;
}
```

---

## 6. Button Wiring — Full Audit

This was audited and fixed on April 8. Prior state had Book Demo triggering the login modal and Pilot Login doing nothing.

| Location | Button | `onclick` Handler |
|---|---|---|
| Desktop Nav | Book Demo | `openDemoEmail()` |
| Desktop Nav | Pilot Login | `window.openAuthModal()` |
| Mobile Drawer | Book Demo | `closeMobileNav(); openDemoEmail()` |
| Mobile Drawer | Pilot Login | `closeMobileNav(); window.openAuthModal()` |
| Hero | Book a 20-minute demo | `openDemoEmail()` |
| Hero | Pilot Login → | `window.openAuthModal()` |
| Footer Lead Capture | Submit | HubSpot form |

### 6.1 `openDemoEmail()` — `js/app.js`
Opens user's mail client with pre-filled message:
- **To:** `hello@theaumengine.com`
- **Subject:** `"I'd like to discuss The AUM Engine"`
- **Body:** Auto-fills Name, Firm, AUM, Niche, Best time fields

---

## 7. Mobile Navigation — Hamburger Menu

Added on April 8. Breakpoint: `≤768px`.

### 7.1 HTML Elements
```html
<!-- Hamburger trigger (inside .pub-header-inner) -->
<div class="pub-nav-mobile-right">
  <button class="pub-theme-btn-mobile" onclick="toggleTheme()">🌙</button>
  <button class="pub-hamburger" id="pub-hamburger" onclick="toggleMobileNav()">
    <span></span><span></span><span></span>
  </button>
</div>

<!-- Slide-down drawer (direct child of <header>) -->
<div class="pub-mobile-drawer" id="pub-mobile-drawer">
  <a href="#why"   onclick="closeMobileNav()">Why It Exists</a>
  <a href="#how"   onclick="closeMobileNav()">How It Works</a>
  <a href="#offer" onclick="closeMobileNav()">Founding Offer</a>
  <div class="pub-mobile-ctas">
    <button onclick="closeMobileNav(); openDemoEmail()">Book Demo</button>
    <button onclick="closeMobileNav(); window.openAuthModal()">Pilot Login</button>
  </div>
</div>
```

### 7.2 CSS State Machine
```css
/* Closed state */
.pub-mobile-drawer { max-height: 0; padding: 8px 0 16px; }

/* Open state (added by JS) */
.pub-mobile-drawer.is-open { max-height: 400px; padding: 8px 0 20px; }

/* Hamburger → X animation */
.pub-hamburger.is-open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.pub-hamburger.is-open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
.pub-hamburger.is-open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
```

### 7.3 JS Functions — `js/app.js`
```js
function toggleMobileNav()  // Toggles .is-open on drawer + hamburger, updates aria-expanded
function closeMobileNav()   // Removes .is-open (called by each nav link on click)
```

---

## 8. Command Center Cockpit Mockup

A static HTML/CSS mock of the internal platform. Lives inside `div.hero-cockpit > div.hc-card`.

### 8.1 Card Structure
```
.hc-card (white, light-mode card on dark hero)
  .hc-header
    "Command Center — Advisor Growth Cockpit"
    .hc-live-badge "● Live"
  .hc-stats-row  (4 stat blocks: Prospects, In Pipeline, Meetings, Reply Rate)
  .hc-prospects-label  "TOP PROSPECTS TO WORK NOW"
  .hc-prospect-row x5   (avatar, name, niche, status pill, score)
  .hc-alert             (Sandra Westhoff replied!)
```

### 8.2 Data in the Mockup (hardcoded, representative)
| Name | Niche | Status | Score |
|---|---|---|---|
| Nuria Molina | AI-Displaced Exec · Miami FL | NEW | 99 |
| Kirk McDonald | AI-Displaced Exec · Bend OR | NEW | 97 |
| David Harrington | Aircraft Owner · Scottsdale AZ | CONTACTED | 92 |
| Corinne Sklar | Aircraft Owner · New York NY | NEW | 92 |
| Sandra Westhoff | Business Owner · Overland Park KS | Alert | — |

---

## 9. Nav Logo — Flat SVG Gem

Replaced multi-gradient logo with single-color flat hexagonal polygon.

```html
<svg width="24" height="24" viewBox="0 0 28 28" fill="none">
  <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" fill="none" stroke="#60a5fa" stroke-width="1.5"/>
  <polygon points="14,2 26,9 14,14"  fill="#60a5fa" opacity="0.9"/>
  <polygon points="14,2 2,9 14,14"   fill="#60a5fa" opacity="0.65"/>
  <polygon points="2,9 14,14 2,19"   fill="#60a5fa" opacity="0.45"/>
  <polygon points="26,9 14,14 26,19" fill="#60a5fa" opacity="0.8"/>
  <polygon points="14,14 26,19 14,26" fill="#60a5fa" opacity="0.55"/>
  <polygon points="14,14 2,19 14,26"  fill="#60a5fa" opacity="0.35"/>
</svg>
```

---

## 10. CSS File — `css/main.css`

Key section ranges (approximate, may shift with edits):

| Section | Approx Lines |
|---|---|
| CSS Variables / Design Tokens | 1–80 |
| Public Header + Nav | 2170–2310 |
| Mobile Nav (hamburger, drawer) | 2257–2345 |
| Hero Wrapper + Background | 2615–2635 |
| Hero Section grid layout | 2636–2720 |
| Hero Copy (badge, H1, subhead) | 2720–2780 |
| Hero CTAs | 2780–2840 |
| Cockpit Card (`.hc-*`) | 2840–2930 |
| Hero Mobile Breakpoints | 2930–2960 |

---

## 11. Deployment State

| Item | Value |
|---|---|
| Firebase Project | `theaumengine` |
| Live URL | `https://www.theaumengine.com` |
| Staging URL | `https://theaumengine.web.app` |
| GitHub Repo | `kprum1/theaumengine` (branch: `main`) |
| Last deploy commit | `a647a3c` |
| CSS cache-buster | `main.css?v=9` (in `<head>`) |

---

## 12. Known Limitations / Open Items

| # | Item | Priority |
|---|---|---|
| 1 | `hello@theaumengine.com` is a placeholder — confirm real demo inbox before launch | HIGH |
| 2 | Cockpit mockup is 100% static, hardcoded data — no live Firestore connection | MEDIUM |
| 3 | FAQ, "Founding Cohort" section font sizes were requested larger — verify at current viewport | LOW |
| 4 | HubSpot lead capture form at bottom — confirm form ID is still active | MEDIUM |
| 5 | Mobile nav does NOT track auth state — Pilot Login always shows in drawer even when logged in | LOW |

---

## 13. Next Development Priorities

Per `pilot_launch_playbook.md`, remaining pilot-phase work:

1. **Outreach Log Migration** — move `localStorage` outreach outcomes to Firestore `outreachLogs` collection
2. **ED/Al Analytics Panel** — build the advisor-facing intelligence dashboard
3. **Status Normalization** — clean up `al_assignments.status` field values in Firestore
4. **Demo Inbox** — route `openDemoEmail()` to a real monitored inbox
5. **Cockpit Live Data** (Phase 2) — wire the hero mockup to read from the advisor's actual Firestore prospect count

---

## 14. File Map — What Changed This Session

| File | Change |
|---|---|
| `index.html` | Hero HTML (2-col layout, badge, cockpit card, mobile nav HTML) |
| `css/main.css` | ~400 lines added: `hc-*` cockpit, `hero-*` redesign, mobile nav, hamburger |
| `js/app.js` | Added `toggleMobileNav()`, `closeMobileNav()`, `openDemoEmail()` |
| `assets/diamond-watermark.png` | Added (not currently in use — watermark was reverted) |
