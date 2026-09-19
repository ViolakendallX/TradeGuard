import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradeStructure,
  runTradeStructure,
  emptyStructure,
  STRUCTURE_STATUS,
  STRUCTURE_STATUS_LABELS,
  STRUCTURE_LIMITATIONS,
  STRUCTURE_METHOD_NOTE,
  STRUCTURE_DISCLAIMER,
} from '../services/tradeStructure.js';
import { runRiskAssessment, assessRisk, RISK_STATUS } from '../services/riskEngine.js';

// --- fixtures ---------------------------------------------------------------

/** A coherent long setup: entry 100, invalidation 95, budget 50 -> 10 units. */
const LONG_OK = {
  asset: 'rNVDA',
  direction: 'bullish',
  thesis: 'Breakout above resistance with momentum continuing into the next session.',
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
  thesis: 'Rejection at resistance with momentum rolling over.',
  timeframe: 'swing',
  entryPrice: 100,
  invalidationPrice: 105,
  riskAmount: 50,
  confidence: 6,
  existingPosition: 'none',
};

/** The Phase 4 shape, reduced to the fields the structure actually consumes. */
const ATTACK_OK = {
  available: true,
  dataLimited: false,
  interpretation: 'You expect rNVDA to rise over your stated timeframe (swing).',
  interpretationNote: 'This is TradeGuard\'s reading of the reasoning you stated in your own thesis.',
  assumptions: ['The current price trend will persist long enough for the thesis to play out.'],
  supporting: [
    { id: 'market-trend-support', category: 'market', title: 'Trend supports a bullish thesis', detail: 'Price trend is up (+1.2%).', source: 'Bitget Spot API v2' },
  ],
  contradicting: [],
  uncertainty: [
    { id: 'market-volatility', category: 'market', title: 'Elevated realized volatility', detail: 'Realized hourly volatility is elevated at 2.4%.', source: 'Bitget Spot API v2' },
  ],
  missingInformation: [],
  keyRisks: [
    { id: 'market-volatility', category: 'market', title: 'Elevated realized volatility', detail: 'Realized hourly volatility is elevated at 2.4%.', source: 'Bitget Spot API v2' },
  ],
  invalidationConditions: [
    { title: 'A sustained move below the recent 24h low (95.2)', detail: 'A break below that level would indicate the bullish structure has failed.' },
    { title: 'A trend reversal to the downside', detail: 'A sustained downtrend would remove the momentum the thesis relies on.' },
  ],
  evidenceStrength: { label: 'supported', basis: '1 supporting market/event signal and no contradicting signal in the available data.' },
  summary: 'The available evidence supports your bullish thesis.',
};

const ATTACK_UNAVAILABLE = { available: false, reason: 'Backend offline — the thesis attack requires the TradeGuard API.' };

const ids = (list) => list.map((item) => item.id);

/** Everything a response is allowed to say, as one lower-cased blob. */
const blobOf = (value) => JSON.stringify(value).toLowerCase();

// ============================================================================
// 1. Complete bullish structure
// ============================================================================

test('1. a complete bullish trade produces a full structure from the trader\'s own parameters', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });

  assert.equal(s.available, true);
  assert.equal(s.status, STRUCTURE_STATUS.COMPLETE);
  assert.equal(s.statusLabel, 'STRUCTURE COMPLETE');
  assert.equal(s.asset, 'RNVDA');
  assert.equal(s.direction, 'bullish');
  assert.equal(s.side, 'long');
  assert.equal(s.timeframe, 'swing');

  // Section 1 — Trade setup
  assert.equal(s.setup.asset, 'RNVDA');
  assert.equal(s.setup.direction, 'bullish');
  assert.equal(s.setup.side, 'long');
  assert.equal(s.setup.timeframe, 'swing');
  assert.equal(s.setup.entryPrice, 100);
  assert.equal(s.setup.invalidationPrice, 95);
  assert.equal(s.setup.riskAmount, 50);
  assert.equal(s.setup.confidence, 7);
  assert.equal(s.setup.existingPosition, 'none');
  assert.deepEqual(s.setup.missing, []);

  // Section 2 — Risk structure
  assert.equal(s.riskStructure.complete, true);
  assert.equal(s.riskStructure.riskBudget, 50);
  assert.equal(s.riskStructure.priceRiskPerUnit, 5);
  assert.equal(s.riskStructure.positionSize, 10);
  assert.equal(s.riskStructure.definedRisk, 50);
  assert.equal(s.riskStructure.reason, null);

  // Section 3 — Thesis
  assert.equal(s.thesis.present, true);
  assert.equal(s.thesis.available, true);
  assert.equal(s.thesis.dataLimited, false);
  assert.equal(s.thesis.supportingTotal, 1);
  assert.equal(s.thesis.contradictingTotal, 0);
  assert.equal(s.thesis.evidenceStrength.label, 'supported');

  // Section 4 — Invalidation & conditions
  assert.equal(s.conditions.traderInvalidation, 95);
  assert.equal(s.conditions.invalidationConditions.length, 2);
  assert.equal(s.conditions.keyRisks.length, 1);
  assert.equal(s.conditions.assumptions.length, 1);

  // Nothing is missing, so there is no blocking gap.
  assert.deepEqual(s.missingInformation, []);
});

