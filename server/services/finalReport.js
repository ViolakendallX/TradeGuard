/**
 * Deterministic final-report synthesis service (Phase 8).
 *
 * Purpose: answer "given everything the investigation has already produced, what
 * is the whole picture for this trade?"
 *
 * This module is a SYNTHESIS. It is the last stage of the investigation and it
 * introduces NO new analysis of any kind. Every value it emits is copied from a
 * result an earlier phase already produced:
 *
 *   - the trader's own parameters, from the submitted context and the Phase 6
 *     engine's echo of them;
 *   - the Phase 3 market and event research;
 *   - the Phase 4 Devil's Advocate findings;
 *   - the Phase 5 historical stress test;
 *   - the Phase 6 risk calculation;
 *   - the Phase 7 trade structure.
 *
 * Specifically, it NEVER:
 *   - re-implements the risk arithmetic. priceRiskPerUnit / positionSize /
 *     definedRisk are read out of the Phase 6 result verbatim. There is exactly
 *     one implementation of that arithmetic in the codebase and this is not it.
 *   - re-implements the historical analysis. No statistic is computed here — no
 *     move, no excursion, no frequency, no summary. The Phase 5 result is
 *     projected, not recalculated.
 *   - re-implements the thesis attack. The strongest counterargument, the
 *     supporting and contradicting evidence, the key risks, the invalidation
 *     conditions and the evidence strength are all read out of the Phase 4
 *     result. It never generates a new counterargument.
 *   - fabricates evidence. A provider being unreachable produces an explicit
 *     AVAILABLE / PARTIAL / UNAVAILABLE marker with the original reason, never
 *     generic market commentary, an invented statistic, an assumed price, or a
 *     made-up historical outcome.
 *   - makes the decision. There is no BUY, SELL, PASS, TAKE THE TRADE, a
 *     trade-quality score, a probability of success, an expected return, a
 *     predicted price, or any other verdict. Phase 9 handles the human decision;
 *     this module only assembles what the trader needs in order to decide.
 *
 * Output: a structured, frontend-safe object (see runFinalReport).
 */

import { runRiskAssessment, RISK_STATUS } from './riskEngine.js';

/**
 * Report states.
 *   ready       — the investigation produced enough to assemble a report.
 *   incomplete  — the report was assembled but a required piece is missing, so
 *                 the picture is genuinely partial. Still shown, still honest.
 *   unavailable — the report could not be assembled at all.
 *
 * Note that "ready" does NOT mean the investigation found good news. It means
 * the report itself could be produced, with each section's own availability
 * stated truthfully. A report with market data unavailable can still be ready.
 */
export const REPORT_STATUS = Object.freeze({
  READY: 'ready',
  INCOMPLETE: 'incomplete',
  UNAVAILABLE: 'unavailable',
});

/** Human-facing status labels. Deliberately not a verdict. */
export const REPORT_STATUS_LABELS = Object.freeze({
  ready: 'REPORT READY',
  incomplete: 'REPORT INCOMPLETE',
  unavailable: 'REPORT UNAVAILABLE',
});

/**
 * The three availability markers used for every piece of underlying evidence.
 * This is the vocabulary the report uses to distinguish what it actually has.
 */
export const EVIDENCE_STATE = Object.freeze({
  AVAILABLE: 'available',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
});

export const EVIDENCE_STATE_LABELS = Object.freeze({
  available: 'AVAILABLE',
  partial: 'PARTIAL',
  unavailable: 'UNAVAILABLE',
});

/**
 * The product boundary, shipped with every response so the UI cannot omit it and
 * the frontend never has to paraphrase it.
 */
export const DECISION_BOUNDARY =
  'The report summarises the trade and the evidence available. The final decision remains with the trader.';

export const DECISION_BOUNDARY_DETAIL =
  'TradeGuard has gathered the research, attacked the thesis, compared it with history, calculated the risk ' +
  'implied by your own levels and assembled the trade into one structure. It has not decided anything. It ' +
  'does not tell you to buy, to sell, or to pass, it does not score the trade, and it does not estimate the ' +
  'chance of it working. What to do with this trade is your call, and the next phase is where you record it.';

export const REPORT_METHOD_NOTE =
  'This report is a synthesis of the earlier investigation stages. Each section restates the result that ' +
  'stage already produced — the research that was retrieved, the attack that was run, the history that was ' +
  'matched, the risk that was calculated and the structure that was assembled. Nothing is recalculated here, ' +
  'and where a stage could not retrieve what it needed, the report says so instead of filling the gap.';

export const REPORT_DISCLAIMER =
  'This is a summary of the investigation into your trade. It is not a trading instruction and it does not ' +
  'judge whether the trade is worth taking. The decision remains yours.';

