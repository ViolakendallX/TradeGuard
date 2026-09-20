/**
 * Paper execution service (Phase 10).
 *
 * Purpose: take a trade the trader has ALREADY decided to TAKE — through their
 * own recorded Human Decision — and submit it to the Bitget DEMO (paper) trading
 * environment. Nothing else.
 *
 * This module is the gate, not the trigger. It answers:
 *
 *   "Is this trade actually allowed to be paper-executed right now, and if so,
 *    exactly what would be sent?"
 *
 * It deliberately does NOT answer "should this trade be executed?" — the trader
 * already answered that in Phase 9, and this module's entire job is to refuse to
 * answer it again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THAT MATTERS MOST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TradeGuard NEVER decides to execute. The only thing that can unlock this stage
 * is a recorded Human Decision whose value is TAKE. WAIT and SKIP do not unlock
 * it, and they are never reinterpreted as anything else — a WAIT is a WAIT.
 *
 * What this module deliberately never does:
 *   - It never executes on TradeGuard's own initiative. There is no scheduler,
 *     no auto-submit, no "record TAKE then immediately send" path. Recording
 *     TAKE only makes execution ELIGIBLE; a second, separate, explicit
 *     confirmation is required to submit.
 *   - It never re-derives risk. Price risk per unit, position size and defined
 *     risk come from the Phase 6 risk engine via the Phase 7 trade structure.
 *     This module performs no arithmetic on the trader's levels. There is no
 *     second risk engine, and none is needed.
 *   - It never invents an order value. Symbol, side, quantity and price are all
 *     mapped from the structured trade; nothing is defaulted, rounded into
 *     existence, or estimated.
 *   - It never talks to a live exchange. There is no live host, no live
 *     credential, and no fallback from demo to live. A failure is reported, not
 *     routed somewhere else.
 *   - It never fabricates a provider response. An order is "submitted" only when
 *     Bitget Demo returns an order ID. A 200 with no ID is not a submission.
 *   - It never manages a position. No stop management, no take-profit, no
 *     liquidation handling, no leverage, no wallet action. It sends one order
 *     and reports what came back.
 *   - It never emits a verdict. The status vocabulary describes WHAT HAPPENED
 *     (locked, ready, submitted, failed) — never whether the trade is good.
 */

import { submitDemoOrder, demoSymbol } from './providers/bitgetDemo.js';
import { RISK_STATUS } from './riskEngine.js';

// --- status vocabulary ------------------------------------------------------

/**
 * The five deterministic execution states.
 *
 * Note what is absent: nothing here says "good", "approved", "recommended" or
 * "likely to work". PAPER ORDER SUBMITTED means the demo venue accepted an
 * order — it is a fact about the request, not an opinion about the trade.
 */
export const EXECUTION_STATUS = Object.freeze({
  LOCKED: 'locked', // the gate is not satisfied (no TAKE, no structure, …)
  READY: 'ready', // gate satisfied; awaiting the trader's explicit confirmation
  UNAVAILABLE: 'unavailable', // the venue cannot be used (no credentials, no symbol)
  SUBMITTED: 'submitted', // Bitget Demo confirmed an order with an order ID
  FAILED: 'failed', // the venue rejected or could not be reached
});

export const EXECUTION_STATUS_LABELS = Object.freeze({
  locked: 'EXECUTION LOCKED',
  ready: 'READY FOR PAPER EXECUTION',
  unavailable: 'PAPER EXECUTION UNAVAILABLE',
  submitted: 'PAPER ORDER SUBMITTED',
  failed: 'PAPER ORDER FAILED',
});

/**
 * The confirmation token the trader must explicitly send.
 *
 * This is a separate, deliberate act — NOT implied by recording TAKE. The submit
 * path rejects anything that is not exactly this string, which is what makes
 * "no automatic execution after recording TAKE" a structural property rather
 * than a convention.
 */
export const CONFIRM_TOKEN = 'PAPER EXECUTE';

export const CONFIRMATION_NOTICE =
  'This sends an order to Bitget Demo using virtual funds. No live-money order will be placed.';

/** Order type used for every paper order. Fixed: an entry at the trader's level. */
export const PAPER_ORDER_TYPE = 'limit';

