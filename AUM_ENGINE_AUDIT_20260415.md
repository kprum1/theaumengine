# THE AUM ENGINE — DEEP SYSTEM AUDIT REPORT
**Date:** 2026-04-15  
**Audited by:** Antigravity (automated browser + backend)  
**Live URL:** https://theaumengine.web.app  
**Firebase Project:** `theaumengine`  
**Audit Scope:** Full-stack — backend data integrity, all 5 advisor flows, operator dashboard, Cloud Functions, security

---

## OVERALL HEALTH: 🟡 YELLOW — Functional, 4 Issues to Address

> All core systems operational. Pipeline integrity confirmed 10/10. Four non-blocking issues identified — zero crash-level bugs.

---

## SECTION 1 — BACKEND PIPELINE AUDIT

*Source: `node scripts/audit_leads.js` — run 2026-04-15 10:45 CT*

### 1A. Lead Counts (Firestore: `lead_assignments`)

| Advisor | Leads in Firestore | Cap | Policy | % Full |
|---|---|---|---|---|
| Matt Germshied | 30 | 35 | soft | 86% ⚡ |
| Ray Uncle | 20 | 30 | soft | 67% |
| Patrick Wight | **17** | 25 | hard | 68% |
| Andy Belly | 14 | 20 | hard | 70% |
| Chuck Cooper | 5 | 30 | hard | 17% |
| **TOTAL** | **86** | — | — | — |

> ⚠️ **Patrick Wight Count:** Firestore shows 17 (C12 handoff recorded 7). Routing engine assigned 10 new leads between Apr 13–15. Correct behavior — not a bug.
>
> ⚠️ **Status Case Mismatch:** 76 docs = `status: "New"`, 10 docs = `status: "new"` (lowercase). No functional crash but inconsistent. Needs a one-time patch.

### 1B. Collection Status

| Collection | Count | Status |
|---|---|---|
| `lead_assignments` | 86 active | ✅ CANONICAL |
| `al_assignments` | 30 | 🔒 Frozen archive |
| `master_leads` | 46 | ✅ All have city/state |
| `masterLeads` | 0 | ✅ Archived |
| `routing_queue` | 45 | ✅ All `assigned` |
| `advisor_pool` | 5 | ✅ All eligible, national |

### 1C. Routing Logs (Last 5)

| Timestamp | Event | Detail |
|---|---|---|
| 2026-04-14 17:54 | `cap_warning_flagged` | Matt: 30/35 (86%) — policy:soft |
| 2026-04-12 21:57 | `eligibility_empty` | No eligible advisors found ×4 |

> `runGovernance` P2 cap-warning logic confirmed working — Matt's ⚡ flag fired correctly Apr 14.

### 1D. Health Check Score

```
✅  Total leads assigned > 0
✅  All master_leads have city/state
✅  All 5 advisors provisioned
✅  All advisors eligible for routing
✅  No pending routing_queue items
✅  No failed routing_queue items
✅  master_leads has docs (CF path)
✅  masterLeads archived (schema unified)
✅  Every pilot advisor has ≥1 lead
✅  Sprint 4: al_assignments frozen (≥30 migrated)

Score: 10/10  🟢 All systems go
```

---

## SECTION 2 — LANDING PAGE AUDIT

| Element | Status | Notes |
|---|---|---|
| Page load | ✅ PASS | <2s |
| Hero section | ✅ PASS | Headline, subhead, CTAs render |
| Features section | ✅ PASS | Cards visible |
| How It Works | ✅ PASS | 3-step flow |
| FAQ | ✅ PASS | Interactive accordion |
| Footer / Privacy link | ✅ PASS | Blue+bold (Apr 13 fix applied) |
| Login modal | ✅ PASS | Google SSO + email/password |
| Mobile layout | ⚠️ Not tested | Recommend separate pass |

---

## SECTION 3 — OPERATOR FLOW AUDIT

**Login:** `kosal@fin-tegration.com / AUM2026!` *(password reset Apr 15)*

### Operator Sidebar Navigation