/** Non-negotiable caveats. Always returned, so the UI cannot omit them. */
export const REPORT_LIMITATIONS = Object.freeze([
  'The report contains no new analysis. Every section restates a finding an earlier stage already produced, ' +
    'and the numbers are the earlier stages\' own numbers, reused unchanged.',
  'The risk figures come from the Phase 6 deterministic risk engine and are calculated from the entry, ' +
    'invalidation and risk budget you supplied. They are not predictions, and they are not verified against ' +
    'the market.',
  'Historical observations are a description of the past, not a forecast. Nothing in the historical section ' +
    'says this trade will behave the same way, and no probability, win rate or expected return is derived ' +
    'from the matched setups.',
  'A section marked UNAVAILABLE means the data behind it could not be retrieved. TradeGuard does not ' +
    'substitute generic commentary, assumed prices or invented facts for evidence it does not have.',
  'This report describes the trade and the evidence. It does not recommend, score or rank the trade, and it ' +
    'does not decide whether to take it.',
]);

/** Added when a research provider could not be reached. */
export const REPORT_MARKET_UNAVAILABLE_NOTE =
  'Market context could not be retrieved, so the report carries no price, trend, volatility or volume ' +
  'readings. TradeGuard does not substitute the last known price or generic commentary for live market data.';

/** Added when the events provider could not be reached. */
export const REPORT_EVENTS_UNAVAILABLE_NOTE =
  'Event and catalyst data could not be retrieved, so the report carries no upcoming catalysts. Nothing has ' +
  'been invented in their place.';

/** Added when the historical series could not be retrieved. */
export const REPORT_HISTORY_UNAVAILABLE_NOTE =
  'The historical stress test produced no usable sample, so the report carries no observed past outcomes. ' +
  'TradeGuard does not estimate what happened or invent comparable setups.';

/** How many items of each list the consolidated report carries. */
const MAX_EVIDENCE_ITEMS = 3;
const MAX_RISKS = 4;
const MAX_WARNINGS = 4;

// --- small helpers ----------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
 * Section 1 — Executive summary.
 *
 * The trader's own parameters, taken from the Phase 6 engine's echo of the
 * submission, plus the overall investigation status. Factual only: no adjective,
 * no judgement, no recommendation.
 */
function buildExecutiveSummary(risk) {
  const inputs = isObj(risk.inputs) ? risk.inputs : {};

  return {
    asset: typeof risk.asset === 'string' ? risk.asset : '',
    direction: typeof risk.direction === 'string' ? risk.direction : '',
    side: risk.side || 'none',
    timeframe: inputs.timeframe || '',
    entryPrice: num(inputs.entryPrice),
    invalidationPrice: num(inputs.invalidationPrice),
    riskAmount: num(inputs.riskAmount),
    confidence: num(inputs.confidence),
    existingPosition: inputs.existingPosition || '',
    // Named, required parameters that are absent. The panel labels these rather
    // than showing a plausible-looking default.
    missing: [
      !(typeof risk.asset === 'string' && risk.asset) ? 'asset' : null,
      !(typeof risk.direction === 'string' && risk.direction) ? 'direction' : null,
      num(inputs.entryPrice) === null ? 'entryPrice' : null,
      num(inputs.invalidationPrice) === null ? 'invalidationPrice' : null,
    ].filter(Boolean),
  };
}

/**
 * Section 2 — Trade thesis.
 *
 * Two distinct things, deliberately kept apart:
 *   - `traderThesis`     — the trader's own words, untouched.
 *   - `interpretation`   — how TradeGuard read those words, which is a Phase 4
 *                          output and is labelled as an interpretation.
 */
function buildThesis(context, attack) {
  const text = typeof context.thesis === 'string' ? context.thesis.trim() : '';
  const usable = isObj(attack) && attack.available !== false;

  const supporting = usable && Array.isArray(attack.supporting) ? attack.supporting : [];
  const contradicting = usable && Array.isArray(attack.contradicting) ? attack.contradicting : [];

  return {
    traderThesis: text,
    traderThesisPresent: text.length > 0,
    state: usable ? (attack.dataLimited ? EVIDENCE_STATE.PARTIAL : EVIDENCE_STATE.AVAILABLE) : EVIDENCE_STATE.UNAVAILABLE,
    reason: usable
      ? null
      : (isObj(attack) && (attack.reason || attack.statusDetail)) ||
        'The Devil\'s Advocate analysis is unavailable for this trade.',
    dataLimited: usable ? Boolean(attack.dataLimited) : true,
    interpretation: usable ? attack.interpretation || null : null,
    interpretationNote: usable ? attack.interpretationNote || null : null,
    evidenceStrength: usable && isObj(attack.evidenceStrength) ? attack.evidenceStrength : null,
    summary: usable && typeof attack.summary === 'string' ? attack.summary : null,
    supporting: supporting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    supportingTotal: supporting.length,
    supportingShown: Math.min(supporting.length, MAX_EVIDENCE_ITEMS),
    contradicting: contradicting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    contradictingTotal: contradicting.length,
    contradictingShown: Math.min(contradicting.length, MAX_EVIDENCE_ITEMS),
  };
}

