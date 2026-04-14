# The AUM Engine — Complete System Overview
**Version:** Sprint 4 (C12) | **Date:** 2026-04-13  
**Live URL:** https://theaumengine.web.app  
**Firebase Project:** `theaumengine`  
**Author:** Kosal Prum / Antigravity (AI)  
**For:** Vera Review — compliance, security, and architecture sign-off

---

## Table of Contents
1. [What This App Is](#1-what-this-app-is)
2. [Who Uses It](#2-who-uses-it)
3. [High-Level Architecture](#3-high-level-architecture)
4. [The Full User Journey](#4-the-full-user-journey)
5. [Advisor Workflow — Step by Step](#5-advisor-workflow--step-by-step)
6. [Lead Lifecycle — End to End](#6-lead-lifecycle--end-to-end)
7. [Firestore Collections & Schema](#7-firestore-collections--schema)
8. [Security Rules](#8-security-rules)
9. [Cloud Functions](#9-cloud-functions)
10. [Admin / Operator Dashboard](#10-admin--operator-dashboard)
11. [Governance System](#11-governance-system)
12. [Data Layer (db.js)](#12-data-layer-dbjs)
13. [Pilot Advisor Cohort](#13-pilot-advisor-cohort)
14. [Current Data State](#14-current-data-state)
15. [Known Issues & Open Decisions](#15-known-issues--open-decisions)
16. [What Is NOT Active Yet](#16-what-is-not-active-yet)
17. [Vera Questions / Review Flags](#17-vera-questions--review-flags)

---

## 1. What This App Is

**The AUM Engine** is a B2B SaaS platform for independent financial advisors. It automates lead sourcing, scoring, routing, and outreach — giving advisors a structured pipeline of high-net-worth prospects matched to their specific niche, geography, and capacity.

### Core Value Proposition
- An advisor logs in → sees a curated scoreboard of leads matched to them
- They can see the lead's background, AUM estimate, and why they were matched
- They draft and send outreach (email/call/LinkedIn) from within the app
- The app tracks reply outcomes and moves leads through a pipeline
- The operator (Kosal) sees all advisor activity, funnel metrics, and governance alerts on the Admin Dashboard

### What It Is NOT
- It is **not** a CRM replacement (no full contact management, no deal tracking beyond the pipeline)
- It is **not** a public-facing tool — advisors log in with pre-provisioned credentials
- It is **not** collecting data from end clients (the "leads" are sourced externally via Alfred/CSV, not from client self-service)

---

## 2. Who Uses It

| Role | Access | Credentials |
|---|---|---|
| **Operator** (Kosal) | Full admin — all collections, all advisors, all governance flags | kosal@fin-tegration.com |
| **Pilot Advisor** (5 total) | Scoped to their own leads, their own settings | See §13 |
| **Alfred** (AI agent) | HTTP-only — posts leads to `onLeadIngested` / `alfredIngest` endpoints | API key via env var |

**No public registration.** All advisors are manually provisioned by the operator.

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (index.html)                      │
│  Firebase Auth → app.js → pages.js → db.js                  │
│  admin.js (operator only) | outreach_controller.js           │
│  sentinel.js | funnel_tracker.js | niche_engine.js           │
└──────────────────┬──────────────────────────────────────────┘
                   │  Firebase SDK (compat)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 FIREBASE (theaumengine project)              │
│                                                              │
│  Hosting          → theaumengine.web.app (static SPA)        │
│  Authentication   → Email/Password only                      │
│  Firestore        → All persistent state                     │
│  Cloud Functions  → 5 functions (Node.js 22, 2nd Gen)        │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS — single-page app (SPA). No framework, no build step.
- **Backend:** Firebase Cloud Functions (Node.js 22, 2nd Gen)
- **Database:** Firestore (NoSQL)
- **Auth:** Firebase Authentication (Email/Password)
- **Hosting:** Firebase Hosting (CDN-served static files)
- **Email:** Nodemailer + Gmail SMTP (daily digest function)

---

## 4. The Full User Journey

### Advisor Journey
```
Login → Command Center (dashboard) → Niche Mapping (one-time setup)
     → Lead Scoreboard (see assigned leads)
     → Outreach Studio (draft + send message)
     → Reply Tapper (log reply outcome)
     → Nurture & Booking (snooze / schedule)
     → Meeting Prep (AI brief before a call)
     → Settings (ICP config, Calendly link)
```

### Operator Journey
```
Login → Admin Dashboard
     → Live Sessions panel (who's online)
     → Pilot Funnel (30-day KPIs across all advisors)
     → Master Leads Pool (all 46 leads, filter by niche/status)
     → SLA Alerts (governance flags — SLA breaches + cap warnings)
     → Outreach Outcomes (send analytics)
```

### Lead Journey (Backend)
```
Alfred/CSV → onLeadIngested (HTTP) → master_leads + routing_queue
          → processRoutingQueue (every 5 min)
               → checkOwnership → runEligibility → runScoring → finalizeAssignment
          → lead_assignments (canonical)
          → Advisor sees lead on next login
          → runGovernance (daily) → governance_flags (if SLA breach or at-cap)
```

---

## 5. Advisor Workflow — Step by Step

### Step 1: Login
- Firebase Email/Password auth
- On login, `bootstrapUserData(uid)` runs → loads niche profile, ICP config, and assigned leads from Firestore
- Assigned leads (from `lead_assignments`) are merged into the in-memory `PROSPECTS[]` array and prepended so they appear first

### Step 2: Niche Mapping (First Login Only)
- A 3-stage wizard: Macro → Meso → Micro questions
- Likert-scale responses scored across 5 zones: Fit, Specialization, Market Depth, Entry Points, Service Match
- Results: Top 3 niche matches with match scores (0–100)
- "Apply to Settings" syncs the discovered niches to:
  - `users/{uid}/data/advisorProfile` (login persistence)
  - `advisor_pool/{uid}` (routing engine eligibility)
- Profile is printable as a PDF and downloadable as JSON
- Sessions are dual-written: localStorage (instant) + Firestore (cross-device)

### Step 3: Lead Scoreboard
- Shows all assigned leads, filtered by status (`New`, `Contacted`, `Engaged`, etc.)
- Leads from Firestore (`_fromFirestore: true`) are real routed leads
- Demo leads (hardcoded in `data.js`) are shown alongside for UX demonstration
- Clicking a lead opens a drawer with:
  - Full profile (name, title, company, location, AUM estimate, niche, scores)
  - Pipeline status buttons
  - Go to Outreach Studio
  - Thumbs up/down feedback (written to Firestore)

### Step 4: Outreach Studio
- Select prospect from dropdown
- Choose channel: Email, Call, LinkedIn, Voicemail
- Choose outreach angle: Direct, Soft, Insight-Led
- AI generates 3 email variants (A/B/C) based on prospect profile and ICP
- Advisor picks a variant, edits if desired, clicks "Send Now"
- On send:
  - `outreach_outcomes` doc written to Firestore (channel, variant, stage, angle)
  - `funnel_events` doc written (event: `outreach_sent`)
  - Lead status can be updated inline

### Step 5: Reply Tapper
- After outreach, advisor logs reply outcome:
  - `reply`, `positive`, `meeting`, `dead`, `objection`, `not_now`, `unsubscribe`
- Write-back to `lead_assignments` via `updateAlAssignmentReply()` (Sprint 4 unified)
- Also updates `outreach_outcomes` doc with `replyType`
- Fires `funnel_events` doc (event: `reply_logged`)

### Step 6: Nurture & Booking
- Snooze a "Dead" lead for 90/120/180/365 days (or custom)
- Lead status becomes `Snoozed` — hidden from active pipeline
- Auto-promotes back to `New` when snooze window expires (checked on every `navigate()`)
- Booking link (Calendly URL) stored in `advisor_settings/{uid}` — cross-device

### Step 7: Meeting Prep
- Advisor selects a prospect booked for a meeting
- App generates an AI planning brief covering:
  - Lead background summary
  - Recommended talking points
  - Objection handles
  - AUM context

### Step 8: Settings
- ICP Config: min AUM, target professions, life event triggers, messaging angle
- Booking link (Calendly) — synced cross-device via Firestore
- Niche profile reset / retake option

---

## 6. Lead Lifecycle — End to End

```
INGEST
  Alfred or operator POSTs lead to /onLeadIngested or /alfredIngest
  → Idempotency check (SHA-256 hash of name + email + phone)
  → Write master_leads/{id} (ownershipStatus: unassigned)
  → Write routing_queue/{id} (status: pending)

ROUTING (every 5 min via processRoutingQueue)
  → Lock queue item
  → Load master_lead data
  1. checkOwnership    — is this lead already assigned? (skip if yes)
  2. runEligibility    — filter advisor_pool by:
       • eligibleForRouting == true
       • nicheIds includes lead.nicheId
       • licensedStates includes lead.state (or National)
       • totalActive < effectiveCap (hard cap: strict; soft cap: +1 grace slot)
  3. runScoring        — weighted score per advisor:
       • nicheMatch (40%), geographyMatch (20%), aumBandMatch (20%)
       • capacityHeadroom (10%), fairness (10%)
  4. finalizeAssignment — batch write:
       • lead_assignments/{id} (ownerUid, ownershipStatus: active, slaDeadline: +30d)
       • routing_queue/{id} status → assigned
       • master_leads/{id} ownershipStatus → assigned

ADVISOR SEES LEAD
  → Next login: bootstrapUserData loads lead_assignment + hydrates master_lead
  → Lead prepended to PROSPECTS[] (appears first in scoreboard)

ADVISOR WORKS LEAD
  → Status changes written to lead_assignments.advisorStatus
  → Reply outcomes written to lead_assignments.replyType + outreach_outcomes
  → Funnel events written to funnel_events (viewed, drafted, sent, replied, booked)

GOVERNANCE (daily via runGovernance)
  → SLA audit: lead_assignments where slaDeadline < now → governance_flags
  → Cap sweep: advisors at ≥90% capacity → governance_flags (approaching_cap)
  → Auto-resolve: cap flags if advisor drops below threshold on next run

OPERATOR ACTION
  → Admin Dashboard SLA Alerts card shows active flags
  → Operator clicks "✓ Resolve" → writes resolvedAt to governance_flags
  → Flag disappears from active view
```

---

## 7. Firestore Collections & Schema

### Canonical Lead Collections

#### `lead_assignments` — **THE CANONICAL COLLECTION** (77 docs, Sprint 4)
All new assignments go here. Covers both CF-routed leads and migrated legacy leads.

```
{
  masterLeadId,        // → master_leads/{id}
  ownerUid,            // advisor Firebase UID
  ownershipStatus,     // 'active' | 'released'
  advisorStatus,       // 'New' | 'Contacted' | 'Engaged' | 'Snoozed' | ...
  status,              // same as advisorStatus (kept for compat)
  assignedAt,          // ISO timestamp
  slaDeadline,         // ISO timestamp (assignedAt + 30 days by policy)
  assignedBy,          // 'RoutingOrchestrator_v1' | 'migrate_al_to_lead_assignments_v1'
  migratedFromAlId,    // (migrated docs only) → al_assignments/{id}
  replyType,           // 'reply' | 'positive' | 'meeting' | 'dead' | ...
  replyOutcome,
  repliedAt,
  fitScore, timingScore, priorityScore, routingScore,
  source, batchId,
  releasedAt, releasedReason, previousOwners,
  createdAt, updatedAt
}
```

**SLA policy:** `slaDeadline = assignedAt + 30 days` (written at assignment time).  
**Governance alert threshold:** `slaDeadline < now` → flag written.

#### `al_assignments` — 🔒 FROZEN ARCHIVE (30 docs)
Legacy collection. All 30 docs migrated to `lead_assignments` in Sprint 4 (April 12, 2026). **No new writes.** Firestore rules enforce `allow create: if false; allow update: if false`.

#### `master_leads` — Source of Truth for Lead Data (46 docs)
Raw lead data from Alfred/CSV ingest. Never modified by advisors.

```
{
  firstName, lastName, email, phone,
  title, company, city, state,
  estimatedAUM, niche, nicheId,
  fitScore, timingScore,
  signals: {},           // enrichment signals
  reasonCodes: [],
  ownershipStatus,       // 'unassigned' | 'assigned'
  currentOwnerUid,
  source,                // 'alfred' | 'csv' | 'api'
  ingestedAt, updatedAt
}
```

---

### Routing Collections

#### `routing_queue` (45 docs — all `assigned`)
```
{
  masterLeadId,
  idempotencyKey,        // SHA-256 hash for dedup
  status,                // 'pending' | 'processing' | 'assigned' | 'failed'
  priority,              // 50 = default, 60 = alfred
  attempts,
  lockedBy, lockedUntil,
  assignedTo, assignedAt,
  createdAt, updatedAt
}
```

#### `advisor_pool` (5 docs — one per pilot advisor)
```
{
  firmName,
  eligibleForRouting,    // true
  nicheIds: [],          // ['yacht-owners', 'physicians', ...]
  licensedStates: [],    // [] = National
  activeLeadCap,         // 20–35 depending on advisor
  capPolicy,             // 'hard' | 'soft'
  capWarningPct,         // optional — read by runGovernance (default 0.90)
  targetAUMBands: [],
  updatedAt
}
```

#### `routing_policies` (1 doc — `default_v1`)
```
{
  weights: {
    nicheMatch: 0.40, geographyMatch: 0.20, aumBandMatch: 0.20,
    capacityHeadroom: 0.10, fairness: 0.10
  },
  slaWindowDays: 7,      // used by runGovernance SLA audit
  capWarningPct: 0.90,   // used by runGovernance cap sweep (default 0.90)
  activeAt: ISO
}
```

#### `routing_logs` — Audit trail (append-only)
All routing events: `lead_ingested`, `lead_assigned`, `eligibility_empty`, `cap_overflow_warning`, `sla_breach_flagged`, `cap_warning_flagged`

---

### Governance

#### `governance_flags`
Written by `runGovernance` (Cloud Function, Admin SDK). Operator reads + writes `resolvedAt` via browser.

**SLA Breach flag:**
```
{
  reason: 'sla_breach',
  sourceCollection: 'lead_assignments',
  sourceDocId,
  masterLeadId,
  ownerUid,
  assignedAt,
  lastStatus,
  slaWindowDays,
  flaggedAt,
  resolvedAt: null,      // set by operator via UI or auto-resolve
  resolvedBy: null,
  resolution: null
}
```

**Cap Warning flag:**
```
{
  reason: 'approaching_cap',
  ownerUid,
  firmName,
  cap,                   // advisor's activeLeadCap
  capPolicy,             // 'hard' | 'soft'
  capWarningPct,         // threshold used (e.g. 0.90)
  warnAt,                // floor(cap * capWarningPct)
  totalActive,           // current count
  pctFull,               // Math.round(totalActive / cap * 100)
  flaggedAt,
  updatedAt,
  resolvedAt: null,
  resolvedBy: null,
  resolution: null       // 'operator_resolved' or 'cap_dropped_below_threshold'
}
```

---

### Advisor Workspace (Per-User, Scoped)

#### `users/{uid}/data/nicheProfile`
Wizard output: top3 niche matches, zone breakdown scores, ICP block, messaging angle. Cross-device persistent.

#### `users/{uid}/data/nicheAnswers`
In-progress wizard answers (cleared after profile is generated).

#### `users/{uid}/data/icpConfig`
Advisor's Ideal Client Profile: min AUM, target professions, triggers, messaging angle.

#### `users/{uid}/data/advisorProfile`
Routing configuration: nicheIds[], licensedStates[], activeLeadCap, firmName, etc.

#### `advisor_settings/{uid}`
```
{ bookingLink, bookingLinkUpdatedAt }
```
Calendly/booking URL — cross-device sync.

---

### Measurement & Analytics

#### `outreach_outcomes`
One doc per send event. Written by each advisor on "Send Now" click.
```
{
  advisorUid,
  prospectId,
  nicheId,
  channel,           // 'email' | 'call' | 'linkedin' | 'voicemail'
  stage,
  angle,
  variantChosen,     // 'A' | 'B' | 'C'
  editedBeforeSend,
  sent,
  outcome,
  replyType,         // set later via Reply Tapper
  replyClassification,
  timestamp, createdAt
}
```

#### `funnel_events`
One doc per advisor action. Immutable. Written by `funnel_tracker.js`.
```
{
  advisorUid,
  event,             // 'lead_viewed' | 'outreach_drafted' | 'outreach_sent' | 'reply_logged' | 'meeting_booked' | 'lead_status_changed'
  leadId,
  nicheId,
  fromStatus, toStatus,
  ts,
  meta: {}
}
```

---

### Client Intelligence (ED/Al — Phase 1 Pilot)

These collections support the "ED Intake" workflow — an advisor entering a prospect's financial situation to generate an AI planning brief.

#### `ed_consent_log` — Immutable audit trail
Written once at intake start. `allow update, delete: if false` in rules.

#### `ed_situations`
Client financial situation profiles entered by the advisor. Scoped to `referringAdvisorUid` + `assignedAdvisorUid`.

---

### Presence & Security

#### `operator_presence/{uid}`
Each user writes their own presence doc (status, lastSeen, currentPage). Operator reads all.

#### `sentinel_config`, `sentinel_assets`, `sentinel_findings`, etc.
Security Sentinel module — monitors for data anomalies. Client-readable. Admin SDK writes only.

---

## 8. Security Rules

### Principle
- **Advisors:** Can read and update only their own documents
- **Operator:** Can read all advisor data; can write resolution fields to governance_flags
- **Service Accounts (Admin SDK):** Bypass rules entirely — used by Cloud Functions
- **Public:** No unauthenticated access to any collection

### Multi-Tenant Isolation Statement
> **No unauthenticated reads or writes exist anywhere in the system.** All client access is gated by Firebase Auth. All system writes (lead ingest, routing, governance, daily digest) are performed by Cloud Functions using the Firebase Admin SDK — which bypasses client-facing rules and is restricted to specific, deployed functions only.
>
> **No advisor can ever see another advisor's leads, settings, or intake data.** Every Firestore collection scoped to advisors uses `ownerUid`, `advisorUid`, or `referringAdvisorUid` as the isolation key, and rules enforce this at the database layer — not just in the UI. Cross-advisor reads are architecturally impossible for any authenticated non-operator user.

### Key Rules Summary

| Collection | Advisor | Operator | Notes |
|---|---|---|---|
| `lead_assignments` | Read own (`ownerUid == uid`), update `advisorStatus` only | Read all | Create/delete: service account only |
| `al_assignments` | Read own (`advisorUid == uid`) | Read all | **create: false, update: false** — P4 frozen |
| `master_leads` | Read any (limited to what assignment gives access) | Read all | Write: service account only |
| `governance_flags` | None | Read all, update `[resolvedAt, resolvedBy, resolution, resolvedByUid]` only | Create/delete: service account only |
| `outreach_outcomes` | Create own, read own, update `[outcome, replyClassification, replyLoggedAt]` | Read all | Delete: never |
| `funnel_events` | Create own (`advisorUid == uid`), read own | Read all | Update/delete: never — immutable |
| `users/{uid}/**` | Read/write own subtree only | — | Scoped by Firebase UID |
| `operator_presence` | Write own | Read all | — |
| `ed_consent_log` | Create only | Read all | Update/delete: never — immutable |
| `routing_queue` | None | None (client) | Service account only |
| `routing_logs` | None | None (client) | Service account only |

### `al_assignments` Freeze (P4 — 2026-04-13)
As of Sprint 4, the `al_assignments` rule was hardened:
```
allow create: if false;  // no new writes from any browser client
allow update: if false;  // all write-backs now target lead_assignments
allow delete: if false;  // archive preserved forever
```

---

## 9. Cloud Functions

All 5 functions run on **Node.js 22 (2nd Gen)**, deployed in `us-central1`.

### Function 1: `onLeadIngested` (HTTP POST)
**Endpoint:** `https://us-central1-theaumengine.cloudfunctions.net/onLeadIngested`  
**Auth:** API key header (`AUM_INGEST_API_KEY` env var)  
**What it does:**
1. Validates API key
2. Computes SHA-256 idempotency key (name + email + phone) — skips if duplicate in queue
3. Writes `master_leads/{id}` (ownershipStatus: unassigned)
4. Writes `routing_queue/{id}` (status: pending, priority: 50)
5. Logs `lead_ingested` to routing_logs

### Function 2: `alfredIngest` (HTTP POST)
**Endpoint:** `https://us-central1-theaumengine.cloudfunctions.net/alfredIngest`  
**Auth:** `x-alfred-key` header (`AUM_ALFRED_API_KEY` env var)  
**What it does:** Same as `onLeadIngested` but accepts an array of leads in one POST. Priority: 60.

### Function 3: `processRoutingQueue` (Scheduled — every 5 min)
**What it does:** Picks up to 10 pending queue items and runs the full pipeline per item:

1. **Lock** the queue item (prevent parallel processing)
2. **checkOwnership** — query `lead_assignments` for existing active assignment → skip if found
3. **runEligibility** — load `advisor_pool`, apply 3 gates:
   - Gate 1: niche match (`nicheIds` contains lead's `nicheId`)
   - Gate 2: licensed state match (`licensedStates` includes lead's state, or empty = National)
   - Gate 3: cap check — `totalActive < effectiveCap` (hard: strict; soft: +1 grace)
4. **runScoring** — load `routing_policies/default_v1` weights, score each eligible advisor:
   - `nicheMatch (40%) + geo (20%) + aum (20%) + capacity (10%) + fairness (10%)`
5. **finalizeAssignment** — batch write:
   - `lead_assignments` doc (winner's UID, slaDeadline = assignedAt + 30d)
   - `routing_queue` → assigned
   - `master_leads` → ownershipStatus: assigned

### Function 4: `runGovernance` (Scheduled — every 24 hours)
**What it does:** Two-track daily audit:

**Track 1 — SLA Breach Audit:**
- Queries `lead_assignments WHERE ownershipStatus == 'active' AND slaDeadline < now`
- For each breach: writes `governance_flags/{collection}_{docId}` (idempotent — skips if already flagged)
- Flag: `reason: 'sla_breach'`

**Track 2 — Cap Warning Sweep (P2, added 2026-04-13):**
- For each active advisor in `advisor_pool`:
  - Counts active `lead_assignments`
  - `threshold = capWarningPct - 0.05` for soft-cap advisors (default 85%), `capWarningPct` for hard (default 90%)
  - `warnAt = floor(cap × threshold)`
  - If `totalActive >= warnAt`: write/refresh `governance_flags/cap_warning_{uid}` (reason: `approaching_cap`)
  - If `totalActive < warnAt` AND flag exists unresolved: auto-resolve with `resolution: 'cap_dropped_below_threshold'`

**capWarningPct** reads from `routing_policies/default_v1.capWarningPct` (fallback: `0.90`).

### Function 5: `sendDailyDigest` (Scheduled — 7:00 AM CT = 12:00 UTC)
**What it does:**
1. Verifies Gmail SMTP connection (`GMAIL_USER` + `GMAIL_APP_PASSWORD` env vars)
2. Pulls all `funnel_events` from last 24 hours
3. Groups by `advisorUid`
4. For each advisor with activity: resolves email from Firebase Auth, computes stats (sent/replied/booked/status changes), sends HTML digest email via Nodemailer
5. Logs outcome to `routing_logs`

---

## 10. Admin / Operator Dashboard

**Access:** `kosal@fin-tegration.com` only — `isOperator()` check in both `admin.js` and Firestore rules.

### Panels

#### Live Sessions
- Reads `operator_presence` — shows all advisors with online/offline status, current page, last seen
- Auto-refreshes every 30 seconds
- Stats strip: Total Advisors, Online Now, Active Today

#### Pilot Funnel (30-Day KPIs)
- Reads `funnel_events` (last 30 days) + `al_assignments` (used for "assigned" count — **note: this has a stale query against al_assignments — should be lead_assignments**)
- Per-advisor scorecard: Assigned, Sent, Replied, Meetings, Reply Rate
- Global funnel bars: Assigned → Viewed → Drafted → Sent → Replied → Meeting

#### Master Leads Pool
- Reads `master_leads` (up to 500, ordered by `ingestedAt` desc)
- Cross-references `lead_assignments` to build `ownerName` lookup
- Filter by niche + assignment status
- Shows: Lead name, niche badge, location, AUM estimate, fit score, assignment status

#### ⚠️ SLA Alerts (Governance Flags)
Two sections rendered based on active flag type:

**Red section — ⏰ SLA Breaches:** Lead not contacted within SLA window  
**Yellow section — ⚡ At-Cap Warnings:** Advisor at ≥85-90% of their lead cap

Each row has a **✓ Resolve** button that:
1. Disables button + shows "Resolving…"  
2. Writes `{resolvedAt, resolvedBy, resolution: 'operator_resolved', resolvedByUid}` to Firestore  
3. Animates row out (fade + slide)  
4. Refreshes the card from Firestore

**✓✓ Mark All Resolved** appears when ≥2 active flags — uses a Firestore batch write.

#### Outreach Outcomes
- Reads all `outreach_outcomes` (last 200)
- Shows: Total Sends, Reply Rate, Meetings, Channel Split (email/call/linkedin/voicemail), Variant Split (A/B/C)

---

## 11. Governance System

### SLA Policy
- **SLA Deadline:** Written at assignment time as `assignedAt + 30 days`. This is the hard deadline stored on each `lead_assignment` doc.
- **Daily Governance Review:** `runGovernance` checks every lead where `slaDeadline < now`. In practice, reviews begin around day 30 (when deadlines start expiring), not day 7.
- **`slaWindowDays: 7` in `routing_policies`** is a legacy parameter retained in the schema for future use (e.g., a tighter "first-contact" SLA check). It does **not** affect the current breach query. To avoid confusion: the operative check is simply `slaDeadline < now`.
- **Breach:** Flagged when `slaDeadline < now` AND `ownershipStatus == 'active'`

### Cap Warning Policy
- **Default threshold:** 90% for hard-cap advisors, 85% for soft-cap advisors
- **Configurable:** Operator can change `capWarningPct` in `routing_policies/default_v1` — takes effect on next daily `runGovernance` run
- **Auto-resolve:** If advisor drops below threshold, flag is automatically resolved

### Flag Lifecycle
```
runGovernance runs daily
  → flag written (resolvedAt: null)
  → operator sees it in SLA Alerts card
  → operator clicks "✓ Resolve" → resolvedAt written
  → flag disappears from active view
  OR
  → cap drops below threshold on next run → auto-resolved
```

---

## 12. Data Layer (db.js)

`db.js` is the browser-side Firestore abstraction. All advisor interactions with Firestore flow through here.

### Key Functions

| Function | Collection Written | Called By |
|---|---|---|
| `bootstrapUserData(uid)` | reads 5 docs + leads | auth.js on login |
| `loadAssignedLeadsFromFirestore(uid)` | reads `lead_assignments` | bootstrap |
| `updateLeadStatusInFirestore(id, status)` | `lead_assignments` | app.js setProspectStatus |
| `updateAlAssignmentStatus(id, status)` | `lead_assignments` (Sprint 4) | app.js setProspectStatus |
| `updateAlAssignmentReply(id, replyType)` | `lead_assignments` (Sprint 4) | outreach_controller.js |
| `updateLeadFeedbackInFirestore(id, vote)` | `lead_assignments` | pages.js thumbs up/down |
| `saveOutcomeToFirestore(uid, outcome)` | `outreach_outcomes` | outreach_controller.js |
| `saveBookingLink(uid, url)` | `advisor_settings` | pages.js settings |
| `syncNicheToAdvisorPool(uid, niches)` | `advisor_pool` | app.js applyProfileToSettings |
| `saveNicheProfileToFirestore(uid, profile)` | `users/{uid}/data/nicheProfile` | app.js wizard |

### Sprint 4 Compatibility Layer
`updateAlAssignmentStatus` and `updateAlAssignmentReply` keep their legacy names for backward compatibility with `app.js` and `outreach_controller.js` call sites. Both now write to `lead_assignments` (not `al_assignments`). The `_fromAlAssignment: true` flag on returned PROSPECTS objects routes write-backs through these functions rather than `updateLeadStatusInFirestore`, preserving the dual-path without code surgery.

---

## 13. Pilot Advisor Cohort

5 advisors provisioned. All National (no state restrictions). All `eligibleForRouting: true`.

| Name | Email | Cap | Policy | Leads | Niches |
|---|---|---|---|---|---|
| Patrick Wight | patrick@patrick.com | 25 | hard | 7 | business-owners, physicians, yacht-owners |
| Matt Germshied | matt@matt.com | 35 | **soft** | 30 | business-owners, aircraft-owners, yacht-owners |
| Chuck Cooper | chuck@chuck.com | 30 | hard | 5 | ai-displaced-executives, business-owners, real-estate-developers, real-estate-investors |
| Ray Uncle | ray@ray.com | 30 | **soft** | 20 | physicians, charity-board-members, yacht-owners |
| Andy Belly | andy@andy.com | 20 | hard | 14 | aircraft-owners, business-owners, yacht-owners, real-estate-developers, real-estate-investors |

**Matt** at 30/35 (86%) will trigger an `approaching_cap` governance flag on the next `runGovernance` run (within 24 hours).

---

## 14. Current Data State

| Collection | Count | Status |
|---|---|---|
| `lead_assignments` | **77** | ✅ Canonical — all new assignments |
| `al_assignments` | 30 | 🔒 Frozen archive — all migrated |
| `master_leads` | 46 | ✅ Source of truth for lead data |
| `masterLeads` | 0 | ✅ Legacy — empty/archived |
| `routing_queue` | 45 | ✅ All `status: assigned` |
| `advisor_pool` | 5 | ✅ All eligible, all National |
| `pilot_advisors` | 5 | ✅ Chuck, Patrick, Andy, Ray, Matt |
| `governance_flags` | 0 active | ✅ No active SLA breaches |
| `routing_policies` | 1 | ✅ `default_v1` live |
| `outreach_outcomes` | 0 | 🟡 No sends logged yet |
| `funnel_events` | 0 | 🟡 No advisor activity logged yet |

**All 76 leads are `advisorStatus: New`** — no outreach has been logged by any advisor yet.

---

## 15. Known Issues & Open Decisions

### Active Issues

| # | Issue | Severity | Notes |
|---|---|---|---|
| 1 | `Pilot Funnel` card queries `al_assignments` for assigned count | 🟡 Medium | Line 340 of admin.js — should be `lead_assignments`. Causes "Assigned" column to show 0 for all advisors in funnel chart |
| 2 | 5 leads in `routing_queue` failed with `eligibility_empty` | 🟡 Medium | Last routing run Apr 12. Likely niche mismatch. `node scripts/requeue_failed.js` can reset them |
| 3 | `capWarningPct` not yet written to `routing_policies/default_v1` | 🟢 Low | Function falls back to 0.90. Should be made explicit in Firestore |
| 4 | TOTAL row audit discrepancy (shows 76, actual 77) | 🟢 Low | Display math bug in `audit_leads.js` only |

### Open Decisions

| Code | Decision | Status |
|---|---|---|
| A | `al_assignments` deletion | 🟡 Deferred — keep as audit archive |
| B | Double-count guard for CF-routed leads in `loadAlAssignmentsForAdvisor` | ✅ Resolved |
| C | Firestore index for `lead_assignments WHERE ownerUid + orderBy assignedAt` | ✅ Added (P3, 2026-04-13) |

---

## 16. Deployed Features in Controlled Pilot — Not Yet Exercised

All features below are fully deployed to production. They are **intentionally unexercised** during the initial pilot — each has a defined acceptance criterion before it is considered live.

| Feature | State | Acceptance Criterion |
|---|---|---|
| **New lead ingest via Alfred** | Deployed — controlled pilot | Considered live after Alfred POSTs ≥1 batch successfully and leads appear in advisor scoreboards within 10 min |
| **Reply Tapper → Firestore write-back** | Deployed — awaiting first advisor send | Considered live after 3 advisors each log ≥1 reply outcome and `replyType` is confirmed written to `lead_assignments` |
| **Daily Digest email** | Scheduled — exits early (no funnel data yet) | Considered live after 3 consecutive days sending correct counts for ≥2 advisors with no bounces or auth errors |
| **Governance SLA flags** | Deployed — no deadlines expired yet | Will fire automatically ~30 days from first assignment; confirmed working when first flag appears in Admin SLA Alerts card |
| **Governance cap-warning flags** | Deployed — first run expected tonight | Confirmed working when Matt Germshied (30/35 = 86%) triggers an `approaching_cap` flag in the next `runGovernance` run |
| **Security Sentinel** | UI built — gated by `SENTINEL_ENABLED` flag | Considered active after operator enables flag and reviews first Sentinel report with at least one finding |
| **Meeting Prep AI brief** | UI built — static templates only | Considered live after connection to a live AI API (Gemini/GPT) is wired and validated on ≥3 lead profiles |
| **ED Intake (Client Intelligence)** | Phase 1 built — consent + situation entry | Phase 2 (AI brief generation) pending Vera compliance sign-off on ED data handling |

---

## 17. Vera Questions / Review Flags

These are the areas flagged for Vera's review. None block the current closed pilot, but each should be addressed before broader rollout or external advisor onboarding.

### Security Posture — Confirmed ✅
1. **No public writes anywhere** — all writes are auth-gated or Admin SDK only
2. **`al_assignments` fully frozen at the rules layer** — `create: if false, update: if false`
3. **`governance_flags` write is operator-only, field-scoped** — only `[resolvedAt, resolvedBy, resolution, resolvedByUid]`
4. **`ed_consent_log` is immutable** — `update, delete: if false` enforced at rules layer
5. **`funnel_events` are immutable** — `update, delete: if false` enforced at rules layer
6. **Multi-tenant isolation is enforced at the database layer** — see §8 for full statement

### Known, Managed Risks

These are identified, documented risks — not surprises. Each has a mitigation path:

- **No data retention policy yet** — `outreach_outcomes`, `funnel_events`, and `routing_logs` currently grow indefinitely. *Mitigation path: implement a TTL-based archiving policy (proposed: 24–36 months) before advisor base exceeds 25.*
- **ED Intake captures prospect financial situation data** — entered by advisors on behalf of prospects. This is the only data type that may require explicit FINRA or state privacy review before scaling beyond the pilot cohort. Consent is logged immutably in `ed_consent_log`. *Mitigation path: Vera sign-off on ED data handling before Phase 2 (AI brief generation) is activated.*
- **Governance and daily digest emails are deployed but not yet battle-tested** — no SLA deadlines have expired and no advisor has sent outreach yet. Both systems will be validated naturally within the first 30 days of active pilot use. *Mitigation path: monitor first 5 governance runs and first 5 digest sends for correctness before treating as reliable.*
- **5 leads failed routing with `eligibility_empty`** on Apr 12 — niche mismatch suspected. *Mitigation path: diagnose niche, either patch leads or expand advisor coverage before next ingest batch.*

### Data Integrity — Items to Fix Before Metrics Review
1. **`Pilot Funnel` card** queries `al_assignments` for "Assigned" count → shows 0 for all advisors. Fix: reroute query to `lead_assignments`. Blocked only for metrics review, not for advisor workflow.
2. **SLA terminology** has been clarified in §11 — the operative rule is `slaDeadline < now` (30-day deadline). `slaWindowDays: 7` is a retained schema parameter, not the active check.

### Questions for Vera

We are asking for focused answers on the following three points:

> **Q1 — Data Retention:** Is indefinite retention of `funnel_events` and `outreach_outcomes` acceptable for the pilot period, or should we implement a 24–36 month retention/archiving window before any advisor data is written in volume?

> **Q2 — ED Intake Consent:** The current `ed_consent_log` captures intake timestamp, disclosure version, and advisor UID. Does the ED Intake flow require additional disclosures, a separate privacy notice, or prospect-facing consent (rather than advisor-side consent) before it can be used with real prospects?

> **Q3 — Routing Log Anonymization:** `routing_logs` and `outreach_outcomes` contain `advisorUid` and `prospectId`. Are we required to anonymize or pseudonymize these identifiers for long-term storage, or is the current advisor-scoped access control sufficient?

---

## Appendix: File Map

| File | Purpose |
|---|---|
| `index.html` | Entry point — loads all scripts, Firebase SDK, routing |
| `js/app.js` | SPA router, state management, niche wizard, status updates, snooze system |
| `js/db.js` | All Firestore read/write functions — Sprint 4 unified |
| `js/pages.js` | Page render functions for all advisor views |
| `js/admin.js` | Operator dashboard — presence, funnel KPIs, master leads, governance flags |
| `js/auth.js` | Firebase Auth — login, logout, presence init, bootstrap |
| `js/outreach_controller.js` | Outreach Studio — variant generation, send logging, Reply Tapper |
| `js/funnel_tracker.js` | Fires funnel_events to Firestore on advisor actions |
| `js/niche_engine.js` | Niche quiz scoring, profile generation, ICP builder |
| `js/sentinel.js` | Security Sentinel dashboard |
| `js/data.js` | Hardcoded demo PROSPECTS data (shown alongside Firestore leads) |
| `functions/index.js` | All 5 Cloud Functions |
| `firestore.rules` | All Firestore security rules |
| `firestore.indexes.json` | 19 composite indexes |
| `scripts/audit_leads.js` | Run-first health audit — 10 checks |
| `scripts/migrate_al_to_lead_assignments.js` | Sprint 4 migration (idempotent, done) |

---

*Document generated 2026-04-13 by Antigravity. Accurate as of Sprint 4 / C12 session end.*
