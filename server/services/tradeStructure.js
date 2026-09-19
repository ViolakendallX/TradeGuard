/**
 * Deterministic trade structuring service (Phase 7).
 *
 * Purpose: turn the trade the trader has ALREADY described — plus the findings
 * the earlier investigation stages ALREADY produced — into one structured trade
 * plan. It answers:
 *
 *   "What exactly is the trade being considered, what defines its risk, and what
 *    conditions would invalidate the thesis?"
 *
 * It deliberately does NOT answer "should I take this trade?".
 *
 * This module is a SYNTHESIS, not an analysis. Every value it emits is one of:
 *   - a parameter the trader supplied (asset, direction, timeframe, entry,
 *     invalidation, risk budget, confidence, existing position), or
 *   - a number the Phase 6 risk engine calculated (price risk per unit, position
 *     size, defined risk), or
 *   - a finding the Phase 4 Devil's Advocate already produced (key risks,
 *     invalidation conditions, assumptions, missing information, evidence
 *     strength).
 * Nothing is derived, estimated, averaged or invented here.
 *
 * Specifically:
 *   - It NEVER re-implements the risk arithmetic. It calls runRiskAssessment and
 *     reuses the result unchanged, so the Phase 6 Risk Engine remains the single
 *     source of truth for deterministic risk calculation. There is no second
 *     implementation to drift out of sync.
 *   - It NEVER derives an entry or an invalidation from the market price, from
 *     historical data, from a technical indicator, or from an interpretation of
 *     the thesis. The trader's levels are authoritative; when they are absent the
 *     structure is reported as INCOMPLETE and the gap is named explicitly.
 *   - It NEVER converts a Devil's Advocate condition into an exit price. A
 *     condition such as "failure to hold the breakout would weaken the thesis"
 *     is carried through as a condition — never rewritten as "exit at 95" unless
 *     the trader actually supplied 95 as their invalidation.
 *   - It NEVER emits BUY / SELL / PASS, TAKE THE TRADE, a trade-quality score, a
 *     probability of success, a predicted return, or any other verdict. The
 *     human decides.
 *
 * Output: a structured, frontend-safe object (see runTradeStructure).
 */

import { runRiskAssessment, RISK_STATUS } from './riskEngine.js';

/**
 * The two states a structure can report. `unavailable` exists only so the route
 * has an honest shape if the service itself ever throws — the service is pure
 * and deterministic, so in normal operation it always produces one of the two.
 */
export const STRUCTURE_STATUS = Object.freeze({
  COMPLETE: 'complete', // every parameter present and a defined risk exists
  INCOMPLETE: 'incomplete', // something the structure needs is missing or unusable
  UNAVAILABLE: 'unavailable', // the structure could not be produced at all
});

/** Human-facing status labels. Deliberately not a verdict. */
export const STRUCTURE_STATUS_LABELS = Object.freeze({
  complete: 'STRUCTURE COMPLETE',
  incomplete: 'STRUCTURE INCOMPLETE',
  unavailable: 'TRADE STRUCTURE UNAVAILABLE',
});

/**
 * What the structure is, stated plainly. Shipped with every response so the
 * frontend (and the trader) never has to infer it.
 */
export const STRUCTURE_METHOD_NOTE =
  'The trade structure gathers the parameters you supplied and the findings the earlier stages already ' +
  'produced into one place: what the trade is, what defines its risk, and what would invalidate the ' +
  'thesis. It performs no new analysis. The risk figures are the ones the risk engine calculated — they ' +
  'are reused unchanged, not recalculated. Where a value is missing, the structure says so instead of ' +
  'filling the gap.';

export const STRUCTURE_DISCLAIMER =
  'This is a description of the trade you are considering — what it is, what defines its risk, and what ' +
  'conditions would invalidate the thesis. It is not a trading instruction and it does not judge whether ' +
  'the trade is worth taking. The decision remains yours.';