/**
 * Section 3 — Market context.
 *
 * A read-only projection of the Phase 3 market result. When it is unavailable
 * the ORIGINAL reason is carried through verbatim; the report never writes its
 * own explanation of why a provider failed, and never substitutes a stale price.
 */
function buildMarketContext(market) {
  const m = isObj(market) ? market : null;

  if (!m || m.available === false) {
    return {
      state: EVIDENCE_STATE.UNAVAILABLE,
      reason: (m && m.reason) || 'Market context could not be retrieved.',
      source: (m && m.source) || null,
      symbol: (m && m.symbol) || null,
      readings: null,
    };
  }

  return {
    state: m.partial ? EVIDENCE_STATE.PARTIAL : EVIDENCE_STATE.AVAILABLE,
    reason: null,
    source: m.source || null,
    symbol: m.symbol || null,
    // Copied field by field. Nothing is derived from these values.
    readings: {
      price: num(m.price),
      currency: m.currency || null,
      changeSinceOpenPct: num(m.changeSinceOpenPct),
      change24hPct: num(m.change24hPct),
      high24h: num(m.high24h),
      low24h: num(m.low24h),
      baseVolume: num(m.baseVolume),
      quoteVolume: num(m.quoteVolume),
      volatilityPct: num(m.volatilityPct),
      trendPercent: num(m.trendPercent),
      trendDirection: m.trendDirection || null,
      timestamp: m.timestamp || null,
    },
  };
}

/**
 * Section 4 — Events & catalysts.
 *
 * A read-only projection of the Phase 3 events result. The items are copied
 * through unchanged so the report cannot drift from the Events panel.
 */
function buildEvents(events) {
  const e = isObj(events) ? events : null;

  if (!e || e.available === false) {
    return {
      state: EVIDENCE_STATE.UNAVAILABLE,
      reason: (e && e.reason) || 'Event and catalyst data could not be retrieved.',
      source: (e && e.source) || null,
      symbol: (e && e.symbol) || null,
      items: [],
      itemCount: 0,
    };
  }

  const items = Array.isArray(e.items) ? e.items : [];

  return {
    state: e.partial ? EVIDENCE_STATE.PARTIAL : EVIDENCE_STATE.AVAILABLE,
    reason: null,
    source: e.source || null,
    symbol: e.symbol || null,
    items: items.slice(0, MAX_EVIDENCE_ITEMS).map((it) => ({ ...it })),
    itemCount: items.length,
    itemsShown: Math.min(items.length, MAX_EVIDENCE_ITEMS),
  };
}

/**
 * Section 5 — Devil's Advocate.
 *
 * The Phase 4 result, restated. `strongestCounterargument` is carried through as
 * the attack produced it — this module never writes a new one. The evidence
 * lists are capped for a scannable summary, with the full counts exposed so
 * nothing is hidden by the cap.
 */
function buildDevilsAdvocate(attack) {
  const a = isObj(attack) ? attack : null;
  const usable = a !== null && a.available !== false;

  if (!usable) {
    return {
      state: EVIDENCE_STATE.UNAVAILABLE,
      reason: (a && (a.reason || a.statusDetail)) || 'The Devil\'s Advocate analysis is unavailable for this trade.',
      dataLimited: true,
      strongestCounterargument: null,
      evidenceStrength: null,
      summary: null,
      supporting: [],
      supportingTotal: 0,
      supportingShown: 0,
      contradicting: [],
      contradictingTotal: 0,
      contradictingShown: 0,
      keyRisks: [],
      keyRisksTotal: 0,
      keyRisksShown: 0,
      invalidationConditions: [],
      assumptions: [],
      missingInformation: [],
    };
  }

  const supporting = Array.isArray(a.supporting) ? a.supporting : [];
  const contradicting = Array.isArray(a.contradicting) ? a.contradicting : [];
  const keyRisks = Array.isArray(a.keyRisks) ? a.keyRisks : [];
  const conditions = Array.isArray(a.invalidationConditions) ? a.invalidationConditions : [];
  const assumptions = Array.isArray(a.assumptions) ? a.assumptions : [];
  const missing = Array.isArray(a.missingInformation) ? a.missingInformation : [];

  return {
    state: a.dataLimited ? EVIDENCE_STATE.PARTIAL : EVIDENCE_STATE.AVAILABLE,
    reason: null,
    dataLimited: Boolean(a.dataLimited),
    strongestCounterargument: isObj(a.strongestCounterargument) ? { ...a.strongestCounterargument } : null,
    evidenceStrength: isObj(a.evidenceStrength) ? { ...a.evidenceStrength } : null,
    summary: typeof a.summary === 'string' ? a.summary : null,
    supporting: supporting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    supportingTotal: supporting.length,
    supportingShown: Math.min(supporting.length, MAX_EVIDENCE_ITEMS),
    contradicting: contradicting.slice(0, MAX_EVIDENCE_ITEMS).map(pickEvidence),
    contradictingTotal: contradicting.length,
    contradictingShown: Math.min(contradicting.length, MAX_EVIDENCE_ITEMS),
    keyRisks: keyRisks.slice(0, MAX_RISKS).map(pickEvidence),
    keyRisksTotal: keyRisks.length,
    keyRisksShown: Math.min(keyRisks.length, MAX_RISKS),
    // Carried through as CONDITIONS. Never converted into an exit price.
    invalidationConditions: conditions.map((c) => ({ title: c.title, detail: c.detail })),
    assumptions: assumptions.map((x) => String(x)),
    missingInformation: missing.map(pickEvidence),
  };
}

