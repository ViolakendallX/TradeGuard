# TradeGuard

> **An AI-powered trading decision desk that challenges, researches, and stress-tests your trade thesis before you risk capital.**

**Stress-test your trade thesis before you risk capital.**

TradeGuard is not a signal service and not an autonomous trading bot. You bring a trade idea; TradeGuard investigates it, attacks it, stress-tests it against history, calculates the risk you have actually defined, consolidates the whole investigation into one report — and then you record the decision yourself.

**Status:** Phases 1–9 complete · Phases 10–13 planned. See [Current development status](#current-development-status).

---

## What is TradeGuard?

TradeGuard is a trading decision desk for discretionary traders. It takes a thesis you already have and investigates it *before* capital is put at risk.

It does nine things:

- **Challenges your thesis** — it actively searches for evidence that could break it, rather than collecting reasons to agree with you.
- **Researches market and event context** — price, trend, volatility, and upcoming catalysts for the asset you are trading.
- **Separates supporting from contradicting evidence** — you see both sides classified, not blended into a single opinion.
- **Stress-tests the idea against history** — it retrieves real historical candles for the asset and reports what followed comparable past setups, or says plainly that historical data is unavailable.
- **Calculates the risk you defined** — from your own entry, invalidation and risk budget it derives the price risk per unit, the position size that keeps your loss at that budget, and the defined risk — or says plainly that an input is missing or the construction contradicts itself.
- **Brings the trade together into one structured plan** — asset, direction, timeframe, entry, invalidation, risk and thesis conditions collected into a single view, reusing the risk engine's numbers rather than recomputing them, or reported as an explicit incomplete state.
- **Consolidates everything into one final report** — the setup, the thesis and its evidence, the market and event context, the attack, the historical comparison, the defined risk and the invalidation conditions collected into one scannable report, with every section marked available, partial or unavailable and the remaining information gaps listed.
- **Records the decision you make, but never makes it** — you choose TAKE, WAIT or SKIP and give your own reason, and TradeGuard stores that decision with the time it was recorded and the trade and risk context behind it. It does not suggest which one to pick, does not write the reason, and does not execute anything.
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
       →  TRADE STRUCTURE  →  FINAL REPORT  →  HUMAN DECISION  →  PAPER EXECUTION  →  REVIEW  →  LEARN
```

**Implemented today:** THESIS → RESEARCH → CHALLENGE → STRESS TEST → RISK CHECK → TRADE STRUCTURE → FINAL REPORT → HUMAN DECISION.
**Still on the roadmap:** PAPER EXECUTION, REVIEW, LEARN.

Later stages are planned, not built. Nothing after Phase 9 is presented as working.

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
```

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
- identify missing information
- identify invalidation conditions when there is enough data to derive them
- explicitly report insufficient or data-limited states instead of inventing evidence to fill the gap

Each stage reports its own runtime state — complete, partial, or unavailable — based on what the underlying work actually produced. A stage is never marked complete just because it ran. An incomplete or invalid risk assessment is reported as **partial**, because the stage ran but the defined risk it exists to produce does not exist. The same rule applies to the trade structure: an incomplete structure is reported as **partial**. The same rule applies once more to the final report: a report assembled over an investigation with a missing provider is reported as **partial**, because the thing the stage exists to produce — the whole investigation consolidated — is not fully there. The Human Decision stage follows the same rule from the other direction: it is complete only once **you** have actually recorded a decision, so it stays in **DECISION REQUIRED** until a decision exists rather than assuming one.

One distinction matters for the final report. A report whose sections are honestly marked **unavailable** is still a real report: it tells you which evidence is missing and why. What it never does is dress an incomplete investigation up as a complete one, or substitute generic commentary, assumed prices or invented events for evidence it does not have.

The Investigation screen presents all of this as a single workspace rather than one long stacked page. A persistent trade header keeps the trade context (asset, direction, timeframe, entry, stop, risk, confidence, existing position) and the **Edit thesis** action visible at the top; a section navigation rail lists every investigation stage with its current runtime state and lets you move between them; and the selected section is rendered in one analysis panel beside the rail. Navigation is a presentation concern only — it does not change when, whether, or how any analysis runs.

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
| Phase 10 — Paper Execution | Paper order submission, execution status, trade record | ⏳ Planned |
| Phase 11 — Trade Memory | Persistent trade journal | ⏳ Planned |
| Phase 12 — Post-Trade Review | Before/after comparison, AI warnings, outcome, lesson | ⏳ Planned |
| Phase 13 — Trader Review & Polish | Recurring pattern detection, error/loading states, responsive UI, demo flow | ⏳ Planned |

Phases 10–13 are not implemented in any form. The screens they will occupy (Trade Review, Trader Review) exist only as explicit placeholders marked "not built in this phase", and they remain disabled in the navigation. All nine investigation stages — Thesis, Market Context, Events & Catalysts, Devil's Advocate, Historical Stress Test, Risk Assessment, Trade Structure, Final Trade Report and Human Decision — are now active; nothing in the investigation is locked.

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
- **It never executes anything.** TradeGuard has no execution path at all.

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

**Boundary:** TradeGuard records the decision you make and the reason you give for it. It does not make the decision, does not recommend one of the options, does not score the trade, and does not tell you whether this is a good or bad trade. What is stored is your judgement, written by you. [Paper execution](#roadmap) is a later phase and is not built.

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
- **No autonomous live trading.** TradeGuard cannot place an order, and paper execution is not built yet.
- **Provider credentials stay server-side.** API keys are read from the backend environment and never reach the browser.

---

## Analysis architecture

The Phase 4 thesis attack, the Phase 5 historical stress test, the Phase 6 risk engine, the Phase 7 trade structure and the Phase 8 final report all run entirely in the backend as deterministic pipelines. The thesis attack:
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

Every statement in the output is derived from an observable input — a price move, a trend direction, a volatility reading, an event date, a historical candle, a detail from your own submission, or a decision you recorded. The thresholds that drive classification (flat-move band, extended-move threshold, elevated-volatility threshold, proximity to a 24h extreme) are documented constants in the code, shared by both engines, so the reasoning is explainable and reproducible.

**Why deterministic rather than LLM-driven:** critical conclusions should not depend on a model's willingness to be disagreeable, and the classification should be testable without a live AI provider. Determinism also keeps the honesty guarantees enforceable — a rule can guarantee that no bearish evidence is invented; a prompt cannot.

This is deliberately a **clean seam**. The evidence classification and the numbers stay deterministic, while an LLM could later be layered on top to *explain* the findings in natural language. Adding that layer would not make the core classification dependent on an external model.

---

## Architecture

```
TRADEGUARD
│
├── src/                          React + Vite frontend
│   ├── screens/                  Trade Idea, Investigation, Decision, placeholder screens for later phases
│   ├── components/               App shell, sidebar, trade-idea components
│   │   └── investigation/        Investigation workspace: trade header, section nav, analysis panels
│   ├── lib/                      API client, constants, stage model, investigation view model, validation
│   └── styles/                   Design tokens and styles
│
└── server/                       Express backend
    ├── index.js                  App wiring, /api/health
    ├── routes/                   tradeIdeas, research, thesisAttack, historicalStressTest, riskAssessment, tradeStructure, finalReport, humanDecision
    ├── services/                 marketData, eventData, thesisAttack, historicalStressTest, riskEngine, tradeStructure, finalReport, humanDecision
    │   └── providers/            bitget (isolated provider knowledge)
    ├── lib/                      Trade idea validation
    └── tests/                    Node test runner suites
```

**Frontend:** React with Vite. Hash-based navigation across the application screens, with the Trade Idea → Investigation flow wired end to end.

**Backend:** Node.js with Express. One process, no database. The API surface:

| Endpoint | Purpose |
| -------- | ------- |
| `GET /api/health` | Service status, including the current build phase |
| `POST /api/trade-ideas` | Validate and capture a submitted thesis |
| `POST /api/research` | Market context + event research for the asset |
| `POST /api/thesis-attack` | The Devil's Advocate analysis |
| `POST /api/historical-stress-test` | Historical setup matching and observed outcomes for the asset |
| `POST /api/risk-assessment` | Deterministic price risk, position size and defined risk from the trader's own levels |
| `POST /api/trade-structure` | The trade setup, risk result, thesis context and invalidation conditions combined into one structured trade plan |
| `POST /api/final-report` | The ten-section final report consolidating Phases 1–7, with per-section evidence states and the explicit decision boundary |
| `POST /api/human-decision` | Records the trader's own decision — TAKE / WAIT / SKIP with a required trader-written reason — against the trade, with a system-generated timestamp and the trade and risk context attached. Returns 400 and a DECISION REQUIRED record when the submission is invalid; the route's execution output is documented as *"None"* |

Provider integrations are isolated behind service modules (`server/services/providers/`), so swapping a data source means writing one provider module rather than touching the research pipeline. The risk engine deliberately sits outside that structure: it has no provider dependency to isolate. The trade structure sits outside it too, and depends only on the risk engine — so it inherits the risk engine's independence from every data provider. The final report goes further still: it depends only on the risk engine as well, and takes every earlier stage's result as an argument, so it can assemble an honest report with every data provider unreachable. `POST /api/final-report` therefore always returns HTTP 200 — an unavailable provider and a missing entry price are real, reportable answers, not errors. The human decision route sits outside the provider structure for the same reason, and depends only on the risk engine to carry its figures through; it is the one route that returns **400** on a bad request, because an absent decision or an unwritten reason is a validation failure rather than an analysis outcome, and there is no honest record to build from it.

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
| Unit / integration tests | Node.js built-in test runner (`node --test`) |
| Browser verification | Playwright (`playwright-core`) driving headless Chrome — used to verify the flow during development, not a declared project dependency |

**Future work (not currently implemented):** historical market data storage, defined-risk options structuring, persistent trade storage, and optional LLM-based explanation of deterministic findings.

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
| `PORT` | No | Backend port. Defaults to `8787`. |

Never commit a real `.env` file or real API keys. The default contract for the events provider is:

```
GET {TRADEGUARD_EVENTS_API_BASE}/earnings_calendar?symbol=<EQUITY>&apikey=<KEY>
```

---

## Testing

```bash
npm test        # unit + integration tests
npm run build   # production build
```

**Verified state of the Phase 9 build:**

- **241/241 unit and integration tests passing** — covering trade idea validation, market data derivation, event data handling, the thesis-attack engine, the historical stress-test engine, the deterministic risk engine, the trade-structure service, the final-report service, the human-decision service, and the frontend stage model.
- **Production build successful** — Vite build completes and emits to `dist/`.
- **Browser verification completed successfully** — the full flow was exercised in a real browser against the running app, including recording a real TAKE decision with a trader-written reason on a worked example (rNVDA, bullish, entry 100, invalidation 95, risk 50) and confirming the stored record carried the correct timestamp, the verbatim reason, the trade context and the risk engine's own figures (5 per unit, 10 units, defined risk 50), alongside the DECISION REQUIRED state before recording and the DECISION RECORDED state after, and the confirmation that no verdict, score, probability, prediction or recommendation appears anywhere.

The human decision stage has dedicated coverage across its required scenarios: recording each of the three decisions, the required reason, an empty or whitespace-only reason being rejected, the reason being stored verbatim and never swapped for the thesis, a missing decision never defaulting to an option, unsupported values (`BUY`, `SELL`, `PASS`, `HOLD`, `MAYBE` and malformed payloads) being rejected, malformed bodies and contexts not throwing, the system-generated timestamp, a client-supplied timestamp being ignored, the trade context being preserved in full, the risk figures being identical to the Phase 6 engine's own output, a partial or unavailable risk assessment being recorded honestly rather than filled with zeros, the decision being attributed to the trader, the standing limitations always being attached, `executed: false`, determinism across repeated runs, purity, and the absence of any score, probability, prediction or recommendation. Its guards are worth noting: the suite asserts that the stage **names** the concepts it refuses to produce only in order to deny them — the boundary copy says the decision is "not a TradeGuard recommendation" and that TradeGuard "does not tell you whether this is a good or bad trade" — so the scan is negation-aware rather than a naive substring ban, and it separately asserts that those phrases never become a positive instruction, and that no `BUY`, `SELL` or `PASS` vocabulary appears in the trader-facing options.

The final report has dedicated coverage across its required scenarios: a complete report over available structured inputs, a bullish report, a bearish report, missing market data, missing event data, missing historical data, a partial Devil's Advocate, direct reuse of the risk engine's results, reuse of the trade structure's result, missing trade information, the absence of fabricated evidence, the absence of any BUY / SELL / PASS recommendation, the absence of any score, probability or prediction, the correct final decision boundary wording, and the existing Phase 1–8 regressions.

The report's verdict guard is worth noting because it is subtly tested twice over. The report legitimately *names* the things it refuses to produce — its boundary copy says it "does not tell you to buy, to sell, or to pass", and it restates Phase 5's guarantee that a match frequency "is not a probability, a win rate, or an edge". A naive scan cannot tell a negation from an assertion, so the suite scans the report's substantive content for banned terms and separately asserts that every occurrence of those terms in the report's disclosure copy sits inside a negation, and that the copy never becomes a positive instruction.

The trade structure has dedicated coverage across its required scenarios: a complete bullish structure, a complete bearish structure, a missing entry, a missing invalidation, a missing risk amount, an invalid risk assessment, an incomplete risk assessment, preservation of the trader-supplied entry and invalidation, direct reuse of the risk engine's output object, the absence of any BUY / SELL / PASS verdict, the absence of fabricated values, and determinism across repeated builds.

The risk engine has dedicated coverage across its required scenarios: a valid long trade, a valid short trade, zero price risk, negative price risk, each missing input reported together, malformed and non-positive numeric values, an unusable risk budget, position-size derivation, defined risk matching the declared budget, boundary conditions (a very tight and a very wide invalidation, currency-formatted input, out-of-range values), a neutral thesis with no directional side, and explicit guards that the engine contains no provider import, no network call, no market price, no verdict, and no fabricated number when it is not ready.

The historical stress test has dedicated coverage across its required scenarios: real retrieval, matching, no matches, provider failure, malformed responses, a missing asset, short samples, an assumed timeframe, an explicit timeframe, bullish and bearish interpretation of the same series, non-predictive wording, no fabricated observations when history is unavailable, absence of any trade instruction or score, the shared candle contract, the shared Phase 4 thresholds, and traceability of the research context.

Test suites live in `server/tests/` and alongside the frontend library code in `src/lib/`. The unit tests do not require network access or a live AI provider — provider interactions are tested against fixtures through injectable `fetch` implementations.

---

## Project documentation

- **`README.md`** (this file) — public-facing project documentation: what TradeGuard is, what works today, how to run it.
- **[`TradeGuard.md`](./TradeGuard.md)** — the detailed product requirements document (PRD): product definition, target user, screen-by-screen specification, AI module responsibilities, and the full phased development plan.

This README summarises the product; `TradeGuard.md` is the source of truth for specification and scope.

---

## Roadmap

Phases 10–13, in order. All are planned and none are implemented:

- **Phase 10 — Paper Execution.** Simulated order submission, execution status, and trade record.
- **Phase 11 — Trade Memory.** Persist the full decision context — what you believed, why, what TradeGuard warned about, what you decided, and what happened.
- **Phase 12 — Post-Trade Review.** Before/after comparison, the original warnings, the outcome, and the lesson.
- **Phase 13 — Trader Review & Polish.** Recurring pattern detection from your own trade history, plus error states, loading states, responsive UI, and the end-to-end demo flow.

---

## Hackathon context

TradeGuard is being built for the **Bitget AI Hackathon S2**, under the **AI Trading Desk** track — the AI research workbench direction, where AI processes information and presents analysis while the human trader makes the final call. The **Decision Stress-Testing** sub-theme is the direct inspiration for Phase 5: given a trade idea, retrieve historically similar setups and show what followed. That focus — AI-assisted research and decision stress-testing with the human kept in control — is what the product is designed around, rather than a demo built for the event.

---

## Product principles

1. **Evidence before opinion.** Conclusions connect to observable data, or they are labelled as missing.
2. **Challenge the thesis.** The system is built to look for what could make the trade wrong.
3. **No fabricated data.** Missing market, event, or historical data is surfaced as missing, never filled in.
4. **Human in the loop.** The trader makes the decision; TradeGuard never makes it for them.
5. **Deterministic risk controls.** Critical calculations and classifications do not depend on a language model.
6. **Transparent uncertainty.** Supported, mixed, weak, and insufficient evidence are distinct, stated outcomes.
7. **No autonomous live trading.** TradeGuard has no execution capability in the current product.

---

## Repository

**https://github.com/ViolakendallX/TradeGuard**

Research output, not a trading instruction. TradeGuard does not predict outcomes and does not place trades — the decision remains yours.
