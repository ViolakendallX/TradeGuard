import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTradeIdea } from '../lib/validateTradeIdea.js';

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