/**
 * Section 6 — Historical stress test.
 *
 * A read-only projection of the Phase 5 result. The sample counts and the
 * observed outcomes are copied — not computed — and the phase's own
 * non-predictive framing is carried alongside them. Nothing here is expressed as
 * a probability, a win rate or an expected return.
 */
function buildHistorical(history) {
  const h = isObj(history) ? history : null;

  if (!h || h.available === false) {
    return {
      state: EVIDENCE_STATE.UNAVAILABLE,
      reason: (h && (h.reason || h.statusDetail)) || 'Historical data could not be retrieved.',
      status: (h && h.status) || null,
      statusLabel: (h && h.statusLabel) || null,
      matchedCount: null,
      sampleSize: null,
      observations: [],
      observationsShown: 0,
      outcomeSummary: null,
      matchFrequencyPct: null,
      matchFrequencyNote: null,
      profile: null,
      limitations: [],
    };
  }

  const observations = Array.isArray(h.observations) ? h.observations : [];
  const partial = Boolean(h.dataLimited);

  return {
    state: partial ? EVIDENCE_STATE.PARTIAL : EVIDENCE_STATE.AVAILABLE,
    reason: partial ? (h.statusLabel || 'Partial / data-limited.') : null,
    status: h.status || null,
    statusLabel: h.statusLabel || null,
    dataLimited: partial,
    matchedCount: num(h.matchedCount),
    eligibleCandidates: num(h.eligibleCandidates),
    sampleSize: num(h.sampleSize),
    profile: isObj(h.profile) ? { ...h.profile } : null,
    timeframeAssumed: Boolean(h.timeframeAssumed),
    sampleFrom: h.sampleFrom || null,
    sampleTo: h.sampleTo || null,
    // Copied through unchanged. This report adds no statistic of its own.
    observations: observations.slice(0, MAX_EVIDENCE_ITEMS).map((o) => ({ ...o })),
    observationsShown: Math.min(observations.length, MAX_EVIDENCE_ITEMS),
    observationsTotal: observations.length,
    outcomeSummary: isObj(h.outcomeSummary) ? { ...h.outcomeSummary } : null,
    matchFrequencyPct: num(h.matchFrequencyPct),
    matchFrequencyNote: h.matchFrequencyNote || null,
    limitations: Array.isArray(h.limitations) ? [...h.limitations] : [],
  };
}

/**
 * Section 7 — Risk assessment.
 *
 * A read-only projection of the Phase 6 engine's numbers. Not one operation is
 * performed on them: they are copied. `reused: true` is stated explicitly so the
 * UI can say plainly that these came from the risk engine.
 */
function buildRisk(risk) {
  const calc = isObj(risk.calculation) ? risk.calculation : null;
  const ready = risk.status === RISK_STATUS.READY && calc !== null;
  const inputs = isObj(risk.inputs) ? risk.inputs : {};

  const missing = Array.isArray(risk.missingInformation) ? risk.missingInformation : [];
  const warnings = Array.isArray(risk.warnings) ? risk.warnings : [];

  return {
    source: 'Phase 6 deterministic risk engine',
    reused: true,
    status: risk.status,
    statusLabel: risk.statusLabel || null,
    statusDetail: risk.statusDetail || null,
    ready,
    state: risk.available === false
      ? EVIDENCE_STATE.UNAVAILABLE
      : ready
      ? EVIDENCE_STATE.AVAILABLE
      : EVIDENCE_STATE.PARTIAL,
    reason: ready ? null : buildRiskReason(risk),
    entryPrice: num(inputs.entryPrice),
    invalidationPrice: num(inputs.invalidationPrice),
    riskBudget: calc ? num(calc.riskBudget) : num(inputs.riskAmount),
    priceRiskPerUnit: calc ? num(calc.priceRiskPerUnit) : null,
    positionSize: calc ? num(calc.positionSize) : null,
    definedRisk: calc ? num(calc.definedRisk) : null,
    priceRiskPctOfEntry: calc ? num(calc.priceRiskPctOfEntry) : null,
    notionalValue: calc ? num(calc.notionalValue) : null,
    formula: isObj(risk.formula) ? { ...risk.formula } : {},
    interpretation: typeof risk.interpretation === 'string' ? risk.interpretation : null,
    missingInformation: missing.map((m) => ({ id: m.id, title: m.title, detail: m.detail })),
    warnings: warnings.slice(0, MAX_WARNINGS).map((w) => ({ id: w.id, title: w.title, detail: w.detail })),
    warningsTotal: warnings.length,
    limitations: Array.isArray(risk.limitations) ? [...risk.limitations] : [],
    disclaimer: risk.disclaimer || null,
  };
}

