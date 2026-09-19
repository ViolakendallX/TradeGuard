/**
 * Historical stress test route (Phase 5).
 *
 * POST /api/historical-stress-test
 * Body: { context, research }
 *   - context : the submitted trade context (asset, direction, thesis, timeframe,
 *               entryPrice, riskAmount, confidence, existingPosition).
 *   - research: OPTIONAL. The Phase 3 research response the frontend already has.
 *               It is used only for traceability (which market source answered).
 *               The historical analysis itself is derived entirely from the
 *               historical candle series, so this route does NOT re-fetch
 *               research and does not add a second market-data call.
 *
 * Design rules (same as the rest of the API):
 *   - A missing asset is a 400 (there is nothing to look up).
 *   - A provider failure is NEVER a 500: it degrades to an honest
 *     { available:false, status:'unavailable' } payload so the UI can show an
 *     explicit HISTORICAL DATA UNAVAILABLE state.
 *   - No fabricated observations: when history is missing or too short, no
 *     comparison is returned at all.
 *   - Provider secrets never reach the frontend; this route reads no secrets.
 */

import { Router } from 'express';
import { runHistoricalStressTest } from '../services/historicalStressTest.js';

const router = Router();

function cleanContext(body) {
  const b = body || {};
  return {
    asset: typeof b.asset === 'string' ? b.asset.trim().toUpperCase() : '',
    direction: typeof b.direction === 'string' ? b.direction : '',
    thesis: typeof b.thesis === 'string' ? b.thesis : '',
    timeframe: b.timeframe || '',
    entryPrice: b.entryPrice ?? null,
    riskAmount: b.riskAmount ?? null,
    confidence: b.confidence ?? null,
    existingPosition: b.existingPosition || '',
  };
}

router.post('/historical-stress-test', async (req, res) => {
  const body = req.body || {};
  const context = cleanContext(body.context || body);

  if (!context.asset) {
    return res.status(400).json({
      status: 'invalid',
      message: 'An asset is required to run the historical stress test.',
      errors: { asset: 'Asset is required.' },
    });
  }

  let history;
  try {
    history = await runHistoricalStressTest(context, { research: body.research || null });
  } catch (e) {
    // Belt-and-braces: the service already degrades internally, but a hard
    // failure must still produce an honest unavailable payload, never a 500.
    history = {
      available: false,
      dataLimited: true,
      status: 'unavailable',
      statusLabel: 'HISTORICAL DATA UNAVAILABLE',
      reason: `Historical stress test failed: ${e?.message || e}`,
      asset: context.asset,
      direction: context.direction,
      timeframe: context.timeframe,
      observations: [],
      sampleSize: 0,
      matchedCount: 0,
      outcomeSummary: null,
      limitations: [],
      missingInformation: [],
    };
  }

  return res.status(200).json({
    context,
    history,
    sources: {
      historical: 'Bitget Spot API v2 (candles)',
      analysis: 'TradeGuard deterministic historical matching engine (no external AI provider)',
    },
    generatedAt: history.generatedAt || new Date().toISOString(),
  });
});

export default router;
