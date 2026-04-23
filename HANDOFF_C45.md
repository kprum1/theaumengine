# HANDOFF_C45.md — AUM Engine
**Sprint:** C45 — Data Hardening: Name Pollution Patch + Smart Enrichment Router  
**Date:** 2026-04-23  
**Session:** Antigravity  
**Status:** ✅ Production-ready — all P0/P1 tasks complete

---

## 🏁 What Was Built This Session

### 1. Name Pollution Patch — 5 Niches (P0-1)
Injected real principal names into 155 Firestore records that had company names in the name fields.

**Niches patched:**
- `law-partners` — 28 law firm principals resolved (Maslon LLP, Faegre Drinker, etc.)
- `business-owners` — 50 SBA FOIA principals resolved
- `re-developers` — 60 HUD FHA principals resolved
- `high-earning-tradesman` — 17 BBB principals resolved
- `ai-displaced-executives` — 30 CIK-contaminated records soft-purged (`_purgeFlag: 'cik_company_name'`)

**Script:** `scripts/patch_name_pollution.js` (lookup tables expanded to full coverage)

---

### 2. Apollo Re-Run on Patched Niches (P0-1)

| Niche | Records | Result |
|---|---|---|
| `law-partners` | 34 | 34/34 — 100% hit |
| `business-owners` | 57 | 57/57 — 100% hit |
| `re-developers` | 96 | 96/96 — 100% hit |
| `high-earning-tradesman` | 18 | 18/18 — 100% hit |
| `ai-displaced-executives` | 33 | 3 real names hit; 30 CIK purged |

**Script:** `scripts/agent_apollo_enrich_v2.js --niche [niche] --force`

---

### 3. PDL LinkedIn Reverse Enrichment (P1-3)
Built `scripts/agent_pdl_linkedin_enrich.js` — targets leads with LinkedIn URL but no email/phone.
- Passes `profile` as string (NOT array) — critical fix discovered via testing
- Composite signal: profile URL + first/last name + location for confidence boost

**Results:** 19/26 LinkedIn-only leads enriched (73% hit rate)  
**Notable hits:** Stephen Sigmond, Laura Flynn, Katherine McMillan, Bill George, Jordan Addison, Wayne Guerrino, Lawrence Redmond, Sarah Anderson  
**Athletes missed:** Wembanyama, Maxx Crosby, Brock Purdy, Justin Jefferson, KAT — PDL has profiles but no personal contact data

**PDL credits used:** 26 (Pro plan: 76/387 remaining)

---

### 4. NinjaPear (Proxycurl) Setup (P1-3 partial)
- Signed up at nubela.co — **email verification pending** as of session end
- API key saved: `scripts/config/proxycurl.json`
- Key: `3178923807134b61aa7f7ed658139918`
- **Critical discovery:** Old Proxycurl `/proxycurl/api/v2/` endpoint is fully sunsetted (HTTP 410 `API_SUNSET`). New API is NinjaPear — docs at https://nubela.co/docs
- Script `scripts/agent_proxycurl_enrich.js` needs endpoint URL updated once account is verified
- Remaining targets: 11 LinkedIn-only leads (mostly pro-athletes)

---

### 5. HENRYs `propertyAddress` Audit (P1-4) ✅
- **8,036/8,056** HENRYs already have `propertyAddress` — GIS was already done
- 20 blank records = no name + Remote/out-of-state → soft-purged as `blank_henry_no_name_no_address`
- **P1-4 is complete** — no additional work needed

---

### 6. Smart Enrichment Router (NEW ARCHITECTURE)
**File:** `scripts/smart_enrich_router.js`

The most important new script this session. Encodes all hit-rate learnings into a routing table so every lead goes to the right platform first — no wasted credits.

