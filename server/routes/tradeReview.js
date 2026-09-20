/**
 * Trade Review route (Phase 11).
 *
 *   POST /api/trade-review — assemble the post-decision review from verified records.
 *
 * Body: { idea, risk, structure, report, decision, execution, research, attack, history }
 *   - idea      the submitted trade context (Phase 1)
 *   - risk      the Phase 6 risk result (reused, never recalculated)
 *   - structure the Phase 7 trade structure (source of the plan)
 *   - report    the Phase 8 final report
 *   - decision  the Phase 9 human decision record (REQUIRED for a non-locked review)
 *   - execution the Phase 10 paper-execution record (optional; may be absent)
 *   - research  the Phase 3 market/events research (for "what was known before")
 *   - attack    the Phase 4 Devil's Advocate analysis
 *   - history   the Phase 5 historical stress test
 *
 * Design rules:
 *   - The endpoint ALWAYS returns 200. A locked, incomplete, or unavailable review
 *     is a real, reportable answer, not an error — exactly like the analysis routes.
 *   - It performs NO new analysis: no market call, no model, no prediction. It
 *     assembles and condenses records that already exist.
 *   - It never submits anything. The Phase 10 execution record is READ, never
 *     re-sent, and Trade Review has no submission path of its own.
 *   - It never fabricates an order ID, a fill, or a P&L. Those appear only when the
 *     Phase 10 record actually carries them, which for a demo submission it does not.
 *   - It never emits a BUY / SELL / HOLD / EXIT / position-size-change signal.
 *   - The handler never returns 500. Every failure is an honest state.
 *   - No credential VALUE is ever read into a response or a log line.
 */

import { Router } from 'express';
import { buildTradeReview, emptyReview, REVIEW_STATUS_LABELS } from '../services/tradeReview.js';

const router = Router();

/** Reads the upstream results off the request body, tolerating missing inputs. */
function readSources(body) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (v) => (v && typeof v === 'object' ? v : null);
  return {
    idea: pick(b.idea) || pick(b.context) || null,
    risk: pick(b.risk),
    structure: pick(b.structure),
    report: pick(b.report),
    decision: pick(b.decision),
    execution: pick(b.execution),
    research: pick(b.research),
    attack: pick(b.attack),
    history: pick(b.history),
  };
}

/** Static contract description, returned with every response. */
export function meta() {
  return {
    phase: 11,
    reviewStates: { ...REVIEW_STATUS_LABELS },
    outcomeStates: ['submitted', 'failed', 'not-executed', 'unavailable', 'pending', 'unknown'],
    sources: {
      thesis: 'Phase 1 submitted trade context (preserved verbatim)',
      plan: 'Phase 6 risk engine + Phase 7 structure, read unchanged — never recalculated',
      decision: 'Phase 9 human decision — the trader’s own record',
      execution: 'Phase 10 paper-execution record, READ only — never re-submitted',
      knownBefore: 'Phase 3 research, Phase 4 Devil’s Advocate, Phase 5 historical test (synthesized, no new research)',
    },
    pnl: { computed: false, note: 'Profit/loss is never calculated. It appears only if a verified execution outcome reports it — and a demo submission is not a fill.' },
    generatedAt: new Date().toISOString(),
  };
}

router.post('/trade-review', (req, res) => {
  const sources = readSources(req.body);

  let review;
  try {
    review = buildTradeReview(sources);
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      message: `Trade Review could not be assembled: ${e?.message || e}`,
      review: emptyReview(`Trade Review could not be assembled: ${e?.message || e}`),
      ...meta(),
    });
  }

  return res.status(200).json({
    status: review.status,
    review,
    ...meta(),
  });
});

export default router;
