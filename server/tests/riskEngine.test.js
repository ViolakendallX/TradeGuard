import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assessRisk,
  runRiskAssessment,
  parseRiskNumber,
  riskSideOf,
  RISK_STATUS,
  RISK_STATUS_LABELS,
  RISK_SIDES,
  RISK_LIMITATIONS,
  RISK_METHOD_NOTE,
  RISK_DISCLAIMER,
} from '../services/riskEngine.js';

// --- helpers ----------------------------------------------------------------

/** A coherent long setup: entry 100, invalidation 95, budget 50 -> 10 units. */
const LONG_OK = {
  asset: 'rNVDA',
  direction: 'bullish',
  entryPrice: 100,
  invalidationPrice: 95,
  riskAmount: 50,
};

const ids = (list) => list.map((item) => item.id);

const missingIds = (result) => ids(result.missingInformation);
const warningIds = (result) => ids(result.warnings);

/** Everything a response is allowed to say, as one lower-cased blob. */
const blobOf = (value) => JSON.stringify(value).toLowerCase();

// ============================================================================
// 1. Valid long trade
// ============================================================================

test('1. a valid long trade calculates price risk, size and defined risk', () => {
  const r = assessRisk(LONG_OK);

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.statusLabel, 'RISK READY');
  assert.equal(r.side, RISK_SIDES.long);

  assert.equal(r.calculation.priceRiskPerUnit, 5);
  assert.equal(r.calculation.positionSize, 10);
  assert.equal(r.calculation.definedRisk, 50);
  assert.equal(r.calculation.priceRiskPctOfEntry, 5);
  assert.equal(r.calculation.notionalValue, 1000);

  assert.deepEqual(r.missingInformation, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.interpretation, 'a ready assessment explains what the numbers mean');
  assert.equal(r.formula.priceRiskExpression, 'entry − invalidation');
});

test('1b. the worked example from the specification is reproduced exactly', () => {
  // Entry 100 / invalidation 95 / risk budget 50 => 5 per unit, 10 units, 50.
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.calculation.priceRiskPerUnit, 5);
  assert.equal(r.calculation.positionSize, 10);
  assert.equal(r.calculation.definedRisk, 50);
});

// ============================================================================
// 2. Valid short trade
// ============================================================================

test('2. a valid short trade risks the distance UP to the invalidation', () => {
  const r = assessRisk({
    direction: 'bearish',
    entryPrice: 100,
    invalidationPrice: 105,
    riskAmount: 50,
  });

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.side, RISK_SIDES.short);
  assert.equal(r.calculation.priceRiskPerUnit, 5);
  assert.equal(r.calculation.positionSize, 10);
  assert.equal(r.calculation.definedRisk, 50);
  assert.equal(r.formula.priceRiskExpression, 'invalidation − entry');
});

test('2b. a short whose invalidation is below the entry is invalid', () => {
  const r = assessRisk({ direction: 'bearish', entryPrice: 100, invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INVALID);
  assert.equal(r.statusLabel, 'INVALID TRADE CONSTRUCTION');
  assert.ok(warningIds(r).includes('wrong-side-short'));
  assert.equal(r.calculation, null);
});

// ============================================================================
// 3. Zero price risk
// ============================================================================

test('3. entry equal to invalidation is zero price risk, never a division by zero', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 100, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(r).includes('zero-price-risk'));
  assert.equal(r.calculation, null, 'nothing is calculated from a zero denominator');
  assert.equal(r.interpretation, null);
});

// ============================================================================
// 4. Negative price risk
// ============================================================================

test('4. a bullish trade with the invalidation at or above the entry is invalid', () => {
  const above = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 });
  assert.equal(above.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(above).includes('wrong-side-long'));
  assert.equal(above.calculation, null);

  const equal = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 100, riskAmount: 50 });
  assert.equal(equal.status, RISK_STATUS.INVALID);
});

test('4b. the negative-price-risk warning names the correct side', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 });
  const w = r.warnings.find((x) => x.id === 'wrong-side-long');

  assert.match(w.title, /bullish/i);
  assert.match(w.detail, /BELOW the entry/);
  // It explains the problem; it never proposes a level of its own.
  assert.doesNotMatch(w.detail, /\d/, 'no replacement stop price is suggested');
});

// ============================================================================
// 5–7. Missing inputs
// ============================================================================

