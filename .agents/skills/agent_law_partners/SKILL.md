---
name: agent_law_partners
nicheId: law-partners
version: "1.0"
script: Manual — State Bar Association directories
dataSource: State Bar member directories (Free · Public)
aum_floor: "$1M+"
---

# Agent: Law Partners Lead Miner ⚖️
**Niche:** Law Partners (`law-partners`)  
**Data sources:** State bar association member directories + Martindale-Hubbell + AmLaw rankings

---

## Primary Source — State Bar Directories

| State | URL |
|---|---|
| CA | https://apps.calbar.ca.gov/attorneys/ |
| NY | https://iapps.courts.state.ny.us/attorneyservices/ |
| TX | https://texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer |
| IL | https://iardc.org/lawyersearch.aspx |
| FL | https://www.floridabar.org/directories/find-mbr/ |
| GA | https://www.gabar.org/membersearchresults.cfm |
| OH | https://www.ohiobar.org/find-a-lawyer/ |
| NJ | https://www.njcourtsonline.com/Bar/ |

**Filter:**
- License status: Active
- Years admitted: Before 2010 (15+ years = senior enough for equity partnership)
- Cross-reference with LinkedIn to confirm title = "Partner" or "Equity Partner"
- Firm size: 5–200 attorneys (large enough to have equity, small enough to have real equity stakes)

---

## Secondary Source — Martindale-Hubbell

URL: `https://www.martindale.com/find-attorneys/`  
Filter: AV Preeminent rating (highest tier) + Partner role + 15+ years experience  
AV Preeminent = peer-recognized = established and successful = HNW signal

---

## Secondary Source — AmLaw 100/200 Partner Lists

AmLaw publishes annual rankings of law firms by revenue. The partner names at these firms are often publicly searchable:
- AmLaw 100: `https://www.law.com/americanlawyer/am-law-100/`
- Look for offices in your target metro — search "[Firm Name] [City] partners"

---

## The K-1 Complexity Signal

Law firm equity partners receive K-1 income (pass-through). This creates:
- Uneven annual income (no W-2 predictability)
- Estimated tax payment complexity
- Partnership capital account that grows/shrinks with firm performance
- Buyout obligation on retirement

Most attorneys are technically sophisticated but **financially underadvised** relative to their income because they don't prioritize it. The complexity is the hook.

---

## Trigger Events (High Timing Score)

- Law firm merger announcement (partner capital accounts are affected)
- Partnership interest buyout (new partners buying in = cash needed)
- Retirement announcement at 55+ age
- Large contingency case settlement (K-1 spike = unexpected asset)
- Firm dissolution or split
- AmLaw 100 firm losing a named partner (departure = planing need)

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Title** | Equity Partner, Senior Partner, Managing Partner |
| **Firm size** | 5–200 attorneys |
| **Years in practice** | 15+ (deep equity stake) |
| **AUM floor** | $1M+ |
| **Income type** | K-1 (pass-through) — not W-2 salary |
| **Age range** | 48–64 |

---

## Red Flags — Disqualify

- ❌ Associates (no equity, wrong timeframe)
- ❌ Solo practitioners under $500K revenue
- ❌ In-house counsel (W-2 only, no K-1 complexity)
- ❌ Public defenders or legal aid attorneys (income too low)
- ❌ Attorneys at big law firms who are already well-advised

---

## Required Output Fields

```json
{
  "firstName": "Thomas",
  "lastName": "Ashworth",
  "credential": "JD",
  "title": "Equity Partner — Ashworth & Reed LLP",
  "company": "Ashworth & Reed LLP",
  "city": "Houston",
  "state": "TX",
  "nicheId": "law-partners",
  "estimatedAUM": "$2.5M",
  "source": "Texas State Bar Directory + Martindale-Hubbell",
  "sourceUrl": "https://texasbar.com/...",
  "needsEnrichment": true,
  "reasonCodes": [
    "TX State Bar — active 22 years",
    "Martindale AV Preeminent rated",
    "Partner at 12-attorney firm — equity holder"
  ],
  "signals": {
    "estimatedAssets": "$2.5M",
    "relationship": "None — cold",
    "nextEvent": "Partner buyout — 36 months (age 60 retirement clause)",
    "outreachAngle": "K-1 complexity + partner capital account transition planning"
  }
}
```

---

## Outreach Angle

> "Law firm partners often have the most complex financial picture of any professional — uneven K-1 income, large equity accounts, and no time to coordinate it. We work specifically with partners at that inflection point."

---

## Output Location

`scripts/staging/alfred_batch_law_partners_YYYY-MM-DD.json`
