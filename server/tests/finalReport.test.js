import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinalReport,
  runFinalReport,
  emptyReport,
  REPORT_STATUS,
  REPORT_STATUS_LABELS,
  EVIDENCE_STATE,
  EVIDENCE_STATE_LABELS,
  REPORT_LIMITATIONS,
  REPORT_METHOD_NOTE,
  REPORT_DISCLAIMER,
  DECISION_BOUNDARY,
  DECISION_BOUNDARY_DETAIL,
} from '../services/finalReport.js';
import { runRiskAssessment, assessRisk, RISK_STATUS } from '../services/riskEngine.js';
import { buildTradeStructure, runTradeStructure } from '../services/tradeStructure.js';

// --- fixtures ---------------------------------------------------------------

/** A coherent long setup: entry 100, invalidation 95, budget 50 -> 10 units. */
const LONG_OK = {
  asset: 'rNVDA',
  direction: 'bullish',
  thesis:
    'I think rNVDA will continue higher over the next few days because the current momentum is bullish and the price may continue to push higher if it holds above the key support area.',
  timeframe: 'swing',
  entryPrice: 100,
  invalidationPrice: 95,
  riskAmount: 50,
  confidence: 7,
  existingPosition: 'none',
};

/** A coherent short setup: entry 100, invalidation 105, budget 50 -> 10 units. */
const SHORT_OK = {
  asset: 'rNVDA',
  direction: 'bearish',
  thesis: 'Rejection at resistance with momentum rolling over and sellers in control.',
  timeframe: 'swing',
  entryPrice: 100,
  invalidationPrice: 105,
  riskAmount: 50,
  confidence: 6,
  existingPosition: 'none',
};

/** A Phase 3 market result, available. */
const MARKET_OK = {
  available: true,
  partial: false,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 102.4,
  currency: 'USDT',
  openUtc: 100.1,
  high24h: 103.5,
  low24h: 99.2,
  baseVolume: 12345,
  quoteVolume: 1250000,
  changeSinceOpenPct: 2.3,
  change24hPct: 2.3,
  volatilityPct: 1.4,
  trendPercent: 1.2,
  trendDirection: 'up',
  timestamp: '2026-09-19T12:00:00.000Z',
};

/** A Phase 3 market result, provider unreachable. */
const MARKET_UNAVAILABLE = {
  available: false,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  reason: 'Bitget ticker unavailable: request timed out',
  errors: { ticker: 'request timed out', candles: null },
};

/** A Phase 3 events result, available. */
const EVENTS_OK = {
  available: true,
  partial: false,
  source: 'fmp',
  symbol: 'NVDA',
  items: [
    { id: 'ev-1', title: 'Q3 earnings', detail: 'Earnings release scheduled.', date: '2026-10-01', source: 'fmp' },
  ],
};

/** A Phase 3 events result, provider not configured. */
const EVENTS_UNAVAILABLE = {
  available: false,
  source: 'Financial Modeling Prep (earnings calendar)',
  reason: 'No events provider configured. Set TRADEGUARD_EVENTS_API_BASE and TRADEGUARD_EVENTS_API_KEY to enable event research.',
};

/** The Phase 4 shape, reduced to the fields the report consumes. */
const ATTACK_OK = {
  available: true,
  dataLimited: false,
  interpretation: 'You expect rNVDA to rise over your stated timeframe (swing).',
  interpretationNote: 'This is TradeGuard\'s reading of the reasoning you stated in your own thesis.',
  assumptions: ['The current price trend will persist long enough for the thesis to play out.'],
  supporting: [
    { id: 'market-trend-support', category: 'market', title: 'Trend supports a bullish thesis', detail: 'Price trend is up (+1.2%).', source: 'Bitget Spot API v2' },
  ],
  contradicting: [
    { id: 'market-volatility', category: 'market', title: 'Elevated realized volatility', detail: 'Realized hourly volatility is elevated at 2.4%.', source: 'Bitget Spot API v2' },
  ],
  uncertainty: [],
  missingInformation: [],
  keyRisks: [
    { id: 'market-volatility', category: 'market', title: 'Elevated realized volatility', detail: 'Realized hourly volatility is elevated at 2.4%.', source: 'Bitget Spot API v2' },
  ],
  invalidationConditions: [
    { title: 'A sustained move below the recent 24h low (95.2)', detail: 'A break below that level would indicate the bullish structure has failed.' },
  ],
  strongestCounterargument: {
    title: 'Elevated realized volatility can break the setup',
    detail: 'Realized hourly volatility is elevated, which does not support the "orderly continuation" part of the thesis.',
    basis: 'contradicting-signal',
    source: 'Bitget Spot API v2',
  },
  evidenceStrength: { label: 'supported', basis: '1 supporting market/event signal and no contradicting signal in the available data.' },
  summary: 'The available evidence supports your bullish thesis.',
};