test('5. a missing entry price is INCOMPLETE and names the missing field', () => {
  const r = assessRisk({ direction: 'bullish', invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.equal(r.statusLabel, 'INCOMPLETE');
  assert.ok(missingIds(r).includes('entry-price'));
  assert.equal(r.calculation, null);
});

test('6. a missing invalidation price is INCOMPLETE — no stop is ever invented', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.ok(missingIds(r).includes('invalidation-price'));
  assert.equal(r.calculation, null);
  assert.equal(r.inputs.invalidationPrice, null);
  // The engine must not have derived a stop from anything.
  assert.doesNotMatch(blobOf(r), /suggest|recommend|assume a stop|default stop/);
});

test('7. a missing risk amount is INCOMPLETE', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 95 });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.ok(missingIds(r).includes('risk-amount'));
  assert.equal(r.calculation, null);
});

test('7b. every missing input is reported together, not one at a time', () => {
  const r = assessRisk({ direction: 'bullish' });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.deepEqual(missingIds(r), ['entry-price', 'invalidation-price', 'risk-amount']);
});

test('7c. an empty payload is INCOMPLETE, not an error and not a default', () => {
  const r = assessRisk({});

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.equal(r.calculation, null);
  assert.equal(r.side, RISK_SIDES.none);
});

// ============================================================================
// 8. Invalid / non-positive numeric input
// ============================================================================

test('8. a non-numeric entry price is reported as unusable, never coerced', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 'abc', invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(r).includes('entry-not-usable'));
  assert.equal(r.calculation, null);
  assert.equal(r.inputs.entryPrice, null);
});

test('8b. non-positive price levels are unusable', () => {
  const zeroEntry = assessRisk({ direction: 'bullish', entryPrice: 0, invalidationPrice: -5, riskAmount: 50 });
  assert.equal(zeroEntry.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(zeroEntry).includes('entry-not-positive'));
  assert.equal(zeroEntry.calculation, null);

  const zeroStop = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 0, riskAmount: 50 });
  assert.equal(zeroStop.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(zeroStop).includes('invalidation-not-positive'));
  assert.equal(zeroStop.calculation, null);

  const zeroRisk = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 95, riskAmount: 0 });
  assert.equal(zeroRisk.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(zeroRisk).includes('risk-amount-not-positive'));
  assert.equal(zeroRisk.calculation, null);
});

test('8c. a negative number is rejected rather than treated as a level', () => {
  const r = assessRisk({ direction: 'bearish', entryPrice: 100, invalidationPrice: -1, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(r).includes('invalidation-not-usable'));
  assert.equal(r.calculation, null);
});

test('8d. a risk budget that cannot be applied is called out on its own', () => {
  // Budget supplied, but the price risk is unusable (entry == invalidation).
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 100, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INVALID);
  assert.ok(warningIds(r).includes('unusable-risk-budget'));
  assert.equal(r.calculation, null);
});

// ============================================================================
// 9. Position-size calculation
// ============================================================================

test('9. position size is the risk budget divided by the price risk per unit', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 250, invalidationPrice: 245.5, riskAmount: 100 });

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.calculation.priceRiskPerUnit, 4.5);
  assert.equal(r.calculation.positionSize, 22.222222);
  assert.equal(r.calculation.definedRisk, 100);
});

test('9b. a fractional position size is reported as a number, not rounded to whole units', () => {
  const r = assessRisk({ direction: 'bearish', entryPrice: 10, invalidationPrice: 10.25, riskAmount: 33 });

  assert.equal(r.calculation.priceRiskPerUnit, 0.25);
  assert.equal(r.calculation.positionSize, 132);
  assert.equal(r.calculation.definedRisk, 33);
});

// ============================================================================
// 10. Declared-risk calculation
// ============================================================================

test('10. the defined risk always matches the declared risk budget', () => {
  const cases = [
    { direction: 'bullish', entryPrice: 100, invalidationPrice: 95, riskAmount: 50 },
    { direction: 'bullish', entryPrice: 100, invalidationPrice: 95, riskAmount: 1234.56 },
    { direction: 'bearish', entryPrice: 42.5, invalidationPrice: 48.75, riskAmount: 500 },
    { direction: 'bearish', entryPrice: 0.5, invalidationPrice: 0.62, riskAmount: 12 },
    { direction: 'bullish', entryPrice: 1000, invalidationPrice: 1, riskAmount: 99999 },
  ];

  for (const c of cases) {
    const r = assessRisk(c);
    assert.equal(r.status, RISK_STATUS.READY, JSON.stringify(c));
    assert.equal(
      r.calculation.definedRisk,
      Math.round(c.riskAmount * 100) / 100,
      `defined risk should equal the declared budget for ${JSON.stringify(c)}`
    );
  }
});

