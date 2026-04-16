# HANDOFF_C27.md — Sprint 5: Production Hardening & Pipeline Activation
**Session Date:** 2026-04-16  
**Time:** ~2:00 PM – 2:30 PM CT  
**Platform:** The AUM Engine — `https://theaumengine.web.app`  
**Project Root:** `/Users/kosalprum/Documents/AdvDiamondMining`  
**Firebase Project:** `theaumengine`

---

## 🎯 Session Objective

Complete the live-data activation sprint: connect all 410 real pipeline leads to the operator/admin account (`kosal@fin-tegration.com`), purge all synthetic demo data, and fix every UI surface that was still reading from old collections or stale nicheId mappings.

---

## ✅ What Was Built / Fixed This Session

### 1. `js/db.js` — Cockpit Lead Hydration Fix
**File:** `js/db.js`  
**Commit:** `4695373`

**Problem:** `loadAssignedLeadsFromFirestore()` only read `lead.fullName` for the display name. Org-level leads (SBA businesses, HUD projects, law firms, charity orgs) store the display name in `lead.company` or `lead.firmName` — resulting in "Unknown" rendering in the cockpit for ~140+ leads.

**Fix:** Added two-track name resolution:
- **Person leads** (physicians, dentists, AI-exec): `firstName + lastName → fullName`  
- **Org leads** (SBA business, HUD project, law firm, charity): `company || firmName` used as display name
- `isOrgLead` detection: triggers when `firstName` and `personName` are both empty but `orgName` exists
- `title` fallback: uses `firmTierLabel` for law partner firm records

**Key function:** `loadAssignedLeadsFromFirestore()` (lines ~143–195)

---

### 2. `scripts/fix_owneruid.js` — UID Repair Diagnostic
**File:** `scripts/fix_owneruid.js` (new)  
**Commit:** `4695373`

Diagnostic script created to check if `ownerUid` was truncated on `lead_assignments`. Confirmed all 433 UIDs were correct (28-char full UIDs). Script kept for future reference.

---

### 3. `scripts/purge_demo_provision_kosal.js` — Demo Purge + Admin Provisioning
**File:** `scripts/purge_demo_provision_kosal.js` (new)  
**Commit:** `9e7ff89`

**What it does:**
1. Deletes all 112 docs from `prospects` collection (Alfred Wealth Trigger Miner synthetic data)
2. Deletes all 30 docs from `al_assignments` collection (frozen archive)
3. Creates `advisor_pool/FvEWqsETjbU602nLfHaJUaUkWkS2` for Kosal P (Fin-Tegration Consulting)
4. Creates 410 `lead_assignments` docs pointing to all `master_leads` for Kosal's UID
5. Sets `currentLeadCount: 410` on advisor_pool

**Result:** Kosal logs in → sees 410 real pipeline leads, 0 demo leads.

---

### 4. Firestore — Admin Cap Set to Unlimited
**Method:** One-liner via Admin SDK  
**Commit:** (inline, not a script file)

Updated `advisor_pool/FvEWqsETjbU602nLfHaJUaUkWkS2`:
- `activeLeadCap: 999999`
- `capPolicy: 'unlimited'`
- `role: 'operator-admin'`

---

### 5. `scripts/audit_leads.js` — Sprint 5 Audit Update
**File:** `scripts/audit_leads.js`  
**Commit:** `9e7ff89`

Updated health checks for Sprint 5 reality:
- `Sprint 4: al_assignments frozen (>=30)` → `Sprint 5: al_assignments purged (=== 0)`
- `All 5 advisors provisioned` → `All 6 advisors provisioned (5 pilot + Kosal)`
- Title updated: `Sprint 4` → `Sprint 5`
- `al_assignments` label updated: `frozen archive` → `purged Sprint 5`

**Result:** `10/10 🟢 All systems go`

---

### 6. `js/data.js` — NICHES Array NicheId Slug Migration
**File:** `js/data.js`  
**Commit:** `fa9e61b`

**Problem:** `NICHES` array used numeric IDs `n1, n2, n3...n13`. All Firestore pipeline leads store nicheId as slugs (`physicians`, `law-partners`, `dentists`, etc.). The Prospect Mine count badge `PROSPECTS.filter(p => p.nicheId === n.id).length` always returned 0 for live leads because `n.id = 'n5'` never matches `lead.nicheId = 'physicians'`.

**Fix:** Migrated ALL `NICHES` array entries from numeric IDs to canonical Firestore slug IDs:

