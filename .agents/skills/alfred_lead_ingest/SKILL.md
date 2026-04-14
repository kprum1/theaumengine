---
name: alfred_lead_ingest
description: >
  Complete spec for Alfred (OpenClaw) to prepare and validate a new batch of leads
  for The AUM Engine routing pipeline. Alfred produces a JSON file matching the
  required schema and drops it in the handoff location. The operator or Antigravity
  then runs the authenticated local ingest script. Alfred never holds API keys.
---

# Alfred Lead Ingest — AUM Engine Skill

**Who runs this:** Alfred (OpenClaw) — prepares the batch file only  
**Who runs the ingest:** Operator (Kosal) or Antigravity — runs the local script with service account  
**When to run:** Any time the routing queue is empty or the operator requests a new batch.  
**Security model:** Alfred has NO API key access. He prepares a validated JSON file and hands it off. The operator authenticates and ingests via Admin SDK locally — no external API surface exposed.  
**Idempotency:** Built in — SHA-256 hash of `(firstName + lastName + email + phone)`. Duplicates are silently skipped.

---

## 1. WORKFLOW OVERVIEW

```
Alfred                         Operator / Antigravity
──────────────────────         ──────────────────────────────────────
1. Research + source leads
2. Build JSON batch file
3. Validate against schema (§2)
4. Drop file here:
   scripts/staging/
   alfred_batch_YYYY_MM_DD.json
                                5. Run audit_leads.js → confirm 10/10
                                6. Run ingest_alfred_batch.js
                                   (uses serviceAccountKey — local only)
                                7. Confirm leads in routing_queue
                                8. Routing engine assigns within 5 min
```

**Alfred never touches the API key, service account, or Firestore directly.**  
His only deliverable is a correctly-formatted JSON file in `scripts/staging/`.

---

## 2. WHAT ALFRED NEEDS TO PRODUCE

Alfred must produce a **JSON array of lead objects**. Each lead must match the schema below exactly.

### Required Fields (routing will FAIL without these)

| Field | Type | Description | Example |
|---|---|---|---|
| `firstName` | String | Prospect first name | `"Barbara"` |
| `lastName` | String | Prospect last name | `"Keene"` |
| `city` | String | City of residence | `"Phoenix"` |
| `state` | String | 2-letter US state code | `"AZ"` |
| `niche` | String | Human-readable niche label | `"Physicians"` |
| `nicheId` | String | Machine-readable niche ID (see §3) | `"physicians"` |
| `estimatedAUM` | String | Estimated investable assets | `"$2.5M"` |
| `fitScore` | Number | Alfred's fit score (0–100) | `82` |
| `timingScore` | Number | Alfred's timing score (0–100) | `75` |

### Recommended Fields (improve routing score + advisor UX)

| Field | Type | Description | Example |
|---|---|---|---|
| `email` | String | Contact email (used for idempotency) | `"bkeene@ascendant.com"` |
| `phone` | String | Contact phone (used for idempotency) | `"602-555-1234"` |
| `title` | String | Professional title | `"Chief of Cardiology"` |
| `company` | String | Firm or employer | `"Ascendant Medical Group"` |
| `linkedIn` | String | LinkedIn profile URL | `"https://linkedin.com/in/..."` |
| `signals` | Object | Enrichment signals (see §4) | `{ "estimatedAssets": "$2.5M" }` |
| `reasonCodes` | Array | Why this lead was surfaced | `["Recent liquidity event", "Active 401k"]` |
| `source` | String | How Alfred found them | `"Alfred Wealth Trigger Miner"` |
| `batchId` | String | Alfred's batch reference ID | `"alfred_batch_2026_04_13"` |

### Optional / Enrichment Fields

| Field | Type | Description |
|---|---|---|
| `aumBand` | String | `"<500k"` \| `"500k-1m"` \| `"1m-5m"` \| `"5m+"` |
| `age` | Number | Estimated age |
| `ageRange` | String | `"45-55"` |
| `aircraftModel` | String | Only for `aircraft-owners` niche |
| `nNumber` | String | FAA N-number (aircraft owners) |
| `yachtName` | String | Vessel name (yacht owners) |
| `outreachAngle` | String | Suggested approach angle for outreach |

---

## 3. VALID NICHE IDs

The `nicheId` field MUST exactly match one of these values. The routing engine uses this to match advisors — a wrong `nicheId` causes `eligibility_empty` and the lead never gets assigned.

