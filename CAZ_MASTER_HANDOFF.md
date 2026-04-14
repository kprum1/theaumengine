# CAZ Command Console — Master Handoff Document
**Compiled by:** Antigravity (Big Nate)
**Date:** 2026-04-01
**Sources:** Live cazcc.com audit + AllPro v40 skills transfer + Sprint 13/14/15/16 logs + Mar 18 handoff
**For:** Any agent (Antigravity, Alfred, Vera, Claude) picking up the Caz project

> **How to use this doc:** Read Part 1 (Caz live state + architecture). Then Part 2 (AllPro skills to port).
> Every Open Question from the skills transfer is answered here from actual source code.
> Don't rebuild what already exists — port it.

---

# PART 1: CAZ COMMAND CENTER — COMPLETE PLATFORM STATE

## 1.1 Platform Identity

| Field | Value |
|-------|-------|
| **Live URL** | https://www.cazcc.com · https://advisorsoutreach.web.app |
| **Firebase Project** | `advisorsoutreach` |
| **Auth Domain** | `advisorsoutreach.firebaseapp.com` |
| **Storage Bucket** | `advisorsoutreach.firebasestorage.app` |
| **App ID** | `1:981037828756:web:631f20e815572bb994c281` |
| **Measurement ID** | `G-H2RKQM1VBK` |
| **Local Project Path** | `/Users/kosalprum/Library/Mobile Documents/com~apple~CloudDocs/Alfred clawbot /handoffs/advisors-outreach` |
| **SW Cache Version** | `caz-v16.2` |
| **Stack** | Vanilla HTML/CSS/JS + Firebase Auth + Firestore + Cloud Functions |
| **Firebase SDK** | compat v10.12.0 |
| **AI Model** | Gemini 2.5 (Flash or Pro, user-selectable in Settings) |

## 1.2 Domain / DNS Configuration

| Setting | Value |
|---------|-------|
| **Registrar** | Squarespace (`account.squarespace.com/domains/managed/cazcc.com`) |
| **GCP DNS Zone** | `cazcc-com` in project `advisorsoutreach` |
| **Nameservers** | `ns-cloud-c1-c4.googledomains.com` |
| **A Record** | `@` → `199.36.158.100` |
| **CNAME** | `www` → `advisorsoutreach.web.app` |
| **TXT** | `hosting-site=advisorsoutreach` |
| **Email Security** | SPF, DKIM, DMARC (Squarespace) |

## 1.3 Deploy Commands

```bash
cd "/Users/kosalprum/Library/Mobile Documents/com~apple~CloudDocs/Alfred clawbot /handoffs/advisors-outreach"

# Full deploy (hosting + functions + indexes)
firebase deploy

# Hosting only (fastest for UI changes)
firebase deploy --only hosting

# Functions only
firebase deploy --only functions

# Indexes only
firebase deploy --only firestore:indexes
```

> **⚠️ No version/cache-busting tags yet.** Add `?v=N` to all script/CSS src tags before next major deploy wave
> to prevent stale cache issues. Currently SW cache is `caz-v16.2`.

## 1.4 Login Credentials (Test)

- **Email:** `nate@finteg.co`
- **Password:** `test1234`

---

## 1.5 Architecture Overview — 14 HTML Pages

| Page | File | Primary Scripts | Purpose |
|------|------|-----------------|---------|
| Login | `login.html` | `auth-gate.js` | Firebase Auth email/password |
| Command Center | `index.html` | `app.js`, `phase3-features.js` | Dashboard — KPIs, morning briefing, quick actions |
| Territory Map | `map.html` | Leaflet.js | Interactive map — 765 firm markers, tier filters |
| Intelligence | `intelligence.html` | `scout-advanced.js` | Firm table, filters, product opportunity map |
| Pipeline | `pipeline.html` | `pipeline-engine.js` | Kanban stages, search, firm cards |
| Deals | `deals.html` | `closer-agent.js`, `export-engine.js` | Revenue forecast, allocation tracker, battlecards |
| Sequences | `sequences.html` | `sequences.js` | Email/call outreach sequences, due today, KPIs |
| Content Library | `content-library.html` | `librarian-agent.js` | Outreach templates + product knowledge base |
| Activity Log | `activity.html` | `activity.js` | Chronological activity feed + KPIs |
| Analytics | `analytics.html` | `pulse-agent.js` | Funnel, velocity, forecast, time-in-stage charts |
| Expenses | `expenses.html` | Inline | T&E logging, summary cards, recent table |
| Data Health | `data-health.html` | `sentinel-agent.js`, `enrichment.js` | Data quality scoring, duplicate detection, compliance calendar |
| Settings | `settings.html` | `csv-import.js`, `hubspot.js` | Profile, CSV import, HubSpot config, preferences |
| Agent Health | `agent-health.html` | `skill-logger.js` | Agent status cards, skill leaderboard, RL scoring |

**Navigation pattern:** Multi-page app — each route is a separate `.html` file.
There is **NO `navigateTo()` function**. Cross-page navigation uses `window.location.href`.

---

## 1.6 JavaScript Module Inventory (28 files, ~12,700 LOC)

| Script | Lines | Global Export | Purpose |
|--------|-------|---------------|---------|
| `pipeline-engine.js` | 1,855 | — | Full pipeline management engine |
| `sequences.js` | 1,191 | — | Outreach sequence builder + executor |
| `phase3-features.js` | 1,001 | — | Dashboard briefing, AI insights, morning checklist |
| `app.js` | 907 | — | Dashboard KPIs, greeting, calendar integration |
| `pulse-agent.js` | 776 | — | Analytics charts + velocity scoring |
| `librarian-agent.js` | 738 | — | Content library search + template engine |
| `sentinel-agent.js` | 736 | — | Data quality, duplicates, compliance, gifts |
| `meeting-workflow.js` | 718 | — | Pre-meeting intelligence + post-meeting actions |
| `closer-agent.js` | 672 | — | Deal intelligence, objection library, battlecards |
| `navigator-agent.js` | 547 | — | Territory strategy + routing |
| `scout-advanced.js` | 404 | — | Firm intelligence + filters |
| `activity.js` | 352 | — | Activity logging + timeline |
| `csv-import.js` | 320 | — | CSV parser, mapper, validator, import UI |
| `quick-log.js` | 298 | — | Quick activity log modal |
| `nav.js` | 298 | — | Sidebar nav, theme toggle, SW registration |
| `ai.js` | ~200 | `window.AIEngine` | Gemini proxy via Cloud Function `/aiProxy` |
| `enrichment.js` | ~182 | `window.EnrichmentEngine` | Loads 4 JSON enrichment files, lookup/render helpers |
| `db.js` | ~192 | `window.CAZDB` | Firestore CRUD helpers |
| `agent-orchestrator.js` | — | — | Multi-agent coordination |
| `skill-router.js` | — | — | Skill routing + RL integration |
| `firm-exclusions.js` | — | — | Firm exclusion filter (localStorage, 14 exclusions) |
| `hubspot.js` | — | — | HubSpot CRM client-side integration |
| `export-engine.js` | — | — | CSV/PDF/clipboard export |
| `utils.js` | — | `window.CAZUtils` | Toast, formatting utilities |
| `firebase-config.js` | — | `window.db`, `window.auth` | Firebase init |
| `auth-gate.js` | — | — | Auth redirect guard (all pages) |
| `seed-rl.js` | — | — | RL scoring seed data |
| `skill-logger.js` | — | `window.SkillLogger` | Agent skill run logging to Firestore |

