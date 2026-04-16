---
name: agent_aircraft_owners
nicheId: aircraft-owners
version: "2.0"
owner: Alfred
builder: Nate
script: scripts/agent_faa_miner.js
scrubber: scripts/scrub_leads.js
enricher: scripts/agent_apollo_enrich.js
dataSource: FAA Aircraft Registry
dataSourceType: public-bulk-download
aumFloor: "$1M+"
outputRaw: scripts/staging/raw/alfred_batch_faa_YYYY-MM-DD.raw.json
outputScrubbed: scripts/staging/scrubbed/alfred_batch_faa_YYYY-MM-DD.scrubbed.json
outputRejected: scripts/staging/rejected/alfred_batch_faa_YYYY-MM-DD.rejected.json
configFile: scripts/config/aircraft-owners.json
---

# Agent: Aircraft Owners Lead Miner ✈️

**Niche:** Aircraft Owners (`aircraft-owners`)  
**Owner:** Alfred  
**Builder:** Nate  
**Primary script:** `scripts/agent_faa_miner.js`  
**Primary source:** FAA Releasable Aircraft Database — 100% free, 350K records, updated monthly  

---

## Purpose

Find high-probability aircraft-owner prospects, normalize the records, reject low-confidence entries, and output a review-ready batch for operator approval. Every lead must be verifiable against the FAA public registry in under 90 seconds.

---

## Workflow

1. Download FAA `ReleasableAircraft.zip` (or use `--skip-download` for cached copy)
2. Parse `MASTER.txt` + `ACFTREF.txt` with fixed-width column layout
3. Filter: Individual/LLC owner types, HNW manufacturers, multi-engine/turbine aircraft
4. Build raw lead records — no email, no phone — flag `needsEnrichment: true`
5. Write `.raw.json` to `scripts/staging/raw/`
6. Run `scrub_leads.js` → normalizes names, scores confidence, deduplicates, splits scrubbed/rejected
7. Review `--review-only` queue before ingest
8. Run `agent_apollo_enrich.js` to add real contact data
9. Operator approves → `lead_ingest_agent.js`

---

## Source Rules

- Source must be: FAA registry (registry.faa.gov) — zero other sources for this niche
- Every lead MUST have `sourceUrl` pointing to registry.faa.gov N-number lookup
- If `sourceUrl` does not resolve → lead is rejected
- No emails, phone numbers, or AUM values may be fabricated
- `externalId` = FAA N-number (e.g., `N812DH`) — required

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Owner type** | Individual (FAA type 1) or LLC (type 7) |
| **Aircraft class** | Multi-engine, turbine/jet, rotorcraft — NOT student/recreational single-engine |
| **Manufacturer** | Beechcraft, Cessna Citation, Pilatus, Cirrus, Daher TBM, Bombardier, Gulfstream, Dassault, Embraer |
| **AUM proxy** | Turbine/jet owner = $500K–$5M+ net worth minimum |
| **Age range** | 48–68 (peak earning/wealth accumulation) |
| **Relationship** | No known advisor on public record |

---

## Trigger Events (High Timing Score)

- New aircraft registration (recent registration date = liquidity event just occurred)
- Aircraft upgrade (traded up model = wealth growing)
- Pre-retirement age range (62–68) + aircraft ownership = estate planning trigger
- Owner cross-referenced as business owner (dual niche = double signal)

---

## Red Flags (Heuristic — Flag for Review)

- ⚠️ Commercial airline pilot (W-2 profile — different financial needs)
- ⚠️ Pre-retirement age but modest aircraft (may be retired/downsizing)
- ⚠️ Multiple aircraft under one LLC (could be fleet, not personal)

---

## Hard Rejection Rules

Reject immediately if ANY of the following is true:

- Missing `source` or `sourceUrl`
- `sourceUrl` does not contain `registry.faa.gov`
- Missing `externalId` (N-number)
- FAA owner type = Government (5) or Non-Citizen Corp (8)
- Entity name matches: `flight school`, `flight academy`, `charter`, `airlines`, `air service`
- `confidenceScore` below `0.75` (the niche minimum)
- Duplicate of existing approved lead (same `duplicateKey`)
- Email or phone contains placeholder pattern (`@example.com`, `555-`)

---

## Required Output Fields

Every lead must conform to this structure after scrubbing:

