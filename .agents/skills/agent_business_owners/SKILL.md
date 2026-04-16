---
name: agent_business_owners
nicheId: business-owners
version: "1.0"
script: Manual research + scripts/agent_sec_miner.js (SBA/SoS portals)
dataSource: Secretary of State filings + County Recorder + LinkedIn
aum_floor: "$1M+"
---

# Agent: Business Owners Lead Miner 🏢
**Niche:** Business Owners (`business-owners`)  
**Data sources:** State Secretary of State business registries, County Recorder transfer records, BizBuySell, LinkedIn  

---

## Sourcing Strategy

Business owners don't have a single federal database like FAA or NPI. Use multiple signals in combination:

### Source 1 — Secretary of State Business Filings (Best Starting Point)

| State | URL |
|---|---|
| MN | https://mncis.courts.state.mn.us |
| TX | https://mycpa.cpa.texas.gov (franchise tax — often shows revenue) |
| FL | https://search.sunbiz.org |
| IL | https://apps.ilsos.net/corporatellc/ |
| CA | https://bizfileonline.sos.ca.gov |

**Filter for:**
- Entity type: S-Corp, LLC, Corporation (not sole prop)
- Active status: Yes
- Years registered: 5+ (established businesses)
- Principal name: Individual (not a registered agent firm)
- Annual report: Filed (still operating)

### Source 2 — LinkedIn Search

```
Search: "Owner" OR "Founder" OR "CEO" + [industry] + [city]
Filter: Company size 10–200 employees
Industries: Manufacturing, Professional Services, Healthcare Services, Distribution, Construction
```

### Source 3 — BizBuySell Listings

URL: `https://www.bizbuysell.com/businesses-for-sale/`  
**Why:** Business listed for sale = owner at decision point = immediate planning need.  
Filter: Price > $1M, Revenue > $2M, non-franchise

### Source 4 — Local Business Journals

Search: "[City] Business Journal top privately held companies"  
Most metro areas publish an annual "top 50 privately held businesses" list — owner names are included.

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Business revenue** | $2M–$50M |
| **Business age** | 5+ years (established cash flow) |
| **Owner age** | 50–65 (succession planning window) |
| **AUM floor** | $1M+ separate from business value |
| **Headcount** | 5–200 employees |
| **Sector** | Manufacturing, trades, professional services, distribution |

---

## Trigger Events (High Timing Score)

- Business listed on BizBuySell or local broker
- M&A headline in their sector (creates exit urgency)
- New hire of CFO or exit consultant (intent signal)
- Owner age 58–65 with no succession plan
- SBA loan paid off (business mature, cash rich)
- Key competitor was acquired

---

## Red Flags — Disqualify

- ❌ Solopreneurs under $500K revenue
- ❌ Franchise operators (thin margins, different profile)
- ❌ VC-backed startups (wrong liquidity timeline)
- ❌ Revenue > $25M (already well-advised likely)
- ❌ Negative cash flow or recent bankruptcy filing

---

## Required Output Fields

```json
{
  "firstName": "Robert",
  "lastName": "Hendricks",
  "title": "Owner — Hendricks Manufacturing LLC",
  "company": "Hendricks Manufacturing LLC",
  "city": "Overland Park",
  "state": "KS",
  "nicheId": "business-owners",
  "estimatedAUM": "$2.5M",
  "source": "MN Secretary of State + LinkedIn",
  "sourceUrl": "https://mncis.courts.state.mn.us/...",
  "needsEnrichment": true,
  "reasonCodes": [
    "Active S-Corp — 12 years registered",
    "HVAC services — 45 employees",
    "Owner age 58 — succession window"
  ],
  "signals": {
    "estimatedAssets": "$2.5M",
    "relationship": "None — cold",
    "nextEvent": "Approaching retirement — no documented succession plan",
    "outreachAngle": "Exit readiness — tax-efficient sale structure"
  }
}
```

---

## Outreach Angle

> "Most business owners are leaving 30–40% of their after-tax exit proceeds on the table because the financial plan wasn't coordinated with the sale process. We specialize in closing that gap."

---

## Output Location

`scripts/staging/alfred_batch_business_owners_YYYY-MM-DD.json`