function buildRiskReason(risk) {
  if (risk.available === false) {
    return risk.statusDetail || 'The risk engine could not be reached, so no defined risk exists.';
  }
  if (risk.status === RISK_STATUS.INVALID) {
    return 'The risk engine found the entry and the invalidation inconsistent, so there is no defined risk.';
  }
  return 'The risk engine could not calculate a defined risk because a required input is missing.';
}

/**
 * Section 8 — Trade structure.
 *
 * A read-only projection of the Phase 7 result. It is deliberately NOT a copy of
 * the whole structure: the report restates the substance (the setup, the risk
 * figures, the conditions, the caveats) and points at the Trade Structure stage
 * for the full detail, so the two panels cannot diverge.
 */
function buildStructure(structure) {
  const s = isObj(structure) ? structure : null;

  if (!s || s.available === false) {
    return {
      state: EVIDENCE_STATE.UNAVAILABLE,
      reason: (s && (s.statusDetail || s.reason)) || 'The trade structure could not be produced.',
      status: null,
      statusLabel: null,
      complete: false,
      setup: null,
      riskStructure: null,
      invalidationConditions: [],
      invalidationConditionsTotal: 0,
      keyRisks: [],
      keyRisksTotal: 0,
      assumptions: [],
      missingInformation: [],
      caveats: [],
    };
  }

  const setup = isObj(s.setup) ? s.setup : null;
  const rs = isObj(s.riskStructure) ? s.riskStructure : null;
  const conditions = isObj(s.conditions) ? s.conditions : {};
  const conds = Array.isArray(conditions.invalidationConditions) ? conditions.invalidationConditions : [];
  const risks = Array.isArray(conditions.keyRisks) ? conditions.keyRisks : [];
  const assumptions = Array.isArray(conditions.assumptions) ? conditions.assumptions : [];
  const missing = Array.isArray(s.missingInformation) ? s.missingInformation : [];

  const complete = s.status === 'complete';

  return {
    state: complete ? EVIDENCE_STATE.AVAILABLE : EVIDENCE_STATE.PARTIAL,
    reason: complete ? null : s.statusDetail || null,
    status: s.status || null,
    statusLabel: s.statusLabel || null,
    complete,
    // A concise restatement, not the whole plan.
    setup: setup
      ? {
          asset: setup.asset || '',
          direction: setup.direction || '',
          side: setup.side || 'none',
          timeframe: setup.timeframe || '',
          entryPrice: num(setup.entryPrice),
          invalidationPrice: num(setup.invalidationPrice),
          confidence: num(setup.confidence),
          existingPosition: setup.existingPosition || '',
        }
      : null,
    riskStructure: rs
      ? {
          complete: Boolean(rs.complete),
          riskBudget: num(rs.riskBudget),
          priceRiskPerUnit: num(rs.priceRiskPerUnit),
          positionSize: num(rs.positionSize),
          definedRisk: num(rs.definedRisk),
          reason: rs.reason || null,
        }
      : null,
    // Conditions, never exit prices.
    invalidationConditions: conds.map((c) => ({ title: c.title, detail: c.detail })),
    invalidationConditionsTotal: conds.length,
    keyRisks: risks.slice(0, MAX_RISKS).map(pickEvidence),
    keyRisksTotal: risks.length,
    keyRisksShown: Math.min(risks.length, MAX_RISKS),
    assumptions: assumptions.map((x) => String(x)),
    missingInformation: missing.map((m) => ({ id: m.id, title: m.title, detail: m.detail, blocking: Boolean(m.blocking) })),
    caveats: Array.isArray(s.caveats) ? [...s.caveats] : [],
  };
}

/**
 * Section 9 — Information gaps & limitations.
 *
 * ONE consolidated list, assembled from the gaps the earlier stages actually
 * reported. Each entry names the stage it came from. Nothing is added here: if a
 * stage did not report a gap, the report does not invent one, and if every stage
 * was complete the section says so rather than padding itself with generic
 * caveats.
 */