/** The Phase 4 data-limited shape — ran, but with nothing to classify. */
const ATTACK_PARTIAL = {
  ...ATTACK_OK,
  dataLimited: true,
  supporting: [],
  contradicting: [],
  uncertainty: [],
  keyRisks: [],
  invalidationConditions: [],
  strongestCounterargument: {
    title: 'Contradicting evidence is limited',
    detail: 'Based on the available data, no material contradicting evidence was found.',
    basis: 'no-data',
    source: null,
  },
  evidenceStrength: { label: 'insufficient evidence', basis: 'No usable market or event data was available.' },
  summary: 'TradeGuard could not assess this thesis properly because no usable market data was retrieved.',
};

const ATTACK_UNAVAILABLE = {
  available: false,
  reason: 'Backend offline — the thesis attack requires the TradeGuard API.',
};

/** A Phase 5 historical result with a usable sample. */
const HISTORY_OK = {
  available: true,
  dataLimited: false,
  status: 'ok',
  statusLabel: 'Historical sample available',
  asset: 'rNVDA',
  symbol: 'RNVDAUSDT',
  direction: 'bullish',
  timeframe: 'swing',
  timeframeAssumed: false,
  source: 'Bitget Spot API v2',
  profile: { key: 'swing', granularity: 'day', granularityLabel: 'daily', windowBars: 10, horizonBars: 5, sampleBars: 400 },
  sampleFrom: '2025-08-01T00:00:00.000Z',
  sampleTo: '2026-09-18T00:00:00.000Z',
  observations: [
    { index: 10, ts: '2026-01-02T00:00:00.000Z', setupEndTs: '2025-12-20T00:00:00.000Z', entryPrice: 80, exitPrice: 84, movePct: 5, aligned: true, flat: false, favourableExcursionPct: 6.2, adverseExcursionPct: -1.4 },
    { index: 40, ts: '2026-03-02T00:00:00.000Z', setupEndTs: '2026-02-20T00:00:00.000Z', entryPrice: 88, exitPrice: 86, movePct: -2.3, aligned: false, flat: false, favourableExcursionPct: 1.1, adverseExcursionPct: -3.5 },
  ],
  sampleSize: 400,
  eligibleCandidates: 38,
  matchedCount: 2,
  independentMatchCount: 2,
  matchFrequencyPct: 5.26,
  matchFrequencyNote:
    'Share of eligible historical windows that matched. It describes how common this setup was in the sampled history — it is not a probability, a win rate, or an edge.',
  outcomeSummary: { count: 2, alignedCount: 1, againstCount: 1, flatCount: 0 },
  limitations: ['Historical observations are a description of the past, not a forecast.'],
  missingInformation: [],
  disclaimer: 'Research output, not a trading instruction.',
};

/** A Phase 5 historical result — data could not be retrieved. */
const HISTORY_UNAVAILABLE = {
  available: false,
  dataLimited: true,
  status: 'unavailable',
  statusLabel: 'HISTORICAL DATA UNAVAILABLE',
  reason: 'Historical candles could not be retrieved from Bitget: request timed out',
  asset: 'rNVDA',
  symbol: 'RNVDAUSDT',
  observations: [],
  matchedCount: null,
  sampleSize: null,
  limitations: [],
  disclaimer: 'Research output, not a trading instruction.',
};

const ids = (list) => list.map((item) => item.id);

/** Everything a response is allowed to say, as one lower-cased blob. */
const blobOf = (value) => JSON.stringify(value).toLowerCase();

/**
 * Patterns that must never appear in a report's SUBSTANTIVE content.
 *
 * A mechanical scan cannot tell negation from assertion, and the report carries
 * disclosure copy that names these exact terms in order to disclaim them ("it
 * does not tell you to buy, to sell, or to pass"). So the scan is scoped to the
 * report with the disclosure prose removed, and the disclosure prose is checked
 * separately — see `disclosureBlob` and the tests that follow.
 */
const BANNED = [
  /\bbuy\b/,
  /\bsell\b/,
  /\bpass\b/,
  /\bhold\b/,
  /\bshould take\b/,
  /\btake the trade\b/,
  /\bdon't take the trade\b/,
  /\brecommend/,
  /\bgood trade\b/,
  /\bbad trade\b/,
  /\bscore\b/,
  /\bprobability\b/,
  /\bprobabilit/,
  /\bwin rate\b/,
  /\bexpected return\b/,
  /\bguarantee/,
  /\bpredicted price\b/,
  /\bprice target\b/,
  /\bwill (rise|fall|go up|go down)\b/,
];

/**
 * The report's substantive content: the findings a trader reads, with the
 * explanatory/negating prose excluded.
 *
 * Two kinds of prose are legitimately allowed to NAME the terms they disclaim,
 * and both are checked separately instead:
 *   - the report's own disclosure copy (limitations, method, boundary, caveats);
 *   - the earlier phases' preserved framing notes, reused verbatim. Phase 5's
 *     `matchFrequencyNote` is the clear case: it says the matched-setup share
 *     "is not a probability, a win rate, or an edge". Rewriting that would mean
 *     paraphrasing another phase's honesty guarantee, which this report must not
 *     do.
 */
