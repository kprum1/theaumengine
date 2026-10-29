# SMA Comparator — Shared Status and Agent Log

Status: proposed collaboration document; implementation has not been authorized to start.
Updated: 2026-10-29, America/Chicago.
Repository: `kprum1/theaumengine`.
Baseline inspected by Astra: `cf15073883acaae23a88127bc460674b8047a87f` on `main`.

## 1. How to start and coordinate

Kos approved this three-file structure in principle: root `AGENTS.md`, `docs/sma-comparator-build-plan.md`, and this file. At the baseline above, none existed. This change proposes only this shared log. Existing `.agents` instructions and workflows remain unchanged. The root instructions and master specification still need reconciliation by their owners; this log does not pretend that work is complete.

Explicitly tell every participating agent to read `AGENTS.md`, the master specification and this log before starting. Do not assume automatic instruction loading. Inspect and preserve any existing instructions before adding new ones. A file or `@Agent` label does not wake an agent or establish acceptance of an assignment.

### Kos's approved coordination constraints

- One accountable owner per phase. Argon owns implementation; Astra reviews math and tests; Perplexity validates research and the specification; Gemini provides independent review and proposed scaffolds.
- Publish the task claim, owner, affected files, branch and reviewer before coding. If claims conflict, stop the conflicting work and resolve ownership before editing overlapping files.
- Pull/read the latest shared state before each update. Preserve previous entries and resolve conflicts without losing entries. Reconcile the board separately from appending historical entries.
- Reported work and verified work are different. Do not attribute completed audits or code to another agent without an artifact link. A scaffold is unavailable until its path and commit or PR are provided.
- Use unique timestamp-and-agent entry IDs. Link the exact commit or PR reviewed. Keep the board concise and keep historical entries intact; append corrections that reference the older entry.
- Write a handoff after every completed phase, including what changed, validation, unresolved decisions, next owner and supporting artifacts. Do not defer all handoffs to optional P6.
- No API keys, prospect data, private account information or credentials in commits or log entries.
- No production deployment or protected-file changes are authorized. Preserve existing protections for auth, functions, Firestore rules, outreach logic and other guarded files. Work remains additive.

The existing `.agents/workflows/handoff.md` describes pushing handoffs directly to `main`. This draft is being submitted for review on a documentation branch; it does not execute or silently rewrite that workflow. Reconcile publication instructions explicitly in the proposed `AGENTS.md`. Any future credentials/config section must contain only non-secret configuration.

## 2. Phase board and task claims

| Phase | Accountable owner | Supporting responsibility | Status | Completion requirement |
|---|---|---|---|---|
| P0: baseline and specification reconciliation | Argon | Astra: fee review/tests; Perplexity: master spec; Gemini: independent review | In progress; Astra review recorded below | Argon's architecture/instruction findings and Perplexity's reconciled spec linked and recorded |
| P1: pure math and fixtures | Argon | Astra reviews math/tests; Gemini may propose a linked scaffold | Not started; awaiting P0 | Published coding claim, agreed numerical contract and reviewed tests |
| P2: comparison page, routing, navigation | Argon | Astra reviews implementation; Perplexity checks specification alignment | Queued | P0/P1 complete and page behavior verified |
| P3: persistence and import/export | Argon | Astra reviews data isolation and tests | Queued; access design unresolved | Concrete approved access/rules design and persistence validation |
| P4: fund data | Argon | Perplexity validates provider/source; Astra reviews calculations/tests | On hold | Provider decision and aligned data contract recorded |
| P5: Meeting Prep integration | Argon | Astra reviews implementation | Queued | Dependencies and phase acceptance criteria satisfied |
| P6: optional outreach integration | Argon | Independent review as assigned | Deferred | Separate scope and protected-file authorization |

### Current claim: Astra fee review

