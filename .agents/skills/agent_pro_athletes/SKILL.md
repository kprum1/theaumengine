---
name: agent_pro_athletes
nicheId: pro-athletes
version: "1.0"
script: Manual — Spotrac + Over The Cap + ESPN transactions
dataSource: Spotrac, Over The Cap, Baseball Reference, ESPN, HoopsHype (all free, public)
aum_floor: "$1M+ (active roster)"
---

# Agent: Pro Athletes Lead Miner 🏆
**Niche:** Pro Athletes (`pro-athletes`)  
**Data sources:** Public sports contract databases + sports news transactions feeds  
**Why it works:** Every professional contract is public data. Every trade and signing is news. This niche has the most TIME-SENSITIVE outreach window of any niche.

---

## Primary Sources by Sport

### NFL — Over The Cap
```
Contracts: https://overthecap.com/contracts
Free agents: https://overthecap.com/free-agents
Rookie signings: https://overthecap.com/draft
```
Filter: Guaranteed value > $1M, active roster, or just signed

### NBA — Basketball Reference + HoopsHype
```
Contracts: https://hoopshype.com/salaries/
Stats/rosters: https://www.basketball-reference.com/contracts/
Free agency: https://www.basketball-reference.com/friv/free_agents.html
```

### MLB — Spotrac + Baseball Reference
```
Contracts: https://www.spotrac.com/mlb/contracts/
Free agents: https://www.spotrac.com/mlb/free-agents/
Arbitration cases: https://www.spotrac.com/mlb/arbitration/ ← new wealth event
```

### NHL — PuckPedia
```
Contracts: https://puckpedia.com/contracts
```

### PGA Tour — PGA Tour Stats
```
Money leaders: https://www.pgatour.com/stats/stat.109.html
```

---

## ESPN Transactions Feed (Real-Time)

```
NFL: https://www.espn.com/nfl/transactions
NBA: https://www.espn.com/nba/transactions
MLB: https://www.espn.com/mlb/transactions
```

Every trade, signing, and release is logged here. **New signing = outreach now.**

---

## The Career Window Problem (Your Hook)

The average professional playing career:
- NFL: 3.3 years
- NBA: 4.5 years
- MLB: 5.6 years
- NHL: 5.0 years

Most athletes have **9–12 years of peak earning compressed into a career**, then 50+ years of post-career life to fund. And most sign their first contract without a financial advisor in place.

---

## Ideal Prospect Profile

| Signal | Criteria |
|---|---|
| **League** | NFL, NBA, MLB, NHL, MLS, PGA, UFC |
| **Career stage** | Years 1–8 (highest urgency — no advisor yet) |
| **Contract value** | > $1M guaranteed |
| **Age** | 22–35 (active career) OR 30–40 (recently retired — transition moment) |
| **Agent relationship** | Agent known — can approach through agent channel |

---

## Timing Signals (Prioritized)

1. 🔴 **Rookie signing** — first professional contract, no advisor, large bonus incoming
2. 🔴 **Contract year** — entering free agency, major life decision
3. 🟡 **New signing/trade** — new city, new team, new financial situation
4. 🟡 **Career injury** — unexpected income disruption, planning suddenly urgent
5. 🟢 **Extension** — locked in, more stable but still needs planning
6. 🟢 **Retirement announcement** — transition moment, income cliff

---

## The Agent Channel

Most pro athletes have sports agents. The agent is the gatekeeper — but also an ally.

**COI Strategy for athletes:**
- Find the agent: `https://www.spotrac.com/nfl/agents/` (NFL agents listed publicly)
- Target agents with multiple young clients (one warm intro = multiple leads)
- Message angle to agents: "We specialize in financial planning for athletes during the contract window — we'd be a complement to your service, not a conflict."

---

## Red Flags — Disqualify

- ❌ Minor league or AAA players (income too low)
- ❌ Retired athletes 10+ years post-career (wealth already deployed or gone)
- ❌ Athletes with known active advisor firms (visible on social media)
- ❌ Active legal disputes or contract holdouts (bad timing)

---

## Required Output Fields

```json
{
  "firstName": "Marcus",
  "lastName": "Webb",
  "title": "Wide Receiver — Kansas City Chiefs",
  "company": "Kansas City Chiefs / NFL",
  "city": "Kansas City",
  "state": "MO",
  "nicheId": "pro-athletes",
  "estimatedAUM": "$4M",
  "source": "Over The Cap — NFL Contracts",
  "sourceUrl": "https://overthecap.com/player/marcus-webb/12345",
  "needsEnrichment": true,
  "contractValue": "$18M / 3 years",
  "guaranteedValue": "$9M",
  "freeAgentYear": "2028",
  "reasonCodes": [
    "NFL wide receiver — $18M contract, $9M guaranteed",
    "Age 26 — years 4 of career — ideal planning window",
    "No known financial advisor on public record"
  ],
  "signals": {
    "estimatedAssets": "$4M",
    "relationship": "None confirmed — agent unknown",
    "nextEvent": "Free agent 2028 — major contract decision horizon",
    "outreachAngle": "Short career window wealth strategy — 9-12 years of income to fund 50 years of life"
  }
}
```

---

## Outreach Angle

> "The average professional career is 3.5 years. Most athletes spend more time planning their next contract than their next 50 years of life. We build the financial framework that outlasts the career."

---

## Vera Research Ask

> Vera: What does current research say about financial advisor penetration among active professional athletes? What percentage of NFL/NBA rookies have an advisor within their first year? Any recent NBPA or NFLPA financial education data?

---

## Output Location

`scripts/staging/alfred_batch_pro_athletes_YYYY-MM-DD.json`
