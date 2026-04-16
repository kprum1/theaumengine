---
name: agent_henrys
nicheId: henrys
version: "1.0"
script: Manual research — LinkedIn + tech news sources
dataSource: LinkedIn public profiles + RSU vesting calendars + tech company news
aum_floor: "$100K+ investable (AUM grows fast)"
---

# Agent: HENRYs Lead Miner 🚀
**Niche:** HENRYs — High Earner Not Rich Yet (`henrys`)  
**Data sources:** LinkedIn professional profiles, tech company RSU vest calendars, SEC S-1 filings  
**Why this niche:** $200K–$500K income with under $500K saved. The fastest-growing AUM niche if you catch them early.

---

## Sourcing Strategy

HENRYs are identified by **income proxy + life event** — not a government registry. The signals come from LinkedIn and company news.

### Source 1 — LinkedIn Search (Primary)

**Target companies:** FAANG + Big Tech + Biotech + Finance

```
Search string examples:
- "Senior Software Engineer" "Amazon" "Seattle" — 8-12 YOE range
- "Director of Product" "Meta" "Menlo Park"
- "Principal Scientist" "Pfizer" "New York"
- "VP" "Goldman Sachs" "5-10 years"
- "Associate Principal" "McKinsey" "Chicago"
```

**Title triggers by industry:**

| Industry | Titles | Income Proxy |
|---|---|---|
| Big Tech | Senior Engineer, Staff Engineer, Director | $250K–$500K |
| Biotech/Pharma | Principal Scientist, Sr Director | $200K–$400K |
| Finance | VP, Associate Principal, Director | $300K–$600K |
| Consulting | Principal, Manager (McKinsey/BCG/Bain) | $250K–$500K |
| Crypto/Web3 | Lead Developer, Protocol Engineer | $250K–$600K |

### Source 2 — IPO / RSU Cliff Events

When a company goes public or has a major vesting event:
- S-1 filings name top employees with equity stakes
- RSU cliff vest (4-year schedule) = first major taxable event = planning need

```
SEC S-1 search: https://efts.sec.gov/LATEST/search-index?forms=S-1&dateRange=custom&startdt=2025-01-01
```

### Source 3 — Tech Layoff Rebound

HENRYs who were just laid off from Big Tech with severance + unvested equity:
- They're job searching → visible on LinkedIn ("Open to Work")
- They have severance to deploy → immediate planning need
- Cross-reference with WARN notices from tech companies

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Income range** | $200K–$500K W-2 |
| **Investable assets** | Under $500K (they earn a lot, save a little) |
| **Age range** | 28–42 |
| **RSU status** | Has unvested equity or recent cliff vest |
| **Debt** | May have student loans + mortgage + car — cash-constrained despite income |
| **Advisor status** | Almost never has one (too busy, don't think they need it yet) |

---

## Trigger Events (High Timing Score)

- RSU cliff vest (4-year anniversary at company)
- IPO lock-up expiry (6 months post-IPO)
- Company acquisition (accelerated vesting)
- First home purchase (cash-constrained suddenly)
- Marriage or first child (new financial complexity)
- Promotion to Director or VP (income jump)

---

## Red Flags — Disqualify

- ❌ Income under $150K (too early for meaningful planning)
- ❌ No equity compensation (cash-only W-2 — wrong profile)
- ❌ Currently working with a financial advisor (RSU tax management visible on LinkedIn bio)
- ❌ Concentrated position already in a DAF (too sophisticated)

---

## Required Output Fields

```json
{
  "firstName": "Jordan",
  "lastName": "Park",
  "title": "Senior Software Engineer — Amazon Web Services",
  "company": "Amazon Web Services",
  "city": "Seattle",
  "state": "WA",
  "nicheId": "henrys",
  "estimatedAUM": "$280K",
  "source": "LinkedIn Public Profile + RSU vest calendar",
  "sourceUrl": "https://linkedin.com/in/jordan-park-aws",
  "needsEnrichment": true,
  "reasonCodes": [
    "Staff SWE at Amazon — estimated $310K total comp",
    "4-year cliff vest approaching Q3 2026",
    "No financial advisor on LinkedIn bio"
  ],
  "signals": {
    "estimatedAssets": "$280K",
    "relationship": "None — cold",
    "nextEvent": "RSU cliff vest — Q3 2026 (tax surprise incoming)",
    "outreachAngle": "First RSU vest + concentrated tech stock — help before April arrives"
  }
}
```

---

## Outreach Angle

> "For most high earners, the first RSU cliff vest is the moment they realize their W-2 taxes don't cover what they actually owe. We help people get ahead of that before it becomes a surprise in April."

---

## Output Location

`scripts/staging/alfred_batch_henrys_YYYY-MM-DD.json`