| Old ID | New ID |
|--------|--------|
| `n1` | `aircraft-owners` |
| `n2` | `business-owners` |
| `n3` | `charity-board-members` |
| `n4` | `inheritance` |
| `n5` | `physicians` |
| `n6` | `henrys` |
| `n7` | `ai-displaced-executives` |
| `n8` | `law-partners` |
| `n9` | `c-suite-executives` |
| `n10` | `dentists` |
| `n11` | `high-earning-tradesman` |
| `n12` | `real-estate-developers` |
| `n13` | `pro-athletes` |

Also updated:
- All 28 demo `PROSPECTS[]` nicheId values from `n1..n7` → slugs
- CSV import default nicheId: `'n2'` → `'business-owners'`
- Removed stale `count:` fields from NICHES (counts are now live-computed from PROSPECTS array)

---

## 🔥 Firestore Schema Changes

### Collections Modified This Session

| Collection | Change |
|---|---|
| `prospects` | **DELETED** — all 112 synthetic Alfred demo docs purged |
| `al_assignments` | **DELETED** — all 30 frozen archive docs purged |
| `advisor_pool` | **ADDED** Kosal UID doc; updated Kosal cap to 999,999 |
| `lead_assignments` | **ADDED** 410 new docs for Kosal (ownerUid = Kosal UID) |
| `master_leads` | **DELETED** `_schema` sentinel doc (blank template, not a real lead) |

### advisor_pool — Current State (6 advisors)

| UID | Firm | Cap | Lead Count | Role |
|---|---|---|---|---|
| `FvEWqsETjbU602nLfHaJUaUkWkS2` | Fin-Tegration Consulting (Kosal) | 999,999 | 410 | operator-admin |
| `Iqo8zz5gTFh967ZokqHCpUp4S2t2` | Wight Financial (Patrick) | 500 | 128 | advisor |
| `Zd4H7gaNZJdrgXbIWNnM5cSpqdB2` | Ray Financial Advisors (Ray) | 500 | 121 | advisor |
| `BQhiSqKW2JM3ycrPQYzeXa640Ku1` | Cooper Capital Group (Chuck) | 500 | 69 | advisor |
| `yzTL1YHadINFrMwxCMrrh0fbhZp2` | Germshied Wealth Management (Matt) | 500 | 61 | advisor |
| `NzC6fh3sXKVuDmgfPAaaEea3Ovm2` | Duelly/Belly Wealth (Andy) | 500 | 53 | advisor |

### master_leads — Current State (410 real leads)

| NicheId | Count | Source |
|---|---|---|
| `physicians` | 150 | CMS NPI Registry (A1) |
| `dentists` | 80 | CMS NPI Registry (A1) |
| `real-estate-developers` | 60 | HUD Multifamily (A8) + SBA (A7) |
| `business-owners` | 54 | SBA SBIC/SBDC (A7) |
| `yacht-owners` | 30 | Curated DB (A4) |
| `law-partners` | 28 | AmLaw/Martindale MN (A2) |
| `ai-displaced-executives` | 3 | Curated DB |
| `aircraft-owners` | 3 | Curated DB |
| `real-estate-investors` | 1 | Manual |
| `charity-board-members` | 1 | Curated DB |
| **TOTAL** | **410** | |

---

## 🏗️ Pipeline Architecture State

```
Public Data Sources
    FAA Registry (A4)     → OFFLINE (re-run when back online)
    CMS NPI (A1)          → ✅ 230 leads ingested (physicians + dentists)
    SBA Registry (A7)     → ✅ 54 business leads
    HUD Multifamily (A8)  → ✅ 60 RE developer leads
    AmLaw/Martindale (A2) → ✅ 28 MN law firm leads
    Curated DB            → ✅ 33 leads (yacht, aircraft, exec, charity)

         ↓ scripts/ingest_leads.js (Alfred schema validator)
         
         master_leads (Firestore) — 410 docs
         
         ↓ scripts/trigger_routing.js (niche-match → cap-check)
         
         lead_assignments (Firestore) — 843+ docs total
         ├── Kosal UID:   410 assignments (operator view — all leads)
         ├── Wight UID:   128 assignments
         ├── Ray UID:     121 assignments
         ├── Cooper UID:   69 assignments
         ├── Germshied UID: 61 assignments
         └── Belly UID:    53 assignments
         
         ↓ db.js loadAssignedLeadsFromFirestore()
         
         Cockpit → PROSPECTS[] (in-memory, login-fresh)
         
         ↓ pages.js NICHES array (now slug-aligned)
         
         Prospect Mine niche card counts ← FIXED ✅
```

---

## 🏦 Firebase Auth Users

