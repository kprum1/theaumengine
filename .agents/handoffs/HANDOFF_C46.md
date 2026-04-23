# HANDOFF_C46.md — AUM Engine
**Sprint:** C46 — API Auth Hardening + Smart Router Stabilization  
**Date:** 2026-04-23  
**Session:** Antigravity  
**Status:** ✅ Router stabilized — Apollo credits exhausted, PDL intact

---

## 🏁 What Was Built This Session

### 1. Apollo Auth Breaking Change — FIXED (Critical)
**Root cause:** Apollo changed their API auth model — `api_key` in request body is now rejected with `422 INVALID_API_KEY_LOCATION`. Key must now be passed as `X-Api-Key` header.

**Before (broken):**
```json
{ "api_key": "busq9FSqN3W7Oe6PGiiQOA", "first_name": "...", ... }
```
**After (fixed):**
```http
POST /v1/people/match
X-Api-Key: busq9FSqN3W7Oe6PGiiQOA
```
Also removed `reveal_phone_number: true` from body — this parameter requires `webhook_url` (async delivery) and causes HTTP 400. Phone enrichment for physicians/dentists comes from NPI anyway.

**File patched:** `scripts/smart_enrich_router.js` (callApollo function)

---

### 2. Proxycurl → NinjaPear Endpoint Migration (Stabilized But Blocked)
**Root cause:** `nubela.co/proxycurl/api/v2/linkedin` returns HTTP 410 `API_SUNSET`. Proxycurl is fully dead. Their new product is **NinjaPear**.

**New API:** `nubela.co/api/v1/employee/profile`  
**Critical discovery:** New API does NOT accept LinkedIn URL as input. Requires:
- `work_email`, OR
- `first_name + employer_website` (a real domain like `kaufmanrealty.com`)

**Problem:** None of our leads have a `companyDomain` field — we only have company name strings (e.g. "Barry Manor", "Reserve At Kanapaha II"). These are NOT resolvable domains. NinjaPear returns HTTP 400 on name strings.

**Fix applied:** Router now skips NinjaPear unless lead has `companyDomain` field — prevents burning 3 credits/call on guaranteed failures.

**Status:** NinjaPear is effectively disabled until a domain-enrichment preprocessing step is built.

---

### 3. Physician Signal Audit — Structural Insight
**Finding:** 1,138 physicians lack email. Breakdown:
- 948: name + city + state only (no company, no LinkedIn) → Apollo AND PDL both ~0% hit rate
- 190: have practice name (`[LastName] Md Practice`) → Apollo can find some (~36%?)
- 14: have LinkedIn URL → PDL match possible

**Root cause of 0% on name-only leads:** PDL personal enrichment requires `min_likelihood ≥ 3`. Common physician names (Jason Meyer, Lara Olson, Chad Johnson) in a city with no employer anchor = confidence too low. Apollo can't disambiguate either.

**Resolution path:** The 948 name-only physicians already have phone from NPI — they're usable for outreach. Email gap requires **PDL Pro personal email upgrade** (~$98/mo add-on).

**Skip rule added:** Router now skips Apollo for physicians/dentists without company (prevents wasted calls at 0% hit rate).

---

### 4. Re-Developer Signal Audit — Structural Insight
**Finding:** Re-developer company names are HUD FHA **property names** (Barry Manor, Oakland Terrace Apartments, Reserve At Kanapaha II) — NOT developer firm names. Apollo has no records for property names → 0% hit rate.

**Resolution path:** Needs a pre-enrichment step to resolve the developer's actual LLC/firm from county assessor records or the HUD FOIA data.

---

### 5. Enrichment Results This Session
| Niche | Leads Tried | Enriched | Hit Rate | Platform |
|---|---|---|---|---|
| `law-partners` | 22 | **8** | **36%** | Apollo |
| `business-owners` | 54 | **3** | 6% | Apollo |
| `c-suite-executives` | 140 | **11** | 8% | Apollo |
| `physicians` | ~100 (aborted) | 0 | 0% | — |
| `re-developers` | 7 (aborted) | 0 | 0% | — |

**Total: 22 new email contacts enriched and written to Firestore**

---

## 💳 Credit Status (CRITICAL)

| Service | Status | Notes |
|---|---|---|
| **Apollo** | ❌ **EXHAUSTED** | Monthly reset needed. 422 "insufficient credits" on last 20 c-suite calls |
| **PDL** | ~270/387 remaining | Used ~117 this session (physicians + c-suite fallthrough) |
| **NinjaPear** | Available but blocked | No `companyDomain` field on any leads = 400 on all calls |

---

## 🔥 Firestore Schema — No New Fields This Session

All writes use existing `_routerEnriched`, `_routerPlatform`, `_routerEnrichedAt` fields.

---

## ⚡ Priority Queue (Next Session)

