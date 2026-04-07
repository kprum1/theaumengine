# THE AUM ENGINE — PILOT LAUNCH PLAN
**Date:** April 6, 2026
**Phase:** 1.3 → "Piloted, Proven, Filling a Pipeline"
**Live:** https://www.theaumengine.com ✅ (DNS confirmed — resolves to 199.36.158.100)

---

## ✅ DNS STATUS — CONFIRMED LIVE

```
dig www.theaumengine.com +short
→ theaumengine.web.app.
→ 199.36.158.100   ✅ Correct Firebase Anycast IP

dig theaumengine.com +short
→ 199.36.158.100   ✅ Apex redirect also working
```

**www.theaumengine.com is fully propagated.** If you still see another site, it's local browser/ISP cache — flush with:
```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

---

## TRACK 1 — MAKE IT LIVE-READY BEFORE PILOTS ENTER

### Table Stakes Checklist

| Item | Status | Action |
|---|---|---|
| DNS propagation | ✅ Done | Resolved to 199.36.158.100 |
| Firebase Hosting domain connected | ✅ Done | Shown in Firebase console |
| `www.theaumengine.com` → Auth authorized domains | ⚠️ Verify | Firebase console → Auth → Settings → Authorized Domains |
| OG image (1200×630) | ❌ Needed | See below |
| Pilot accounts provisioned | ❌ Needed | Add 10 users in Firebase Auth |
| End-to-end QA on custom domain | ❌ Needed | See QA checklist below |
| Login working with `test@test.com` | ✅ Fixed | API key typo corrected this session |
| `"Pilot Login"` in nav | ✅ Done | Deployed |
| Trust bullets + Book Demo in nav | ✅ Done | Deployed |
| 12-niche pill grid | ✅ Done | 3-col desktop, 2-col mobile |
| "Need access?" link in modal | ✅ Done | Deployed |

### OG Image Spec
Generate: **1200 × 630px dark card**
- Background: deep navy (`#0a101c`) with subtle blue radial glow
- Top-left: The AUM Engine gem logo + wordmark in white
- Center headline: **"Niche Growth Engine for Financial Professionals"** (Inter, 900 weight, white)
- Subtext: **"Exclusive. Scored. In your voice."** (muted blue/gray)
- Bottom-right: subtle cockpit/dashboard grid visual or diamond facet pattern
- Right edge: faint niche pill tags as decorative element

### End-to-End QA Checklist
Run from `https://www.theaumengine.com` (not the .web.app URL):

```
[ ] Desktop Chrome — landing page loads, pills display, scroll works
[ ] Desktop Chrome — Login → modal opens → test@test.com / test2026 → cockpit loads
[ ] Desktop Chrome — Cockpit nav functions, logout → returns to landing
[ ] Mobile Safari (iPhone) — landing page loads, pills 2-col, hero readable
[ ] Mobile Safari — Login flow → cockpit → logout
[ ] Incognito Chrome — confirm no cached session bleeds in
[ ] Check "Book Demo" and "Pilot Login" both open the modal correctly
```

---

## TRACK 2 — LAND AND MANAGE 10 PILOTS

### Pilot Charter (what to promise each firm)

**What you deliver (30-day pilot):**
- 25–50 niche-qualified, pre-scored prospect households in their chosen niche
- AI-drafted outreach emails and LinkedIn messages for each prospect
- Access to the full Advisor Growth Cockpit (Niche Board, Outreach Studio, Meeting Prep)
- One onboarding call (30–45 min) + one check-in call at Day 15

**What they commit to:**
- Complete the Niche Mapping Assessment in Week 1
- Process at least 10 prospects through Outreach Studio
- Log at least 3 meeting outreach attempts
- 30-minute feedback call at Day 30
- Rate prospect quality (thumbs up/down) in the cockpit

**Success definition:**
- ≥ 1 meeting booked OR ≥ 5 replies to outreach
- Advisor can articulate which niche fits best and why
- Net Promoter feedback: "Would you pay for this?"

### Pilot Account Provisioning Template

For each firm, create in Firebase Auth:
```
Email:    advisor@firmname.com
Password: [temp 12-char — send via secure channel]
```

Keep a local log:
| Firm | Contact Name | Email | Temp PW | Onboarded | Status |
|---|---|---|---|---|---|
| Firm 1 | | | | | |
| ... | | | | | |

### Onboarding Call Agenda (45 min)
1. **Min 0–5:** Welcome, what this session covers
2. **Min 5–15:** Niche Mapping Assessment — run it live, pick top 2 niches
3. **Min 15–25:** Settings & ICP — configure their ideal client profile
4. **Min 25–35:** Prospect Mine walkthrough — show board, explain scoring
5. **Min 35–42:** Outreach Studio demo — draft their first message live
6. **Min 42–45:** Meeting Prep, Manager Console, how to log feedback

### Pilot Metrics (agree in advance per firm)
| Metric | Target |
|---|---|
| Prospects reviewed | ≥ 15 |
| Messages sent (via Outreach Studio) | ≥ 5 |
| Meetings requested | ≥ 2 |
| Meetings booked | ≥ 1 |
| Niche fit score (subjective, 1–5) | ≥ 4 |

