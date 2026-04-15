# AUM ENGINE — Session Handoff C13
**Date:** 2026-04-15  
**Session:** C13 — Deep Audit + Perplexity Audit Review  
**Repo:** `kprum1/theaumengine`  
**Live URL:** https://theaumengine.web.app  
**Operator login:** kosal@fin-tegration.com / AUM2026! *(reset Apr 15 — was broken)*  
**Firebase project:** `theaumengine`  
**Firebase CLI:** `/usr/local/bin/firebase`  
**Node path:** always `export PATH="/opt/homebrew/bin:$PATH"` before any node command

---

## ⚠️ RESUME INSTRUCTIONS — READ FIRST

1. Run `node scripts/audit_leads.js` — must return **10/10 🟢 All systems go**
2. `lead_assignments` is the ONLY canonical collection. `al_assignments` = frozen archive. Never write to it.
3. **4 MAJOR bugs identified by Perplexity audit (see §3) — fix these before any advisor demo**
4. Operator password was reset Apr 15. New password: `AUM2026!`
5. All 5 Cloud Functions deployed on Node.js 22 (2nd Gen)
6. `serviceAccountKey.json` lives in `scripts/` — never commit
7. **Start with:** fix the `"test"` artifact in Outreach Studio templates — it's the most embarrassing bug

---

## 1. WHAT HAPPENED THIS SESSION (C13)

### 1A. Handoff Chain Audit ✅
- Confirmed full chain: `B2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10 → C11 → C12`
- No missing files. C1/C2 never existed — C-series started at C3. Chain is intact.
- **`HANDOFF_C12.md` was the previous ground truth** — now superseded by this doc.

### 1B. Operator Password Reset ✅
- `kosal@fin-tegration.com` was returning 400 (password changed since last handoff)
- Reset via `scripts/reset_operator_password.js` → Admin SDK force-reset to `AUM2026!`
- Confirmed working in browser.

### 1C. Deep System Audit ✅
- Full audit report written to `AUM_ENGINE_AUDIT_20260415.md` (committed `7747df6`)
- Backend: **10/10 🟢 All systems go**
- Site: 🟡 YELLOW — 4 issues found (see §4)

### 1D. Perplexity Computer Audit Reviewed ✅
- Perplexity ran a live browser audit and produced `AUM_Engine_Audit_Report.pdf`
- Score: **6.5 / 10**
- Found 14 bugs: **4 MAJOR**, 10 Minor
- Full findings catalogued in §3 below

---

## 2. CURRENT SYSTEM STATE

### Lead Counts (as of Apr 15, 10:45 CT)

| Advisor | Leads | Cap | Policy | % Full |
|---|---|---|---|---|
| Matt Germshied | **30** | 35 | soft | 86% ⚡ cap warning fired Apr 14 |
| Ray Uncle | 20 | 30 | soft | 67% |
| Patrick Wight | **17** | 25 | hard | 68% |
| Andy Belly | 14 | 20 | hard | 70% |
| Chuck Cooper | 5 | 30 | hard | 17% |
| **TOTAL** | **86** | — | — | — |

> Patrick Wight jumped from 7 → 17: routing engine assigned 10 new leads Apr 13–15. Normal behavior.

### Collection Status

| Collection | Count | Status |
|---|---|---|
| `lead_assignments` | 86 | ✅ CANONICAL |
| `al_assignments` | 30 | 🔒 Frozen archive |
| `master_leads` | 46 | ✅ All have city/state |
| `routing_queue` | 45 | ✅ All `assigned` |
| `advisor_pool` | 5 | ✅ All eligible, national |

### Cloud Functions (all live)

| Function | Status | Last Activity |
|---|---|---|
| `processRoutingQueue` | ✅ Active | Assigned 10 leads to Patrick Apr 13–15 |
| `runGovernance` | ✅ Active | Fired Matt cap warning Apr 14 17:54 |
| `onLeadIngested` | ✅ Deployed | — |
| `alfredIngest` | ✅ Deployed | — |
| `sendDailyDigest` | ✅ Deployed | — |

---

## 3. PERPLEXITY AUDIT — FULL BUG LOG

**Overall Score: 6.5 / 10**  
*Source: `AUM_Engine_Audit_Report.pdf` — live browser session Apr 15, 2026*

### Scorecard

| Category | Score |
|---|---|
| Core Product Vision | ★★★★★ 5/5 |
| Data Quality & AI | ★★★★★ 5/5 |
| Visual Design | ★★★★☆ 4/5 |
| Navigation | ★★★★★ 5/5 |
| Outreach Workflow | ★★★☆☆ 3/5 |
| Onboarding | ★★☆☆☆ 2/5 |
| Non-Tech Advisor Clarity | ★★★☆☆ 3/5 |
| Security & Account Mgmt | ★★☆☆☆ 2/5 |

