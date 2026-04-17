# HANDOFF_C32.md — Sprint C32: Western Suburbs Geo-Focus + Leads Refinement
**Session Date:** 2026-04-17
**Time:** ~1:42 PM CT
**Platform:** The AUM Engine — https://theaumengine.web.app
**Project Root:** /Users/kosalprum/Documents/AdvDiamondMining
**Firebase Project:** theaumengine
**Node Path:** /opt/homebrew/opt/node/bin/node
**HEAD Commit:** 5051748
**Last Audit:** 10/10 — All systems go
**master_leads:** 487 docs
**Production URL:** https://theaumengine.web.app (deployed this session)

---

## STRATEGIC CONTEXT — READ FIRST

### The Pivot
The AUM Engine is no longer a SaaS product to sell to advisors. It is now:
> A proprietary internal leads engine for Kosal Prum and his business partner
> Jeremy Jackson — Private Wealth Advisor at Ameriprise, Wayzata MN.

Kosal is pursuing the Branch Manager role at the Wayzata Ameriprise branch.
If appointed, he will use the engine to:
1. Give Jeremy and recruited advisors a pre-built client pipeline in their niche
2. Recruit new advisors to the branch using Engine 1 (allprocmd.com)
3. Track recruiting conversations in Engine 2 (cazcc.com)
4. Source and route prospects in Engine 3 (theaumengine.web.app)

### Jeremy Jackson — The Primary Advisor
- Name: Jeremy Jackson
- Title: Private Wealth Advisor, Ameriprise Financial
- Office: 701 Lake St E Ste 290, Wayzata MN 55391
- Phone: 612.486.0311
- Email: Jeremy.Jackson@ampf.com
- Profile: https://www.ameripriseadvisors.com/Jeremy.Jackson/
- Market: Wayzata and western MN suburbs — UHNW territory
  Lake Minnetonka shoreline, Orono, Deephaven, Excelsior, Minnetonka
  Median home values $800K–$2M+

### The Three-Engine Stack
  Engine 1: allprocmd.com     → RIA firm intelligence for ADVISOR RECRUITING
  Engine 2: cazcc.com         → Pipeline CRM for tracking recruiting conversations
  Engine 3: theaumengine.web.app → CLIENT PROSPECT engine (this codebase)

Strategy doc: /Users/kosalprum/.gemini/antigravity/brain/ef702a3f-c171-4199-8436-36500f77b234/three_engine_growth_stack.md

---

## COMPLETED THIS SESSION (C30 + C31 + C31b)

C30 (prior session):
- AZ Probate 4 cases resolved, lead_ingest_agent patched for wrapped JSON
- A10 Tradesman: 18 leads ingested → Germshied Wealth Management
- A11 Pro Athletes: 20 leads (NFL, NBA, MLB, NHL) ingested
- Apollo enrichment script built: scripts/agent_apollo_enrich.js
- A14 Yacht miner built: scripts/agent_yacht_miner.js

C31 (this session):
- Cockpit blank name fix — 8 display locations now show company name fallback
  data.js: getDisplayName(p) + getInitials(first, last, company)
  app.js: niche drawer + prospect drawer
  pages.js: command center, scoreboard, outreach studio, pipeline board, meeting tables
- A12 HENRYs: 20 leads ingested (15 H-1B + 5 S-1 pre-IPO) → Germshied
- Apollo API issue: Free plan blocks /v1/people/search (paid $49+/mo)
  Header fix applied: X-Api-Key (was incorrectly in request body)
  Conclusion: Apollo API not worth it at this stage
  Apollo browser EXTENSION (already installed) is the right tool
- Manual name resolution: scripts/resolve_names_manual.js (NEW)
  Generates LinkedIn+Google lookup checklist per unresolved lead
  --apply mode merges resolved names back into batch for re-ingest
  Tradesman checklist: scripts/staging/manual_resolution/manual_resolution_tradesman_2026-04-17.json
- Firebase deploy: theaumengine.web.app updated (blank name fix live)
- Yacht seed expanded: 30 → 50 records (scripts/data/yacht_owners_seed.csv)
- Apollo.json created: scripts/config/apollo.json (key: tgvWV0hBhNtbR4xwxS9QfQ)

---

## CURRENT PIPELINE STATE

master_leads total: 487 docs
Advisors provisioned: 6 (5 pilot + Kosal/operator)
Niches covered: 14/14
Routing queue pending: 0
Audit score: 10/10

Advisor Loads:
  Fin-Tegration (Kosal): 410
  Patrick Wight:         128
  Ray Uncle:             121
  Matt Germshied:         99
  Chuck Cooper:           88
  Andy Belly:             73

NOTE: Jeremy Jackson is NOT yet in advisor_pool. Add him first in C32.

---

## C32 MISSION: WESTERN SUBURBS GEO-FOCUS

