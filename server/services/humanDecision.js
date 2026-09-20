/**
 * Human decision service (Phase 9).
 *
 * Purpose: RECORD the decision the trader makes after reading the final report.
 *
 * This module is the boundary between TradeGuard's analysis and the trader's own
 * judgement. Everything before it is TradeGuard investigating the trade. This is
 * the first and only stage where the answer comes from the human.
 *
 * What this module deliberately never does:
 *   - It never MAKES the decision. It does not choose TAKE, WAIT or SKIP, does
 *     not suggest one, does not score or rank them, and does not express a
 *     preference. There is no default and no preselection anywhere in the code:
 *     a decision only exists once the trader has stated one.
 *   - It never generates the reason. The trader's reason is required free text,
 *     stored exactly as written. TradeGuard does not draft it, complete it,
 *     reword it, summarise it or call a model to produce one.
 *   - It never recalculates risk. It carries the Phase 6 risk figures through
 *     verbatim for the record. The Risk Engine remains the single source of
 *     truth, and this module performs no arithmetic on the trader's levels.
 *   - It never re-runs or reinterprets the analysis. The decision record holds
 *     the trade context; it does not restate findings, and it does not reopen
 *     the investigation.
 *   - It never executes anything. No order, no exchange call, no paper trade, no
 *     wallet action, no automation. Recording that you decided to TAKE is a
 *     note about your intention, not an instruction to act. Execution is a
 *     later phase that is not built.
 *   - It never interprets a recorded decision as a good trade, a validated
 *     trade, a successful trade, or a TradeGuard endorsement. A recorded TAKE is
 *     simply what the trader chose.
 *
 * Vocabulary note: the three options are TAKE / WAIT / SKIP. These are the
 * trader's own decisions. TradeGuard deliberately does not use BUY / SELL /
 * PASS, which are instructions — these are records of a human choice.
 *
 * Output: a structured, frontend-safe record (see runHumanDecision).
 */

export const DECISION_STATUS = Object.freeze({
  REQUIRED: 'required', // no decision recorded yet — the trader must supply one
  RECORDED: 'recorded', // the trader's decision is captured
});

/**
 * Human-facing status labels. Two deterministic states only — there is no
 * "confidence" state and no recommendation score anywhere in this phase.
 */
export const DECISION_STATUS_LABELS = Object.freeze({
  required: 'DECISION REQUIRED',
  recorded: 'DECISION RECORDED',
});

/**
 * The three trader-controlled choices. Order here is presentation order and is
 * deliberately not a ranking: no option is first because it is "best", and the
 * UI must not preselect any of them.
 */
export const DECISIONS = Object.freeze(['TAKE', 'WAIT', 'SKIP']);

/** What each choice means, stated as the trader's own decision, never a suggestion. */
export const DECISION_LABELS = Object.freeze({
  TAKE: 'TAKE',
  WAIT: 'WAIT',
  SKIP: 'SKIP',
});

export const DECISION_HINTS = Object.freeze({
  TAKE: 'I am going ahead with this trade on the terms in the report.',
  WAIT: 'I am not acting yet — I want more information or a better setup first.',
  SKIP: 'I am not taking this trade.',
});

/** How a recorded decision is surfaced. Always second person: it is the trader's. */
export const RECORDED_PREFIX = 'You recorded:';

/**
 * The statement the UI must present alongside the choices. This is the core
 * product boundary of Phase 9: TradeGuard hands the decision back.
 */
export const DECISION_OWNERSHIP_NOTICE =
  'TradeGuard does not choose this for you. Record the decision you are making based on the report.';

export const DECISION_METHOD_NOTE =
  'TradeGuard records the decision you make and the reason you give for it. It does not make the ' +
  'decision, does not recommend one of the options, does not score the trade, and does not tell you ' +
  'whether this is a good or bad trade. What is stored here is your judgement, written by you.';

export const DECISION_DISCLAIMER =
  'This is a record of your decision, not a trading instruction and not a TradeGuard recommendation. ' +
  'Recording a decision does not place an order, and nothing is executed.';