function contentBlob(report) {
  const {
    limitations,
    method,
    decisionBoundary,
    decisionBoundaryDetail,
    disclaimer,
    caveats,
    historical,
    ...substance
  } = report;

  const { matchFrequencyNote, ...historicalSubstance } = historical || {};

  return blobOf({ ...substance, historical: historicalSubstance });
}

/** The disclosure prose alone, which is allowed to NAME the terms it disclaims. */
function disclosureBlob(report) {
  return blobOf({
    limitations: report.limitations,
    method: report.method,
    decisionBoundary: report.decisionBoundary,
    decisionBoundaryDetail: report.decisionBoundaryDetail,
    disclaimer: report.disclaimer,
    caveats: report.caveats,
    matchFrequencyNote: report.historical ? report.historical.matchFrequencyNote : null,
  });
}

// ============================================================================
// 1. Complete report with available structured inputs
// ============================================================================

test('1. a complete report is produced when every stage returned a usable result', () => {
  const risk = runRiskAssessment(LONG_OK);
  const structure = runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK });

  const report = runFinalReport(LONG_OK, {
    market: MARKET_OK,
    events: EVENTS_OK,
    attack: ATTACK_OK,
    history: HISTORY_OK,
    risk,
    structure,
  });

  assert.equal(report.available, true);
  assert.equal(report.status, REPORT_STATUS.READY);
  assert.equal(report.statusLabel, 'REPORT READY');

  // All eight content sections exist.
  for (const key of ['executiveSummary', 'thesis', 'market', 'events', 'devilsAdvocate', 'historical', 'risk', 'structure']) {
    assert.ok(report[key], `section ${key} should be present`);
  }

  // The roll-up and the gaps.
  assert.equal(report.evidenceSummary.total, 6);
  assert.equal(report.evidenceSummary.available, 6);
  assert.equal(report.evidenceSummary.partial, 0);
  assert.equal(report.evidenceSummary.unavailable, 0);
  assert.equal(report.gaps.length, 0, 'a fully available investigation reports no gaps');

  // Every section reports AVAILABLE.
  for (const key of ['market', 'events', 'devilsAdvocate', 'historical', 'risk', 'structure']) {
    assert.equal(report[key].state, EVIDENCE_STATE.AVAILABLE, `${key} should be available`);
  }
  assert.equal(report.thesis.state, EVIDENCE_STATE.AVAILABLE);

  // Boundary and disclosure always travel with it.
  assert.equal(report.decisionBoundary, DECISION_BOUNDARY);
  assert.ok(report.decisionBoundaryDetail.length > 0);
  assert.ok(report.limitations.length >= REPORT_LIMITATIONS.length);
  assert.equal(report.method, REPORT_METHOD_NOTE);
  assert.equal(report.disclaimer, REPORT_DISCLAIMER);
});

// ============================================================================
// 2. Bullish report
// ============================================================================

test('2. a bullish trade produces a report describing a long setup with the engine\'s 5 / 10 / 50', () => {
  const risk = runRiskAssessment(LONG_OK);
  const structure = runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK });
  const report = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  assert.equal(report.executiveSummary.asset, 'RNVDA');
  assert.equal(report.executiveSummary.direction, 'bullish');
  assert.equal(report.executiveSummary.side, 'long');

  assert.equal(report.risk.priceRiskPerUnit, 5);
  assert.equal(report.risk.positionSize, 10);
  assert.equal(report.risk.definedRisk, 50);
  assert.equal(report.risk.riskBudget, 50);
  assert.equal(report.risk.status, RISK_STATUS.READY);
  assert.equal(report.risk.statusLabel, 'RISK READY');

  // Case-insensitive: the panel's own copy is uppercased by CSS, but the
  // service copy is not. Assert on the service.
  assert.ok(report.risk.formula.priceRiskExpression.includes('entry'));
  assert.ok(report.risk.formula.priceRiskExpression.includes('invalidation'));
});

// ============================================================================
// 3. Bearish report
// ============================================================================

