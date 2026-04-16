# AUM Engine — Vera Full-Scale Audit Brief
## Post C21 + C22 Sprint · April 15, 2026
### Prepared by: Antigravity for Vera (Perplexity Computer)

---

## 🎯 Audit Mission

You are conducting a **live browser audit** of The AUM Engine, a financial advisor growth platform. Your job is to navigate the live site, log in with the credentials below, test each checkpoint, and return a **score out of 10** with detailed pass/fail notes for every item.

> **Do NOT review source code.** This is a pure browser / UX audit of the live production site.
> Test in a fresh browser window (or incognito) to avoid cached state.

---

## 🔑 Access Credentials

| Role | Email | Password | What you can access |
|------|-------|----------|---------------------|
| **Operator** | `kosal@fin-tegration.com` | `AUM2026!` | Everything — Admin Dashboard, Sentinel, Manager Console |
| **Pilot Advisor** | `chuck@chuck.com` | `AUM2026!` | Advisor Cockpit only |

**Live URL:** https://theaumengine.web.app

---

## 📋 Platform Architecture (for context only)

| Layer | Detail |
|-------|--------|
| Stack | Vanilla HTML + CSS + JS — no framework, no build step |
| Hosting | Firebase Hosting |
| Auth | Firebase Auth (email/password + Google) |
| Database | Firestore (`lead_assignments` — 87 leads across 5 pilot advisors) |
| Email | Resend (just migrated from SendGrid in C22 — daily digest fires 7 AM CT) |
| Phase | Pilot — 5-advisor cohort, operator-gated onboarding |

---

## AUDIT CHECKPOINTS (10 total)

---

### CHECKPOINT 1 — Site Loads Clean
**URL:** https://theaumengine.web.app  
**Action:** Load the page in a fresh/incognito window. Do not log in yet.

**Expected:**
- A login/splash screen appears — NOT a blank page or error
- "The AUM Engine" branding is visible
- No console errors visible in DevTools (open DevTools → Console tab — check for red errors)
- Page loads in under 3 seconds

**Pass criteria:** Page renders, branded, no red console errors  
**Fail criteria:** Blank page, 404, unbranded, or JS errors blocking render

---

### CHECKPOINT 2 — Advisor Login + Cockpit Load
**Action:** Log in as `chuck@chuck.com / AUM2026!`

**Expected:**
- Login succeeds without error
- Advisor Cockpit loads — should show a dashboard with lead cards or metrics
- Chuck's name or email is visible somewhere in the UI
- No spinner that never resolves

**Pass criteria:** Cockpit fully loads within 3 seconds of login  
**Fail criteria:** Login fails, infinite spinner, blank cockpit, wrong user shown

---

### CHECKPOINT 3 — SLA Breach Banner (Priority Check)
**Action:** While logged in as Chuck (`chuck@chuck.com`), observe the top of the cockpit within ~2 seconds of page load.

**Expected:**
- A **red or amber banner** appears near the top of the page
- It reads something like: **"⏰ X leads have not been contacted in 7+ days"**
- The banner is dismissible (has an X or close button)

> NOTE: This banner queries Firestore for the advisor's own `new` leads older than 7 days. Chuck's leads were reassigned in C21 — the banner may show 0 if reassignment timestamps reset the SLA clock. **Report exactly what you see either way.**

**Pass criteria:** Banner appears with a lead count, is styled (not plain text), dismisses on click  
**Fail criteria:** No banner at all, or JS error in console related to banner

---

### CHECKPOINT 4 — Advisor CANNOT Access Manager Console
**Action:** While logged in as Chuck (`chuck@chuck.com`), look for Manager Console in the nav menu or try navigating to it directly.

**Expected:**
- Manager Console is **not visible** in Chuck's navigation
- If you try to navigate directly, you should be redirected or see an "Access Denied" message
- Chuck should NOT be able to see other advisors' lead data

**Pass criteria:** Manager Console is hidden from advisor role; direct navigation is blocked  
**Fail criteria:** Chuck can see or access Manager Console data

---

### CHECKPOINT 5 — Calendly Gate Enforcement
**Action:** While logged in as Chuck, find the outreach/lead interaction flow. Look for a button to initiate outreach (e.g., "Contact Lead", "Send Outreach", or a lead card action button).

**Expected:**
- If Chuck has NOT configured a Calendly link, attempting outreach should show a warning or gate — something like "Set your Calendly link first" — rather than sending with a placeholder URL
- Look in Account Settings or Profile for a Calendly link field

**Pass criteria:** Gate enforced — can't send outreach with a blank or placeholder Calendly link  
**Fail criteria:** Outreach sends or proceeds with `YOUR_CALENDLY_LINK` or similar placeholder

---