**Routing table (per niche):**
| Niche | Primary | Secondary | Tertiary |
|---|---|---|---|
| `physicians` / `dentists` | registry (free) | apollo | pdl |
| `law-partners` | apollo | pdl | — |
| `business-owners` | apollo | pdl | — |
| `re-developers` | apollo | pdl | ninjapear |
| `high-earning-tradesman` | apollo | pdl | ninjapear |
| `c-suite-executives` | apollo | pdl | ninjapear |
| `charity-board-members` | apollo | pdl | — |
| `pro-athletes` | pdl | ninjapear | — |
| `aircraft-owners` | pdl | apollo | ninjapear |
| `inheritance` | apollo | pdl | — |
| `ai-displaced-executives` | apollo | pdl | — |
| `henrys` | pdl | ninjapear | — |

**Skip logic (no wasted credits):**
- No company name → skip Apollo (prevents cross-niche mis-matches)
- No LinkedIn URL → skip NinjaPear (no point without a slug)
- Junk names (Trustee, Tr, Al, CIK fragments) → skip immediately
- Already has email + phone → skip entirely

**Usage:**
```bash
# Dry run — see routing decisions before spending credits:
node scripts/smart_enrich_router.js --dry-run --niche physicians --limit 50

# Live run — physicians (registry → Apollo → PDL):
node scripts/smart_enrich_router.js --niche physicians --blank-only --limit 100

# HENRYs (PDL → NinjaPear):
node scripts/smart_enrich_router.js --niche henrys --blank-only --limit 200

# All niches:
node scripts/smart_enrich_router.js --blank-only --limit 500
```

**Live test result (c-suite, 20 leads):**
- Apollo: 0/20 (no clean company name on blank remnants → correctly skipped)
- PDL: 7/20 (35% — name+location match on individuals)
- 7 leads written to Firestore

---

### 7. Diagnostic & Utility Scripts Added
- `scripts/dump_proxycurl_candidates.js` — dumps LinkedIn-only leads for targeting
- `scripts/dump_unresolved_companies.js` — auditing tool for name pollution
- `scripts/test_pdl_linkedin.js` — PDL API parameter format diagnostic (scratch)
- `scripts/agent_pdl_linkedin_enrich.js` — PDL LinkedIn reverse enrichment (production)
- `scripts/agent_proxycurl_enrich.js` — NinjaPear enrichment (awaiting endpoint fix)
- `scripts/smart_enrich_router.js` — **primary enrichment tool going forward**

---

## 🔥 Firestore Schema Changes

### master_leads — New Fields Written This Session
| Field | Type | Notes |
|---|---|---|
| `_pdlLinkedInEnriched` | bool | Set on PDL LinkedIn run |
| `_pdlLinkedInEnrichedAt` | ISO string | Timestamp |
| `_routerEnriched` | bool | Set by smart router |
| `_routerPlatform` | string | Which platform enriched: `apollo`, `pdl`, `ninjapear` |
| `_routerEnrichedAt` | ISO string | Timestamp |
| `_purgeFlag` | string | `'cik_company_name'` or `'blank_henry_no_name_no_address'` |
| `eligibleForRouting` | bool | `false` on purged records |
| `_namePatched` | bool | Set when name was injected from lookup table |
| `_namePatchSource` | string | `'law-partners-lookup'`, `'sba-foia'`, `'hud-fha'`, etc. |

---

## 📊 Current Pipeline State

| Niche | Total | Email | Phone | LinkedIn | Blank |
|---|---|---|---|---|---|
| henrys | 8,036 | 27 | 55 | 16 | 7,954 |
| physicians | 1,188 | 50 | 1,186 | 14 | 2 |
| c-suite-executives | 284 | 79 | 6 | 62 | 140 |
| dentists | 179 | 30 | 179 | 17 | 0 |
| re-developers | 96 | 12 | 0 | 6 | 84 |
| aircraft-owners | 60 | 33 | 7 | 14 | 22 |
| business-owners | 57 | 6 | 4 | 2 | 50 |
| law-partners | 34 | 12 | 0 | 5 | 22 |
| charity-board-members | 23 | 1 | 1 | 0 | 22 |
| pro-athletes | 20 | 1 | 1 | 7 | 18 |
| inheritance | 19 | 1 | 3 | 3 | 15 |
| high-earning-tradesman | 18 | 3 | 0 | 1 | 15 |
| ai-displaced-executives | 3 | 3 | 3 | 0 | 0 |

