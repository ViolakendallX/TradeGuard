/**
 * Trade Review service (Phase 11).
 *
 * Purpose: answer "what happened after I made this trade decision?" by assembling
 * the VERIFIED records TradeGuard already produced — the original thesis, the Phase
 * 6/7 risk and structure, the human decision, and the Phase 10 paper-execution
 * outcome — into one honest, read-only review.
 *
 * This is a REVIEW tool. It deliberately does NOT become a prediction engine, a
 * recommendation engine, or a second execution engine.
 *
 * What this module deliberately never does:
 *   - It never tells the trader BUY / SELL / TAKE ANOTHER TRADE / HOLD / EXIT /
 *     increase / decrease position. The review DESCRIBES what happened.
 *   - It never generates predictions, probabilities, scores, rankings, expected
 *     returns, future price targets, trading signals, or autonomous decisions.
 *   - It never recalculates the Phase 6 risk engine. The price risk per unit,
 *     position size and defined risk come from the existing Phase 6 / Phase 7
 *     results, read verbatim.
 *   - It never creates a second execution. It only READS the Phase 10 execution
 *     record that already exists; it submits nothing.
 *   - It never fabricates an execution result. A submitted order is only ever
 *     reported when the Phase 10 record actually carries a result with an order.
 *   - It never calculates profit/loss. P&L is null unless a verified execution
 *     outcome provides it (and Bitget Demo does not), so outcome.pnl is always
 *     null and the UI is told "Outcome not yet available."
 *   - It never runs new market research or calls any prediction model. The
 *     "what was known before the decision" section is a SYNTHESIS of the existing
 *     recorded investigation (market, events, Devil's Advocate, historical test),
 *     surfaced as-is.
 *
 * States (deterministic): REVIEW LOCKED / REVIEW READY / REVIEW INCOMPLETE /
 * REVIEW UNAVAILABLE.
 */

import { readRiskFigures } from './bitgetDemoExecution.js';

export const REVIEW_STATUS = Object.freeze({
  LOCKED: 'locked', // no trade idea, or no recorded decision — nothing to review
  READY: 'ready', // a complete, readable review exists (post-TAKE submitted, or WAIT/SKIP)
  INCOMPLETE: 'incomplete', // TAKE was decided but no submitted paper order exists yet
  UNAVAILABLE: 'unavailable', // essential data is missing so the review cannot be built honestly
});

export const REVIEW_STATUS_LABELS = Object.freeze({
  locked: 'REVIEW LOCKED',
  ready: 'REVIEW READY',
  incomplete: 'REVIEW INCOMPLETE',
  unavailable: 'REVIEW UNAVAILABLE',
});

/** The outcome of the paper-execution leg, as the review can verify it. */
export const OUTCOME_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  FAILED: 'failed',
  NOT_EXECUTED: 'not-executed',
  UNAVAILABLE: 'unavailable',
  PENDING: 'pending',
  UNKNOWN: 'unknown',
});

export const REVIEW_METHOD_NOTE =
  'Trade Review assembles the records TradeGuard already produced — your original thesis, the Phase 6 risk ' +
  'engine and Phase 7 structure, your recorded decision, and the Phase 10 paper-execution outcome — into one ' +
  'review. It runs no new analysis, calls no prediction model, and never recalculates risk. It describes what ' +
  'happened; it does not tell you what to do next.';

export const REVIEW_DISCLAIMER =
  'This is a review of a trade you already decided and (optionally) paper-executed. It is not a new ' +
  'recommendation, not a prediction, and not a trading instruction. No profit, loss or fill is shown unless a ' +
  'verified execution outcome provides it — and a demo submission is not a fill.';

