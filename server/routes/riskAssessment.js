/**
 * Risk assessment route (Phase 6).
 *
 * POST /api/risk-assessment
 * Body: { context }
 *   - context: the submitted trade context (asset, direction, thesis, timeframe,
 *              entryPrice, invalidationPrice, riskAmount, confidence,
 *              existingPosition).
 *
 * Unlike the Phase 3–5 routes this endpoint fetches NOTHING. The risk engine is
 * pure arithmetic on the levels the trader supplied, so there is no provider to
 * call, no symbol to resolve and no market price to read. In particular this
 * route never reads the current market price, because substituting a live price
 * for the trader's own entry would invent an input the trader did not give.
 *
 * Design rules:
 *   - This route does not return 400 for a missing input. A missing entry, a
 *     missing invalidation or a missing risk budget is a REAL, reportable
 *     outcome of a risk assessment — it is the INCOMPLETE state, and the engine
 *     names exactly what is missing. Returning an HTTP error instead would hide
 *     that answer from the UI and invite a silent default.
 *   - A provider failure is impossible here, but the handler is still defensive:
 *     it never returns 500.
 *   - No secrets are read or exposed.
 */

import { Router } from 'express';
import { runRiskAssessment } from '../services/riskEngine.js';

const router = Router();

function cleanContext(body) {
  const b = body || {};
  return {
    asset: typeof b.asset === 'string' ? b.asset.trim().toUpperCase() : '',
    direction: typeof b.direction === 'string' ? b.direction : '',
    thesis: typeof b.thesis === 'string' ? b.thesis : '',
    timeframe: b.timeframe || '',
    entryPrice: b.entryPrice ?? null,
    invalidationPrice: b.invalidationPrice ?? null,
    riskAmount: b.riskAmount ?? null,
    confidence: b.confidence ?? null,
    existingPosition: b.existingPosition || '',
  };
}

router.post('/risk-assessment', (req, res) => {
  const body = req.body || {};
  const context = cleanContext(body.context || body);

  let risk;
  try {
    risk = runRiskAssessment(context);
  } catch (e) {
    // The engine is pure, so this should be unreachable. If it ever happens the
    // honest answer is "we could not assess this", never a fabricated number.
    risk = {
      available: false,
      status: 'unavailable',
      statusLabel: 'RISK ASSESSMENT UNAVAILABLE',
      statusDetail: `The risk assessment could not be completed: ${e?.message || e}`,
      asset: context.asset,
      direction: context.direction,
      side: 'none',
      inputs: {},
      formula: {},
      calculation: null,
      interpretation: null,
      missingInformation: [],
      warnings: [],
      methodology: {},
      limitations: [],
      disclaimer: '',
    };
  }

  return res.status(200).json({
    context,
    risk,
    sources: {
      calculation: 'TradeGuard deterministic risk engine (no external provider, no AI estimate)',
      prices: 'Supplied by the trader — not read from market data',
    },
    generatedAt: risk.generatedAt || new Date().toISOString(),
  });
});

export default router;
