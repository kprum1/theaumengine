# THE AUM ENGINE — MASTER HANDOFF DOCUMENT
**Phase B2 Complete · April 7, 2026**
**GitHub:** https://github.com/kprum1/theaumengine
**Production:** https://www.theaumengine.com
**Firebase Project:** `theaumengine`

---

## TABLE OF CONTENTS

1. [Platform Overview](#1-platform-overview)
2. [Architecture Map](#2-architecture-map)
3. [File Structure Reference](#3-file-structure-reference)
4. [Firestore Data Model](#4-firestore-data-model)
5. [Agent Inventory](#5-agent-inventory)
6. [Pilot Advisor Roster](#6-pilot-advisor-roster)
7. [Lead Pipeline — End to End](#7-lead-pipeline--end-to-end)
8. [Niche Mapping Engine](#8-niche-mapping-engine)
9. [Outreach Agent Stack v1](#9-outreach-agent-stack-v1)
10. [Firestore Security Rules](#10-firestore-security-rules)
11. [Cloud Functions](#11-cloud-functions)
12. [Deployment Procedure](#12-deployment-procedure)
13. [Known Issues & Next Steps](#13-known-issues--next-steps)
14. [Credentials & Environment](#14-credentials--environment)

---

## 1. PLATFORM OVERVIEW

The AUM Engine is a multi-tenant SaaS platform for independent financial advisors that:

1. **Mines** high-fit prospects from enrichment signals (aircraft registrations, business registrations, estate filings, LinkedIn)
2. **Routes** qualified leads to registered advisors based on niche alignment, geography, and AUM band
3. **Generates** tailored outreach drafts using a 4-agent AI stack
4. **Manages** the full pipeline from first touch → booked meeting
5. **Scores** advisors' niche fit via an 85-question adaptive wizard

The platform is a **vanilla HTML/CSS/JS SPA** hosted on Firebase Hosting, with Firestore as the database and Firebase Functions as the serverless backend.

---

## 2. ARCHITECTURE MAP

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BROWSER CLIENT (SPA)                             │
│  index.html  ←→  js/auth.js  ←→  js/app.js  ←→  js/pages.js       │
│                       │              │                              │
│              js/db.js (Firestore)    ↓                             │
│              js/niche_engine.js   js/outreach_agent.js             │
│                                   js/outreach_controller.js        │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Firebase SDK (client)
┌────────────────────────▼────────────────────────────────────────────┐
│                    FIREBASE CLOUD                                   │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  Firebase Auth   │  │  Firestore Database                     │ │
│  │  (email/Google)  │  │  Collections → see §4                   │ │
│  └──────────────────┘  └──────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Cloud Functions (us-central1)                               │  │
│  │  onLeadIngested · alfredIngest · processRoutingQueue         │  │
│  │  runGovernance                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Admin SDK (scripts)
┌────────────────────────▼────────────────────────────────────────────┐
│                    LOCAL SCRIPTS (Node.js / Admin SDK)             │
│  provision_pilot_advisors.js  · lead_ingest_agent.js              │
│  trigger_routing.js           · identity_resolution_agent.js      │
│  schema_init.js               · check_queue.js                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. FILE STRUCTURE REFERENCE

```
AdvDiamondMining/
├── index.html                   → SPA shell, Firebase config, script loader
├── css/
│   └── main.css                 → Full design system (tokens, components, dark mode)
├── js/
│   ├── app.js                   → State, routing, ICP, feedback, advisor profile
│   ├── auth.js                  → Firebase Auth (email/password + Google SSO)
│   ├── data.js                  → PROSPECTS array, NICHES, ALERTS, demo data
│   ├── db.js                    → Firestore read/write (profiles, leads, ICP, niche)
│   ├── niche_engine.js          → 85Q adaptive wizard, scoring, profile generator
│   ├── outreach_agent.js        → Angle selection, 3-variant draft generation, compliance filter
│   ├── outreach_controller.js   → Orchestrator: ResearchAgent, StrategyAgent, CadenceAgent
│   └── pages.js                 → Page renderers (Command Center → Meeting Prep)
├── functions/
│   └── index.js                 → Cloud Functions: ingest, routing, governance
├── scripts/
│   ├── provision_pilot_advisors.js   → Creates Firebase Auth + Firestore docs for pilot advisors
│   ├── lead_ingest_agent.js          → CLI bulk lead ingest from JSON files
│   ├── identity_resolution_agent.js  → Deduplication by email + name hash
│   ├── trigger_routing.js            → Manual routing pass on routing_queue
│   ├── schema_init.js                → Initializes Firestore schema
│   ├── check_queue.js                → Diagnostic: shows routing_queue status distribution
│   ├── serviceAccountKey.json        → 🔴 NOT COMMITTED — required for Admin SDK
│   └── data/
│       └── sample_leads.json         → 15 pilot leads (Aircraft, Physicians, Business Owners, etc.)
├── firestore.rules                   → Per-user data security rules
├── firestore.indexes.json            → Composite query indexes
├── firebase.json                     → Hosting + functions config
├── .firebaserc                       → Project alias: theaumengine
└── .gitignore                        → Excludes node_modules, serviceAccountKey.json
```

---

## 4. FIRESTORE DATA MODEL

### Top-Level Collections

```
firestore/
├── users/                          → Per-advisor data (secured by UID)
│   └── {uid}/
│       └── data/
│           ├── advisorProfile      → Firm info, geography, capabilities, nicheIds
│           ├── icpConfig           → ICP settings (niche, assets, geography, messaging)
│           └── nicheProfile        → Wizard output (top3, miningConfig, icpBlock, completedAt)
│
├── master_leads/                   → Canonical lead records (de-duplicated)
│   └── {leadId}/
│       ├── firstName, lastName, email, phone
│       ├── title, company, city, state
│       ├── nicheId, niche
│       ├── estimatedAUM, fitScore, timingScore
│       ├── reasonCodes[], signals{}
│       ├── idempotencyKey          → MD5(email + firstName + lastName)
│       └── source, createdAt, updatedAt
│
├── routing_queue/                  → Leads waiting to be assigned
│   └── {queueId}/
│       ├── masterLeadId            → Ref to master_leads
│       ├── status                  → 'pending' | 'queued' | 'assigned' | 'failed'
│       ├── idempotencyKey
│       ├── score, timingScore
│       └── createdAt, updatedAt
│
├── lead_assignments/               → Assigned leads per advisor
│   └── {assignmentId}/
│       ├── masterLeadId            → Ref to master_leads
│       ├── ownerUid                → Advisor's Firebase UID
│       ├── ownerFirmName
│       ├── ownershipStatus         → 'active' | 'released' | 'reassigned'
│       ├── advisorStatus           → 'New' | 'Contacted' | 'Engaged' | 'Booked' | 'Dead'
│       ├── assignedAt, slaDeadline
│       ├── finalScore, timingScore
│       └── createdAt, updatedAt
│
├── advisor_pool/                   → Routing engine registry (one doc per advisor)
│   └── {uid}/
│       ├── firmName, advisorName, email
│       ├── nicheIds[]              → Drives lead matching (updated by niche wizard)
│       ├── geography{}             → { states[], cities[], radius }
│       ├── aumBands[]              → ['1M-3M', '3M-10M']
│       ├── eligibleForRouting      → boolean (must be true)
│       ├── currentLeadCount        → Auto-incremented on assignment
│       ├── activeLeadCap           → Max concurrent leads (default 25)
│       ├── routingScore            → Tie-breaker (default 100)
│       ├── nicheSource             → 'provisioned' | 'wizard'
│       └── updatedAt
│
├── pilot_advisors/                 → Quick-reference registry for pilot firms
│   └── {uid}/
│       ├── name, email, firmName
│       ├── provisionedAt, initialPassword
│       └── status
│
└── aum_engine_logs/                → Event log from Cloud Functions
    └── {logId}/
        ├── event, payload
        └── timestamp
```

### Nested User Data Pattern

```javascript
// Read
db.collection('users').doc(uid).collection('data').doc('advisorProfile').get()

// Write
db.collection('users').doc(uid).collection('data').doc('advisorProfile').set(data, {merge: true})
```

---

## 5. AGENT INVENTORY

### Backend Agents (Cloud Functions)

| Agent | Function Name | Trigger | Purpose |
|---|---|---|---|
| **Lead Receiver** | `onLeadIngested` | HTTP POST | Validates, deduplicates, writes to master_leads + routing_queue |
| **Alfred Miner** | `alfredIngest` | Schedule (every 5 min) | Pulls raw leads from enrichment sources |
| **Routing Engine** | `processRoutingQueue` | Schedule (every 5 min) | Runs eligibility → scoring → assignment pipeline |
| **Governance** | `runGovernance` | Schedule (daily) | SLA enforcement, stale lead escalation |

### Backend Scripts (Admin SDK / CLI)

| Script | Usage | Purpose |
|---|---|---|
| `provision_pilot_advisors.js` | `node scripts/provision_pilot_advisors.js` | Creates Firebase Auth + Firestore for 5 pilot advisors |
| `lead_ingest_agent.js` | `node scripts/lead_ingest_agent.js --file data/sample_leads.json` | Bulk lead ingest with deduplication |
| `identity_resolution_agent.js` | Auto-called by ingest | MD5 fingerprint dedup on email + name |
| `trigger_routing.js` | `node scripts/trigger_routing.js` | Manual routing pass (no waiting for scheduler) |
| `check_queue.js` | `node scripts/check_queue.js` | Diagnostic: shows queue status distribution |

### Frontend Agents (Browser / Client-side)

| Agent | File | Purpose |
|---|---|---|
| **Niche Mapping Engine** | `js/niche_engine.js` | 85Q adaptive wizard → scores 12 niches → generates ICP profile |
| **Research Agent** | `js/outreach_controller.js` | Enriches prospect context (planning pain, warmth, wealth complexity) |
| **Strategy Agent** | `js/outreach_controller.js` | Selects angle, CTA, recommended channel per prospect + advisor profile |
| **Customization Agent** | `js/outreach_agent.js` | Generates 3 draft variants (Direct / Soft / Insight-Led) per channel |
| **Cadence Agent** | `js/outreach_controller.js` | Produces persona-specific 5-touch sequence |
| **Outreach Controller** | `js/outreach_controller.js` | Orchestrator — routes through all 4 agents, renders results |
| **Firestore Data Layer** | `js/db.js` | All Firestore reads/writes for the client |

---

## 6. PILOT ADVISOR ROSTER

All 5 provisioned and live. Login at https://www.theaumengine.com.

| # | Name | Email | Password | UID | Firm | Niches Provisioned |
|---|---|---|---|---|---|---|
| 1 | Patrick Wight | patrick@patrick.com | `AUM2026!` | `Iqo8zz5gTFh967ZokqHCpUp4S2t2` | Wight Financial | business-owners, physicians |
| 2 | Matt Germshied | matt@matt.com | `AUM2026!` | `yzTL1YHadINFrMwxCMrrh0fbhZp2` | Germshied Wealth Management | business-owners, aircraft-owners |
| 3 | Chuck Cooper | chuck@chuck.com | `AUM2026!` | `BQhiSqKW2JM3ycrPQYzeXa640Ku1` | Cooper Capital Group | ai-displaced-executives, business-owners |
| 4 | Ray | ray@ray.com | `AUM2026!` | `Zd4H7gaNZJdrgXbIWNnM5cSpqdB2` | Ray Financial Advisors | physicians, charity-board-members |
| 5 | Andy Belly | andy@andy.com | `AUM2026!` | `NzC6fh3sXKVuDmgfPAaaEea3Ovm2` | Duelly Outdoors / Belly Wealth | aircraft-owners, business-owners |

> 🔒 **Security note:** Initial passwords were set via Admin SDK. Advisors should be prompted to change on first login. Password reset via Firebase Email Reset is available.

### Lead Assignments (current)

| Advisor | Leads Assigned | Lead Names |
|---|---|---|
| Patrick Wight | 3 | Dr. Karen Albright, Justine Carmichael, Priscilla Dolan |
| Matt Germshied | 3 | Thomas Reinhardt, Leonard Fitch, Harold Svensson |
| Chuck Cooper | 3 | Monica Weiss, Derek Huang, Grace Nakamura |
| Ray | 2 | Dr. Samuel Obi, Adriana Martinez |
| Andy Belly | 3 | Sandra Okafor, Rebecca Stanton, Michael Thornton |

---

## 7. LEAD PIPELINE — END TO END

### Full Journey

```
1. INGEST
   node scripts/lead_ingest_agent.js --file data/sample_leads.json
   OR POST to onLeadIngested endpoint
   
   → Writes to: master_leads/{id} (canonical)
   → Status: routing_queue status = 'pending'
   
2. IDENTITY RESOLUTION
   identity_resolution_agent.js runs automatically on ingest
   → Checks MD5(email + firstName.toLowerCase() + lastName.toLowerCase())
   → Prevents duplicate master_leads
   → Re-queues existing leads rather than duping
   
3. ELIGIBILITY (Cloud Function: processRoutingQueue)
   runEligibility() checks:
   - estimatedAUM meets advisor's aumBands
   - No existing active ownership (checkOwnership)
   - nicheId matches advisor's nicheIds
   
4. SCORING
   runScoring() returns ordered list of advisors:
   - nicheMatch weight: 0.40
   - geoMatch weight:   0.30
   - aumBand weight:    0.20
   - loadBalance:       0.10
   
5. ASSIGNMENT
   finalizeAssignment():
   - Creates lead_assignments/{id} with ownerUid = winning advisor
   - Sets ownershipStatus = 'active'
   - Increments advisor_pool currentLeadCount
   - Updates routing_queue status = 'assigned'
   
6. CLIENT READ (db.js: loadAssignedLeadsFromFirestore)
   On advisor login → bootstrapUserData() →
   - Queries lead_assignments where ownerUid == currentUID
   - Hydrates from master_leads for full prospect data
   - Merges into PROSPECTS array (tagged _fromFirestore: true)
   - Assigned leads appear at TOP of Lead Scoreboard

7. STATUS WRITE-BACK
   When advisor updates status/feedback in cockpit:
   updateLeadStatusInFirestore() → lead_assignments/{id}
   updateLeadFeedbackInFirestore() → lead_assignments/{id}
```

### Manual Routing (no Cloud Function wait)

```bash
cd scripts
# Ingest leads
node lead_ingest_agent.js --file data/sample_leads.json

# Immediate routing pass
node trigger_routing.js
```

---

## 8. NICHE MAPPING ENGINE

### Overview

85-question adaptive assessment across 3 layers → scores 12 niches → generates ICP profile.

| Layer | Questions | Purpose |
|---|---|---|
| **Macro** | 8 always-shown | Directional signal — specialization readiness, access, market depth |
| **Meso** | 9 cluster-filtered | Refines top 4 clusters from macro results |
| **Micro** | 5–8 niche-specific | Deep dive into top 3 niches |

**12 Niches Scored:**

| ID | Niche | Key Signal |
|---|---|---|
| n1 | Aircraft Owners | Aviation background, lifestyle wealth |
| n2 | Physicians | Practice complexity, income tax gap |
| n3 | Business Owners | Exit/succession readiness |
| n4 | Law Partners | K-1 complexity, partner buyout |
| n5 | HENRYs | RSU complexity, accumulation phase |
| n6 | C-Suite Executives | Deferred comp, concentrated stock |
| n7 | AI-Displaced Executives | Severance, equity windows, cashflow reset |
| n8 | Dentists & Specialists | Practice buy-in, revenue concentration |
| n9 | High Earning Tradesman | Irregular income, business protection |
| n10 | Inheritance Recipients | Sudden wealth, estate settlement |
| n11 | Real Estate Developers | 1031, DST, deal-level tax planning |
| n12 | Charity Boards | DAF, legacy planning, philanthropy |

### Profile Output

```javascript
{
  top3: [{ id, name, score, icon, color, zoneBreakdown: {fit, focus, market, access, service} }],
  allRanked: [...],
  icpBlock: { primaryNiche, minAssets, professions, lifeEventTriggers, messagingAngle },
  miningConfig: { primaryNicheId, secondaryNicheId, recommendedNicheIds[] },
  completedAt: ISO string
}
```

### Loop Closure (new in Phase B2)

When advisor clicks **Apply to ICP & Settings**:
1. `applyProfileToSettings()` in `app.js` maps top3 niche names → nicheIds
2. Calls `saveAdvisorProfileToFirestore()` → updates `users/{uid}/data/advisorProfile`
3. Calls `syncNicheToAdvisorPool()` in `db.js` → merges nicheIds into `advisor_pool/{uid}`
4. Next routing pass uses the wizard-discovered niches, not provisioning defaults

---

## 9. OUTREACH AGENT STACK v1

### Architecture

```
User: Outreach Studio → selects prospect, channel, stage
  → auto-runs OutreachController.run() after 300ms delay

OutreachController (js/outreach_controller.js)
│
├── Agent 1: ResearchAgent.gather(prospect)
│   Inputs: prospect record, enrichment store, advisor notes, ICP config, niche profile
│   Outputs: enrichedContext = {
│     planningPain[]    → inferred from nicheId + reason codes + signals
│     wealthComplexity  → 'high' | 'medium' | 'developing' (based on estimatedAUM)
│     warmth            → 'warm' | 'cold' (from relationship signal)
│     triggerType       → 'retirement' | 'layoff' | 'exit_liquidity' | etc.
│     advisorProfile    → merged from _advisorProfile, ICP config, niche profile
│   }
│
├── Agent 2: StrategyAgent.select(enrichedCtx, channel, stage)
│   Logic: personaType (from nicheId) → ANGLE_MATRIX[personaType][triggerType]
│   Outputs: strategy = {
│     angle        → one of 12 named angles (executive_transition, exit_liquidity, etc.)
│     angleLabel   → human-readable angle name
│     reason       → why this angle for UI meta bar
│     cta          → CTA type ('brief_intro_call' | 'send_short_guide' | etc.)
│     channelRec   → recommended channel based on title seniority + stage
│     tone         → suggested starting variant A/B/C
│   }
│
├── Agent 3: Customization (_generateWithContext via outreach_agent.js)
│   Templates: channel-specific (email, linkedin, call, voicemail)
│             × angle-specific (executive_transition, exit_liquidity, practice_complexity, etc.)
│   Outputs: draftResult = {
│     variants: [
│       { id:'A', label:'Direct',      subject, body },
│       { id:'B', label:'Soft',        subject, body },
│       { id:'C', label:'Insight-Led', subject, body }
│     ],
│     riskFlags[]   → compliance warnings (banned phrases, wealth claims, etc.)
│     angleLabel, reason, ctaLabel, warmth, channelRec
│   }
│
└── Agent 4: CadenceAgent.sequence(enrichedCtx, strategy)
    Templates: persona-specific 5-touch sequences
    Outputs: cadence[] = [
      { touch, day, channel, theme, cta, done, active }
    ]
```

### Channel Rules (enforced by template system)

| Channel | Target Length | Key Rule |
|---|---|---|
| Email | 80–160 words | 1 signal + 1 CTA, optional subject |
| LinkedIn Note | 250–400 chars | Brief, conversational, no heavy pitch |
| Call Opener | 1–2 sentences | Acknowledge context, ask for 20 seconds |
| Voicemail | 20–35 sec equivalent | Name + reason + callback, no jargon |

### Safety Filter

`validateDraftOutput()` checks for:
- Mentions of estimated net worth or asset values
- "I know you were laid off / fired"
- Surveillance / scraping language
- Custom banned phrases from `advisorProfile.bannedPhrases[]`

### Outcome Logging

Every "Send Now" click logs to `localStorage['aumOutreachLog']`:
```javascript
{ prospectId, channel, stage, angle, variantChosen, editedBeforeSend, sent, timestamp }
```
Phase 2: persist to Firestore for feedback-driven angle optimization.

---

## 10. FIRESTORE SECURITY RULES

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write their own sub-collections
    match /users/{uid}/data/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }

    // Advisors can read their own lead assignments
    match /lead_assignments/{docId} {
      allow read: if request.auth != null
                  && resource.data.ownerUid == request.auth.uid;
      allow update: if request.auth != null
                  && resource.data.ownerUid == request.auth.uid
                  && request.resource.data.keys().hasOnly(['advisorStatus','lastNote','updatedAt','feedback']);
    }

    // Advisors can read master leads for hydration
    match /master_leads/{leadId} {
      allow read: if request.auth != null;
    }

    // All admin operations via service account only
  }
}
```

---

## 11. CLOUD FUNCTIONS

**Location:** `functions/index.js`
**Region:** `us-central1`
**Runtime:** Node.js 18

### `onLeadIngested` (HTTP)

```
POST https://us-central1-theaumengine.cloudfunctions.net/onLeadIngested
Content-Type: application/json

Body: Array of lead objects matching master_leads schema
```

**Pipeline:** Validate → Deduplicate (idempotencyKey MD5) → Write master_leads → Write routing_queue (status: queued)

### `alfredIngest` (Schedule: every 5 min)

Calls enrichment sources → normalizes leads → writes to master_leads + routing_queue.
Currently configured to mine: Aircraft registrations (FAA), LinkedIn scouting, business registrations.

### `processRoutingQueue` (Schedule: every 5 min)

For each `routing_queue` doc with `status = 'queued'`:
1. `checkOwnership()` — skips if already owned
2. `runEligibility()` — filters advisor_pool by niche + geography + AUM + capacity
3. `runScoring()` — ranks eligible advisors
4. `finalizeAssignment()` — creates lead_assignment + increments load count

**Scoring weights:**
```javascript
const WEIGHTS = { nicheMatch: 0.40, geoMatch: 0.30, aumBand: 0.20, loadBalance: 0.10 };
```

### `runGovernance` (Schedule: daily)

- Flags assignments past SLA deadline (7 days default)
- Escalates stale leads for manual review
- Logs to `aum_engine_logs`

---

## 12. DEPLOYMENT PROCEDURE

### Firebase Hosting (production site)

```bash
# From project root
firebase deploy --only hosting --project theaumengine
```

Always bump the cache-buster in `index.html` before deploying:
```html
<script src="js/app.js?v=20260407e"></script>
```
Pattern: `YYYYMMDD` + letter suffix (a, b, c, d, e…)

### Cloud Functions

```bash
cd functions
firebase deploy --only functions --project theaumengine
```

### Firestore Rules

```bash
firebase deploy --only firestore:rules --project theaumengine
```

### Full Deploy

```bash
firebase deploy --project theaumengine
```

### GitHub Push

```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
git add -A
git commit -m "feat: [description]"
git push origin main
```

Remote: https://github.com/kprum1/theaumengine

---

## 13. KNOWN ISSUES & NEXT STEPS

### Known Issues

| Issue | Status | Notes |
|---|---|---|
| Stale browser tabs show "Signing in…" | ✅ Mitigated | Cache-busting `?v=20260407e` forces refresh; tell users to hard-refresh |
| James Hargrove (real-estate-investors) not assigned | ⚠️ By design | No pilot advisor has `real-estate-investors` niche — add 6th pilot or update existing advisor |
| Outreach outcome log in localStorage only | 🔵 Phase 2 | Move to Firestore for cross-device feedback analytics |
| Google SSO on mobile sometimes shows blank | 🔵 Investigating | Likely Firebase popup blocked on some mobile browsers — use redirect fallback |
| `alfredIngest` Cloud Function not fetching live sources yet | 🔵 Phase 3 | Currently stubbed — needs FAA API, LinkedIn scraper, or data vendor integration |

### Priority Next Steps

**P0 — Immediate (before pilot week)**
- [ ] Send pilot credentials to all 5 firms with login URL + first-touch instructions
- [ ] Verify each pilot can log in and see their assigned leads in Lead Scoreboard
- [ ] Confirm "Apply to ICP" niche wizard flow works for each pilot login

**P1 — This Week**
- [ ] Move outreach outcome logs from localStorage → Firestore `outreach_outcomes` collection
- [ ] Add 6th pilot advisor with `real-estate-developers` niche
- [ ] Build pilot dashboard for operator view (all 5 firms, lead counts, activity)
- [ ] Add Firestore `advisor_notes` collection for cross-device note persistence

**P2 — Next Sprint**
- [ ] Wire alfredIngest to real enrichment data source (FAA, business registrations)
- [ ] Implement feedback-based angle weighting in StrategyAgent
- [ ] Add email notification when new lead is assigned (Firebase Email Extension or SendGrid)
- [ ] Build admin panel for operator to manually re-route or reassign leads

**P3 — Phase C**
- [ ] Add compliance mode to Outreach Studio (strict / moderate / custom)
- [ ] Integrate HubSpot or CRM sync for send tracking
- [ ] Implement learning loop: thumbs-up/down → biases future angle selection
- [ ] Add firm-level analytics: reply rates by angle, channel, niche

---

## 14. CREDENTIALS & ENVIRONMENT

### Firebase Project

| Item | Value |
|---|---|
| Project ID | `theaumengine` |
| Hosting URL | https://theaumengine.web.app |
| Production URL | https://www.theaumengine.com |
| Firestore region | `us-central1` |
| Functions region | `us-central1` |

### Service Account Key

**Location:** `scripts/serviceAccountKey.json` ← NOT committed to git
**Usage:** Required by all `scripts/` Node.js tools
**Source:** Firebase Console → Project Settings → Service Accounts → Generate Key

> ⚠️ This file must NEVER be committed to git. It is in `.gitignore`. If compromised, revoke immediately in Firebase Console.

### GitHub Repository

| Item | Value |
|---|---|
| Repo | https://github.com/kprum1/theaumengine |
| Branch | `main` |
| Auth | `gh` CLI or HTTPS |

### Pilot Advisor Passwords

All pilots set to `AUM2026!` — advisors should change on first login.
Firebase Password Reset: available via "Forgot Password" on login modal.

---

## APPENDIX A: QUICK COMMAND REFERENCE

```bash
# === PROVISIONING ===
node scripts/provision_pilot_advisors.js              # Create 5 pilot accounts

# === LEAD PIPELINE ===
node scripts/lead_ingest_agent.js --file data/sample_leads.json   # Ingest leads
node scripts/trigger_routing.js                                    # Route immediately
node scripts/check_queue.js                                        # Diagnose queue

# === DEPLOY ===
firebase deploy --only hosting --project theaumengine   # Deploy site
firebase deploy --only functions --project theaumengine # Deploy functions
firebase deploy --project theaumengine                  # Deploy everything

# === GIT ===
git add -A && git commit -m "feat: ..." && git push origin main

# === DIAGNOSTICS ===
node scripts/check_queue.js                # Queue status breakdown
firebase functions:log --project theaumengine  # Cloud Function logs
```

---

## APPENDIX B: NICHE ID REFERENCE

| Niche Name | nicheId (routing engine) |
|---|---|
| Aircraft Owners | `aircraft-owners` |
| Physicians | `physicians` |
| Business Owners | `business-owners` |
| Law Partners | `law-partners` |
| HENRYs | `henrys` |
| C-Suite Executives | `c-suite-executives` |
| AI-Displaced Executives | `ai-displaced-executives` |
| Dentists & Specialists | `dentists-specialists` |
| High Earning Tradesman | `high-earning-tradesman` |
| Inheritance Recipients | `inheritance-recipients` |
| Real Estate Developers | `real-estate-developers` |
| Charity Boards | `charity-board-members` |

---

## APPENDIX C: OUTREACH ANGLE REFERENCE

| Angle Key | Label | Best For |
|---|---|---|
| `executive_transition` | Executive Transition | AI-displaced execs, C-Suite retirees |
| `exit_liquidity` | Exit & Liquidity Event | Business owners selling, large transactions |
| `practice_complexity` | Practice Complexity | Physicians, dentists, specialists |
| `income_complexity` | Income Complexity | High-earning physicians (general) |
| `owner_succession` | Owner Succession | Business owners building toward exit |
| `equity_complexity` | Equity Compensation | HENRYs, tech executives, RSU vesting |
| `deferred_comp` | Deferred Comp & Benefits | C-Suite, senior corporate leaders |
| `lifestyle_wealth` | Lifestyle & Wealth | Aircraft owners, affluence-hobby segment |
| `partner_complexity` | Partner Complexity | Law partners, equity partners |
| `philanthropic_planning` | Philanthropic Planning | Charity board members, major donors |
| `inheritance_transition` | Inheritance Transition | Estate beneficiaries, trust recipients |
| `deal_fluency` | Deal Fluency | Real estate developers, syndicators |
| `general_niche_intro` | Niche Introduction | Default fallback for any persona |

---

**Handoff prepared by:** Big Nate (Antigravity Agent)
**Date:** April 7, 2026
**Session:** Phase B2 — Pilot Provisioning + Outreach Agent Stack v1
**Next session should begin with:** Pilot verification logins + P1 priority items above
