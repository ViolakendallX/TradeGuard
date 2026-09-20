/**
 * Final trade report route (Phase 8).
 *
 * POST /api/final-report
 * Body: { context, market, events, attack, history, risk, structure }
 *   - context  : the submitted trade context (asset, direction, thesis, timeframe,
 *                entryPrice, invalidationPrice, riskAmount, confidence,
 *                existingPosition).
 *   - market   : OPTIONAL. The Phase 3 market result, reused verbatim.
 *   - events   : OPTIONAL. The Phase 3 events result, reused verbatim.
 *   - attack   : OPTIONAL. The Phase 4 Devil's Advocate result, reused verbatim.
 *   - history  : OPTIONAL. The Phase 5 historical stress test result, reused verbatim.
 *   - risk     : OPTIONAL. The Phase 6 risk result. When supplied it is reused
 *                VERBATIM — the report never recalculates it. When absent, the
 *                route obtains it by calling the Phase 6 engine, so the Risk
 *                Engine stays the single source of truth either way.
 *   - structure: OPTIONAL. The Phase 7 trade structure result, reused verbatim.
 *
 * This endpoint fetches NOTHING. It is a synthesis of results the earlier stages
 * already produced, so it has no provider dependency at all and resolves even
 * when every external data source is unreachable. It reads no market price, runs
 * no new analysis and calls no model.
 *
 * Design rules:
 *   - This route does not return 400 for a missing input, and it does not return
 *     an HTTP error for unavailable evidence. An unavailable provider, a partial
 *     Devil's Advocate and a missing entry price are all REAL, reportable
 *     outcomes — they are the unavailable/partial markers and the REPORT
 *     INCOMPLETE state. Returning an HTTP error would hide those answers from
 *     the UI and invite a silent default.
 *   - The handler never returns 500.
 *   - No secrets are read or exposed.
 *   - It does not decide anything. There is no recommendation, score or verdict
 *     anywhere in the response, and the decision boundary is stated explicitly.
 */

import { Router } from 'express';
import { runFinalReport, emptyReport } from '../services/finalReport.js';

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

router.post('/final-report', (req, res) => {
  const body = req.body || {};
  const context = cleanContext(body.context || body);

  let report;
  try {
    report = runFinalReport(context, {
      market: body.market || null,
      events: body.events || null,
      attack: body.attack || null,
      history: body.history || null,
      risk: body.risk || null,
      structure: body.structure || null,
    });
  } catch (e) {
    // The service is pure, so this should be unreachable. If it ever happens the
    // honest answer is "we could not assemble this", never a fabricated report.
    report = emptyReport(`The final report could not be assembled: ${e?.message || e}`);
  }

  return res.status(200).json({
    context,
    report,
    sources: {
      setup: 'Supplied by the trader — not read from market data',
      market: 'Phase 3 market research, restated (never re-derived)',
      events: 'Phase 3 event research, restated (never re-derived)',
      attack: "Phase 4 Devil's Advocate findings, restated (never regenerated)",
      history: 'Phase 5 historical stress test, restated (no new statistic computed)',
      risk: 'TradeGuard deterministic risk engine, Phase 6 (reused unchanged, never recalculated here)',
      structure: 'Phase 7 trade structure, restated concisely (the full plan stays in that stage)',
      decision: 'None — this route produces no recommendation, score or verdict',
    },
    generatedAt: report.generatedAt || new Date().toISOString(),
  });
});

export default router;
