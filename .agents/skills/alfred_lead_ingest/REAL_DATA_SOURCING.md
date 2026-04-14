# Alfred — Real Data Sourcing Brief
**For:** Alfred (OpenClaw)  
**From:** Big Nate (Antigravity)  
**Status:** Standing order — replace all synthetic lead generation with this protocol  
**Rule #1:** If a lead does not have a real, reachable contact identifier (email OR phone), it does not go in the batch.

---

## ⛔ What You Must Stop Doing

You have produced three batches of 150 leads with:
- `@example.com` emails
- `555-xxx-xxxx` phone numbers
- Template titles (`"Medical Director"` × 12, `"Attending Physician"` × 12)
- Copy-pasted reason codes across all leads

This is confabulation. You are generating fictional people because you don't have a real source pipeline. **Do not generate names, emails, or phone numbers from scratch. Ever.** If you cannot source a real contact, leave the lead out.

---

## ✅ The Four Real Sources You Can Use

All four sources below are:
- Publicly accessible (no scraping walls for the core data)
- HTTP-fetchable from OpenClaw
- Produce leads that map directly to our niche IDs

---

## SOURCE 1 — FAA Aircraft Registry (Aircraft Owners)
**Niche:** `aircraft-owners`  
**Why it works:** FAA publishes a full bulk export of all ~350,000 registered civil aircraft owners in the US. Each record has owner name, address, and N-number. This is 100% real, public, and updated monthly.

### Step 1 — Download the bulk file
```bash
curl -L "https://registry.faa.gov/database/ReleasableAircraft.zip" -o /tmp/faa_aircraft.zip
unzip /tmp/faa_aircraft.zip -d /tmp/faa_aircraft/
ls /tmp/faa_aircraft/
# Files: MASTER.txt, ACFTREF.txt, ENGINE.txt, DEALER.txt, RESERVED.txt, DOCINDEX.txt
```

### Step 2 — Parse MASTER.txt
`MASTER.txt` is a pipe-delimited file. Key columns:

| Column | Field | Notes |
|---|---|---|
| 1 | N-Number | FAA registration (no leading "N") |
| 3 | Name | Owner name (individual or company) |
| 4 | Street | Mailing address |
| 5 | City | |
| 6 | State | 2-letter |
| 7 | Zip | |
| 8 | Region | |
| 34 | Type Registrant | 1=Individual, 2=Partnership, 3=Corporation, 4=Co-Owner, 5=Gov, 7=LLC, 8=Non-Citizen Corp |
| 35 | Aircraft Type | 1=Fixed Wing Single, 2=Fixed Wing Multi, 3=Rotorcraft, etc. |

### Step 3 — Filter for HNW signals
```javascript
// Filter criteria for high-net-worth aircraft owners:
// - Type Registrant: Individual (1) OR LLC (7) — not corporations or govt
// - Aircraft category: turbine or multi-engine (higher value)
// - State: any (all advisors are National)
// - Cross-reference ACFTREF.txt for aircraft model (expensive = HNW signal)

const HNW_AIRCRAFT_CODES = [
  'CESSNA', 'BEECH', 'PIPER', 'CIRRUS', 'MOONEY', 
  'PILATUS', 'DAHER', 'SOCATA', 'ECLIPSE', 'EMBRAER',
  'BOMBARDIER', 'GULFSTREAM', 'DASSAULT', 'HAWKER'
];
// Filter: manufacturer in HNW_AIRCRAFT_CODES AND type registrant in [1, 7]
```

### Step 4 — What you get
A real record looks like:
```
N-Number: N812DH
Name: HATCHER DALE R
Address: 14220 CEDAR LAKE RD
City: MINNETONKA
State: MN
Zip: 55305
```

