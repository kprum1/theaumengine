---
name: agent_csuite
nicheId: csuite-executives
version: "1.0"
script: scripts/agent_sec_miner.js --mode form4,proxy
dataSource: SEC EDGAR Form 4 + DEF 14A (Free · No API key)
aum_floor: "$2M+"
---

# Agent: C-Suite Executives Lead Miner 👔
**Niche:** C-Suite Executives (`csuite-executives`)  
**Script:** `scripts/agent_sec_miner.js --mode form4` and `--mode proxy`  
**Data sources:** SEC EDGAR full-text search — Form 4 (insider stock sales) + DEF 14A proxy statements  

---

## Run Commands

```bash
# Form 4 insider sales (executives selling stock = liquidity event)
node scripts/agent_sec_miner.js --mode form4 --days 60 --limit 40

# DEF 14A proxy (named executives with disclosed compensation)
node scripts/agent_sec_miner.js --mode proxy --days 90 --limit 30

# Both modes
node scripts/agent_sec_miner.js --mode all --days 60
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Title** | CEO, CFO, COO, CTO, President, Division President |
| **Company size** | 100–10,000 employees (mid-market sweet spot) |
| **Comp range** | $500K–$5M+ total (disclosed in proxy) |
| **AUM floor** | $2M+ |
| **Age range** | 45–62 |
| **Equity** | Concentrated stock position, deferred comp, 10b5-1 plan |

---

## Three SEC Signals

### Signal 1 — Form 4 (Insider Stock Sale)
Executive sold company stock. Filed within 2 business days of transaction.  
**Why it matters:** Large disposition = wealth deployment moment. They just liquidated. Now they need a plan.

### Signal 2 — 8-K Item 5.02 (Departure)
Executive just left the company. Filed within 4 days.  
**Why it matters:** Severance + unvested equity + concentrated position = immediate planning need.

### Signal 3 — DEF 14A (Proxy Compensation Table)
Annual proxy discloses all Named Executive Officers and their total compensation.  
**Why it matters:** Pre-quality — confirms exec is worth reaching out to before any event.

---

## EDGAR Search URLs (Manual Research)

```
# Recent Form 4 insider sales:
https://efts.sec.gov/LATEST/search-index?q=%22disposition%22+%22Chief+Executive%22&forms=4&dateRange=custom&startdt=2026-01-01

# Recent C-Suite departures (8-K 5.02):
https://efts.sec.gov/LATEST/search-index?q=%225.02%22+%22departure%22+%22Chief%22&forms=8-K&dateRange=custom&startdt=2026-01-01

# Proxy compensation tables:
https://efts.sec.gov/LATEST/search-index?q=%22Named+Executive+Officers%22+%22Total+Compensation%22&forms=DEF+14A
```

---

## Red Flags — Disqualify

- ❌ VP-level at small company with no disclosed equity
- ❌ Executives with publicly filed advisor relationship conflicts
- ❌ Recent SEC enforcement actions or consent orders
- ❌ Executive at company with <$50M market cap (limited equity value)

---

## Name Resolution (Required for 8-K + Proxy Leads)

DEF 14A and 8-K leads come with `needsNameResolution: true`. Steps:
1. Open `sourceUrl` from the lead
2. For 8-K: find the executive name in Item 5.02 text
3. For DEF 14A: find the Summary Compensation Table — list all NEO names
4. Update `firstName` + `lastName` + `title` in the lead record
5. Then run Apollo enrichment

---

## Required Output Fields

```json
{
  "firstName": "James",
  "lastName": "Morrison",
  "title": "Former Chief Financial Officer — Acme Corp",
  "company": "Former: Acme Corp",
  "city": "",
  "state": "",
  "nicheId": "csuite-executives",
  "estimatedAUM": "$3M–$12M",
  "source": "SEC EDGAR Form 4",
  "sourceUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=acme&type=4",
  "needsEnrichment": true,
  "secFilingDate": "2026-04-01",
  "reasonCodes": ["Named insider — stock disposition Form 4", "C-Suite title confirmed in SEC filing", "Concentrated equity — wealth planning moment"]
}
```

---

## Outreach Angle

> "Executives leaving a public company or going through a PE exit often have 60–90 days to make decisions that affect 20+ years of wealth. We specialize in compressing that decision window into a clear, coordinated plan."

---

## Output Location

`scripts/staging/alfred_batch_sec_form4_YYYY-MM-DD.json`  
`scripts/staging/alfred_batch_sec_proxy_YYYY-MM-DD.json`