---

## 1.7 Data Architecture

### Primary Data Global
```javascript
// File: data/data.js  (uses `var`, NOT `const` — required for firm exclusion filter)
// 765 firms in MN, WI, IA territory
// Loaded as: FIRMS (array) + STATS (aggregate object)
// NOT pipelineData, NOT RIA_PARTNERS
```

### Complete FIRMS Record Field Map
| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique firm ID |
| `name` | **String** | **Firm name — primary enrichment join key** |
| `type` | String | Firm type (RIA, BD, etc.) |
| `aum` | Number | AUM (numeric, in millions) |
| `aumD` | String | AUM display string (e.g., "$512M") |
| `accts` | Number | Account count |
| `emps` | Number | Employee count |
| `riaR` | Number | RIA registrations |
| `bdR` | Number | BD registrations |
| `reps` | Number | Rep count |
| `city` | String | City |
| `st` | String | State (2-letter, e.g., "MN") |
| `zip` | String | ZIP code |
| `web` | String | Website URL |
| `phone` | String | Phone number |
| `cust` | String/Array | Custodian(s) |
| `f13` | Boolean | 13F filer flag |
| `reg` | String | Registration type |
| `advN` | Number | Advisor count (name-based) |
| `advSt` | String | Advisor state |
| `metros` | Array | Metro area(s) |
| `score` | Number | Composite alts score (0–100) |
| `tier` | String | "T1" / "T2" / "T3" |
| `bd` | Boolean | BD flag |
| `fits` | Array | `[{ product, strength }]` product fit objects |
| `fitN` | String | Fit narrative |
| `topFit` | String | Top fit product name |
| `ac` | Boolean | Access flag |
| `iv` | Boolean | IV flag |
| `it` | Boolean | IT flag |
| `fm` | Boolean | FM flag |
| `plat` | String | Platform flags |
| `crm` | String | CRM system used |
| `tech` | String | Tech stack description |
| `svc` | String | Services offered |
| `cp` | Boolean | Checkpoint flag |
| `cais` | Boolean | CAIS platform user |
| `icap` | Boolean | iCapital platform user |
| `qp` | Boolean | Qualified Purchaser status |
| `accr` | Boolean | Accredited Investor status |
| `altP` | String | Alt products |
| `advs` | Array | Advisor objects `{ name/n, title/t, email }` |

> **⚠️ lat/lng NOT present** — FIRMS records do not have geocoordinates.
> City + st + zip exist on every record. Geocoding needed before map Skills 1–4 can be ported.

### Enrichment Data Files
| File | Content |
|------|---------|
| `data/enrichment_by_crd.json` | 8,128 advisor records (leadScore, role, expertise, investments) |
| `data/enrichment_firms.json` | 772 firm records (avgLeadScore, topAdvisors) |
| `data/enrichment_summary.json` | Aggregate enrichment stats |
| `data/enrichment_top100.json` | Top 100 advisors by lead score |

### EnrichmentEngine API (`js/enrichment.js`)
```javascript
EnrichmentEngine.init()                    // loads all 4 JSON files
EnrichmentEngine.getAdvisor(crd)           // lookup by CRD number
EnrichmentEngine.getLeadScore(crd)         // advisor lead score
EnrichmentEngine.getRole(crd)              // advisor role/title
EnrichmentEngine.getExpertise(crd)         // expertise string
EnrichmentEngine.getInvestments(crd)       // investments string
EnrichmentEngine.getFirm(firmName)         // firm-level lookup (case-insensitive)
EnrichmentEngine.getFirmAvgScore(firmName) // firm avg lead score
EnrichmentEngine.getTopAdvisors(firmName)  // top advisors at firm
EnrichmentEngine.getTop100()               // leaderboard
EnrichmentEngine.getScoreColor(score)      // #hex color
EnrichmentEngine.getScoreLabel(score)      // "Hot"/"Warm"/"Developing"/"Cool"/"Cold"
EnrichmentEngine.renderScoreBadge(score)   // HTML badge
EnrichmentEngine.renderRoleBadges(roleStr) // HTML tags
EnrichmentEngine.renderExpertiseTags(str)  // HTML tags (blue)
EnrichmentEngine.renderInvestmentTags(str) // HTML tags (green)
```

---

## 1.8 Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `activities` | Activity log (type, firmName, advisorName, notes, outcome, nextStep, createdAt) |
| `pipelineState` | Deal stages (firmName, stage, lastTouchAt, touchesCompleted) |
| `active_sequences` | Outreach sequences (steps, status, trigger) |
| `skillRuns` | Agent skill execution logs (RL) |
| `agentActions` | Pending agent actions queue |
| `expenses` | T&E (amount, firm, category, date) |
| `userSettings` | Per-user prefs (AI model, HubSpot token, notifications) |
| `ai_usage` | AI feature usage tracking |
| `manualContacts` | Manually added contact records |
| `enrichmentQueue` | Firms queued for re-enrichment |
| `hubspot_usage` | HubSpot API call logging |
| `firmNotes` | Per-firm notes (keyed by firmId) |

### Pipeline Stage Vocabulary (Caz)
`Prospecting` → `Meeting Prep` → `Follow-Up` → `Close`

---

## 1.9 Cloud Functions (`functions/index.js` — 27K)

