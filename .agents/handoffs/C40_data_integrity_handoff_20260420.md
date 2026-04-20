# AUM Engine — C40 Data Integrity Sprint Handoff
**Classification:** Operator-Internal | Action Required  
**Date:** 2026-04-20  
**Sprint:** C40 — Lead Legitimacy Audit & Registry Re-Sourcing  
**Prepared by:** Big Nate (Antigravity)  
**For:** Kosal Prum (Operator) + Vera (Perplexity — Review Agent)  
**Follows:** C39 Enrichment Sprint (Apollo Basic + PDL Pro fully live)  
**Live Platform:** https://theaumengine.web.app  
**Firebase Project:** `theaumengine`

---

## Executive Summary

A full legitimacy audit was run against all 1,015 leads in `master_leads`. The pipeline is **largely real** — 982 of 1,015 leads (96.7%) are sourced from verifiable public registries. However, **33 leads (3.2%) were fabricated by Alfred** and must be purged. Additionally, 560 leads carry only `source: "script"` with no registry ID stored — likely real but provenance is unverifiable without a backfill.

| Category | Count | % |
|---|---|---|
| ✅ Verified — named public registry | 422 | 41.6% |
| 🟡 Likely real — `source: "script"` (no ID stored) | 560 | 55.2% |
| 🔴 Fabricated — Alfred-generated | **33** | **3.2%** |
| **Total** | **1,015** | **100%** |

---

## Section 1 — Verified Legitimate Sources (422 leads)

These leads have named public registry sources. They are verifiably real people.

| Source Tag | Count | Niche | Registry |
|---|---|---|---|
| CMS NPI Registry — MN Physicians | 97 | physicians | Federal NPI database |
| CMS NPI Registry — TX Physicians | 50 | physicians | Federal NPI database |
| SBA FOIA 7(a) — MN Business Owners | 50 | business-owners | SBA loan database |
| CMS NPI — MN Dentists | 50 | dentists | Federal NPI database |
| HUD FHA Multifamily — RE Developers | 60 | re-developers | HUD property database |
| CMS NPI — FL Dentists | 30 | dentists | Federal NPI database |
| AmLaw/Martindale — MN Law Partners | 28 | law-partners | AmLaw 200 + Martindale-Hubbell |
| BBB MN Tradesman | 18 | high-earning-tradesman | Better Business Bureau |
| Maricopa County Probate | 19 | inheritance | Maricopa County courts |
| Spotrac — NFL/NBA/MLB/NHL Rosters | 20 | pro-athletes | Spotrac.com active contracts |

---

## Section 2 — The "script" Provenance Problem (560 leads)

**560 leads have `source: "script"`** with no registry ID stored. Spans 9 niches: charity-board-members, physicians, c-suite-executives, aircraft-owners, ai-displaced-executives, henrys, law-partners, re-developers, business-owners.

### Why they're likely still real
- **Aircraft owners** — FAA registry is a public CSV. Names and MN cities match real locations (Hector MN, Chisago City MN, Saint Cloud MN). Verifiable by FAA N-number but that ID wasn't stored.
- **C-suite executives** — SEC EDGAR insider filings. SEC CIK numbers appear embedded in company name strings (`Cik 0001189020`) — real federal identifiers. Data is real, formatting is messy.
- **HENRYs** — H-1B DOL filings. Company names stored as person names (`Goldman Sachs`) — real companies, person identity not extracted.

### Fix Required
Backfill registry IDs into Firestore schema for all `source: "script"` leads.

---

## Section 3 — Fabricated Leads — PURGE REQUIRED 🔴

**33 leads fabricated by Alfred. Zero backing public records. Must be deleted before any advisor outreach.**

### Yacht-Owners — ALL 30 leads fabricated
**Source tag:** `Alfred Wealth Trigger Miner`

Evidence of fabrication — company names follow AI-generated patterns:
- `[LastName] Capital Group`
- `[LastName] Holdings`
- `[LastName] Marine Holdings`
- `[LastName] Ventures Group`

Zero PDL matches, zero Apollo matches — these people do not exist in any database. No USCG vessel number stored. Real USCG vessel registration data is publicly available — Alfred didn't use it.

**Sample fabricated leads:**
```
Sandra Whitfield    | Whitfield Capital Group     | Fort Lauderdale, FL
David Bergstrom     | Bergstrom Manufacturing     | Annapolis, MD
Marcus Gillespie    | GillespieVentures Group     | Miami, FL
Michael Fontaine    | Fontaine Surgery Group      | Newport Beach, CA
William Hargrove    | Hargrove Marine Holdings    | Houston, TX
... and 25 more
```

### Other Alfred Leads — 3 individual fabrications
| Niche | Name | Company | Source |
|---|---|---|---|
| aircraft-owners | Michael Thornton | Thornton Holdings LLC | `alfred` |
| business-owners | Sandra Okafor | Merit Wealth Group | `alfred` |
| real-estate-investors | James Hargrove | Sunstate Realty Partners | `alfred` |

---

## Section 4 — Data Quality Issues (No Purge Needed)

### Issue 1 — Law Partners: Blank Person Names (28 leads)
Source legitimate (AmLaw/Martindale), but first/last name fields are empty. Firms captured, individuals not. Useless for outreach.

**Affected firms:** Maslon LLP, Taft Stettinius & Hollister, Fafinski Mark & Johnson (and others)  
**Fix:** Re-run law partner agent against each firm's website or Martindale for individual partner names.

### Issue 2 — HENRYs: Company Name Stored as Person Name (20 leads)
`Goldman Sachs`, `Microsoft` appearing in `firstName`/`lastName` fields. H-1B filing captured employer, not the H-1B worker.  
**Fix:** Re-run HENRY agent with individual petitioner name extraction from H-1B data.