function buildGaps({ market, events, history, attack, risk, structure }) {
  const gaps = [];

  if (market.state === EVIDENCE_STATE.UNAVAILABLE || market.state === EVIDENCE_STATE.PARTIAL) {
    gaps.push({
      id: 'market-context',
      stage: 'Market context',
      phase: 3,
      state: market.state,
      title: market.state === EVIDENCE_STATE.UNAVAILABLE ? 'Market data unavailable' : 'Market data partial',
      detail: market.reason || 'Some market readings could not be derived.',
    });
  }

  if (events.state === EVIDENCE_STATE.UNAVAILABLE || events.state === EVIDENCE_STATE.PARTIAL) {
    gaps.push({
      id: 'events-catalysts',
      stage: 'Events & catalysts',
      phase: 3,
      state: events.state,
      title: events.state === EVIDENCE_STATE.UNAVAILABLE ? 'Event data unavailable' : 'Event data partial',
      detail: events.reason || 'Some event information could not be retrieved.',
    });
  }

  if (attack.state !== EVIDENCE_STATE.AVAILABLE) {
    gaps.push({
      id: 'devils-advocate',
      stage: "Devil's Advocate",
      phase: 4,
      state: attack.state,
      title: attack.state === EVIDENCE_STATE.UNAVAILABLE ? "Devil's Advocate unavailable" : "Devil's Advocate partial",
      detail:
        attack.reason ||
        'The attack ran, but without usable market or event data it could only report what it could not assess.',
    });
  }

  if (history.state !== EVIDENCE_STATE.AVAILABLE) {
    gaps.push({
      id: 'historical',
      stage: 'Historical stress test',
      phase: 5,
      state: history.state,
      title: history.state === EVIDENCE_STATE.UNAVAILABLE ? 'Historical data unavailable' : 'Historical sample partial',
      detail: history.reason || 'The historical comparison produced a limited or empty sample.',
    });
  }

  if (risk.state !== EVIDENCE_STATE.AVAILABLE) {
    gaps.push({
      id: 'risk',
      stage: 'Risk assessment',
      phase: 6,
      state: risk.state,
      title: risk.state === EVIDENCE_STATE.UNAVAILABLE ? 'Risk assessment unavailable' : 'No defined risk',
      detail: risk.reason || 'The risk engine did not produce a defined risk.',
    });
  }

  if (structure.state !== EVIDENCE_STATE.AVAILABLE) {
    gaps.push({
      id: 'structure',
      stage: 'Trade structure',
      phase: 7,
      state: structure.state,
      title:
        structure.state === EVIDENCE_STATE.UNAVAILABLE ? 'Trade structure unavailable' : 'Trade structure incomplete',
      detail: structure.reason || 'The trade structure is not complete.',
    });
  }

  return gaps;
}

/** The availability roll-up shown next to the report status. */
function summarizeEvidence({ market, events, attack, history, risk, structure }) {
  const sections = [
    { id: 'market-context', label: 'Market context', state: market.state },
    { id: 'events-catalysts', label: 'Events & catalysts', state: events.state },
    { id: 'devils-advocate', label: "Devil's Advocate", state: attack.state },
    { id: 'historical', label: 'Historical stress test', state: history.state },
    { id: 'risk', label: 'Risk assessment', state: risk.state },
    { id: 'structure', label: 'Trade structure', state: structure.state },
  ];

  return {
    sections,
    available: sections.filter((s) => s.state === EVIDENCE_STATE.AVAILABLE).length,
    partial: sections.filter((s) => s.state === EVIDENCE_STATE.PARTIAL).length,
    unavailable: sections.filter((s) => s.state === EVIDENCE_STATE.UNAVAILABLE).length,
    total: sections.length,
  };
}

function buildStatusDetail(status, summary, execSummary) {
  if (status === REPORT_STATUS.READY) {
    return (
      `Every investigation section produced a result: ${summary.available} available, ${summary.partial} partial, ` +
      `${summary.unavailable} unavailable. The report is complete as a summary — which says nothing about whether ` +
      'the trade is worth taking.'
    );
  }

  if (status === REPORT_STATUS.UNAVAILABLE) {
    return 'The report could not be assembled.';
  }

  const missing = execSummary.missing;
  const parts = [];
  if (missing.length) {
    parts.push(`Not supplied: ${missing.map(humanizeParam).join(', ')}.`);
  }
  if (summary.unavailable > 0) {
    parts.push(`${summary.unavailable} section${summary.unavailable === 1 ? '' : 's'} could not retrieve data.`);
  }
  if (summary.partial > 0) {
    parts.push(`${summary.partial} section${summary.partial === 1 ? '' : 's'} ran with limited data.`);
  }

  return `The report was assembled, but the investigation is not complete. ${parts.join(' ')}`.trim();
}

function humanizeParam(id) {
  const map = {
    asset: 'asset',
    direction: 'direction',
    entryPrice: 'entry price',
    invalidationPrice: 'invalidation price',
  };
  return map[id] || id;
}

/**
 * Non-blocking caveats: what is thin about THIS report, stated next to the
 * status so the trader sees it before reading the sections. Kept separate from
 * `limitations`, which describe the method rather than this trade.
 */