### Target Geography (Jeremy's territory)

City          | County   | Key Zips            | Why High Value
Wayzata       | Hennepin | 55391               | Jeremy's office. $1.8M median. UHNW.
Orono         | Hennepin | 55356, 55364        | Lake Minnetonka. $2M+ median.
Minnetonka    | Hennepin | 55305, 55343, 55345 | Large professional population
Edina         | Hennepin | 55424, 55435, 55436 | Physician + attorney heavy. Old money.
Eden Prairie  | Hennepin | 55344, 55346, 55347 | Business owner + C-suite
Plymouth      | Hennepin | 55441, 55446, 55447 | UnitedHealth HQ corridor
Minnetrista   | Hennepin | 55364               | Highest per-capita income in MN
Excelsior     | Hennepin | 55331               | High-net-worth on the lake
Deephaven     | Hennepin | 55331               | Smallest city, highest wealth density
Chaska        | Carver   | 55318               | Growing business owner / tradesman
Chanhassen    | Carver   | 55317               | Large employer cluster. HENRYs.

### High-Value Niches for This Market
1. Physicians/Dentists — Hennepin Healthcare, Park Nicollet, M Health Fairview
2. C-Suite — UnitedHealth Group (Minnetonka), Cargill (Wayzata), Polaris (Medina)
3. Business Owners — Edina, Eden Prairie, Chaska: $5M–$50M businesses
4. Law Partners — Several large firms have Edina/Mpls offices
5. HENRYs — Plymouth (UnitedHealth/Optum) and Eden Prairie (Cargill divisions)
6. Aircraft Owners — Flying Cloud Airport (FCM) Eden Prairie — UHNW pilots
7. Yacht/Boat Owners — Lake Minnetonka: 14,000+ acres, highest watercraft in MN
8. Tradesman — Plymouth/Eden Prairie/Chaska (HVAC, plumbing, electrical, roofing)

---

## PRIORITY BUILD LIST FOR C32

### Priority 1 — Add Jeremy to advisor_pool (10 min)
Add via Firestore console or provision script:
{
  advisorId: "jeremy_jackson_ampf",
  name: "Jeremy Jackson",
  firm: "Ameriprise Financial — Wayzata",
  email: "Jeremy.Jackson@ampf.com",
  phone: "612.486.0311",
  nicheIds: ["physicians", "dentists", "business-owners", "c-suite-executives",
             "law-partners", "henrys", "high-earning-tradesman", "aircraft-owners",
             "yacht-owners", "inheritance"],
  states: ["MN"],
  geoFocus: {
    cities: ["Wayzata","Minnetonka","Edina","Eden Prairie","Plymouth",
             "Orono","Excelsior","Deephaven","Minnetrista","Chaska","Chanhassen"],
    counties: ["Hennepin","Carver"],
    zips: ["55391","55356","55364","55305","55343","55345",
           "55424","55435","55436","55344","55346","55347",
           "55441","55446","55447","55331","55318","55317"]
  },
  maxLeads: 500,
  currentLoad: 0,
  status: "active",
  tier: "pilot"
}

### Priority 2 — Geo-Focus Mining Agents

PHYSICIANS / DENTISTS (NPI supports city+state filtering):
  node scripts/agent_physicians_miner.js --geo "Eden Prairie, MN" --limit 30
  node scripts/agent_physicians_miner.js --geo "Plymouth, MN" --limit 30
  node scripts/agent_physicians_miner.js --geo "Edina, MN" --limit 30
  node scripts/agent_physicians_miner.js --geo "Minnetonka, MN" --limit 30

C-SUITE (add to employer seed list in agent_csuite_miner.js):
  UnitedHealth Group — Minnetonka (70,000+ employees)
  Cargill — Wayzata (largest US private company)
  Polaris Industries — Medina
  Donaldson Company — near Eden Prairie
  SPS Commerce — Plymouth
  Stratasys — Eden Prairie

AIRCRAFT OWNERS (FAA registry):
  Filter by home airport: FCM (Flying Cloud, Eden Prairie MN)
  FCM is one of the busiest GA airports in MN — many UHNW pilots
  Owner state: MN, County: Hennepin

YACHT / BOAT OWNERS (USCG + Lake Minnetonka):
  State: MN, County: Hennepin
  Marina seeds to add to yacht_owners_seed.csv:
    Wayzata Yacht Club
    Excelsior Bay Marina
    Lord Fletcher's Marina (Spring Park)
    Shorewood Marina
    Minnetonka Boat Works (Wayzata)
  Lake Minnetonka has highest concentration of registered watercraft in MN

TRADESMAN (BBB/SOS):
  Refocus from broader Twin Cities to:
  Wayzata / Minnetonka / Eden Prairie / Plymouth / Chaska / Chanhassen
  These are high-growth construction corridors

