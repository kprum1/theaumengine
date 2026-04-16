---
name: agent_ai_displaced
nicheId: ai-displaced-executives
version: "1.0"
script: scripts/agent_warn_miner.js + scripts/agent_sec_miner.js --mode 8k
dataSource: DOL WARN Act (State portals) + SEC EDGAR Form 8-K (Free)
aum_floor: "$1M+"
---

# Agent: AI-Displaced Executives Lead Miner 🤖
**Niche:** AI-Displaced Executives (`ai-displaced-executives`)  
**Scripts:** `agent_warn_miner.js` + `agent_sec_miner.js --mode 8k`  
**Data sources:**  
- DOL WARN Act notices (15 state labor department portals — free, public)  
- SEC EDGAR Form 8-K Item 5.02 (executive departure filings — free, no key)  

---

## Run Commands

```bash
# DOL WARN Act — company-level layoff notices
node scripts/agent_warn_miner.js --states CA,TX,NY,WA,IL,FL --days 90

# SEC 8-K — named executive departures
node scripts/agent_sec_miner.js --mode 8k --days 60 --limit 50

# Both agents together (run sequentially)
node scripts/agent_warn_miner.js --states CA,TX,NY,WA && node scripts/agent_sec_miner.js --mode 8k
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Title** | Director, VP, SVP, C-Suite (CEO/CFO/CTO/COO) |
| **Sector** | Tech, Finance, Healthcare, Media, Telecom, Retail HQ |
| **Displacement type** | AI restructuring, mass layoff, company acquisition, voluntary exit with severance |
| **AUM floor** | $1M+ (equity + severance) |
| **Age range** | 38–58 |
| **Timing window** | 0–90 days post-separation (option window urgency) |

---

## WARN Act — How It Works

WARN Act requires companies with 100+ employees to file 60-day advance notice of mass layoffs. Filed with state labor departments. **100% public record.**

The agent fetches these filings. You then find the Director/VP-level employees at that company via LinkedIn who posted "Open to Work" or "Recently left."

```
WARN filing → Company identified → LinkedIn search → Executive names → Leads
```

---

## SEC 8-K — How It Works

Form 8-K Item 5.02: "Departure of Directors or Principal Officers" — companies must file within 4 business days of an executive departure. **Named in the filing.**

```
8-K filed → Executive name in filing text → Lead record created
```

> ⚠️ 8-K leads come with `needsNameResolution: true` — open the `sourceUrl`, read the filing, extract the executive name, update firstName/lastName.

---

## LinkedIn Research Step (After WARN Agent)

For each WARN company a lead produces:
```
LinkedIn search: site:linkedin.com/in + "[Company Name]" + "Director" OR "VP" + "Open to Work"
Filter: Current/recent tenure at company, title = Director or above
Signal: Profile shows "Open to Work" badge = active separation
```

---

## Red Flags — Disqualify

- ❌ Voluntarily moved to another senior role (not displaced — no urgency)
- ❌ Startup with no equity value (no assets to plan)
- ❌ Executives well below $200K total comp
- ❌ AI layoff more than 18 months ago (urgency expired)
- ❌ Already with known wealth advisor (LinkedIn bio mentions advisor firm)

---

## Required Output Fields

```json
{
  "firstName": "",
  "lastName": "",
  "title": "Displaced Executive — [Company Name]",
  "company": "Former: [Company Name]",
  "city": "",
  "state": "CA",
  "nicheId": "ai-displaced-executives",
  "estimatedAUM": "$2M–$8M",
  "source": "DOL WARN Act — CA State Labor Dept",
  "sourceUrl": "https://edd.ca.gov/en/jobs_and_training/layoff_services_warn/",
  "needsEnrichment": true,
  "needsNameResolution": true,
  "warnDate": "2026-03-15",
  "warnEmployees": 320,
  "reasonCodes": ["WARN Act filing — 320 employees", "Tech sector — executive displacement likely", "Research Director/VP on LinkedIn"]
}
```

---

## Outreach Angle

> "The 90-day option window after a separation is the most expensive 90 days of most executives' financial lives. We help people make those decisions with clarity instead of stress."

---

## State WARN Portals (Alfred: bookmark these)

| State | URL |
|---|---|
| CA | https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/ |
| TX | https://www.twc.texas.gov/news/warn-notices |
| NY | https://dol.ny.gov/warn-notices |
| WA | https://lni.wa.gov/about-l-i/warn-notices/ |
| IL | https://dceo.illinois.gov/workforcedevelopment/warn.htm |
| FL | https://floridajobs.org/office-directory/division-of-workforce-services/workforce-programs/warn-act |
| MA | https://www.mass.gov/lists/warn-act-layoff-notices |
| MN | https://mn.gov/deed/business/dislocated-workers/minnesota-warn-act-notices/ |

---

## Output Location

`scripts/staging/alfred_batch_warn_YYYY-MM-DD.json`  
`scripts/staging/alfred_batch_sec_8k_YYYY-MM-DD.json`