| Function | Type | Purpose |
|----------|------|---------|
| `aiProxy` | onRequest | Gemini API proxy — reads `GEMINI_API_KEY` secret, proxies to Gemini 2.5 |
| `hubspotProxy` | onRequest | HubSpot CRM proxy — reads token from Firestore `userSettings`, whitelisted endpoints |
| `sequenceAdvancer` | onSchedule | Runs hourly, advances due outreach sequences |
| `computeSkillRanks` | from `rl-scorer.js` | RL-based skill ranking computation |
| `manualScoreSkills` | from `rl-scorer.js` | Manual skill scoring override |

### AIEngine Feature → Skill Map
```javascript
// Every AI call is logged via SkillLogger with these skill IDs:
meeting_brief          → closer_pre_meeting_intel        (agent: closer)
email_personalize      → librarian_email_template_engine (agent: librarian)
post_meeting_summary   → closer_deal_summary             (agent: closer)
decision_maker_search  → librarian_research_package      (agent: librarian)
morning_briefing       → pulse_monday_briefing           (agent: pulse)
deal_summary           → closer_deal_summary             (agent: closer)
generate_battlecard    → closer_competitive_battlecard   (agent: closer)
objection_response     → closer_objection_handler        (agent: closer)
```

---

## 1.10 Live Territory Stats (as of 2026-04-01)

| Metric | Value |
|--------|-------|
| Firms in territory | 765 (MN, WI, IA) |
| Total Territory AUM | $2.3T |
| Advisors scored (Phase 1) | 7,157–8,128 |
| Avg lead score | 43.2 |
| Hot leads (60+) | 529 |
| Super hot (80+) | 23 |
| Data Quality | 98% · Grade A (Sprint 15 fix) |
| Pipeline (active) | 16 firms → 5 Prospecting, 4 Meeting Prep, 2 Follow-Up, 5 Close |

---

## 1.11 Sprint History

### Sprint 13 (March 18, 2026)
- 3 Firestore composite indexes deployed
- Light mode polish (`base.css` `[data-theme="light"]` overrides)
- Deals page + `closer-agent.js` + `export-engine.js`
- Settings page wired to Firestore
- PWA `manifest.json` + `sw.js` (cache `caz-v13.1`)
- Mobile CSS for 5 pages (`mobile.css`)
- AI model selection toggle (Gemini 2.5 Flash / Pro)

### Sprint 14 (March 18, 2026)
- **Firm Exclusion Filter** — 14 non-RIA firms removed at load time via `firm-exclusions.js`
- **PWA Icons** — 192×192 + 512×512 gold C monogram on navy
- **CSV Firm Data Import** — drag-and-drop UI in Settings, supports merge/replace modes
- **HubSpot Cloud Function Proxy** — `hubspotProxy` deployed, "Test Connection" wired
- **Custom Domain** — `www.cazcc.com` live via Squarespace → GCP DNS

### Sprint 15 (March 18, 2026)
- **Data Health fix** — 4 broken field names: `state→st`, `email→web`, `custodian→cust`, `accredited→accr`. Score jumped from ~35% (Grade F) to **98% (Grade A)**
- `enrichment.js` — added per-file `safeFetch` graceful fallback, `loaded=true` on failure
- `data-health.html` — removed fragile 2s setTimeout, direct async/await

### Sprint 16 (post March 18, 2026)
- Intelligence Product Opportunity Map calculation fixed
- Analytics Time-in-Stage Analysis fixed
- SW cache bumped to `caz-v16.2`
- Various agent + pipeline improvements

---

## 1.12 Page Audit Status (Sprint 16)

| Page | Status | Notes |
|------|--------|-------|
| Command Center | ✅ | KPIs + briefing load. Firestore index warnings exist |
| Territory Map | ✅ | Leaflet + markers + tier filters. Missing: viewport sidebar, drawer, highlight |
| Intelligence | ✅ | Table + Product Opportunity Map working (Sprint 16 fix) |
| Pipeline | ✅ | Stages + search work. Missing: drag-and-drop |
| Deals | ✅ | Revenue forecast + top deals load |
| Sequences | ✅ | KPIs + due today + active sequences |
| Content Library | ✅ | Templates + knowledge base |
| Activity Log | ✅ | Feed + KPIs |
| Analytics | ✅ | Charts + Time-in-Stage (Sprint 16 fix) |
| Expenses | ✅ | Summary + form + table |
| Data Health | ✅ | 98% Grade A, 48 duplicates, compliance calendar |
| Settings | ✅ | CSV import + HubSpot config + profile |
| Agent Health | ✅ | Agent cards + skill leaderboard |

---

## 1.13 Open Backlog (Priority Order)

### High Priority
- [ ] **Firestore Indexes** — Deploy composite indexes (activities/active_sequences console warnings)
- [ ] **Enrichment Freshness** — 751 firms show "Never enriched" — add timestamps to data
- [ ] **Alfred Phase 2** — SEC ADV enrichment (22 fields, 765 firms, $0 cost) — unblocks everything
- [ ] **Geocoding** — Add lat/lng to FIRMS (needs Phase 2 `office_address` or city/zip batch geocode)
- [ ] **cazcc.com apex redirect** — Root domain may still show "Needs setup"

### Medium Priority
- [ ] **Version/cache-busting** — Add `?v=N` to all script/CSS tags before next deploy
- [ ] **Settings: Firm Exclusions UI** — Visual manager (currently console/localStorage only)
- [ ] **Pipeline drag-and-drop** — Visual stage moves
- [ ] **Sequence personalization** — Step-level customization
- [ ] **Meeting Workflow wiring** — Connect `meeting-workflow.js` buttons to Firestore

### Low Priority
- [ ] Push notifications for stale deals / sequence reminders
- [ ] Multi-user support / territory-based data scoping
- [ ] Offline mode enhancements (Firestore cache)
- [ ] Activity analytics trends/charts

---

# PART 2: ALLPRO COMMAND CONSOLE → CAZ PLATFORM SKILLS TRANSFER

**Issued by:** Big Nate (Antigravity)
**AllProCC Version:** v40
**Purpose:** Every skill built in AllProCC that is portable and ready to merge into Caz.
Don't rebuild — port.

---

## 2.1 Platform Comparison

