# TradeGuard

> An AI-powered trading decision desk that challenges, researches, and stress-tests your trade thesis before you risk capital.

## Phase 1 — Foundation (current build)

This build contains **only** Phase 1 of the TradeGuard PRD (`TradeGuard.md`):

- React + Vite frontend
- Minimal Express backend foundation
- Clean application shell + navigation (Trade Idea active, later screens marked as planned)
- Trade Idea screen with the thesis form
- `STRESS-TEST MY TRADE` button — validates and captures the thesis, then shows a
  "thesis captured" state

**Not built in this phase** (by design): market data, news, AI research, thesis attack,
Devil's Advocate, historical stress testing, risk engine, trade structuring, paper
execution, trade memory, post-trade review, trader review.

## Run locally

```bash
npm install
npm run dev
```

That starts both processes:

| Service  | URL                        |
| -------- | -------------------------- |
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8787      |

You can also run them separately:

```bash
npm run dev:web   # Vite dev server only
npm run dev:api   # Express API only
```

Production build + preview:

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test          # node --test over server/tests
```

## Project structure

```
server/
  index.js                     Express app + /api/health
  routes/tradeIdeas.js         POST /api/trade-ideas
  lib/validateTradeIdea.js     Validation + capture response (no analysis)
  tests/                       Node test runner tests
src/
  main.jsx                     React entry
  App.jsx                      Hash routing + API health polling
  components/
    AppShell.jsx               Sidebar + topbar layout
    Sidebar.jsx                Navigation
    trade-idea/                Form, live preview, submission result
  screens/
    TradeIdeaScreen.jsx        Phase 1 screen
    PlaceholderScreen.jsx      Later-phase screens (not built)
  lib/                         Constants, API client, form validation
  styles/global.css            Design tokens + styles
```

## API

### `GET /api/health`

```json
{ "status": "ok", "service": "tradeguard-api", "phase": 1 }
```

### `POST /api/trade-ideas`

Request:

```json
{
  "asset": "rNVDA",
  "direction": "bullish",
  "thesis": "NVDA should move higher after earnings because results beat expectations.",
  "timeframe": "earnings-event",
  "entryPrice": "182.40",
  "riskAmount": "500",
  "confidence": 7,
  "existingPosition": "none"
}
```

Required: `asset`, `direction`, `thesis`.
Optional: `timeframe`, `entryPrice`, `riskAmount`, `confidence` (1–10), `existingPosition`.

Responses:

- `201` — validated and captured (echoes the normalised idea)
- `400` — `{ status: "invalid", errors: { field: "message" } }`

The response deliberately contains **no analysis, score or probability** — those belong to
later phases.