export const EXECUTION_METHOD_NOTE =
  'Paper execution maps the trade you already structured — and already decided to TAKE — onto an order ' +
  'for the Bitget Demo trading environment, which uses virtual funds. It performs no new analysis and ' +
  'no new calculation: the symbol, side, quantity and price all come from your trade structure and the ' +
  'Phase 6 risk engine. Nothing is submitted until you explicitly confirm, and nothing is ever sent to a ' +
  'live venue.';

export const EXECUTION_DISCLAIMER =
  'A paper order is a record that a demo order was accepted by the demo venue. It is not a trading ' +
  'instruction, not a TradeGuard recommendation, and not a statement about whether the trade is worth ' +
  'taking. Demo results do not reflect real execution: fills, slippage, fees and liquidity in a demo ' +
  'environment are not the same as in a live market.';

export const EXECUTION_LIMITATIONS = Object.freeze([
  'Paper execution trades virtual funds in the Bitget Demo environment only. No live-money order is ' +
    'placed, and there is no path from this stage to a live venue.',
  'The order is submitted once. TradeGuard does not manage the position afterwards — no stop ' +
    'adjustment, no take-profit, no exit, no monitoring.',
  'The quantity is the position size the Phase 6 risk engine calculated. It is not rounded to a ' +
    'venue lot size, and a fractional size may be rejected by the venue.',
  'The entry price is the level you supplied. It is not verified against the current market price, so ' +
    'the order may not fill — a submitted order is not a filled order.',
  'An accepted demo order is not a successful trade. This stage reports what the demo venue returned, ' +
    'not whether the trade was a good decision.',
]);

/** Why execution is locked, keyed by gate id. One message per real cause. */
const LOCK_REASONS = Object.freeze({
  'no-idea': 'There is no trade idea to execute.',
  'no-decision': 'No decision has been recorded for this trade yet. Record your decision first — only a recorded TAKE unlocks paper execution.',
  'decision-not-take': 'Your recorded decision is DECISION, so paper execution stays locked. Only a recorded TAKE unlocks it — TradeGuard does not reinterpret your decision.',
  'no-structure': 'The trade structure is not available, so there is nothing to map into an order.',
  'structure-incomplete': 'The trade structure is STRUCTURELABEL, so the trade is not fully described and no order can be built from it.',
  'no-risk': 'The risk assessment is not available, so there is no position size to submit.',
  'risk-not-ready': 'The risk assessment is RISKLABEL, so there is no defined risk and no position size was calculated. Nothing can be sized from an incomplete or inconsistent construction.',
  'no-report': 'The final trade report is not available, so the investigation this decision was made against is not complete.',
});

// --- small helpers ----------------------------------------------------------

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extracts the risk figures from a Phase 6 / Phase 7 source.
 *
 * The numbers are READ, never computed. Both shapes are supported because the
 * trade structure embeds the engine's result and also projects it into
 * `riskStructure`; either way it is the same engine's output.
 */
function readRiskFigures(risk, structure) {
  const fromRisk = isObj(risk) ? risk : null;
  const calc = fromRisk && isObj(fromRisk.calculation) ? fromRisk.calculation : null;
  const inputs = fromRisk && isObj(fromRisk.inputs) ? fromRisk.inputs : {};
  const projected = isObj(structure) && isObj(structure.riskStructure) ? structure.riskStructure : null;

  const pick = (key) => {
    if (calc && calc[key] != null) return num(calc[key]);
    if (projected && projected[key] != null) return num(projected[key]);
    return null;
  };

  return {
    riskBudget: pick('riskBudget'),
    priceRiskPerUnit: pick('priceRiskPerUnit'),
    positionSize: pick('positionSize'),
    definedRisk: pick('definedRisk'),
    entryPrice: inputs.entryPrice != null ? num(inputs.entryPrice) : projectSetup(structure, 'entryPrice'),
    invalidationPrice:
      inputs.invalidationPrice != null ? num(inputs.invalidationPrice) : projectSetup(structure, 'invalidationPrice'),
    status: fromRisk?.status ?? projected?.status ?? null,
    statusLabel: fromRisk?.statusLabel ?? projected?.statusLabel ?? null,
  };
}

function projectSetup(structure, key) {
  const setup = isObj(structure) && isObj(structure.setup) ? structure.setup : null;
  return setup && setup[key] != null ? num(setup[key]) : null;
}