/** Non-negotiable caveats. Always returned, so the UI cannot omit them. */
export const DECISION_LIMITATIONS = Object.freeze([
  'TradeGuard did not evaluate whether this decision is good, correct or likely to work. It recorded ' +
    'what you chose.',
  'The reason stored here is the one you wrote. TradeGuard did not generate, complete or edit it.',
  'The risk figures in this record come from the deterministic risk engine and describe the trade as ' +
    'you constructed it. They are not a prediction, and they are not verified against the market.',
  'Nothing has been executed. No order was placed and no exchange was contacted — recording a ' +
    'decision to TAKE is a note about your intention, not an instruction to act.',
  'A recorded decision is not a successful trade, a validated trade, or an endorsement of the trade. ' +
    'The outcome is not known at the time of recording.',
]);

/** Reason length bounds. Required, and bounded so the record stays a note. */
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 2000;

const MAX_NUMBER = 1_000_000_000;

// --- small helpers ----------------------------------------------------------

const isObj = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';
const asString = (value) => (isBlank(value) ? '' : String(value).trim());

/**
 * Parses one optional context number, mirroring the tolerance of the Phase 1
 * validator so the same string is read the same way everywhere.
 * This is CARRIED THROUGH for the record — it is never recomputed.
 *
 * @returns {{ value: number|null, error: string|null }}
 */
function parseContextNumber(raw, label) {
  if (isBlank(raw)) return { value: null, error: null };

  const cleaned = String(raw).replace(/[$,\s]/g, '');
  if (cleaned === '') return { value: null, error: `${label} is not a valid number.` };

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, error: `${label} must be a number.` };
  if (parsed < 0) return { value: null, error: `${label} cannot be negative.` };
  if (parsed > MAX_NUMBER) return { value: null, error: `${label} is out of range.` };

  return { value: parsed, error: null };
}

/**
 * Normalises the trade context the decision is being recorded against.
 *
 * The context is what identifies WHICH trade the decision belongs to. It is
 * carried, not analysed: no level is validated for coherence, because deciding
 * whether an entry and an invalidation make sense together is the risk engine's
 * job and it has already run. Here a level is only required to be a sane number
 * so the record is not garbled.
 */
export function cleanDecisionContext(raw) {
  const b = isObj(raw) ? raw : {};

  const asset = asString(b.asset).toUpperCase();
  const direction = asString(b.direction).toLowerCase();
  const timeframe = asString(b.timeframe).toLowerCase();
  const existingPosition = asString(b.existingPosition).toLowerCase();

  const entryPrice = parseContextNumber(b.entryPrice, 'Entry price');
  const invalidationPrice = parseContextNumber(b.invalidationPrice, 'Invalidation price');
  const riskAmount = parseContextNumber(b.riskAmount, 'Risk amount');

  let confidence = null;
  let confidenceError = null;
  if (!isBlank(b.confidence)) {
    const parsed = Number(b.confidence);
    if (!Number.isFinite(parsed)) confidenceError = 'Confidence must be a number.';
    else if (parsed < 1 || parsed > 10) confidenceError = 'Confidence must be between 1 and 10.';
    else confidence = Math.round(parsed);
  }

  return {
    context: {
      asset,
      direction,
      thesis: asString(b.thesis),
      timeframe: timeframe || null,
      entryPrice: entryPrice.value,
      invalidationPrice: invalidationPrice.value,
      riskAmount: riskAmount.value,
      confidence,
      existingPosition: existingPosition || null,
    },
    errors: {
      ...(entryPrice.error ? { entryPrice: entryPrice.error } : {}),
      ...(invalidationPrice.error ? { invalidationPrice: invalidationPrice.error } : {}),
      ...(riskAmount.error ? { riskAmount: riskAmount.error } : {}),
      ...(confidenceError ? { confidence: confidenceError } : {}),
    },
  };
}

/**
 * Collects the risk figures for the record. These are CARRIED THROUGH from the
 * Phase 6 engine — this module performs no arithmetic and derives nothing. When
 * no risk result is available the record says so rather than filling the gap.
 */