| | AllPro Command Console | Caz Command Console |
|--|------------------------|---------------------|
| **URL** | allprocmd.com | cazcc.com |
| **Firebase Project** | `fintclients` / `allprocmd` | `advisorsoutreach` |
| **Purpose** | AllPro internal — RIA acquisition + investor deepening | Caz — RIA pipeline management (MN/WI/IA) |
| **Data Array** | `pipelineData` | **`FIRMS`** |
| **Nav Pattern** | Single-page app (`navigateTo()`) | **Multi-page app** (`window.location.href`) |
| **Current Version** | v40 | Sprint 16 (no semver yet) |
| **Stack** | Vanilla HTML/CSS/JS + Firebase | Same |
| **Alfred Enrichment** | Phase 1 complete (772 firms, 7 fields) | Phase 1 complete (8,128 advisors, CRD-keyed JSON) |

---

## 2.2 Open Questions — Answered from Source Code

| Question (from original doc §8) | Answer |
|----------------------------------|--------|
| **Firm name field?** | `firm.name` — string, primary join key, case-insensitive in EnrichmentEngine |
| **lat/lng fields?** | ❌ **NOT PRESENT** — city/st/zip exist but no geocoordinates. Must geocode before Skills 1–4. |
| **Pipeline stage vocabulary?** | Prospecting → Meeting Prep → Follow-Up → Close |
| **Detail panel exists?** | ✅ `pipeline.html` has a detail panel — Score Bars (Skill 5) can port directly |
| **Firebase project?** | `advisorsoutreach` — separate from AllPro's `fintclients`. Different deploy target. |
| **navigateTo() equivalent?** | ❌ **None** — multi-page app. Skill 7 must use `localStorage` bridge (see §2.9 below) |

---

## 2.3 Skill 1 — Dynamic Viewport-Aware Map (v38)

**What it does:**
Map sidebar dynamically updates on pan/zoom to show only firms visible in the viewport.
Header: "📍 In View · Zoom 12 · 4 firms · AUM: $329M"

**Key code pattern:**
```javascript
mapInstance.on('moveend', () => refreshSidebarForBounds());
mapInstance.on('zoomend', () => refreshSidebarForBounds());

function refreshSidebarForBounds() {
  const bounds = mapInstance.getBounds();
  // Caz: use FIRMS array, not pipelineData
  const visible = FIRMS.filter(f => bounds.contains([f.lat, f.lng]));
  renderMapSummary('all', bounds, visible);
}
```

**Caz wiring:**
- Replace `pipelineData` with `FIRMS`
- lat/lng must be added first (see Blocker below)
- Sidebar currently shows all 765 firms — viewport filter is a major UX upgrade

**Blocker:** Requires lat/lng on each FIRMS record. See geocoding strategy in §2.11.

**Estimated port effort:** 1–2 hours (+ geocoding pass)

---

## 2.4 Skill 2 — Zillow-Style Layer Toggle (v39)

**The Rule:** Filter ≠ Navigate. Never call `setView()` or `fitBounds()` on a layer toggle.

**Caz adaptation (tier-based, not RIA/Investor):**
```javascript
window.toggleMapLayer = function(tier) {
  // tier: 'T1', 'T2', 'T3', or 'all'
  // Just show/hide Leaflet layer groups — never touch the camera
  ['T1', 'T2', 'T3'].forEach(t => {
    const show = tier === 'all' || tier === t;
    const layer = tierLayers[t];
    if (show && !mapInstance.hasLayer(layer)) mapInstance.addLayer(layer);
    if (!show && mapInstance.hasLayer(layer)) mapInstance.removeLayer(layer);
  });
  renderMapSummary(tier, mapInstance.getBounds());
};
```

**Note:** map.html already has tier filters — ensure they don't call `setView()`. Audit existing toggle handler first.

**Estimated port effort:** 30 minutes

---

## 2.5 Skill 3 — Map Slide Drawer (v36/v37)

**What it does:**
Clicking any map dot or sidebar row opens a full slide-out drawer from the right with:
- Firm name, city/state, tier, contact name
- Stage selector (reads/writes to `pipelineState` Firestore collection)
- Score breakdown bars (6 animated)
- Firm details grid (AUM, advisors, tech, custodians)
- Enrichment section (expertise, investments — from EnrichmentEngine)
- 6-button workflow launcher

**Caz data mapping for drawer:**
```javascript
// AllPro field   → Caz equivalent
p.name            → f.name
p.aum             → f.aumD (display) or f.aum (numeric)
p.stage           → CAZDB.getFirmNote(f.id)  ← async fetch from Firestore
p.owner_name      → f.advs[0]?.name (from advisors array)
p.city + p.state  → f.city + ', ' + f.st
p.score           → f.score
p.tier            → f.tier
expertise data    → EnrichmentEngine.getFirm(f.name)
```

**Architecture:**
```html
<!-- Add to map.html — OUTSIDE the map container div -->
<div id="mapDrawer">...</div>
<div id="mapDrawerOverlay" onclick="closeMapDrawer()"></div>
```

**CSS skeleton:**
```css
#mapDrawer {
  position: fixed; top: 0; right: 0;
  width: 380px; height: 100vh;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1000;
}
#mapDrawer.open { transform: translateX(0); }
#mapDrawerOverlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999; }
#mapDrawer.open ~ #mapDrawerOverlay { display: block; }
```

**Estimated port effort:** 2–3 hours

---

## 2.6 Skill 4 — Marker Highlight System (v40)

**What it does:**
Clicking a dot highlights it gold (+4px radius). Sidebar row click highlights corresponding dot. Closing drawer resets.

**Caz adaptation:**
```javascript
// On map init — build lookup table keyed by firm.name
window._markerByName = {};
FIRMS.forEach(f => {
  const baseStyle = { radius: tierRadius(f.tier), fillColor: tierColor(f.tier),
                      color: '#fff', weight: 2, fillOpacity: 0.75 };
  const marker = L.circleMarker([f.lat, f.lng], baseStyle).addTo(tierLayers[f.tier]);
  window._markerByName[f.name] = { marker, baseStyle };
});

let _highlightedName = null;

function clearMapHighlight() {
  if (_highlightedName && window._markerByName[_highlightedName]) {
    const { marker, baseStyle } = window._markerByName[_highlightedName];
    marker.setStyle(baseStyle);
    _highlightedName = null;
  }
}

function highlightMapMarker(name) {
  clearMapHighlight();
  const entry = window._markerByName[name];
  if (!entry) return;
  entry.marker.setStyle({ fillColor: '#FFD700', weight: 3, fillOpacity: 1,
                           radius: entry.baseStyle.radius + 4 });
  entry.marker.bringToFront();
  _highlightedName = name;
}
```