/** Non-negotiable caveats. Always returned, so the UI cannot omit them. */
export const STRUCTURE_LIMITATIONS = Object.freeze([
  'The trade structure organises what you supplied and what the earlier stages found. It adds no new ' +
    'analysis, no new numbers and no new levels.',
  'The entry price and the invalidation are your own levels. TradeGuard did not derive them from the ' +
    'market price, from historical data, from technical indicators, or from any reading of your thesis.',
  'The risk figures come from the Phase 6 risk engine and are reused unchanged. They are not ' +
    'recalculated here, and the engine\'s own limitations — slippage, gaps through the invalidation, ' +
    'rounding to whole units — are listed in the Risk Assessment section.',
  'The invalidation conditions below come from the Devil\'s Advocate stage. They are conditions that ' +
    'would weaken the thesis, NOT exit prices. The only price level that defines the defined risk is the ' +
    'invalidation you supplied yourself.',
  'A structured trade is a described trade, not an endorsed one. TradeGuard does not decide whether the ' +
    'trade should be taken.',
]);

/** Extra caveat added only when the thesis conditions could not be retrieved. */
export const STRUCTURE_NO_CONDITIONS_NOTE =
  'The Devil\'s Advocate findings are unavailable, so this structure carries no thesis conditions, key ' +
  'risks or assumptions. TradeGuard will not invent them — run the investigation again with the research ' +
  'provider reachable to fill this section.';

/** Extra caveat added only when the risk leg is missing or contradictory. */
export const STRUCTURE_NO_RISK_NOTE =
  'The risk assessment did not produce a defined risk, so this structure describes the trade without a ' +
  'risk figure. Nothing has been assumed in its place.';

/** How many items of each list the concise synthesis carries. */
const MAX_EVIDENCE_ITEMS = 4;
const MAX_KEY_RISKS = 6;

// --- small helpers ----------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n) {
  const v = num(n);
  if (v === null) return '—';
  const maxFrac = Math.abs(v) >= 1 ? 2 : 6;
  return v.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

/** Copy one evidence item without inventing anything it did not carry. */
function pickEvidence(item) {
  return {
    id: item.id,
    category: item.category || null,
    title: item.title,
    detail: item.detail,
    source: item.source || null,
  };
}

/** True when a risk result handed to us is a real engine result we can reuse. */
function isReusableRisk(risk) {
  return isObj(risk) && typeof risk.status === 'string';
}

// --- section builders -------------------------------------------------------

/**
 * Section 1 — Trade setup.
 *
 * Every value here is read straight from the risk engine's echo of the trader's
 * own inputs. Nothing is derived. `missing` names the required parameters that
 * were not supplied, so the panel can label them instead of blanking them.
 */
function buildSetup(risk) {
  const inputs = isObj(risk.inputs) ? risk.inputs : {};
  const asset = typeof risk.asset === 'string' ? risk.asset : '';
  const direction = typeof risk.direction === 'string' ? risk.direction : '';

  const entryPrice = num(inputs.entryPrice);
  const invalidationPrice = num(inputs.invalidationPrice);
  const riskAmount = num(inputs.riskAmount);
  const confidence = num(inputs.confidence);
  const timeframe = inputs.timeframe || '';
  const existingPosition = inputs.existingPosition || '';

  return {
    asset,
    direction,
    side: risk.side || 'none',
    timeframe,
    entryPrice,
    invalidationPrice,
    riskAmount,
    confidence,
    existingPosition,
    // Named, required parameters that are absent. The panel labels these rather
    // than showing a plausible-looking default.
    missing: [
      !asset ? 'asset' : null,
      !direction ? 'direction' : null,
      entryPrice === null ? 'entryPrice' : null,
      invalidationPrice === null ? 'invalidationPrice' : null,
    ].filter(Boolean),
  };
}

/**
 * Section 2 — Risk structure.
 *
 * A read-only projection of the Phase 6 engine's numbers. Not one operation is
 * performed on them: they are copied. `complete` is the engine's own verdict on
 * whether a defined risk exists.
 */