---

## TRACK 3 — LIGHT GTM LAYER

### Lead Capture on Landing Page
**Where:** Founding Offer section (`#offer`)
**What:** Single email field — "Get founding cohort details sent to your inbox."
**How:** Hook to [Formspree](https://formspree.io) (free, no backend needed) or Mailchimp embedded form
**Copy:**
```
[your@email.com]  [Get the details →]
"No account created yet. We'll reach out personally."
```

> [!NOTE]
> Formspree is the fastest path — 1 form tag with `action="https://formspree.io/f/YOUR_ID"`. Takes 10 minutes to set up and starts collecting emails immediately.

### Social Proof Block
**Where:** Below the value prop cards section
**Format:** Single anonymous quote card to start
**Copy:**
> *"This is the first prospecting tool that actually feels like it understands how an independent advisor grows. The niche scoring alone saved us months of chasing the wrong market."*
> — **Beta Advisor, $180M AUM, Midwest**

Add a second after you have real pilot quotes.

### Walkthrough Video
**Format:** 60–90 second Loom or screen recording
**Script outline:**
1. (0–10s) Open theaumengine.com — show the hero + pill grid
2. (10–20s) Log in → cockpit loads — "Here's what pilots see"
3. (20–40s) Walk the Niche Board — "Every card is a scored household in your niche"
4. (40–60s) Open Outreach Studio — "Here's a draft message, ready to approve"
5. (60–75s) Return to landing — "This is what 25 niche households a month looks like"
**Embed under:** "How It Works" section

---

## TRACK 4 — BUILD ROADMAP (For Big Nate / Alfred)

### Near-term — Phase 1.4

#### Pilot Feedback Loop in Cockpit
Add a simple feedback panel per prospect card:
```
👍 Good fit   👎 Not a fit   📝 [Free text note]
```
Saves to localStorage initially, Firestore in Phase 2.

#### Manager Console "Pilot Summary Tile"
A concise top tile showing:
```
This month:   12 prospects  |  6 contacted  |  2 meetings booked
```
This is what you screenshot for pilot check-in emails.

#### Formspree Lead Capture
Add to `#offer` section in `index.html`:
```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST" class="lead-capture-form">
  <input type="email" name="email" placeholder="your@email.com" required />
  <button type="submit">Get founding cohort details →</button>
</form>
```

### Medium-term — Phase 2

#### Firestore Data Layer
- Migrate ICP settings from `localStorage` → Firestore (`users/{uid}/settings`)
- Migrate prospect board state → (`users/{uid}/prospects`)
- Per-user niche config, notes, meeting logs persist cross-device

#### Alfred Pipeline Integration
- Alfred's miner outputs monthly prospect batches as JSON
- Import script pushes to `prospects/{userId}/monthly/{month}` in Firestore
- Cockpit reads from Firestore instead of static `data.js`
- Enables true per-user, per-niche automated prospect delivery

---

## ONE-PAGE PILOT BRIEF (send to each firm)

---

**THE AUM ENGINE — PILOT ACCESS**

**What you're getting:**
A 30-day guided access to the Advisor Growth Cockpit — a niche prospecting engine built specifically for independent Financial Professionals at the $50M–$250M AUM plateau.

**What's in your cockpit:**
- 25–50 niche-qualified, pre-scored prospect households in your chosen niche
- AI-drafted outreach emails + LinkedIn messages for each prospect
- Niche Mapping Assessment to identify your top-fit segments
- Meeting Prep smart briefs for every booked call
- Your own Manager Console to track pipeline by stage

**Your login:**
- URL: https://www.theaumengine.com
- Email: [PROVIDED]
- Password: [PROVIDED — change after first login]

**What we ask from you:**
- Complete the Niche Mapping Assessment in your first week
- Process at least 10 prospects through Outreach Studio
- Join one 30-minute feedback call at the end of the pilot

**Timeline:** 30 days from onboarding call
**Your contact:** [Your name + email]

Questions? Reply here or click "Need access? Request pilot info" on the login screen.

---

*The AUM Engine — Pilot Phase 1 | April 2026*

---

## PRIORITY ORDER THIS WEEK

```
[ ] 1. Verify www.theaumengine.com in Firebase Auth authorized domains
[ ] 2. Generate + upload OG image to /assets/og-image.png → redeploy
[ ] 3. Add Formspree lead capture to #offer section
[ ] 4. Provision 10 pilot accounts in Firebase Auth
[ ] 5. Run end-to-end QA from www.theaumengine.com on mobile Safari
[ ] 6. Schedule 10 onboarding calls (30-45 min each)
[ ] 7. Record 60-90s walkthrough video → embed in How It Works
[ ] 8. Draft + send Pilot Brief above to each firm
```

---

*Prepared by Antigravity AI (Vera) — April 6, 2026*
*Conversation ID: e73df206-0cf0-4777-83fb-a1c4e4500c2b*