### Issue 3 — Tradesmen: Same Issue (18 leads)
`Barr Plumbing LLC`, `Woodside Roofing & Siding Inc` stored as person names. BBB captured the business, not the owner.  
**Fix:** Enhance tradesman agent to extract registered owner/officer from BBB or state license records.

### Issue 4 — C-Suite: CIK Artifacts in Name Fields (284 leads)
`Soon-Shiong Patrick (Cik 0001189020)` — SEC CIK numbers pollute display names.  
**Fix:** Strip `(Cik XXXXXXXXXX)` pattern from all name fields; store `secCik` as dedicated schema field.

---

## Section 5 — C40 Sprint Action Plan

### Step 1 — PURGE (Requires Operator Approval) 🔴
```bash
node scripts/purge_alfred_fabricated.js --dry-run   # preview 33 leads
node scripts/purge_alfred_fabricated.js              # execute delete
```
**Result:** 1,015 → 982 leads. All remaining leads verifiably real or registry-sourced.

### Step 2 — RE-SOURCE Yacht Owners from USCG 🔴
**Registry:** USCG National Vessel Documentation Center (NVDC)  
**Data:** Public CSV — vessel name, owner name, hailing port, hull length, home state  
**Script to build:** `scripts/agent_uscg_miner.js`

Filter criteria:
- Hull length > 40 feet (HNW signal)
- Home state: MN, WI, IL, FL, TX, CA
- Individual owner (not LLC/Corp where possible)
- Cross-reference against HNW zip codes

USCG data fields to capture:
```
OFFICIAL_NUMBER     → store as registryId (unique USCG vessel ID)
VESSEL_NAME         → store as assetName
OWNER_FIRST_NAME    → firstName
OWNER_LAST_NAME     → lastName
OWNER_ADDRESS_CITY  → city
OWNER_ADDRESS_STATE → state
HULL_LENGTH_FEET    → wealthSignal
```

### Step 3 — BACKFILL Registry IDs (C40)
| Niche | Registry ID | Field Name |
|---|---|---|
| Physicians / Dentists | NPI Number | `npiNumber` |
| Aircraft owners | FAA N-Number | `faaRegistration` |
| C-suite executives | SEC CIK | `secCik` |
| Business owners | SBA Loan # | `sbaLoanNumber` |
| RE Developers | HUD FHA # | `hudFhaNumber` |
| Probate | Case Number | `probateCaseNumber` |
| Tradesmen | BBB Accreditation # | `bbbId` |

### Step 4 — Name Quality Fixes (C41, Lower Priority)
| Fix | Niche | Leads Affected |
|---|---|---|
| Re-scrape Martindale for partner names | law-partners | 28 |
| Re-run H-1B agent with petitioner extraction | henrys | 20 |
| Re-run BBB agent with owner extraction | high-earning-tradesman | 18 |
| Strip CIK from name fields | c-suite-executives | ~284 |

---

## Section 6 — Scripts Needed

| Script | Status | Purpose |
|---|---|---|
| `scripts/purge_alfred_fabricated.js` | 🔴 NEEDS BUILDING | Purge 33 fabricated leads + assignments |
| `scripts/agent_uscg_miner.js` | 🔴 NEEDS BUILDING | Source yacht owners from USCG NVDC |
| `scripts/fix_csuite_name_scrub.js` | 🔴 NEEDS BUILDING | Strip CIK artifacts from c-suite names |
| `scripts/backfill_registry_ids.js` | 🔴 NEEDS BUILDING | Add NPI/FAA/CIK IDs to schema |
| `scripts/agent_law_partner_names.js` | 🔴 NEEDS BUILDING | Resolve partner names (28 blank firms) |

---

## Section 7 — Post-C40 Expected State

| Metric | Today | After C40 |
|---|---|---|
| Total leads | 1,015 | ~982 (33 purged) + ~50 new USCG |
| Fabricated leads | 33 | **0** |
| 100% verified with registry ID | 41.6% | ~65% |
| Yacht owners | 0 real | ~40–60 USCG-verified |
| Law partner names resolved | 0/28 | 28/28 |

---

## Operator Decisions Required

> **Kosal — approve these two items to unblock Nate:**

| # | Decision | Recommendation |
|---|---|---|
| 1 | **APPROVE PURGE** — Delete 33 Alfred leads (1,015 → 982) | ✅ Approve — they're not real |
| 2 | **APPROVE USCG BUILD** — Build yacht agent + import 40–60 real leads | ✅ Approve — USCG data is free, public, verifiable |
| 3 | **DEFER name fixes** — HENRYs, tradesmen, law partners, c-suite scrub | 🟡 Defer to C41 — not blocking outreach |

---

## C39 Enrichment Results (For Reference — Completed This Session)

Both Apollo Basic ($59/mo) and PDL Pro ($98/mo) went live today.

| Field | Before C39 | After C39 |
|---|---|---|
| Emails | 1% (15) | **18% (187)** |
| Phones | 32% (328) | 32% (328) |
| LinkedIn | 3% (30) | **11% (113)** |
| Partial coverage | 35% | **45%** |
| Blank leads | 65% | **53%** |

**Best niche results:**
- Physicians: 39 emails + 236 phones (99% phone coverage)
- Dentists: 29 emails + 80 phones (100% phone coverage)
- Aircraft owners: 34 emails via PDL Pro (best HNW result)
- C-suite: 61 emails + 47 LinkedIn profiles

---

*Handoff prepared: 2026-04-20 | Sprint C40 | Big Nate (Antigravity)*  
*Next: Vera reviews → Kosal approves purge → Nate builds purge script + USCG miner*
