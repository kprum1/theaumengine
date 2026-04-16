---
name: agent_charity_boards
nicheId: charity-boards
version: "1.0"
script: Manual — IRS Form 990 via ProPublica API
dataSource: IRS Form 990 (ProPublica Nonprofit Explorer API — Free)
aum_floor: "$2M+"
---

# Agent: Charity Board Members Lead Miner 🎗️
**Niche:** Charity Boards (`charity-boards`)  
**Data source:** IRS Form 990 via ProPublica Nonprofit Explorer — free, comprehensive, updated annually  
**Why:** Board members at $5M+ nonprofits are almost always HNW individuals ($2M+ personal). Their giving patterns signal estate planning readiness.

---

## ProPublica API

```bash
# Search nonprofits by state
curl "https://projects.propublica.org/nonprofits/api/v2/search.json?state[id]=MN&ntee[id]=A&c_code[id]=3"

# Get 990 detail for a specific org (includes board member names)
curl "https://projects.propublica.org/nonprofits/api/v2/organizations/{EIN}.json"
```

**Base URL:** `https://projects.propublica.org/nonprofits/api/v2/`

---

## Direct Research URLs

```
ProPublica Nonprofit Explorer: https://projects.propublica.org/nonprofits/
Foundation Center (Candid):    https://candid.org/
GuideStar:                     https://www.guidestar.org/
IRS Tax Exempt Org Search:     https://apps.irs.gov/app/eos/
```

---

## Filter Logic

**Step 1 — Find qualifying organizations:**
```
Total assets > $5,000,000 (this is the wealth signal)
State: Any
NTEE category: A (Arts), B (Education), E (Health), F (Mental Health), P (Human Services)
C code: 3 (501c3 public charities) — not foundations (which are private, harder to source)
Status: Active
```

**Step 2 — Extract board members:**
From the 990, Part VII lists officers, directors, and trustees by name with compensation. Names in Part VII = board member names.

**Step 3 — Cross-reference for wealth:**
LinkedIn: Search each name → confirm professional background → estimate personal AUM

---

## Secondary Sources

### Hospital Foundation Donor Walls
Most hospital foundations publish their major donor lists publicly:
- Search: "[Hospital Name] Foundation Annual Report" → open PDF → find donor list
- Named donors at $25K+ giving level = $1M+ personal AUM minimum

### University Giving Society Rosters
Example: "Presidential Associates" or "Founders Circle" members are often published:
- Search: "[University] annual giving society honor roll" → find named donors

### Local Business Journal Philanthropy Lists
Search: "[City] Business Journal Power of Giving" — annual feature with named philanthropists

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Board role** | Trustee, Director, Board Chair, Honorary Chair |
| **Org size** | $5M+ total assets |
| **Giving level** | Named gift, capital campaign donor, building naming |
| **AUM floor** | $2M+ personal |
| **Age range** | 50–72 |
| **DAF indicator** | Active charitable giving = likely needs DAF or charitable trust strategy |

---

## Why Board Members Are the Right Target

Board service at a substantial nonprofit requires:
- Wealth (most boards have a "give or get" minimum — typically $10K–$100K/year)
- Network (they're connected to other HNW individuals)
- Philanthropic intent (they're already thinking about legacy)

**This niche cross-pollinates:** Most charity board members are ALSO in another niche (Business Owner, C-Suite, Physician, Law Partner). When you find them here, check if they qualify for a second niche too.

---

## Red Flags — Disqualify

- ❌ Board members at very small nonprofits (<$500K operating budget)
- ❌ Staff employees at nonprofits (not board members)
- ❌ Government-affiliated organizations (different funding model)
- ❌ Volunteer-only board members with no personal wealth signals

---

## Required Output Fields

```json
{
  "firstName": "Margaret",
  "lastName": "Calloway",
  "title": "Board Trustee — Chicago Symphony Orchestra",
  "company": "Chicago Symphony Orchestra (Board)",
  "city": "Chicago",
  "state": "IL",
  "nicheId": "charity-boards",
  "estimatedAUM": "$3M+",
  "source": "IRS Form 990 — ProPublica Nonprofit Explorer",
  "sourceUrl": "https://projects.propublica.org/nonprofits/organizations/362167267",
  "needsEnrichment": true,
  "reasonCodes": [
    "Board trustee — Chicago Symphony Orchestra ($45M in assets)",
    "Capital campaign donor 2025",
    "No known financial advisor on public record"
  ],
  "signals": {
    "estimatedAssets": "$3M+",
    "relationship": "None confirmed",
    "nextEvent": "Capital campaign closing — legacy gift conversation imminent",
    "outreachAngle": "DAF strategy + charitable trust — align giving with personal wealth"
  }
}
```

---

## Outreach Angle

> "Board-level philanthropists often have their personal finances and their giving completely disconnected. We help align the two so every dollar of charitable intent goes further and every dollar of personal wealth is better protected."

---

## Output Location

`scripts/staging/alfred_batch_charity_boards_YYYY-MM-DD.json`
