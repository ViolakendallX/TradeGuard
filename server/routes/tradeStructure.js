/**
 * Trade structure route (Phase 7).
 *
 * POST /api/trade-structure
 * Body: { context, risk, attack }
 *   - context: the submitted trade context (asset, direction, thesis, timeframe,
 *              entryPrice, invalidationPrice, riskAmount, confidence,
 *              existingPosition).
 *   - risk   : OPTIONAL. The Phase 6 risk result the frontend already has. When
 *              supplied it is reused VERBATIM — the structure never recalculates
 *              it. When absent, the route obtains it by calling the Phase 6
 *              engine, so the Risk Engine stays the single source of truth
 *              either way.
 *   - attack : OPTIONAL. The Phase 4 Devil's Advocate result. It supplies the
 *              thesis conditions, key risks, assumptions and data gaps. When it
 *              is absent the structure still builds — it simply carries no
 *              conditions, and says so rather than inventing them.
 *
 * Like the Phase 6 route this endpoint fetches NOTHING from a market-data
 * provider: it is a synthesis of data the trader supplied and findings the
 * earlier stages already produced. In particular it never reads the current
 * market price, because deriving an entry or an invalidation from a live price
 * would invent a level the trader did not give.
 *
 * Design rules:
 *   - This route does not return 400 for a missing input. A missing entry, a
 *     missing invalidation or a missing risk budget is a REAL, reportable
 *     outcome — it is the STRUCTURE INCOMPLETE state, and the structure names
 *     exactly what is missing. Returning an HTTP error would hide that answer
 *     from the UI and invite a silent default.
 *   - A provider failure is impossible here, but the handler is still defensive:
 *     it never returns 500.
 *   - No secrets are read or exposed.
 */

import { Router } from 'express';
import { runTradeStructure, emptyStructure } from '../services/tradeStructure.js';

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

router.post('/trade-structure', (req, res) => {
  const body = req.body || {};
  const context = cleanContext(body.context || body);

  let structure;
  try {
    structure = runTradeStructure(context, { risk: body.risk || null, attack: body.attack || null });
  } catch (e) {
    // The service is pure, so this should be unreachable. If it ever happens the
    // honest answer is "we could not structure this", never a fabricated plan.
    structure = emptyStructure(`The trade structure could not be produced: ${e?.message || e}`);
  }

  return res.status(200).json({
    context,
    structure,
    sources: {
      setup: 'Supplied by the trader — not read from market data',
      risk: 'TradeGuard deterministic risk engine, Phase 6 (reused unchanged, never recalculated here)',
      conditions: 'Phase 4 Devil\'s Advocate findings, reused as conditions — never converted into exit prices',
    },
    generatedAt: structure.generatedAt || new Date().toISOString(),
  });
});

export default router;