// ============================================================================
// 2. Complete bearish structure
// ============================================================================

test('2. a complete bearish trade structures the short side and reuses the same risk engine', () => {
  const s = runTradeStructure(SHORT_OK, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.COMPLETE);
  assert.equal(s.side, 'short');
  assert.equal(s.setup.invalidationPrice, 105);
  assert.equal(s.riskStructure.complete, true);

  // invalidation − entry = 5, so 50 / 5 = 10 units and the defined risk is 50.
  assert.equal(s.riskStructure.priceRiskPerUnit, 5);
  assert.equal(s.riskStructure.positionSize, 10);
  assert.equal(s.riskStructure.definedRisk, 50);
  assert.equal(s.riskStructure.formula.priceRiskExpression, 'invalidation − entry');
  assert.deepEqual(s.missingInformation, []);
});

// ============================================================================
// 3. Missing entry price
// ============================================================================

test('3. a missing entry price is reported, never filled in', () => {
  const s = runTradeStructure({ ...LONG_OK, entryPrice: '' }, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.statusLabel, 'STRUCTURE INCOMPLETE');
  assert.equal(s.setup.entryPrice, null);
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.positionSize, null);
  assert.equal(s.riskStructure.definedRisk, null);
  assert.ok(ids(s.missingInformation).includes('entry-price'));
  assert.match(s.statusDetail, /entry price/i);
});

// ============================================================================
// 4. Missing invalidation price
// ============================================================================

test('4. a missing invalidation is reported and no stop is invented', () => {
  const s = runTradeStructure({ ...LONG_OK, invalidationPrice: null }, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.setup.invalidationPrice, null);
  assert.equal(s.conditions.traderInvalidation, null);
  assert.equal(s.riskStructure.complete, false);
  assert.ok(ids(s.missingInformation).includes('invalidation-price'));

  // The engine's own words make it explicit that it will not choose the level.
  const gap = s.missingInformation.find((m) => m.id === 'invalidation-price');
  assert.match(gap.detail, /will not invent/i);
});

// ============================================================================
// 5. Missing risk amount
// ============================================================================

test('5. a missing risk budget leaves the structure incomplete with no position size', () => {
  const s = runTradeStructure({ ...LONG_OK, riskAmount: '' }, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.setup.riskAmount, null);
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.positionSize, null);
  assert.equal(s.riskStructure.definedRisk, null);
  assert.ok(ids(s.missingInformation).includes('risk-amount'));
});

// ============================================================================
// 6. Invalid Risk Assessment
// ============================================================================

test('6. an invalid construction is reflected rather than pretended away', () => {
  // A bullish trade with the invalidation ABOVE the entry: contradictory.
  const s = runTradeStructure({ ...LONG_OK, invalidationPrice: 105 }, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.status, RISK_STATUS.INVALID);
  assert.equal(s.riskStructure.statusLabel, 'INVALID TRADE CONSTRUCTION');
  assert.equal(s.riskStructure.positionSize, null);
  assert.equal(s.riskStructure.definedRisk, null);
  assert.match(s.riskStructure.reason, /inconsistent/i);
  assert.match(s.statusDetail, /inconsistent/i);
});