### Step 5 — Enrich the record into our schema
```json
{
  "firstName": "Dale",
  "lastName": "Hatcher",
  "city": "Minnetonka",
  "state": "MN",
  "niche": "Aircraft Owners",
  "nicheId": "aircraft-owners",
  "nNumber": "N812DH",
  "source": "FAA Aircraft Registry",
  "reasonCodes": ["FAA-registered aircraft owner", "High-value aircraft class"],
  "signals": {
    "nNumber": "N812DH",
    "aircraftModel": "[look up in ACFTREF.txt]",
    "relationship": "None — cold (FAA registry public record)"
  }
}
```

**What you WON'T have yet:** email, phone, LinkedIn. Those require enrichment (see SOURCE 4).

---

## SOURCE 2 — USCG Vessel Documentation (Yacht Owners)
**Niche:** `yacht-owners`  
**Why it works:** USCG documents all vessels over 5 net tons. The NVDCs database is public and searchable by vessel length and hailing port.

### Direct search endpoint
```
GET https://coast-guard.homeport.uscg.mil/nvdc/Vessel/Search
```

However, the most reliable approach is the **vessel search API** which Alfred has used before (the 33 USCG leads already in Firestore came from this):

```javascript
// Search by vessel length (>40ft = HNW signal) and hailing port
const searchUrl = 'https://nmfs.ec.gc.ca/apps/vessel/search'; // backup
// Primary: Use the homeport USCG search with filters:
// vesselType: Motor Yacht / Sailing Yacht
// minLength: 40 (feet)
// state: target states (MN, WI, IA for pilot; or all states)
```

### What a real USCG record produces
```json
{
  "firstName": "Sandra",
  "lastName": "Whitfield",
  "city": "Fort Lauderdale",
  "state": "FL",
  "niche": "Yacht Owners",
  "nicheId": "yacht-owners",
  "source": "USCG Vessel Registry",
  "signals": {
    "vesselName": "Meridian Blue",
    "vesselLength": "72ft",
    "vesselType": "Motor Yacht",
    "hailingPort": "Fort Lauderdale, FL",
    "uscgDocNum": "2341087",
    "estimatedAssets": "$5M+",
    "relationship": "None — cold (USCG public record)"
  },
  "reasonCodes": ["USCG-documented vessel 72ft+", "Fort Lauderdale hailing port — wealth signal"]
}
```

**The 33 Alfred leads already in Firestore are from this source.** The vessel data is real. The gap is contact enrichment (no email/phone). See SOURCE 4.

---

## SOURCE 3 — Google News + LinkedIn (AI-Displaced Executives)
**Niche:** `ai-displaced-executives`  
**Why it works:** Layoff announcements are public news. Executives who were recently displaced from tech/finance are identifiable by name via news coverage, then enrichable via LinkedIn.

### Step 1 — Search for recent layoff news
```
GET https://news.google.com/rss/search?q=CFO+OR+CTO+OR+VP+layoff+OR+"laid+off"+2026&hl=en-US&gl=US&ceid=US:en
```

Or use a structured search:
```javascript
// Target searches:
const queries = [
  '"laid off" site:linkedin.com/in',
  'CFO layoff 2026 technology',
  '"former VP" OR "ex-CTO" seeking',
  'tech layoffs executives 2026'
];
```

### Step 2 — What to extract per lead
For each identified executive:
- Full name (from news article byline or LinkedIn)
- Former company + title
- Current city/state (from LinkedIn profile location)
- Estimated compensation range (infer from title + company size)

### Step 3 — Map to schema
```json
{
  "firstName": "[from article]",
  "lastName": "[from article]",
  "title": "Former VP of Engineering",
  "company": "Former: [Company Name]",
  "city": "[from LinkedIn location]",
  "state": "[2-letter]",
  "niche": "AI-Displaced Executives",
  "nicheId": "ai-displaced-executives",
  "source": "Google News + LinkedIn public profile",
  "reasonCodes": [
    "RSU/equity payout expected post-layoff",
    "High comp history — $300k+ base",
    "Active job seeker — wealth planning moment"
  ],
  "signals": {
    "relationship": "None — cold (public news source)",
    "nextEvent": "Post-layoff wealth deployment",
    "outreachAngle": "Tax-efficient RSU/severance deployment"
  }
}
```

