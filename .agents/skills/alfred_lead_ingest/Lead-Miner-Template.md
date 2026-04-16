---
name: agent_<slug>
nicheId: <niche-id>
version: "2.0"
owner: Alfred
builder: Nate
script: scripts/agent_<slug>_miner.js
scrubber: scripts/scrub_leads.js
enricher: scripts/agent_apollo_enrich.js
dataSource: <public source name>
dataSourceType: api|bulk-download|public-search|manual-hybrid
aumFloor: "<$500K+|$1M+|$2M+>"
configFile: scripts/config/<niche-id>.json
outputRaw: scripts/staging/raw/alfred_batch_<slug>_YYYY-MM-DD.raw.json
outputScrubbed: scripts/staging/scrubbed/alfred_batch_<slug>_YYYY-MM-DD.scrubbed.json
outputRejected: scripts/staging/rejected/alfred_batch_<slug>_YYYY-MM-DD.rejected.json
---

# Agent: <Niche Name> Lead Miner

**Niche:** <Human niche name> (`<niche-id>`)  
**Owner:** Alfred  
**Builder:** Nate  
**Primary script:** `scripts/agent_<slug>_miner.js`  
**Primary source:** <source description>  

---

## Purpose

Find high-probability prospects in the `<niche-id>` niche, normalize the records, reject low-confidence entries, enrich missing fields, and output a review-ready batch for operator approval. Every lead must be verifiable against the public source in under 90 seconds.

---

## Workflow

1. Download or query source data (public, no API key required)
2. Parse and normalize records into the common lead schema
3. Apply niche-specific inclusion filters (geography, entity type, wealth proxy)
4. Build raw lead records — blank email/phone, flag `needsEnrichment: true`
5. Write `.raw.json` to `scripts/staging/raw/`
6. Run `scrub_leads.js` → normalize, score, dedup, split scrubbed/rejected
7. Review `--review-only` queue before ingest
8. Run `agent_apollo_enrich.js` to add real contact data
9. Operator approves → `lead_ingest_agent.js`

---

## Source Rules

- Source must be public, reproducible, and free
- Every lead MUST have a working `sourceUrl`
- If `sourceUrl` does not resolve → lead is rejected
- No email, phone, or AUM values may be fabricated or estimated without a rationale
- Do NOT use any hallucinated names, `@example.com` addresses, or `555-` numbers

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Target type** | <individual / owner / LLC / executive / etc.> |
| **Income / AUM proxy** | <wealth indicator — asset, income, or event> |
| **Geography** | <state / metro / nationwide> |
| **Age range** | <range if relevant> |
| **Timing window** | <event urgency — how fresh is the signal?> |
| **Advisor status** | No known advisor on public record |

---

## Trigger Events (High Timing Score)

- <event 1 — the most time-sensitive signal>
- <event 2>
- <event 3>

---

## Red Flags (Heuristic — Flag for Review)

- ⚠️ <warning 1>
- ⚠️ <warning 2>
- ⚠️ <warning 3>

---

## Hard Rejection Rules

Reject immediately if ANY of the following is true:

- Missing `source`
- Missing `sourceUrl`
- Missing both name and company
- `sourceUrl` does not resolve or match expected domain
- Duplicate of existing approved lead (same `duplicateKey`)
- Entity matches niche disqualifier patterns (see `scripts/config/<niche-id>.json`)
- Email or phone contains placeholder (`@example.com`, `555-`, `0000000000`)
- `confidenceScore` below niche minimum (see config `minConfidenceScore`)

---

## Required Output Fields

Every lead must conform to this structure after scrubbing:

