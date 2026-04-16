---
name: agent_tradesman
nicheId: high-earning-tradesman
version: "1.0"
script: Manual — Secretary of State + BBB + NAICS filings
dataSource: Secretary of State business filings + BBB + Chamber directories
aum_floor: "$500K+"
---

# Agent: High Earning Tradesman Lead Miner 🔧
**Niche:** High Earning Tradesman (`high-earning-tradesman`)  
**Data sources:** Secretary of State business entities + BBB verified listings + NAICS trade codes  
**The insight:** Plumbing, HVAC, electrical, roofing business owners are frequently the most cash-rich and least-advised HNW individuals in any local market.

---

## Why This Niche is Underserved

- Advisors don't prospect them (not glamorous)
- The owners don't self-identify as "wealthy" (they think of themselves as tradespeople)
- They have irregular cash flow — highly seasonal
- Most have no succession plan, no buy-sell agreement, no key-person insurance
- They're often worth $500K–$3M and have no financial advisor

---

## Source 1 — Secretary of State Business Filings

Same approach as Business Owners agent but filtered for trade NAICS codes:

**Target NAICS codes:**
```
238110 — Poured Concrete Foundation Contractors
238210 — Electrical Contractors
238220 — Plumbing, Heating, and Air-Conditioning Contractors
238290 — Other Building Equipment Contractors
238310 — Drywall and Insulation Contractors
238330 — Flooring Contractors
238350 — Finish Carpentry Contractors
238390 — Other Building Finishing Contractors
238910 — Site Preparation Contractors
238990 — All Other Specialty Trade Contractors
532412 — Construction Equipment Rental (heavy equipment operators)
```

**State portals:**
```
MN: https://mncis.courts.state.mn.us
TX: https://mycpa.cpa.texas.gov
FL: https://search.sunbiz.org
IL: https://apps.ilsos.net/corporatellc/
```

**Filter:**
- Entity age: 7+ years (established business)
- Status: Active
- Owner: Named individual (not anonymous LLC)
- Annual report filed: Yes

---

## Source 2 — BBB Verified Listings

URL: `https://www.bbb.org/search?type=bus&find_text=HVAC&find_loc={City,+State}`

BBB accrediteds in the trades with A+ ratings and 5+ years in business = established owner. BBB lists include:
- Business name
- Owner name (often)
- Phone and address
- Years in business

Filter for: HVAC, Electrical, Plumbing, Roofing — 10+ years, A+ rating, 10+ employees

---

## Source 3 — Local Chamber of Commerce

Most local chambers publish member directories:
- Search: "[City] Chamber of Commerce members directory HVAC"
- Many are downloadable PDFs with business owner names

---

## Source 4 — Angi / HomeAdvisor Pro Profiles

URL: `https://www.angislist.com/companylist/`  
Large trade businesses with many reviews = established, cash-generating operations. High review volume = busy = cash-rich.

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Business type** | HVAC, Electrical, Plumbing, Roofing, General Contracting, Excavation |
| **Business revenue** | $1M–$15M |
| **Business age** | 7+ years |
| **Owner age** | 45–62 |
| **Employees** | 5–50 |
| **AUM floor** | $500K+ |

---

## Trigger Events (High Timing Score)

- Owner approaching retirement (58+) with no succession plan
- Business loan recently paid off (cash surplus)
- Key-man insurance lapse or renewal (opens the conversation)
- Large government or commercial contract win (cash spike)
- Second generation not interested in taking over business

---

## Red Flags — Disqualify

- ❌ Solo operators without employees (too small)
- ❌ Franchise operations with royalty payments (thin margins)
- ❌ Workers in the trades (employees, not owners)
- ❌ Businesses with recent negative cash flow or lawsuits
- ❌ Less than 3 years in business (too early)

---

## Required Output Fields

```json
{
  "firstName": "Danny",
  "lastName": "Krueger",
  "title": "Owner — Krueger HVAC Services LLC",
  "company": "Krueger HVAC Services LLC",
  "city": "Omaha",
  "state": "NE",
  "nicheId": "high-earning-tradesman",
  "estimatedAUM": "$800K",
  "source": "Nebraska Secretary of State + BBB",
  "sourceUrl": "https://www.sos.ne.gov/...",
  "needsEnrichment": true,
  "reasonCodes": [
    "Active HVAC LLC — 11 years registered",
    "BBB A+ — 18 employees, Omaha market",
    "Owner age 57 — no succession plan visible"
  ],
  "signals": {
    "estimatedAssets": "$800K",
    "relationship": "None — cold",
    "nextEvent": "Approaching retirement — no documented exit plan",
    "outreachAngle": "Owner-only 401(k) + business sale readiness"
  }
}
```

---

## Outreach Angle

> "Most trade business owners we talk to have more cash than they realize — and no plan for what happens when they want to step back. We help owners in the trades build wealth that outlasts the business."

---

## Output Location

`scripts/staging/alfred_batch_tradesman_YYYY-MM-DD.json`