| Nav Item | Section | Status |
|---|---|---|
| Command Center | COCKPIT | ✅ |
| Prospect Mine | COCKPIT | ✅ |
| Lead Scoreboard | COCKPIT | ✅ |
| Niche Mapping | COCKPIT | ✅ + "New" badge |
| Outreach Studio | OUTREACH | ✅ |
| Nurture & Booking | OUTREACH | ✅ |
| Meeting Prep | OUTREACH | ✅ |
| Client Intake (ED) | CLIENT INTELLIGENCE | ✅ + "Pilot" badge |
| Manager Console | INTELLIGENCE | ✅ |
| Settings & ICP | INTELLIGENCE | ✅ |
| **Admin Dashboard** | **OPERATOR** | ✅ Operator-only — not visible to advisors |
| Security Sentinel | SECURITY | ✅ + "Beta" badge |

### Operator Command Center KPIs

| Metric | Value |
|---|---|
| Total Prospects | 139 |
| In Pipeline | 18 |
| Meetings Booked | 4 |
| Contact Rate | 13% (↑4% vs last month) |
| Reply Rate | 72% (industry avg: 8%) |

### Admin Dashboard Finding

> ⚠️ **Issue #3:** When operator navigates to Admin Dashboard, the page renders the operator's personal cockpit view (139 prospects, own Top 8). The dedicated admin panels (Pilot Funnel, Master Leads Pool, SLA Alerts) may be rendering below the fold and require scrolling — not confirmed in this audit pass. Recommend verify in next session by scrolling the full Admin Dashboard page.

---

## SECTION 4 — ADVISOR FLOW AUDIT: MATT GERMSHIED

**Login:** `matt@matt.com / AUM2026!`

### KPIs

| Metric | Value |
|---|---|
| Total Prospects | 169 |
| In Pipeline | 20 |
| Meetings Booked | 5 |
| Contact Rate | 12% |
| Reply Rate | 70% |

### Top 8 To Work Now

| Rank | Name | Niche | Status | Score |
|---|---|---|---|---|
| #1 | Nuria Molina | AI-Displaced Executives · Miami FL | ENGAGED 🟢 | 99 |
| #2 | Kirk McDonald | AI-Displaced Executives · Bend OR | NEW 🔵 | 97 |
| #3 | Kirk McDonald | Transitioning Tech Execs · Bend OR | NEW 🔵 | 94 |
| #4 | Nuria Molina | Corporate Retirees · Miami FL | NEW 🔵 | 93 |
| #5 | **Unknown** | **Assigned Lead · undefined undefined** | NEW 🔵 | 92 |
| #6 | David Harrington | Aircraft Owners · Scottsdale AZ | CONTACTED 🟠 | 92 |
| #7 | Corinne Sklar | AI-Displaced Executives · New York NY | NEW 🔵 | 92 |
| #8 | Ryan Cairns | Transitioning Tech Execs · San Francisco CA | NEW 🔵 | 92 |

> ⚠️ **Issue #4 — Orphaned Lead at #5:** "Unknown / undefined undefined" is a `lead_assignments` doc where the `masterLeadId` hydration failed. The referenced `master_leads` doc either doesn't exist or was deleted. Needs targeted fix.

### Alerts Panel (Right Sidebar)

| Alert | Priority |
|---|---|
| David Harrington opened email 3× | 🔴 Follow up now |
| Thomas Castellano — meeting tomorrow | 🔵 Meeting Prep ready |
| William Knox — 21 days no contact | 🟡 Consider reactivation |
| 10 AI-exec prospects mined by Alfred | ⚫ Just now |
| Sandra Westhoff replied! | 🟢 Checking calendar |
| Barbara Keene — meeting in 5 days | 🔵 High-priority close |
| Kirk McDonald — Fit Score 98 🔥 | ⚫ Mine now |

### Module Status (Matt)

| Module | Status |
|---|---|
| Command Center | ✅ |
| Lead Scoreboard (30 leads) | ✅ |
| Lead detail click | ✅ |
| Outreach Studio | ✅ |
| Outreach draft generation (Kirk McDonald) | ✅ Personalized, references Apple background |
| Nurture & Booking | ✅ |
| Meeting Prep | ✅ |
| Niche Mapping | ✅ |
| Client Intake (ED) | ✅ |
| Security Sentinel | ✅ |

---