export const REVIEW_LIMITATIONS = Object.freeze([
  'Trade Review never generates a BUY / SELL / HOLD / EXIT / increase / decrease signal. The trader remains ' +
    'responsible for interpretation.',
  'The risk figures are the Phase 6 deterministic engine’s output, read unchanged. They are not recalculated ' +
    'here and not verified against the live market.',
  'The Execution Record shows only what the Phase 10 paper execution actually returned. No order ID is ever ' +
    'invented, and a submitted demo order is not a filled order.',
  'Profit/loss is never calculated. Unless a verified execution outcome reports a fill and a P&L, the outcome ' +
    'stays "Outcome not yet available."',
  'Notes you write are your own observations. TradeGuard does not auto-generate behavioural conclusions from ' +
    'them. They are saved with the trade in Trade Memory (Phase 12), in a local file on this server.',
]);

const NOTES_PERSISTENCE_NOTE =
  'Trader notes are saved with the trade in Trade Memory, so they survive a page reload. They are stored in a ' +
  'local JSON file on the TradeGuard server — not in the cloud, and not backed up.';

// --- small helpers ----------------------------------------------------------

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function readExecutionRecord(execution) {
  if (!isObj(execution)) return null;
  const result = isObj(execution.result) ? execution.result : null;
  const status = execution.status;

  // Only ever surface a real order. If there is no result, or the result has no
  // order ID, there is no order to show — never fabricate one.
  const hasOrder = status === 'submitted' && isObj(result) && result.orderId != null;

  return {
    status,
    result,
    hasOrder,
  };
}

/**
 * Builds the synthesis of "what was known before the decision" from the existing
 * investigation records. This is a read-only condensation — no new research, no
 * model, no invented content. Every field falls back to an honest "not available"
 * rather than a placeholder.
 */
function buildKnownBefore(research, attack, history, report) {
  // --- Final report (Phase 8) — the consolidation of the investigation ------
  let finalReport = null;
  if (isObj(report)) {
    finalReport = {
      available: report.available !== false,
      statusLabel: txt(report.statusLabel) || (isObj(report) && txt(report.status)) || null,
      summary: txt(report.summary) || null,
    };
  } else {
    finalReport = { available: false, statusLabel: null, summary: 'No final report record was available to review.' };
  }

  // --- Market context (Phase 3) ---
  const market = isObj(research) ? research.market : null;
  let marketContext = null;
  if (isObj(market)) {
    if (market.available === false) {
      marketContext = { available: false, summary: 'Market data was not available during the investigation.', note: txt(market.reason) || null };
    } else {
      const parts = [];
      if (market.price != null) parts.push(`price ${market.price}`);
      if (market.change24hPct != null) parts.push(`${market.change24hPct > 0 ? '+' : ''}${market.change24hPct}% (24h)`);
      if (market.trendDirection) parts.push(`trend ${market.trendDirection}`);
      if (market.volatilityPct != null) parts.push(`realized vol ${market.volatilityPct}%`);
      if (market.volume != null) parts.push(`volume ${market.volume}`);
      marketContext = {
        available: true,
        summary: parts.length ? `At review time the recorded market context was: ${parts.join(', ')}.` : 'Market context was recorded but contained no usable figures.',
        note: null,
      };
    }
  } else {
    marketContext = { available: false, summary: 'No market research record was available to review.', note: null };
  }

  // --- Events / catalysts (Phase 3) ---
  const events = isObj(research) ? research.events : null;
  let eventsCatalysts = null;
  if (isObj(events)) {
    if (events.available === false) {
      eventsCatalysts = { available: false, items: [], summary: 'No event/catalyst data was available during the investigation.' };
    } else {
      const items = Array.isArray(events.items) ? events.items.filter((it) => isObj(it) && txt(it.title)).map((it) => ({ title: it.title, date: txt(it.date) || null })) : [];
      eventsCatalysts = {
        available: true,
        items,
        summary: items.length
          ? `${items.length} event${items.length === 1 ? '' : 's'} were recorded${items.length ? ` (e.g. "${items[0].title}"${items[1] ? `, "${items[1].title}"` : ''})` : ''}.`
          : 'Event/catalyst data was available but listed no upcoming events.',
      };
    }
  } else {
    eventsCatalysts = { available: false, items: [], summary: 'No event/catalyst record was available to review.' };
  }

  // --- Devil's Advocate (Phase 4) ---
  let devilsAdvocate = null;
  if (isObj(attack)) {
    if (attack.available === false) {
      devilsAdvocate = { available: false, summary: 'The Devil’s Advocate analysis was not available during the investigation.', strength: null };
    } else {
      const strength = isObj(attack.evidenceStrength) ? attack.evidenceStrength.label : null;
      const counters = Array.isArray(attack.contradicting) ? attack.contradicting.length : 0;
      const supporting = Array.isArray(attack.supporting) ? attack.supporting.length : 0;
      const uncertainty = Array.isArray(attack.uncertainty) ? attack.uncertainty.length : 0;
      const top = isObj(attack.strongestCounterargument) ? attack.strongestCounterargument.title : null;
      devilsAdvocate = {
        available: true,
        strength,
        supportingCount: supporting,
        contradictingCount: counters,
        uncertaintyCount: uncertainty,
        summary:
          txt(attack.summary) ||
          (top ? `Strongest challenge on record: ${top}.` : `Evidence strength recorded as ${strength || 'unknown'}.`),
        strongestCounterargument: top,
      };
    }
  } else {
    devilsAdvocate = { available: false, summary: 'No Devil’s Advocate record was available to review.', strength: null };
  }

  // --- Historical stress test (Phase 5) ---
  let historicalStressTest = null;
  if (isObj(history)) {
    const status = history.status;
    const label = txt(history.statusLabel) || status || null;
    const summary = isObj(history.outcomeSummary)
      ? history.outcomeSummary
      : null;
    historicalStressTest = {
      available: history.available !== false,
      status,
      statusLabel: label,
      matchedCount: history.matchedCount ?? null,
      outcomeSummary: summary,
      summary:
        label !== null
          ? `Historical stress test status: ${label}.`
          : 'No historical stress-test record was available to review.',
    };
  } else {
    historicalStressTest = { available: false, status: null, statusLabel: null, matchedCount: null, outcomeSummary: null, summary: 'No historical stress-test record was available to review.' };
  }

  return {
    finalReport,
    marketContext,
    eventsCatalysts,
    devilsAdvocate,
    historicalStressTest,
  };
}