function buildRiskStructure(risk) {
  const calc = isObj(risk.calculation) ? risk.calculation : null;
  const ready = risk.status === RISK_STATUS.READY && calc !== null;

  return {
    source: 'Phase 6 deterministic risk engine',
    reused: true,
    status: risk.status,
    statusLabel: risk.statusLabel || null,
    complete: ready,
    riskBudget: calc ? num(calc.riskBudget) : null,
    priceRiskPerUnit: calc ? num(calc.priceRiskPerUnit) : null,
    positionSize: calc ? num(calc.positionSize) : null,
    definedRisk: calc ? num(calc.definedRisk) : null,
    priceRiskPctOfEntry: calc ? num(calc.priceRiskPctOfEntry) : null,
    notionalValue: calc ? num(calc.notionalValue) : null,
    formula: isObj(risk.formula) ? risk.formula : {},
    reason: ready ? null : buildRiskStructureReason(risk),
  };
}

function buildRiskStructureReason(risk) {
  if (risk.available === false) {
    return risk.statusDetail || 'The risk engine could not be reached, so no defined risk exists to carry into the structure.';
  }
  if (risk.status === RISK_STATUS.INVALID) {
    return 'The risk engine found the entry and the invalidation inconsistent, so there is no defined risk to carry into the structure.';
  }
  return 'The risk engine could not calculate a defined risk because a required input is missing.';
}

/**
 * Section 3 — Thesis.
 *
 * The trader's own words, plus the Devil's Advocate's supporting/contradicting
 * context. The synthesis is deliberately concise: the lists are capped and the
 * full counts are exposed alongside, so nothing is hidden by the cap.
 */
function buildThesis(context, attack) {
  const text = typeof context.thesis === 'string' ? context.thesis.trim() : '';
  const usable = isObj(attack) && attack.available !== false;

  const supporting = usable && Array.isArray(attack.supporting) ? attack.supporting : [];
  const contradicting = usable && Array.isArray(attack.contradicting) ? attack.contradicting : [];

  return {
    text,
    present: text.length > 0,
    available: usable,
    reason: usable
      ? null
      : (isObj(attack) && attack.reason) || 'The Devil\'s Advocate analysis is unavailable for this trade.',
    dataLimited: usable ? Boolean(attack.dataLimited) : true,
    interpretation: usable ? attack.interpretation || null : null,
    interpretationNote: usable ? attack.interpretationNote || null : null,
    evidenceStrength: usable && isObj(attack.evidenceStrength) ? attack.evidenceStrength : null,
    supporting: supporting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    supportingTotal: supporting.length,
    supportingShown: Math.min(supporting.length, MAX_EVIDENCE_ITEMS),
    contradicting: contradicting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    contradictingTotal: contradicting.length,
    contradictingShown: Math.min(contradicting.length, MAX_EVIDENCE_ITEMS),
  };
}

/**
 * Section 4 — Invalidation & conditions.
 *
 * `traderInvalidation` is the ONE price level that defines the trade's risk, and
 * it is the trader's own. The Devil's Advocate's invalidation conditions are
 * carried through verbatim as CONDITIONS — they are never converted into exit
 * prices, because that would invent a level the trader did not supply.
 */
function buildConditions(setup, attack) {
  const usable = isObj(attack) && attack.available !== false;

  const conditions = usable && Array.isArray(attack.invalidationConditions) ? attack.invalidationConditions : [];
  const risks = usable && Array.isArray(attack.keyRisks) ? attack.keyRisks : [];
  const assumptions = usable && Array.isArray(attack.assumptions) ? attack.assumptions : [];
  const missing = usable && Array.isArray(attack.missingInformation) ? attack.missingInformation : [];

  return {
    available: usable,
    reason: usable
      ? null
      : (isObj(attack) && attack.reason) || 'The Devil\'s Advocate findings are unavailable for this trade.',
    traderInvalidation: setup.invalidationPrice,
    traderInvalidationNote:
      'This is the only price level that defines the risk on this trade, and it is the level you supplied. ' +
      'TradeGuard did not choose it and will not move it.',
    invalidationConditions: conditions.map((c) => ({ title: c.title, detail: c.detail })),
    invalidationConditionsNote:
      'These are the conditions the Devil\'s Advocate identified as weakening the thesis. They are ' +
      'conditions, not exit prices — do not read a level into them unless you supplied one.',
    keyRisks: risks.slice(0, MAX_KEY_RISKS).map(pickEvidence),
    keyRisksTotal: risks.length,
    keyRisksShown: Math.min(risks.length, MAX_KEY_RISKS),
    assumptions: assumptions.map((a) => String(a)),
    missingInformation: missing.map(pickEvidence),
  };
}