function buildCaveats({ market, events, attack, history, risk, structure }) {
  const caveats = [];

  if (market.state !== EVIDENCE_STATE.AVAILABLE) caveats.push(REPORT_MARKET_UNAVAILABLE_NOTE);
  if (events.state !== EVIDENCE_STATE.AVAILABLE) caveats.push(REPORT_EVENTS_UNAVAILABLE_NOTE);
  if (history.state !== EVIDENCE_STATE.AVAILABLE) caveats.push(REPORT_HISTORY_UNAVAILABLE_NOTE);

  if (attack.state !== EVIDENCE_STATE.AVAILABLE) {
    caveats.push(
      "The Devil's Advocate could not run against usable evidence, so the report carries no developed " +
        'counterargument, no classified evidence and no key risks. TradeGuard does not manufacture an attack ' +
        'to fill the section.'
    );
  }

  if (risk.state !== EVIDENCE_STATE.AVAILABLE) {
    caveats.push(
      'The risk assessment produced no defined risk, so the report carries no position size or defined-risk ' +
        'figure. Nothing has been assumed in its place.'
    );
  }

  if (structure.state !== EVIDENCE_STATE.AVAILABLE) {
    caveats.push(
      'The trade structure is not complete, so the consolidated plan is missing at least one parameter. The ' +
        'gaps are named in the sections below.'
    );
  }

  return caveats;
}

// --- public API -------------------------------------------------------------

/**
 * Assemble the final report from the results the earlier stages produced.
 *
 * Pure: same input -> same output. No I/O, and no clock beyond the caller's
 * stamp on the outer object.
 *
 * @param {object} context   the submitted trade context
 * @param {object} sources
 * @param {object|null} sources.market     Phase 3 market result
 * @param {object|null} sources.events     Phase 3 events result
 * @param {object|null} sources.attack     Phase 4 Devil's Advocate result
 * @param {object|null} sources.history    Phase 5 historical stress test result
 * @param {object}      sources.risk       Phase 6 risk result (reused verbatim)
 * @param {object|null} sources.structure  Phase 7 trade structure result
 */
export function buildFinalReport(context, sources = {}) {
  const src = isObj(context) ? context : {};
  const provided = isObj(sources) ? sources : {};

  const riskInput = isReusableRisk(provided.risk) ? provided.risk : runRiskAssessment(src);
  const attackInput = isObj(provided.attack) ? provided.attack : null;
  const historyInput = isObj(provided.history) ? provided.history : null;
  const structureInput = isObj(provided.structure) ? provided.structure : null;
  const marketInput = isObj(provided.market) ? provided.market : null;
  const eventsInput = isObj(provided.events) ? provided.events : null;

  const executiveSummary = buildExecutiveSummary(riskInput);
  const thesis = buildThesis(src, attackInput);
  const market = buildMarketContext(marketInput);
  const events = buildEvents(eventsInput);
  const devilsAdvocate = buildDevilsAdvocate(attackInput);
  const historical = buildHistorical(historyInput);
  const risk = buildRisk(riskInput);
  const structure = buildStructure(structureInput);

  const report = {
    executiveSummary,
    thesis,
    market,
    events,
    devilsAdvocate,
    historical,
    risk,
    structure,
  };

  const evidenceSummary = summarizeEvidence({
    market,
    events,
    attack: devilsAdvocate,
    history: historical,
    risk,
    structure,
  });

  const gaps = buildGaps({
    market,
    events,
    attack: devilsAdvocate,
    history: historical,
    risk,
    structure,
  });

  // The report is READY when the trade is identifiable and the risk leg — the one
  // piece every report needs in order to say anything concrete about risk — is
  // present. Provider outages do NOT make a report unavailable: they make its
  // sections honestly UNAVAILABLE, which is exactly the answer the trader needs.
  const reportable = Boolean(executiveSummary.asset) && risk.state === EVIDENCE_STATE.AVAILABLE;
  const gapsBlocking = gaps.filter((g) => g.state === EVIDENCE_STATE.UNAVAILABLE).length;
  const status = reportable && gapsBlocking === 0 ? REPORT_STATUS.READY : REPORT_STATUS.INCOMPLETE;

  return {
    available: true,
    status,
    statusLabel: REPORT_STATUS_LABELS[status],
    statusDetail: buildStatusDetail(status, evidenceSummary, executiveSummary),

    asset: executiveSummary.asset,
    direction: executiveSummary.direction,
    side: executiveSummary.side,
    timeframe: executiveSummary.timeframe,

    // The eight content sections, in the order they are presented.
    ...report,

    // The roll-up the status badge sits next to.
    evidenceSummary,
    gaps,

    // The Phase 6 result itself, embedded verbatim so the report can never
    // diverge from the Risk Assessment panel and needs no second call.
    riskResult: riskInput,

    caveats: buildCaveats({ market, events, attack: devilsAdvocate, history: historical, risk, structure }),
    limitations: [...REPORT_LIMITATIONS],
    method: REPORT_METHOD_NOTE,
    decisionBoundary: DECISION_BOUNDARY,
    decisionBoundaryDetail: DECISION_BOUNDARY_DETAIL,
    disclaimer: REPORT_DISCLAIMER,
  };
}

