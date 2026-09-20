/**
 * TradeGuard backend.
 *
 * Phases 1–11 are built: thesis capture, the investigation flow, market/event
 * research, the Devil's Advocate thesis attack, the historical stress test, the
 * deterministic risk engine, the trade structure that synthesises them into one
 * plan, the final trade report that consolidates the whole investigation, the
 * human decision that records the trader's own choice, paper execution — which
 * submits to the Bitget DEMO environment only, and only after an explicit human
 * confirmation on a trade the trader already decided to TAKE — and Trade Review,
 * which assembles those verified records into one post-decision review.
 * Still one Express process, no database, and no LLM provider — the analysis is
 * deterministic, and the decision is the trader's. Provider access is isolated
 * in server/services/providers/.
 *
 * There is no live-trading path in this application. Paper execution reads demo
 * credentials only, has no live host, and has no fallback from demo to live.
 */

import express from 'express';
import cors from 'cors';
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

const PORT = Number(process.env.PORT) || 8787;

const app = express();

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tradeguard-api',
    phase: 11,
    time: new Date().toISOString(),
  });
});

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
