# HANDOFF_C47.md — AUM Engine
**Sprint:** C47 — Enrichment Pipeline Audit + Domain Enrichment Prep  
**Date:** 2026-04-28  
**Session:** Antigravity  
**Status:** ⏸ Paused — Apollo credits exhausted, architecture decisions pending, next steps queued

---

## 🧭 Where We Are (Full Context)

This handoff carries forward from **C46**, which resolved the two critical API breaking changes:
1. Apollo auth model switched from body `api_key` → `X-Api-Key` header
2. Proxycurl (nubela.co/proxycurl) fully sunset (HTTP 410) — migrated to NinjaPear (`nubela.co/api/v1/employee/profile`)

**C47 did NOT run new enrichment** — Apollo credits remain exhausted. This session was architectural review and priority alignment.

---

## 📁 Codebase Snapshot

### Core Pipeline Files
| File | Size | Role |
|---|---|---|
| `scripts/smart_enrich_router.js` | **26 KB / 536 lines** | ⭐ Primary enrichment router — Apollo + PDL + NinjaPear logic |
| `scripts/agent_apollo_enrich.js` | 20 KB | Legacy single-platform Apollo enrichment |
| `scripts/agent_pdl_enrich.js` | 20 KB | Legacy single-platform PDL enrichment |
| `scripts/agent_pdl_linkedin_enrich.js` | 10 KB | PDL LinkedIn reverse-lookup enrichment |
| `scripts/agent_proxycurl_enrich.js` | 11 KB | NinjaPear wrapper (formerly Proxycurl) |
| `scripts/routing_engine.js` | 16 KB | Firestore lead routing logic |
| `scripts/lead_ingest_agent.js` | 9.3 KB | Alfred lead ingest pipeline |
| `scripts/bouncer_agent.js` | 12 KB | Lead quality review / rejection |
| `scripts/scrub_leads.js` | 13 KB | Name + data scrubbing |
| `scripts/patch_name_pollution.js` | **35 KB** | Largest file — CIK/SEC name cleanup |
| `scripts/enrichment_status_report.js` | 9.6 KB | Enrichment coverage reporting |
| `scripts/write_pipeline_meta.js` | 2.9 KB | Writes niche-level meta to Firestore |

### Config Files (DO NOT COMMIT)
| File | Contents |
|---|---|
| `scripts/config/apollo.json` | Apollo API key |
| `scripts/config/pdl.json` | PDL API key |
| `scripts/config/proxycurl.json` | NinjaPear API key |
| `scripts/serviceAccountKey.json` | Firebase Admin SDK key |

---

## 💳 Credit Status (CRITICAL — CHECK BEFORE RUNNING ANYTHING)

| Service | Status | Action Required |
|---|---|---|
| **Apollo** | ❌ **EXHAUSTED** | Check reset: https://app.apollo.io/#/settings/billing |
| **PDL** | ~270 / 387 remaining | Safe to use — conserve for high-signal leads only |
| **NinjaPear** | ✅ Available | Blocked — no `companyDomain` field on any leads; all calls return HTTP 400 |

> ⚠️ **Do NOT run `smart_enrich_router.js` against Apollo until credits reset.** The router will burn through all credits in one sweep. Always run `--dry-run` first after reset to confirm credit availability.

---

## 🔧 smart_enrich_router.js — Current Logic Map

### Routing Decision Tree (as of C46)
```
For each lead (filtered by --niche):
  1. Skip if already has email (_routerEnriched = true)
  2. APOLLO path:
     - Skip if physician/dentist AND no company field (0% hit rate, wastes credits)
     - Skip if re-developer (HUD property names ≠ firm names, 0% hit rate)
     - Call POST /v1/people/match with X-Api-Key header (C46 fix)
     - On success: write email + _routerPlatform="apollo" + _routerEnrichedAt
  3. PDL FALLTHROUGH (if Apollo misses):
     - Call PDL /v2/person/enrich
     - min_likelihood = 3 (filters out weak matches)
     - On success: write email + _routerPlatform="pdl"
  4. NINJAPEAR path:
     - Skip unless lead has companyDomain field (C46 fix)
     - Currently: NO leads have companyDomain → NinjaPear is fully disabled
```

### Key Flags
```bash
--niche <niche-id>     # e.g. physicians, law-partners, c-suite-executives
--limit <n>            # max leads to process (always use this!)
--dry-run              # preview without writing to Firestore
--skip-apollo          # PDL-only mode
--skip-pdl             # Apollo-only mode
```

### Verified Enrichment Hit Rates (C46 data)
| Niche | Apollo Hit Rate | PDL Hit Rate | Notes |
|---|---|---|---|
| `law-partners` | **36%** | ~10% | Best performing niche |
| `c-suite-executives` | 8% | 6% | Decent volume due to 284 total |
| `business-owners` | 6% | ~5% | Low hit rate, generic company names |
| `physicians` | **0%** (name-only) / ~36% (with company) | ~0% | Structural issue — see below |
| `re-developers` | **0%** | 0% | Structural issue — HUD property names |
| `dentists` | ~10% est. | ~5% | Not run this session |
| `henrys` | ~5% est. | ~2% | Volume play, 8,056 leads |

