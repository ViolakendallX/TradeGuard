# TradeGuard

> **An AI-powered trading decision desk that challenges, researches, and stress-tests your trade thesis before you risk capital.**

**Stress-test your trade thesis before you risk capital.**

TradeGuard is not a signal service and not an autonomous trading bot. You bring a trade idea; TradeGuard investigates it, attacks it, stress-tests it against history, calculates the risk you have actually defined — then leaves the decision to you.

**Status:** Phases 1–6 complete · Phases 7–13 planned. See [Current development status](#current-development-status).

---

## What is TradeGuard?

TradeGuard is a trading decision desk for discretionary traders. It takes a thesis you already have and investigates it *before* capital is put at risk.

It does six things:

- **Challenges your thesis** — it actively searches for evidence that could break it, rather than collecting reasons to agree with you.
- **Researches market and event context** — price, trend, volatility, and upcoming catalysts for the asset you are trading.
- **Separates supporting from contradicting evidence** — you see both sides classified, not blended into a single opinion.
- **Stress-tests the idea against history** — it retrieves real historical candles for the asset and reports what followed comparable past setups, or says plainly that historical data is unavailable.
- **Calculates the risk you defined** — from your own entry, invalidation and risk budget it derives the price risk per unit, the position size that keeps your loss at that budget, and the defined risk — or says plainly that an input is missing or the construction contradicts itself.
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
       →  HUMAN DECISION  →  PAPER EXECUTION  →  REVIEW  →  LEARN
```

**Implemented today:** THESIS → RESEARCH → CHALLENGE → STRESS TEST → RISK CHECK.
**Still on the roadmap:** HUMAN DECISION, PAPER EXECUTION, REVIEW, LEARN.

Later stages are planned, not built. Nothing after Phase 6 is presented as working.

---

## How it currently works

The implemented flow runs end to end in the browser:

```
Trade Idea  →  Investigation  →  Market Context
                              →  Events & Catalysts
                              →  Devil's Advocate / Thesis Attack
                              →  Historical Stress Test
                              →  Risk Assessment
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
- identify missing information
- identify invalidation conditions when there is enough data to derive them
- explicitly report insufficient or data-limited states instead of inventing evidence to fill the gap

Each stage reports its own runtime state — complete, partial, or unavailable — based on what the underlying work actually produced. A stage is never marked complete just because it ran. An incomplete or invalid risk assessment is reported as **partial**, because the stage ran but the defined risk it exists to produce does not exist.

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
| Phase 7 — Trade Structuring | Defined-risk trade proposals where supported | ⏳ Planned |
| Phase 8 — Final Trade Report | One consolidated decision-ready report | ⏳ Planned |
| Phase 9 — Human Decision | Execute / Modify / Pass with decision recording | ⏳ Planned |
| Phase 10 — Paper Execution | Paper order submission, execution status, trade record | ⏳ Planned |
| Phase 11 — Trade Memory | Persistent trade journal | ⏳ Planned |
| Phase 12 — Post-Trade Review | Before/after comparison, AI warnings, outcome, lesson | ⏳ Planned |
| Phase 13 — Trader Review & Polish | Recurring pattern detection, error/loading states, responsive UI, demo flow | ⏳ Planned |

Phases 7–13 are not implemented in any form. The screens they will occupy (Trade Report, Decision, Trade Review, Trader Review) exist only as explicit placeholders marked "not built in this phase", and they remain disabled in the navigation. All six investigation stages — Thesis, Market Context, Events & Catalysts, Devil's Advocate, Historical Stress Test and Risk Assessment — are now active; nothing in the investigation is locked.

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
- **No trade verdict.** There is no BUY, SELL, or PASS anywhere in the product — not in the risk stage, not in any other stage.
- **Research output is not a trading instruction.** Every analysis carries a disclaimer to that effect.
- **The human remains responsible for the final decision.**
- **No autonomous live trading.** TradeGuard cannot place an order, and paper execution is not built yet.
- **Provider credentials stay server-side.** API keys are read from the backend environment and never reach the browser.

---

## Analysis architecture

The Phase 4 thesis attack, the Phase 5 historical stress test and the Phase 6 risk engine all run entirely in the backend as deterministic pipelines. The thesis attack:

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

Every statement in the output is derived from an observable input — a price move, a trend direction, a volatility reading, an event date, a historical candle, or a detail from your own submission. The thresholds that drive classification (flat-move band, extended-move threshold, elevated-volatility threshold, proximity to a 24h extreme) are documented constants in the code, shared by both engines, so the reasoning is explainable and reproducible.

**Why deterministic rather than LLM-driven:** critical conclusions should not depend on a model's willingness to be disagreeable, and the classification should be testable without a live AI provider. Determinism also keeps the honesty guarantees enforceable — a rule can guarantee that no bearish evidence is invented; a prompt cannot.

This is deliberately a **clean seam**. The evidence classification and the numbers stay deterministic, while an LLM could later be layered on top to *explain* the findings in natural language. Adding that layer would not make the core classification dependent on an external model.

---

## Architecture

```
TRADEGUARD
│
├── src/                          React + Vite frontend
│   ├── screens/                  Trade Idea, Investigation, placeholder screens for later phases
│   ├── components/               App shell, sidebar, trade-idea components
│   │   └── investigation/        Investigation workspace: trade header, section nav, analysis panels
│   ├── lib/                      API client, constants, stage model, investigation view model, validation
│   └── styles/                   Design tokens and styles
│
└── server/                       Express backend
    ├── index.js                  App wiring, /api/health
    ├── routes/                   tradeIdeas, research, thesisAttack, historicalStressTest, riskAssessment
    ├── services/                 marketData, eventData, thesisAttack, historicalStressTest, riskEngine
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

Provider integrations are isolated behind service modules (`server/services/providers/`), so swapping a data source means writing one provider module rather than touching the research pipeline. The risk engine deliberately sits outside that structure: it has no provider dependency to isolate.

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

**Verified state of the Phase 6 build:**

- **118/118 unit and integration tests passing** — covering trade idea validation, market data derivation, event data handling, the thesis-attack engine, the historical stress-test engine, the deterministic risk engine, and the frontend stage model.
- **Production build successful** — Vite build completes and emits to `dist/`.
- **Browser verification completed successfully** — the full flow was exercised in a real browser against the running app, including the data-limited Devil's Advocate state, the historical stress test in both its available and `HISTORICAL DATA UNAVAILABLE` forms, and the risk assessment in its RISK READY, INCOMPLETE and INVALID TRADE CONSTRUCTION states, confirming that unavailable data is reported honestly and that no evidence, historical observation or risk number is fabricated.

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

Phases 7–13, in order. All are planned and none are implemented:

- **Phase 7 — Trade Structuring.** Propose defined-risk structures where sufficient market data exists, as research output rather than an instruction.
- **Phase 8 — Final Trade Report.** Consolidate thesis, research, attack, historical test, risk, and structure into one decision-ready report.
- **Phase 9 — Human Decision.** Execute / Modify / Pass, with the decision recorded. No trade can proceed without explicit human approval.
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