/**
 * Builds the execution record section — strictly from the Phase 10 result.
 * Never invents an order ID or a fill.
 */
function buildExecutionRecord(exec, decisionValue) {
  const rec = readExecutionRecord(exec);
  if (!rec) {
    // No execution record at all.
    if (decisionValue === 'WAIT') {
      return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted because the decision was WAIT.', order: null };
    }
    if (decisionValue === 'SKIP') {
      return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted because the decision was SKIP.', order: null };
    }
    return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted. The trade was decided as TAKE, but paper execution was not completed.', order: null };
  }

  const status = rec.status;

  // Submitted: show the real order, never a fabricated one.
  if (status === 'submitted' && rec.hasOrder) {
    const r = rec.result;
    return {
      executed: true,
      status: OUTCOME_STATUS.SUBMITTED,
      detail: `A paper order was submitted to Bitget Demo (order ${r.orderId}).`,
      order: {
        orderId: r.orderId,
        symbol: r.symbol ?? null,
        side: r.side ?? null,
        quantity: r.quantity ?? null,
        price: r.price ?? null,
        orderType: r.orderType ?? null,
        submittedAt: r.submittedAt ?? null,
        environment: r.environment ?? 'demo',
      },
    };
  }

  // Failed: report the actual failure, names only (never a secret).
  if (status === 'failed') {
    const detail =
      (isObj(rec.result) && txt(rec.result.rawStatus)) ||
      (isObj(rec.result) && txt(rec.result.errorCode)) ||
      txt(exec.statusDetail) ||
      'Paper order failed at the demo venue.';
    return {
      executed: false,
      status: OUTCOME_STATUS.FAILED,
      detail: `Paper order failed: ${detail}`,
      order: null,
    };
  }

  // Unavailable (e.g., no credentials): honest, names nothing sensitive.
  if (status === 'unavailable') {
    const detail = txt(exec.statusDetail) || 'Bitget Demo credentials were unavailable, so no paper order could be placed.';
    return { executed: false, status: OUTCOME_STATUS.UNAVAILABLE, detail: `No paper order was submitted because ${detail}`, order: null };
  }

  // Locked or ready: no order was actually sent.
  if (decisionValue === 'WAIT') {
    return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted because the decision was WAIT.', order: null };
  }
  if (decisionValue === 'SKIP') {
    return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted because the decision was SKIP.', order: null };
  }
  return { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: 'No paper order was submitted. The trade was decided as TAKE, but paper execution was not completed.', order: null };
}