test('3. a bearish trade produces a short report reusing the same 5 / 10 / 50', () => {
  const risk = runRiskAssessment(SHORT_OK);
  const structure = runTradeStructure(SHORT_OK, { risk, attack: ATTACK_OK });
  const report = runFinalReport(SHORT_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  assert.equal(report.executiveSummary.direction, 'bearish');
  assert.equal(report.executiveSummary.side, 'short');

  // Same magnitudes because the construction is mirrored: 100/105 on a short is
  // the same 5-per-unit risk as 100/95 on a long.
  assert.equal(report.risk.priceRiskPerUnit, 5);
  assert.equal(report.risk.positionSize, 10);
  assert.equal(report.risk.definedRisk, 50);
  assert.equal(report.risk.status, RISK_STATUS.READY);

  assert.equal(report.status, REPORT_STATUS.READY);
});

// ============================================================================
// 4. Missing market data
// ============================================================================

test('4. missing market data is reported as UNAVAILABLE with the original reason, never filled in', () => {
  const risk = runRiskAssessment(LONG_OK);
  const attack = { ...ATTACK_PARTIAL };
  const report = runFinalReport(LONG_OK, {
    market: MARKET_UNAVAILABLE,
    events: EVENTS_OK,
    attack,
    history: HISTORY_OK,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack }),
  });

  assert.equal(report.market.state, EVIDENCE_STATE.UNAVAILABLE);
  assert.equal(report.market.readings, null, 'no readings may be invented when the provider failed');
  // The provider's own reason is carried through verbatim.
  assert.equal(report.market.reason, MARKET_UNAVAILABLE.reason);

  // The report itself is still produced — an outage is an answer, not a failure.
  assert.equal(report.available, true);
  assert.notEqual(report.status, REPORT_STATUS.UNAVAILABLE);
  assert.ok(report.caveats.some((c) => /market context could not be retrieved/i.test(c)));
  assert.ok(report.gaps.some((g) => g.id === 'market-context'));
});

// ============================================================================
// 5. Missing event data
// ============================================================================

test('5. missing event data is reported as UNAVAILABLE with the original reason and an empty item list', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, {
    market: MARKET_OK,
    events: EVENTS_UNAVAILABLE,
    attack: ATTACK_OK,
    history: HISTORY_OK,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK }),
  });

  assert.equal(report.events.state, EVIDENCE_STATE.UNAVAILABLE);
  assert.deepEqual(report.events.items, [], 'no events may be invented');
  assert.equal(report.events.reason, EVENTS_UNAVAILABLE.reason);
  assert.ok(report.caveats.some((c) => /event and catalyst data could not be retrieved/i.test(c)));
  assert.ok(report.gaps.some((g) => g.id === 'events-catalysts'));
});

// ============================================================================
// 6. Missing historical data
// ============================================================================

test('6. missing historical data is reported as UNAVAILABLE with no fabricated observations', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, {
    market: MARKET_OK,
    events: EVENTS_OK,
    attack: ATTACK_OK,
    history: HISTORY_UNAVAILABLE,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK }),
  });

  assert.equal(report.historical.state, EVIDENCE_STATE.UNAVAILABLE);
  assert.deepEqual(report.historical.observations, [], 'no observations may be invented');
  assert.equal(report.historical.outcomeSummary, null);
  assert.equal(report.historical.matchedCount, null);
  assert.equal(report.historical.matchFrequencyPct, null);
  assert.equal(report.historical.reason, HISTORY_UNAVAILABLE.reason);
  assert.ok(report.caveats.some((c) => /historical stress test produced no usable sample/i.test(c)));
  assert.ok(report.gaps.some((g) => g.id === 'historical'));
});

// ============================================================================
// 7. Partial Devil's Advocate
// ============================================================================

test('7. a data-limited Devil\'s Advocate is reported as PARTIAL, not as a clean result', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, {
    market: MARKET_OK,
    events: EVENTS_OK,
    attack: ATTACK_PARTIAL,
    history: HISTORY_OK,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_PARTIAL }),
  });

  assert.equal(report.devilsAdvocate.state, EVIDENCE_STATE.PARTIAL);
  assert.equal(report.devilsAdvocate.dataLimited, true);
  // The attack's own summary is carried through — the report does not rewrite it.
  assert.equal(report.devilsAdvocate.summary, ATTACK_PARTIAL.summary);
  assert.equal(report.thesis.state, EVIDENCE_STATE.PARTIAL);
  assert.equal(report.thesis.dataLimited, true);

  // A partial section is a gap, and it is NOT reported as unavailable.
  const gap = report.gaps.find((g) => g.id === 'devils-advocate');
  assert.ok(gap, 'a partial attack is reported as a gap');
  assert.equal(gap.state, EVIDENCE_STATE.PARTIAL);

  // Partial evidence does not make the report unavailable.
  assert.equal(report.available, true);
  assert.notEqual(report.status, REPORT_STATUS.UNAVAILABLE);
});

test('7b. an unavailable Devil\'s Advocate is reported honestly with no manufactured counterargument', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, {
    market: MARKET_UNAVAILABLE,
    events: EVENTS_UNAVAILABLE,
    attack: ATTACK_UNAVAILABLE,
    history: HISTORY_UNAVAILABLE,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_UNAVAILABLE }),
  });

  assert.equal(report.devilsAdvocate.state, EVIDENCE_STATE.UNAVAILABLE);
  assert.equal(report.devilsAdvocate.strongestCounterargument, null, 'no counterargument may be manufactured');
  assert.deepEqual(report.devilsAdvocate.keyRisks, []);
  assert.deepEqual(report.devilsAdvocate.invalidationConditions, []);
  assert.equal(report.devilsAdvocate.reason, ATTACK_UNAVAILABLE.reason);
  assert.ok(report.caveats.some((c) => /does not manufacture an attack/i.test(c)));
});