```json
{
  "leadId": "aircraft-owners_dale_hatcher_mn_n812dh",
  "firstName": "Dale",
  "lastName": "Hatcher",
  "fullName": "Dale Hatcher",
  "title": "",
  "company": "",
  "entityType": "individual",
  "city": "Minnetonka",
  "state": "MN",
  "niche": "Aircraft Owners",
  "nicheId": "aircraft-owners",
  "estimatedAUM": "$2.5M+",
  "aumBand": "1m-5m",
  "source": "FAA Aircraft Registry",
  "sourceUrl": "https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=812DH",
  "externalId": "N812DH",
  "reasonCodes": [
    "FAA-registered turbine aircraft owner",
    "Minnetonka, MN — verifiable public record"
  ],
  "signals": [
    "Beechcraft King Air 350",
    "Multi-engine turbine — high AUM proxy"
  ],
  "needsEnrichment": true,
  "confidenceScore": 0.88,
  "confidenceBand": "high",
  "status": "scrubbed",
  "duplicateKey": "aircraft-owners_dale_hatcher_mn",
  "reviewedBy": "",
  "reviewedAt": "",
  "validationErrors": [],
  "rejectionViolations": []
}
```

---

## Lifecycle Status

| Status | Meaning |
|---|---|
| `raw` | Direct miner output — not yet scrubbed |
| `scrubbed` | Passed scrubber validation and confidence gate |
| `rejected` | Failed any hard rejection rule |
| `enriched` | Apollo/LinkedIn contact data appended |
| `approved` | Operator signed off — ready for ingest |

---

## Confidence Model

```json
{
  "confidenceScore": 0.88,
  "confidenceBand": "high"
}
```

| Band | Score | Meaning |
|---|---|---|
| High | ≥ 0.80 | Ready for outreach after enrichment |
| Medium | 0.60–0.79 | Review required before enrichment |
| Low | < 0.60 | Needs significant verification or reject |

**Minimum for aircraft-owners niche:** `0.75`

---

## Run Commands

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

# Raw extraction — all states, 100 leads
node scripts/agent_faa_miner.js --limit 100

# Filtered extraction — state + limit
node scripts/agent_faa_miner.js --state TX --limit 50

# Skip download (use cached FAA data from previous run)
node scripts/agent_faa_miner.js --skip-download --limit 100

# Dry run (preview 5 leads, no file written)
node scripts/agent_faa_miner.js --dry-run

# Scrub the raw output
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_faa_YYYY-MM-DD.raw.json

# Review queue only (no files written — shows top confidence leads)
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_faa_YYYY-MM-DD.raw.json --review-only

# Enrich (after Apollo key is configured)
node scripts/agent_apollo_enrich.js --file scripts/staging/scrubbed/alfred_batch_faa_YYYY-MM-DD.scrubbed.json

# Ingest
node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/alfred_batch_faa_YYYY-MM-DD.scrubbed.json
```

---

## Human Review Checklist

Before approving any lead from the review queue:

- [ ] Open `sourceUrl` in browser — confirm the N-number resolves to a real aircraft record
- [ ] Confirm owner name matches lead record (FAA data can have formatting variants)
- [ ] Confirm city/state match the FAA record
- [ ] Confirm aircraft class/manufacturer aligns with HNW filter criteria
- [ ] Check: Is the owner an individual or identifiable LLC? (Not a fleet/charter operation)
- [ ] No obvious disqualifier (government, charter, flight school)
- [ ] Record is not a duplicate of an existing approved lead
- [ ] `confidenceScore` ≥ 0.75 ✅
- [ ] Mark `reviewedBy` and `reviewedAt` when approved

**Time standard:** If you cannot verify a lead in under 90 seconds, reject it and send back for enrichment.

---

## Outreach Angle

> "Aviation-specific tax complexity — bonus depreciation, business use split, and entity structure — rarely gets the advisor attention it deserves. We work specifically at that intersection."

---

## Verification Standard

Every lead must be independently openable in a browser:
```
https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt={N_NUMBER}
```

If the reviewer cannot verify the N-number at that URL, the lead is rejected.

---

## Output Locations

| Stage | Path |
|---|---|
| Raw | `scripts/staging/raw/alfred_batch_faa_YYYY-MM-DD.raw.json` |
| Scrubbed | `scripts/staging/scrubbed/alfred_batch_faa_YYYY-MM-DD.scrubbed.json` |
| Rejected | `scripts/staging/rejected/alfred_batch_faa_YYYY-MM-DD.rejected.json` |
| Enriched | `scripts/staging/enriched/alfred_batch_faa_YYYY-MM-DD.enriched.json` |
| Approved | `scripts/staging/approved/alfred_batch_faa_YYYY-MM-DD.approved.json` |

Alfred commits output to `kprum1/theaumengine` — operator reviews before ingest.