test('10b. size × price risk equals the budget, so the maths is internally consistent', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 187.4, invalidationPrice: 181.15, riskAmount: 750 });

  const recomputed = r.calculation.positionSize * r.calculation.priceRiskPerUnit;
  assert.ok(Math.abs(recomputed - r.calculation.definedRisk) < 0.01);
  assert.ok(Math.abs(r.calculation.definedRisk - 750) < 0.01);
});

// ============================================================================
// 11. Boundary conditions
// ============================================================================

test('11. an extremely tight invalidation produces a large but finite size', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 99.999, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.calculation.priceRiskPerUnit, 0.001);
  assert.equal(r.calculation.positionSize, 50000);
  assert.equal(r.calculation.definedRisk, 50);
  assert.ok(Number.isFinite(r.calculation.positionSize));
});

test('11b. a very wide invalidation produces a very small but finite size', () => {
  const r = assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 1, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.calculation.priceRiskPerUnit, 99);
  assert.ok(Math.abs(r.calculation.positionSize - 0.505051) < 0.000001);
  assert.equal(r.calculation.definedRisk, 50);
});

test('11c. currency symbols and thousands separators are read the same way as Phase 1', () => {
  const r = assessRisk({
    direction: 'bullish',
    entryPrice: '$1,234.50',
    invalidationPrice: '1,200',
    riskAmount: '$500',
  });

  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.calculation.priceRiskPerUnit, 34.5);
  assert.equal(r.inputs.entryPrice, 1234.5);
  assert.equal(r.inputs.riskAmount, 500);
});

test('11d. out-of-range and malformed strings never become numbers', () => {
  assert.equal(parseRiskNumber('9999999999999', 'X').state, 'invalid');
  assert.equal(parseRiskNumber('', 'X').state, 'empty');
  assert.equal(parseRiskNumber(null, 'X').state, 'empty');
  assert.equal(parseRiskNumber('1e999', 'X').state, 'invalid');
  assert.equal(parseRiskNumber('$', 'X').state, 'invalid');
  assert.deepEqual(parseRiskNumber('1,234.50', 'X'), { value: 1234.5, state: 'ok', error: null });
});

test('11e. a neutral thesis has no directional side, so no risk is calculated', () => {
  const r = assessRisk({ direction: 'neutral', entryPrice: 100, invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.equal(r.side, RISK_SIDES.none);
  assert.ok(missingIds(r).includes('directional-side'));
  assert.equal(r.calculation, null);
  assert.equal(r.formula.priceRiskExpression, null);
});

test('11f. a missing direction is INCOMPLETE rather than assumed bullish', () => {
  const r = assessRisk({ entryPrice: 100, invalidationPrice: 95, riskAmount: 50 });

  assert.equal(r.status, RISK_STATUS.INCOMPLETE);
  assert.ok(missingIds(r).includes('directional-side'));
  assert.equal(r.calculation, null);
});

test('11g. side mapping is exhaustive', () => {
  assert.equal(riskSideOf('bullish'), RISK_SIDES.long);
  assert.equal(riskSideOf('bearish'), RISK_SIDES.short);
  assert.equal(riskSideOf('neutral'), RISK_SIDES.none);
  assert.equal(riskSideOf(''), RISK_SIDES.none);
  assert.equal(riskSideOf(undefined), RISK_SIDES.none);
});

// ============================================================================
// 12. Data honesty — no verdict, no fabrication, no market price
// ============================================================================

test('12. the output never contains a trade verdict or a judgement', () => {
  const ready = blobOf(assessRisk(LONG_OK));
  const incomplete = blobOf(assessRisk({ direction: 'bullish' }));
  const invalid = blobOf(assessRisk({ direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 }));

  // Word-boundary patterns for the short verdict words, so a legitimate word
  // that merely contains those letters is not a false positive.
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
    /win rate/,
    /probabilit/,
    /expected return/,
    /guarantee/,
    /\bedge\b/,
    /\bscore\b/,
  ];

  for (const blob of [ready, incomplete, invalid]) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(blob), `output must not match ${pattern}`);
    }
  }
});