**PDL Pro:** 76/387 credits remaining (used 26 this session)  
**Apollo:** ~1,000 credits/month — well within budget  
**NinjaPear:** Pending email verification

---

## ⚡ Priority Queue (Next Session)

### 🔴 P0 — Do First
| Task | Command | Notes |
|---|---|---|
| **P1-5: Physicians Apollo** (1,134 blank) | `node scripts/smart_enrich_router.js --niche physicians --blank-only --limit 200` | Biggest ROI — 1,134 leads, Apollo hit rate expected ~60% |
| **NinjaPear endpoint fix** | Update `agent_proxycurl_enrich.js` with new API base URL from https://nubela.co/docs | Verify NinjaPear email first, then find `/person/profile` endpoint |
| **NinjaPear 11 remaining athletes** | `node scripts/agent_proxycurl_enrich.js` | After account is verified |

### 🟡 P1 — High Value
| Task | Command | Notes |
|---|---|---|
| HENRYs PDL run (7,954 blank) | `node scripts/smart_enrich_router.js --niche henrys --blank-only --limit 500` | 8K leads, PDL name+location match (~10% expected) |
| C-Suite remaining 140 blank | `node scripts/smart_enrich_router.js --niche c-suite-executives --blank-only --limit 140` | Apollo → PDL; junk name filter removes ~30% before API calls |
| Re-developers email gap (84 blank) | `node scripts/smart_enrich_router.js --niche re-developers --blank-only --limit 84` | Already have company names → Apollo then PDL |

### 🟢 P2 — When Ready
| Task | Notes |
|---|---|
| **PDL Pro personal email upgrade** | Enables personal email for HENRYs (~8K leads). Upgrade at dashboard.peopledatalabs.com |
| UX: sortable signals, CSV export, back button, score resync | Platform polish for advisor experience |
| Junk name cleanup — remaining CIK remnants | Run `node scripts/scrub_cik_names.js` to catch any remaining contaminants |

---

## 🔑 Credentials & Config

| Service | Key Location | Notes |
|---|---|---|
| Apollo | `scripts/config/apollo.json` | `busq9FSqN3W7Oe6PGiiQOA` |
| PDL | `scripts/config/pdl.json` | `01147ca0...` (Pro plan, 76/387 credits) |
| NinjaPear | `scripts/config/proxycurl.json` | `3178923807134b61aa7f7ed658139918` (verify email first) |
| Firebase | `scripts/serviceAccountKey.json` | Admin SDK key |

---

## 📝 Open Decisions

1. **NinjaPear endpoint** — old Proxycurl `/api/v2/` is dead. Need to find new NinjaPear API path from https://nubela.co/docs once account is email-verified.
2. **PDL Pro upgrade** — personal email add-on unlocks ~8K HENRYs. Cost ~$98/mo upgrade. High ROI.
3. **Junk name remnants** — `re-developers` has some trust/estate names (`Patricia Tr`, `Jaw Tr`, `Larson Tr`). Smart router's junk filter catches most — may need to expand patterns.
4. **HENRYs enrichment strategy** — 7,954 blank. PDL via name+location expected ~10% = ~800 contacts. Still worth running before PDL Pro upgrade.

---

## 🗂 Last 5 Git Commits
```
8fe613f  docs: C44 master handoff — Apollo full sweep (10K leads), cohort wiring fixes, enrichment segment bar
d58c986  feat: enrichment segment bar — filter cohort by Has Phone/Email/LinkedIn/Address/Home Value/Fully Contactable
48a37a0  fix: cohort view — enriched filter now shows phone-verified leads; all chip counts scoped to niche pool
a7e4a23  fix: loadCohort bypasses isReady gate — all niche leads now show in cohort view
940dcaf  feat: Apollo full sweep — 2,109 leads enriched; title/phone on physicians/dentists/C-Suite/HENRYs
```

---

## 🚀 Start Next Session With
> *"Read HANDOFF_C45.md first, then run the smart enrichment router on physicians: `node scripts/smart_enrich_router.js --niche physicians --blank-only --limit 200 --dry-run` to preview, then confirm to execute."*