function buildRiskContext(risk) {
  if (!isObj(risk)) {
    return {
      state: 'unavailable',
      reason: 'No risk assessment was available when the decision was recorded.',
      reused: false,
      entryPrice: null,
      invalidationPrice: null,
      riskBudget: null,
      priceRiskPerUnit: null,
      positionSize: null,
      definedRisk: null,
      status: null,
      statusLabel: null,
    };
  }

  if (risk.available === false) {
    return {
      state: 'unavailable',
      reason: risk.statusDetail || risk.reason || 'The risk engine could not be reached.',
      reused: false,
      entryPrice: null,
      invalidationPrice: null,
      riskBudget: null,
      priceRiskPerUnit: null,
      positionSize: null,
      definedRisk: null,
      status: null,
      statusLabel: risk.statusLabel || null,
    };
  }

  // `ready` is the engine's own word for "the defined risk exists". Anything
  // else (incomplete / invalid construction) is partial: the record keeps the
  // engine's own status wording and does not claim a defined risk it lacks.
  const ready = risk.status === 'ready';

  // When the construction is incomplete or inconsistent the engine reports no
  // calculation at all, and the numbers it does not have must stay null rather
  // than become 0 — a zero would read as "no risk", which is the opposite of
  // the truth. The engine's own inputs are still carried through for context.
  const calc = ready && isObj(risk.calculation) ? risk.calculation : null;
  const inputs = isObj(risk.inputs) ? risk.inputs : {};

  return {
    state: ready ? 'available' : 'partial',
    reason: ready ? null : risk.statusDetail || null,
    reused: true,
    entryPrice: inputs.entryPrice ?? null,
    invalidationPrice: inputs.invalidationPrice ?? null,
    riskBudget: calc ? calc.riskBudget ?? null : null,
    priceRiskPerUnit: calc ? calc.priceRiskPerUnit ?? null : null,
    positionSize: calc ? calc.positionSize ?? null : null,
    definedRisk: calc ? calc.definedRisk ?? null : null,
    status: risk.status ?? null,
    statusLabel: risk.statusLabel ?? null,
  };
}

/**
 * Validates a decision request.
 *
 * Deterministic and explicit. The backend rejects:
 *   - a missing decision
 *   - an unsupported decision value
 *   - a missing, empty or whitespace-only reason
 *   - a reason that is too short or too long
 *   - a malformed trade context (unparseable numbers, out-of-range confidence)
 *
 * @returns {{ valid: boolean, errors: Record<string,string>, value: object|null }}
 */
export function validateDecision(payload) {
  const errors = {};
  const input = isObj(payload) ? payload : {};
  const raw = isObj(input.decision) ? input.decision : input;

  // --- the decision itself ------------------------------------------------
  // No default. An absent choice is an error, never a silent fallback.
  const decision = asString(raw.decision).toUpperCase();
  if (!decision) {
    errors.decision = 'Record a decision — choose TAKE, WAIT or SKIP.';
  } else if (!DECISIONS.includes(decision)) {
    errors.decision = `Decision must be one of: ${DECISIONS.join(', ')}.`;
  }

  // --- the trader's reason -------------------------------------------------
  // Trimmed BEFORE validating, so a whitespace-only reason is caught here and
  // can never be stored as an empty-looking record.
  const reason = asString(raw.reason);
  if (!reason) {
    errors.reason = 'Give your reason for this decision.';
  } else if (reason.length < REASON_MIN_LENGTH) {
    errors.reason = `Reason must be at least ${REASON_MIN_LENGTH} characters.`;
  } else if (reason.length > REASON_MAX_LENGTH) {
    errors.reason = `Reason must be ${REASON_MAX_LENGTH} characters or fewer.`;
  }

  // --- the trade context the decision belongs to ---------------------------
  const { context, errors: contextErrors } = cleanDecisionContext(input.context || raw.context);
  Object.assign(errors, contextErrors);

  if (!context.asset) {
    errors.asset = 'A trade context is required to record a decision against.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, value: null };
  }

  return {
    valid: true,
    errors: {},
    value: {
      decision,
      reason,
      context,
      // Phase 6 risk figures, carried through for the record. Never recomputed.
      riskContext: buildRiskContext(input.risk || raw.risk),
    },
  };
}

