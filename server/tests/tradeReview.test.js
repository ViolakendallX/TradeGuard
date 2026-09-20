/**
 * Trade Review (Phase 11) — deterministic review assembler tests.
 *
 * These tests assert the product boundary: Trade Review DESCRIBES what happened,
 * it never recommends, predicts, fabricates an order/fill/P&L, or recomputes risk.
 *
 * The 20 scenarios from the Phase 11 spec are covered by the named tests below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradeReview,
  emptyReview,
  REVIEW_STATUS,
  OUTCOME_STATUS,
} from '../services/tradeReview.js';

// --- Fixtures ---------------------------------------------------------------

const baseIdea = {
  asset: 'rNVDA',
  direction: 'bullish',
  timeframe: 'swing',
  thesis: 'NVDA should move higher after earnings because results beat expectations.',
};

const baseDecision = (decision = 'TAKE', reason = 'Risk/reward is acceptable and the structure is clean.') => ({
  status: 'recorded',
  decision,
  decisionLabel: decision,
  reason,
  timestamp: '2026-09-19T18:00:00.000Z',
  trade: { timeframe: 'swing', thesis: baseIdea.thesis },
});

const baseRisk = {
  status: 'ready',
  statusLabel: 'READY',
  available: true,
  calculation: {
    riskBudget: 50,
    priceRiskPerUnit: 5,
    positionSize: 10,
    definedRisk: 50,
  },
  inputs: {
    entryPrice: 100,
    invalidationPrice: 95,
    riskAmount: 50,
  },
};

const baseStructure = {
  status: 'complete',
  setup: { entryPrice: 100, invalidationPrice: 95 },
  riskStructure: { status: 'ready', statusLabel: 'READY' },
};

const baseResearch = {
  market: {
    available: true,
    price: 100,
    change24hPct: 1.5,
    trendDirection: 'up',
    volatilityPct: 3.2,
    volume: '12.4M',
    reason: null,
  },
  events: {
    available: true,
    items: [
      { title: 'Earnings release', date: '2026-09-20' },
      { title: 'Fed commentary', date: '2026-09-21' },
    ],
  },
};

const baseAttack = {
  available: true,
  summary: 'The bullish case is reasonable but valuation is stretched.',
  evidenceStrength: { label: 'Moderate' },
  contradicting: [{ title: 'Valuation is rich' }],
  supporting: [{ title: 'Earnings beat' }],
  uncertainty: [{ title: 'Macro headline risk' }],
  strongestCounterargument: { title: 'Valuation is rich' },
};

const baseHistory = {
  status: 'complete',
  statusLabel: 'COMPLETE',
  matchedCount: 3,
  outcomeSummary: { summary: '3 similar setups historically resolved in favor of the thesis.' },
};

const baseReport = {
  available: true,
  statusLabel: 'COMPLETE',
  summary: 'Consolidated investigation supports the thesis with defined risk.',
};

const submittedExecution = {
  status: 'submitted',
  statusDetail: null,
  result: {
    status: 'submitted',
    orderId: 'O-DEMO-123',
    symbol: 'NVDA',
    side: 'buy',
    quantity: 10,
    price: 100,
    orderType: 'limit',
    submittedAt: '2026-09-19T18:05:00.000Z',
    environment: 'demo',
  },
};

const failedExecution = {
  status: 'failed',
  statusDetail: 'Demo venue rejected the order.',
  result: { status: 'failed', rawStatus: 'REJECTED', errorCode: 'DEMO_400' },
};

const unavailableExecution = {
  status: 'unavailable',
  statusDetail: 'Bitget Demo credentials were unavailable.',
  result: null,
};

/** Assemble a full, realistic sources object. */
function fullSources(overrides = {}) {
  return {
    idea: { ...baseIdea },
    decision: baseDecision(),
    risk: { ...baseRisk },
    structure: { ...baseStructure },
    report: { ...baseReport },
    execution: null,
    research: { ...baseResearch },
    attack: { ...baseAttack },
    history: { ...baseHistory },
    ...overrides,
  };
}

