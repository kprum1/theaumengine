---
name: agent_inheritance
nicheId: inheritance-recipients
version: "1.0"
script: Manual — County Probate Court records
dataSource: State/County Probate Court public filings (Free · Public)
aum_floor: "$500K+"
---

# Agent: Inheritance Recipients Lead Miner 💰
**Niche:** Inheritance Recipients (`inheritance-recipients`)  
**Data sources:** County probate court records + estate deed transfers from County Recorder  
**Timing:** Outreach window is 30–90 days after probate opens — before funds are deployed

---

## Why Probate Records Work

When someone dies with assets, the estate goes through probate — a public court process. Filings include:
- Estate inventory (with asset values in most states)
- Names of all beneficiaries
- Distribution timeline

**This is the most time-sensitive niche.** A person who just inherited $1M+ has never needed a financial advisor more than right now — and most don't have one.

---

## Source 1 — County Probate Court Portals

**Key portals:**
```
Florida:    https://myflcourtaccess.com — probate searchable online by county
Texas:      Harris County: https://www.hcdistrictclerk.com/
            Dallas County: https://www.dallascounty.org/courts/
Arizona:    https://superiorcourt.maricopa.gov/
California: https://www.courts.ca.gov/ — probate by county
Illinois:   https://www.cookcountyclerkofcourt.org/
```

**Filter:**
- Filing type: Probate / Estate Administration / Petition for Probate
- Estate value: > $500,000 (where disclosed — FL, AZ, TX are most open)
- Filed: Last 18 months
- Status: Open (actively in distribution)

---

## Source 2 — Estate Deed Transfers (County Recorder)

Cross-reference with property records:
- Grantor: "Estate of [Name]" OR "[Name] Trust" OR "Personal Representative of Estate"
- Transaction type: Personal Representative's Deed OR Trustee's Deed
- Sale price: > $400,000
- Filing date: Last 18 months

**Why:** Estate real estate sales = cash distribution event. The beneficiary who just sold mom's house has liquid assets and no plan.

---

## ProPublica Court Listener (Federal Probate)

```
https://www.courtlistener.com/api/rest/v3/dockets/?type=pb&filed_after=YYYY-MM-DD
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Inheritance size** | $500K–$5M (sweet spot — large enough for advisors, not yet well-covered) |
| **Beneficiary age** | 42–62 (old enough to manage wealth, young enough to benefit from planning) |
| **Prior relationship** | None on record — most inheritance recipients don't have advisors |
| **Timing** | 0–90 days post-probate opening |
| **Asset type** | Cash + real estate + investment accounts — all liquid within 12 months |

---

## Sensitivity Protocol — MANDATORY

> ⚠️ **This niche requires special care.** The prospect recently lost a family member.

**Never:**
- Reference the death in outreach
- Use condolence-adjacent language
- Mention "your inheritance" directly

**Always:**
- Frame as "sudden wealth" navigation
- Lead with the complexity, not the trigger
- Reference "protecting what you've received" not "what you inherited"

**Approved outreach angle:**
> "For people who've come into a significant amount of money — often unexpectedly — the most important 90 days are the first ones. We help people slow down, protect the assets, and build a coordinated plan before any decisions are made."

---

## Red Flags — Disqualify

- ❌ Recipients with existing advisor (inheritance will go there immediately)
- ❌ Estates under $300K (too small for meaningful AUM)
- ❌ Contested estates (legal dispute — bad time for financial outreach)
- ❌ Recipients with substance abuse or financial exploitation signals in court record
- ❌ Estates 24+ months old (funds already deployed)

---

## Required Output Fields

```json
{
  "firstName": "Patricia",
  "lastName": "Novak",
  "city": "Naples",
  "state": "FL",
  "nicheId": "inheritance-recipients",
  "estimatedAUM": "$1.2M",
  "source": "Collier County Probate Court — Florida",
  "sourceUrl": "https://myflcourtaccess.com/...",
  "needsEnrichment": true,
  "probateDate": "2026-03-02",
  "reasonCodes": [
    "Collier County probate filing — estate est. $1.2M",
    "Naples, FL — high-wealth coastal market",
    "Probate opened March 2026 — distribution imminent"
  ],
  "signals": {
    "estimatedAssets": "$1.2M",
    "relationship": "None — cold (probate public record)",
    "nextEvent": "Estate distribution — 60–90 days",
    "outreachAngle": "Sudden wealth — protection and planning before deployment"
  }
}
```

---

## Output Location

`scripts/staging/alfred_batch_inheritance_YYYY-MM-DD.json`