| nicheId | Human Label | Pilot Advisors Covering |
|---|---|---|
| `physicians` | Physicians & Surgeons | Ray Uncle, Patrick Wight |
| `aircraft-owners` | Aircraft Owners | Matt Germshied, Andy Belly |
| `yacht-owners` | Yacht Owners | Matt Germshied, Andy Belly, Ray Uncle, Patrick Wight |
| `business-owners` | Business Owners | Matt Germshied, Patrick Wight, Chuck Cooper, Andy Belly |
| `charity-board-members` | Charity Board Members | Ray Uncle |
| `ai-displaced-executives` | AI-Displaced Executives | Chuck Cooper |
| `real-estate-developers` | Real Estate Developers | Chuck Cooper, Andy Belly |
| `real-estate-investors` | Real Estate Investors | Chuck Cooper, Andy Belly |
| `henrys` | HENRYs (High Earner, Not Rich Yet) | *(no pilot advisor assigned — avoid for now)* |
| `inheritance-recipients` | Inheritance Recipients | *(no pilot advisor assigned — avoid for now)* |

> ⚠️ **Do not use `henrys` or `inheritance-recipients`** in this batch — no pilot advisor covers them and leads will fail with `eligibility_empty`.

---

## 4. THE `signals` OBJECT

The `signals` object powers the advisor's lead drawer — what they see when they click a lead. Fill as many as Alfred can source:

```json
{
  "estimatedAssets": "$2.5M",
  "ageRange": "50-60",
  "relationship": "None — cold (Alfred sourced)",
  "nextEvent": "Retirement in 18 months",
  "outreachAngle": "Sequence diversification before distribution phase",
  "aircraftModel": null,
  "nNumber": null
}
```

---

## 5. FULL EXAMPLE PAYLOAD

This is the JSON file Alfred should write to `scripts/staging/alfred_batch_YYYY_MM_DD.json`:

```json
[
  {
    "firstName": "Barbara",
    "lastName": "Keene",
    "email": "bkeene@ascendant.com",
    "phone": "602-555-1234",
    "title": "Chief of Cardiology",
    "company": "Ascendant Medical Group",
    "city": "Scottsdale",
    "state": "AZ",
    "niche": "Physicians",
    "nicheId": "physicians",
    "estimatedAUM": "$3.2M",
    "aumBand": "1m-5m",
    "fitScore": 84,
    "timingScore": 78,
    "source": "Alfred Wealth Trigger Miner",
    "batchId": "alfred_batch_2026_04_14",
    "reasonCodes": ["Recent hospital system acquisition", "Trailing income spike", "High AUM band"],
    "signals": {
      "estimatedAssets": "$3.2M",
      "ageRange": "48-56",
      "relationship": "None — cold (Alfred sourced)",
      "nextEvent": "Practice buyout proceeds — 6 months",
      "outreachAngle": "Tax-efficient deployment of acquisition proceeds"
    }
  },
  {
    "firstName": "Dale",
    "lastName": "Hatcher",
    "email": "dhatcher@hatcherjet.com",
    "phone": "763-555-8821",
    "title": "Owner",
    "company": "Hatcher Aviation LLC",
    "city": "Eden Prairie",
    "state": "MN",
    "niche": "Aircraft Owners",
    "nicheId": "aircraft-owners",
    "estimatedAUM": "$4.1M",
    "aumBand": "1m-5m",
    "fitScore": 91,
    "timingScore": 80,
    "aircraftModel": "Beechcraft King Air 350",
    "nNumber": "N812DH",
    "source": "Alfred USCG/FAA Vessel Miner",
    "batchId": "alfred_batch_2026_04_14",
    "reasonCodes": ["FAA aircraft owner", "MN business filing — $4M revenue", "No advisor relationship detected"],
    "signals": {
      "estimatedAssets": "$4.1M",
      "ageRange": "52-62",
      "relationship": "None — cold (FAA registry)",
      "nextEvent": "No known trigger — initial reach",
      "outreachAngle": "Alts allocation for illiquid business owner with hard assets"
    }
  }
]
```

---

## 6. ALFRED'S HANDOFF — WHERE TO DROP THE FILE

Alfred writes his completed JSON batch file to:

```
/Users/kosalprum/Documents/AdvDiamondMining/scripts/staging/
alfred_batch_YYYY_MM_DD.json
```

Naming convention: `alfred_batch_2026_04_14.json` (ISO date, no spaces).

Alfred then **notifies the operator** (via handoff doc or message) that the file is ready.

> ⚠️ **Alfred does not run any scripts himself. He does not POST to any endpoint. He does not touch the service account key.** His job ends when the file is written and the operator is notified.

---

## 6b. OPERATOR INGEST STEP (Kosal / Antigravity)

