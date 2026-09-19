/**
 * Thesis attack route (Phase 4).
 *
 * POST /api/thesis-attack
 * Body: { context, research }
 *   - context : the submitted trade context (asset, direction, thesis, timeframe,
 *               entryPrice, riskAmount, confidence, existingPosition).
 *   - research: OPTIONAL. The Phase 3 research response the frontend already has
 *               ({ market, events }). When omitted, this route reuses the SAME
 *               Phase 3 services (getMarketContext / getEvents) to fetch it — no
 *               duplicate market-data integration.
 *
 * The response is structured and safe for the frontend: it contains the analysis
 * and never any provider secrets. The analysis logic itself lives in
 * server/services/thesisAttack.js and is fully isolated from the React UI.
 *
 * Design rules:
 *   - A missing asset is a 400 (nothing to attack).
 *   - A failure inside the analysis is NEVER a 500: it degrades to an honest
 *     { available:false } analysis so the UI can show an unavailable state.
 *   - No fabricated evidence: when Phase 3 data is unavailable, the analysis
 *     reports it as missing information rather than inventing signals.
 */

import { Router } from 'express';
import { analyzeThesis, emptyAnalysis } from '../services/thesisAttack.js';
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

/** Reuse the Phase 3 research layer when the caller did not supply research. */
async function resolveResearch(asset, provided) {
  if (provided && (provided.market || provided.events)) {
    return { market: provided.market || null, events: provided.events || null, fetchedAt: provided.fetchedAt || null };
  }
  const safe = (p) =>
    p.catch((e) => ({ available: false, source: 'unknown', reason: `Research failed: ${e?.message || e}` }));
  const [market, events] = await Promise.all([
    safe(getMarketContext(globalThis.fetch, asset)),
    safe(getEvents(globalThis.fetch, asset)),
  ]);
  return { market, events, fetchedAt: new Date().toISOString() };
}

router.post('/thesis-attack', async (req, res) => {
  const body = req.body || {};
  const context = cleanContext(body.context || body);

  if (!context.asset) {
    return res.status(400).json({
      status: 'invalid',
      message: 'An asset is required to run the thesis attack.',
      errors: { asset: 'Asset is required.' },
    });
  }

  let research;
  try {
    research = await resolveResearch(context.asset, body.research);
  } catch (e) {
    research = {
      market: { available: false, reason: `Research failed: ${e?.message || e}` },
      events: { available: false, reason: `Research failed: ${e?.message || e}` },
      fetchedAt: null,
    };
  }

  let analysis;
  try {
    analysis = analyzeThesis(context, research);
  } catch (e) {
    analysis = emptyAnalysis(`Thesis analysis failed: ${e?.message || e}`);
  }

  return res.status(200).json({
    context,
    analysis,
    research: {
      market: research.market || null,
      events: research.events || null,
      fetchedAt: research.fetchedAt || null,
    },
    sources: {
      market: research.market?.source || 'Bitget Spot API v2',
      events: research.events?.source || 'unconfigured',
      analysis: 'TradeGuard deterministic thesis-attack engine (no external AI provider)',
    },
    generatedAt: analysis.generatedAt || new Date().toISOString(),
  });
});

export default router;