### 🔴 P0 — Do First
| Task | Notes |
|---|---|
| **Wait for Apollo monthly reset** | Check https://app.apollo.io/#/settings → billing cycle reset |
| **Re-run physicians with company** | `node scripts/smart_enrich_router.js --niche physicians --limit 190` (the 190 with practice names) |
| **Re-run remaining law-partners (12)** | `node scripts/smart_enrich_router.js --niche law-partners --limit 50` |

### 🟡 P1 — Domain Enrichment Preprocessing
**Problem unlocked this session:** We need a `companyDomain` field to use NinjaPear and to improve Apollo match quality.

**Solution:** Build `scripts/enrich_company_domains.js`:
- Input: leads with `company` name but no `companyDomain`
- Process: Google Custom Search API or Clearbit Autocomplete (free) to resolve company name → website domain
- Output: write `companyDomain` to Firestore for each resolved lead
- Then: re-run NinjaPear on those leads

**Most impactful niches for domain enrichment:**
1. `re-developers` (84 blank, all have property names → need LLC lookup)
2. `law-partners` (remaining 12 blank)
3. `business-owners` (remaining 51)

### 🟡 P1 — PDL Personal Email Upgrade
| Task | Notes |
|---|---|
| Upgrade PDL Pro plan | Add "personal email" add-on at dashboard.peopledatalabs.com (~$98/mo) |
| Run physicians PDL with personal email | 948 name-only records → ~10% hit = ~95 new personal emails |

### 🟢 P2 — Platform Polish
| Task | Notes |
|---|---|
| UX: sortable signals, CSV export, back button, score resync | Non-blocking |
| Junk name cleanup — remaining CIK remnants | `node scripts/scrub_cik_names.js` |
| NinjaPear domain-enrichment pipeline | After `companyDomain` field is populated |

---

## 📊 Current Pipeline State (Post-Session)
| Niche | Total | Email | Change |
|---|---|---|---|
| `law-partners` | 34 | ~20 | +8 this session |
| `business-owners` | 57 | ~9 | +3 this session |
| `c-suite-executives` | 284 | ~90 | +11 this session |
| `physicians` | 1,188 | ~50 | +0 (structural miss) |
| `re-developers` | 96 | ~12 | +0 (structural miss) |
| `dentists` | 179 | 30 | unchanged |
| `henrys` | 8,056 | 27 | unchanged |

---

## 🔑 Credentials & Config
| Service | Key Location | Status |
|---|---|---|
| Apollo | `scripts/config/apollo.json` | `busq9FSqN3W7Oe6PGiiQOA` — **EXHAUSTED** |
| PDL | `scripts/config/pdl.json` | Pro plan, ~270/387 credits remaining |
| NinjaPear | `scripts/config/proxycurl.json` | `3178923807134b61aa7f7ed658139918` — blocked (no domains) |
| Firebase | `scripts/serviceAccountKey.json` | Admin SDK key |

---

## 📝 Open Architecture Decisions

1. **Company Domain Enrichment** — Required to unlock NinjaPear and improve Apollo match rates. Recommend Clearbit Autocomplete (free tier) or Google Custom Search. Build as a separate `enrich_company_domains.js` script that batch-resolves name → domain.

2. **Re-developer Data Quality** — HUD property names ≠ developer firm names. Need to either:
   - Look up the HUD FHA FOIA data again for the developer's entity name  
   - Or use county assessor parcel data to get the actual LLC name

3. **Physician Email Strategy** — 948 name-only → PDL personal email upgrade is the only viable path. At ~10% = ~95 new emails. ROI question: $98/mo add-on for 95 emails.

4. **Apollo Credit Budget** — Monthly limit hit quickly at 22 c-suite + 54 business-owners + 22 law-partners = 522 calls total. Consider upgrading Apollo plan if hit rates are acceptable.

---

## 🗂 Last 5 Git Commits
```
c30093d  fix: smart router — Apollo X-Api-Key header auth + NinjaPear endpoint migration
8fe613f  docs: C44 master handoff — Apollo full sweep (10K leads), cohort wiring fixes, enrichment segment bar
d58c986  feat: enrichment segment bar — filter cohort by Has Phone/Email/LinkedIn/Address/Home Value/Fully Contactable
48a37a0  fix: cohort view — enriched filter now shows phone-verified leads; all chip counts scoped to niche pool
a7e4a23  fix: loadCohort bypasses isReady gate — all niche leads now show in cohort view
```

---

## 🚀 Start Next Session With
> *"Read HANDOFF_C46.md. Apollo credits are exhausted — check reset date at app.apollo.io billing. If reset, re-run: `node scripts/smart_enrich_router.js --niche physicians --limit 50 --dry-run` first to preview. Top priority is building `scripts/enrich_company_domains.js` to populate companyDomain field — this unlocks NinjaPear and improves Apollo match rates for re-developers and business-owners."*