HENRYS (DOL H-1B):
  Add to TARGET_EMPLOYERS in agent_henrys_miner.js:
    UnitedHealth Group / Optum — Minnetonka/Eden Prairie (huge H-1B filer)
    Cargill — Wayzata
    Boston Scientific — Maple Grove (near Plymouth)

PROBATE / INHERITANCE:
  Hennepin County probate portal: https://www.mncourts.gov/
  Wayzata / Lake Minnetonka estates = very high value
  Filter: Hennepin County + filed 2026 + estate value indicators

### Priority 3 — Resolve 33 Pending Name Resolution Leads

TRADESMAN (18 leads):
  Lookup sheet: scripts/staging/manual_resolution/manual_resolution_tradesman_2026-04-17.json
  Process: Open each LinkedIn URL → Apollo browser extension → fill name/email
  Apply: node scripts/resolve_names_manual.js --apply \
    --file scripts/staging/manual_resolution/manual_resolution_tradesman_2026-04-17.json \
    --batch tradesman
  Re-ingest: node scripts/lead_ingest_agent.js --file scripts/staging/enriched/...

HENRYS H-1B (15 leads):
  Generate checklist: node scripts/resolve_names_manual.js --batch henrys
  Same LinkedIn + Apollo extension process

### Priority 4 — FL Probate Vera Dispatch
Vera task (send to Perplexity Computer):
  File: scripts/staging/vera_probate_fl_dispatch_2026-04-17.json
  Go to myflcourtaccess.com → Case Search → County: Collier
  Case Type: Probate → Filed After: 2026-01-17
  Return all case names, numbers, and filing dates in the JSON format
  specified in the dispatch file's "requiredOutputFormat" field.

### Priority 5 — FINRA Advisor Recruiter Agent (for Branch Manager pitch)
Build: scripts/agent_advisor_recruiter.js
Source: FINRA BrokerCheck API (public, free, no key)
API: https://api.brokercheck.finra.org/firm/search?query=...
Target: Registered advisors in Hennepin County MN
Filter: wirehouse firms (Merrill, Morgan, UBS, Edward Jones, Raymond James)
        5–20 years registered, no disciplinary history, MN licensed
Output: Scored recruitable advisor candidates → feeds allprocmd.com pipeline

---

## ESSENTIAL COMMANDS

# Audit
/opt/homebrew/opt/node/bin/node scripts/audit_leads.js

# Deploy
/usr/local/bin/firebase deploy --only hosting --project theaumengine

# Mine → Scrub → Ingest → Route pipeline
/opt/homebrew/opt/node/bin/node scripts/agent_physicians_miner.js --geo "Plymouth, MN" --limit 30
/opt/homebrew/opt/node/bin/node scripts/scrub_leads.js --file scripts/staging/raw/<file>.raw.json
/opt/homebrew/opt/node/bin/node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/<file>.scrubbed.json
/opt/homebrew/opt/node/bin/node scripts/trigger_routing.js

# Name resolution
/opt/homebrew/opt/node/bin/node scripts/resolve_names_manual.js --batch tradesman
/opt/homebrew/opt/node/bin/node scripts/resolve_names_manual.js --batch henrys
/opt/homebrew/opt/node/bin/node scripts/resolve_names_manual.js --apply \
  --file scripts/staging/manual_resolution/manual_resolution_tradesman_2026-04-17.json \
  --batch tradesman

---

## START NEXT SESSION WITH

Read HANDOFF_C32.md first.

HEAD: 5051748 | master_leads: 487 | Audit: 10/10
Production: https://theaumengine.web.app

STRATEGIC PIVOT:
  Internal leads engine for Kosal + Jeremy Jackson (Ameriprise Wayzata).
  NOT a SaaS product. Focus on western Minneapolis suburbs.
  Jeremy's profile: https://www.ameripriseadvisors.com/Jeremy.Jackson/
  Target territory: Wayzata, Minnetonka, Edina, Eden Prairie, Plymouth,
                    Orono, Excelsior, Deephaven, Chaska, Chanhassen
                    (Hennepin + Carver counties)

PRIORITY ORDER:
  1. Add Jeremy to advisor_pool (template in Priority 1 section above)
  2. Geo-focused physician mine: Plymouth, Edina, Eden Prairie
  3. Geo-focused C-suite mine: UnitedHealth (Minnetonka), Cargill (Wayzata)
  4. Flying Cloud Airport (FCM) aircraft owner mine
  5. Lake Minnetonka yacht/USCG mine
  6. Resolve 18 tradesman names via LinkedIn + Apollo extension
  7. FL Probate Vera dispatch
  8. Build agent_advisor_recruiter.js (FINRA BrokerCheck)

Three-engine strategy doc:
/Users/kosalprum/.gemini/antigravity/brain/ef702a3f-c171-4199-8436-36500f77b234/three_engine_growth_stack.md