**Estimated port effort:** 30 minutes

---

## 2.7 Skill 5 — Score Breakdown Bar System

**What it does:**
6-dimensional scoring with animated progress bars, color-coded per dimension.

**Suggested Caz dimensions:**
| Dimension | Max | Color | Caz Source |
|-----------|-----|-------|------------|
| AUM Size | 25 | `#3b82f6` | `f.aum` normalized |
| Advisor Count | 20 | `#22c55e` | `f.advN` |
| Alts Fit Score | 20 | `#f97316` | `f.score` |
| Platform Ready | 15 | `#a855f7` | `f.cais \|\| f.icap` |
| Lead Score | 10 | `#06b6d4` | `EnrichmentEngine.getFirmAvgScore(f.name)` |
| Tier Weight | 10 | `#ef4444` | T1=10, T2=6, T3=3 |

**Code pattern (direct copy from AllPro):**
```javascript
const scoreBarsHTML = dims.map(d => {
  const pct = (d.value / d.max * 100).toFixed(0);
  return `<div style="margin-bottom:7px">
    <div style="display:flex;justify-content:space-between;font-size:10px">
      <span>${d.label}</span><span>${d.value}/${d.max}</span>
    </div>
    <div style="background:var(--bg-input);border-radius:4px;height:6px">
      <div style="width:${pct}%;background:${d.color};height:100%;
           border-radius:4px;transition:width 0.5s ease"></div>
    </div>
  </div>`;
}).join('');
```

**Estimated port effort:** 1 hour

---

## 2.8 Skill 6 — Alfred Enrichment Merge

**Status in Caz:** ✅ Already built as `EnrichmentEngine`.

**For Alfred Phase 2 — extend `enrichment.js`:**
```javascript
// Add to EnrichmentEngine.init():
safeFetch('data/sec_adv_enrichment.json').then(function(advData) {
  if (!advData) return;
  // Merge sec_adv fields into firmData by name key (case-insensitive)
  Object.keys(advData).forEach(function(firmName) {
    const key = firmName.toLowerCase().trim();
    // find matching firm in firmData
    const match = Object.keys(firmData).find(k => k.toLowerCase().trim() === key);
    if (match) Object.assign(firmData[match], advData[firmName]);
    else firmData[firmName] = advData[firmName]; // new entry
  });
  // Secondary join via CRD: merge advisor-level Phase 2 data into advisorData
});
```

**Estimated port effort:** 1 hour (adapter only — EnrichmentEngine already exists and is robust)

---

## 2.9 Skill 7 — In-Drawer Workflow Launcher

**What it does:**
Action buttons in the map drawer that navigate to the right page, select the firm, and fire the right workflow.

**⚠️ CRITICAL Caz difference — No `navigateTo()`:**
Multi-page app requires `localStorage` bridge for cross-page state handoff:

```javascript
// Pattern: write → navigate → destination picks up on load
window.cazMapHandoff = function(firmId, firmName, targetPage, tab) {
  localStorage.setItem('cazHandoff', JSON.stringify({
    firmId,
    firmName,
    tab: tab || 'overview',
    action: null,
    ts: Date.now()
  }));
  window.closeMapDrawer();
  window.location.href = targetPage + '.html';
};

// On destination page (pipeline.html, activity.html, etc.) — add to DOMContentLoaded:
(function consumeHandoff() {
  const raw = localStorage.getItem('cazHandoff');
  if (!raw) return;
  const h = JSON.parse(raw);
  if (Date.now() - h.ts > 5000) { localStorage.removeItem('cazHandoff'); return; }
  localStorage.removeItem('cazHandoff');
  // pipeline.html: selectFirmById(h.firmId);
  // activity.html: prefillFirmName(h.firmName);
  if (h.tab) switchTab(h.tab);
})();
```

**Caz drawer button mapping:**
| Button | Action |
|--------|--------|
| Open Full Profile | `cazMapHandoff(f.id, f.name, 'pipeline')` |
| Generate Meeting Brief | `cazMapHandoff(f.id, f.name, 'pipeline', 'meeting')` |
| Log Activity | `cazMapHandoff(f.id, f.name, 'activity')` |
| SEC ADV Pull | `cazMapHandoff(f.id, f.name, 'intelligence')` |
| Add to Sequence | `cazMapHandoff(f.id, f.name, 'sequences')` |
| Email Personalizer | `cazMapHandoff(f.id, f.name, 'pipeline', 'email')` |

**Estimated port effort:** 2–3 hours

---

## 2.10 Skill 8 — Smart Batch Queue Builder

**What it does:**
Filter-driven batch selector for Alfred enrichment runs. Skips already-enriched firms.

**Caz-specific filters:**
- State: MN / WI / IA (`f.st`)
- Tier: T1 / T2 / T3 (`f.tier`)
- AUM band: <$100M / $100–500M / $500M+ (`f.aum`)
- Score range: slider on `f.score`

**Skip logic:**
```javascript
// Skip if firm already has Phase 2 data
const alreadyDone = firmData[f.name] && firmData[f.name].aum_exact;
```

**Estimated port effort:** 3–4 hours

---

## 2.11 Skill 9 — Mobile Detail Panel Overlay

**What it does:**
On mobile (≤768px), detail panel becomes full-screen overlay.

```css
@media (max-width: 768px) {
  .detail-panel {
    position: fixed; inset: 0;
    transform: translateY(100%);
    transition: transform 0.3s ease;
    z-index: 500;
  }
  .detail-panel.mobile-open { transform: translateY(0); }
}
```

**Status:** Sprint 13 added `mobile.css` for 5 pages. Verify that `pipeline.html` detail panel is included. If clicking a firm card on mobile shows nothing, this is the fix.

**Estimated port effort:** 1 hour (if not already done)

---

## 2.12 Geocoding Strategy (Blocker for Skills 1–4)

FIRMS records have `city`, `st`, `zip` but no `lat`/`lng`. Three options:

| Option | Cost | Method |
|--------|------|--------|
| **A — Alfred batch geocode via Phase 2** | $0 | `office_address` from ADV enrichment → Google Geocoding API → add to data.js |
| **B — City/state centroid table** | $0 | Use pre-built city centroid JSON. Less precise but instant. |
| **C — Google Maps Geocoding API batch** | ~$4 | 765 firms × $0.005/request. Direct batch. |