// ============================================================================
// 8. Risk assessment reuse
// ============================================================================

test('8. the report reuses the Phase 6 result by identity and never recalculates it', () => {
  const engine = runRiskAssessment(LONG_OK);
  const report = buildFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk: engine });

  // Identity: the very same object is embedded, so the two panels cannot drift.
  assert.equal(report.riskResult, engine);

  // And the projected numbers equal the engine's own numbers exactly.
  assert.equal(report.risk.priceRiskPerUnit, engine.calculation.priceRiskPerUnit);
  assert.equal(report.risk.positionSize, engine.calculation.positionSize);
  assert.equal(report.risk.definedRisk, engine.calculation.definedRisk);
  assert.equal(report.risk.riskBudget, engine.calculation.riskBudget);
  assert.equal(report.risk.entryPrice, engine.inputs.entryPrice);
  assert.equal(report.risk.invalidationPrice, engine.inputs.invalidationPrice);
  assert.equal(report.risk.reused, true);
  assert.equal(report.risk.source, 'Phase 6 deterministic risk engine');
});

test('8b. when no risk result is supplied the report calls the Phase 6 engine rather than reimplementing it', () => {
  const engine = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK });

  // Same numbers the engine produces — proving there is one implementation.
  assert.equal(report.risk.priceRiskPerUnit, engine.calculation.priceRiskPerUnit);
  assert.equal(report.risk.positionSize, engine.calculation.positionSize);
  assert.equal(report.risk.definedRisk, engine.calculation.definedRisk);
});

test('8c. an invalid risk construction produces no defined-risk figure in the report', () => {
  // Bullish with the invalidation ABOVE the entry — a contradiction.
  const invalid = { ...LONG_OK, invalidationPrice: 105 };
  const engine = assessRisk(invalid);
  assert.equal(engine.status, RISK_STATUS.INVALID);

  const report = runFinalReport(invalid, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk: engine });

  assert.equal(report.risk.state, EVIDENCE_STATE.PARTIAL);
  assert.equal(report.risk.ready, false);
  assert.equal(report.risk.priceRiskPerUnit, null);
  assert.equal(report.risk.positionSize, null);
  assert.equal(report.risk.definedRisk, null);
  assert.equal(report.status, REPORT_STATUS.INCOMPLETE);
  assert.ok(report.gaps.some((g) => g.id === 'risk'));
  assert.ok(report.caveats.some((c) => /no defined risk/i.test(c)));
});

// ============================================================================
// 9. Trade structure reuse
// ============================================================================

test('9. the report restates the Phase 7 structure without re-deriving it', () => {
  const risk = runRiskAssessment(LONG_OK);
  const structure = runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK });
  const report = buildFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  assert.equal(report.structure.status, structure.status);
  assert.equal(report.structure.statusLabel, structure.statusLabel);
  assert.equal(report.structure.complete, true);

  // The structure's own risk figures are restated, and they equal the engine's.
  assert.equal(report.structure.riskStructure.priceRiskPerUnit, structure.riskStructure.priceRiskPerUnit);
  assert.equal(report.structure.riskStructure.positionSize, structure.riskStructure.positionSize);
  assert.equal(report.structure.riskStructure.definedRisk, structure.riskStructure.definedRisk);

  // The setup fields are copied, not re-derived.
  assert.equal(report.structure.setup.entryPrice, structure.setup.entryPrice);
  assert.equal(report.structure.setup.invalidationPrice, structure.setup.invalidationPrice);

  // Conditions are carried as conditions. Never as exit prices.
  assert.equal(report.structure.invalidationConditions.length, structure.conditions.invalidationConditions.length);
  for (const condition of report.structure.invalidationConditions) {
    assert.deepEqual(Object.keys(condition).sort(), ['detail', 'title']);
  }
});

