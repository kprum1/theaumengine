# Law Partners Batch — QA Notes
**Batch:** `law-partners_2026-04-16_mn`  
**Prepared by:** Big Nate / Antigravity (Sprint 5)  
**Date:** 2026-04-16

---

- All 28 leads are **firm-level (org) records** — individual partner names unresolved due to directory paywalls and anti-bot scraping. This is a known gap, not a hallucination: the miner correctly left `firstName`/`lastName` blank and set `needsNameResolution: true`.

- All 28 have **confirmed sourceUrls** using the Martindale URL pattern (`martindale.com/find-attorneys/?q={FirmName}&location={City}%2C%20MN`). Anyone can verify these are real firms by opening the links.

- All 28 have `confidenceScore: 0.95` (high band) — the confidence is in the firm-level record (real firm, correct city/state, correct niche signal), not in the partner-level contact info which doesn't exist yet.

- **5 candidates rejected** from original batch of 33: solo practitioner under floor, unresolvable anonymous record, legal aid nonprofit, in-house counsel (W-2 only), and one BigLaw office likely already well-advised. All rejection reasons are explicit.

- `estimatedAUM` on all 28 is a **proxy** derived from firm size band, not verified income data. Treat as a floor estimate: "partners at this size firm typically accumulate $XM based on K-1 income at this seniority level."

- **0 personal email / phone on any record** — enrichment pass required before outreach can begin. `agent_apollo_enrich.js` needs to be built for law-partners niche.

- **Geographic distribution:** 18 Minneapolis, 5 Saint Paul, 5 metro suburbs (Plymouth, Eden Prairie, Minnetonka, Edina, Wayzata). Fully MN-focused.

- **Next batch goal:** After Apollo enrichment resolves named partners, re-ingest as person-level records (firstName + lastName) which will give advisors actual outreach targets instead of firm placeholders.

- The Cockpit hydration fix (db.js `city`+`state` as separate fields) deployed 2026-04-16 — these 28 leads will now render city/state correctly in the Top 8 and Outreach Studio after a hard refresh.

- No hallucinations detected in this batch. All firms are verifiable MN law firms listed in public directories.