| UID | Email | Name | Role |
|---|---|---|---|
| `FvEWqsETjbU602nLfHaJUaUkWkS2` | kosal@fin-tegration.com | Kosal P | Operator-Admin |
| `Iqo8zz5gTFh967ZokqHCpUp4S2t2` | patrick@patrick.com | Patrick Wight | Pilot Advisor |
| `Zd4H7gaNZJdrgXbIWNnM5cSpqdB2` | ray@ray.com | Ray Uncle | Pilot Advisor |
| `BQhiSqKW2JM3ycrPQYzeXa640Ku1` | chuck@chuck.com | Chuck Cooper | Pilot Advisor |
| `yzTL1YHadINFrMwxCMrrh0fbhZp2` | matt@matt.com | Matt Germshied | Pilot Advisor |
| `NzC6fh3sXKVuDmgfPAaaEea3Ovm2` | andy@andy.com | Andy Belly | Pilot Advisor |
| `VziTmswNHAPdHYjZg4r9drVfLD52` | kprum@yahoo.com | — | Test account |
| `ThIfjR1vZuMkBJ8GGm5LbByVzHu1` | test@test.com | — | Test account |
| `WnJUMgC5QmeRbGFcVVqxVUKEjT02` | testpilot@theaumengine.com | — | Test account |

---

## 🔑 Credentials & Config

| Item | Value |
|---|---|
| Firebase Project | `theaumengine` |
| Hosting URL | `https://theaumengine.web.app` |
| Service Account Key | `/Users/kosalprum/Downloads/theaumengine-firebase-adminsdk-fbsvc-3bf760f49f.json` |
| Scripts CWD | `/Users/kosalprum/Documents/AdvDiamondMining/scripts/` |
| Admin SDK require | `require('./serviceAccountKey.json')` (symlink in /scripts) |
| Node version | v25.5.0 (CommonJS) |
| Firebase CLI | `/usr/local/bin/firebase` |

---

## 🧾 Last 8 Git Commits

```
fa9e61b fix(prospect-mine): align NICHES ids with Firestore nicheId slugs
9e7ff89 feat(sprint5): purge demo data + provision Kosal as advisor
4695373 fix(cockpit): hydrate org-level leads in cockpit — company name fallback
ecc9c7e fix(routing): add law-partners to all advisor nicheIds + clear 10 phantom failures
eaff9bb feat(a2): Agent A2 — Law Partner Lead Miner
080072e feat(a1): Agent A1 — NPI Dentist Miner (upgrade to agent_npi_miner.js)
2914787 feat(a8): Agent A8 — HUD Multifamily RE Developer Miner
8a84c85 fix(ingest): support business-level leads with company+externalId identity key
```

---

## 🏥 Audit Score

```bash
node scripts/audit_leads.js
# → Score: 10/10  🟢 All systems go (as of 2026-04-16 14:22 CT)
```

All 10 health checks passing:
- ✅ Total leads assigned > 0
- ✅ All master_leads have city/state
- ✅ All 6 advisors provisioned (5 pilot + Kosal)
- ✅ All advisors eligible for routing
- ✅ No pending routing_queue items
- ✅ No failed routing_queue items
- ✅ master_leads has docs (CF path)
- ✅ masterLeads archived (schema unified)
- ✅ Every pilot advisor has ≥1 lead
- ✅ Sprint 5: al_assignments purged (demo data gone)

---

## 📋 Prospect Mine — Expected Counts After Fix

Refresh `https://theaumengine.web.app` → Prospect Mine (hard refresh: `Cmd+Shift+R`):

| Niche Card | Expected Count (approx.) |
|---|---|
| Physicians & Surgeons | ~153 (150 pipeline + 3 demo) |
| Dentists & Specialists | ~80 |
| Real Estate Developers | ~60 |
| Business Owners | ~62 (54 pipeline + 8 demo) |
| Law Partners | ~28 |
| Yacht Owners | ~30 |
| AI-Displaced Executives | ~8 (3 pipeline + 5 demo) |
| Aircraft Owners | ~8 (3 pipeline + 5 demo) |
| Charity Boards | ~3 |
| HENRYs | ~2 (demo only) |
| C-Suite Executives | 0 (no pipeline yet) |
| High Earning Tradesman | 0 (no pipeline yet) |
| Pro Athletes | 0 (no pipeline yet) |

---

## 🚫 Known Open Issues / Blockers

### 1. FAA Registry (Agent A4) — OFFLINE
- `scripts/agent_faa_miner.js` is built and ready
- FAA CSV download URL is currently returning 404 / offline
- **Action:** Re-run `node scripts/agent_faa_miner.js --state MN` when FAA registry is back
- Expected yield: ~25–50 MN aircraft owners

