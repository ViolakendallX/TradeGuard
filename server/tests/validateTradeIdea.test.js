import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTradeIdea, buildCaptureResponse } from '../lib/validateTradeIdea.js';

const baseIdea = {
  asset: 'rNVDA',
  direction: 'bullish',
  thesis: 'NVDA should move higher after earnings because results beat expectations.',
};

test('accepts a minimal valid idea', () => {
  const result = validateTradeIdea(baseIdea);
  assert.equal(result.valid, true);
  assert.equal(result.value.asset, 'RNVDA');
  assert.equal(result.value.direction, 'bullish');
  assert.equal(result.value.entryPrice, null);
});

test('requires asset, direction and thesis', () => {
  const result = validateTradeIdea({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.asset);
  assert.ok(result.errors.direction);
  assert.ok(result.errors.thesis);
});

test('rejects an unknown direction', () => {
  const result = validateTradeIdea({ ...baseIdea, direction: 'sideways' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.direction);
});

test('rejects a thesis that is too short', () => {
  const result = validateTradeIdea({ ...baseIdea, thesis: 'up' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.thesis);
});

test('rejects a negative entry price', () => {
  const result = validateTradeIdea({ ...baseIdea, entryPrice: '-5' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.entryPrice);
});

test('parses optional numeric and enum fields', () => {
  const result = validateTradeIdea({
    ...baseIdea,
    timeframe: 'swing',
    entryPrice: '1,234.50',
    riskAmount: '$500',
    confidence: 7,
    existingPosition: 'long',
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.entryPrice, 1234.5);
  assert.equal(result.value.riskAmount, 500);
  assert.equal(result.value.confidence, 7);
  assert.equal(result.value.existingPosition, 'long');
});

test('rejects confidence outside 1-10', () => {
  const result = validateTradeIdea({ ...baseIdea, confidence: 42 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.confidence);
});

// --- Phase 6: the invalidation / stop level --------------------------------

test('captures the trader-supplied invalidation price', () => {
  const result = validateTradeIdea({ ...baseIdea, entryPrice: 100, invalidationPrice: '95.5', riskAmount: 50 });

  assert.equal(result.valid, true);
  assert.equal(result.value.invalidationPrice, 95.5);
  // Captured, never derived.
  assert.equal(validateTradeIdea(baseIdea).value.invalidationPrice, null);
});

test('rejects an invalid or non-positive invalidation price', () => {
  const negative = validateTradeIdea({ ...baseIdea, invalidationPrice: '-5' });
  assert.equal(negative.valid, false);
  assert.ok(negative.errors.invalidationPrice);

  const zero = validateTradeIdea({ ...baseIdea, invalidationPrice: 0 });
  assert.equal(zero.valid, false);
  assert.ok(zero.errors.invalidationPrice);

  const nan = validateTradeIdea({ ...baseIdea, invalidationPrice: 'abc' });
  assert.equal(nan.valid, false);
  assert.ok(nan.errors.invalidationPrice);
});

test('the capture response reports the built phases as available', () => {
  const response = buildCaptureResponse(validateTradeIdea(baseIdea).value);
  const byStep = Object.fromEntries(response.nextSteps.map((s) => [s.step, s]));

  for (const step of ['Research', 'Thesis attack', 'Historical stress test', 'Risk engine', 'Trade structure']) {
    assert.equal(byStep[step].available, true, `${step} should be reported as available`);
  }
  // Phase 8 and later are still not built, so nothing beyond Phase 7 is listed.
  assert.equal(response.nextSteps.filter((s) => !s.available).length, 0);

  // The Phase 1 wording claimed the built phases were disabled — that was true
  // then and is false now, so it must not come back.
  assert.ok(!/not enabled in this build/i.test(response.message));
  assert.ok(!/\b(BUY|SELL|PASS|HOLD)\b/i.test(response.message), 'the capture message carries no verdict');
});