**Recommended:** Option A — wait for Alfred Phase 2 which delivers `office_address`. Feed that into a geocoding pass and write `lat`/`lng` directly into `data/data.js`. This way Phase 2 and geocoding are one Alfred job.

---

## 2.13 Alfred Enrichment — Full Data Fields Reference

### Phase 1 — Complete (loaded in EnrichmentEngine)
| Field | Type | Key | Description |
|-------|------|-----|-------------|
| `leadScore` | 0–100 | CRD | Per-advisor composite score |
| `role` | String | CRD | Title/role string |
| `expertise` | String | CRD | Comma-separated expertise areas |
| `investments` | String | CRD | Comma-separated investment types |
| `avgLeadScore` | Number | firmName | Firm-level average |
| `topAdvisors` | Array | firmName | Top advisor CRDs per firm |

**Coverage:** 8,128 advisors, 772 firms

### Phase 2 — Pending (`sec_adv_enrichment.json`)
| Field | Type | Description |
|-------|------|-------------|
| `aum_exact` | Integer | SEC-reported AUM (exact) |
| `aum_reported_date` | String | "2024-Q4" |
| `client_count` | Integer | Total clients |
| `employee_count` | Integer | Total employees |
| `advisor_count_sec` | Integer | SEC-registered advisors |
| `fee_type` | String | "AUM-Based" / "Hourly" / "Flat Fee" |
| `custodians` | Array | ["Schwab", "Fidelity"] |
| `services` | Array | ["Portfolio Mgmt", "Financial Planning"] |
| `compensation_type` | String | "Advisory Fees Only" / "Commissions" / "Both" |
| `office_address` | String | **Full street address — enables geocoding** |
| `phone` | String | Direct office phone |
| `website` | String | Firm website URL |
| `email` | String | Public contact email |
| `has_disciplinary` | Boolean | Any FINRA disclosures |
| `sec_registered` | Boolean | SEC vs state-registered |
| `succession_risk_score` | 0–100 | Age + solo + size formula |
| `re_mentions_adv` | Boolean | Mentions real estate in ADV |
| `data_source` | String | "sec_iapd_phase2" |
| `enriched_at` | String | ISO date |

**Dual output format:**
- `sec_adv_enrichment.json` → Caz (loaded via EnrichmentEngine)
- `sec_adv_enrichment.js` → AllProCC (browser global)

---

## 2.14 AI Crew Cost Map

| Job Type | Model | Cost | When to Use |
|----------|-------|------|-------------|
| **Data Pull** | None (REST API) | $0 | SEC, FINRA, public APIs |
| **AI Inference** | Perplexity Sonar | $$$ | Live web research, dark/unstructured data |
| **Code + Build** | Gemini 2.5 Pro (Vera/Antigravity) | $$ | Architecture, JS, CSS, deployment |
| **Agentic Tasks** | OpenClaw/GPT-4o (Alfred) | $$ | Script writing, file management, git ops |
| **Simple Tasks** | Lighter model (Mini Nate) | $ | Formatting, summaries, quick lookups |

**Rule:** Never use Perplexity for SEC + FINRA data — it's a structured public database = $0. Perplexity is a precision tool for dark data only.

---

## 2.15 Recommended Caz Build Sequence

### Phase A — Data Foundation (do first, unblocks everything)
1. **Alfred Phase 2** — SEC ADV enrichment run (765 firms, ~25 min, $0 API cost)
2. **Geocoding pass** — Use `office_address` from Phase 2 → add `lat`/`lng` to `data/data.js`
3. **Extend EnrichmentEngine** — Wire Phase 2 JSON into `enrichment.js` init (Skill 6 adapter)

### Phase B — Map Intelligence (requires lat/lng)
4. **Port Skill 1 + 2** — Viewport sidebar + tier toggle (purely additive to `map.html`)
5. **Port Skill 3** — Map slide drawer (additive, lives outside map container div)
6. **Port Skill 4** — Marker highlight system (30 min, zero regression risk)

### Phase C — Pipeline Enhancement
7. **Port Skill 5** — Score breakdown bars in `pipeline.html` detail panel
8. **Check Skill 9** — Mobile overlay in pipeline.html (verify, may already exist in `mobile.css`)
9. **Port Skill 7** — Workflow launcher with `localStorage` handoff pattern

### Phase D — Intelligence & Ops
10. **Port Skill 8** — Batch queue builder (most complex, do last)
11. **Add version tags** — `?v=17` on all script/CSS tags, bump SW to `caz-v17`

---

## 2.16 Priority Gaps Table

| Gap | AllPro | Caz | Est. Build | Blocker |
|-----|--------|-----|------------|---------|
| Score breakdown bars | ✅ | ❌ | 1 hr | None — direct port |
| Map slide drawer | ✅ | ❌ | 2-3 hrs | Needs lat/lng |
| Viewport-aware sidebar | ✅ | ❌ | 1-2 hrs | Needs lat/lng |
| Marker highlight | ✅ | ❌ | 30 min | Needs lat/lng |
| **lat/lng on FIRMS** | ✅ | ❌ | ~$4 + Alfred | Phase 2 first |
| **Alfred Phase 2 data** | Pending | ❌ | ~25 min Alfred run | Priority #1 |
| Direct email / phone | Pending Phase 2 | ❌ | Alfred run | Enables 1-click outreach |
| Succession risk score | Pending Phase 2 | ❌ | Alfred run | Auto-scored 0–100 |
| Workflow launcher | ✅ | ❌ | 2-3 hrs | `localStorage` handoff (no navigateTo) |
| Version / cache busting | ✅ `?v=40` | ❌ | 15 min | Add before next deploy |
| Mobile detail overlay | ✅ | ❓ check | 1 hr | Verify pipeline.html mobile |
| Pipeline drag-and-drop | ❌ | ❌ | 4-6 hrs | Backlog |

---

## 2.17 Caz-Specific Technical Notes (Don't Miss These)

### 1. EnrichmentEngine is more advanced than AllPro's merger
Don't port AllPro's `applyRIAEnrichment()`. Extend Caz's `EnrichmentEngine` instead.
It already has async loading, graceful fallback, CRD + name dual-key lookup, and render helpers.

### 2. AIEngine has SkillLogger built in
Every AI call is logged to Firestore `skillRuns` + `ai_usage` automatically.
Don't add custom logging — it's already instrumented.

### 3. Pipeline stage is Firestore-backed
Pipeline state lives in `pipelineState` Firestore collection, not in the FIRMS array.
When building the map drawer, fetch stage via `CAZDB.getFirmNote(firmId)` and merge with the static FIRMS data.

