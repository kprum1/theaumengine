---
name: agent_dentists
nicheId: dentists
version: "1.0"
script: scripts/agent_npi_miner.js --niche dentists
dataSource: CMS NPI Registry (Free · No API key)
aum_floor: "$500K+"
---

# Agent: Dentists & Specialists Lead Miner 🦷
**Niche:** Dentists & Specialists (`dentists`)  
**Script:** `scripts/agent_npi_miner.js --niche dentists`  
**Data source:** CMS NPI Registry — same as physicians agent, filtered for dental taxonomies

---

## Run Command

```bash
node scripts/agent_npi_miner.js --niche dentists --state FL --limit 50
node scripts/agent_npi_miner.js --niche dentists --limit 100
node scripts/agent_npi_miner.js --niche dentists --dry-run
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **License** | NPI-1 individual — DDS or DMD credential |
| **Specialty** | General practice, Orthodontics, Oral Surgery, Endodontics, Prosthodontics |
| **Practice type** | Solo owner or 1–3 location group — NOT employed at DSO |
| **AUM floor** | $500K+ |
| **Age range** | 42–60 |
| **DSO status** | Pre-acquisition (we want to reach them BEFORE the DSO call comes) |

---

## The DSO Signal (Critical Context)

Dental Service Organizations (DSOs) are aggressively acquiring private practices. The signal chain:
1. DSO acquires a practice in their area — **public news**
2. Adjacent practices get acquisition offers within 6–18 months
3. We reach the dentist BEFORE the offer to help them maximize the after-tax proceeds

**Source for DSO acquisition news:**
- DSO Journal: `https://www.dsojournal.com`
- Group Dentistry Now: `https://groupdentistrynow.com`
- Google Alerts: "dental practice acquisition [state]"

Use this to identify high-risk-of-acquisition geographies, then run NPI agent for those states.

---

## Taxonomy Codes Used

| Code | Specialty |
|---|---|
| `1223G0001X` | General Practice |
| `1223P0221X` | Orthodontics |
| `1223S0112X` | Oral & Maxillofacial Surgery |
| `1223E0200X` | Endodontics |
| `1223X0400X` | Prosthodontics |
| `1223P0300X` | Periodontics |

---

## Red Flags — Disqualify

- ❌ Already employed by a DSO (no equity stake — different profile)
- ❌ Dental hygienists or assistants (wrong income level)
- ❌ New grads with no practice ownership (under 3 years NPI)
- ❌ Multi-location chains with corporate structure (complex, different advisor profile)

---

## Required Output Fields

```json
{
  "firstName": "Sarah",
  "lastName": "Kowalski",
  "credential": "DDS",
  "title": "DDS — Orthodontics",
  "company": "Kowalski Orthodontics",
  "city": "Naples",
  "state": "FL",
  "phone": "(239) 555-0100",
  "nicheId": "dentists",
  "estimatedAUM": "$900K–$2.5M",
  "npi": "1234567890",
  "source": "CMS NPI Registry",
  "sourceUrl": "https://npiregistry.cms.hhs.gov/provider-view/1234567890",
  "needsEnrichment": true,
  "reasonCodes": ["NPI-registered Orthodontist", "Naples, FL — DSO-active market", "Solo practice ownership confirmed"]
}
```

---

## Outreach Angle

> "Dentists who go through a DSO buyout often leave 20–30% of the after-tax proceeds uncaptured because the financial plan wasn't in place before the letter of intent was signed. We work specifically with practice owners before that call comes."

---

## Vera Research Ask

> Vera: What are the top 5 most acquisitive DSOs in 2026? Which metro markets are seeing the most dental practice acquisitions? Pull the latest DSO Journal and Group Dentistry Now coverage.

---

## Output Location

`scripts/staging/alfred_batch_npi_dentists_YYYY-MM-DD.json`
