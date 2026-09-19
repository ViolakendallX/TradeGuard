/**
 * Research route (Phase 3).
 *
 * POST /api/research
 * Accepts the submitted trade context, runs market + event research on the
 * backend (so provider secrets/keys never reach the browser), and returns a
 * structured response: the echoed context plus market/event research, each with
 * its own availability flag, source, and timestamp.
 *
 * Design rules:
 *   - A failed provider is NEVER a 500. It degrades to { available:false } so
 *     the UI can show an honest "Data unavailable" state.
 *   - No fabricated data: unavailable sections carry only a `reason`.
 */

import { Router } from 'express';
import { getMarketContext } from '../services/marketData.js';
import { getEvents } from '../services/eventData.js';

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

router.post('/research', async (req, res) => {
  const context = cleanContext(req.body);

  if (!context.asset) {
    return res.status(400).json({
      status: 'invalid',
      message: 'An asset is required to run research.',
      errors: { asset: 'Asset is required.' },
    });
  }

  const safe = (p) =>
    p.catch((e) => ({
      available: false,
      source: 'unknown',
      reason: `Research failed: ${e?.message || e}`,
    }));

  const [market, events] = await Promise.all([
    safe(getMarketContext(globalThis.fetch, context.asset)),
    safe(getEvents(globalThis.fetch, context.asset)),
  ]);

  return res.status(200).json({
    context,
    market,
    events,
    fetchedAt: new Date().toISOString(),
    sources: {
      market: market.source || 'Bitget Spot API v2',
      events: events.source || 'unconfigured',
    },
  });
});

export default router;