Once Alfred drops the file, the operator runs:

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

# 1. Confirm file is there
ls scripts/staging/

# 2. Run audit first
node scripts/audit_leads.js

# 3. Ingest Alfred's batch (uses serviceAccountKey — local only, never exposed)
node scripts/lead_ingest_agent.js --file scripts/staging/alfred_batch_YYYY_MM_DD.json

# 4. Confirm routing
node scripts/check_queue.js
```

The ingest script uses `serviceAccountKey.json` (Admin SDK) — bypasses all HTTP endpoints entirely. No API key needed, no external surface exposed.

**Batch size:** 10–50 leads per file is optimal. `processRoutingQueue` picks them up within 5 minutes automatically.

---

## 7. HOW TO VERIFY SUCCESS (Operator)

After running the ingest script:

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining
node scripts/audit_leads.js
```

Watch for:
- `master_leads` count increased by the number of leads in Alfred's file
- `routing_queue` shows new `queued` items (or already `assigned` if engine ran)
- `lead_assignments` count increases within 5–10 minutes

Also check the routing logs for `eligibility_empty` events — those indicate a niche mismatch. If you see them, check the `nicheId` on the failing leads against §3.

---

## 8. DIAGNOSING ELIGIBILITY_EMPTY FAILURES

If leads land in `routing_queue` but never get assigned (`eligibility_empty`), the cause is always one of these three:

| Root Cause | Symptom | Fix |
|---|---|---|
| Wrong `nicheId` | Lead has `nicheId: "henrys"`, no advisor covers it | Remap to a covered niche OR expand advisor coverage |
| State gate mismatch | Lead state not in advisor's `licensedStates` | All pilot advisors are National (empty array = all states) — should not fire |
| All advisors at cap | Every eligible advisor is at `effectiveCap` | Wait for advisor activity / lead releases, OR increase caps |

To check which leads are failing:

```bash
cd /Users/kosalprum/Documents/AdvDiamondMining
node scripts/requeue_failed.js
```

---

## 9. RECOMMENDED BATCH COMPOSITION (Next Batch)

Based on current pilot advisor capacity:

| Niche | Advisor(s) With Room | Recommended Count |
|---|---|---|
| `physicians` | Ray Uncle (20/30 — 10 slots), Patrick Wight (7/25 — 18 slots) | 10–15 |
| `yacht-owners` | Chuck Cooper (5/30), Patrick Wight (7/25), Ray Uncle (10 soft-cap slots) | 8–12 |
| `real-estate-developers` | Chuck Cooper (5/30), Andy Belly (14/20 — 6 slots) | 5–8 |
| `ai-displaced-executives` | Chuck Cooper (5/30 — 25 slots) | 8–12 |
| `aircraft-owners` | Andy Belly (14/20 — 6 slots) | 4–6 |
| `business-owners` | Chuck Cooper, Patrick Wight have room | 5–8 |

> ⚠️ Do NOT add more `business-owners` or `yacht-owners` for Matt Germshied — he is at 86% cap (30/35) and will trigger a governance flag tonight. His next batch should come only after he logs outreach and moves leads off `New` status.

**Target batch size: 40–50 leads** covering `physicians`, `yacht-owners`, `real-estate-developers`, and `ai-displaced-executives`.

---

## 10. HANDOFF NOTES

### Alfred's Rules (non-negotiable)
- ✅ Alfred writes a JSON file to `scripts/staging/` — that is his ONLY output
- ✅ Alfred notifies the operator when the file is ready
- ❌ Alfred does NOT hold or use the `AUM_ALFRED_API_KEY`
- ❌ Alfred does NOT call any Cloud Function endpoints directly
- ❌ Alfred does NOT touch `serviceAccountKey.json`
- ❌ Alfred does NOT run any Node.js scripts in the project

### Technical Notes (for operator / Antigravity)
- `serviceAccountKey.json` lives at `scripts/serviceAccountKey.json` — never commit, never share
- Firebase CLI: `/usr/local/bin/firebase` — always `export PATH="/opt/homebrew/bin:$PATH"` first
- All leads land as `advisorStatus: New` — routing is automatic
- `priorityScore` stored in `master_leads` = `round((fitScore + timingScore) / 2)`
- Idempotency key = `SHA-256(firstName + lastName + email + phone)` — exact dupes silently skipped
- Staging files can be deleted after confirmed ingest

---

*Skill written 2026-04-13 by Antigravity (Big Nate). Revised 2026-04-13: Alfred prepares batch files only — no API key access per security policy. Alfred: read §3 and §9 first.*