/**
 * The execution gate. Pure, deterministic, and the single place that decides
 * whether paper execution is permitted at all.
 *
 * Every check is a real precondition from the phase plan. A missing one returns
 * LOCKED with the specific reason, never a generic refusal and never a pass.
 *
 * @returns {{ status: string, reason: string|null, gate: string|null }}
 */
export function evaluateExecutionGate(sources = {}) {
  const src = isObj(sources) ? sources : {};
  const decision = isObj(src.decision) ? src.decision : null;
  const structure = isObj(src.structure) ? src.structure : null;
  const risk = isObj(src.risk) ? src.risk : null;
  const report = isObj(src.report) ? src.report : null;
  const idea = isObj(src.idea) ? src.idea : null;

  const lock = (gate, reason) => ({ status: EXECUTION_STATUS.LOCKED, reason, gate, ready: false });

  // 1. A valid trade idea must exist.
  if (!idea || !String(idea.asset || '').trim()) {
    return lock('no-idea', LOCK_REASONS['no-idea']);
  }

  // 2. The risk assessment must be available and READY.
  if (!risk || risk.available === false) {
    return lock('no-risk', LOCK_REASONS['no-risk']);
  }
  if (risk.status !== RISK_STATUS.READY) {
    return lock('risk-not-ready', LOCK_REASONS['risk-not-ready'].replace('RISKLABEL', risk.statusLabel || 'not ready'));
  }

  // 3. The trade structure must be COMPLETE.
  if (!structure || structure.available === false) {
    return lock('no-structure', LOCK_REASONS['no-structure']);
  }
  if (structure.status !== 'complete') {
    return lock(
      'structure-incomplete',
      LOCK_REASONS['structure-incomplete'].replace('STRUCTURELABEL', structure.statusLabel || 'incomplete')
    );
  }

  // 4. The final trade report must exist.
  if (!report || report.available === false) {
    return lock('no-report', LOCK_REASONS['no-report']);
  }

  // 5. A human decision must exist at all.
  if (!decision || decision.available === false) {
    return lock('no-decision', LOCK_REASONS['no-decision']);
  }
  if (decision.status !== 'recorded') {
    return lock('no-decision', LOCK_REASONS['no-decision']);
  }

  // 6. The recorded decision MUST be TAKE. WAIT and SKIP are left exactly as
  //    they are — they are never reinterpreted, promoted or rounded up.
  const value = typeof decision.decision === 'string' ? decision.decision.trim().toUpperCase() : '';
  if (value !== 'TAKE') {
    const shown = value || 'not recorded';
    return lock(
      'decision-not-take',
      LOCK_REASONS['decision-not-take'].replace('DECISION', shown)
    );
  }

  return { status: EXECUTION_STATUS.READY, reason: null, gate: null, ready: true };
}

/**
 * Maps the structured trade onto a Bitget Demo order.
 *
 * Every field comes from the structure or the risk engine. Nothing is invented:
 *   - symbol   <- the asset, through the SAME mapping market data uses
 *   - side     <- the risk engine's side (long -> buy, short -> sell)
 *   - quantity <- the engine's position size
 *   - price    <- the trader's entry
 *
 * @returns {{ order: object|null, errors: string[], missing: string[] }}
 */
export function buildPaperOrder(sources = {}) {
  const src = isObj(sources) ? sources : {};
  const idea = isObj(src.idea) ? src.idea : null;
  const structure = isObj(src.structure) ? src.structure : null;
  const risk = isObj(src.risk) ? src.risk : null;

  const figures = readRiskFigures(risk, structure);
  const asset = String(idea?.asset || structure?.asset || '').trim().toUpperCase();
  const symbol = demoSymbol(asset);

  const side = risk?.side === 'short' ? 'sell' : risk?.side === 'long' ? 'buy' : null;
  const quantity = figures.positionSize;
  const price = figures.entryPrice;

  const missing = [];
  const errors = [];

  if (!symbol) missing.push('a Bitget symbol (no asset was resolved)');
  if (!side) missing.push('an order side (the risk engine found no long or short side)');
  if (quantity === null) missing.push('a position size (the risk engine did not calculate one)');
  if (price === null) missing.push('an entry price');

  if (quantity !== null && quantity <= 0) errors.push(`The calculated position size (${quantity}) is not positive, so no order can be built.`);
  if (price !== null && price <= 0) errors.push(`The entry price (${price}) is not positive, so no order can be built.`);

  if (missing.length > 0 || errors.length > 0) {
    return { order: null, errors, missing };
  }

  return {
    order: {
      symbol,
      side,
      orderType: PAPER_ORDER_TYPE,
      quantity,
      price,
    },
    errors: [],
    missing: [],
  };
}

