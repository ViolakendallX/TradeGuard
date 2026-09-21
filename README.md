# TradeGuard

> **An AI-powered trading decision desk that challenges, researches, and stress-tests your trade thesis before you risk capital.**

**Stress-test your trade thesis before you risk capital.**

TradeGuard is not a signal service and not an autonomous trading bot. You bring a trade idea; TradeGuard investigates it, attacks it, stress-tests it against history, calculates the risk you have actually defined, consolidates the whole investigation into one report — and then you record the decision yourself.

**Status:** Phases 1–13 complete. TradeGuard is a multi-user product — accounts, sessions and per-account data isolation are real, and the interface is a finished design system rather than a work in progress. See [Current development status](#current-development-status) and [After Phase 13](#after-phase-13--accounts-the-design-system-and-the-workspace).

---

## What is TradeGuard?

TradeGuard is a trading decision desk for discretionary traders. It takes a thesis you already have and investigates it *before* capital is put at risk.

It does fourteen things:

- **Challenges your thesis** — it actively searches for evidence that could break it, rather than collecting reasons to agree with you.
- **Researches market and event context** — price, trend, volatility, and upcoming catalysts for the asset you are trading.
- **Separates supporting from contradicting evidence** — you see both sides classified, not blended into a single opinion.
- **Stress-tests the idea against history** — it retrieves real historical candles for the asset and reports what followed comparable past setups, or says plainly that historical data is unavailable.
- **Calculates the risk you defined** — from your own entry, invalidation and risk budget it derives the price risk per unit, the position size that keeps your loss at that budget, and the defined risk — or says plainly that an input is missing or the construction contradicts itself.
- **Brings the trade together into one structured plan** — asset, direction, timeframe, entry, invalidation, risk and thesis conditions collected into a single view, reusing the risk engine's numbers rather than recomputing them, or reported as an explicit incomplete state.
- **Consolidates everything into one final report** — the setup, the thesis and its evidence, the market and event context, the attack, the historical comparison, the defined risk and the invalidation conditions collected into one scannable report, with every section marked available, partial or unavailable and the remaining information gaps listed.
- **Records the decision you make, but never makes it** — you choose TAKE, WAIT or SKIP and give your own reason, and TradeGuard stores that decision with the time it was recorded and the trade and risk context behind it. It does not suggest which one to pick, does not write the reason, and does not execute anything.
- **Sends a confirmed paper order to the Bitget Demo environment, and nowhere else** — only after you recorded TAKE, only after a separate typed confirmation, and only with virtual funds. It evaluates the execution gate server-side first, shows you exactly what would be submitted, and reports the venue's own response or its actual error. There is no live-money path in the product.
- **Reviews what happened after your decision** — it assembles the records TradeGuard already produced (your thesis, the risk and structure you saw, your recorded decision, and the paper-execution outcome) into one read-only review, and answers *what happened after I made this decision?* It never tells you what to do next, and never shows a profit, loss or fill unless one was actually verified.
- **Remembers your trades** — it saves each completed trade so you can come back to it later and read back what you originally recorded: the thesis, your decision and the reason you gave, what was (or was not) executed, the review, and your own notes. It survives a page reload and a restart of the frontend. It is memory, not analysis — opening an old trade re-runs nothing and computes no profit, loss, win rate or score.
- **Lets you reflect on a saved trade** — it opens any trade you have already recorded, with or without a trade in progress, shows you what you knew, what you recorded and what is not available, and gives you a place to write your own reflection on it. It re-runs no analysis, works the same whether the trade is today's or months old, and never scores the trade, grades the decision or draws a conclusion in hindsight.
- **Keeps your work private to your own account** — accounts are real: you sign in, and every thesis you submit, every decision you record and every trade you save belongs to your account alone. One account can never read or overwrite another's records, and the API enforces that server-side rather than hiding it in the interface.
- **Identifies risks, invalidation conditions, and missing information** — including saying plainly when there is not enough data to judge.

The human trader stays responsible for the final decision. TradeGuard does not place trades, does not tell you to buy or sell, and does not predict prices.

---

## The problem

Most tools are built to find reasons to take a trade. Traders, meanwhile, are the worst-placed people to challenge their own idea — you get attached to the thesis, and the reasons to enter start to look more convincing than the reasons not to.

The questions that actually matter before execution are uncomfortable ones:

- What am I missing?
- What contradicts my thesis?
- What would prove me wrong?
- Am I trading on data I actually have, or data I assume I have?

TradeGuard exists to answer those questions in a structured way before the money moves.

---

## Core workflow

```
THESIS  →  RESEARCH  →  CHALLENGE  →  STRESS TEST  →  RISK CHECK
       →  TRADE STRUCTURE  →  FINAL REPORT  →  HUMAN DECISION  →  PAPER EXECUTION  →  REVIEW  →  MEMORY  →  REFLECT
```

**Implemented today:** THESIS → RESEARCH → CHALLENGE → STRESS TEST → RISK CHECK → TRADE STRUCTURE → FINAL REPORT → HUMAN DECISION → PAPER EXECUTION → REVIEW → MEMORY → REFLECT.

The whole chain runs inside one signed-in account, and everything it produces — the trade in progress and every trade saved to Trade Memory — is that account's own. See [After Phase 13](#after-phase-13--accounts-the-design-system-and-the-workspace).

The workflow described in the original plan is now built end to end. Nothing beyond it is presented as working, and no further phase is planned.

---

## How it currently works

The implemented flow runs end to end in the browser:

```
Trade Idea  →  Investigation  →  Market Context
                              →  Events & Catalysts
                              →  Devil's Advocate / Thesis Attack
                              →  Historical Stress Test
                              →  Risk Assessment
                              →  Trade Structure
                              →  Final Trade Report
                              →  Human Decision            (recorded by you)
           →  Trade Report      (the final report as its own navigable workspace)
           →  Decision          (record your TAKE / WAIT / SKIP and your reason)
           →  Paper Execution   (Bitget Demo only, after a typed confirmation)
           →  Trade Review      (what happened after your decision)
           →  Trade Memory      (the saved trades — open one to read back what you recorded)
           →  Trader Review     (reflect on any saved trade, with or without a trade in progress)
```

Every screen above sits behind a session. The flow starts at **sign in** — or **create account** on a fresh install — and everything it produces belongs to the account that signed in, in the trade in progress and in Trade Memory alike.

Every one of those screens is a **workspace**, not a long scrolling page: a persistent trade header, a compact section navigator, and one section on screen at a time. Once a trade's records are loaded they are held for that trade, so moving between screens and between sections is immediate and does not re-run any analysis.

**You submit:** asset, direction, thesis, timeframe, entry price, invalidation / stop price, risk amount, confidence, and existing position.

**The investigation can currently:**

- retrieve market context for the asset when the market data provider is reachable
- retrieve event and catalyst information when an events provider is configured
- analyse the thesis against whatever evidence was actually retrieved
- separate supporting evidence from contradicting evidence
- retrieve real historical candles for the asset and match comparable past setups using published rules
- report what followed those comparable setups, as observed historical outcomes rather than predictions
- calculate price risk per unit, position size and defined risk from the entry, invalidation and risk budget you supplied
- report an incomplete risk assessment when a required input is missing, or an invalid trade construction when the inputs contradict each other
- collect the trade setup, the risk engine's result, the thesis with its supporting and contradicting context, and the conditions that would invalidate it into one structured trade plan
- report the trade structure as incomplete when information it needs is missing, rather than filling the gap
- consolidate the whole investigation into a single final report, restating each earlier stage's finding and reusing the risk engine's numbers rather than recalculating them
- mark every section of that report available, partial or unavailable, and surface a consolidated list of the information gaps and limitations the investigation actually produced
- state explicitly that the report is a summary of the trade and the evidence, and that the final decision remains with the trader
- record the decision **you** make — TAKE, WAIT or SKIP — together with the reason you write for it, the time it was recorded, and the trade and risk context it was made against
- keep that recorded decision visible next to the report it was made from, so you can see the evidence and your own call in the same place
- evaluate the paper-execution gate server-side — PAPER EXECUTION LOCKED / READY / UNAVAILABLE — and show exactly what would be submitted, without sending anything to any venue
- submit a paper order to the **Bitget Demo** environment with virtual funds, but only after you recorded TAKE and typed a separate confirmation token, and then report the venue's own returned order data or its actual error
- assemble the post-decision **trade review** from the records TradeGuard already produced — the thesis, the risk and structure you saw, your recorded decision and the paper-execution outcome — without re-running any analysis
- save a completed trade to **Trade Memory** so it can be read back after navigating away, reloading the page, or restarting the frontend, and list the saved trades so you can open one and see what was originally recorded
- open any saved trade in **Trader Review** — even when no trade is currently in progress — and read back what was known before the decision, what you recorded and what is not available, then write your own reflection on it
- report honestly when there is no verified profit, loss or fill, instead of inferring one
- identify missing information
- identify invalidation conditions when there is enough data to derive them
- explicitly report insufficient or data-limited states instead of inventing evidence to fill the gap

Each stage reports its own runtime state — complete, partial, or unavailable — based on what the underlying work actually produced. A stage is never marked complete just because it ran. An incomplete or invalid risk assessment is reported as **partial**, because the stage ran but the defined risk it exists to produce does not exist. The same rule applies to the trade structure: an incomplete structure is reported as **partial**. The same rule applies once more to the final report: a report assembled over an investigation with a missing provider is reported as **partial**, because the thing the stage exists to produce — the whole investigation consolidated — is not fully there. The Human Decision stage follows the same rule from the other direction: it is complete only once **you** have actually recorded a decision, so it stays in **DECISION REQUIRED** until a decision exists rather than assuming one. Paper Execution follows the same rule once more: it reports **EXECUTION LOCKED** until you have recorded TAKE, and even then it does not claim a result — it shows the gate as evaluated, and a submitted order is only ever shown as submitted because the venue actually returned one. Trade Review applies the rule to the whole record: it is **REVIEW READY** only when the records it reviews actually exist, **REVIEW INCOMPLETE** when some are missing, and **REVIEW UNAVAILABLE** when it cannot be assembled at all — and it reports an outcome of NOT-EXECUTED rather than inventing a fill or a profit. Trader Review applies the rule one last time to your reflection: it reports **REFLECTION NOT RECORDED** until you actually write one, and **REFLECTION RECORDED** once a non-blank note exists — a whitespace-only note is never counted as a reflection, and a missing reflection is listed among the record's gaps rather than passed over.

One distinction matters for the final report. A report whose sections are honestly marked **unavailable** is still a real report: it tells you which evidence is missing and why. What it never does is dress an incomplete investigation up as a complete one, or substitute generic commentary, assumed prices or invented events for evidence it does not have.

The Investigation screen presents all of this as a single workspace rather than one long stacked page. A persistent trade header keeps the trade context (asset, direction, timeframe, entry, stop, risk, confidence, existing position) and the **Edit thesis** action visible at the top; a section navigation rail lists every investigation stage with its current runtime state and lets you move between them; and the selected section is rendered in one analysis panel beside the rail. Navigation is a presentation concern only — it does not change when, whether, or how any analysis runs.

The same workspace pattern carries through every later screen. **Trade Report** presents the ten-section report as a navigable workspace (Summary is the landing section) instead of one long document. **Decision** shows a compact brief — the report status, a quick summary, the investigation status, your thesis and the risk figures — with a **View full report →** action that opens the report workspace, so the act of deciding is not buried under the whole report. **Paper Execution** is a focused workspace for the gate, the structure, the risk context and the venue's response. **Trade Review** is a navigable workspace of its own. **Trade Memory** is a compact journal table — one row per saved trade, newest first — and opening a row replaces the table with that trade's own navigable record. **Trader Review** lists your saved trades as a picker and opens the selected one as its own navigable record — KNOWN, RECORDED, NOT AVAILABLE and your reflection — so you can look back at any trade you have recorded, not only the one currently in progress. Switching sections inside any of these is local UI state: it issues no network request and re-runs no analysis. The records themselves are fetched **once per trade** and held for that trade, so moving between screens — and returning to a screen you already loaded — reuses what is already there rather than re-running the investigation. A new trade starts from an empty session; the previous trade's records are never shown against it.

---

## Current development status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| Phase 1 — Foundation | React/Vite frontend, Express backend, app shell, navigation, Trade Idea screen | ✅ Complete |
| Phase 2 — Investigation Flow | Investigation screen, stage model, progress states | ✅ Complete |
| Phase 3 — Market & Event Research | Live market context, event/catalyst research, honest unavailability states | ✅ Complete |
| Phase 4 — Devil's Advocate / Thesis Attack | Thesis extraction, supporting vs contradicting evidence, risks, invalidation conditions | ✅ Complete |
| Phase 5 — Historical Stress Test | Real historical candle retrieval, deterministic setup matching, observed outcomes, explicit unavailable/partial states | ✅ Complete |
| Phase 6 — Risk Engine / Risk Assessment | Deterministic price risk, position sizing and defined risk from the trader's own entry, invalidation and risk budget, with explicit RISK READY / INCOMPLETE / INVALID TRADE CONSTRUCTION states | ✅ Complete |
| Phase 7 — Trade Structuring | The trader's own setup combined with the risk engine's result, the thesis context and the invalidation conditions into one structured trade plan, with explicit STRUCTURE COMPLETE / STRUCTURE INCOMPLETE / TRADE STRUCTURE UNAVAILABLE states | ✅ Complete |
| Phase 8 — Final Trade Report | The whole investigation consolidated into one scannable report, with per-section AVAILABLE / PARTIAL / UNAVAILABLE evidence states, the Phase 6 risk engine's numbers reused without recalculation, consolidated information gaps and limitations, and the explicit human decision boundary, under REPORT READY / REPORT INCOMPLETE / REPORT UNAVAILABLE states | ✅ Complete |
| Phase 9 — Human Decision | The trader's own decision recorded against the trade — TAKE / WAIT / SKIP with a required trader-written reason, a system-generated timestamp, deterministic server-side validation, and the trade and risk context attached, under DECISION REQUIRED / DECISION RECORDED states. TradeGuard records the decision; it does not make it, recommend it, score it or execute it | ✅ Complete |
| Phase 10 — Paper Execution | A paper order submitted to the Bitget Demo environment with virtual funds — the execution gate (PAPER EXECUTION LOCKED / READY / UNAVAILABLE), a separate typed confirmation token, the venue's own returned order data or its actual error, and the standing guarantee that no live-money order is ever placed, under EXECUTION LOCKED / EXECUTION READY / PAPER ORDER SUBMITTED / PAPER ORDER FAILED / PAPER EXECUTION UNAVAILABLE states | ✅ Complete |
| Phase 11 — Trade Review | The post-decision review assembled from the records TradeGuard already produced — the thesis, the Phase 6/7 risk and structure, the Phase 9 decision and the Phase 10 execution outcome — presented as a navigable workspace with the trader's own review notes, under REVIEW LOCKED / READY / INCOMPLETE / UNAVAILABLE states. It reports what happened; it does not tell you what to do next, and it never shows a profit, loss or fill that was not actually verified | ✅ Complete |
| Phase 12 — Trade Memory | A persistent trade journal — each completed trade saved as a normalised record (the submitted thesis, the recorded investigation state, your decision and its reason, the paper-execution state and result, the trade review, and your own notes) and listed as a compact, scannable table you can open and read back. Stored as a single local JSON file on the API — no database, no cloud, no cache server — so a saved trade survives navigation, a page reload and a frontend restart, under NO DECISION / DECISION RECORDED / PAPER ORDER SUBMITTED row states. It is memory, not analysis: opening an old trade re-runs nothing, and profit, loss, fill, score and performance fields are null by construction | ✅ Complete |
| Phase 13 — Trader Review & Polish | The look-back step, and the phase that finished the product's presentation. **Trader Review** opens any trade already saved to Trade Memory — with or without a trade in progress — and shows what was known before the decision, what you recorded and what is not available, alongside a place to write your own reflection. It re-runs no analysis, and the reflection is stored as one optional, additive group on the existing journal record, under REFLECTION NOT RECORDED / REFLECTION RECORDED states. The polish half: no screen advertises an unbuilt phase any more, the sidebar is grouped into four labelled, captioned groups, every navigation entry is live, and inline styles were consolidated into the stylesheet | ✅ Complete |

Phase 13 is implemented and complete. Trader Review is a real screen rather than a placeholder, and it is enabled in the navigation, so **nothing in the workflow is locked**. All nine investigation stages — Thesis, Market Context, Events & Catalysts, Devil's Advocate, Historical Stress Test, Risk Assessment, Trade Structure, Final Trade Report and Human Decision — are active, and the Paper Execution, Trade Review, Trade Memory and Trader Review steps are all real screens. This is the final phase in the plan: no further phase is planned, and no capability is presented as forthcoming.

**A note on phase numbering.** The original plan (see [`TradeGuard.md`](./TradeGuard.md)) called Phase 11 "Trade Memory" — a persistent trade journal — and Phase 12 "Post-Trade Review". What was actually built in the Phase 11 slot is the **post-decision Trade Review**: the review the original plan placed at Phase 12. It is deliberately **session-scoped and read-only** — it assembles records that already exist in the current trade session and writes only your own notes. The persistent journal across sessions then landed in the Phase 12 slot, which is where it is listed above; the numbering here follows the build rather than the original plan.

One further divergence is worth stating plainly. The original plan's Phase 12 mentions surfacing **"AI warnings"** and recurring-pattern detection over the journal. That is deliberately **not** built, and Phase 13 did not add it either. Trade Memory stores and reads back what you recorded, and Trader Review gives you a place to reflect on it in your own words — and nothing more. Neither detects patterns, scores trades, rates decisions, classifies a trade as good or bad, computes a win rate, or predicts anything. With the build complete, no phase remains in which any of that is planned.

---

## Phase 4 — Devil's Advocate

The thesis attack is the defining feature of TradeGuard. Given your thesis and the research retrieved in Phase 3, it produces:

- a **supporting evidence** list and a separate **contradicting evidence** list
- **key risks**
- **invalidation conditions** — what would indicate the thesis has failed, expressed against real levels when market data allows
- **missing information** — what could not be assessed, and why
- the **strongest argument against the trade**, stated as the single most important challenge

It holds to a few rules that matter more than the feature list:

- **It does not manufacture bearish evidence.** If nothing in the data contradicts the thesis, it says so rather than inventing a counter-argument.
- **It distinguishes "absence of evidence" from "evidence against the trade."** With no usable data, the honest conclusion is that the thesis is *unconfirmed* — not that it is supported, and not that it is refuted.
- **Insufficient evidence is never treated as confirmation.** When there is nothing to classify, the evidence-strength label degrades to `insufficient evidence` and the strongest counter-argument states that the thesis cannot currently be validated.
- **It emits no trade instruction.** There is no BUY, SELL, or PASS anywhere in the analysis output, and no arbitrary confidence score.
- **It never executes anything.** The thesis attack has no execution path, and no analysis stage does. TradeGuard's only order path is the demo-only [Paper Execution](#phase-10--paper-execution) step, which runs later and only on your explicit confirmation.

Evidence strength is reported as one of four evidence-derived labels — `supported`, `mixed`, `weak`, or `insufficient evidence` — each with a stated basis. It is not a probability and not a model score.

**Implementation note:** the current thesis attack is a **deterministic, evidence-derived analysis engine**. It does not call an LLM provider, and it does not require one to run. See [Analysis architecture](#analysis-architecture).

---

## Phase 5 — Historical Stress Test

Phase 5 answers one question: **"Have similar market setups happened before, and what happened afterwards?"** It extends the same investigation, for the same asset, without pretending historical evidence exists when it does not.

### Retrieving real historical data

Historical data comes from the **same Phase 3 market-data architecture** — the Bitget Spot API v2 candle endpoint, through the same isolated provider module and the same normalised candle contract. There is no second, parallel integration and no bundled historical dataset. The sampling granularity and window length follow the timeframe you submitted (intraday, earnings-event, macro-event, swing, short-term, or position), with swing as the default when no timeframe is given.

### Matching comparable setups

Matching is **explicit and deterministic**. Every historical window is reduced to four bucketed features, and a window matches **only when every criterion is equal** to the current setup:

| Criterion | Values |
| --------- | ------ |
| Trend direction | up / down / flat |
| Recent move magnitude | flat / modest / extended |
| Volatility regime | low / normal / elevated |
| Position within the recent range | near-high / near-low / mid |

The bucket thresholds are deliberately the **same constants the Phase 4 attack uses**, so both engines classify the market identically. Candidate windows that overlap the current setup are excluded (no look-ahead), and retained matches must be spaced apart so the sample is not made of the same move counted several times. There is no similarity score and no arbitrary weighting — a setup either satisfies all four rules or it does not, and the rules are published with every response.

### Reporting observed outcomes

For each matched setup the analysis reports what actually happened over a defined horizon after that setup: the move, whether it aligned with or opposed the direction you are considering, and the favourable and adverse excursion relative to entry. Outcomes are worded as *"Historical observations in this sample showed…"* — never as *"this trade is likely to…"*. The share of eligible windows that matched is reported with an explicit note that it is **not a probability, a win rate, or an edge**.

### Handling unavailable or insufficient data

The stage has four honest outcomes: a usable result, no matches found, a **partial** result, or an explicit `HISTORICAL DATA UNAVAILABLE` state. A result is downgraded to partial when the timeframe had to be assumed, when the sampled series is too short, or when there are too few independent matches to describe a distribution. When the provider fails or returns nothing usable, the stage says exactly what is missing and why. Partial data is never presented with more confidence than it supports, and the UI reflects the same distinction — the stage is marked complete only when the underlying analysis actually produced a usable sample.

### What it never does

- **It never fabricates historical examples.** No invented setups, no placeholder rows, no synthetic series.
- **It never invents a win rate, a probability, or a hit rate.** Match frequency is labelled for what it is.
- **It never claims a match when data is unavailable.** An empty result stays empty.
- **It never predicts.** Historical observations describe the sample they came from.
- **It never recommends a trade.** There is no BUY, SELL, or PASS. The historical stage reports what happened; the risk stage reports what you defined (see [Phase 6](#phase-6--risk-assessment)). Neither of them tells you what to do.

---

## Phase 6 — Risk Assessment

Phase 6 answers one question: **"Given the way this trade is constructed, what is the defined risk, and what important risk information is missing or inconsistent?"**

It is a **deterministic risk engine**. Code calculates; the UI explains. No number in this stage is estimated, inferred, or generated by a model.

### Required inputs

| Input | Where it comes from |
| ----- | ------------------- |
| Direction | Your submitted thesis (bullish → long, bearish → short) |
| Entry price | You supply it |
| Invalidation / stop price | You supply it |
| Risk budget | You supply it |

Entry, invalidation and risk budget are captured on the Trade Idea screen and are **the trader's own levels**. TradeGuard does not read the current market price and never substitutes one for your entry. If you do not supply an invalidation, TradeGuard does not invent one — it reports the assessment as incomplete.

### Calculation methodology

For a long (bullish) trade:

```
price risk per unit = entry price − invalidation price
```

For a short (bearish) trade:

```
price risk per unit = invalidation price − entry price
```

Then, for either side:

```
position size = risk budget ÷ price risk per unit
defined risk  = position size × price risk per unit
```

The price risk per unit must be **strictly positive**. The stage also reports the risk budget as supplied, the price risk as a percentage of entry, the notional value at entry, and the formula used, and it shows the arithmetic step by step:

```
Entry:        100
Invalidation: 95
Risk budget:  50

Price risk per unit:        100 − 95 = 5
Calculated position size:   50 ÷ 5   = 10 units
Defined risk:               10 × 5   = 50
```

Position size is not rounded before the defined risk is derived, so the defined risk matches the budget you supplied. The engine measures price risk at a single invalidation level only; it does not model portfolio exposure, correlated positions, or drawdown across trades.

### The three states

| State | Meaning |
| ----- | ------- |
| **RISK READY** | Every input the calculation needs is present and the construction is coherent, so the defined risk was calculated. |
| **INCOMPLETE** | An input the calculation needs is missing — no entry, no invalidation, no risk budget, or no directional side. The stage names exactly what is missing. |
| **INVALID TRADE CONSTRUCTION** | The inputs contradict each other: entry equal to invalidation (zero price risk), a bullish trade with its invalidation at or above the entry, a bearish trade with its invalidation at or below the entry, or a non-positive / non-numeric value. |

There is deliberately **no fourth state**. The engine never emits a verdict: no BUY, no SELL, no PASS, no score, no "this trade is good", no "this trade is safe", and no statement about whether the trade is worth taking.

### What it never does

- **It never uses a market price.** Entry and invalidation are the levels you supplied, taken as given. The engine makes no network call at all, which is also why the risk stage still resolves when every market-data provider is unreachable.
- **It never invents an input.** No assumed stop, no default entry, no estimated account size, no made-up position size.
- **It never calculates around a bad input.** A missing input produces INCOMPLETE; a contradictory construction produces INVALID TRADE CONSTRUCTION. Neither produces a number.
- **It never recommends a trade.** There is no BUY, SELL, or PASS, and no probability, win rate, expected return, or reward/risk ratio.
- **It never claims the defined risk is the realised loss.** Slippage, fees, financing, gaps through the invalidation and liquidity are disclosed as limitations on every response, alongside the fact that the levels were not verified against the market and that a fractional size may not be executable on a whole-unit venue.
- **It never hides the missing information.** Every response carries its limitations and disclaimer; the UI cannot render the panel without them.

**Not in this phase:** maximum profit, breakeven, reward/risk, risk percentage of an account, and exposure are **not** calculated. TradeGuard does not know your account size. Those remain future work.

---

## Phase 7 — Trade Structure

Phase 7 answers one question: **"What exactly is the trade being considered, what defines its risk, and what conditions would invalidate the thesis?"**

It is **not** the question *"should I take this trade?"* Phase 7 organises and presents the trade; it does not judge it.

This stage adds no new analysis. It is a **synthesis layer**: it collects what the earlier stages already produced — your submitted setup, the risk engine's result, the thesis attack's conditions and risks — into one structured trade plan. Nothing is recalculated and nothing is invented.

### What it presents

The structure is organised into four sections:

| Section | Contents |
| ------- | -------- |
| **Trade setup** | Asset, direction, side, timeframe, entry price, invalidation / stop price |
| **Risk structure** | Risk budget, price risk per unit, position size, defined risk — as calculated by the risk engine |
| **Thesis** | Your original thesis, plus the supporting and contradicting context already identified |
| **Invalidation & conditions** | The invalidation condition, key risks, missing information and assumptions already identified |

### The three states

| State | Meaning |
| ----- | ------- |
| **STRUCTURE COMPLETE** | Every value the structure needs is present and the risk engine's output is ready, so the trade is fully structured. |
| **STRUCTURE INCOMPLETE** | Something the structure needs is missing — typically a setup parameter, or a risk assessment that is not ready. The stage names exactly what is missing. |
| **TRADE STRUCTURE UNAVAILABLE** | The structure could not be assembled at all, and the stage says so rather than showing a partial plan. |

### What it never does

- **It never recalculates risk.** The Risk Engine from [Phase 6](#phase-6--risk-assessment) remains the single source of truth. The structure service imports the risk engine and reuses its exact output object; it contains no arithmetic of its own for price risk, position size or defined risk. The numbers in the Trade Structure panel cannot drift from the Risk Assessment panel, because they are the same numbers.
- **It never derives your entry or stop.** The entry and invalidation you supplied remain authoritative. No entry or stop is derived from the current market price, historical data, an AI interpretation, or a technical indicator.
- **It never reinterprets direction.** The direction you supplied is preserved as given; a neutral or missing direction is not converted into a bullish or bearish one.
- **It never turns a condition into a price.** If the Devil's Advocate said "failure to hold the breakout would weaken the thesis," the structure presents that as a thesis condition. It does not become "exit at 95" — only a level you actually supplied as your invalidation is shown as a price.
- **It never invents a value to complete the picture.** A missing entry, missing invalidation or missing risk budget produces an explicit incomplete state, with the gap named, rather than a plausible-looking number.
- **It never produces a verdict.** No BUY, SELL, PASS, "take the trade", "don't take the trade", trade-quality score, probability of success, predicted return, or guaranteed outcome. The structured plan describes the trade and its risk; it does not recommend it.

**Boundary:** the Trade Structure is a description of the trade, not an opinion about it. It answers *what* the trade is, *what* defines its risk, and *what* would invalidate it. Whether to take it stays with you.

---

## Phase 8 — Final Trade Report

Phase 8 answers one question: **"What did the whole investigation find, and what does the trader still not know?"**

It is **not** the question *"should I take this trade?"* Phase 8 consolidates what was found; it does not judge it, and it does not move the trade forward. The Human Decision is a separate phase that follows it.

Like Phase 7, this stage adds **no new analysis**. It is a **synthesis of Phases 1–7**: every section restates a finding an earlier stage already produced, and the numbers are that stage's own numbers. It reads no market price, calls no model, and runs no calculation of its own. In fact the report service imports nothing but the risk engine, so it produces an honest report even when every external data source is unreachable.

### The ten-section report

| # | Section | What it shows |
| - | ------- | ------------- |
| 1 | **Executive summary** | Asset, direction, side, timeframe, entry, invalidation, risk budget, confidence, existing position, the defined risk, and the overall investigation status — a summary of the trade, not a recommendation |
| 2 | **Trade thesis** | Your original thesis and TradeGuard's interpretation of it, kept clearly separate, with the evidence strength and the supporting and contradicting evidence found |
| 3 | **Market context** | The Phase 3 market finding, or an unavailable state carrying the original reason |
| 4 | **Events & catalysts** | The Phase 3 event finding, or an unavailable state carrying the original reason |
| 5 | **Devil's Advocate** | The strongest argument against the thesis already produced in Phase 4, its supporting and contradicting evidence, key risks, invalidation conditions and missing information |
| 6 | **Historical stress test** | The Phase 5 comparison and its methodology, restated as observed past outcomes |
| 7 | **Risk assessment** | The Phase 6 engine's entry, invalidation, risk budget, price risk per unit, position size and defined risk, reused unchanged |
| 8 | **Trade structure** | A concise restatement of the Phase 7 plan; the full detail stays in that stage |
| 9 | **Information gaps & limitations** | One consolidated list of the gaps the investigation actually produced, each attributed to its stage and phase |
| 10 | **Final decision boundary** | The explicit statement that the report summarises the trade and the evidence available, and that the final decision remains with the trader |

Every evidence section carries its own state marker, and the report header carries a roll-up — for example *"2 available · 1 partial · 3 unavailable of 6"* — so the state of the investigation is legible at a glance. Each section also carries a status badge, so the report can be scanned without opening every previous stage.

### The three evidence states

| State | Meaning |
| ----- | ------- |
| **AVAILABLE** | The stage ran and produced a usable finding, which is restated in full. |
| **PARTIAL** | The stage ran but only with limited data, and the report says so rather than presenting the finding as complete. |
| **UNAVAILABLE** | The stage could not retrieve its data. The report names that plainly and carries the original reason. |

### The three report states

| State | Meaning |
| ----- | ------- |
| **REPORT READY** | The report was assembled over an investigation in which every stage produced what it exists to produce. |
| **REPORT INCOMPLETE** | The report is here, but part of the investigation is missing. The report names exactly which sections are unavailable and why. |
| **REPORT UNAVAILABLE** | The report could not be assembled at all, and the stage says so rather than showing a partial report. |

An important distinction: a report whose sections are honestly marked unavailable is still a real report. A provider being down does not make the report unavailable — it makes that section unavailable and the report **incomplete**, which is the truthful answer. What the report never does is dress an incomplete investigation up as a complete one.

### What it never does

- **It never recalculates risk.** The Risk Engine from [Phase 6](#phase-6--risk-assessment) remains the single source of truth. The report service reuses the risk result it is given, object-for-object, and only calls the engine itself when nothing was supplied — so the Risk Engine is authoritative either way. The numbers in the final report cannot drift from the Risk Assessment panel, because they are the same numbers.
- **It never re-derives an earlier stage's finding.** The historical comparison is restated, not recomputed; the Devil's Advocate's counterargument is the one Phase 4 produced, not a new one generated to fill the section; the trade structure is restated concisely, not rebuilt. There is no second risk calculation, no second historical analysis and no second thesis attack anywhere in the codebase.
- **It never converts observed history into a forecast.** Matched past setups are described as what happened. Nothing in the report turns them into a probability, a win rate, an expected return or a predicted price.
- **It never fabricates evidence to fill a gap.** Missing market data, missing events or missing history produce an explicit unavailable state and a named gap. The report does not substitute generic market commentary, assumed prices, invented events or made-up historical outcomes — and it does not claim a data provider was reachable when it was not.
- **It never makes the trading decision.** No BUY, SELL, PASS, "take the trade", "don't take the trade", trade recommendation, trade-quality score, ranking, probability of success, expected return, predicted price or guaranteed outcome appears anywhere in the report or the API response. The API route itself documents its decision output as *"None"*.
- **It never presents an incomplete investigation as complete.** The information gaps it lists are only gaps the underlying stages actually reported. It does not invent limitations, and it does not silently drop the ones that exist.

**Boundary:** the report summarises the trade and the evidence available. It does not tell you to buy, to sell, or to pass, it does not score the trade, and it does not estimate the chance of it working. **The final decision remains with the trader**, and the Human Decision phase is where that decision gets recorded.

---

## Phase 9 — Human Decision

Phase 9 is where the trader, not the system, does the deciding. It answers no analytical question at all. It exists to **record the decision you make after reading the final report**, and to keep that record attached to the trade it belongs to.

It is the one stage in TradeGuard where the answer comes from a person. Everything before it is TradeGuard investigating the trade; this is the first and only stage where the content is yours.

### The three decisions

| Decision | Meaning |
| -------- | ------- |
| **TAKE** | You are going ahead with this trade on the terms in the report. |
| **WAIT** | You are not acting yet — you want more information or a better setup first. |
| **SKIP** | You are not taking this trade. |

The vocabulary is deliberately **TAKE / WAIT / SKIP** rather than BUY / SELL / PASS. BUY, SELL and PASS are *instructions*; TAKE, WAIT and SKIP *record a human choice that has already been made*. That distinction is the whole point of the phase, and the code holds it: no BUY, SELL or PASS appears anywhere in the decision stage, its API route or its API response.

Nothing is preselected. The form opens with no option chosen, there is no default, and the save action is disabled until you have both picked a decision **and** written a reason.

### Your reason is required, and it is yours

Every decision requires a **trader-provided reason** — free text, written in your own words, between 3 and 2,000 characters. It is stored exactly as written: trimmed only for the emptiness check, never reworded, summarised or completed.

TradeGuard has no "generate reason" button, no drafted text, no suggestion and no model in the path. A decision with no reason is rejected rather than stored, because a decision record without the trader's own reasoning is not a decision record.

### The timestamp is the system's

The **recorded-at timestamp is generated server-side**, at the moment the record is built. A client-supplied timestamp is ignored entirely, so a wrong or missing browser clock cannot produce a wrong record.

### Server-side validation is authoritative

Recording a decision is a real write with a real validation step, handled deterministically on the backend:

| Rejected | Why |
| -------- | --- |
| No decision supplied | There is no default. An absent choice never becomes TAKE, WAIT or SKIP. |
| An unsupported value (`BUY`, `SELL`, `PASS`, `HOLD`, `MAYBE`, …) | Only the three trader decisions exist. |
| A missing, empty or whitespace-only reason | The reason is required, not optional. |
| A reason shorter than 3 or longer than 2,000 characters | The record stays a note. |
| A malformed trade context | The decision must belong to an identifiable trade. |

The frontend runs a light pre-check for responsiveness, but the **backend is the authority**: the browser cannot talk the API into storing an incomplete record. Because a missing decision or an empty reason is a validation failure and not an analysis outcome, `POST /api/human-decision` returns **HTTP 400** for an invalid request — deliberately unlike the analysis routes, which always answer 200. Silently storing a default would fabricate the trader's intent, which is the one thing this phase must never do. A rejected request still returns a well-formed **DECISION REQUIRED** record, so the UI can render the honest state. The route never returns 500.

### The record

Recording a decision persists and displays:

- **the decision** — TAKE, WAIT or SKIP, shown as *"You recorded: TAKE"*, in your voice, never as a TradeGuard statement
- **your reason**, verbatim, attributed to you as *"Written by the trader — not generated by TradeGuard"*
- **the timestamp**, system-generated
- **the trade context** — asset, direction, timeframe, entry, invalidation / stop, risk amount, confidence and existing position, carried straight from your submission
- **the risk context at the time you decided** — price risk per unit, position size, defined risk and risk budget, carried through from the [Phase 6](#phase-6--risk-assessment) risk engine, **not recalculated here**

The record survives navigation, so you can move between the report and your decision without losing either, and the decision is displayed beside the report it was made from. Changing a decision updates the existing record rather than adding a second one.

### The two states

| State | Meaning |
| ----- | ------- |
| **DECISION REQUIRED** | No decision has been recorded for this trade yet. The three options and the required reason are shown, with nothing selected. |
| **DECISION RECORDED** | The trader's decision, reason and timestamp are stored and displayed, with the trade and risk context attached. |

There is deliberately **no third state**, and no state that means "approved". A recorded decision is styled as a neutral record, never as a green light: recording TAKE does not turn anything green, because the outcome is not known.

If the backend cannot be reached while recording, the stage says so plainly, states that nothing was stored, and does not infer a decision from your activity.

### What it never does

- **It never makes the decision.** It does not choose TAKE, WAIT or SKIP, does not preselect one, does not suggest one, does not rank them and expresses no preference. A decision exists only once you have stated one.
- **It never generates your reason.** No drafted reason, no autocompletion, no rewrite, no model call. The stored reason is the text you typed.
- **It never recommends a trade.** There is no BUY, SELL or PASS, no TradeGuard recommendation, no "we suggest", no "you should", no trade score, no ranking and no confidence or quality score on the decision.
- **It never scores the decision after the fact.** It does not say whether the choice was right, good, likely to work or a mistake. It also makes no claim about the outcome — which is unknown at the time of recording.
- **It never recalculates risk.** The Phase 6 risk engine remains the single source of truth. The record carries the engine's figures through unchanged; when the assessment was incomplete or invalid, it stores that honestly rather than a number, and a figure the engine did not produce stays absent rather than becoming `0`.
- **It never re-runs the analysis.** The record holds the trade context; it does not restate findings and does not reopen the investigation.
- **It never executes anything.** No order, no exchange call, no paper trade, no wallet action, no automation, no autonomous execution. Recording that you decided to TAKE is a note about your intention, not an instruction to act — and every record states explicitly that nothing was executed.
- **It never presents a recorded decision as a successful, validated or endorsed trade.**

**Boundary:** TradeGuard records the decision you make and the reason you give for it. It does not make the decision, does not recommend one of the options, does not score the trade, and does not tell you whether this is a good or bad trade. What is stored is your judgement, written by you. [Paper execution](#phase-10--paper-execution) is the next step, and it acts only on an explicit confirmation you give there.

---

## Phase 10 — Paper Execution

Phase 10 answers one question: **"What exactly would be sent to the venue, and did I actually confirm it?"**

It is **not** the question *"should I execute this?"* You already answered that by recording TAKE. Phase 10 is the one place in the product where a confirmed intention becomes an order, and it is deliberately narrow.

### Bitget Demo only

Paper execution trades **virtual funds in the Bitget Demo environment**. There is no live-money path anywhere in the product: the provider module talks only to the demo endpoint, and the service refuses to run at all if a live-trading variable is present in the environment (`TRADEGUARD_LIVE_TRADING`, `TRADEGUARD_ENABLE_LIVE`, `TRADEGUARD_BITGET_LIVE_API_KEY`, `TRADEGUARD_BITGET_LIVE_API_SECRET`, `TRADEGUARD_BITGET_LIVE_PASSPHRASE`). There is no fallback from demo to live — a failure is reported, never upgraded into a real order.

### Two separate steps

| Step | Endpoint | What it does |
| ---- | -------- | ------------ |
| **Evaluate the gate** | `POST /api/paper-execution` | Reports whether paper execution is permitted for this trade and, if so, exactly what would be submitted. It **sends nothing** to any venue |
| **Submit** | `POST /api/paper-execution/submit` | Sends the order — but only with the confirmation token |

### The confirmation token

Recording TAKE sends nothing, and the screen never acts on its own initiative. Before an order can leave, you must type the exact confirmation token — **`PAPER EXECUTE`** — into the confirmation field. The check is enforced **server-side**: a missing or mismatched token returns **HTTP 400** and nothing is sent. A client that bypassed the form cannot talk the API into placing an order.

### The five states

| State | Meaning |
| ----- | ------- |
| **EXECUTION LOCKED** | The gate is not satisfied — no TAKE recorded, or the risk/structure the order would be built on is not ready. The specific reason is named, never a generic refusal |
| **READY FOR PAPER EXECUTION** | The gate is satisfied and the order that would be submitted is shown, awaiting your explicit confirmation |
| **PAPER ORDER SUBMITTED** | The demo venue accepted an order and returned an order ID. This means the *demo* venue accepted it — it is not a fill, not a position, and not a successful trade |
| **PAPER ORDER FAILED** | The venue rejected the order or could not be reached. The venue's own error is reported |
| **PAPER EXECUTION UNAVAILABLE** | The venue cannot be used at all — no demo credentials configured, or no symbol could be resolved for the asset |

### What it never does

- **It never places a live-money order.** The only venue in the path is Bitget Demo, and the live-trading variables are a refusal condition rather than a configuration.
- **It never executes on its own initiative.** Nothing is sent because a screen was opened, because the gate passed, or because TAKE was recorded. The trader's typed confirmation is the only trigger.
- **It never fabricates an order.** When credentials are absent there is no order ID, no fill, no position and no P&L — the stage reports PAPER EXECUTION UNAVAILABLE and names the missing configuration instead.
- **It never recalculates risk.** The figures behind the order are the [Phase 6](#phase-6--risk-assessment) engine's, read unchanged.
- **It never manages the position afterwards.** It records that a demo order was accepted; it does not track, close, resize or advise on the position.
- **It never leaks a credential.** Credentials are read server-side from the environment and no credential value is ever returned in a response or written to a log.
- **It never presents an accepted demo order as a successful trade.** Every record carries the standing notice that demo results do not reflect real execution — fills, slippage, fees and liquidity in a demo are not real.

---

## Phase 11 — Trade Review

Phase 11 answers one question: **"What happened after I made this decision?"**

It is a **review tool**, not a recommendation engine. It assembles the records TradeGuard already produced — your thesis, the Phase 6/7 risk and structure you saw, your Phase 9 decision, and the Phase 10 paper-execution outcome — into one read-only view. Like Phases 7 and 8 it adds **no new analysis**: it performs no market research, calls no model, and computes no new figure.

### What it presents

| Section | Contents |
| ------- | -------- |
| **Review summary** | The review status, the trade it concerns, and what the review is made of |
| **Your decision** | The decision you recorded, your verbatim reason, and the system-generated timestamp — attributed to you, never to TradeGuard |
| **Execution record** | The paper-execution outcome, the order the demo venue actually returned, or an explicit not-executed state |
| **Trade plan** | The Phase 7 structure and the Phase 6 risk figures, read unchanged |
| **Outcome status** | Whether the trade was executed, and — only when a verified outcome exists — what it was |
| **What was known before the decision** | The Phase 3 research, Phase 4 attack and Phase 5 history, condensed as the context you had at the time |
| **Review notes** | Your own notes on the trade, stored exactly as written |

### The four review states

| State | Meaning |
| ----- | ------- |
| **REVIEW LOCKED** | No decision has been recorded yet, so there is nothing to review |
| **REVIEW READY** | The records the review is built from exist and the review was assembled |
| **REVIEW INCOMPLETE** | The review is here, but some of the records behind it are missing. It names which |
| **REVIEW UNAVAILABLE** | The review could not be assembled at all, and it says so rather than showing a partial one |

### No fabricated profit or loss

This is the phase where inventing a number would be easiest and most damaging, so the rule is absolute: **profit and loss are never calculated.** A P&L figure appears only if a *verified* execution outcome actually reports one — and a demo submission is not a fill. When there is no verified outcome the review reports **NOT-EXECUTED** and states plainly that the outcome is not yet available, rather than inferring a result from the decision or the order.

### What it never does

- **It never tells you what to do next.** No BUY, SELL, HOLD or EXIT, no instruction to change position size, no verdict on whether the decision was right.
- **It never predicts, scores or ranks.** No probability, no confidence score, no expected return, no price target, no "this trade worked out".
- **It never recalculates risk.** The figures come from the Phase 6 engine, verbatim. There is no second risk engine anywhere in the codebase.
- **It never runs new research.** The market, event, attack and historical material it shows is the material already produced for this trade, condensed — not re-fetched.
- **It never fabricates a fill or a P&L.** No invented order ID, no assumed outcome, no profit or loss the venue did not report.
- **It never writes your notes for you.** The review notes are your text, stored verbatim. TradeGuard does not draft, complete or generate them.
- **It never submits anything.** It is read-only; the only write in the whole stage is your own note.

---

## Phase 12 — Trade Memory

Phase 12 answers one question: **"What did I record on that trade, and can I get it back?"**

Every trade you complete is saved. You can navigate away, reload the page, restart the frontend, and come back later — the trade is still there, and opening it shows what was originally recorded.

### What it stores

One record per trade session, normalised server-side. It holds:

- **The trade** — asset, direction, the thesis **verbatim**, timeframe, entry, invalidation / stop, risk amount, confidence, existing position
- **The recorded investigation state** — per stage: market & event research, Devil's Advocate, historical stress test, risk engine & trade structure, final report
- **Your decision** — TAKE / WAIT / SKIP, the reason **verbatim**, and the timestamp the server recorded it
- **The paper-execution state** — LOCKED / READY / UNAVAILABLE / SUBMITTED / FAILED, and the venue's returned order when one genuinely exists
- **The trade review** — its status, the trade plan figures, the execution record, the outcome status, and the "what was known before the decision" summaries
- **Your review notes** — verbatim
- **An explicit list of what is missing** — every field this record does not have, stated as unavailable

### Where it is stored

A single JSON file on the API: `server/data/trade-journal.json`, overridable with `TRADEGUARD_JOURNAL_FILE`.

This is deliberately the smallest reliable mechanism that fits the existing architecture — **one Express process, no database, no migrations, no cloud service, no cache server**. Writes are atomic (temp file + rename). It is **local persistence on the TradeGuard server**, not cloud storage and not a backup, and the UI says so on the Trade Memory screen rather than implying otherwise. The file is gitignored: the saved trades are yours. Every record is scoped to the account that created it — see [After Phase 13](#after-phase-13--accounts-the-design-system-and-the-workspace).

### The journal

Trade Memory is a compact, scannable table — one row per saved trade, newest first — showing the asset and direction, a thesis preview, the recorded decision and when it was made, the execution state, a notes preview, and when the record was last updated. Each row carries a state chip: **NO DECISION**, **DECISION RECORDED** or **PAPER ORDER SUBMITTED**. Selecting a row opens that trade as its own navigable workspace — SUMMARY, DECISION, EXECUTION, PLAN, REVIEW, NOTES and NOT AVAILABLE — so a saved trade reads like the rest of the product rather than as one long page.

### Reading it back costs nothing

Opening a saved trade issues **no analysis request**. No research, no thesis attack, no historical stress test, no risk engine, no structure, no report. The stored record is rendered as it was saved. This is verified by instrumenting the browser's network traffic: opening a saved trade produces exactly one request — a read of the journal.

### A save is an update, not a duplicate

Each trade session has an id, generated when the thesis is submitted. Saving the same session twice updates the same record and preserves its `createdAt`. A **new** trade gets a **new** id, so it can never overwrite or leak into a previous one. The browser suite verifies this directly: after trade B is created, trade A's record is compared field by field against a snapshot taken before B existed, and trade B is checked for any trace of A's thesis, asset, reason, notes or order id.

### What it never does

- **It never calculates a profit, a loss, a fill or a return.** `execution.pnl` and `execution.filled` are `null` by construction, forced in the service, re-forced on every read, and impossible for a client to set — a test posts `pnl: 1234.56`, `filled: true` and a `score` and asserts none of it reaches the record.
- **It never invents an order ID.** The only path to a non-null `orderId` is a real venue result on a record whose status is `submitted`. A hand-edited journal file cannot smuggle one in either, because normalisation runs again on every read.
- **It never treats a submitted demo order as a filled order**, or a recorded TAKE as a successful trade.
- **It never scores, rates, ranks or classifies.** There is no win rate, no expectancy, no good-trade / bad-trade flag, and no field for one. The suite walks every key in a saved record and asserts that no scoring or verdict field exists.
- **It never rewrites what you wrote.** The thesis, your decision reason and your notes are stored verbatim — not trimmed, not summarised, not completed.
- **It never re-runs the analysis.** Saving writes what the app already holds; reading reads a file.

---

## Phase 13 — Trader Review & Polish

Phase 13 answers one question: **"Looking back at a trade I have already recorded, what did I know, what did I decide, and what do I think now?"**

It is two things at once: the **Trader Review** experience — the look-back step the workflow was always heading towards — and the phase that finished the product's presentation, so that nothing in the app reads as work-in-progress.

### Reviewing a trade you have already saved

Trader Review opens **any trade in Trade Memory**, not only the one currently in progress. If you are working on a trade it defaults to that one; if you are not, it lists your saved trades and lets you pick. Selecting one loads that exact record by its persistent session id and renders it — so a trade you saved weeks ago is just as reviewable as the one you submitted five minutes ago.

Opening a saved trade **re-runs nothing**. No research, no thesis attack, no historical stress test, no risk engine, no structure, no report. The stored record is read from the journal and rendered as it was saved. This is verified by instrumenting the browser's network traffic: reviewing a saved trade produces journal reads and nothing else.

### What it presents

| Section | What it shows |
| ------- | ------------- |
| **KNOWN** | What was known before the decision — your own entry, invalidation and risk budget, the risk engine's figures (attributed to the engine), and the recorded investigation state |
| **RECORDED** | What you actually recorded — the thesis **verbatim**, your decision, your decision reason **verbatim**, and your review notes **verbatim** |
| **NOT AVAILABLE** | What the record does not contain, stated as unavailable — including P&L, which is never calculated |
| **REFLECTION** | Your own look-back note on this trade, in your words |

### The reflection

Your reflection is stored as **one optional group on the existing journal record** — `status`, `statusLabel`, `notes` and `recordedAt`, and nothing else. It is additive: a trade saved before Phase 13 simply reads back as not reflected on, rather than as an error or a repaired guess.

The note is stored **verbatim**. A whitespace-only note does not count as a reflection. The first `recordedAt` is preserved across later edits, but is re-stamped after a clear, so the timestamp never claims a note exists when it does not. Writing a reflection touches nothing else in the record — the thesis, decision, execution and notes are all verified unchanged after the write.

### What it never does

- **It never requires you to start a new trade.** Reviewing a saved trade is the point of the screen; asking you to create one would be the bug.
- **It never re-runs the analysis.** Opening a saved trade reads the journal. The chain does not run.
- **It never invents what was not recorded.** If information was unavailable when the trade was saved, it is shown as unavailable now — not reconstructed, not inferred from later data.
- **It never loses an older trade.** Starting a new trade resets the selection to that new trade but leaves every previously saved trade in the list and selectable.
- **It never scores, grades or judges.** No hindsight verdict on whether the decision was right, no good-trade / bad-trade flag, no win rate, no probability, no price target.
- **It never writes your reflection for you.** The note is your text, stored verbatim. TradeGuard does not draft, complete or generate it.

### The polish

- **No screen advertises an unbuilt phase.** The remaining development-looking copy — the placeholder screen's "Planned · Phase N", the investigation rail's "not built yet" and the app's fallback subtitle "Not built in this phase." — was replaced with honest copy, and a verification check asserts those tokens no longer appear anywhere. The app shell's phase pill was updated to name the phase that is actually current.
- **The navigation communicates the whole workflow.** The sidebar is grouped into four labelled, captioned groups — *Trading* (start with the idea), *Analysis* (the eight stages, named in the caption), *Decision* (decide → execute) and *Memory* (review → remember → reflect) — rather than growing new entries.
- **Every navigation entry is live.** The last locked entry was Trader Review, and it is now a real screen.
- **Inline styles were consolidated** into the stylesheet, and empty states were unified on one shape.

---

## After Phase 13 — Accounts, the design system, and the workspace

The thirteen phases built the trading workflow. Three pieces of work followed, and they are part of the product rather than a phase of it: **accounts and per-account isolation**, the **design system**, and the **workspace scrolling architecture**. They are described here rather than in a phase row because none of them adds a trading stage.

### Accounts, and what "your own data" actually means

TradeGuard is a **multi-user product**. You create an account, sign in, and the application is yours from that point on.

- **Accounts are real, not a front-end gate.** `POST /api/auth/register` derives the password with **scrypt** and a per-account random salt (`server/lib/password.js`), and stores the account in `server/data/users.json`. `POST /api/auth/login` re-derives and compares in constant time, then issues an **opaque session token** in an HTTP-only, `SameSite=Lax` cookie. Nothing about the account is carried in the cookie itself, and the session store keeps only a **SHA-256 digest** of each token — so a copied `sessions.json` cannot be replayed as a login, and neither file contains anything a reader could sign in with.
- **Isolation is enforced by the API, not the interface.** `middleware/requireAuth.js` resolves the cookie to an account and attaches it to the request. Every journal route then takes the record's owner from **that** — never from the request body, the query string or a header. A client cannot ask for someone else's trade, and a trade belonging to another account returns **404**, indistinguishable from one that does not exist, so the API cannot be used to discover whose trades exist either.
- **A failed sign-in says one thing.** Whether the account is missing or the password is wrong, the answer is the same message. There is no path that reports which half was wrong.
- **Signing out is server-side.** `POST /api/auth/logout` deletes the session record and clears the cookie; the stored digest is gone, so replaying the cookie gets nothing.
- **The signed-in account is the only owner of a saved trade.** Two accounts using the same browser profile, the same asset and the same thesis still get two separate journals, and the isolation is verified in both layers — the API's, and the journal file's.

### The design system

The interface is a finished design system rather than a set of screens that grew individually.

- **One token layer.** Colour, spacing, radius, type scale and elevation are CSS custom properties in `src/styles/global.css`. Components read tokens; they do not hardcode values. Changing a hue or a spacing step is a one-line change in the token block, not a sweep through the components.
- **A dark, single-theme palette** built for long sessions at a trading desk: a near-black canvas, elevated panels, and a deliberately small set of accent hues.
- **Accent as a language.** Each section of the workflow owns a hue, and a navigation item carries it as **one** custom property (`--section-accent`) that its icon, active background, edge and glow all read. The sidebar's pipeline legend teaches that vocabulary — the eight analysis stages as accent pips — so the investigation rail is already familiar the first time it is opened.
- **Quiet by default.** Only the active navigation item is loud. Colour is spent on *where you are*, not on everything else, so the interface does not compete with the analysis.
- **Consistent surfaces.** Every panel is the same card shape, every empty state uses one component, and every screen opens with the same header rhythm.

### The workspace scrolling architecture

The application had one scroller — the document. On the Trade Idea screen that meant the Live Thesis panel scrolled up and away with the page, leaving the right-hand column blank while the form it describes was still being filled in. The workspace now has a deliberate scrolling architecture instead.

- **The document does not scroll inside the workspace.** The Trade Idea screen is given its own geometry: a fixed height under the top bar, with the page header in the first grid row and the two-column workspace in the second.
- **The centre column scrolls independently.** It is the primary scrolling area. The form inside it is its own scroll container, with `overscroll-behavior: contain` so reaching its end does not start scrolling the page behind it.
- **The Live Thesis column stays put.** It is sticky within the workspace, so it remains visible while the centre column scrolls, and it scrolls **internally** only when its own content exceeds the available height. The two columns never share a scroll container.
- **The top bar and sidebar keep their existing behaviour** — the workspace begins underneath them.
- **It is scoped, not global.** The workspace geometry applies only on a desktop-width, desktop-height viewport. Below that, the screen falls back to the ordinary document scroll and the single-column stack, and there is no horizontal overflow at any width.

The layout is verified by measurement rather than by eye: a browser harness scrolls the centre column through its whole range and asserts that the Live Thesis panel's bounding box is **identical** at every step and that the panel is fully visible, then does the same for the reverse case — the aside scrolling internally without moving the centre. The trap it was built to avoid is worth stating, because it is not obvious: **a grid item's automatic minimum size is clamped to `0` when the item is itself a scroll container**, so a card with `overflow: hidden` placed in a grid row collapses to the row's height and is *silently clipped* rather than scrolled. It looked correct at one viewport only because the card happened to be a few pixels shorter than its pane there. The fix is a flex column with `flex: none` on its children, and the verification now measures at a second, shorter viewport for exactly that reason.

---

## Data & integrations

### Market research

Live market context comes from the **Bitget Spot API v2** public endpoints (no API key required). Recognised rToken assets are resolved to their Bitget USDT pair — for example `rNVDA` → `RNVDAUSDT`.

Derived from ticker and candle data:

- current price
- 24h change (and change since UTC open)
- trend over the sampled window
- realised volatility
- 24h high / 24h low
- quote volume

### Historical data

The historical stress test reads the **same Bitget Spot API v2 candle endpoint** as market research, with a larger page size, normalised through the identical candle contract. There is no separate historical provider and no stored dataset. When candles cannot be retrieved, the stage reports `HISTORICAL DATA UNAVAILABLE` with the reason rather than substituting anything.

### Events & catalysts

Event research uses a **Financial Modeling Prep**-style earnings calendar, gated entirely by environment configuration. Without `TRADEGUARD_EVENTS_API_BASE` and `TRADEGUARD_EVENTS_API_KEY`, event research reports **Data unavailable** with an explanation rather than guessing.

### Risk calculation

The risk assessment uses **no external data source at all**. It is arithmetic on the entry, invalidation and risk budget the trader submitted, computed by a pure function in the backend. There is no provider, no symbol lookup and no market price, so it cannot fail for data reasons — the risk stage resolves even when Bitget and the events provider are both unreachable. Its only two non-ready outcomes are missing inputs and a self-contradicting construction.

### Human decision recording

The human decision stage uses **no external data source and no model**. It validates the trader's own submission and builds the record in the backend; the timestamp comes from the server clock. It neither reads nor recalculates risk — it carries the Phase 6 engine's figures through unchanged — so it also resolves with every provider unreachable. There is no execution path: recording a decision contacts no exchange and places nothing.

### Paper execution

Paper execution is the **only** stage with a write path to a venue, and it is confined to one: the **Bitget Demo** endpoint, with virtual funds. It needs demo credentials in the environment (`TRADEGUARD_BITGET_DEMO_API_KEY`, `TRADEGUARD_BITGET_DEMO_API_SECRET`, `TRADEGUARD_BITGET_DEMO_PASSPHRASE`); without them it reports `PAPER EXECUTION UNAVAILABLE` and names what is missing rather than guessing. The gate evaluation itself reads no market data — it is a deterministic check over the decision, the risk result, the structure and the report — so it resolves with every data provider unreachable. The order that would be submitted is built from the Phase 6 risk figures and the Phase 7 structure, never recalculated here. Provider knowledge is isolated in `server/services/providers/bitgetDemo.js`, exactly as market data is in `bitget.js`, and the live-trading environment variables are treated as a refusal condition rather than a fallback.

### Trade review

Trade Review uses **no external data source at all**. It is assembled server-side from records the client already holds — the thesis, the risk and structure results, the recorded decision, the execution record and the earlier investigation — and it reads the Phase 6 figures through the same helper the paper-execution stage uses, so the two can never disagree. It performs no market call, no model call and no calculation, which is why it resolves instantly and with every provider unreachable. The review itself is session-scoped; the notes you write in it are persisted by Phase 12.

### Trade memory

Trade Memory is the only stage with **storage**, and that storage is deliberately the smallest thing that works: **one JSON file** (`server/data/trade-journal.json`), written atomically through `server/services/tradeJournal.js`. There is no database, no migrations, no cloud service, no cache server and no backup — and the UI says exactly that rather than implying a cloud journal. Access to it is per-account: every read and write is filtered to the signed-in user, so one account can never see another's trades. Reading it touches no provider and no engine; it reads the file. It runs no analysis, calculates no profit or loss, and draws no conclusion about how a trade turned out.

Each save is normalised: the trade context, the recorded investigation state, your decision and its reason, the paper-execution state and result, the review, and your notes. Records are keyed on the trade session id, so re-saving updates the same record. Records are re-normalised on every read, which means a hand-edited or partially corrupted file cannot smuggle in an invented order ID, a fill or a P&L — an entry without a usable id is skipped rather than trusted.

### Trader review reflection

Trader Review has **no data source of its own**. It reads the same local journal Trade Memory writes, through the same service — no provider, no model, no engine, no second store. Opening a saved trade is a read of one record by its persistent id, which is why it resolves instantly and with every external service unreachable.

The only thing Trader Review writes is **your reflection**, and it writes it through a **reflection-only** path: a POST carrying just the record id and the note. That path deliberately carries no trade, no decision and no execution, so it cannot disturb them — and the journal service is written so that a partial write replaces only the group it actually carried. A reflection-only write for a trade that is not already saved is **refused** rather than allowed to create a record with no trade in it. The reflection is one optional group — `status`, `statusLabel`, `notes`, `recordedAt` — added additively, so a record saved before this phase still reads back honestly as not reflected on.

### Provider availability

External provider availability directly affects live research, and TradeGuard is built to be honest about that. If Bitget is unreachable from the network the backend is running on — a restricted sandbox, a corporate proxy, an outage — market context reports **Data unavailable** with the reason. The integration is real; it simply is not guaranteed to return data on every run, and the UI never pretends otherwise.

There is no caching layer or fallback dataset: no data means an explicit unavailable state, never a substituted or stale number.

---

## Data honesty & safety

These are enforced in the code, not aspirational:

- **No fabricated market numbers.** When the market provider returns nothing usable, no price, change, or volatility field is emitted at all.
- **No fabricated events.** Unconfigured or failing event providers produce an unavailable state with a reason.
- **Missing data is explicitly surfaced** in a Missing Information section, naming what could not be assessed.
- **Insufficient evidence is not confirmation.** The analysis never presents an absence of data as support for a trade.
- **No manufactured bearish case.** TradeGuard does not invent risks to create artificial balance.
- **No fabricated historical observations.** When historical data is unavailable, too short, or matched by nothing, the stress test reports exactly that — it does not invent setups, win rates, probabilities, or outcomes to fill the gap.
- **No fabricated risk numbers.** The risk engine only ever emits numbers it derived from the trader's own inputs, and only when every input is present and coherent. A missing input produces an INCOMPLETE assessment naming what is missing; a contradictory construction produces an INVALID TRADE CONSTRUCTION with no calculation at all. Nothing is assumed in the gap.
- **No market price is substituted for your entry.** The risk engine reads no market data. Entry and invalidation are the trader's levels, and the response states that they were not verified against the market.
- **The defined risk is not presented as the realised loss.** Slippage, fees, financing, gaps and liquidity are disclosed as limitations on every risk response.
- **No trade verdict.** There is no BUY, SELL, or PASS anywhere in the product — not in the risk stage, not in the final report, not in any other stage.
- **No recommendation, score or ranking.** The final report does not grade, rank or score the trade, and it does not estimate a probability of success, an expected return or a predicted price. Its API route documents its decision output as *"None"*.
- **No manufactured report completeness.** A report assembled over an investigation with a missing provider is reported as REPORT INCOMPLETE with the unavailable sections named, never as REPORT READY. The report lists only the gaps the earlier stages actually produced; it does not invent limitations.
- **No AI-made decision.** The Human Decision stage records a choice the trader makes. It does not select one, does not preselect one, does not recommend one and does not score it. A decision with no trader-supplied reason is rejected, not stored.
- **No reason written for the trader.** The stored reason is the trader's own text, kept verbatim. TradeGuard does not draft, complete, reword or generate it.
- **No fabricated decision timestamp.** The recorded-at time is generated server-side at the moment of recording. A client-supplied timestamp is ignored.
- **No inferred decision.** A failed or unreachable recording stores nothing and says so. No decision is inferred from the trader's activity, and a missing decision is never filled with a default.
- **No execution.** Recording a decision places no order, contacts no exchange and performs no wallet action. Every record states that nothing was executed.
- **Research output is not a trading instruction.** Every analysis carries a disclaimer to that effect, and the final report states its boundary explicitly: the report summarises the trade and the evidence available, and the final decision remains with the trader.
- **The human remains responsible for the final decision.**
- **No autonomous live trading.** TradeGuard's only write path to a venue is the Bitget **Demo** environment, it is triggered solely by a trader-typed confirmation token, and the presence of any live-trading environment variable makes the stage refuse rather than fall back to live.
- **No order that was not actually returned.** When the demo venue is unconfigured or unreachable, the execution record carries no order ID, no fill and no position — the stage reports the honest state and the missing configuration instead.
- **No fabricated profit or loss.** P&L is never calculated anywhere in the product. It appears only if a verified execution outcome actually reports it, and a demo submission is not a fill. Without a verified outcome, Trade Review reports the outcome as not yet available.
- **No review verdict.** Trade Review describes what happened after a decision. It does not say whether the decision was right, does not recommend a next action, and produces no BUY / SELL / HOLD / EXIT, probability, score, ranking, expected return or price target.
- **No review notes written for you.** The notes stored in Trade Review are your own text, kept verbatim. TradeGuard does not draft, complete or generate them.
- **No invented order ID, ever.** Trade Memory only carries an order ID when a real venue result on a `submitted` record provides one. A record that was ready but never submitted keeps the prepared order separately, explicitly labelled as not submitted.
- **A submission is not a fill.** `filled` is null by construction and cannot be set by a client or a hand-edited journal file.
- **No stored P&L.** `pnl` is null by construction, forced in the journal service and re-forced on every read. A client that posts a profit figure does not get one stored.
- **No journal verdict or score.** Trade Memory has no win rate, expectancy, rating, grade or good-trade / bad-trade field, and does not compute one. The test suite walks every key of a saved record to assert that no such field exists.
- **No silently repaired storage.** A corrupt journal file is reported as unreadable with a reason, not shown as an empty journal — "your journal is unreadable" and "you have saved nothing" are different facts. A malformed entry is skipped and counted, never patched up.
- **Local storage is labelled as local.** The Trade Memory screen states that records live in a single JSON file on the TradeGuard server, that it is not cloud storage, not a database and not a backup, and that saved trades are never analysed, scored or ranked.
- **No hindsight verdict.** Trader Review describes what you recorded and gives you a place to reflect. It does not say whether the decision was right, does not produce a score, grade, rating, win rate, probability or price target, and does not draw a conclusion from what happened afterwards.
- **No reflection written for you.** The reflection is your own text, stored verbatim. TradeGuard does not draft, complete or generate it, and a whitespace-only note is never counted as a reflection.
- **A reflection cannot disturb the record it belongs to.** Writing one replaces only the reflection group; the thesis, decision, execution, review and notes are verified unchanged after the write, and a reflection-only write for an unsaved trade is refused rather than creating a record with no trade in it.
- **Nothing is reconstructed after the fact.** Information that was unavailable when a trade was saved stays unavailable when you review it. Trader Review never back-fills a gap with data that arrived later.
- **Provider credentials stay server-side.** API keys are read from the backend environment and never reach the browser.

---

## Analysis architecture

The Phase 4 thesis attack, the Phase 5 historical stress test, the Phase 6 risk engine, the Phase 7 trade structure, the Phase 8 final report, the Phase 9 human decision, the Phase 10 paper execution, the Phase 11 trade review, the Phase 12 trade memory and the Phase 13 trader review all run entirely in the backend as deterministic pipelines. The thesis attack:
```
TRADE CONTEXT + PHASE 3 RESEARCH
              ↓
   EVIDENCE CLASSIFICATION  (market signals, event signals, context)
              ↓
   SUPPORTING / CONTRADICTING / RISK / MISSING
              ↓
   STRONGEST COUNTER-ARGUMENT + EVIDENCE STRENGTH
```

The historical stress test:

```
TRADE CONTEXT  →  HISTORICAL CANDLES (Bitget Spot API v2)
                        ↓
        FEATURE BUCKETING PER WINDOW  (trend, move, volatility, range position)
                        ↓
        ALL-CRITERIA-EQUAL MATCHING  (no look-ahead, non-overlapping)
                        ↓
        OBSERVED OUTCOMES OVER A DEFINED HORIZON  (+ sample limitations)
```

The risk engine:

```
TRADE CONTEXT  (direction, entry, invalidation, risk budget — trader supplied)
                        ↓
        INPUT VALIDATION  (present? numeric? positive? side known?)
                        ↓
        COHERENCE CHECK  (is the price risk per unit strictly positive?)
                        ↓
   RISK READY  /  INCOMPLETE  /  INVALID TRADE CONSTRUCTION
                        ↓
        PRICE RISK PER UNIT · POSITION SIZE · DEFINED RISK
```

The risk engine has no provider and no model in the path — it is pure arithmetic, which is what makes its output reproducible and testable without a network. It reads the trader's levels and nothing else; there is no branch anywhere in it that could reach for a market price.

The trade structure service is a synthesis step rather than an analysis step:

```
TRADE CONTEXT  +  PHASE 4 ATTACK  +  PHASE 6 RISK RESULT
                        ↓
        COMPLETENESS CHECK  (setup parameters present? risk leg ready?)
                        ↓
   STRUCTURE COMPLETE  /  STRUCTURE INCOMPLETE  /  TRADE STRUCTURE UNAVAILABLE
                        ↓
   TRADE SETUP · RISK STRUCTURE · THESIS · INVALIDATION & CONDITIONS
                        ↓
        MISSING INFORMATION · CAVEATS · LIMITATIONS · DISCLAIMER
```

It imports the risk engine and reuses its output object directly — the numbers are passed through, never recomputed — and like the risk engine it has no provider and no model in the path, so it resolves even when every data provider is unreachable. The invalidation conditions it shows are carried across verbatim from the thesis attack as titled conditions, never converted into exit prices.

The final report service (Phase 8) is a synthesis of syntheses — it consumes the outputs of all seven earlier stages and restates them:

```
PHASE 3 RESEARCH  +  PHASE 4 ATTACK  +  PHASE 5 HISTORY
        +  PHASE 6 RISK RESULT  +  PHASE 7 STRUCTURE  +  TRADE CONTEXT
                        ↓
   REUSE CHECK  (is each supplied result usable? otherwise call the engine)
                        ↓
   PER-SECTION EVIDENCE STATE  (available? partial? unavailable?)
                        ↓
   REPORT READY  /  REPORT INCOMPLETE  /  REPORT UNAVAILABLE
                        ↓
   TEN SECTIONS  ·  EVIDENCE ROLL-UP  ·  CONSOLIDATED GAPS
                        ↓
   METHOD NOTE · LIMITATIONS · DISCLAIMER · DECISION BOUNDARY
```

It is the purest synthesis stage in the product: it imports **only** the risk engine, computes no statistic of its own, and adds no provider and no model to the path. Every section carries the state of the evidence behind it, so a missing provider produces a named unavailable section and a REPORT INCOMPLETE state rather than a fabricated one. The projected risk numbers are asserted to be identical to the engine's own output, which is what makes it structurally impossible for the final report to disagree with the Risk Assessment panel.

The human decision service (Phase 9) is not an analysis step at all — it is a **recording step**, and it is the only place in the product where the input comes from the trader rather than from a calculation:

```
TRADER'S DECISION  +  TRADER'S REASON  +  TRADE CONTEXT  +  PHASE 6 RISK RESULT
                        ↓
   DETERMINISTIC VALIDATION  (decision supplied? one of the three? reason written? context sane?)
                        ↓
   DECISION REQUIRED  /  DECISION RECORDED
                        ↓
   DECISION · REASON (verbatim) · SYSTEM TIMESTAMP · TRADE CONTEXT · RISK CONTEXT
                        ↓
   METHOD NOTE · LIMITATIONS · DISCLAIMER · EXECUTION NOTICE (executed: false)
```

Its validation is the mirror image of the analysis stages: where the risk engine proves that a number is derived, this service proves that a decision is **not**. There is no default path, no branch that picks an option, and no code that could write a reason — the decision and the reason both arrive as trader input, and the only thing the service adds is the timestamp and the standing guarantees. There is no provider, no model and no network call in the path; the risk figures it carries are the Phase 6 engine's own output, asserted in the test suite to be identical to it. An invalid submission produces no record at all, which is why this route answers 400 where the analysis routes answer 200.

The paper-execution service (Phase 10) is the one place where the backend talks to a venue, and it is written so that it cannot talk to the wrong one:

```
TRADER'S RECORDED DECISION  +  PHASE 6 RISK  +  PHASE 7 STRUCTURE  +  PHASE 8 REPORT
                        ↓
   GATE EVALUATION  (TAKE recorded? risk READY? structure complete? symbol resolvable?)
                        ↓
   LIVE-TRADING GUARD  (any live-trading env var present → refuse, never fall back)
                        ↓
   EXECUTION LOCKED  /  READY FOR PAPER EXECUTION  /  PAPER EXECUTION UNAVAILABLE
                        ↓
   CONFIRMATION TOKEN CHECK  ('PAPER EXECUTE', enforced server-side)
                        ↓
   BITGET DEMO SUBMIT  (virtual funds only)
                        ↓
   PAPER ORDER SUBMITTED  /  PAPER ORDER FAILED  (+ the venue's own response)
                        ↓
   METHOD NOTE · LIMITATIONS · DISCLAIMER · DEMO-ONLY NOTICE
```

The trade review service (Phase 11) is a pure read-only assembly — no provider, no model and no storage:

```
THESIS  +  PHASE 3 RESEARCH  +  PHASE 4 ATTACK  +  PHASE 5 HISTORY
        +  PHASE 6 RISK  +  PHASE 7 STRUCTURE  +  PHASE 9 DECISION  +  PHASE 10 EXECUTION
                        ↓
   COMPLETENESS CHECK  (which of the records it reviews actually exist?)
                        ↓
   REVIEW LOCKED  /  READY  /  INCOMPLETE  /  UNAVAILABLE
                        ↓
   SUMMARY · DECISION · EXECUTION · PLAN · OUTCOME · KNOWN-BEFORE · NOTES
                        ↓
   OUTCOME STATE  (verified, or NOT-EXECUTED — never an inferred profit or loss)
                        ↓
   METHOD NOTE · LIMITATIONS · DISCLAIMER · P&L NOT COMPUTED
```

It reads the Phase 6 figures through the **same `readRiskFigures` helper the paper-execution service uses**, which is what makes it structurally impossible for the review to disagree with the risk panel. Its API response documents `pnl.computed` as `false`.

The trade memory service (Phase 12) is not an analysis pipeline at all — it is a normaliser in front of one file:

```
THESIS  +  PHASE 9 DECISION  +  PHASE 10 EXECUTION  +  PHASE 11 REVIEW  +  YOUR NOTES
                        ↓
   NORMALISATION  (validate the session id; carry the thesis, reason and notes verbatim;
                   read the investigation state from the review rather than re-deriving it;
                   take an order ID ONLY from a real venue result)
                        ↓
   FORCED HONESTY  (pnl = null · filled = null · no score, rating or verdict field)
                        ↓
   UPSERT INTO ONE JSON FILE  (atomic write: temp file + rename)
                        ↓
   READ BACK  (re-normalised on every read, so a hand-edited file cannot smuggle a number in)
                        ↓
   METHOD NOTE · LIMITATIONS · DISCLAIMER · LOCAL-STORAGE NOTICE
```

There is no provider, no model and no engine in that path. Reading the journal is a file read; writing it is a file write.

The trader review (Phase 13) is not a pipeline at all — it is a **selection rule in front of the same file**:

```
SAVED TRADES  (the journal, listed as summaries)
                        ↓
   RECORD SELECTION  (an explicit pick wins; otherwise the trade in progress;
                      otherwise the newest saved trade — derived, never stored)
                        ↓
   ONE RECORD READ BY ITS PERSISTENT ID  (no analysis, no provider, no engine)
                        ↓
   KNOWN · RECORDED · NOT AVAILABLE · REFLECTION
                        ↓
   YOUR REFLECTION  (written back through a reflection-only POST)
```

Which record is on screen is a **pure function** of the explicit selection, the active trade and the saved list — not state set by an effect. That is what stops the screen ever showing the previous trade's record for a frame while a new one loads, the same frame-accuracy rule the shared trade session is built on. The only write is your own reflection, and it goes through a path that carries nothing else, so it cannot touch the record it belongs to.

Every statement in the output is derived from an observable input — a price move, a trend direction, a volatility reading, an event date, a historical candle, a detail from your own submission, or a decision you recorded. The thresholds that drive classification (flat-move band, extended-move threshold, elevated-volatility threshold, proximity to a 24h extreme) are documented constants in the code, shared by both engines, so the reasoning is explainable and reproducible.

**Why deterministic rather than LLM-driven:** critical conclusions should not depend on a model's willingness to be disagreeable, and the classification should be testable without a live AI provider. Determinism also keeps the honesty guarantees enforceable — a rule can guarantee that no bearish evidence is invented; a prompt cannot.

This is deliberately a **clean seam**. The evidence classification and the numbers stay deterministic, while an LLM could later be layered on top to *explain* the findings in natural language. Adding that layer would not make the core classification dependent on an external model.

---

## Architecture

```
TRADEGUARD
│
├── src/                          React + Vite frontend
│   ├── screens/                  Sign in, Create account, Trade Idea, Investigation, Trade Report, Decision, Paper Execution, Trade Review, Trade Memory, Trader Review
│   ├── components/               App shell, sidebar, trade-idea components
│   │   ├── auth/                 Sign-in / create-account layout, fields and notices
│   │   ├── investigation/        Workspace components: trade header, investigation rail, section navigator, analysis panels
│   │   └── journal/              Trade Memory: the journal index table and the saved-trade detail
│   ├── lib/                      API client, constants, stage model, investigation view model, validation, the auth client and hook, the per-trade session hook, the Trade Memory client
│   └── styles/                   Design tokens and styles
│
└── server/                       Express backend
    ├── index.js                  App wiring, /api/health
    ├── routes/                   auth, tradeIdeas, research, thesisAttack, historicalStressTest, riskAssessment, tradeStructure, finalReport, humanDecision, paperExecution, tradeReview, tradeJournal
    ├── services/                 marketData, eventData, thesisAttack, historicalStressTest, riskEngine, tradeStructure, finalReport, humanDecision, bitgetDemoExecution, tradeReview, tradeJournal, userStore, sessionStore
    │   └── providers/            bitget (market data) + bitgetDemo (paper execution) — isolated provider knowledge
    ├── middleware/               requireAuth — resolves the session cookie to an account, and rejects or passes through
    ├── lib/                      Trade idea validation, password hashing, cookie helpers
    ├── data/                     Accounts, sessions and the Trade Memory journal (local JSON, gitignored — your saved trades)
    └── tests/                    Node test runner suites
```

**Accounts are a server-side concern, not a UI trick.** `POST /api/auth/register` and `POST /api/auth/login` set an opaque, HTTP-only session cookie; `middleware/requireAuth.js` resolves that cookie to an account on every request that needs one. The account id it resolves becomes the **only** source of a record's owner — the journal routes take the owner from the session and never from the request body — so a client cannot ask for another account's trade, and there is no code path in which one account's records are reachable from another's session. Passwords are stored as **scrypt derivations with a per-account random salt** (`lib/password.js`), never as text, and the session store keeps a SHA-256 **digest** of each token rather than the token itself — so neither file on disk contains anything that could be used to sign in.

**Frontend:** React with Vite. Hash-based navigation across the application screens, with the Trade Idea → Investigation flow wired end to end.

**Backend:** Node.js with Express. One process, no database — accounts, sessions and Trade Memory are plain JSON files on disk. Everything except `/api/health` and the two credential routes requires a session cookie; the routes below are grouped by what they do. The API surface:

| Endpoint | Purpose |
| -------- | ------- |
| `GET /api/health` | Service status, including the current build phase. Unauthenticated |
| `POST /api/auth/register` | Creates an account and signs it in. Rejects a missing, malformed or already-taken credential with 400/409; the password is stored only as a salted hash |
| `POST /api/auth/login` | Verifies a credential and sets a fresh opaque session cookie. A wrong password is a 401 and sets no cookie. Never says whether the account exists, so the route cannot be used to enumerate accounts |
| `POST /api/auth/logout` | Deletes the server-side session and clears the cookie. Safe to call without a session |
| `GET /api/auth/me` | Resolves the current session to its account, or reports that there is none. Does **not** require a session — it is how the client decides whether to show the sign-in screen |
| `GET /api/auth/session` | The authenticated counterpart to `/me`: 200 with the account, or 401. Used by the client to confirm a session is still valid |
| `POST /api/trade-ideas` | Validate and capture a submitted thesis |
| `POST /api/research` | Market context + event research for the asset |
| `POST /api/thesis-attack` | The Devil's Advocate analysis |
| `POST /api/historical-stress-test` | Historical setup matching and observed outcomes for the asset |
| `POST /api/risk-assessment` | Deterministic price risk, position size and defined risk from the trader's own levels |
| `POST /api/trade-structure` | The trade setup, risk result, thesis context and invalidation conditions combined into one structured trade plan |
| `POST /api/final-report` | The ten-section final report consolidating Phases 1–7, with per-section evidence states and the explicit decision boundary |
| `POST /api/human-decision` | Records the trader's own decision — TAKE / WAIT / SKIP with a required trader-written reason — against the trade, with a system-generated timestamp and the trade and risk context attached. Returns 400 and a DECISION REQUIRED record when the submission is invalid; the route's execution output is documented as *"None"* |
| `POST /api/paper-execution` | Evaluates the paper-execution gate for the trade — EXECUTION LOCKED / READY FOR PAPER EXECUTION / PAPER EXECUTION UNAVAILABLE — and returns exactly what would be submitted. **Sends nothing** to any venue |
| `POST /api/paper-execution/submit` | Submits a paper order to the Bitget **Demo** environment with virtual funds. Requires the confirmation token `PAPER EXECUTE`, enforced server-side — a missing or wrong token returns 400 and nothing is sent. Never returns 500: a venue rejection is a 200 carrying PAPER ORDER FAILED, because the venue refusing an order is a real outcome to report |
| `POST /api/trade-review` | Assembles the post-decision review from the records TradeGuard already produced. Performs no new analysis and submits nothing, and always returns 200 — a locked, incomplete or unavailable review is a real answer, not an error. Its `pnl.computed` output is documented as `false` |
| `POST /api/journal` | Saves (creates or updates) one trade in Trade Memory **for the signed-in account**. Keyed on the trade session id, so re-saving updates the same record rather than duplicating it. Returns 400 only when the session id is missing or malformed, because without an id there is nothing to upsert against. Every group except the id is optional, and a **partial write replaces only the groups the request actually carried** — which is how Trader Review writes a reflection without disturbing the trade, decision, execution or notes. A reflection-only write for a trade that is not already saved is refused, so it can never create a record with no trade in it. Runs no analysis and submits nothing |
| `GET /api/journal` | Lists **the signed-in account's** saved trades, newest first, as summaries — enough to identify and choose a trade. Always 200. A journal that exists but cannot be read returns `status: "unavailable"` with a reason rather than an empty list, because "unreadable" and "you have saved nothing" are different facts |
| `GET /api/journal/:id` | Reads one saved trade in full **if it belongs to the signed-in account**. 200 with the record, or 404 with `status: "not-found"` and a null record — a trade belonging to another account is a 404, indistinguishable from one that does not exist. Nothing is recomputed |

Provider integrations are isolated behind service modules (`server/services/providers/`), so swapping a data source means writing one provider module rather than touching the research pipeline. The risk engine deliberately sits outside that structure: it has no provider dependency to isolate. The trade structure sits outside it too, and depends only on the risk engine — so it inherits the risk engine's independence from every data provider. The final report goes further still: it depends only on the risk engine as well, and takes every earlier stage's result as an argument, so it can assemble an honest report with every data provider unreachable. `POST /api/final-report` therefore always returns HTTP 200 — an unavailable provider and a missing entry price are real, reportable answers, not errors. The human decision route sits outside the provider structure for the same reason, and depends only on the risk engine to carry its figures through; it is the one route that returns **400** on a bad request, because an absent decision or an unwritten reason is a validation failure rather than an analysis outcome, and there is no honest record to build from it. The paper-execution route is the only route with a venue behind it, and that venue is isolated in its own provider module (`providers/bitgetDemo.js`) with demo-only credentials and a live-trading refusal guard; its gate evaluation reads no market data, and only the `/submit` path can reach the venue at all. The trade-review route depends on nothing but the records it is handed and the shared `readRiskFigures` helper, so it has no provider, no model and no storage, and like the analysis routes it always answers 200. The auth routes and the journal routes are the only ones with storage behind them, and each store is a single JSON file behind a service module — accounts in `services/userStore.js`, sessions in `services/sessionStore.js`, saved trades in `services/tradeJournal.js` — with no provider, no model and no analysis, so signing in and reading Trade Memory both work with every external service unreachable. The journal routes are additionally gated by `requireAuth`, and that gate is the only source of a record's owner: it is read from the resolved session and never from the request, so no route accepts an owner as input and none can be talked into serving another account's trade. Trader Review adds **no route of its own**: it reads through the journal's existing routes and writes through the reflection-only partial write on `POST /api/journal`, so it inherits the journal's independence from every provider and introduces no new data source.

---

## Tech stack

**Currently in use**

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 18, Vite 5, JavaScript / JSX |
| Backend | Node.js, Express 4 |
| Market data | Bitget Spot API v2 |
| Historical data | Bitget Spot API v2 candles — same provider module and candle contract as market data |
| Event data | Financial Modeling Prep earnings calendar (env-configured) |
| Risk calculation | TradeGuard's own deterministic risk engine — no provider, no model, no market data |
| Trade structure | TradeGuard's own deterministic synthesis layer — reuses the risk engine's result, adds no provider and no model |
| Final trade report | TradeGuard's own deterministic consolidation layer — restates Phases 1–7, reuses the risk engine's result unchanged, and adds no provider and no model |
| Human decision recording | TradeGuard's own deterministic recording layer — validates the trader's own submission, generates the timestamp server-side, and carries the risk engine's figures through unchanged. No provider, no model, no execution |
| Paper execution | Bitget **Demo** API — virtual funds only, isolated in its own provider module and gated by a server-enforced confirmation token plus a live-trading refusal guard. Never a live venue |
| Trade review | TradeGuard's own deterministic read-only assembly — restates the records Phases 1–10 already produced, reads the risk engine's figures through the same helper the execution stage uses, and adds no provider, no model and no storage |
| Trade memory | TradeGuard's own deterministic journal — one local JSON file behind `services/tradeJournal.js`. No database, no migrations, no cloud service, no cache server, no backup. Every record is scoped to the account that created it. It computes no profit, loss, fill or score |
| Trader review | TradeGuard's own deterministic look-back over the saved journal — one record read by its persistent id behind a pure selection rule, plus a reflection-only write path. No provider, no model, no engine, no second store, and no analysis re-run |
| Accounts & sessions | TradeGuard's own account and session store — two local JSON files behind `services/userStore.js` and `services/sessionStore.js`, scrypt password derivations with a per-account salt, and an opaque HTTP-only session cookie resolved by `middleware/requireAuth.js`. No third-party identity provider, no OAuth, no token service, no database |
| Interface | One hand-written stylesheet (`src/styles/global.css`) over a token layer — colours, spacing, radii, type and elevation are custom properties, and no component hardcodes a value. A fixed sidebar, a sticky top bar, and per-screen workspace geometry driven by `data-screen` |
| Unit / integration tests | Node.js built-in test runner (`node --test`) |
| Browser verification | Headless Chrome driven over the Chrome DevTools Protocol from Node's built-ins — no declared dependency. Earlier phases also used Playwright (`playwright-core`). Development verification only, not a project dependency |

**Future work (not currently implemented):** historical market data storage, defined-risk options structuring, and optional LLM-based explanation of deterministic findings. Persistent trade storage is **no longer** future work — it is Phase 12 above.

---

## Local development

```bash
git clone https://github.com/ViolakendallX/TradeGuard.git
cd TradeGuard
npm install
npm run dev
```

`npm run dev` starts both processes together:

| Service | URL |
| ------- | --- |
| Frontend (Vite) | http://localhost:5173 |
| Backend (Express API) | http://localhost:8787 |

The Vite dev server proxies `/api` requests to the backend, so the frontend talks to `http://localhost:8787` through `http://localhost:5173`.

Run them individually if you prefer:

```bash
npm run dev:web   # Vite frontend only
npm run dev:api   # Express API only
npm start         # Express API only, without the Vite dev tooling
```

Production build and preview:

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

Copy `.env.example` to `.env` before running if you want event research enabled — see below.

**The first screen is sign-in.** TradeGuard is multi-user, so a fresh checkout has no account yet — choose **Create account**, and you are signed in and dropped straight into the workflow. The account is stored in `server/data/users.json` and the session in `server/data/sessions.json`; both are created on first use and both are gitignored. Deleting `sessions.json` signs you out everywhere without touching your account or your saved trades.

**Trade Memory writes to `server/data/trade-journal.json`.** The directory is created on the first save and is gitignored, so your saved trades stay local and are never committed. Delete that file to start with an empty journal. Every record in it carries the id of the account that created it, and the API will only ever return a record to that account.

---

## Environment variables

Provider credentials belong in environment variables and are never committed. `.env` is gitignored; `.env.example` is committed so the required variables stay documented.

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `TRADEGUARD_MARKET_PROVIDER` | No | Market data provider. Defaults to `bitget` (public API, no key). |
| `TRADEGUARD_EVENTS_PROVIDER` | No | Event provider. Defaults to `fmp`. |
| `TRADEGUARD_EVENTS_API_BASE` | For event research | Base URL of the events provider. Empty → event research reports Data unavailable. |
| `TRADEGUARD_EVENTS_API_KEY` | For event research | API key for the events provider. Empty → event research reports Data unavailable. |
| `TRADEGUARD_BITGET_DEMO_API_KEY` | For paper execution | Bitget **Demo** API key. Empty → paper execution reports PAPER EXECUTION UNAVAILABLE and names what is missing. |
| `TRADEGUARD_BITGET_DEMO_API_SECRET` | For paper execution | Bitget **Demo** API secret. |
| `TRADEGUARD_BITGET_DEMO_PASSPHRASE` | For paper execution | Bitget **Demo** passphrase. |
| `TRADEGUARD_JOURNAL_FILE` | No | Where Trade Memory stores its JSON file. Defaults to `server/data/trade-journal.json`. Point it elsewhere to keep a journal separate — the verification script uses it to run against a throwaway file. |
| `TRADEGUARD_USERS_FILE` | No | Where accounts are stored. Defaults to `server/data/users.json`. The verification scripts point it at a temporary file so a test account never lands in your real one. |
| `TRADEGUARD_SESSIONS_FILE` | No | Where active sessions are stored. Defaults to `server/data/sessions.json`. Deleting it signs every account out; no account or saved trade is affected. |
| `TRADEGUARD_COOKIE_SECURE` | No | Forces the session cookie's `Secure` attribute. Defaults to `true` when `NODE_ENV=production` and `false` otherwise. Set it to `true` only when the app is actually served over HTTPS — with it on, a plain-HTTP browser will not send the cookie back and sign-in will appear to succeed and then not stick. |
| `PORT` | No | Backend port. Defaults to `8787`. |

Paper execution is **demo-only by construction**. There is no live-trading variable to configure: `TRADEGUARD_LIVE_TRADING`, `TRADEGUARD_ENABLE_LIVE`, `TRADEGUARD_BITGET_LIVE_API_KEY`, `TRADEGUARD_BITGET_LIVE_API_SECRET` and `TRADEGUARD_BITGET_LIVE_PASSPHRASE` are treated as **refusal conditions** — if any of them is present, the paper-execution stage refuses to run rather than falling back to a real venue. Never set them.

Never commit a real `.env` file or real API keys. The default contract for the events provider is:

```
GET {TRADEGUARD_EVENTS_API_BASE}/earnings_calendar?symbol=<EQUITY>&apikey=<KEY>
```

---

## Testing

```bash
npm test                            # unit + integration tests
npm run build                       # production build

# Route-level checks against the API
node scripts/verify-phase10.js      # paper execution, against a running API
node scripts/verify-decision-stage.js
node scripts/verify-phase11.js      # trade review, against a running API
node scripts/verify-phase12.js      # trade memory — starts its own API on a temp journal
node scripts/verify-phase13.js      # trader review — starts its own API on a temp journal

# Browser checks (headless Chrome over the DevTools Protocol)
node scripts/verify-dev-server.mjs      # the app boots and the shell renders
node scripts/verify-auth-isolation.mjs  # two accounts, and that neither can see the other
node scripts/verify-visual-redesign.mjs # the design system, screen by screen
node scripts/verify-workspace-scroll.mjs # the workspace scrolling architecture
node scripts/verify-final-ui-fixes.mjs  # native dropdown readability, and the removed sidebar card
```

The browser suites drive a real Chrome against the running app and assert on **measurements** rather than on class names — bounding boxes, `scrollHeight` against `clientHeight`, computed colours and contrast ratios — so a layout that merely looks right does not pass. Where a check could be satisfied by accident, it is paired with a **negative control** that injects the original defect and confirms the check fails: the dropdown audit, for instance, re-runs with `select option { background-color: transparent }` forced in and asserts that every option goes transparent, so a passing result cannot be a vacuous one.

`scripts/verify-phase12.js` is self-contained by default: it starts its own API process on a spare port with `TRADEGUARD_JOURNAL_FILE` pointed at a temporary file, runs 70 checks against the live routes, then shuts the process down and deletes the file. That means it never writes verification records into your real Trade Memory. Set `BASE` to run it against an already-running server instead — but then its records will land in that server's journal.

`scripts/verify-phase13.js` works the same way, on its own port and its own temporary journal, and runs **101 checks**. Alongside the route-level checks it writes a **legacy Phase-12-era record** — one with the reflection key deleted — to disk and asserts it still reads back honestly rather than as an error, and it asserts the source-level wiring that makes the look-back safe: the pure record-selection rule, the reflection-only write path, the touched-flag that stops an untouched reflection being written, and the two server-side guards (a reflection-only write cannot create a record, and only a carried decision can replace the execution record).

**Verified state of the build:**

- **427/427 unit and integration tests passing** — covering trade idea validation, market data derivation, event data handling, the thesis-attack engine, the historical stress-test engine, the deterministic risk engine, the trade-structure service, the final-report service, the human-decision service, the paper-execution service and its demo provider, the trade-review service, the trade-memory journal service and its routes, the Phase 13 record-selection rule and reflection-only write path, account creation and credential verification, password hashing and the session store, the auth routes, the `requireAuth` / `optionalAuth` middleware, per-account journal scoping, and the frontend stage model, auth client and session hook.
- **Production build successful** — Vite build completes and emits to `dist/`.
- **Phase 12 integration verification: 70/70 checks passing** against a live API — the journal file round-trip, the per-session upsert, verbatim thesis / reason / notes, the venue order ID surviving a read-back, an unavailable execution persisting as unavailable, a ready-but-unsubmitted order keeping no order ID, a hostile client's `pnl` / `filled` / `score` being dropped, trade A being byte-for-byte unchanged after trade B, the 400 on a missing session id, the 404 on an unknown trade, and the local-storage labelling.
- **Phase 13 integration verification: 101/101 checks passing** against a live API on its own temporary journal — the reflection-only write changing the reflection and nothing else, that same write being refused for an id that is not already saved, the route-level reflection-only update, a legacy Phase-12-era record (reflection key deleted) still reading back honestly, and the source-level wiring for the record-selection rule, the reflection-only path, the touched-flag guard and both server guards.
- **Browser verification completed successfully** — 40 checks in a real browser against the running app: a full trade A flow (submit → decision → paper execution → review notes) appearing in Trade Memory, surviving a **full page reload**, opening with the thesis / reason / notes verbatim, then trade B created and verified to hold none of A's data while A was compared field by field against a snapshot taken before B existed. **Opening Trade Memory and opening a saved trade each issued exactly one request — a journal read — and no analysis request at all.** Zero console errors.
- **Phase 13 browser verification completed successfully — 126 checks across three suites.** The reflection flow (61 checks): the whole loop once, the four labelled sidebar groups, the KNOWN / RECORDED / NOT AVAILABLE split, the thesis, reason and notes shown verbatim, a reflection that survives a full page reload, two-trade isolation, and that Trader Review issues **no analysis request**. Reviewing saved trades with no active session (41 checks): the screen lists the saved trades instead of asking for a new one, selecting BTC reviews BTC and selecting ETH reviews ETH — verbatim, and never the other trade's — switching back and forth, a reflection written on a saved trade persisting without disturbing that trade's decision or execution, a full reload keeping everything, and starting a new trade leaving the older ones reachable. A read-only smoke against the trader's **real** journal (24 checks): the app loads with no console error, all eight steps are live, every saved trade is listed and opens, and browsing issues **no write at all** — the journal file's SHA-256 is byte-identical afterwards.
- **Navigation performance re-verified after Phase 12** — Trade Report first load 0 API calls / 40 ms, Decision 0 / 159 ms, Paper Execution 0 / 117 ms, Trade Review 0 / 85 ms, returns to already-loaded screens 0 calls, section switches 0 calls (6–22 ms). The session architecture from the previous phase is intact; the only new network traffic is the debounced journal save.
- **Cross-trade isolation verified in both layers** — the shared trade session (no stale asset, thesis or decision on any screen, including mid-load) and the journal itself (a new trade gets a new session id, and a saved trade can never be overwritten by a later one).
- **Account isolation verification: 21/21 checks passing** in a real browser, against a live API on its own temporary account and session files. Two accounts are created in one browser profile, and the suite asserts the things that would matter if isolation were only skin-deep: Account B's Trade Memory says it is **empty** rather than listing Account A's trade, B sees the account it is actually signed in as, and B starts on a blank Trade Idea form rather than A's trade. Then A signs back in and A's trade is still there with its thesis **verbatim**, a refresh keeps the session, and after the refresh the signed-in account is still A. Zero console errors.
- **Design-system verification: 71/71 checks passing** in a real browser. Every screen is walked and measured — the token layer is asserted to be the source of colour and spacing, the accent is asserted to reach the icon, the active background, the edge and the glow from a single custom property, inactive navigation items are asserted to be quiet while the active one is loud, and the shared card, header and empty-state shapes are asserted to be consistent across screens. It also asserts the things that must not regress: no horizontal overflow at any width, and no console error anywhere.
- **Workspace-scrolling verification: 55/55 checks passing** in a real browser, and it is measurement-based rather than visual. It asserts the document itself does **not** scroll on the Trade Idea screen; that the centre column is its own scroll container; that at **0, 25, 50, 75 and 100%** of the centre's scroll range the Live Thesis panel's bounding box is **identical** and the panel is fully visible; that the aside scrolls internally at a shorter viewport (`scrollTop 0 → 235`) **without moving the centre**; that the tablet and short-viewport fallbacks behave; that there is no horizontal overflow at 1600 / 1440 / 1280 / 1024 / 430; and that the behaviour is unchanged where it must be — the hero action is still reachable, submitting the trade idea still starts the investigation, and the captured thesis survives the submission.
- **Final UI verification: 39/39 checks passing** in a real browser. The native dropdown audit computes, **per option**, the background alpha, the luminance and the WCAG contrast ratio against the option text, across all eleven options of Timeframe and Existing Position, and reports a worst case of **13.6:1**. It is paired with a **negative control**: the run injects `select option { background-color: transparent !important }`, confirms every option goes transparent, and only then restores it — so a pass cannot be vacuous. Alongside it the suite asserts the removed sidebar card is absent by element, by class **and** by text at four viewports, that the sidebar's last child is the navigation, that all four groups and eight items are present, that the topbar's API indicator is intact and `/api/health` answers, that all eight navigation entries are selectable, that the scrolling architecture still works, that there is no horizontal overflow, and that nothing logged a console error.

The trade-memory stage has dedicated coverage across its required scenarios: creating a record, retrieving saved trades, persistence across a reload/restart (a second store instance reading the same file), opening a saved trade, decision persistence, decision-reason persistence, execution-state persistence, review-notes persistence, unavailable-execution persistence, missing P&L staying unavailable, multiple trades staying isolated, old trades staying intact after a new one is created, the empty journal state, and malformed/missing records being handled safely. Its guards assert that a corrupt file is reported rather than shown as an empty journal, that malformed entries are skipped and counted, that a hand-edited record cannot smuggle in an order ID, a fill or a P&L, that no record carries a score, rating, win-rate or verdict field, and that a client posting `pnl: 1234.56` does not get one stored.

The Phase 13 look-back has dedicated coverage across its required scenarios: reviewing a saved trade with no active session, the active trade taking precedence, an explicit selection winning, a stale selection being ignored, an unsaved active trade still resolving, nothing at all resolving to nothing, selecting one saved trade and reviewing it, switching between saved trades, starting a new trade without losing access to an older one, a full reload, and opening a saved review issuing **no** analysis or provider request. Its guards assert the things that must never happen: a reflection-only save changes the reflection and **nothing else** (every other group is deep-compared before and after the write), a reflection-only save cannot create a record and cannot disturb a second trade, a whitespace-only note is never counted as a reflection, and the reflection group carries exactly its four honest fields with no score, grade or verdict smuggled in.

The paper-execution stage has dedicated coverage across its required scenarios: the gate locked without a recorded TAKE, locked when the risk assessment is not ready, locked when the structure is incomplete, ready when the gate is satisfied, unavailable without demo credentials, unavailable when no symbol resolves, the confirmation token being required, a wrong token being rejected, and the guarantee that a missing or wrong token sends nothing. Its guards assert the things that must never happen: no order ID or fill is fabricated when the venue is unconfigured, no credential value leaks into a response, no live-trading path exists, and a venue rejection is reported as PAPER ORDER FAILED rather than being dressed up as a success.

The trade-review stage has dedicated coverage across its required scenarios: a ready review over complete records, a locked review with no decision, an incomplete review when records are missing, an unavailable review when it cannot be assembled, the plan being `null` rather than partially fabricated when the underlying result is unavailable, the thesis being preserved verbatim, and the risk figures being read through the same helper the execution stage uses. Its guards assert that the review carries no recommendation, signal, prediction, score or ranking field, that no profit or loss is computed (`pnl.computed` is `false`), and that no BUY / SELL / HOLD / EXIT vocabulary appears in the review's own content.

The human decision stage has dedicated coverage across its required scenarios: recording each of the three decisions, the required reason, an empty or whitespace-only reason being rejected, the reason being stored verbatim and never swapped for the thesis, a missing decision never defaulting to an option, unsupported values (`BUY`, `SELL`, `PASS`, `HOLD`, `MAYBE` and malformed payloads) being rejected, malformed bodies and contexts not throwing, the system-generated timestamp, a client-supplied timestamp being ignored, the trade context being preserved in full, the risk figures being identical to the Phase 6 engine's own output, a partial or unavailable risk assessment being recorded honestly rather than filled with zeros, the decision being attributed to the trader, the standing limitations always being attached, `executed: false`, determinism across repeated runs, purity, and the absence of any score, probability, prediction or recommendation. Its guards are worth noting: the suite asserts that the stage **names** the concepts it refuses to produce only in order to deny them — the boundary copy says the decision is "not a TradeGuard recommendation" and that TradeGuard "does not tell you whether this is a good or bad trade" — so the scan is negation-aware rather than a naive substring ban, and it separately asserts that those phrases never become a positive instruction, and that no `BUY`, `SELL` or `PASS` vocabulary appears in the trader-facing options.

The final report has dedicated coverage across its required scenarios: a complete report over available structured inputs, a bullish report, a bearish report, missing market data, missing event data, missing historical data, a partial Devil's Advocate, direct reuse of the risk engine's results, reuse of the trade structure's result, missing trade information, the absence of fabricated evidence, the absence of any BUY / SELL / PASS recommendation, the absence of any score, probability or prediction, the correct final decision boundary wording, and the existing Phase 1–8 regressions.

The report's verdict guard is worth noting because it is subtly tested twice over. The report legitimately *names* the things it refuses to produce — its boundary copy says it "does not tell you to buy, to sell, or to pass", and it restates Phase 5's guarantee that a match frequency "is not a probability, a win rate, or an edge". A naive scan cannot tell a negation from an assertion, so the suite scans the report's substantive content for banned terms and separately asserts that every occurrence of those terms in the report's disclosure copy sits inside a negation, and that the copy never becomes a positive instruction.

The trade structure has dedicated coverage across its required scenarios: a complete bullish structure, a complete bearish structure, a missing entry, a missing invalidation, a missing risk amount, an invalid risk assessment, an incomplete risk assessment, preservation of the trader-supplied entry and invalidation, direct reuse of the risk engine's output object, the absence of any BUY / SELL / PASS verdict, the absence of fabricated values, and determinism across repeated builds.

The risk engine has dedicated coverage across its required scenarios: a valid long trade, a valid short trade, zero price risk, negative price risk, each missing input reported together, malformed and non-positive numeric values, an unusable risk budget, position-size derivation, defined risk matching the declared budget, boundary conditions (a very tight and a very wide invalidation, currency-formatted input, out-of-range values), a neutral thesis with no directional side, and explicit guards that the engine contains no provider import, no network call, no market price, no verdict, and no fabricated number when it is not ready.

The historical stress test has dedicated coverage across its required scenarios: real retrieval, matching, no matches, provider failure, malformed responses, a missing asset, short samples, an assumed timeframe, an explicit timeframe, bullish and bearish interpretation of the same series, non-predictive wording, no fabricated observations when history is unavailable, absence of any trade instruction or score, the shared candle contract, the shared Phase 4 thresholds, and traceability of the research context.

Accounts and sessions have dedicated coverage across their required scenarios: creating an account, a duplicate credential being refused, a missing or malformed credential being refused, signing in with a correct credential, signing in with a wrong password, the session cookie being set and cleared, the cookie carrying no account data, the session resolving back to its account, a deleted session no longer resolving, and signing out invalidating the session server-side rather than only in the browser. Their guards assert the things that must never happen: a password is never stored in plain text or returned in any response, a session id is never returned in a body, a failed sign-in never reveals whether the account exists, and a session that has been deleted cannot be replayed.

Data isolation has dedicated coverage in the journal layer as well as the API layer: two accounts each saving a trade, each seeing only their own list, each opening only their own record, one account's trade returning 404 to the other, and an owner supplied in the request body being ignored in favour of the session. Its guards assert that no journal route accepts an owner as input, that a record's owner is written from the resolved session and never from the payload, and that a hand-edited record claiming another owner is not served to that owner's session.

The design system and the workspace layout have coverage that is deliberately mechanical rather than visual, because "it looks right" is not a property a test can hold: computed background colours and contrast ratios, bounding boxes compared across a scroll range, `scrollHeight` against `clientHeight`, and overflow measured at five viewport widths. Where a check could pass by accident it is paired with a negative control that injects the original defect.

Test suites live in `server/tests/` and alongside the frontend library code in `src/lib/`. The unit tests do not require network access or a live AI provider — provider interactions are tested against fixtures through injectable `fetch` implementations.

---

## Project documentation

- **`README.md`** (this file) — public-facing project documentation: what TradeGuard is, what works today, how to run it.
- **[`TradeGuard.md`](./TradeGuard.md)** — the detailed product requirements document (PRD): product definition, target user, screen-by-screen specification, AI module responsibilities, and the full phased development plan.

This README summarises the product; `TradeGuard.md` is the source of truth for specification and scope.

---

## Roadmap

The phased plan is complete. **Phases 1–13 are built** — the workflow described in [`TradeGuard.md`](./TradeGuard.md) runs end to end, from submitting a thesis through to reflecting on a saved trade. No further phase is planned, and no capability is presented as forthcoming.

**Phase 13 — Trader Review & Polish is complete** (see [the section above](#phase-13--trader-review--polish)): any saved trade can be reviewed with or without a trade in progress, what was known and what was recorded is read back verbatim, what is missing is stated as missing, and your own reflection is stored alongside it. The polish half of the phase replaced the last development-looking copy, split the navigation into four labelled groups, brought the last locked entry to life, and consolidated the stylesheet.

**Three pieces of work followed the plan, and they are built too** (see [After Phase 13](#after-phase-13--accounts-the-design-system-and-the-workspace)): accounts with per-account data isolation enforced by the API, the interface finished as a design system over a single token layer, and the Trade Idea workspace given its own scrolling architecture. None of them adds a trading stage, so none of them is a phase — but the product you run today is not the Phase 13 build.

**Phase 12 — Trade Memory is complete** (see [its section](#phase-12--trade-memory)): the full decision context is persisted and read back — what you believed, why, what the investigation recorded, what you decided, and what was (or was not) executed. One thing the original plan placed there is deliberately **not** built: any "AI warning" or recurring-pattern detection over the journal. Trade Memory stores and reads back, and Trader Review gives you a place to reflect in your own words; neither analyses, scores or classifies. That work was never argued for, and with the plan complete it is not planned.

---

## Hackathon context

TradeGuard is being built for the **Bitget AI Hackathon S2**, under the **AI Trading Desk** track — the AI research workbench direction, where AI processes information and presents analysis while the human trader makes the final call. The **Decision Stress-Testing** sub-theme is the direct inspiration for Phase 5: given a trade idea, retrieve historically similar setups and show what followed. That focus — AI-assisted research and decision stress-testing with the human kept in control — is what the product is designed around, rather than a demo built for the event.

---

## Product principles

1. **Evidence before opinion.** Conclusions connect to observable data, or they are labelled as missing.
2. **Challenge the thesis.** The system is built to look for what could make the trade wrong.
3. **No fabricated data.** Missing market, event, or historical data is surfaced as missing, never filled in. The same rule governs the journal: a missing order ID, fill or P&L is stored as missing.
4. **Human in the loop.** The trader makes the decision; TradeGuard never makes it for them.
5. **Deterministic risk controls.** Critical calculations and classifications do not depend on a language model.
6. **Transparent uncertainty.** Supported, mixed, weak, and insufficient evidence are distinct, stated outcomes.
7. **No autonomous live trading.** TradeGuard's only order path is the Bitget **Demo** environment, triggered solely by a trader-typed confirmation token, with the live-trading environment variables acting as a refusal condition. It cannot place a live-money order, and no stage executes on its own initiative.
8. **Memory is not analysis.** Remembering what you recorded is a storage concern. TradeGuard does not turn your history into a score, a rating, a win rate or a recommendation.
9. **Your records are your own.** Access is per-account and enforced by the API, not by the interface. A record's owner comes from the session and never from the request, so one account cannot read, overwrite or even discover another's trades — and a password is only ever stored as a hash.

---

## Repository

**https://github.com/ViolakendallX/TradeGuard**

Research output, not a trading instruction. TradeGuard does not predict outcomes and does not place trades — the decision remains yours.