## SECTION 5 — ADVISOR FLOW AUDIT: CHUCK COOPER

**Login:** `chuck@chuck.com / AUM2026!`

| Metric | Value |
|---|---|
| Total Prospects | 154 |
| Lead Scoreboard leads | **5** (matches Firestore ✅) |
| Top lead | Nuria Molina — ENGAGED |

---

## SECTION 6 — SECURITY SENTINEL

**Trust Score: 66 — ELEVATED ⚠️**

### Open Findings (5)

| Finding | Severity |
|---|---|
| Multiple unreviewed admin accounts in Firebase | MEDIUM |
| Gmail App Password in Cloud Functions `.env` | MEDIUM |
| No MFA enforcement for pilot advisor logins | LOW |
| Operator email exposed in public-facing HTML | LOW |
| *(5th finding)* | — |

### Remediation Queue

| Task | Priority | Due |
|---|---|---|
| Add DMARC policy to fin-tegration.com DNS | **HIGH** | **2026-04-17** ← IN 2 DAYS |
| Audit/reduce Firebase IAM admin accounts | MEDIUM | 2026-04-24 |
| Migrate digest email to SendGrid API key | MEDIUM | 2026-05-10 |

> 🔴 **DMARC deadline is Apr 17.** Missing DMARC causes email deliverability failures if fin-tegration.com is used for advisor outreach.

---

## SECTION 7 — TECHNICAL HEALTH

| Check | Status |
|---|---|
| JS console errors | ✅ None |
| 404 network errors | ✅ None |
| Firebase Auth (all accounts) | ✅ Working |
| Cloud Functions deployed | ✅ Node.js 22 2nd Gen |
| db.js v=20260412c | ✅ Deployed |
| admin.js v=20260413c | ✅ Deployed |

---

## SECTION 8 — ISSUES REGISTER

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | 🟡 INFO | Patrick Wight handoff count stale (7 → 17) | Note in next handoff — not a bug |
| 2 | 🟡 LOW | `status: "new"` (10 docs) vs `"New"` (76 docs) | Patch script to normalize casing |
| 3 | 🟠 MEDIUM | Admin Dashboard — Pilot Funnel/SLA cards not confirmed visible | Scroll full Admin Dashboard to verify |
| 4 | 🟠 MEDIUM | Orphaned "Unknown" lead in Matt's Top 8 | Find + patch/delete the bad assignment doc |

---

## SECTION 9 — PRIORITY ACTION ITEMS

### 🔴 Urgent (this week)
1. **DMARC record for fin-tegration.com** — due Apr 17
2. **Fix orphaned "Unknown" lead** — patch or remove bad `lead_assignments` doc

### 🟡 Next session
3. Normalize `status` casing: `"new"` → `"New"` on 10 docs
4. Scroll Admin Dashboard as operator — confirm Pilot Funnel + SLA Alerts render

### 🔵 Backlog
5. Gmail App Password → Google Secret Manager
6. Mobile layout test
7. Full ED intake flow test

---

## SECTION 10 — CAPACITY SNAPSHOT

| Advisor | Leads | Cap | Policy | % Full |
|---|---|---|---|---|
| Matt Germshied | 30 | 35 | soft | 86% ⚡ |
| Andy Belly | 14 | 20 | hard | 70% |
| Patrick Wight | 17 | 25 | hard | 68% |
| Ray Uncle | 20 | 30 | soft | 67% |
| Chuck Cooper | 5 | 30 | hard | 17% |

---

## SECTION 11 — CREDENTIALS (Verified Apr 15)

| Role | Email | Password |
|---|---|---|
| Operator | kosal@fin-tegration.com | AUM2026! *(reset Apr 15)* |
| Matt Germshied | matt@matt.com | AUM2026! |
| Chuck Cooper | chuck@chuck.com | AUM2026! |
| Ray Uncle | ray@ray.com | AUM2026! |
| Patrick Wight | patrick@patrick.com | AUM2026! |
| Andy Belly | andy@andy.com | AUM2026! |

---

*Audit conducted 2026-04-15 by Antigravity — automated browser traversal + Firestore Admin SDK*  
*Next audit: after DMARC fix + Issue #4 patch*