test('6b. a structure with a neutral direction has no side and no defined risk', () => {
  const s = runTradeStructure({ ...LONG_OK, direction: 'neutral' }, { attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.side, 'none');
  assert.equal(s.riskStructure.complete, false);
  assert.ok(ids(s.missingInformation).includes('directional-side'));
});

// ============================================================================
// 7. Incomplete Risk Assessment passed in by the caller
// ============================================================================

test('7. an explicitly incomplete risk result passed in is reflected, not upgraded', () => {
  const incompleteRisk = runRiskAssessment({ direction: 'bullish' });
  assert.equal(incompleteRisk.status, RISK_STATUS.INCOMPLETE);

  const s = runTradeStructure(LONG_OK, { risk: incompleteRisk, attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.riskStructure.status, RISK_STATUS.INCOMPLETE);
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.positionSize, null);
  // The engine's result is embedded exactly as it was handed over.
  assert.equal(s.risk, incompleteRisk);
});

test('7b. an unavailable risk result leaves the structure incomplete with a named reason', () => {
  const unavailable = { available: false, status: 'unavailable', statusLabel: 'RISK ASSESSMENT UNAVAILABLE', statusDetail: 'Backend offline.' };

  const s = runTradeStructure(LONG_OK, { risk: unavailable, attack: ATTACK_OK });

  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.reason, 'Backend offline.');
  assert.ok(s.limitations.includes(
    'The risk assessment did not produce a defined risk, so this structure describes the trade without a ' +
      'risk figure. Nothing has been assumed in its place.'
  ));
});

// ============================================================================
// 8. Preservation of trader-supplied values
// ============================================================================

test('8. every trader-supplied value is preserved exactly, including awkward decimals', () => {
  const odd = {
    asset: 'rAAPL',
    direction: 'bullish',
    thesis: 'Gap fill after the earnings reaction.',
    timeframe: 'intraday',
    entryPrice: '123.456',
    invalidationPrice: '118.90',
    riskAmount: '250.75',
    confidence: 4,
    existingPosition: 'long',
  };

  const s = runTradeStructure(odd, { attack: ATTACK_OK });

  assert.equal(s.setup.asset, 'RAAPL');
  assert.equal(s.setup.entryPrice, 123.456);
  assert.equal(s.setup.invalidationPrice, 118.9);
  assert.equal(s.setup.riskAmount, 250.75);
  assert.equal(s.setup.timeframe, 'intraday');
  assert.equal(s.setup.confidence, 4);
  assert.equal(s.setup.existingPosition, 'long');

  // The levels are echoed, not normalised to round numbers or to a market price.
  assert.equal(s.risk.inputs.entryPrice, 123.456);
  assert.equal(s.risk.inputs.invalidationPrice, 118.9);

  // The engine still balances: size × price risk reproduces the budget.
  const { priceRiskPerUnit, positionSize, definedRisk } = s.riskStructure;
  assert.ok(Math.abs(positionSize * priceRiskPerUnit - definedRisk) < 0.01);
  assert.ok(Math.abs(definedRisk - 250.75) < 0.01);
});

// ============================================================================
// 9. Correct reuse of the Risk Engine
// ============================================================================

test('9. the structure reuses the risk engine result verbatim and never recalculates it', () => {
  const engine = runRiskAssessment(LONG_OK);
  const s = runTradeStructure(LONG_OK, { risk: engine, attack: ATTACK_OK });

  // Identity: the very object the engine produced is what the structure carries.
  assert.equal(s.risk, engine);

  // Every risk figure is a copy of the engine's own calculation.
  assert.equal(s.riskStructure.priceRiskPerUnit, engine.calculation.priceRiskPerUnit);
  assert.equal(s.riskStructure.positionSize, engine.calculation.positionSize);
  assert.equal(s.riskStructure.definedRisk, engine.calculation.definedRisk);
  assert.equal(s.riskStructure.riskBudget, engine.calculation.riskBudget);
  assert.equal(s.riskStructure.priceRiskPctOfEntry, engine.calculation.priceRiskPctOfEntry);
  assert.equal(s.riskStructure.notionalValue, engine.calculation.notionalValue);
  assert.equal(s.riskStructure.source, 'Phase 6 deterministic risk engine');
  assert.equal(s.riskStructure.reused, true);
});