/**
 * The aggregated, blocking gaps. These come from the risk engine (which already
 * names exactly which input is missing) plus the asset, which the engine does not
 * check but without which the trade is not identifiable. A missing timeframe is
 * reported too, but as non-blocking: it narrows the thesis rather than stopping
 * the structure.
 */
function buildMissingInformation(setup, risk) {
  const gaps = [];

  if (!setup.asset) {
    gaps.push({
      id: 'structure-asset',
      title: 'Asset',
      detail: 'No asset was supplied, so the trade cannot be identified. The structure cannot be completed without it.',
      blocking: true,
    });
  }

  const engineGaps = Array.isArray(risk.missingInformation) ? risk.missingInformation : [];
  for (const gap of engineGaps) {
    gaps.push({
      id: gap.id,
      title: gap.title,
      detail: gap.detail,
      blocking: true,
    });
  }

  if (!setup.timeframe) {
    gaps.push({
      id: 'structure-timeframe',
      title: 'Timeframe',
      detail:
        'No timeframe was supplied. The structure is still complete without it, but invalidation conditions and holding assumptions are less precise.',
      blocking: false,
    });
  }

  return gaps;
}

function buildStatusDetail(status, risk, blockers) {
  if (status === STRUCTURE_STATUS.COMPLETE) {
    return (
      'Every parameter the structure needs is present and the risk assessment produced a defined risk. ' +
      'The trade is fully structured — which says nothing about whether it is worth taking.'
    );
  }

  const parts = [];
  if (blockers.length) {
    parts.push(`Missing or unusable: ${blockers.map((b) => b.title.toLowerCase()).join(', ')}.`);
  }
  if (risk.status === RISK_STATUS.INVALID) {
    parts.push(
      'The risk assessment also found the entry and the invalidation inconsistent, so the structure carries no defined risk.'
    );
  } else if (risk.status === RISK_STATUS.INCOMPLETE && blockers.length === 0) {
    parts.push('The risk assessment could not produce a defined risk.');
  }

  return `The trade is not fully structured. ${parts.join(' ')}`.trim();
}

/**
 * Non-blocking caveats: things that did not stop the structure being built but
 * that the trader must see next to the status. Kept separate from `limitations`
 * so they read as "what is thin about THIS plan" rather than general caveats.
 */
function buildCaveats(risk, attack) {
  const caveats = [];

  if (!isObj(attack) || attack.available === false) {
    caveats.push(
      'The Devil\'s Advocate findings were not available, so this structure carries no thesis conditions, ' +
        'key risks or assumptions.'
    );
  }
  if (risk.status !== RISK_STATUS.READY) {
    caveats.push(
      'The risk assessment produced no defined risk, so the risk structure section is empty. Nothing has ' +
        'been assumed in its place.'
    );
  }

  return caveats;
}

function buildLimitations(risk, attack) {
  const limitations = [...STRUCTURE_LIMITATIONS];

  if (risk.status !== RISK_STATUS.READY) {
    limitations.push(STRUCTURE_NO_RISK_NOTE);
  }
  if (!isObj(attack) || attack.available === false) {
    limitations.push(STRUCTURE_NO_CONDITIONS_NOTE);
  }

  return limitations;
}

// --- public API -------------------------------------------------------------

/**
 * Build the structured trade plan.
 *
 * Pure: same input -> same output. No I/O, no clock beyond the caller's stamp.
 *
 * @param {object} context  the submitted trade context
 * @param {object} risk     the Phase 6 risk engine result (reused unchanged)
 * @param {object|null} attack the Phase 4 Devil's Advocate result, when available
 */
