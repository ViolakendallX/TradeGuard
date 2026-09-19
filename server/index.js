/**
 * TradeGuard backend.
 *
 * Phases 1–5 are built: thesis capture, the investigation flow, market/event
 * research, the Devil's Advocate thesis attack, and the historical stress test.
 * Still one Express process, no database, and no LLM provider — the analysis is
 * deterministic. Provider access is isolated in server/services/providers/.
 */

import express from 'express';
import cors from 'cors';
import tradeIdeasRouter from './routes/tradeIdeas.js';
import researchRouter from './routes/research.js';
import thesisAttackRouter from './routes/thesisAttack.js';
import historicalStressTestRouter from './routes/historicalStressTest.js';

const PORT = Number(process.env.PORT) || 8787;

const app = express();

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tradeguard-api',
    phase: 5,
    time: new Date().toISOString(),
  });
});

app.use('/api', tradeIdeasRouter);
app.use('/api', researchRouter);
app.use('/api', thesisAttackRouter);
app.use('/api', historicalStressTestRouter);

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