test('9b. when no risk result is supplied the structure calls the same engine, with identical numbers', () => {
  const viaEngine = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  const engine = runRiskAssessment(LONG_OK);

  assert.deepEqual(viaEngine.riskStructure, {
    source: 'Phase 6 deterministic risk engine',
    reused: true,
    status: engine.status,
    statusLabel: engine.statusLabel,
    complete: true,
    riskBudget: engine.calculation.riskBudget,
    priceRiskPerUnit: engine.calculation.priceRiskPerUnit,
    positionSize: engine.calculation.positionSize,
    definedRisk: engine.calculation.definedRisk,
    priceRiskPctOfEntry: engine.calculation.priceRiskPctOfEntry,
    notionalValue: engine.calculation.notionalValue,
    formula: engine.formula,
    reason: null,
  });
});

test('9c. the structure does not read market data and still builds with the provider down', () => {
  // There is no market-data input at all — the structure is built purely from the
  // trader's parameters and the earlier findings, so a dead provider cannot
  // change or block it.
  const withData = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  const withoutAttack = runTradeStructure(LONG_OK, { attack: ATTACK_UNAVAILABLE });

  assert.equal(withData.riskStructure.priceRiskPerUnit, withoutAttack.riskStructure.priceRiskPerUnit);
  assert.equal(withData.riskStructure.positionSize, withoutAttack.riskStructure.positionSize);
  assert.equal(withData.riskStructure.definedRisk, withoutAttack.riskStructure.definedRisk);
});

// ============================================================================
// 10. No BUY / SELL / PASS output
// ============================================================================

test('10. the structure never contains a trade verdict or a judgement', () => {
  const complete = blobOf(runTradeStructure(LONG_OK, { attack: ATTACK_OK }));
  const bearish = blobOf(runTradeStructure(SHORT_OK, { attack: ATTACK_OK }));
  const incomplete = blobOf(runTradeStructure({ direction: 'bullish' }, { attack: ATTACK_OK }));
  const invalid = blobOf(runTradeStructure({ ...LONG_OK, invalidationPrice: 105 }, { attack: ATTACK_OK }));
  const noAttack = blobOf(runTradeStructure(LONG_OK, {}));

  // Word-boundary patterns so a legitimate word merely containing those letters
  // is not a false positive.
  const banned = [
    /\bbuy\b/,
    /\bsell\b/,
    /\bpass\b/,
    /\bhold\b/,
    /good trade/,
    /great trade/,
    /\bsafe\b/,
    /should take/,
    /you should/,
    /recommend/,
    /take the trade/,
    /don't take/,
    /do not take/,
    /probability/,
    /win rate/,
    /expected return/,
    /guarantee/,
    /trade quality/,
    /\bscore\b/,
  ];

  for (const [name, blob] of Object.entries({ complete, bearish, incomplete, invalid, noAttack })) {
    for (const pattern of banned) {
      assert.doesNotMatch(blob, pattern, `"${pattern}" must not appear in the ${name} structure`);
    }
  }
});

test('10b. the status vocabulary is descriptive, never a verdict', () => {
  assert.deepEqual(Object.values(STRUCTURE_STATUS_LABELS).sort(), [
    'STRUCTURE COMPLETE',
    'STRUCTURE INCOMPLETE',
    'TRADE STRUCTURE UNAVAILABLE',
  ]);
});

// ============================================================================
// 11. No fabricated values
// ============================================================================

test('11. missing inputs never produce a plausible-looking number', () => {
  const s = runTradeStructure({ asset: 'rNVDA', direction: 'bullish', thesis: 'x', riskAmount: 50 }, { attack: ATTACK_OK });

  // No entry and no invalidation were supplied, so nothing may be reported.
  assert.equal(s.setup.entryPrice, null);
  assert.equal(s.setup.invalidationPrice, null);
  assert.equal(s.riskStructure.priceRiskPerUnit, null);
  assert.equal(s.riskStructure.positionSize, null);
  assert.equal(s.riskStructure.definedRisk, null);
  assert.equal(s.risk.calculation, null);
});

test('11b. the structure carries no number that the engine did not calculate', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  const engine = runRiskAssessment(LONG_OK);

  const riskNumbers = [
    s.riskStructure.riskBudget,
    s.riskStructure.priceRiskPerUnit,
    s.riskStructure.positionSize,
    s.riskStructure.definedRisk,
    s.riskStructure.priceRiskPctOfEntry,
    s.riskStructure.notionalValue,
  ];
  const engineNumbers = [
    engine.calculation.riskBudget,
    engine.calculation.priceRiskPerUnit,
    engine.calculation.positionSize,
    engine.calculation.definedRisk,
    engine.calculation.priceRiskPctOfEntry,
    engine.calculation.notionalValue,
  ];

  assert.deepEqual(riskNumbers, engineNumbers);
});