test('9b. an incomplete structure makes the report incomplete and names the gap', () => {
  // No entry price -> the risk engine cannot produce a defined risk -> the
  // structure is incomplete.
  const noEntry = { ...LONG_OK, entryPrice: null };
  const risk = assessRisk(noEntry);
  const structure = buildTradeStructure(noEntry, risk, ATTACK_OK);
  const report = runFinalReport(noEntry, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  assert.equal(structure.status, 'incomplete');
  assert.equal(report.structure.state, EVIDENCE_STATE.PARTIAL);
  assert.equal(report.status, REPORT_STATUS.INCOMPLETE);
  assert.ok(report.executiveSummary.missing.includes('entryPrice'));
  assert.ok(report.gaps.some((g) => g.id === 'structure'));
});

// ============================================================================
// 10. Missing trade information
// ============================================================================

test('10. missing trade parameters are named in the summary and never invented', () => {
  const bare = { asset: 'rNVDA', direction: 'bullish', thesis: 'Higher.' };
  const risk = runRiskAssessment(bare);
  const report = runFinalReport(bare, { risk });

  assert.equal(report.executiveSummary.entryPrice, null);
  assert.equal(report.executiveSummary.invalidationPrice, null);
  assert.equal(report.executiveSummary.riskAmount, null);
  assert.equal(report.risk.priceRiskPerUnit, null);
  assert.equal(report.risk.positionSize, null);
  assert.equal(report.risk.definedRisk, null);

  assert.ok(report.executiveSummary.missing.includes('entryPrice'));
  assert.ok(report.executiveSummary.missing.includes('invalidationPrice'));
  assert.equal(report.status, REPORT_STATUS.INCOMPLETE);
  assert.equal(report.available, true, 'a report with missing inputs is still a reportable outcome');
});

// ============================================================================
// 11. No fabricated evidence
// ============================================================================

test('11. no fabricated evidence anywhere when every provider is down', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, {
    market: MARKET_UNAVAILABLE,
    events: EVENTS_UNAVAILABLE,
    attack: ATTACK_UNAVAILABLE,
    history: HISTORY_UNAVAILABLE,
    risk,
    structure: null,
  });

  // Nothing invented in any section.
  assert.equal(report.market.readings, null);
  assert.deepEqual(report.events.items, []);
  assert.deepEqual(report.devilsAdvocate.supporting, []);
  assert.deepEqual(report.devilsAdvocate.contradicting, []);
  assert.deepEqual(report.devilsAdvocate.keyRisks, []);
  assert.equal(report.devilsAdvocate.strongestCounterargument, null);
  assert.deepEqual(report.historical.observations, []);
  assert.equal(report.historical.outcomeSummary, null);

  // But the trader's own parameters and the engine's numbers survive.
  assert.equal(report.executiveSummary.entryPrice, 100);
  assert.equal(report.risk.priceRiskPerUnit, 5);
  assert.equal(report.risk.definedRisk, 50);

  // And every unavailable section carries a reason.
  for (const key of ['market', 'events', 'devilsAdvocate', 'historical']) {
    assert.equal(report[key].state, EVIDENCE_STATE.UNAVAILABLE, `${key} should be unavailable`);
    assert.ok(report[key].reason && report[key].reason.length > 0, `${key} must explain itself`);
  }
});

test('11b. the report never contains a market price it was not given', () => {
  const risk = runRiskAssessment(LONG_OK);
  const report = runFinalReport(LONG_OK, { market: MARKET_UNAVAILABLE, events: EVENTS_UNAVAILABLE, attack: ATTACK_OK, history: HISTORY_UNAVAILABLE, risk });

  // 102.4 is the market price in MARKET_OK — it must not appear anywhere when
  // market data was unavailable.
  const blob = blobOf(report);
  assert.ok(!blob.includes('102.4'), 'an unavailable market section must not leak a price');
  assert.ok(!blob.includes('99.2'), 'an unavailable market section must not leak the 24h low');
  assert.equal(report.market.readings, null);

  // The resolved symbol IS carried through on an unavailable section, and that is
  // correct: it records which instrument the failed lookup was for. Traceability,
  // not fabrication. Assert it is present so the behaviour is pinned.
  assert.equal(report.market.symbol, MARKET_UNAVAILABLE.symbol);
});

// ============================================================================
// 12. No BUY / SELL / PASS recommendation
// ============================================================================

test('12. the report contains no BUY / SELL / PASS and no trading instruction', () => {
  const risk = runRiskAssessment(LONG_OK);
  const structure = runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK });
  const report = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  const blob = contentBlob(report);
  for (const pattern of BANNED) {
    assert.ok(!pattern.test(blob), `report content must not contain ${pattern}`);
  }
});

test('12b. the same holds when the report is incomplete', () => {
  const bare = { asset: 'rNVDA', direction: 'bullish', thesis: 'Higher.' };
  const blob = contentBlob(runFinalReport(bare, {}));
  for (const pattern of BANNED) {
    assert.ok(!pattern.test(blob), `report content must not contain ${pattern}`);
  }
});

test('12c. the same holds for the empty report', () => {
  const blob = contentBlob(emptyReport('backend unreachable'));
  for (const pattern of BANNED) {
    assert.ok(!pattern.test(blob), `empty report content must not contain ${pattern}`);
  }
});

test('12d. where the disclosure prose names a verdict term it is only ever to disclaim it', () => {
  const report = runFinalReport(LONG_OK, { risk: runRiskAssessment(LONG_OK) });
  const disclosure = disclosureBlob(report);

  // Every occurrence must sit inside a negation. This is the guard that lets the
  // boundary be stated explicitly without the copy becoming a recommendation.
  const negated = [
    /does not tell you to (buy|sell|pass)/,
    /(is not|not) a trading instruction/,
    /does not (recommend|score|rank|decide|judge)/,
    /does not (tell|estimate|predict)/,
    /final decision remains with the trader/,
    /no (probability|win rate|expected return)/,
    /it has not decided anything/,
  ];
  assert.ok(/does not tell you to buy/i.test(disclosure), 'the boundary must disclaim BUY');
  assert.ok(/is not a trading instruction/i.test(disclosure), 'the disclaimer must negate instruction');
  assert.ok(negated.some((re) => re.test(disclosure)));

  // And it must never phrase any of it as a positive instruction.
  assert.ok(!/\byou should\b/i.test(disclosure), 'the copy must not instruct the trader');
  assert.ok(!/\bwe recommend\b/i.test(disclosure));
});