// A deep scan for forbidden tokens, used to prove the review never leaks a
// recommendation / prediction / signal. We scan ONLY the substantive content
// fields — not the meta disclaimers/limitations, which by design mention
// BUY/SELL/HOLD/EXIT to state what the tool does NOT do.
function findForbiddenTokens(review) {
  const forbidden = [
    'BUY',
    'SELL',
    'HOLD',
    'EXIT',
    'recommendation',
    'recommend',
    'prediction',
    'predict',
    'expected return',
    'price target',
    'target price',
    'take another trade',
    'increase position',
    'decrease position',
  ];
  const content = {
    thesis: review.thesis,
    summary: review.summary,
    decision: review.decision,
    plan: review.plan,
    // The order object is a verbatim reflection of what was actually submitted
    // (including its side), so it is excluded from the recommendation scan.
    executionRecord: { ...review.executionRecord, order: null },
    outcome: review.outcome,
    knownBefore: review.knownBefore,
    statusDetail: review.statusDetail,
  };
  const hits = [];
  const walk = (val) => {
    if (val == null) return;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      for (const f of forbidden) {
        if (lower.includes(f.toLowerCase())) hits.push(`${f} (in: "${val.slice(0, 60)}")`);
      }
    } else if (Array.isArray(val)) {
      val.forEach(walk);
    } else if (typeof val === 'object') {
      Object.values(val).forEach(walk);
    }
  };
  walk(content);
  return hits;
}

// --- 1. No trade → REVIEW LOCKED -------------------------------------------

test('1. no trade idea → REVIEW LOCKED', () => {
  const review = buildTradeReview({ decision: baseDecision() });
  assert.equal(review.status, REVIEW_STATUS.LOCKED);
  assert.equal(review.statusLabel, 'REVIEW LOCKED');
  assert.equal(review.available, true);
  assert.equal(review.thesis, null);
  assert.equal(review.plan, null);
});

// --- 2. No human decision → REVIEW LOCKED ----------------------------------

test('2. no human decision → REVIEW LOCKED', () => {
  const review = buildTradeReview({ idea: { ...baseIdea } });
  assert.equal(review.status, REVIEW_STATUS.LOCKED);
  assert.equal(review.statusLabel, 'REVIEW LOCKED');

  // Also locked when the decision exists but was never recorded.
  const notRecorded = buildTradeReview({
    idea: { ...baseIdea },
    decision: { ...baseDecision(), status: 'pending' },
  });
  assert.equal(notRecorded.status, REVIEW_STATUS.LOCKED);
});

// --- 3. WAIT / SKIP reflect no execution -----------------------------------

test('3. WAIT decision → REVIEW READY, no execution shown', () => {
  const review = buildTradeReview(fullSources({ decision: baseDecision('WAIT') }));
  assert.equal(review.status, REVIEW_STATUS.READY);
  assert.equal(review.executionRecord.executed, false);
  assert.equal(review.executionRecord.status, OUTCOME_STATUS.NOT_EXECUTED);
  assert.match(review.executionRecord.detail, /WAIT/);
  assert.equal(review.executionRecord.order, null);
  assert.equal(review.outcome.status, OUTCOME_STATUS.NOT_EXECUTED);
});

test('3b. SKIP decision → REVIEW READY, no execution shown', () => {
  const review = buildTradeReview(fullSources({ decision: baseDecision('SKIP') }));
  assert.equal(review.status, REVIEW_STATUS.READY);
  assert.equal(review.executionRecord.executed, false);
  assert.match(review.executionRecord.detail, /SKIP/);
  assert.equal(review.executionRecord.order, null);
});

// --- 4. TAKE + no execution → INCOMPLETE / UNAVAILABLE ---------------------

test('4a. TAKE with no submitted order → REVIEW INCOMPLETE', () => {
  const review = buildTradeReview(fullSources({ execution: null }));
  assert.equal(review.status, REVIEW_STATUS.INCOMPLETE);
  assert.equal(review.statusLabel, 'REVIEW INCOMPLETE');
  assert.equal(review.executionRecord.executed, false);
  assert.equal(review.outcome.status, OUTCOME_STATUS.NOT_EXECUTED);
});

test('4b. TAKE with missing risk → REVIEW UNAVAILABLE (cannot show plan honestly)', () => {
  const review = buildTradeReview(fullSources({ risk: null }));
  assert.equal(review.status, REVIEW_STATUS.UNAVAILABLE);
  assert.equal(review.statusLabel, 'REVIEW UNAVAILABLE');
  assert.equal(review.plan, null);
});

// --- 5. TAKE + successful execution → REVIEW READY ------------------------