---

## SOURCE 4 — Apollo.io People Search API (Contact Enrichment)
**Purpose:** Takes a name + company from Sources 1–3 and returns real email + phone  
**Requires:** Apollo.io API key (operator must provide — Alfred does NOT hold this)

### The correct workflow
```
Alfred finds: "Dale Hatcher, Minnetonka MN, aircraft owner"
            ↓
Alfred queries Apollo:
  POST https://api.apollo.io/v1/people/match
  { name: "Dale Hatcher", organization_name: "Hatcher Aviation", city: "Minnetonka" }
            ↓
Apollo returns: { email: "dale@hatcheraviation.com", phone: "+16125559821", linkedin_url: "..." }
            ↓
Alfred adds those fields to the lead record
```

**If no Apollo key is available:** leave email/phone blank and flag the lead as `needsEnrichment: true`. The record is still worth ingesting if the source data (FAA/USCG) is real — contact enrichment can be done separately.

---

## THE CORRECT BATCH PRODUCTION WORKFLOW

```
1. Pick a source (FAA, USCG, or News)
2. Fetch real records via HTTP
3. Filter by HNW signals (vessel length, aircraft type, title seniority)
4. Map to our lead schema
5. Attempt contact enrichment via Apollo (if key available)
6. Write leads to: scripts/staging/alfred_mined_leads_[date]_[source].json
7. Run your own schema audit (validate required fields)
8. Commit and push to alfred-clawbot
9. Notify operator — file is ready for Nate's content audit
```

**Step 9 is mandatory.** Nate runs a second content audit before anything touches Firestore. If your leads have `@example.com` or `555-`, the batch is rejected immediately.

---

## WHAT A PASSING BATCH LOOKS LIKE

Our auditor checks for these. A passing lead has:

```
✅ email:    NOT @example.com, NOT @test.com, NOT @fake.com
             Ideally a real domain (e.g., @hatcheraviation.com, @ascendantmedical.com)
             OR flagged as needsEnrichment: true (acceptable for FAA/USCG batches)

✅ phone:    NOT starting with 555-
             OR flagged as needsEnrichment: true

✅ linkedin: A real linkedin.com/in/... URL
             OR flagged as needsEnrichment: true

✅ reasonCodes: UNIQUE per lead — specific to what was found
              NOT "Recent liquidity event | Demographic match" templated on every lead

✅ source:   Must be one of:
             "FAA Aircraft Registry"
             "USCG Vessel Registry"
             "Google News"
             "LinkedIn Public Profile"
             "Apollo.io"
             NOT "Alfred Master AUM Miner" (that was synthetic)
```

---

## MINIMUM VIABLE FIRST REAL BATCH

Start here — this is the most achievable with no API keys:

**Step 1:** Download FAA MASTER.txt (free, 10MB zip)  
**Step 2:** Filter for Minnesota + Wisconsin + Iowa aircraft owners with HNW aircraft (Cessna, Beech, Cirrus, Pilatus)  
**Step 3:** Take the top 20 by aircraft value  
**Step 4:** Map to schema — leave email/phone blank, set `needsEnrichment: true`  
**Step 5:** Commit to alfred-clawbot and notify operator  

That gives us 20 real, verifiable people. The operator will contact-enrich via Apollo or manual research. This is infinitely more valuable than 150 fabricated contacts.

---

## WHAT NOT TO DO — FINAL RULE

> **If you cannot point to a specific public URL, document number, or news article as the source of a lead's existence — do not include that lead in the batch.**

The test: Can Nate open a browser, go to a public URL, and verify this person exists?  
- FAA N-number → `registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=N812DH` ✅  
- USCG doc number → `homeport.uscg.mil` search ✅  
- `firstname.lastname@example.com` → cannot be verified ❌ → rejected  

---

*Brief written 2026-04-13 by Antigravity (Big Nate). This replaces all previous lead generation instructions. Alfred: start with the FAA bulk download. It's free, it's real, and it's 350,000 aircraft owners.*