// ============================================================================
// 13. No score / probability / prediction
// ============================================================================

test('13. the report invents no score, probability, win rate or expected return', () => {
  const risk = runRiskAssessment(LONG_OK);
  const structure = runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK });
  const report = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure });

  // No numeric field anywhere is a score/probability/return.
  const forbiddenKeys = ['score', 'rating', 'probability', 'winRate', 'win_rate', 'expectedReturn', 'expected_return', 'prediction', 'verdict', 'confidenceScore', 'tradeQuality', 'edge'];
  const keys = new Set();
  JSON.stringify(report, (key, value) => {
    if (key) keys.add(key);
    return value;
  });
  for (const forbidden of forbiddenKeys) {
    assert.ok(!keys.has(forbidden), `report must not carry a ${forbidden} field`);
  }

  // The historical section carries the phase's own non-predictive framing.
  assert.ok(/not a probability, a win rate, or an edge/i.test(report.historical.matchFrequencyNote));
});

// ============================================================================
// 14. Correct final decision boundary
// ============================================================================

test('14. the decision boundary is stated explicitly and is always present', () => {
  const risk = runRiskAssessment(LONG_OK);
  const complete = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK }) });
  const bare = runFinalReport({ asset: 'rNVDA', direction: 'bullish', thesis: 'Higher.' }, {});
  const empty = emptyReport('nope');

  for (const [name, report] of [['complete', complete], ['incomplete', bare], ['empty', empty]]) {
    assert.equal(report.decisionBoundary, DECISION_BOUNDARY, `${name}: boundary must be the exact required sentence`);
    assert.ok(report.decisionBoundaryDetail.length > 0, `${name}: the boundary needs its detail`);
    assert.ok(/final decision remains with the trader/i.test(report.decisionBoundary), `${name}: must keep the principle`);
    assert.ok(/does not decide|has not decided/i.test(report.decisionBoundaryDetail), `${name}: must state it decided nothing`);
  }
});

test('14b. the report points at the next phase for the decision without making it', () => {
  const report = runFinalReport(LONG_OK, { risk: runRiskAssessment(LONG_OK) });
  assert.ok(/next phase/i.test(report.decisionBoundaryDetail));
});

// ============================================================================
// 15. Existing Phase 1–7 regressions
// ============================================================================

test('15. the risk engine is untouched and still produces its own three states', () => {
  const ready = assessRisk(LONG_OK);
  assert.equal(ready.status, RISK_STATUS.READY);
  assert.equal(ready.calculation.positionSize, 10);

  const incomplete = assessRisk({ direction: 'bullish', entryPrice: 100, riskAmount: 50 });
  assert.equal(incomplete.status, RISK_STATUS.INCOMPLETE);

  const invalid = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 });
  assert.equal(invalid.status, RISK_STATUS.INVALID);
});

test('15b. the trade structure is untouched and still completes the same trade', () => {
  const structure = runTradeStructure(LONG_OK, { risk: runRiskAssessment(LONG_OK), attack: ATTACK_OK });
  assert.equal(structure.status, 'complete');
  assert.equal(structure.riskStructure.priceRiskPerUnit, 5);
  assert.equal(structure.riskStructure.positionSize, 10);
  assert.equal(structure.riskStructure.definedRisk, 50);
});

test('15c. the report never mutates the results it was handed', () => {
  const risk = runRiskAssessment(LONG_OK);
  const attack = JSON.parse(JSON.stringify(ATTACK_OK));
  const history = JSON.parse(JSON.stringify(HISTORY_OK));
  const structure = runTradeStructure(LONG_OK, { risk, attack });

  const riskSnapshot = JSON.stringify(risk);
  const attackSnapshot = JSON.stringify(attack);
  const historySnapshot = JSON.stringify(history);
  const structureSnapshot = JSON.stringify(structure);

  runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack, history, risk, structure });

  assert.equal(JSON.stringify(risk), riskSnapshot, 'the risk result must not be mutated');
  assert.equal(JSON.stringify(attack), attackSnapshot, 'the attack must not be mutated');
  assert.equal(JSON.stringify(history), historySnapshot, 'the history must not be mutated');
  assert.equal(JSON.stringify(structure), structureSnapshot, 'the structure must not be mutated');
});

// ============================================================================
// Report mechanics
// ============================================================================