### 4. Multi-Page = localStorage Bridge for cross-page handoffs
The single most important architectural difference from AllPro.
Pattern: write intent to `localStorage` → navigate → destination reads on `DOMContentLoaded` → clear after consuming (or 5s timeout).

### 5. `data.js` uses `var`, not `const`
This is intentional — required for `firm-exclusions.js` to safely reassign the `FIRMS` variable at runtime.
Do not change `var FIRMS` to `const` or `let`.

### 6. sequenceAdvancer is a scheduled Cloud Function
It runs hourly server-side and advances due outreach touches.
If sequence steps seem stale, check `functions/index.js` + Firebase Functions logs before debugging client-side.

---

## 2.18 Related Handoff Docs (Local)

| Doc | Path |
|-----|------|
| Sprint 13 Status | `/handoffs/advisors-outreach/SPRINT_13_STATUS.md` |
| March 18 Handoff | `/handoffs/caz-cc-handoff-mar18.md` |

All under: `/Users/kosalprum/Library/Mobile Documents/com~apple~CloudDocs/Alfred clawbot /handoffs/`

---

*Single source of truth for the Caz Command Console — architecture, backlog, and AllPro skills transfer.*
*Next update: After Alfred Phase 2 delivery + geocoding pass.*
*Maintainer: Antigravity (Big Nate)*

---

## 2.19 UMW Cap Formation Module (April 1–2, 2026)

> **Status:** Live at `https://www.cazcc.com/umw.html` · Committed as `v17f` on `origin/main`

### What it is
A private, interview-prep tab inside the CAZ Command Console for the Houston CAZ Investments meeting.
Self-contained module — zero risk to main platform (no Firestore, no Firebase dependencies).
All data is hardcoded JSON in `umw.html`.

### Files
| File | Purpose |
|------|---------|
| `public/umw.html` | Full UMW page — data, logic, HTML all self-contained |
| `public/css/umw.css` | ~920 lines — institutional design, light-mode scope, workflow tab styles |

### Architecture
- **Light mode** scoped to `.umw-light` class on `main-content` — sidebar keeps dark theme (nav stays visible)
- **Print-ready** (`@media print`) — hides sidebar/drawer, forces white background
- **Zero Firestore** — all data lives in `UMW_TARGETS`, `UMW_CONTACTS`, `UMW_PLAN`, `UMW_BUILT` arrays inside the HTML
- **localStorage** persistence for workflow logs and notes (per-firm, keyed `umw_wf_{firmId}`)

### Drawer Workflow System (v17f)
3-tab drawer triggered by clicking any target firm row:
- **📋 Overview** — status, fit score, relationship strength, strategic rationale, next step
- **⚡ Workflow** — 8-stage progress track (auto-positioned by status), 6 quick-action buttons, timestamped activity log
- **📝 Notes** — per-firm private textarea, saved to localStorage, char count, save confirmation

### Vera Review Changes Applied (April 2)
- Personal positioning statement added below page title
- Mairs & Power: reframed as "mutual education, long-horizon strategic relationship" (not near-term pipeline)
- Baird: moved T1 → T2, labeled "Strategic Platform (Long Diligence Runway)"
- 3 new firms added: Securian Financial (T2), Creative Planning (T2), D.A. Davidson (T2)
- Total target universe: **27 firms** (was 24)
- 30-60-90 plan rewritten: realistic verbs ("initiate," "prepare," "begin"), Year 2 framing added
- AI asset bullet reframed: "AI compresses prep; I own the thesis and the relationship"

### Navigation
- CAZ Buildout link added to `nav.js` sidebar (gold, separated by top border, `data-page="umw"`)

---

## 2.20 NEXT SESSION BRIEFING — Priority Workstreams

> **Read this first in a new chat. All items below are the next action queue.**

### 🔴 Priority 1 — UMW Prospect List (Eric's Real Network)
**Status:** Waiting on Eric's list. Template created at `/Users/kosalprum/Desktop/CazCC/UMW_PROSPECT_LIST_INPUT.csv`

**What to do when Eric sends the list:**
1. Parse firm names, city/state, channel, platform, relationship type, priority
2. Tag platform: Schwab / Fidelity / Cambridge (active) / LPL (expected) / Osaic / Cetera / Ameriprise
3. Tier into T1 (10–15 firms) / T2 (25–40) / T3 / Observation band
4. Replace placeholder `UMW_TARGETS` array in `umw.html` with real firms
5. Update KPI cards: total count, T1 count, warm relationships count
6. Update territory thesis copy: add "Initial T1/T2 universe built from existing relationships"

**Confirmed real names to include (Tier 1 candidates):**
- Boulay (MN — CPA-Wealth, likely Schwab)
- Berger (specify which — Berger Financial Group?)
- Envoi (add channel + platform when known)
- Vector (add channel + platform when known)

**Platform reality to bake into page copy:**
> "Primary custodial access via Schwab and Fidelity. Additional reach through Cambridge Investment Research (active), LPL (expected), and Osaic/Cetera/Ameriprise (accessible). Coverage prioritizes firms already on CAZ-supported platforms."

Remove Baird completely or keep only as "long-horizon observation" with no priority tier.

### 🟡 Priority 2 — Alfred v17 Integration Verification
Alfred shipped `v17e` (the `localStorage` handoff receiver in pipeline + activity). Verify live:
- Open `cazcc.com/map.html` → click a firm → click "Open in Pipeline" button in drawer
- Should navigate to `pipeline.html`, auto-select the firm, switch to correct tab, and show a toast
- If broken: check `pipeline-engine.js` and `activity.js` for the `cazHandoff` localStorage consumer

### 🟢 Priority 3 — CAZ Backlog (when time allows)
- Port Skill 5 (score breakdown bars) into `pipeline.html` detail panel — 1 hr, no blockers
- Audit `map.html` tier toggle to confirm no `setView()` reset on layer change
- SW cache version — Alfred is at `caz-v17b`, ensure UMW deploy didn't create a cache mismatch

### 🔵 Priority 4 — Alfred Phase 2 (coordinate separately)
SEC ADV enrichment data is partially committed (`sec_adv_enrichment.json` in repo).
Next Alfred job: geocoding pass using `office_address` field → write `lat`/`lng` into `data/data.js`.
This unblocks Skills 1–4 (map viewport sidebar, marker highlight, etc.).

---

