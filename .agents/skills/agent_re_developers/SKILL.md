---
name: agent_re_developers
nicheId: real-estate-developers
version: "1.0"
script: Manual — County Recorder + Building Permits
dataSource: County Recorder deed records + County Building Permit portals (Free · Public)
aum_floor: "$2M+"
---

# Agent: Real Estate Developers Lead Miner 🏗️
**Niche:** Real Estate Developers (`real-estate-developers`)  
**Data sources:** County Recorder property transfer records + County building permit portals  
**Why these sources:** Every property sale is a public record. Every major construction permit is public. Both reveal active developers before the money moves.

---

## Source 1 — County Recorder (Property Transfer Records)

Highest signal source. Finds developers CLOSING deals — the 1031 exchange clock starts immediately.

**Key portals:**
```
MN: https://gis.hennepin.us/property/map/
TX: https://hcad.org/records/real-property-search
FL: https://bcpa.net (Broward) | https://miamidade.gov/pa/property_search.asp
IL: https://cookcountypropertyinfo.com
NY: https://a836-acris.nyc.gov
CA: Varies by county — search "[County] assessor property records"
```

**Filter for developers:**
- Grantor/Grantee entity: LLC or individual name with 2+ transactions in 24 months
- Transaction type: Warranty Deed, Special Warranty Deed (not Quitclaim)
- Sale price: > $1,000,000
- Property type: Commercial, Multifamily, Industrial (not single-family residential)
- **Same entity appearing as buyer and seller on different properties = developer**

---

## Source 2 — Building Permit Portals

Finds developers mid-project — before the sale but with active capital at work.

**Key portals:**
```
Minneapolis: https://minneapolismn.gov/business/permits/
Dallas: https://dallascityhall.com/departments/sustainabledevelopment/
Chicago: https://chicago.gov/city/en/depts/bldgs.html
Houston: https://www.houstontx.gov/planning/Permits/
Phoenix: https://www.phoenix.gov/pdd/permits
```

**Filter:**
- Permit type: New commercial construction, Multi-family (5+ units), Major renovation
- Permit value: > $500,000
- Permit holder: Individual or small LLC (not D.R. Horton or large national builder)
- Filed: Last 6 months (active project = approaching disposition event)

---

## The 1031 Exchange Urgency Signal

A developer closing a property sale has **45 days to identify a replacement property** and **180 days to close** under IRC §1031. This is time-sensitive.

The outreach window:
- Day 0: Property closes (deed recorded — public same day or next day)
- Day 1–14: Ideal outreach window
- Day 45: Identification deadline — urgency at peak
- Day 180: Exchange deadline — too late if no plan in place

**Alfred: monitor county recorder feeds for new deeds daily. Fresh deed = call that day.**

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Activity** | 2+ property transactions in 24 months |
| **Project scale** | $500K–$20M per project |
| **Property type** | Commercial, multifamily, industrial, mixed-use |
| **AUM floor** | $2M+ |
| **Age range** | 42–62 |
| **Structure** | LLC or individual — not large national developer |

---

## Red Flags — Disqualify

- ❌ Passive REIT investors (no direct control, wrong profile)
- ❌ Single-family residential buyers (wrong scale)
- ❌ Distressed property with negative equity (wealth signal reversed)
- ❌ Large national developers (Lennar, D.R. Horton — already well-advised)
- ❌ Entities under active SEC or IRS enforcement

---

## Required Output Fields

```json
{
  "firstName": "Marcus",
  "lastName": "Delgado",
  "title": "Principal — Delgado Capital Group LLC",
  "company": "Delgado Capital Group LLC",
  "city": "Austin",
  "state": "TX",
  "nicheId": "real-estate-developers",
  "estimatedAUM": "$4M+",
  "source": "Travis County Recorder — Deed Record",
  "sourceUrl": "https://deed.traviscountytx.gov/...",
  "needsEnrichment": true,
  "reasonCodes": [
    "3 commercial property transactions in 18 months",
    "Latest sale: $2.4M warehouse — Austin, TX",
    "1031 exchange window: 45-day identification clock started"
  ],
  "signals": {
    "estimatedAssets": "$4M+",
    "relationship": "None — cold",
    "nextEvent": "1031 exchange — 38 days remaining on identification window",
    "outreachAngle": "1031 exchange + DST deployment before deadline"
  }
}
```

---

## Outreach Angle

> "Most real estate developers tell us their biggest challenge isn't finding deals — it's keeping what they make when the deal closes. We specialize in the tax and wealth coordination that happens at the transaction."

---

## Vera Research Ask

> Vera: Which metros are seeing the most commercial real estate transaction volume in 2026? Which asset classes (industrial, multifamily, retail) have the highest disposition pressure? Any 1031-exchange-specific market reports from this quarter?

---

## Output Location

`scripts/staging/alfred_batch_re_developers_YYYY-MM-DD.json`