### MAJOR Bugs (must fix before advisor demo)

| # | Bug | Location | Notes |
|---|---|---|---|
| **M1** | Generated email draft ends with literal word `"test"` | Outreach Studio | A stale artifact in the template. Advisor sends this = credibility destroyed. |
| **M2** | Client Intake shareable link shows `YOUR_UID` literally | Client Intake (ED) | Must be dynamic logged-in UID + one-click copy button |
| **M3** | `kosal@fin-tegration.com` hardcoded in consent screen | Client Intake (ED) | Every advisor's client sees Kosal's email. Must pull from logged-in advisor's profile |
| **M4** | Security Sentinel accessible to all logged-in users | Security Sentinel | Exposes Firebase IAM issues, API credential risks, remediation timelines to all advisors. Role-gate to operator only. |

### Minor Bugs

| # | Bug | Location |
|---|---|---|
| M5 | No send confirmation dialog — "Send Now" fires blind | Outreach Studio |
| M6 | No onboarding / first-run experience | Whole App |
| M7 | Trend sparklines render empty/flat | Command Center |
| M8 | `kosal@fin-tegration.com` login was failing | Login *(fixed this session)* |
| M9 | Feedback column clipped in Lead Scoreboard | Lead Scoreboard |
| M10 | No account management UI (change email/password) | Settings |
| M11 | "Phase B" label unexplained in routing profile | Settings & ICP |
| M12 | "Building" agents shown with no ETA | Settings & ICP |
| M13 | Badge counter "3" has no tooltip | Command Center |
| M14 | "Mythos · Coming Soon" unexplained in Security Sentinel | Security Sentinel |

### Perplexity Advisor Clarity Recommendations

1. **"Start Here" Banner** — persistent banner with 2-3 min Loom walkthrough link
2. **Label every nav item plainly** — one-liner below each: "Outreach Studio — Write and send emails with AI help"
3. **Persistent Help button** — bottom-right, support email or Calendly
4. **Hide Building/Beta features** — remove "Building" agents from nav until ready
5. **"What's Next?" prompts** — after Niche Mapping → "Now review your top prospects in Lead Scoreboard"

### Perplexity Strong Points (don't touch)

- Dark navy SaaS design — "clean hierarchy, sharp headline"
- Top 8 AI priority scores (92–99) — "sophisticated and actionable"
- AI draft quality — "genuinely personalized, references specific signals (aircraft ownership, succession, AOPA Fly-In)"
- 5-touch cadence builder with compliance check
- Live alerts feed — email opens, meeting confirmations, Alfred mining events
- Navigation: "all 11 items load correctly — zero dead links or 404s"

---

## 4. OURDEEP AUDIT — ISSUE REGISTER

*Source: `AUM_ENGINE_AUDIT_20260415.md`*

| # | Severity | Issue | Fix |
|---|---|---|---|
| A1 | 🟡 INFO | Patrick Wight count in C12 handoff stale (7→17) | Note only — not a bug |
| A2 | 🟡 LOW | 10 docs have `status: "new"` vs standard `"New"` | Patch script to normalize |
| A3 | 🟠 MEDIUM | Admin Dashboard Pilot Funnel/SLA panels not confirmed visible | Scroll full Admin Dashboard as operator to verify |
| A4 | 🟠 MEDIUM | Orphaned "Unknown" lead in Matt's Top 8 | Find/patch the `lead_assignments` doc where `masterLeadId` resolves to null |

---

## 5. PRIORITY SPRINT PLAN (next session)

### 🔴 DO FIRST — Blockers (all before any advisor demo)

```
P1. Fix "test" artifact in outreach templates
    → Search all template strings in js/outreach_agent.js for "test"
    → Remove stale string, audit all template closings

P2. Fix Client Intake YOUR_UID placeholder
    → js/ed_intake_engine.js or js/pages.js — find where intake link is built
    → Replace with: window.location.origin + '?ref=' + firebase.auth().currentUser.uid
    → Add one-click copy button

P3. Fix hardcoded kosal@fin-tegration.com in consent screen  
    → Find hardcoded email in intake/consent template
    → Replace with: advisorProfile.email or firebase.auth().currentUser.email

P4. Role-gate Security Sentinel
    → In js/pages.js or js/sentinel.js: check isOperator() before rendering
    → If !isOperator(): either hide from sidebar nav or show "Operator access required"
```

### 🟠 THIS SPRINT — High Impact Polish