export function buildTradeStructure(context, risk, attack) {
  const src = isObj(context) ? context : {};
  const setup = buildSetup(risk);
  const riskStructure = buildRiskStructure(risk);
  const thesis = buildThesis(src, attack);
  const conditions = buildConditions(setup, attack);
  const missingInformation = buildMissingInformation(setup, risk);

  const blockers = missingInformation.filter((m) => m.blocking);
  const status =
    riskStructure.complete && blockers.length === 0 ? STRUCTURE_STATUS.COMPLETE : STRUCTURE_STATUS.INCOMPLETE;

  return {
    available: true,
    status,
    statusLabel: STRUCTURE_STATUS_LABELS[status],
    statusDetail: buildStatusDetail(status, risk, blockers),

    asset: setup.asset,
    direction: setup.direction,
    side: setup.side,
    timeframe: setup.timeframe,

    // The four sections of the plan, in the order they are presented.
    setup,
    riskStructure,
    thesis,
    conditions,

    // The Phase 6 result itself, embedded verbatim so the panel can cross-link
    // to it without a second call and without any chance of divergence.
    risk,

    missingInformation,
    caveats: buildCaveats(risk, attack),
    limitations: buildLimitations(risk, attack),
    method: STRUCTURE_METHOD_NOTE,
    disclaimer: STRUCTURE_DISCLAIMER,
  };
}

/**
 * Entry point used by the API route.
 *
 * The risk leg is resolved by CALLING the Phase 6 engine, unless the caller
 * passes a genuine engine result — in which case that result is reused verbatim.
 * Either way there is exactly one implementation of the risk arithmetic, and the
 * structure can never disagree with the Risk Assessment panel.
 *
 * @param {object} context the submitted trade context
 * @param {object} [sources]
 * @param {object} [sources.risk]   a Phase 6 risk result to reuse
 * @param {object} [sources.attack] a Phase 4 Devil's Advocate result
 */
export function runTradeStructure(context, sources = {}) {
  const src = isObj(context) ? context : {};
  const provided = isObj(sources) ? sources : {};

  const risk = isReusableRisk(provided.risk) ? provided.risk : runRiskAssessment(src);
  const attack = isObj(provided.attack) ? provided.attack : null;

  const structure = buildTradeStructure(src, risk, attack);

  return {
    ...structure,
    asset: structure.asset || (typeof src.asset === 'string' ? src.asset.trim().toUpperCase() : ''),
    generatedAt: new Date().toISOString(),
  };
}

/** Honest unavailable state when the structure cannot be produced at all. */
export function emptyStructure(reason) {
  const detail = reason || 'The trade structure could not be produced.';
  return {
    available: false,
    status: STRUCTURE_STATUS.UNAVAILABLE,
    statusLabel: STRUCTURE_STATUS_LABELS.unavailable,
    statusDetail: detail,
    asset: '',
    direction: '',
    side: 'none',
    timeframe: '',
    setup: { asset: '', direction: '', side: 'none', timeframe: '', entryPrice: null, invalidationPrice: null, riskAmount: null, confidence: null, existingPosition: '', missing: [] },
    riskStructure: {
      source: 'Phase 6 deterministic risk engine',
      reused: true,
      status: STRUCTURE_STATUS.UNAVAILABLE,
      statusLabel: null,
      complete: false,
      riskBudget: null,
      priceRiskPerUnit: null,
      positionSize: null,
      definedRisk: null,
      priceRiskPctOfEntry: null,
      notionalValue: null,
      formula: {},
      reason: detail,
    },
    thesis: {
      text: '',
      present: false,
      available: false,
      reason: detail,
      dataLimited: true,
      interpretation: null,
      interpretationNote: null,
      evidenceStrength: null,
      supporting: [],
      supportingTotal: 0,
      supportingShown: 0,
      contradicting: [],
      contradictingTotal: 0,
      contradictingShown: 0,
    },
    conditions: {
      available: false,
      reason: detail,
      traderInvalidation: null,
      traderInvalidationNote: '',
      invalidationConditions: [],
      invalidationConditionsNote: '',
      keyRisks: [],
      keyRisksTotal: 0,
      keyRisksShown: 0,
      assumptions: [],
      missingInformation: [],
    },
    risk: null,
    missingInformation: [],
    caveats: [],
    limitations: [...STRUCTURE_LIMITATIONS],
    method: STRUCTURE_METHOD_NOTE,
    disclaimer: STRUCTURE_DISCLAIMER,
  };
}