test('the report is deterministic for the same inputs', () => {
  const risk = runRiskAssessment(LONG_OK);
  const args = { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk };
  assert.deepEqual(buildFinalReport(LONG_OK, args), buildFinalReport(LONG_OK, args));
});

test('the status labels are the exact three required strings', () => {
  assert.equal(REPORT_STATUS_LABELS[REPORT_STATUS.READY], 'REPORT READY');
  assert.equal(REPORT_STATUS_LABELS[REPORT_STATUS.INCOMPLETE], 'REPORT INCOMPLETE');
  assert.equal(REPORT_STATUS_LABELS[REPORT_STATUS.UNAVAILABLE], 'REPORT UNAVAILABLE');
});

test('the evidence states are the exact three required markers', () => {
  assert.equal(EVIDENCE_STATE_LABELS[EVIDENCE_STATE.AVAILABLE], 'AVAILABLE');
  assert.equal(EVIDENCE_STATE_LABELS[EVIDENCE_STATE.PARTIAL], 'PARTIAL');
  assert.equal(EVIDENCE_STATE_LABELS[EVIDENCE_STATE.UNAVAILABLE], 'UNAVAILABLE');
});

test('a missing asset makes the report incomplete rather than pretending the trade exists', () => {
  const report = runFinalReport({ direction: 'bullish', thesis: 'Higher.' }, { risk: runRiskAssessment({ direction: 'bullish', thesis: 'Higher.' }) });
  assert.equal(report.status, REPORT_STATUS.INCOMPLETE);
  assert.ok(report.executiveSummary.missing.includes('asset'));
});

test('the empty report is honest: everything unavailable, boundary still stated', () => {
  const report = emptyReport('Backend offline.');
  assert.equal(report.available, false);
  assert.equal(report.status, REPORT_STATUS.UNAVAILABLE);
  assert.equal(report.statusLabel, 'REPORT UNAVAILABLE');
  assert.equal(report.statusDetail, 'Backend offline.');
  assert.equal(report.evidenceSummary.available, 0);
  assert.equal(report.evidenceSummary.unavailable, 6);
  assert.equal(report.riskResult, null);
  assert.equal(report.risk.definedRisk, null);
  assert.equal(report.decisionBoundary, DECISION_BOUNDARY);
  assert.equal(report.method, REPORT_METHOD_NOTE);
});

test('the gaps section only lists gaps that actually exist', () => {
  const risk = runRiskAssessment(LONG_OK);
  const healthy = runFinalReport(LONG_OK, { market: MARKET_OK, events: EVENTS_OK, attack: ATTACK_OK, history: HISTORY_OK, risk, structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_OK }) });
  assert.deepEqual(healthy.gaps, [], 'a complete investigation reports no gaps');

  const broken = runFinalReport(LONG_OK, { market: MARKET_UNAVAILABLE, events: EVENTS_UNAVAILABLE, attack: ATTACK_UNAVAILABLE, history: HISTORY_UNAVAILABLE, risk });
  assert.deepEqual(
    ids(broken.gaps).sort(),
    ['devils-advocate', 'events-catalysts', 'historical', 'market-context', 'structure'],
    'only the sections that actually failed are listed'
  );
});

test('the evidence roll-up counts sections, not opinions', () => {
  const risk = runRiskAssessment(LONG_OK);
  const mixed = runFinalReport(LONG_OK, {
    market: MARKET_OK,
    events: EVENTS_UNAVAILABLE,
    attack: ATTACK_PARTIAL,
    history: HISTORY_UNAVAILABLE,
    risk,
    structure: runTradeStructure(LONG_OK, { risk, attack: ATTACK_PARTIAL }),
  });

  // market available; events + history unavailable; attack partial. The risk leg
  // is ready and the structure is complete even though the attack is thin — the
  // Phase 7 design deliberately does not block the structure on a data-limited
  // Devil's Advocate, it surfaces a caveat instead. So three are available.
  assert.equal(mixed.evidenceSummary.total, 6);
  assert.equal(mixed.evidenceSummary.available, 3, 'market, risk and structure');
  assert.equal(mixed.evidenceSummary.partial, 1, "the data-limited attack");
  assert.equal(mixed.evidenceSummary.unavailable, 2, 'events and history');

  // The per-section breakdown must agree with the sections themselves.
  const byId = Object.fromEntries(mixed.evidenceSummary.sections.map((s) => [s.id, s.state]));
  assert.equal(byId['market-context'], EVIDENCE_STATE.AVAILABLE);
  assert.equal(byId['events-catalysts'], EVIDENCE_STATE.UNAVAILABLE);
  assert.equal(byId['devils-advocate'], EVIDENCE_STATE.PARTIAL);
  assert.equal(byId['historical'], EVIDENCE_STATE.UNAVAILABLE);
  assert.equal(byId.risk, EVIDENCE_STATE.AVAILABLE);
  assert.equal(byId.structure, EVIDENCE_STATE.AVAILABLE);
});