```
P5. Send confirmation dialog
    → Wrap "Send Now" click handler with a modal: "Ready to send to [Name]? [Preview / Confirm / Cancel]"

P6. Onboarding first-run modal
    → Detect: !localStorage.getItem('aum_onboarded')
    → Show 3-step modal: Complete Niche Mapping → Review Prospects → Draft First Outreach → Set ICP
    → Set flag on dismiss

P7. Fix orphaned "Unknown" lead (A4)
    → node scripts/find_orphaned_leads.js (needs to be written)
    → Query lead_assignments where ownerUid = matt_uid, hydrate each masterLeadId
    → If master_leads doc missing: patch name from al_assignments archive or delete

P8. Normalize status casing (A2)
    → Patch 10 docs: status "new" → "New"
```

### 🟡 BACKLOG

```
P9.  Admin Dashboard scroll verification (A3)
P10. Sparklines empty state ("Send first outreach to see data")
P11. Lead Scoreboard feedback column CSS fix
P12. DMARC record for fin-tegration.com (due Apr 17 per Security Sentinel)
P13. Niche Mapping "Save & Exit" partial progress
P14. Nav item sub-labels (non-tech advisor clarity)
P15. Help/support button (bottom-right)
P16. Account management UI (change email/password)
```

---

## 6. FILES MODIFIED THIS SESSION

| File | Change |
|---|---|
| `AUM_ENGINE_AUDIT_20260415.md` | NEW — deep audit report (289 lines) |
| `scripts/reset_operator_password.js` | NEW — operator password reset tool |
| `HANDOFF_C11.md` | Written prior session — Sprint 4 unification |
| `HANDOFF_C12.md` | Written prior session — governance hardening |

---

## 7. GIT LOG (last 8 commits)

```
7747df6 docs: deep system audit 2026-04-15 — 10/10 pipeline, 4 issues logged
18dc924 docs(skill): alfred real data sourcing brief
5cf15f3 fix(skill): alfred_lead_ingest — no API key access
cef3dbe docs(skill): alfred_lead_ingest SKILL.md
d3085c8 fix(ui): make Privacy Policy link clickable
d8b6e9a docs: add CAZ_MASTER_HANDOFF.md
0c9794a docs: session handoff C12
13fd341 fix(admin): Pilot Funnel count — lead_assignments not al_assignments
```

---

## 8. KEY FILE VERSIONS (index.html)

| File | Version |
|---|---|
| `js/db.js` | v=20260412c |
| `js/admin.js` | v=20260413c |
| `js/app.js` | v=20260410f |
| `js/auth.js` | v=20260410c |
| `js/pages.js` | v=20260410c |
| `js/sentinel.js` | v=20260410e |

---

## 9. CREDENTIALS (all verified Apr 15)

| Role | Email | Password |
|---|---|---|
| Operator | kosal@fin-tegration.com | AUM2026! *(reset Apr 15)* |
| Matt Germshied | matt@matt.com | AUM2026! |
| Chuck Cooper | chuck@chuck.com | AUM2026! |
| Ray Uncle | ray@ray.com | AUM2026! |
| Patrick Wight | patrick@patrick.com | AUM2026! |
| Andy Belly | andy@andy.com | AUM2026! |

---

## 10. SCRIPTS REFERENCE

| Script | Command | Purpose |
|---|---|---|
| `audit_leads.js` | `node scripts/audit_leads.js` | **Run first every session** — 10 checks |
| `reset_operator_password.js` | `node scripts/reset_operator_password.js` | Force-reset operator pw to AUM2026! |
| `patch_missing_location.js` | `node scripts/patch_missing_location.js` | Patch master_leads with missing city/state |
| `migrate_al_to_lead_assignments.js` | `node scripts/migrate_al_to_lead_assignments.js` | Sprint 4 migration (DONE — idempotent) |
| `trigger_routing.js` | `node scripts/trigger_routing.js` | Manual routing pass |
| `requeue_failed.js` | `node scripts/requeue_failed.js` | Reset failed routing items → pending |
| `provision_pilot_advisors.js` | `node scripts/provision_pilot_advisors.js` | Re-provision all 5 pilot advisors |

---

## 11. CONTEXT NOTE FOR NEXT SESSION

**This conversation (ebfee285) is at ~95% context capacity — do NOT continue in this session.**

What was covered in this session:
- Handoff chain audit (C1→C12) — all verified clean
- Operator login fixed (password reset)
- Deep backend + browser audit (10/10 pipeline, 4 UI issues)
- Perplexity audit PDF reviewed and catalogued (6.5/10, 4 MAJOR bugs)

**Start your next session with:**
> "Read HANDOFF_C13.md. Run `node scripts/audit_leads.js`. Then fix the 4 MAJOR bugs from the Perplexity audit — start with P1 (the 'test' artifact in Outreach Studio)."

---

*Handoff written 2026-04-15 by Antigravity — C13 session end*  
*Next session: C14 — Perplexity Bug Sprint*
