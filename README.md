# TradeGuard

> **An AI-powered trading decision desk that challenges, researches, and stress-tests your trade thesis before you risk capital.**

**Stress-test your trade thesis before you risk capital.**

TradeGuard is not a signal service and not an autonomous trading bot. You bring a trade idea; TradeGuard investigates it, attacks it, stress-tests it against history, and tells you what could make it wrong — then leaves the decision to you.

**Status:** Phases 1–5 complete · Phases 6–13 planned. See [Current development status](#current-development-status).

---

## What is TradeGuard?

TradeGuard is a trading decision desk for discretionary traders. It takes a thesis you already have and investigates it *before* capital is put at risk.

It does five things:

- **Challenges your thesis** — it actively searches for evidence that could break it, rather than collecting reasons to agree with you.
- **Researches market and event context** — price, trend, volatility, and upcoming catalysts for the asset you are trading.
- **Separates supporting from contradicting evidence** — you see both sides classified, not blended into a single opinion.
- **Stress-tests the idea against history** — it retrieves real historical candles for the asset and reports what followed comparable past setups, or says plainly that historical data is unavailable.
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

**Implemented today:** THESIS → RESEARCH → CHALLENGE → STRESS TEST.
**Still on the roadmap:** RISK CHECK, HUMAN DECISION, PAPER EXECUTION, REVIEW, LEARN.

Later stages are planned, not built. Nothing after Phase 5 is presented as working.

---

## How it currently works

The implemented flow runs end to end in the browser:

```
Trade Idea  →  Investigation  →  Market Context
                              →  Events & Catalysts
                              →  Devil's Advocate / Thesis Attack
                              →  Historical Stress Test
```

**You submit:** asset, direction, thesis, timeframe, entry price, risk amount, confidence, and existing position.

**The investigation can currently:**

- retrieve market context for the asset when the market data provider is reachable
- retrieve event and catalyst information when an events provider is configured
- analyse the thesis against whatever evidence was actually retrieved
- separate supporting evidence from contradicting evidence
- retrieve real historical candles for the asset and match comparable past setups using published rules
- report what followed those comparable setups, as observed historical outcomes rather than predictions
- identify missing information
- identify invalidation conditions when there is enough data to derive them
- explicitly report insufficient or data-limited states instead of inventing evidence to fill the gap

Each stage reports its own runtime state — complete, partial, or unavailable — based on what the underlying work actually produced. A stage is never marked complete just because it ran.

---

## Current development status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| Phase 1 — Foundation | React/Vite frontend, Express backend, app shell, navigation, Trade Idea screen | ✅ Complete |
| Phase 2 — Investigation Flow | Investigation screen, stage model, progress states | ✅ Complete |
| Phase 3 — Market & Event Research | Live market context, event/catalyst research, honest unavailability states | ✅ Complete |
| Phase 4 — Devil's Advocate / Thesis Attack | Thesis extraction, supporting vs contradicting evidence, risks, invalidation conditions | ✅ Complete |
| Phase 5 — Historical Stress Test | Real historical candle retrieval, deterministic setup matching, observed outcomes, explicit unavailable/partial states | ✅ Complete |
| Phase 6 — Risk Engine | Deterministic max loss / max profit / breakeven / sizing / exposure | ⏳ Planned |
| Phase 7 — Trade Structuring | Defined-risk trade proposals where supported | ⏳ Planned |
| Phase 8 — Final Trade Report | One consolidated decision-ready report | ⏳ Planned |
| Phase 9 — Human Decision | Execute / Modify / Pass with decision recording | ⏳ Planned |
| Phase 10 — Paper Execution | Paper order submission, execution status, trade record | ⏳ Planned |
| Phase 11 — Trade Memory | Persistent trade journal | ⏳ Planned |
| Phase 12 — Post-Trade Review | Before/after comparison, AI warnings, outcome, lesson | ⏳ Planned |
| Phase 13 — Trader Review & Polish | Recurring pattern detection, error/loading states, responsive UI, demo flow | ⏳ Planned |

Phases 6–13 are not implemented in any form. The screens they will occupy (Trade Report, Decision, Trade Review, Trader Review) exist only as explicit placeholders marked "not built in this phase", and the investigation UI labels those stages as arriving in a later phase — the Risk Assessment stage remains locked.

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
- **It never recommends a trade.** There is no BUY, SELL, or PASS, and no position sizing — that is Phase 6 and later.

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
- **Research output is not a trading instruction.** Every analysis carries a disclaimer to that effect.
- **The human remains responsible for the final decision.**
- **No autonomous live trading.** TradeGuard cannot place an order, and paper execution is not built yet.
- **Provider credentials stay server-side.** API keys are read from the backend environment and never reach the browser.

---

## Analysis architecture

The Phase 4 thesis attack and the Phase 5 historical stress test both run entirely in the backend as deterministic pipelines. The thesis attack:

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
│   ├── lib/                      API client, constants, stage model, validation
│   └── styles/                   Design tokens and styles
│
└── server/                       Express backend
    ├── index.js                  App wiring, /api/health
    ├── routes/                   tradeIdeas, research, thesisAttack, historicalStressTest
    ├── services/                 marketData, eventData, thesisAttack, historicalStressTest
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

Provider integrations are isolated behind service modules (`server/services/providers/`), so swapping a data source means writing one provider module rather than touching the research pipeline.

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
| Unit / integration tests | Node.js built-in test runner (`node --test`) |
| Browser verification | Playwright (`playwright-core`) driving headless Chrome — used to verify the flow during development, not a declared project dependency |

**Future work (not currently implemented):** historical market data storage, a deterministic risk-calculation engine, defined-risk options structuring, persistent trade storage, and optional LLM-based explanation of deterministic findings.

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

**Verified state of the Phase 5 build:**

- **72/72 unit and integration tests passing** — covering trade idea validation, market data derivation, event data handling, the thesis-attack engine, the historical stress-test engine, and the frontend stage model.
- **Production build successful** — Vite build completes and emits to `dist/`.
- **Browser verification completed successfully** — the full flow was exercised in a real browser against the running app, including the data-limited Devil's Advocate state and the historical stress test in both its available and `HISTORICAL DATA UNAVAILABLE` forms, confirming that unavailable data is reported honestly and that no evidence or historical observation is fabricated.

The historical stress test has dedicated coverage across its required scenarios: real retrieval, matching, no matches, provider failure, malformed responses, a missing asset, short samples, an assumed timeframe, an explicit timeframe, bullish and bearish interpretation of the same series, non-predictive wording, no fabricated observations when history is unavailable, absence of any trade instruction or score, the shared candle contract, the shared Phase 4 thresholds, and traceability of the research context.

Test suites live in `server/tests/` and alongside the frontend library code in `src/lib/`. The unit tests do not require network access or a live AI provider — provider interactions are tested against fixtures through injectable `fetch` implementations.

---

## Project documentation

- **`README.md`** (this file) — public-facing project documentation: what TradeGuard is, what works today, how to run it.
- **[`TradeGuard.md`](./TradeGuard.md)** — the detailed product requirements document (PRD): product definition, target user, screen-by-screen specification, AI module responsibilities, and the full phased development plan.

This README summarises the product; `TradeGuard.md` is the source of truth for specification and scope.

---

## Roadmap

Phases 6–13, in order. All are planned and none are implemented:

- **Phase 6 — Risk Engine.** Deterministic calculation of maximum loss, maximum profit, breakeven, position size, risk percentage, reward/risk, and exposure. The application calculates; the AI explains.
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