test('11c. a Devil\'s Advocate condition is never converted into an exit price', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });

  // Conditions keep exactly two fields: a title and a detail. No price is
  // attached, because the trader never supplied one for them.
  for (const condition of s.conditions.invalidationConditions) {
    assert.deepEqual(Object.keys(condition).sort(), ['detail', 'title']);
  }

  // The single price level the structure treats as defining risk is the trader's.
  assert.equal(s.conditions.traderInvalidation, 95);
  assert.match(s.conditions.invalidationConditionsNote, /not exit prices/i);

  // The condition text itself is passed through verbatim.
  assert.equal(
    s.conditions.invalidationConditions[0].title,
    ATTACK_OK.invalidationConditions[0].title
  );
});

test('11d. the structure carries the trader\'s own words, not a rewritten thesis', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  assert.equal(s.thesis.text, LONG_OK.thesis);

  // The Devil's Advocate interpretation is kept clearly labelled as an
  // interpretation, never presented as verified evidence.
  assert.equal(s.thesis.interpretation, ATTACK_OK.interpretation);
  assert.equal(s.thesis.interpretationNote, ATTACK_OK.interpretationNote);
});

test('11e. an unavailable Devil\'s Advocate leaves the conditions empty and says so', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_UNAVAILABLE });

  assert.equal(s.thesis.available, false);
  assert.equal(s.thesis.reason, ATTACK_UNAVAILABLE.reason);
  assert.equal(s.thesis.dataLimited, true);
  assert.deepEqual(s.thesis.supporting, []);
  assert.deepEqual(s.thesis.contradicting, []);
  assert.equal(s.conditions.available, false);
  assert.deepEqual(s.conditions.invalidationConditions, []);
  assert.deepEqual(s.conditions.keyRisks, []);
  assert.deepEqual(s.conditions.assumptions, []);
  assert.ok(s.limitations.some((l) => /will not invent them/i.test(l)));

  // The risk leg is unaffected: the structure still describes the trade.
  assert.equal(s.riskStructure.complete, true);
  assert.equal(s.status, STRUCTURE_STATUS.COMPLETE);
});

// ============================================================================
// 11f-11h. Shape, capping and honesty guarantees
// ============================================================================

test('11f. the structure exposes the four requested sections', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  for (const key of ['setup', 'riskStructure', 'thesis', 'conditions']) {
    assert.ok(s[key] && typeof s[key] === 'object', `${key} section is present`);
  }
});

test('11f2. non-blocking caveats flag what is thin about the plan', () => {
  // A fully sourced plan has nothing to caveat.
  const clean = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  assert.deepEqual(clean.caveats, []);

  // Without the Devil's Advocate the conditions are absent, even though the
  // trade itself is fully structured.
  const noAttack = runTradeStructure(LONG_OK, { attack: ATTACK_UNAVAILABLE });
  assert.equal(noAttack.status, STRUCTURE_STATUS.COMPLETE);
  assert.equal(noAttack.caveats.length, 1);
  assert.match(noAttack.caveats[0], /Devil's Advocate findings were not available/i);

  // Without a defined risk the risk section is empty.
  const noRisk = runTradeStructure({ ...LONG_OK, riskAmount: '' }, { attack: ATTACK_OK });
  assert.ok(noRisk.caveats.some((c) => /no defined risk/i.test(c)));

  // The honest failure shape carries no caveats — it has nothing to caveat.
  assert.deepEqual(emptyStructure('x').caveats, []);
});

test('11g. the synthesis is concise: long evidence lists are capped with totals exposed', () => {
  const many = {
    ...ATTACK_OK,
    supporting: Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      category: 'market',
      title: `Supporting signal ${i}`,
      detail: 'detail',
      source: 'Bitget Spot API v2',
    })),
    keyRisks: Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      category: 'market',
      title: `Risk ${i}`,
      detail: 'detail',
      source: null,
    })),
  };

  const s = runTradeStructure(LONG_OK, { attack: many });

  assert.equal(s.thesis.supportingTotal, 7);
  assert.equal(s.thesis.supporting.length, 4);
  assert.equal(s.thesis.supportingShown, 4);
  assert.equal(s.conditions.keyRisksTotal, 9);
  assert.equal(s.conditions.keyRisks.length, 6);
});

