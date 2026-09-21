/**
 * TradeGuard backend.
 *
 * Phases 1–13 are built: thesis capture, the investigation flow, market/event
 * research, the Devil's Advocate thesis attack, the historical stress test, the
 * deterministic risk engine, the trade structure that synthesises them into one
 * plan, the final trade report that consolidates the whole investigation, the
 * human decision that records the trader's own choice, paper execution — which
 * submits to the Bitget DEMO environment only, and only after an explicit human
 * confirmation on a trade the trader already decided to TAKE — Trade Review,
 * which assembles those verified records into one post-decision review, Trade
 * Memory, which saves a completed trade to a local JSON file so it can be read
 * back after navigation, a page reload, or a frontend restart, and Trader
 * Review, where the trader writes their own reflection on the completed trade.
 *
 * Still one Express process. Trade Memory is a plain JSON file on this server —
 * no database, no migrations, no cache server, no cloud storage. There is still
 * no LLM provider: the analysis is deterministic, and the decision is the
 * trader's. Provider access is isolated in server/services/providers/.
 *
 * There is no live-trading path in this application. Paper execution reads demo
 * credentials only, has no live host, and has no fallback from demo to live.
 *
 * AUTHENTICATION
 * Accounts are real: a name, an email and a password, with the password stored
 * only as a salted scrypt hash. A signed-in browser carries an opaque session
 * token in an HttpOnly cookie — JavaScript cannot read it, and the server stores
 * only its SHA-256 digest, so a copy of the session file is not a set of usable
 * tokens. Trade Memory is scoped to the account behind that session.
 */

import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import tradeIdeasRouter from './routes/tradeIdeas.js';
import researchRouter from './routes/research.js';
import thesisAttackRouter from './routes/thesisAttack.js';
import historicalStressTestRouter from './routes/historicalStressTest.js';
import riskAssessmentRouter from './routes/riskAssessment.js';
import tradeStructureRouter from './routes/tradeStructure.js';
import finalReportRouter from './routes/finalReport.js';
import humanDecisionRouter from './routes/humanDecision.js';
import paperExecutionRouter from './routes/paperExecution.js';
import tradeReviewRouter from './routes/tradeReview.js';
import tradeJournalRouter from './routes/tradeJournal.js';

const PORT = Number(process.env.PORT) || 8787;

/**
 * Which origins may make a CREDENTIALED cross-origin request.
 *
 * WHY THIS IS A LIST AND NOT `*`
 * The session cookie is the only credential in the system, and `credentials:
 * true` cannot be combined with a wildcard origin — a browser rejects it. So the
 * origin is either reflected for a known caller or the request gets no CORS
 * headers at all.
 *
 * WHY THIS DOES NOT WEAKEN THE DEV FLOW
 * In development the frontend is served by Vite, which PROXIES `/api` to this
 * process. The browser therefore talks to one origin and CORS never applies. A
 * request with no `Origin` header — same-origin, or a command-line check — is
 * always allowed through, so the proxy path and `curl` are unaffected.
 */
const ALLOWED_ORIGINS = (
  process.env.TRADEGUARD_ALLOWED_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: not a cross-origin request. Nothing to authorise.
      if (!origin) return callback(null, true);
      return callback(null, ALLOWED_ORIGINS.includes(origin));
    },
    credentials: true,
  }),
);
// 128kb rather than 64kb: a Trade Memory save carries the submitted trade, the
// recorded decision, the paper-execution record and the assembled review in one
// body. It is still a small, bounded request — this is not a file upload path.
app.use(express.json({ limit: '128kb' }));

// Public: liveness only. It reports that the process is up and which phase is
// deployed — no account data, so it stays reachable while signed out.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tradeguard-api',
    phase: 13,
    time: new Date().toISOString(),
  });
});

// Auth first: /api/auth/* is public by necessity (it is how you become
// authenticated), and each handler applies its own gate where one is needed.
app.use('/api', authRouter);
app.use('/api', tradeIdeasRouter);
app.use('/api', researchRouter);
app.use('/api', thesisAttackRouter);
app.use('/api', historicalStressTestRouter);
app.use('/api', riskAssessmentRouter);
app.use('/api', tradeStructureRouter);
app.use('/api', finalReportRouter);
app.use('/api', humanDecisionRouter);
app.use('/api', paperExecutionRouter);
app.use('/api', tradeReviewRouter);
app.use('/api', tradeJournalRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ status: 'error', message: 'Unknown API route.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const isJsonError = err instanceof SyntaxError && 'body' in err;
  res.status(isJsonError ? 400 : 500).json({
    status: 'error',
    message: isJsonError ? 'Request body is not valid JSON.' : 'Unexpected server error.',
  });
});

app.listen(PORT, () => {
  console.log(`[tradeguard] API listening on http://localhost:${PORT}`);
});