```json
{
  "leadId": "<nicheId>_<firstName>_<lastName>_<state>_<externalId>",
  "firstName": "",
  "lastName": "",
  "fullName": "",
  "title": "",
  "company": "",
  "entityType": "individual|business|trust|government|unknown",
  "city": "",
  "state": "",
  "niche": "<Niche Name>",
  "nicheId": "<niche-id>",
  "estimatedAUM": "",
  "aumBand": "",
  "source": "<Source Name>",
  "sourceUrl": "",
  "externalId": "",
  "reasonCodes": [],
  "signals": [],
  "needsEnrichment": true,
  "confidenceScore": 0.0,
  "confidenceBand": "low|medium|high",
  "status": "raw|screened|scrubbed|enriched|approved|rejected",
  "duplicateKey": "",
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

| Band | Score | Meaning |
|---|---|---|
| High | ≥ 0.80 | Ready for outreach after enrichment |
| Medium | 0.60–0.79 | Review required before enrichment |
| Low | < 0.60 | Needs significant verification or reject |

Scoring signals (from `scripts/lib/score_lead.js`):
- +0.10 `sourceUrl` present
- +0.10 `externalId` present
- +0.08 `city` + `state` both present
- +0.08 `reasonCodes` has ≥1 entry
- +0.07 `estimatedAUM` present
- +0.07 `entityType` is `individual` or `business`
- +0.05 `source` present, `firstName`+`lastName` present, `signals` has ≥1 entry

---

## Run Commands

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/kosalprum/Documents/AdvDiamondMining

# Raw extraction
node scripts/agent_<slug>_miner.js --limit 100

# Filtered extraction
node scripts/agent_<slug>_miner.js --state TX --limit 50

# Dry run (preview, no file written)
node scripts/agent_<slug>_miner.js --dry-run

# Scrub the raw output
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_<slug>_YYYY-MM-DD.raw.json

# Review queue only (top confidence leads, no files written)
node scripts/scrub_leads.js --file scripts/staging/raw/alfred_batch_<slug>_YYYY-MM-DD.raw.json --review-only

# Enrich (after Apollo key is configured)
node scripts/agent_apollo_enrich.js --file scripts/staging/scrubbed/alfred_batch_<slug>_YYYY-MM-DD.scrubbed.json

# Ingest
node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/alfred_batch_<slug>_YYYY-MM-DD.scrubbed.json
```

---

## Human Review Checklist

Before approving any lead from the review queue:

- [ ] Open `sourceUrl` in browser — confirm it resolves and matches the lead
- [ ] Confirm person or entity exists in the source record
- [ ] Confirm niche fit (income proxy, asset type, trigger event)
- [ ] No obvious disqualifier (entity type, employment category, geography)
- [ ] Record is not a duplicate of an existing approved lead
- [ ] `confidenceScore` meets niche minimum ✅
- [ ] `needsNameResolution` leads: extract name from filing/record before approving
- [ ] Mark `reviewedBy` and `reviewedAt` when approved

**Time standard:** If you cannot verify a lead in under 90 seconds, reject it and send back for enrichment.

---

## Outreach Angle

> "<niche-specific one-sentence messaging hook — what pain or trigger do we lead with?>"

---

## Verification Standard

Every lead must be independently openable in a browser from `sourceUrl`.  
If a reviewer cannot verify the lead in under 90 seconds, it should be rejected or sent back for enrichment.

---

## Output Locations

| Stage | Path |
|---|---|
| Raw | `scripts/staging/raw/alfred_batch_<slug>_YYYY-MM-DD.raw.json` |
| Scrubbed | `scripts/staging/scrubbed/alfred_batch_<slug>_YYYY-MM-DD.scrubbed.json` |
| Rejected | `scripts/staging/rejected/alfred_batch_<slug>_YYYY-MM-DD.rejected.json` |
| Enriched | `scripts/staging/enriched/alfred_batch_<slug>_YYYY-MM-DD.enriched.json` |
| Approved | `scripts/staging/approved/alfred_batch_<slug>_YYYY-MM-DD.approved.json` |

Alfred commits output to `kprum1/theaumengine` — operator reviews before ingest.
