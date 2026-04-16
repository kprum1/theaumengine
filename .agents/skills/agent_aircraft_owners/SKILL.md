---
name: agent_aircraft_owners
nicheId: aircraft-owners
version: "1.0"
script: scripts/agent_faa_miner.js
dataSource: FAA Aircraft Registry (Free · No API key)
aum_floor: "$1M+"
---

# Agent: Aircraft Owners Lead Miner ✈️
**Niche:** Aircraft Owners (`aircraft-owners`)  
**Script:** `scripts/agent_faa_miner.js`  
**Data source:** FAA Releasable Aircraft Database — 100% free, 350K records, updated monthly  

---

## What This Agent Does

Downloads the FAA bulk aircraft registry ZIP, parses `MASTER.txt` and `ACFTREF.txt`, filters for high-net-worth individual and LLC aircraft owners, and outputs a clean JSON batch to `scripts/staging/`.

---

## Run Command

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /path/to/theaumengine

# All states, 100 leads
node scripts/agent_faa_miner.js --limit 100

# Filter by state
node scripts/agent_faa_miner.js --state TX --limit 50

# Dry run (preview, no file written)
node scripts/agent_faa_miner.js --dry-run

# Skip FAA download (use cached /tmp/faa_aircraft/)
node scripts/agent_faa_miner.js --skip-download --limit 100
```

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **Owner type** | Individual (FAA type 1) or LLC (type 7) — not corporations or government |
| **Aircraft class** | Multi-engine, turbine, or rotorcraft — NOT student/recreational single-engine |
| **Manufacturer** | Beechcraft, Cessna Citation, Pilatus, Cirrus, Daher TBM, Bombardier, Gulfstream, Dassault, Embraer |
| **AUM proxy** | Turbine/jet owner = $500K–$5M+ net worth minimum |
| **Age range** | 48–68 (peak earning/wealth accumulation) |
| **Relationship** | No known advisor on record |

---

## Trigger Events (High Timing Score)

- New aircraft registration (recent registration date = liquidity event just occurred)
- Aircraft upgrade (traded up model = wealth growing)
- Pre-retirement age (62–68) + aircraft ownership = estate planning trigger
- Owner also cross-referenced as business owner (dual niche signal)

---

## Red Flags — Auto-Disqualify

- ❌ Commercial airline pilot (W-2, different financial profile)
- ❌ Flight school or charter operator fleet (corporate, not individual wealth)
- ❌ FAA registration type = Government (5) or Non-Citizen Corp (8)
- ❌ Single-engine piston only, low-value aircraft (<$100K estimate)
- ❌ Name parses as a company, not an individual

---

## Required Output Fields

Every lead MUST have these fields populated or flagged:

```json
{
  "firstName": "Dale",
  "lastName": "Hatcher",
  "city": "Minnetonka",
  "state": "MN",
  "niche": "Aircraft Owners",
  "nicheId": "aircraft-owners",
  "estimatedAUM": "$2.5M+",
  "nNumber": "N812DH",
  "aircraftModel": "Beechcraft King Air 350",
  "source": "FAA Aircraft Registry",
  "sourceUrl": "https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=812DH",
  "needsEnrichment": true,
  "reasonCodes": ["FAA-registered turbine aircraft owner", "Minnetonka, MN — verifiable public record"]
}
```

**Fields that are NOT acceptable:**
- `email: "name@example.com"` → must be blank + `needsEnrichment: true`
- `phone: "555-xxx-xxxx"` → must be blank + `needsEnrichment: true`
- `source: "Alfred Master AUM Miner"` → **batch rejected**

---

## Enrichment Step (After This Agent)

```bash
# Apollo enrichment adds real email + phone
node scripts/agent_apollo_enrich.js --file staging/alfred_batch_faa_YYYY-MM-DD.json
```

---

## Outreach Angle

> "Aviation-specific tax complexity — bonus depreciation, business use split, entity structure — rarely gets the advisor attention it deserves. We work specifically at that intersection."

---

## Verification Standard

Every lead must be openable in a browser:
```
https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt={N_NUMBER}
```
If you cannot verify the N-number at that URL, the lead is rejected.

---

## Output Location

`scripts/staging/alfred_batch_faa_YYYY-MM-DD.json`

Commit and push to `kprum1/theaumengine` — operator reviews before ingest.