### CHECKPOINT 6 — Operator Login + Admin Dashboard
**Action:** Log out of Chuck's account. Log in as `kosal@fin-tegration.com / AUM2026!`

**Expected:**
- Login succeeds
- Operator sees an **Admin Dashboard** (not the same view as the advisor cockpit)
- Dashboard shows platform-wide metrics — total leads, advisor breakdown, or similar
- Lead count should reflect ~87 total leads

**Pass criteria:** Admin Dashboard loads with operator-specific UI distinct from advisor view  
**Fail criteria:** Operator sees advisor cockpit, no admin UI, or login fails

---

### CHECKPOINT 7 — Manager Console (Operator Access)
**Action:** While logged in as operator, navigate to the Manager Console.

**Expected:**
- Manager Console is accessible to operator
- Shows advisor roster (5 advisors: Matt Germshied, Ray Uncle, Patrick Wight, Andy Belly, Chuck Cooper)
- Each advisor shows their lead count
- Approximate correct counts: Matt 27, Ray 18, Patrick 14, Andy 11, Chuck 16

> NOTE: Manager Console may display local/static prospect data rather than live Firestore data — this is a **known open item** on the C22+ roadmap. If it shows a prospect list but not exact advisor counts, note it but do not fail it.

**Pass criteria:** Console loads, advisor list visible, accessible to operator  
**Fail criteria:** Console is blank, throws an error, or shows wrong users

---

### CHECKPOINT 8 — Sentinel Module
**Action:** While logged in as operator, navigate to the Sentinel module (look in the nav menu).

**Expected:**
- Sentinel loads without error
- Shows governance / monitoring view — SLA flags, breach counts, or advisor activity
- No blank screen or JS error

**Pass criteria:** Sentinel loads and displays meaningful content  
**Fail criteria:** 404, blank page, or JS error

---

### CHECKPOINT 9 — Privacy & Terms Pages
**Action:** Navigate to these URLs directly (or find links in the footer):
- `https://theaumengine.web.app/privacy`
- `https://theaumengine.web.app/terms`

**Expected:**
- Both pages load with actual legal copy (not "lorem ipsum" or placeholder text)
- Pages are branded to "The AUM Engine"
- Back navigation works

**Pass criteria:** Both pages load with real content  
**Fail criteria:** 404, blank, or placeholder text on either page

---

### CHECKPOINT 10 — Overall UX + No Broken Links
**Action:** General navigation pass while logged in as operator. Click through all visible nav items.

**Expected:**
- No orphaned or broken nav links
- No infinite loading states
- No visible "undefined", "null", or raw Firestore document IDs leaked into the UI
- Footer links (if present) work

**Pass criteria:** All nav items resolve, no raw data visible, no broken states  
**Fail criteria:** Multiple broken nav items, raw/technical data visible to users, widespread JS errors

---

## 📊 Scoring Rubric

| Score | Meaning |
|-------|---------|
| ✅ Pass | Works exactly as expected |
| ⚠️ Partial | Works but with a minor issue (note it) |
| ❌ Fail | Broken, missing, or inaccessible |

Each checkpoint is worth 1 point.

| Total | Meaning |
|-------|---------|
| **10/10** | Ship-ready. Begin paid advisor onboarding. |
| **8–9/10** | Minor polish needed. Acceptable for pilot. |
| **6–7/10** | Address fails before expanding to paid advisors. |
| **<6/10** | Return findings to Antigravity for a fix sprint. |

---

## 🔍 What to Report Back

Please return a structured report with:

1. **Score: X/10**
2. **Per-checkpoint result** — pass / partial / fail + one-sentence note for each
3. **Screenshots** of any failures or unexpected UI states
4. **Top 1–3 priority fixes** (if any failures found)
5. **Overall readiness assessment** — Is this platform ready for paid advisor onboarding?

---

## 📌 Known Open Items (Do NOT deduct points for these)

These are pre-acknowledged gaps on the C22+ roadmap — note them if you see them, but do not count them as failures:

| Item | Status |
|------|--------|
| Manager Console uses local/static data, not live Firestore | Known — C22+ fix |
| Niche/ICP mastery resets on cache clear (not persisted cross-device) | Known — C22+ fix |
| Mobile layout not optimized (desktop-only) | Known — full sprint required |
| Mythos security layer described but not built | Known — future sprint |
| Daily digest email (Resend) fires tomorrow 7 AM CT — not yet verified live | Expected — Firebase logs will confirm |

---

## 🛠 If You Hit a Login Issue

If login fails entirely:
- Try a hard refresh (`Cmd+Shift+R`)
- Try incognito / private window
- Confirm URL is `https://theaumengine.web.app` (not `.firebaseapp.com`)
- Report the exact error text shown

---

*Audit brief prepared by Antigravity · C22 session end · April 15, 2026*  
*Estimated platform score: 9.0–9.5/10 going in*