### 2. Law Partner Name Resolution (Agent A2)
- 28 MN law firm leads are ingested as **firm-level** records
- Individual partner names require manual enrichment or Apollo/LinkedIn API
- **Action:** Run `node scripts/agent_apollo_enrich.js` on the 28 law firm leads to resolve partner names
- Until enriched: firm name (e.g., "Maslon LLP") displays as the prospect name in cockpit

### 3. Charity Board Member Name Resolution
- Only 1 charity-board-members lead currently in `master_leads`
- 20 MN org 990 PDFs were staged in previous session — board member names not yet extracted
- **Action:** Extract board member names from 990 PDFs and re-ingest

### 4. Yacht Owners — Enrichment Needed
- 30 yacht owner leads ingested from curated DB
- No personal contact info (email/phone) on any
- **Action:** Run Apollo/LinkedIn enrichment pass on yacht owners

### 5. Niches With 0 Leads
- `c-suite-executives` — no agent built yet
- `high-earning-tradesman` — no agent built yet  
- `pro-athletes` — no agent built yet
- `henrys` — demo only (2 records)
- `inheritance` — demo only (2 records)
- **Action:** Build A9 (C-Suite), A10 (Tradesman), A11 (Pro Athletes) agents

---

## 🔮 Next Session Priorities (Ordered)

### Priority 1 — Verify Live UI
1. Log in as `kosal@fin-tegration.com`
2. Confirm Prospect Mine shows correct counts per niche
3. Confirm cockpit "Total Prospects" = 410
4. Click a law partner card → verify firm name shows, not "Unknown"
5. Click a physician card → verify `Dr. [Name]` shows

### Priority 2 — FAA Retry
```bash
cd /Users/kosalprum/Documents/AdvDiamondMining/scripts
node agent_faa_miner.js --state MN
```

### Priority 3 — Apollo Enrichment Pass (Law + Yacht)
```bash
node scripts/agent_apollo_enrich.js --niche law-partners
node scripts/agent_apollo_enrich.js --niche yacht-owners
```

### Priority 4 — 990 Board Member Extraction
Extract board member names from 20 MN charity 990 PDFs and run:
```bash
node scripts/ingest_leads.js --batch <charity_batch.json>
```

### Priority 5 — Build A9 (C-Suite Executives)
- Source: SEC Form 4 insider filings + Crunchbase CEO/C-suite data
- Target: 50–100 MN executives
- Refer to `SKILL.md` at `.agents/skills/agent_csuite/SKILL.md`

### Priority 6 — Stripe Subscription Gate
- Wire Stripe to gate pilot advisor access (previously planned in C23)
- Ensure Calendly booking link required before first lead visible

---

## 🔧 Key Scripts Reference

| Script | Purpose | Run from |
|---|---|---|
| `audit_leads.js` | Full pipeline health check (10/10) | `scripts/` |
| `purge_demo_provision_kosal.js` | Demo data purge + admin provisioning | `scripts/` |
| `fix_owneruid.js` | UID repair diagnostic (already verified clean) | `scripts/` |
| `agent_law_miner.js` | A2 — Law partner lead miner (MN) | `scripts/` |
| `agent_npi_miner.js` | A1 — CMS NPI physician/dentist miner | `scripts/` |
| `agent_sba_miner.js` | A7 — SBA business owner miner | `scripts/` |
| `agent_hud_miner.js` | A8 — HUD multifamily RE miner | `scripts/` |
| `trigger_routing.js` | Routes master_leads → lead_assignments | `scripts/` |
| `ingest_leads.js` | Alfred schema validator + Firestore writer | `scripts/` |

---

## 📂 Files Modified This Session

| File | Type | Change |
|---|---|---|
| `js/db.js` | Modified | Org-level lead name hydration fallback (company/firmName) |
| `js/data.js` | Modified | NICHES IDs migrated n1..n13 → Firestore slugs; PROSPECTS nicheIds updated |
| `scripts/audit_leads.js` | Modified | Sprint 5 health check updates |
| `scripts/fix_owneruid.js` | New | UID diagnostic script |
| `scripts/purge_demo_provision_kosal.js` | New | Demo purge + admin provisioning |

---

## 💬 START YOUR NEXT SESSION WITH:

```
Read HANDOFF_C27.md first, then let's continue.

Priority: Verify live UI at https://theaumengine.web.app —
log in as kosal@fin-tegration.com and confirm Prospect Mine
shows correct niche counts and cockpit shows 410 leads.

Then we'll decide between: FAA retry, Apollo enrichment, or building A9.
```

---

*Handoff written: 2026-04-16 14:30 CT | Antigravity Sprint 5 | AUM Engine v1.5*