/**
 * Deterministic validation of a constructed order, BEFORE any provider call.
 *
 * This is the last gate before the network. Its job is to make sure a malformed
 * order can never leave the process — and to report precisely why it cannot.
 */
export function validatePaperOrder(order) {
  const errors = [];
  if (!isObj(order)) return { valid: false, errors: ['No order was constructed.'] };

  if (!order.symbol || typeof order.symbol !== 'string') errors.push('The order has no symbol.');
  if (order.side !== 'buy' && order.side !== 'sell') errors.push(`The order side must be buy or sell, received "${order.side}".`);
  if (order.orderType !== 'limit' && order.orderType !== 'market') {
    errors.push(`The order type must be limit or market, received "${order.orderType}".`);
  }
  const q = num(order.quantity);
  if (q === null) errors.push('The order has no quantity.');
  else if (q <= 0) errors.push(`The order quantity (${q}) must be positive.`);

  if (order.orderType === 'limit') {
    const p = num(order.price);
    if (p === null) errors.push('A limit order needs a price.');
    else if (p <= 0) errors.push(`The order price (${p}) must be positive.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks whether live execution has been requested anywhere in the environment.
 *
 * This exists to make the live-trading prohibition ENFORCED rather than assumed.
 * There is deliberately no branch anywhere in this codebase that acts on a live
 * flag — if one is present in the environment, the honest response is to refuse,
 * loudly, rather than to honour it or to silently ignore it.
 *
 * Any of these variables being set to a truthy value is treated as a
 * misconfiguration and reported. It never enables anything.
 */
export const FORBIDDEN_LIVE_ENV_VARS = Object.freeze([
  'TRADEGUARD_LIVE_TRADING',
  'TRADEGUARD_ENABLE_LIVE',
  'TRADEGUARD_BITGET_LIVE_API_KEY',
  'TRADEGUARD_BITGET_LIVE_API_SECRET',
  'TRADEGUARD_BITGET_LIVE_PASSPHRASE',
]);

export function detectLiveConfiguration(env = process.env) {
  const source = env && typeof env === 'object' ? env : {};
  const present = FORBIDDEN_LIVE_ENV_VARS.filter((name) => {
    const raw = source[name];
    return typeof raw === 'string' ? raw.trim() !== '' : raw !== undefined && raw !== null;
  });
  return {
    requested: present.length > 0,
    // NAMES only — never a value. A live credential must not reach a response.
    variables: present,
  };
}

const LIVE_REFUSAL =
  'TradeGuard does not place live-money orders. A live-execution setting was found in the environment ' +
  'and has been refused — this stage only ever submits to the Bitget Demo environment.';

// --- record shapes ----------------------------------------------------------

/**
 * The pre-execution review: everything that will be sent, plus the decision and
 * reason that authorised it. Nothing here is a recommendation.
 */
function buildReview(sources, gate, orderBuild) {
  const src = isObj(sources) ? sources : {};
  const idea = isObj(src.idea) ? src.idea : null;
  const structure = isObj(src.structure) ? src.structure : null;
  const risk = isObj(src.risk) ? src.risk : null;
  const decision = isObj(src.decision) ? src.decision : null;
  const figures = readRiskFigures(risk, structure);

  const setup = isObj(structure?.setup) ? structure.setup : {};
  const timeframe = idea?.timeframe ?? setup.timeframe ?? null;

  return {
    asset: String(idea?.asset || structure?.asset || '').trim().toUpperCase() || null,
    symbol: orderBuild?.order?.symbol ?? null,
    direction: idea?.direction ?? structure?.direction ?? null,
    side: risk?.side ?? null,
    timeframe: typeof timeframe === 'string' && timeframe ? timeframe : null,
    entryPrice: figures.entryPrice,
    invalidationPrice: figures.invalidationPrice,
    riskBudget: figures.riskBudget,
    priceRiskPerUnit: figures.priceRiskPerUnit,
    positionSize: figures.positionSize,
    definedRisk: figures.definedRisk,
    // The authorisation, carried through so the record always shows WHY this
    // was allowed — a human decision, in their own words.
    decision: decision?.decision ?? null,
    decisionLabel: decision?.decisionLabel ?? null,
    reason: typeof decision?.reason === 'string' ? decision.reason : null,
    decidedAt: decision?.timestamp ?? null,
    // What would actually be sent.
    order: orderBuild?.order ?? null,
    orderType: orderBuild?.order?.orderType ?? null,
    // Where the numbers came from. Never "calculated here".
    sources: {
      risk: 'Phase 6 deterministic risk engine, reused unchanged',
      structure: 'Phase 7 trade structure, reused unchanged',
      decision: 'Recorded by the trader in Phase 9',
      levels: 'Supplied by the trader',
    },
  };
}

function unavailableRecord(reason, detail = null) {
  return {
    available: true,
    status: EXECUTION_STATUS.UNAVAILABLE,
    statusLabel: EXECUTION_STATUS_LABELS.unavailable,
    statusDetail: detail || reason,
    reason,
    environment: 'demo',
    review: null,
    order: null,
    result: null,
    ordered: false,
    limitations: [...EXECUTION_LIMITATIONS],
    method: EXECUTION_METHOD_NOTE,
    disclaimer: EXECUTION_DISCLAIMER,
  };
}

/**
 * Builds the deterministic execution record for a trade WITHOUT submitting
 * anything. This is what the UI shows before the trader confirms.
 *
 * Pure: no network, no provider call, no side effect.
 */
export function buildExecutionRecord(sources = {}) {
  const src = isObj(sources) ? sources : {};
  const gate = evaluateExecutionGate(src);

  // --- live-trading guard, evaluated before anything else can proceed -----
  const live = detectLiveConfiguration(src.env);
  if (live.requested) {
    return {
      ...unavailableRecord(LIVE_REFUSAL),
      status: EXECUTION_STATUS.UNAVAILABLE,
      liveConfigurationRefused: true,
      liveVariablesFound: live.variables,
    };
  }

  if (!gate.ready) {
    return {
      available: true,
      status: EXECUTION_STATUS.LOCKED,
      statusLabel: EXECUTION_STATUS_LABELS.locked,
      statusDetail: gate.reason,
      reason: gate.reason,
      gate: gate.gate,
      environment: 'demo',
      review: null,
      order: null,
      result: null,
      ordered: false,
      limitations: [...EXECUTION_LIMITATIONS],
      method: EXECUTION_METHOD_NOTE,
      disclaimer: EXECUTION_DISCLAIMER,
    };
  }

  const built = buildPaperOrder(src);
  const review = buildReview(src, gate, built);

  // The order cannot be mapped (no symbol, no size, …) — that is an honest
  // unavailable state, not a failure and definitely not a fabricated order.
  if (!built.order) {
    const detail =
      built.missing.length > 0
        ? `The order could not be constructed because there is no ${built.missing.join(', no ')}.`
        : built.errors.join(' ');
    return { ...unavailableRecord(detail), review: { ...review, order: null } };
  }

  const validation = validatePaperOrder(built.order);
  if (!validation.valid) {
    return { ...unavailableRecord(validation.errors.join(' ')), review: { ...review, order: null } };
  }

  return {
    available: true,
    status: EXECUTION_STATUS.READY,
    statusLabel: EXECUTION_STATUS_LABELS.ready,
    statusDetail:
      'Everything paper execution needs is present. Nothing has been sent — submitting requires your explicit confirmation.',
    reason: null,
    gate: null,
    environment: 'demo',
    venue: 'Bitget Demo (virtual funds)',
    confirmationToken: CONFIRM_TOKEN,
    confirmationNotice: CONFIRMATION_NOTICE,
    review,
    order: built.order,
    result: null,
    ordered: false,
    limitations: [...EXECUTION_LIMITATIONS],
    method: EXECUTION_METHOD_NOTE,
    disclaimer: EXECUTION_DISCLAIMER,
  };
}

/**
 * The submission path. Requires the explicit confirmation token AND a satisfied
 * gate; anything else returns a record without touching the provider.
 *
 * @param {object} sources  { idea, risk, structure, report, decision, env, fetchImpl }
 * @param {string} confirmation the trader's confirmation string
 * @param {Date}   [now]
 */
export async function runPaperExecution(sources = {}, confirmation = null, now = new Date()) {
  const src = isObj(sources) ? sources : {};

  // --- 1. Live guard: never proceeds, whatever the environment says --------
  const live = detectLiveConfiguration(src.env);
  if (live.requested) {
    return {
      ...unavailableRecord(LIVE_REFUSAL),
      liveConfigurationRefused: true,
      liveVariablesFound: live.variables,
    };
  }

  // --- 2. The gate must still be satisfied at submit time -----------------
  const base = buildExecutionRecord(src);
  if (base.status !== EXECUTION_STATUS.READY) {
    // Locked / unavailable states are returned as-is: submission is refused.
    return base;
  }

  // --- 3. Explicit confirmation, required separately from the decision ----
  const token = typeof confirmation === 'string' ? confirmation.trim() : '';
  if (token !== CONFIRM_TOKEN) {
    return {
      ...base,
      status: EXECUTION_STATUS.READY,
      statusLabel: EXECUTION_STATUS_LABELS.ready,
      statusDetail: `Nothing was submitted. Confirming requires typing "${CONFIRM_TOKEN}" — your recorded decision to TAKE does not submit an order on its own.`,
      confirmationRequired: true,
    };
  }

  // --- 4. Validate again, immediately before the call --------------------
  const validation = validatePaperOrder(base.order);
  if (!validation.valid) {
    return {
      ...base,
      status: EXECUTION_STATUS.UNAVAILABLE,
      statusLabel: EXECUTION_STATUS_LABELS.unavailable,
      statusDetail: `The order was rejected before it was sent: ${validation.errors.join(' ')}`,
      order: null,
      review: { ...base.review, order: null },
    };
  }

  // --- 5. Submit to the DEMO venue only ---------------------------------
  const providerResult = await submitDemoOrder(base.order, {
    fetchImpl: src.fetchImpl,
    env: src.env,
    now,
  });

  if (providerResult.ok) {
    return {
      ...base,
      status: EXECUTION_STATUS.SUBMITTED,
      statusLabel: EXECUTION_STATUS_LABELS.submitted,
      statusDetail:
        'Bitget Demo accepted the order and returned an order ID. This used virtual funds — no live-money order was placed.',
      ordered: true,
      result: {
        status: 'Submitted',
        orderId: providerResult.orderId,
        clientOrderId: providerResult.clientOrderId,
        symbol: providerResult.symbol,
        side: providerResult.side,
        quantity: providerResult.quantity,
        price: providerResult.price,
        orderType: providerResult.orderType,
        rawStatus: providerResult.rawStatus,
        submittedAt: providerResult.timestamp,
        environment: providerResult.environment,
        virtualFunds: true,
      },
      submittedAt: providerResult.timestamp,
    };
  }

  // --- 6. Honest failure --------------------------------------------------
  //
  // Two different things went wrong here and they are reported differently:
  //   - no demo credentials  -> UNAVAILABLE. No request was ever sent, so no
  //     attempt was made that could have failed. The venue simply cannot be used.
  //   - the venue refused or could not be reached -> FAILED. An attempt WAS made
  //     and it did not result in an order.
  //
  // Collapsing both into FAILED would imply an order was attempted when nothing
  // left the machine. The provider's own message is carried through; credentials
  // never are.
  const unusableVenue = providerResult.kind === 'not-configured';

  return {
    ...base,
    status: unusableVenue ? EXECUTION_STATUS.UNAVAILABLE : EXECUTION_STATUS.FAILED,
    statusLabel: unusableVenue
      ? EXECUTION_STATUS_LABELS.unavailable
      : EXECUTION_STATUS_LABELS.failed,
    statusDetail: providerResult.message || 'Bitget Demo did not accept the order.',
    ordered: false,
    result: {
      status: unusableVenue ? 'Unavailable' : 'Failed',
      orderId: null,
      clientOrderId: null,
      symbol: providerResult.symbol,
      side: providerResult.side,
      quantity: providerResult.quantity,
      price: providerResult.price,
      orderType: providerResult.orderType,
      rawStatus: null,
      submittedAt: null,
      environment: providerResult.environment,
      errorCode: providerResult.errorCode ?? null,
      // Names only — never a secret value.
      missingCredentials: providerResult.missingCredentials ?? null,
      virtualFunds: true,
    },
  };
}

/** Honest shape when the service itself cannot run. */
export function emptyExecution(reason) {
  return {
    ...unavailableRecord(reason || 'Paper execution could not be evaluated.'),
    available: false,
  };
}