/**
 * Entry point used by the API route.
 *
 * Every earlier result the caller supplies is reused VERBATIM. The only thing
 * this function will compute is the risk leg, and only when the caller did not
 * supply one — in which case it CALLS the Phase 6 engine rather than
 * re-implementing it. So the Risk Engine stays the single source of truth for
 * the risk arithmetic either way.
 *
 * @param {object} context the submitted trade context
 * @param {object} [sources] the earlier stage results, as described on
 *                           buildFinalReport
 */
export function runFinalReport(context, sources = {}) {
  const src = isObj(context) ? context : {};
  const provided = isObj(sources) ? sources : {};

  const risk = isReusableRisk(provided.risk) ? provided.risk : runRiskAssessment(src);
  const attack = isObj(provided.attack) ? provided.attack : null;
  const history = isObj(provided.history) ? provided.history : null;
  const structure = isObj(provided.structure) ? provided.structure : null;
  const market = isObj(provided.market) ? provided.market : null;
  const events = isObj(provided.events) ? provided.events : null;

  const report = buildFinalReport(src, { market, events, attack, history, risk, structure });

  return {
    ...report,
    asset: report.asset || (typeof src.asset === 'string' ? src.asset.trim().toUpperCase() : ''),
    generatedAt: new Date().toISOString(),
  };
}

/** Honest unavailable state when the report cannot be produced at all. */
export function emptyReport(reason) {
  const detail = reason || 'The final report could not be assembled.';
  const emptyState = EVIDENCE_STATE.UNAVAILABLE;

  return {
    available: false,
    status: REPORT_STATUS.UNAVAILABLE,
    statusLabel: REPORT_STATUS_LABELS.unavailable,
    statusDetail: detail,
    asset: '',
    direction: '',
    side: 'none',
    timeframe: '',
    executiveSummary: {
      asset: '',
      direction: '',
      side: 'none',
      timeframe: '',
      entryPrice: null,
      invalidationPrice: null,
      riskAmount: null,
      confidence: null,
      existingPosition: '',
      missing: [],
    },
    thesis: {
      traderThesis: '',
      traderThesisPresent: false,
      state: emptyState,
      reason: detail,
      dataLimited: true,
      interpretation: null,
      interpretationNote: null,
      evidenceStrength: null,
      summary: null,
      supporting: [],
      supportingTotal: 0,
      supportingShown: 0,
      contradicting: [],
      contradictingTotal: 0,
      contradictingShown: 0,
    },
    market: { state: emptyState, reason: detail, source: null, symbol: null, readings: null },
    events: { state: emptyState, reason: detail, source: null, symbol: null, items: [], itemCount: 0 },
    devilsAdvocate: {
      state: emptyState,
      reason: detail,
      dataLimited: true,
      strongestCounterargument: null,
      evidenceStrength: null,
      summary: null,
      supporting: [],
      supportingTotal: 0,
      supportingShown: 0,
      contradicting: [],
      contradictingTotal: 0,
      contradictingShown: 0,
      keyRisks: [],
      keyRisksTotal: 0,
      keyRisksShown: 0,
      invalidationConditions: [],
      assumptions: [],
      missingInformation: [],
    },
    historical: {
      state: emptyState,
      reason: detail,
      status: null,
      statusLabel: null,
      matchedCount: null,
      sampleSize: null,
      observations: [],
      observationsShown: 0,
      outcomeSummary: null,
      matchFrequencyPct: null,
      matchFrequencyNote: null,
      profile: null,
      limitations: [],
    },
    risk: {
      source: 'Phase 6 deterministic risk engine',
      reused: true,
      status: null,
      statusLabel: null,
      statusDetail: detail,
      ready: false,
      state: emptyState,
      reason: detail,
      entryPrice: null,
      invalidationPrice: null,
      riskBudget: null,
      priceRiskPerUnit: null,
      positionSize: null,
      definedRisk: null,
      priceRiskPctOfEntry: null,
      notionalValue: null,
      formula: {},
      interpretation: null,
      missingInformation: [],
      warnings: [],
      warningsTotal: 0,
      limitations: [],
      disclaimer: null,
    },
    structure: {
      state: emptyState,
      reason: detail,
      status: null,
      statusLabel: null,
      complete: false,
      setup: null,
      riskStructure: null,
      invalidationConditions: [],
      invalidationConditionsTotal: 0,
      keyRisks: [],
      keyRisksTotal: 0,
      keyRisksShown: 0,
      assumptions: [],
      missingInformation: [],
      caveats: [],
    },
    evidenceSummary: {
      sections: [],
      available: 0,
      partial: 0,
      unavailable: 6,
      total: 6,
    },
    gaps: [],
    riskResult: null,
    caveats: [],
    limitations: [...REPORT_LIMITATIONS],
    method: REPORT_METHOD_NOTE,
    decisionBoundary: DECISION_BOUNDARY,
    decisionBoundaryDetail: DECISION_BOUNDARY_DETAIL,
    disclaimer: REPORT_DISCLAIMER,
  };
}