---

## 🩺 Structural Signal Issues (Unresolved)

### Issue 1: Physicians (948 Name-Only Records)
**Problem:** 948 of 1,188 physicians have only: `firstName + lastName + city + state`  
- No company, no LinkedIn, no email anchor  
- PDL `min_likelihood ≥ 3` never satisfied for common physician names  
- Apollo can't disambiguate "Jason Meyer" in Minneapolis with no employer  
- These leads DO have phone numbers from NPI → usable for cold call outreach today

**Resolution options:**
1. **PDL Personal Email add-on** (~$98/mo) → unlocks personal email lookup, ~10% hit = ~95 emails
2. **Batch NPI cross-reference** → match NPI practice group → get practice website domain → use as Apollo company anchor
3. **Accept as phone-only** — they already have the most important signal for advisor outreach

### Issue 2: Re-Developers (84 Leads, 0% Email Rate)
**Problem:** `company` field contains HUD FHA **property names**, not developer firm names  
Examples: `"Barry Manor"`, `"Reserve At Kanapaha II"`, `"Oakland Terrace Apartments"`  
- Apollo finds zero records for property names  
- NinjaPear needs a domain — property names have no website  

**Resolution options:**
1. **HUD FOIA cross-reference** — go back to the HUD FHA data, look up actual developer entity per property
2. **County assessor parcel lookup** — property address → LLC owner of record
3. **Manual LLC resolution** — for the 84 records, viable to do manually for high-value targets

### Issue 3: NinjaPear Blocked on All Leads
**Problem:** NinjaPear `/api/v1/employee/profile` requires `work_email` OR `first_name + employer_website`.  
- No lead record in Firestore has a `companyDomain` field  
- Passing company name strings (e.g. "Kaufman Realty") returns HTTP 400  
- NinjaPear is sitting idle, burning no credits, but also providing no value  

**Resolution:** Build `scripts/enrich_company_domains.js` (see P1 below)

---

## ⚡ Priority Queue (Next Session — Ordered)

### 🔴 P0 — Before Running Anything

1. **Verify Apollo credit reset**
   ```
   Open: https://app.apollo.io/#/settings/billing
   Check: billing cycle date + remaining credits
   ```

2. **Dry-run physicians with company first**
   ```bash
   node scripts/smart_enrich_router.js --niche physicians --limit 50 --dry-run
   ```
   Confirms router logic is healthy before spending credits.

3. **Re-run physicians with company** (190 leads with practice names)
   ```bash
   node scripts/smart_enrich_router.js --niche physicians --limit 190
   ```

4. **Re-run remaining law-partners** (12 unenriched)
   ```bash
   node scripts/smart_enrich_router.js --niche law-partners --limit 50
   ```

5. **Re-run dentists** (never fully swept)
   ```bash
   node scripts/smart_enrich_router.js --niche dentists --limit 179
   ```

---

### 🟡 P1 — Build Company Domain Enrichment

**Script to build:** `scripts/enrich_company_domains.js`

**Purpose:** Resolve `company` name string → `companyDomain` website domain, write back to Firestore. This unlocks NinjaPear and improves Apollo match confidence.

**Recommended approach:** Clearbit Autocomplete API (free, no auth required)
```
GET https://autocomplete.clearbit.com/v1/companies/suggest?query=Kaufman+Realty
→ Returns: [{ name: "Kaufman Realty", domain: "kaufmanrealty.com", ... }]
```

**Script logic:**
```
1. Query Firestore: leads where company != null AND companyDomain == null
2. For each lead: call Clearbit Autocomplete with company name
3. If confidence high (first result, name similarity > 80%): write companyDomain to lead doc
4. Log unresolved (especially re-developers — likely need manual lookup)
5. Output: summary of resolved vs unresolved by niche
```