test('5. TAKE + submitted paper order → REVIEW READY with real order', () => {
  const review = buildTradeReview(fullSources({ execution: submittedExecution }));
  assert.equal(review.status, REVIEW_STATUS.READY);
  assert.equal(review.executionRecord.executed, true);
  assert.equal(review.executionRecord.status, OUTCOME_STATUS.SUBMITTED);
  assert.equal(review.executionRecord.order.orderId, 'O-DEMO-123');
  assert.equal(review.executionRecord.order.symbol, 'NVDA');
  assert.equal(review.executionRecord.order.quantity, 10);
  assert.equal(review.outcome.status, OUTCOME_STATUS.SUBMITTED);
  assert.equal(review.outcome.executed, true);
});

// --- 6. Failed execution → honest failure ----------------------------------

test('6. failed paper execution → honest failure, no fabricated success', () => {
  const review = buildTradeReview(fullSources({ execution: failedExecution }));
  assert.equal(review.status, REVIEW_STATUS.INCOMPLETE);
  assert.equal(review.executionRecord.executed, false);
  assert.equal(review.executionRecord.status, OUTCOME_STATUS.FAILED);
  assert.match(review.executionRecord.detail, /failed/i);
  assert.equal(review.executionRecord.order, null);
  assert.equal(review.outcome.status, OUTCOME_STATUS.FAILED);
  assert.equal(review.outcome.pnl, null);
});

// --- 7. Missing order ID → no fabricated order -----------------------------

test('7. submitted status but missing orderId → no fabricated order', () => {
  const exec = {
    status: 'submitted',
    result: { status: 'submitted', symbol: 'NVDA', side: 'buy', quantity: 10, price: 100 },
  };
  const review = buildTradeReview(fullSources({ execution: exec }));
  // Critical honesty check: no order object is ever invented.
  assert.equal(review.executionRecord.executed, false);
  assert.equal(review.executionRecord.order, null);
  assert.equal(review.outcome.pnl, null);
});

// --- 8. Missing provider data → honest unavailable -------------------------

test('8. unavailable provider (no creds) → honest UNAVAILABLE outcome', () => {
  const review = buildTradeReview(fullSources({ execution: unavailableExecution }));
  assert.equal(review.executionRecord.executed, false);
  assert.equal(review.executionRecord.status, OUTCOME_STATUS.UNAVAILABLE);
  assert.match(review.executionRecord.detail, /credentials/i);
  assert.equal(review.executionRecord.order, null);
  assert.equal(review.outcome.status, OUTCOME_STATUS.UNAVAILABLE);
  assert.equal(review.outcome.pnl, null);
});

// --- 9 & 10. Risk figures come from the existing engine, not recomputed ----

test('9/10. trade plan uses Phase 6 figures verbatim — never recalculated', () => {
  const review = buildTradeReview(fullSources());
  assert.equal(review.plan.riskBudget, 50);
  assert.equal(review.plan.priceRiskPerUnit, 5);
  assert.equal(review.plan.positionSize, 10);
  assert.equal(review.plan.definedRisk, 50);
  assert.equal(review.plan.entryPrice, 100);
  assert.equal(review.plan.invalidationPrice, 95);
  // The source label proves reuse rather than recomputation.
  assert.match(review.plan.source, /never recalculated/i);
});

test('9b. changing the risk input is reflected unchanged (no recompute logic in review)', () => {
  const risk = {
    ...baseRisk,
    calculation: { riskBudget: 80, priceRiskPerUnit: 8, positionSize: 5, definedRisk: 80 },
    inputs: { entryPrice: 120, invalidationPrice: 104, riskAmount: 80 },
  };
  const review = buildTradeReview(fullSources({ risk }));
  assert.equal(review.plan.riskBudget, 80);
  assert.equal(review.plan.priceRiskPerUnit, 8);
  assert.equal(review.plan.definedRisk, 80);
  assert.equal(review.plan.entryPrice, 120);
});

// --- 11. Thesis preserved exactly ------------------------------------------

test('11. original thesis preserved verbatim, no AI reinterpretation', () => {
  const review = buildTradeReview(fullSources());
  assert.equal(review.thesis, baseIdea.thesis);
  // Trailing/leading spaces must be preserved as given (we do not trim thesis).
  const spaced = buildTradeReview(fullSources({ idea: { ...baseIdea, thesis: '  keep my exact words  ' } }));
  assert.equal(spaced.thesis, '  keep my exact words  ');
});

// --- 12. Decision reason preserved -----------------------------------------