test('12b. no position size, defined risk or interpretation is fabricated when not ready', () => {
  for (const input of [
    { direction: 'bullish' },
    { direction: 'bullish', entryPrice: 100 },
    { direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 },
    { direction: 'neutral', entryPrice: 100, invalidationPrice: 95, riskAmount: 50 },
  ]) {
    const r = assessRisk(input);
    assert.notEqual(r.status, RISK_STATUS.READY);
    assert.equal(r.calculation, null);
    assert.equal(r.interpretation, null);
  }
});

test('12c. a ready assessment reports only numbers derivable from the inputs', () => {
  const r = assessRisk(LONG_OK);

  // 5 per unit comes from 100 - 95; 10 units from 50 / 5; 50 from 10 * 5.
  assert.equal(r.calculation.priceRiskPerUnit, 100 - 95);
  assert.equal(r.calculation.positionSize, 50 / (100 - 95));
  assert.equal(r.calculation.notionalValue, (50 / (100 - 95)) * 100);
});

test('12d. the engine never reads market data — it only uses the trader\'s levels', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../services/riskEngine.js', import.meta.url)),
    'utf8'
  );

  assert.ok(!/providers\//.test(source), 'the risk engine must not import a data provider');
  assert.ok(!/marketData/.test(source), 'the risk engine must not import market data');
  assert.ok(!/\bfetch\s*\(/.test(source), 'the risk engine must not perform network calls');
});

test('12e. a live market price cannot leak into the assessment', () => {
  // Even if a caller passes market data alongside the context, the engine only
  // reads the trader's own fields — there is no fallback to a current price.
  const r = runRiskAssessment({
    ...LONG_OK,
    market: { available: true, price: 123.45 },
    price: 123.45,
    currentPrice: 123.45,
  });

  assert.equal(r.inputs.entryPrice, 100);
  assert.equal(r.calculation.priceRiskPerUnit, 5);
  assert.doesNotMatch(blobOf(r), /123\.45/);
});

test('12f. the limitations and disclaimer are always shipped', () => {
  for (const input of [LONG_OK, { direction: 'bullish' }, { direction: 'bullish', entryPrice: 100, invalidationPrice: 105, riskAmount: 50 }]) {
    const r = assessRisk(input);
    assert.equal(r.disclaimer, RISK_DISCLAIMER);
    assert.ok(r.limitations.length >= RISK_LIMITATIONS.length);
    assert.ok(r.methodology.note === RISK_METHOD_NOTE);
    // Execution reality must always be disclosed.
    assert.ok(r.limitations.some((l) => /slippage/i.test(l)));
  }
});

test('12g. a declared existing position adds the exposure caveat and nothing else', () => {
  const without = assessRisk(LONG_OK);
  const withPosition = assessRisk({ ...LONG_OK, existingPosition: 'long' });

  assert.equal(withPosition.calculation.positionSize, without.calculation.positionSize);
  assert.equal(withPosition.limitations.length, without.limitations.length + 1);
  assert.ok(withPosition.limitations.some((l) => /existing position/i.test(l)));
});

// ============================================================================
// 13. Phase 1–5 behaviour remains intact
// ============================================================================

test('13. the risk engine is independent of research, attack and history', () => {
  // No research, no attack, no history — the risk assessment still resolves,
  // because it is pure arithmetic on the trader's own inputs.
  const r = runRiskAssessment(LONG_OK);

  assert.equal(r.available, true);
  assert.equal(r.status, RISK_STATUS.READY);
  assert.equal(r.asset, 'RNVDA');
  assert.ok(r.generatedAt);
});

test('13b. an empty or absent context degrades honestly instead of throwing', () => {
  for (const input of [undefined, null, {}, 'nonsense', 42]) {
    const r = runRiskAssessment(input);
    assert.equal(r.available, true);
    assert.notEqual(r.status, RISK_STATUS.READY);
    assert.equal(r.calculation, null);
  }
});

test('13c. the status vocabulary is exactly the three documented states', () => {
  assert.deepEqual(Object.values(RISK_STATUS), ['ready', 'incomplete', 'invalid']);
  assert.deepEqual(RISK_STATUS_LABELS, {
    ready: 'RISK READY',
    incomplete: 'INCOMPLETE',
    invalid: 'INVALID TRADE CONSTRUCTION',
  });
});

test('13d. an uppercase asset is echoed and a missing asset is not invented', () => {
  assert.equal(runRiskAssessment({ ...LONG_OK, asset: 'rnvda' }).asset, 'RNVDA');
  assert.equal(runRiskAssessment({ direction: 'bullish' }).asset, '');
});