test('11h. a missing timeframe is reported but does not block the structure', () => {
  const s = runTradeStructure({ ...LONG_OK, timeframe: '' }, { attack: ATTACK_OK });

  const gap = s.missingInformation.find((m) => m.id === 'structure-timeframe');
  assert.ok(gap);
  assert.equal(gap.blocking, false);
  assert.equal(s.status, STRUCTURE_STATUS.COMPLETE);
});

test('11i. a missing asset is reported as a blocking gap', () => {
  const s = runTradeStructure({ ...LONG_OK, asset: '' }, { attack: ATTACK_OK });

  const gap = s.missingInformation.find((m) => m.id === 'structure-asset');
  assert.ok(gap);
  assert.equal(gap.blocking, true);
  assert.equal(s.status, STRUCTURE_STATUS.INCOMPLETE);
});

test('11j. every structure ships its method, limitations and disclaimer', () => {
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  assert.equal(s.method, STRUCTURE_METHOD_NOTE);
  assert.equal(s.disclaimer, STRUCTURE_DISCLAIMER);
  for (const l of STRUCTURE_LIMITATIONS) {
    assert.ok(s.limitations.includes(l), 'every non-negotiable limitation is present');
  }
  assert.ok(s.generatedAt);
});

test('11k. emptyStructure is the honest shape when nothing could be produced', () => {
  const s = emptyStructure('service failure');

  assert.equal(s.available, false);
  assert.equal(s.status, STRUCTURE_STATUS.UNAVAILABLE);
  assert.equal(s.statusLabel, 'TRADE STRUCTURE UNAVAILABLE');
  assert.equal(s.statusDetail, 'service failure');
  assert.equal(s.riskStructure.complete, false);
  assert.equal(s.riskStructure.positionSize, null);
  assert.equal(s.risk, null);
  assert.deepEqual(s.missingInformation, []);
});

test('11l. the same input always produces the same structure', () => {
  const risk = runRiskAssessment(LONG_OK);
  const a = buildTradeStructure(LONG_OK, risk, ATTACK_OK);
  const b = buildTradeStructure(LONG_OK, risk, ATTACK_OK);
  assert.deepEqual(a, b);
});

// ============================================================================
// 12. Phase 1–6 regression — nothing upstream changed
// ============================================================================

test('12. the Phase 6 risk engine is untouched by the Phase 7 addition', () => {
  const long = assessRisk(LONG_OK);
  assert.equal(long.status, RISK_STATUS.READY);
  assert.equal(long.calculation.priceRiskPerUnit, 5);
  assert.equal(long.calculation.positionSize, 10);
  assert.equal(long.calculation.definedRisk, 50);

  const short = assessRisk(SHORT_OK);
  assert.equal(short.calculation.priceRiskPerUnit, 5);
  assert.equal(short.calculation.positionSize, 10);
  assert.equal(short.calculation.definedRisk, 50);

  // The three-state vocabulary is unchanged.
  assert.equal(assessRisk({ direction: 'bullish' }).status, RISK_STATUS.INCOMPLETE);
  assert.equal(assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 }).status, RISK_STATUS.INVALID);
});

test('12b. the embedded risk result is byte-for-byte the engine\'s own output', () => {
  const engine = runRiskAssessment(LONG_OK);
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  const fresh = runRiskAssessment(LONG_OK);

  // Both were produced by the same pure function from the same context, so every
  // field except the timestamp must match.
  const { generatedAt: a, ...engineFields } = engine;
  const { generatedAt: b, ...structureFields } = s.risk;
  const { generatedAt: c, ...freshFields } = fresh;

  assert.deepEqual(engineFields, freshFields);
  assert.deepEqual(structureFields, freshFields);
  assert.ok(a && b && c);
});

test('12c. the structure adds no endpoint-level side effects to the earlier engines', () => {
  // The structure service imports only the risk engine — no provider, no
  // market-data service — so running it cannot disturb Phase 3–5 behaviour.
  const s = runTradeStructure(LONG_OK, { attack: ATTACK_OK });
  assert.equal(s.risk.side, 'long');
  assert.equal(s.risk.inputs.timeframe, 'swing');
  assert.equal(s.risk.methodology.note, runRiskAssessment(LONG_OK).methodology.note);
});