### Git State (as of April 2, 2026 ~7:30pm CT)
| Branch | Commit | Note |
|--------|--------|------|
| `origin/main` | `dc032cc` | v17f (UMW) rebased cleanly on Alfred's v17e |
| Local `main` | `dc032cc` | In sync |

**Unstaged (do not touch — Alfred's cleanup from other projects):**
- Deleted CAZ sprint docs, `app.js`, `data.js`, etc. at root level — these are from an older repo structure Alfred is cleaning up
- Other project status files (`yachtzee-site`, `falsecastpod`, etc.)

---

## 2.21 Update — April 3–13, 2026

> **Last updated:** 2026-04-13 by Antigravity (Big Nate)
> **Read §2.19 (UMW module) and §2.20 (priority queue) before this section.**

---

### ✅ Completed Since Last Update

#### Alfred OCR → Firestore Import (April 3–4)
Full session documented in `ALFRED_IMPORT_HANDOFF.md`. Summary:

| Item | Status |
|------|--------|
| Tesseract OCR on 3 Alger PDFs (82 pages) | ✅ |
| Parser → 2,990 structured advisor records (`advisors_complete.json`) | ✅ |
| Firestore import → `manualContacts` collection (`advisorsoutreach` project) | ✅ 2,990 docs |
| GitHub push to `alfred-clawbot/scripts/caz-import/` | ⏳ Alfred pending |

**Key lessons from that session (do not repeat these mistakes):**
- Tesseract on this Mac **cannot read from `/tmp/`** — always render PNGs to `~/Desktop/CazCC/`
- iCloud Drive (`~/Library/Mobile Documents/`) **deadlocks Node.js** batch I/O — always work from Desktop
- Run Python scripts directly in Terminal, **not through Antigravity** (subprocess cancellations)
- Firestore batch limit: use **400 ops** as safe ceiling (hard limit is 500)

---

#### Firestore Collection Status (as of April 13)
| Collection | Count | Status |
|---|---|---|
| `manualContacts` | 2,990 | ✅ Live — UMW Alger advisors |
| `activities` | Live | ✅ |
| `pipelineState` | Live | ✅ |
| `active_sequences` | Live | ✅ |

---

### 🔴 UPDATED Priority Queue (April 13)

#### Priority 1 — GitHub Push of Import Scripts (Alfred Job)
Push `advisors_complete.json` + `firestore_import.js` to `kprum1/alfred-clawbot > scripts/caz-import/`:

```bash
cd /tmp && git clone https://github.com/kprum1/alfred-clawbot.git
mkdir -p /tmp/alfred-clawbot/scripts/caz-import
cp /Users/kosalprum/Desktop/CazCC/advisors_complete.json /tmp/alfred-clawbot/scripts/caz-import/
cp /Users/kosalprum/Desktop/CazCC/firestore_import.js /tmp/alfred-clawbot/scripts/caz-import/
cd /tmp/alfred-clawbot
git add scripts/caz-import/
git commit -m "feat: add 2990 UMW advisor records + Firestore import script"
git push origin main
```

---

#### Priority 2 — UMW Prospect List Update (Waiting on Eric)
Template ready at `/Users/kosalprum/Desktop/CazCC/UMW_PROSPECT_LIST_INPUT.csv`.

When Eric provides his real network list:
1. Parse: firm name, city/state, channel, platform, relationship type, priority
2. Tag platform: Schwab / Fidelity / Cambridge / LPL / Osaic / Cetera / Ameriprise
3. Tier: T1 (10–15 firms) / T2 (25–40) / T3 / Observation
4. Replace `UMW_TARGETS` array in `public/umw.html` with real data
5. Update KPI cards (total count, T1 count, warm relationships count)

**Confirmed T1 candidates:** Boulay (MN), Berger Financial Group, Envoi, Vector

---

#### Priority 3 — Alfred Phase 2 — SEC ADV Enrichment
`sec_adv_enrichment.json` is partially committed in the Caz repo.
Next Alfred job: **geocoding pass** using the `office_address` field → write `lat`/`lng` into `data/data.js`.

Why this matters: **Skills 1–4 (map viewport sidebar, slide drawer, marker highlight) are all blocked on lat/lng.**

```bash
# Alfred geocoding pass — pseudo-code
# Input: data/sec_adv_enrichment.json (has office_address per firm)
# Output: data/geocoded_firms.json { firmName: { lat, lng } }
# Then: merge into data/data.js FIRMS array
```

---

#### Priority 4 — Verify Alfred v17e localStorage Handoff Live
Per §2.20: Alfred shipped the `cazHandoff` localStorage consumer in `pipeline.html` and `activity.html`.

**Verify:**
1. Open `cazcc.com/map.html` → click any firm dot → click "Open in Pipeline"
2. Should navigate to `pipeline.html`, auto-select the firm, switch to correct tab
3. If broken: check `pipeline-engine.js` + `activity.js` for `cazHandoff` consumer block

---

### Git State (as of April 13, 2026)
| Branch | Commit | Note |
|--------|--------|------|
| `advisors-outreach/origin/main` | `dc032cc` | v17f (last known — UMW rebased on v17e) |
| `alfred-clawbot/origin/main` | — | Import scripts push pending |

**Always run `git log --oneline -5` before writing any code.** Alfred may have committed between sessions.

---

### Files to Know (Local — April 13)
| File | Path | Status |
|------|------|--------|
| Alger OCR raw | `/Users/kosalprum/Desktop/CazCC/alger_ocr_raw.txt` | ✅ 549K |
| Parsed JSON | `/Users/kosalprum/Desktop/CazCC/advisors_complete.json` | ✅ 2,990 records |
| UMW prospect template | `/Users/kosalprum/Desktop/CazCC/UMW_PROSPECT_LIST_INPUT.csv` | ✅ Waiting on Eric |
| Vera review doc | `/Users/kosalprum/Desktop/CazCC/VERA_REVIEW_UMW_CAP_FORMATION.md` | ✅ Apr 13 |
| Alfred import handoff | `/Users/kosalprum/Desktop/CazCC/ALFRED_IMPORT_HANDOFF.md` | ✅ Full session log |
| Service Account Key | `/Users/kosalprum/Downloads/advisorsoutreach-firebase-adminsdk-fbsvc-320f4a5a4b.json` | ✅ Never commit |

---

*Section added 2026-04-13 by Antigravity (Big Nate). Next update: after Alfred Phase 2 geocoding + Eric's UMW list.*

