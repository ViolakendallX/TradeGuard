/**
 * TradeGuard backend — Phase 1 (Foundation).
 *
 * Deliberately minimal: one Express process, in-repo validation, no database,
 * no external APIs, no AI. Those arrive in later phases.
 */

import express from 'express';
import cors from 'cors';
import tradeIdeasRouter from './routes/tradeIdeas.js';

const PORT = Number(process.env.PORT) || 8787;

const app = express();

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tradeguard-api',
    phase: 1,
    time: new Date().toISOString(),
  });
});

app.use('/api', tradeIdeasRouter);

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
