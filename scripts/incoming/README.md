# Alfred Drop Zone — Lead Files

**This folder is the ONLY place Alfred (OpenClaw) should drop lead JSON files.**

---

## Alfred: Drop files here in this exact format

```json
[
  {
    "firstName":   "Jane",
    "lastName":    "Smith",
    "title":       "CEO",
    "company":     "Smith Ventures",
    "city":        "Dallas",
    "state":       "TX",
    "niche":       "Business Owners",
    "fitScore":    88,
    "timingScore": 82,
    "estimatedAUM": "2.4M",
    "reasonCodes":  ["Business sale signal", "M&A trigger"],
    "signals": {
      "estimatedAssets": "$2.4M",
      "nextEvent":       "Sale closing Q3"
    },
    "linkedIn":    "https://linkedin.com/in/...",
    "email":       "jane@smith.com"
  }
]
```

## Rules for Alfred
- Files MUST be valid JSON (array of lead objects)
- One file per research batch (e.g., `mn_west_metro_2026-04-09.json`)
- No code, no scripts, no executables — data only
- Only include fields on the whitelist (see `review_alfred_leads.js`)
- Name the file descriptively: `[niche]-[location]-[date].json`

## What happens after you drop a file
1. Kos runs `node scripts/review_alfred_leads.js`
2. Every lead is validated, sanitized, and security-checked
3. A review report is generated in `scripts/staging/review_report_[date].md`
4. Kos reviews the report
5. If clean: `node scripts/approve_and_ingest.js --batch=[timestamp]`
6. Leads land in Firestore `masterLeads` with status `New`

**Nothing touches Firestore until Kos approves. This is intentional.**

---

## Valid Niche Values
- `Aircraft Owners`
- `Business Owners`
- `AI-Displaced Executives`
- `Charity Board Members`
- `Physicians` / `Physicians & Surgeons`
- `HENRYs`
- `Inheritance Recipients`
- `Law Partners`
- `C-Suite Executives`
- `High Earning Tradesman`
- `Yacht Owners`  ← NEW — USCG-documented vessels 40ft+

## Yacht Owners — Special Signal Fields
For Yacht Owner leads, include these in the `signals` object:
```json
"signals": {
  "vesselName":   "Lady Luck III",
  "vesselLength": "58ft",
  "vesselType":   "Motor Yacht",
  "hailingPort":  "Newport Beach, CA",
  "uscgDocNum":   "1234567",
  "estimatedAssets": "$3.5M+"
}
```
Data source: USCG National Vessel Documentation Center (mvr.uscg.mil) — public federal record.