/**
 * Builds the decision record.
 *
 * The timestamp is generated HERE, server-side, because it is the system's own
 * fact: when the decision was recorded. It is not supplied by the client, so a
 * malformed or absent client clock cannot produce a wrong record.
 *
 * @param {{decision: string, reason: string, context: object, riskContext: object}} value
 * @param {Date} [now] injectable so tests are deterministic
 */
export function buildDecisionRecord(value, now = new Date()) {
  const timestamp = (now instanceof Date ? now : new Date()).toISOString();

  return {
    status: DECISION_STATUS.RECORDED,
    statusLabel: DECISION_STATUS_LABELS.recorded,

    // --- what the trader decided -----------------------------------------
    decision: value.decision,
    decisionLabel: value.decision,
    recordedPrefix: RECORDED_PREFIX,
    // Stated as the trader's own choice, in their voice. Never "TradeGuard
    // recommends…", never a suggestion, never a score.
    ownership: 'The decision was recorded by the trader.',
    reason: value.reason,
    reasonSource: 'Written by the trader — not generated by TradeGuard',
    timestamp,

    // --- the trade the decision belongs to --------------------------------
    trade: {
      asset: value.context.asset,
      direction: value.context.direction || null,
      thesis: value.context.thesis,
      timeframe: value.context.timeframe,
      entryPrice: value.context.entryPrice,
      invalidationPrice: value.context.invalidationPrice,
      riskAmount: value.context.riskAmount,
      confidence: value.context.confidence,
      existingPosition: value.context.existingPosition,
    },

    // --- the risk context, carried through unchanged ----------------------
    risk: value.riskContext,

    // --- standing guarantees ---------------------------------------------
    ownershipNotice: DECISION_OWNERSHIP_NOTICE,
    methodNote: DECISION_METHOD_NOTE,
    disclaimer: DECISION_DISCLAIMER,
    limitations: [...DECISION_LIMITATIONS],

    // Explicit, so no consumer can infer an action from this record.
    executed: false,
    executionNotice:
      'Nothing has been executed. No order was placed and no exchange was contacted.',
  };
}

/**
 * The "nothing recorded yet" shape. This is the honest initial state: a
 * DECISION REQUIRED record holding no decision, no reason and no timestamp.
 * It is deliberately not a placeholder TAKE or WAIT.
 */
export function pendingDecision(reason = null) {
  return {
    status: DECISION_STATUS.REQUIRED,
    statusLabel: DECISION_STATUS_LABELS.required,

    decision: null,
    decisionLabel: null,
    recordedPrefix: RECORDED_PREFIX,
    ownership: null,
    reason: null,
    reasonSource: null,
    timestamp: null,

    trade: null,
    risk: null,

    ownershipNotice: DECISION_OWNERSHIP_NOTICE,
    methodNote: DECISION_METHOD_NOTE,
    disclaimer: DECISION_DISCLAIMER,
    limitations: [...DECISION_LIMITATIONS],

    available: true,
    statusDetail: reason,

    executed: false,
    executionNotice:
      'Nothing has been executed. No order was placed and no exchange was contacted.',
  };
}

/**
 * Service entry point.
 *
 * Given a decision request and the Phase 6 risk result, returns the record to
 * store and display. Pure and synchronous: no provider, no model, no network,
 * no side effect. Calling it twice with the same input produces the same record
 * apart from the timestamp.
 *
 * @param {object} payload  { decision, reason, context, risk }
 * @param {Date} [now]      injectable clock, for deterministic tests
 */
export function runHumanDecision(payload, now = new Date()) {
  const result = validateDecision(payload);

  if (!result.valid) {
    // The honest answer is "no decision was recorded", never a default.
    return {
      ok: false,
      errors: result.errors,
      record: pendingDecision('No decision was recorded. Choose TAKE, WAIT or SKIP and give your reason.'),
    };
  }

  return {
    ok: true,
    errors: {},
    record: buildDecisionRecord(result.value, now),
  };
}