/**
 * Builds the outcome status — only what can be verified from the actual paper
 * execution record. P&L is always null; a demo submission is not a fill.
 */
function buildOutcome(exec, decisionValue) {
  const rec = readExecutionRecord(exec);
  let status = OUTCOME_STATUS.NOT_EXECUTED;

  if (rec) {
    if (rec.status === 'submitted' && rec.hasOrder) status = OUTCOME_STATUS.SUBMITTED;
    else if (rec.status === 'failed') status = OUTCOME_STATUS.FAILED;
    else if (rec.status === 'unavailable') status = OUTCOME_STATUS.UNAVAILABLE;
    else if (decisionValue === 'TAKE') status = OUTCOME_STATUS.NOT_EXECUTED;
    else status = OUTCOME_STATUS.NOT_EXECUTED;
  }

  const fillNote =
    status === OUTCOME_STATUS.SUBMITTED
      ? 'Order submitted; fill outcome not available.'
      : null;

  return {
    status,
    executed: status === OUTCOME_STATUS.SUBMITTED,
    fillNote,
    pnl: null, // never calculated
    pnlNote: 'Outcome not yet available.',
  };
}

/**
 * The main entry point. Pure and deterministic: no network, no provider, no side
 * effect. Assembles verified records into a review.
 *
 * @param {object} sources
 *   { idea, risk, structure, report, decision, execution, research, attack, history }
 */
