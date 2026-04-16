---
name: agent_physicians
nicheId: physicians
version: "1.0"
script: scripts/agent_npi_miner.js --niche physicians
dataSource: CMS NPI Registry (Free · No API key · 7M+ providers)
aum_floor: "$500K+"
---

# Agent: Physicians & Surgeons Lead Miner 👩‍⚕️
**Niche:** Physicians & Surgeons (`physicians`)  
**Script:** `scripts/agent_npi_miner.js --niche physicians`  
**Data source:** CMS National Provider Identifier (NPI) Registry — free federal API, no key required  

---

## Run Command

```bash
# Texas cardiologists + orthopedic surgeons (50 leads)
node scripts/agent_npi_miner.js --niche physicians --state TX --limit 50

# All states, all high-income specialties
node scripts/agent_npi_miner.js --niche physicians --limit 100

# Dry run
node scripts/agent_npi_miner.js --niche physicians --state FL --dry-run
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **License type** | NPI-1 (individual provider — not group) |
| **Specialty** | Cardiology, Orthopedics, Plastic Surgery, Anesthesiology, Radiology, Dermatology, Neurosurgery |
| **Practice type** | Solo or group private practice preferred; hospital-employed acceptable if income > $400K |
| **AUM floor** | $500K+ (early career) / $1M+ preferred |
| **Age range** | 42–60 |
| **Relationship** | No advisor visible on public record |

---

## Trigger Events (High Timing Score)

- Practice acquisition by hospital system (liquidity event)
- New NPI filing in last 90 days (moving to new market)
- Group merger or partnership buy-in
- Approaching retirement (55+)
- Divorce filing cross-referenced with NPI address

---

## Red Flags — Disqualify

- ❌ NPs, PAs, CRNAs — wrong income level
- ❌ Residents or fellows (NPI age proxy: <5 years post-license)
- ❌ Employed at large hospital system with no private equity
- ❌ Physicians with known active advisor (LinkedIn endorsements from advisors)
- ❌ Total compensation estimated <$350K

---

## High-Income Specialties (Priority Order)

1. Plastic Surgery — avg $576K income
2. Orthopedic Surgery — avg $559K
3. Cardiology — avg $509K
4. Anesthesiology — avg $445K
5. Dermatology — avg $412K
6. Radiology — avg $401K
7. Neurosurgery — avg $788K ← highest overall

---

## Required Output Fields

```json
{
  "firstName": "Cyrus",
  "lastName": "Abbaschian",
  "credential": "MD",
  "title": "MD — Orthopaedic Surgery",
  "city": "Plano",
  "state": "TX",
  "phone": "(972) 985-1072",
  "niche": "Physicians & Surgeons",
  "nicheId": "physicians",
  "estimatedAUM": "$2M–$6M",
  "npi": "1265662100",
  "source": "CMS NPI Registry",
  "sourceUrl": "https://npiregistry.cms.hhs.gov/provider-view/1265662100",
  "needsEnrichment": true,
  "reasonCodes": ["NPI-registered Orthopaedic Surgeon", "Plano, TX — practice location confirmed", "Office phone on record"]
}
```

---

## Verification Standard

Open the `sourceUrl` in a browser — it must resolve to a real NPI record at `npiregistry.cms.hhs.gov`. If it returns "provider not found" the lead is rejected.

---

## Outreach Angle

> "Physicians tell us their biggest regret is not having a coordinated financial plan before the practice sale or exit. We work exclusively at the intersection of medical income complexity and long-term wealth strategy."

---

## Output Location

`scripts/staging/alfred_batch_npi_physicians_YYYY-MM-DD.json`