- Owner: Astra / Codex.
- Scope: documentation of corrected fee conventions and proposed acceptance cases.
- Affected file: `docs/SMA_AGENT_COMMS.md` only.
- Branch: `docs/sma-astra-fee-review-20261029`.
- Reviewer / next recipient: Perplexity for specification reconciliation; Argon for implementation feasibility.
- Status: review completed and recorded in this proposed document. Numerical fixtures were independently calculated; no implementation tests were run because no SMA implementation was written by this task.
- Artifact: the commit/PR containing this entry. Review against its immutable commit, rather than treating an unmerged branch as `main`.
- No implementation files or phases are claimed by Astra.

## 3. Evidence register

| Item | Evidence status | Supporting artifact or limitation |
|---|---|---|
| Current repository snapshot and absence of proposed three files | Verified by Astra using the complete Git tree on 2026-10-29 | Baseline commit above; no `AGENTS.md` or `AGENTS.override.md` present in tree |
| Existing `.agents` workflows and safe brief inspected | Verified by Astra | [Handoff workflow](https://github.com/kprum1/theaumengine/blob/cf15073883acaae23a88127bc460674b8047a87f/.agents/workflows/handoff.md), [safe brief](https://github.com/kprum1/theaumengine/blob/cf15073883acaae23a88127bc460674b8047a87f/BIG_NATE_SAFE_BRIEF.md) |
| C50/source mismatch | Verified by Astra; awaiting Argon's baseline reconciliation | [C50](https://github.com/kprum1/theaumengine/blob/cf15073883acaae23a88127bc460674b8047a87f/HANDOFF_C50.md) describes isolated bootstrap and `advisorMode`; [db.js](https://github.com/kprum1/theaumengine/blob/cf15073883acaae23a88127bc460674b8047a87f/js/db.js#L404) still uses shared `Promise.all`, and its loader uses assignment queries plus `{ ids }` calls |
| SMA top-level collections absent from repository allow rules | Verified by Astra; deployed rules not inspected | [firestore.rules](https://github.com/kprum1/theaumengine/blob/cf15073883acaae23a88127bc460674b8047a87f/firestore.rules); unmatched paths denied |
| Gemini audit and P1/P2/P3 scaffold | Reported in a user-supplied proposal; unverified and unavailable | No scaffold path, commit or PR supplied; no completion attributed to Gemini here |
| Argon's current architecture verification | Requested by Kos; completion not verified | Await linked findings from Argon |
| Perplexity's master-spec reconciliation | Requested by Kos; completion not verified | Await linked revised specification from Perplexity |
| Fee review and numerical examples below | Completed by Astra | This document and its containing commit/PR; proposed implementation tests remain unexecuted |

## 4. Agent message log

### 2026-10-29T18:03:19Z — Astra — fee-review-01

**Task:** Review Kos's corrected fee conventions and propose tests. This is a technical calculation review, not a claim that another agent completed work or that the application passes these tests.

**Files inspected:** Existing repository instructions/workflows; source and C50 at the baseline above; attached draft build plan. **File changed:** this new documentation file only. No schema, account, database, production or protected-file changes.

#### Proposed numerical contract for Perplexity to reconcile

**A. Fee inputs and provenance**

1. Remove the blanket 3% default and vendor-default rationale. An unspecified fee is missing, not zero; require an explicit scenario assumption or a documented source fee. Explicit zero is valid.
2. Distinguish an all-in wrap fee, manager fee and additional advisory fee. Record which components the wrap includes and whether advisory fees are inside or outside it. Choose either a bundled schedule or an itemized schedule for the same covered services; never add the manager component again to a wrap that includes it.
3. Record the return basis and embedded fee components for each period: gross, net of manager fees, or net of specified bundled fees, with source and as-of date. The scenario fee and source fee must be compatible. Unknown inclusion blocks a normalized/ranked result until clarified.
4. Deduct only additional fees absent from the source return. Published net returns are preferred when their fee basis matches the scenario. If replacing an embedded fee schedule with a different wrap schedule, require gross returns or a justified compatible incremental charge. Do not blindly subtract the whole wrap or infer an exact replacement from the wrap minus a quoted manager rate.
5. For partial `returnsNetManager`, check each period separately with a finite-number check. Zero and negative returns are valid. A missing net period can use a documented gross period with the appropriate missing-fee deductions; a missing gross and net value stays unavailable. Do not use object truthiness or `net || gross`.
6. Fund/ETF returns already net of operating expenses retain that embedded cost; do not subtract the expense ratio again. Separately disclose whether the scenario adds an advisory charge and excludes loads or other account costs. A fund's embedded expense ratio belongs in the fee explanation even though it is not deducted twice.

**B. Summary-return mode**

For a valid annualized source return `R_pct` and non-overlapping additional nominal annual fees totaling `f_pct`, the draft approximation is:

`annualizedNetPct = R_pct - f_pct`

For an N-year window:

`endingValue = 100000 * (1 + annualizedNetPct / 100) ** N`

Label the curve **illustrative compounded growth**. It does not reconstruct monthly historical performance. Keep the chart and table on the same calculation mode. If subtraction produces an impossible return below -100%, report the approximation as invalid rather than silently clamping or displaying negative portfolio wealth.

YTD is cumulative, not annualized. Do not deduct a full year's fee from it or silently annualize it. For v1, proposed scope is 1/3/5/10-year normalized comparisons; retain YTD separately as source data unless a partial-period fee convention is explicitly added. Since-inception comparisons also require common endpoints and compatible return types.

**C. Monthly-series mode**

When aligned monthly total-return observations exist for every compared vehicle, the proposed model for additional fees is:

`f = f_pct / 100`

`V[t] = V[t-1] * (1 + r[t]) * (1 - f / 12)`

Here `r[t]` is a decimal return, `f` is a nominal annual fee, and the model deducts fees from the post-return month-end balance. These are explicit modeling assumptions, not a claim about actual account billing or a universal performance standard. Actual compatible net series can be used directly; fees already embedded are not reapplied.

Annualize from the resulting net wealth ratio using the number of aligned months: `(V[end] / V[start]) ** (12 / months) - 1`. The chart and table must come from this same net series. If full series coverage is unavailable, use clearly labeled summary mode for the shared comparison or omit the historical comparison; do not fabricate missing monthly observations.

The two modes intentionally differ. For 10% annual gross performance and 1.4% additional nominal annual fees:

- Summary approximation: 8.60%, or $108,600 after one year from $100,000.
- Monthly model: `100000 * 1.10 * (1 - 0.014 / 12) ** 12` = $108,469.8433386503, or 8.4698433386503%.

The monthly fixture was independently recomputed using high-precision decimal arithmetic. Do not require the monthly result to equal 8.60%.

**D. Alignment and historical statistics**

- Require identical performance start and end dates for ranked comparisons, including the benchmark for excess returns. Do not silently substitute a nearby trading date. If dates differ, results can be displayed with warnings but receive no rank, winner or best-value highlight.
- Exact endpoints are necessary but not sufficient: also require compatible currency, return type, fee basis and dividend treatment. Metadata that is missing cannot establish comparability.
- Historical risk statistics require actual aligned observations. Never infer drawdown or beta from annualized summary returns or an illustrative curve. Imported source risk figures need their own basis/window metadata and must be labeled separately.
- For calculated 3-year metrics, require 36 paired monthly return observations on the same dates. Annualized sample standard deviation is `sampleStdDev(monthlyReturns) * sqrt(12)`; beta is paired covariance divided by benchmark variance and is unavailable when that variance is zero.
- Drawdown is the maximum decline from a prior peak of the actual wealth series. Label monthly-observation drawdown as such; it can miss intramonth losses. Preserve the initial wealth point in the calculation.

#### Proposed acceptance tests — not yet implemented or executed

| ID | Fixture or condition | Expected result |
|---|---|---|
| F01 | Gross 10%; itemized manager 0.4% + additional advisory 1%; summary mode | 8.60%; zero spread versus 8.60% fund with added advisory off |
| F02 | Gross 10%; wrap 1.4% includes manager and advisory; manager component displayed as 0.4% | Deduct 1.4% once; 8.60%, not 8.20% |
| F03 | Gross 10%; wrap 1% includes manager; explicitly outside-wrap advisory 0.5% | Deduct 1.5% once; 8.50% |
| F04 | Published manager-net 9.6%; additional advisory 1% | 8.60%; no second manager deduction |
| F05 | Published net already includes the selected 1.4% wrap; no additional charge | Preserve published net exactly |
| F06 | Published manager-net and replacement wrap with unknown fee compatibility | No normalized rank; require gross basis or verified incremental-fee mapping |
| F07 | One horizon manager-net 0%; advisory 1%; another horizon net missing but gross 10%, manager 0.4%, advisory 1% | First horizon -1%; second 8.6%; basis explicitly recorded per horizon |
| F08 | Net and gross missing, NaN or infinite; fee unspecified; fee inclusion unknown | No invented zero or blanket default; show unavailable/needs input |
| F09 | Explicit zero additional fee | Source return and wealth series unchanged |
| F10 | Published fund return 8.6%, expense ratio 0.5% already embedded | 8.6% with added advisory off; 7.6% with 1% advisory in summary mode; no extra expense deduction |
| F11 | Annualized net 8.6%, one year, $100,000 | $108,600; label illustrative compounded growth; percentage conversion occurs exactly once |
| F12 | Monthly gross observations compound to 10% over 12 months; additional fee 1.4% | $108,469.8433386503; 8.4698433386503%; chart/table reconcile |
| F13 | Same monthly fixture with zero fees | $110,000; 10% |
| F14 | A month with -100% return, positive starting wealth | Wealth reaches zero and does not become negative through fee deduction; below -100% monthly returns rejected |
| F15 | Summary subtraction produces below -100%; or negative/nonfinite fee input | Explicit validation error; no silent clamp or misleading curve |
| F16 | Same “3Y” label but different end or start dates | Dated display and warning allowed; no ranking, winner or best-value highlight |
| F17 | Only 1/3/5/10-year summary returns, or missing/misaligned monthly observations | No derived historical beta or drawdown; 3-year calculated risk metrics unavailable without required observations |
| F18 | Monthly wealth fixture 100 → 110 → 88 → 110 | Mathematical drawdown routine returns 20%; short fixture is for unit testing, not eligible for a 3-year UI metric |
| F19 | Paired nonconstant benchmark returns; portfolio returns exactly twice benchmark returns | Mathematical beta routine returns 2; constant benchmark returns yield unavailable beta; UI still enforces 36-month coverage |
| F20 | YTD summary only | No full-year fee subtraction and no automatic annualized ranking |

Use numerical tolerances before display rounding (suggested: $0.000001 for fixture wealth and 0.000000001 percentage points for fixture returns). Round only in display/export formatting; underlying comparisons use unrounded values.

**Reported vs. verified:** All fixtures above are proposed application tests. Arithmetic for the annual/monthly examples was checked independently, but no SMA test suite or Gemini scaffold was reviewed or run. This entry does not claim P1 completion.

**Blockers / decisions:** Argon must record the architecture/instruction review, including document/source drift and adapter/access design. Perplexity must reconcile the specification with the fee definitions and tests here. The choice of fee timing/model must be explicit in the resulting spec. Implementation waits until those findings are recorded; no existing protected-file restriction is relaxed.

**Handoff:** Perplexity owns master-spec reconciliation; Argon owns P0 completion and subsequent implementation claims; Gemini may supply a path and commit/PR for independent review. Astra is available to review a concrete implementation once assigned. Do not mark P0 complete or claim any recipient accepted work solely because this entry names them.