**Priority niches for domain enrichment:**
| Niche | Leads Missing Domain | Expected Resolution Rate |
|---|---|---|
| `law-partners` | ~12 | ~90% (real firm names) |
| `business-owners` | ~51 | ~70% (mixed quality) |
| `c-suite-executives` | ~200 | ~60% (public companies easier) |
| `re-developers` | 84 | ~5% (HUD property names won't resolve) |

**After domain enrichment:** Re-run NinjaPear on resolved records:
```bash
node scripts/smart_enrich_router.js --niche law-partners --skip-apollo --skip-pdl
```
(NinjaPear will now have companyDomain to work with)

---

### 🟡 P1 — PDL Personal Email Upgrade Decision

| Question | Answer |
|---|---|
| Cost | ~$98/mo add-on on top of existing PDL Pro |
| Target leads | 948 physician name-only records |
| Expected yield | ~10% hit rate = ~95 new personal emails |
| ROI | If 1 physician converts to client → likely worth it |
| Dashboard | dashboard.peopledatalabs.com → Add-ons → Personal Email |

**If upgrading:** After upgrade, run:
```bash
node scripts/smart_enrich_router.js --niche physicians --skip-apollo --limit 948
```
PDL will now return personal emails for matched records.

---

### 🟢 P2 — Platform Polish (Non-Blocking)

| Task | Command / Notes |
|---|---|
| CIK name remnant cleanup | `node scripts/scrub_cik_names.js` |
| CSV export for advisor cockpit | UI feature — js/app.js |
| Sortable signal columns | UI feature — cohort view |
| Score resync after enrichment | Run after major enrichment sweeps |
| Back button in cohort view | UX fix — js/app.js |

---

## 📊 Pipeline State (As of C46 End — Unchanged This Session)

| Niche | Total Leads | Has Email | Has Phone | Has LinkedIn | Email Rate |
|---|---|---|---|---|---|
| `law-partners` | 34 | ~20 | ~28 | ~10 | **59%** |
| `business-owners` | 57 | ~9 | ~40 | ~15 | 16% |
| `c-suite-executives` | 284 | ~90 | ~210 | ~80 | 32% |
| `physicians` | 1,188 | ~50 | ~1,100 | ~14 | 4% |
| `re-developers` | 96 | ~12 | ~60 | ~5 | 13% |
| `dentists` | 179 | 30 | ~160 | ~8 | 17% |
| `henrys` | 8,056 | 27 | ~6,500 | ~200 | <1% |
| `aircraft-owners` | ~50 | ~15 | ~40 | ~5 | 30% |
| `pro-athletes` | ~30 | ~5 | ~25 | ~8 | 17% |
| `tradesman` | ~40 | ~8 | ~35 | ~3 | 20% |

**Total pipeline:** ~10,014 leads across all niches  
**Fully contactable** (email + phone): ~350 estimated

---

## 🗂 Git State

```
b4c049e (HEAD → main) docs: C46 handoff — Apollo header fix, NinjaPear migration, 22 leads enriched
c30093d fix: smart router — Apollo X-Api-Key header auth + NinjaPear endpoint migration
f2f933c (origin/main) docs: C45 handoff — name pollution patch, PDL LinkedIn enrichment, Smart Enrichment Router
8fe613f docs: C44 master handoff — Apollo full sweep (10K leads), cohort wiring fixes, enrichment segment bar
d58c986 feat: enrichment segment bar — filter cohort by Has Phone/Email/LinkedIn/Address/Home Value/Fully Contactable
```

> ⚠️ `b4c049e` and `c30093d` are local-only — not pushed to origin yet. Push when ready:
> ```bash
> git push origin main
> ```

---

## 🔑 Credentials Reference

| Service | Key Location | Key (partial) | Status |
|---|---|---|---|
| Apollo | `scripts/config/apollo.json` | `busq9FSq...` | ❌ EXHAUSTED — await monthly reset |
| PDL | `scripts/config/pdl.json` | Pro plan | ✅ ~270/387 credits remaining |
| NinjaPear | `scripts/config/proxycurl.json` | `31789238...` | ⚠️ Idle — no companyDomain on leads |
| Firebase Admin | `scripts/serviceAccountKey.json` | (full key) | ✅ Active |

---

## 📝 Open Architecture Decisions

### Decision 1: Company Domain Enrichment Strategy
- **Option A:** Clearbit Autocomplete (free, no key needed, best for real firms)
- **Option B:** Google Custom Search API (paid, more flexible, handles edge cases)
- **Recommendation:** Build with Clearbit first (free), fallback to Google for misses
- **Blocker for re-developers:** HUD property names will fail both — need separate LLC lookup

### Decision 2: Re-Developer LLC Resolution
- **Option A:** Go back to HUD FOIA data — cross-reference property → developer entity
- **Option B:** County assessor API — property address → LLC owner of record
- **Option C:** Manual resolution for top 20 high-value re-developer targets
- **Status:** Unresolved. 84 leads are data-dead until this is answered.

### Decision 3: Physician Email Strategy
- **Option A:** PDL Personal Email upgrade ($98/mo) → ~95 personal emails from 948 leads
- **Option B:** NPI practice group cross-reference → get practice domain → use as Apollo anchor
- **Option C:** Accept 948 as phone-only leads (already the most important outreach signal)
- **Status:** Business decision needed. Recommend Option C now, Option A in 30 days if ROI warrants.

### Decision 4: Apollo Plan Upgrade
- Current plan hits monthly ceiling after ~550 calls
- 22 law-partners + 54 business-owners + 140 c-suite = 216 calls → already at limit
- Consider upgrading if Apollo hit rates justify (law-partners at 36% is compelling)
- **Status:** Check plan tier at app.apollo.io/#/settings/billing

---

## 🚀 Start Next Session With

> *"Read HANDOFF_C47.md. First: check Apollo credit reset at app.apollo.io/#/settings/billing. If credits restored, run dry-run first: `node scripts/smart_enrich_router.js --niche physicians --limit 50 --dry-run`. Then re-run physicians (190 with company), law-partners (12 remaining), and dentists (full sweep). After enrichment, the P1 build is `scripts/enrich_company_domains.js` using Clearbit Autocomplete — this unlocks NinjaPear for law-partners and business-owners."*

---

*Handoff written: 2026-04-28 | Sprint: C47 | Session: Antigravity*