test('12. decision reason preserved on the review', () => {
  const reason = 'My own rationale: clean structure, defined risk, acceptable R:R.';
  const review = buildTradeReview(fullSources({ decision: baseDecision('TAKE', reason) }));
  assert.equal(review.decision.decision, 'TAKE');
  assert.equal(review.decision.reason, reason);
  assert.equal(review.decision.timestamp, '2026-09-19T18:00:00.000Z');
});

// --- 13. Execution status preserved ----------------------------------------

test('13. execution status is reflected without alteration', () => {
  const review = buildTradeReview(fullSources({ execution: submittedExecution }));
  assert.equal(review.executionRecord.status, OUTCOME_STATUS.SUBMITTED);
  assert.equal(review.summary.executionStatus, 'submitted');

  const failed = buildTradeReview(fullSources({ execution: failedExecution }));
  assert.equal(failed.executionRecord.status, OUTCOME_STATUS.FAILED);
  assert.equal(failed.summary.executionStatus, 'failed');
});

// --- 14 & 15. No fake fill, no P&L without verified data -------------------

test('14/15. never fabricates a fill and never computes P&L', () => {
  for (const exec of [null, submittedExecution, failedExecution, unavailableExecution]) {
    const review = buildTradeReview(fullSources({ execution: exec }));
    assert.equal(review.outcome.pnl, null, `pnl must be null (exec=${exec?.status})`);
    assert.equal(review.outcome.pnlNote, 'Outcome not yet available.');
    // A submitted demo order is NOT a fill — no fake fill is reported.
    if (exec === submittedExecution) {
      assert.equal(review.outcome.fillNote, 'Order submitted; fill outcome not available.');
    }
  }
});

// --- 16. Notes slot + persistence note -------------------------------------

test('16. review exposes a notes slot and a session-persistence note', () => {
  const review = buildTradeReview(fullSources());
  assert.equal(review.notes, null); // UI binds this to session state
  assert.match(review.notesPersistenceNote, /session/i);
  // The note honestly states notes are not yet persisted between sessions.
  assert.match(review.notesPersistenceNote, /not yet persist/i);
});

// --- 17. No new prediction / recommendation / signal -----------------------

test('17. review never emits a recommendation, prediction, or signal', () => {
  const review = buildTradeReview(fullSources({ execution: submittedExecution }));
  const hits = findForbiddenTokens(review);
  assert.deepEqual(hits, [], `found forbidden tokens: ${hits.join('; ')}`);

  // Structural proof: there is no recommendation/signal/prediction field.
  for (const key of ['recommendation', 'signal', 'prediction', 'expectedReturn', 'priceTarget', 'score', 'ranking']) {
    assert.equal(review[key], undefined, `unexpected field "${key}" present`);
  }
});

// --- 18. Phase 1–10 regression stays intact (the review does not mutate) ----

test('18. buildTradeReview is pure — upstream records are not mutated', () => {
  const sources = fullSources({ execution: submittedExecution });
  const snapshot = JSON.stringify(sources);
  buildTradeReview(sources);
  assert.equal(JSON.stringify(sources), snapshot, 'sources were mutated by the review assembler');
});

// --- 19/20. honesty helpers + unavailable-assembly fallback -----------------

test('19. lockedReview is honest and shape-consistent with a ready review', () => {
  const locked = buildTradeReview({}); // no idea, no decision
  const ready = buildTradeReview(fullSources({ execution: submittedExecution }));
  // Both carry the same top-level keys so the UI can render either uniformly.
  for (const key of Object.keys(ready)) {
    assert.ok(key in locked, `locked review missing key "${key}"`);
  }
  assert.equal(locked.status, REVIEW_STATUS.LOCKED);
});

test('20. emptyReview (service failure path) reports unavailable and never fakes content', () => {
  const er = emptyReview('boom');
  assert.equal(er.available, false);
  assert.equal(er.status, REVIEW_STATUS.LOCKED);
  assert.equal(er.thesis, null);
  assert.equal(er.plan, null);
  assert.equal(er.executionRecord.order, null);
  assert.equal(er.outcome.pnl, null);
});

// --- Extra: route-level contract (meta + always 200) -----------------------

test('route contract: meta reports phase 11, no P&L computed, review states exposed', async () => {
  const { meta } = await import('../routes/tradeReview.js');
  const m = meta();
  assert.equal(m.phase, 11);
  assert.deepEqual(Object.keys(m.reviewStates), ['locked', 'ready', 'incomplete', 'unavailable']);
  assert.equal(m.pnl.computed, false);
  assert.ok(m.sources.plan.toLowerCase().includes('never recalculated'));
});