export function buildTradeReview(sources = {}) {
  const src = isObj(sources) ? sources : {};
  const idea = isObj(src.idea) ? src.idea : null;
  const decision = isObj(src.decision) ? src.decision : null;
  const risk = isObj(src.risk) ? src.risk : null;
  const structure = isObj(src.structure) ? src.structure : null;
  const exec = isObj(src.execution) ? src.execution : null;
  const research = isObj(src.research) ? src.research : null;
  const attack = isObj(src.attack) ? src.attack : null;
  const history = isObj(src.history) ? src.history : null;

  // --- LOCKED: no trade idea or no recorded decision ----------------------
  if (!idea || !String(idea.asset || '').trim()) {
    return lockedReview('There is no trade idea to review.');
  }
  if (!decision || decision.status !== 'recorded') {
    return lockedReview('No decision has been recorded for this trade yet. Record your decision before reviewing the trade.');
  }

  const decisionValue = String(decision.decision || '').toUpperCase();

  // --- Determine the review-level state ------------------------------------
  let status;
  const execStatus = isObj(exec) ? exec.status : null;
  const riskAvailable = risk && risk.available !== false;

  if (decisionValue === 'TAKE') {
    if (execStatus === 'submitted') status = REVIEW_STATUS.READY;
    else if (!riskAvailable) status = REVIEW_STATUS.UNAVAILABLE; // cannot show the trade plan honestly
    else status = REVIEW_STATUS.INCOMPLETE; // decided TAKE but no submitted order
  } else {
    // WAIT / SKIP: a full, readable review exists; execution simply does not apply.
    status = REVIEW_STATUS.READY;
  }

  const statusDetail = {
    [REVIEW_STATUS.LOCKED]: 'Trade Review is locked until a decision is recorded.',
    [REVIEW_STATUS.READY]: 'The trade review is assembled from your verified records.',
    [REVIEW_STATUS.INCOMPLETE]: 'You decided TAKE, but no paper order was submitted yet, so the execution leg is incomplete.',
    [REVIEW_STATUS.UNAVAILABLE]: 'Essential trade data (e.g. the risk assessment) is missing, so the review cannot be assembled.',
  }[status];

  // --- Summary -------------------------------------------------------------
  const summary = {
    asset: String(idea.asset || '').trim().toUpperCase() || null,
    direction: idea.direction ?? null,
    timeframe: txt(decision.trade?.timeframe) ?? txt(idea.timeframe) ?? null,
    decision: decision.decision ?? null,
    decisionLabel: decision.decisionLabel ?? decision.decision ?? null,
    decidedAt: decision.timestamp ?? null,
    executionStatus: execStatus ?? null,
  };

  // --- Original thesis (verbatim, never reinterpreted) ---------------------
  // Preserve the trader's words exactly — no trimming, no rephrasing.
  const rawStr = (v) => (typeof v === 'string' ? v : null);
  const thesis = rawStr(idea.thesis) || rawStr(decision.trade?.thesis) || null;

  // --- Trade plan (Phase 6 / 7, read unchanged) ---------------------------
  // If the review cannot be assembled honestly (UNAVAILABLE because essential
  // risk data is missing), the plan is left null rather than partially filled.
  let plan = null;
  if (status !== REVIEW_STATUS.UNAVAILABLE) {
    const figures = readRiskFigures(risk, structure);
    plan = {
      entryPrice: figures.entryPrice,
      invalidationPrice: figures.invalidationPrice,
      riskBudget: figures.riskBudget,
      priceRiskPerUnit: figures.priceRiskPerUnit,
      positionSize: figures.positionSize,
      definedRisk: figures.definedRisk,
      riskStatus: risk?.status ?? null,
      riskStatusLabel: risk?.statusLabel ?? null,
      source: 'Phase 6 deterministic risk engine, reused unchanged — never recalculated',
    };
  }

  // --- Execution record + outcome (Phase 10, read only) -------------------
  const executionRecord = buildExecutionRecord(exec, decisionValue);
  const outcome = buildOutcome(exec, decisionValue);

  // --- What was known before the decision (synthesis, no new research) -----
  const knownBefore = buildKnownBefore(research, attack, history, src.report);

  return {
    available: true,
    status,
    statusLabel: REVIEW_STATUS_LABELS[status],
    statusDetail,
    summary,
    thesis,
    // The human decision, preserved verbatim. The review never reinterprets it.
    decision: {
      decision: decision.decision ?? null,
      decisionLabel: decision.decisionLabel ?? decision.decision ?? null,
      reason: decision.reason ?? null,
      timestamp: decision.timestamp ?? null,
    },
    plan,
    executionRecord,
    outcome,
    knownBefore,
    // Trader-entered review notes. Null here; the UI binds this to session state
    // and sends it back for display. TradeGuard never auto-fills it.
    notes: null,
    notesPersistenceNote: NOTES_PERSISTENCE_NOTE,
    limitations: [...REVIEW_LIMITATIONS],
    method: REVIEW_METHOD_NOTE,
    disclaimer: REVIEW_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

/** Honest locked state — no fabricated review content. */
function lockedReview(reason) {
  return {
    available: true,
    status: REVIEW_STATUS.LOCKED,
    statusLabel: REVIEW_STATUS_LABELS.locked,
    statusDetail: reason,
    summary: null,
    thesis: null,
    decision: null,
    plan: null,
    executionRecord: { executed: false, status: OUTCOME_STATUS.NOT_EXECUTED, detail: reason, order: null },
    outcome: { status: OUTCOME_STATUS.NOT_EXECUTED, executed: false, fillNote: null, pnl: null, pnlNote: 'Outcome not yet available.' },
    knownBefore: null,
    notes: null,
    notesPersistenceNote: NOTES_PERSISTENCE_NOTE,
    limitations: [...REVIEW_LIMITATIONS],
    method: REVIEW_METHOD_NOTE,
    disclaimer: REVIEW_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

/** Honest shape when the service itself cannot run. */
export function emptyReview(reason) {
  return {
    ...lockedReview(reason || 'Trade Review could not be assembled.'),
    available: false,
  };
}
