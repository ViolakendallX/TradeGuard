import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEvents, underlyingSymbol } from '../services/eventData.js';

function makeFetch(body) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

function withConfig(fn) {
  process.env.TRADEGUARD_EVENTS_API_BASE = 'https://api.example.com';
  process.env.TRADEGUARD_EVENTS_API_KEY = 'test-key';
  try {
    return fn();
  } finally {
    delete process.env.TRADEGUARD_EVENTS_API_BASE;
    delete process.env.TRADEGUARD_EVENTS_API_KEY;
  }
}

test('maps rToken asset to the underlying equity', () => {
  assert.equal(underlyingSymbol('rNVDA'), 'NVDA');
  assert.equal(underlyingSymbol('AAPL'), 'AAPL');
});

test('returns unavailable when no provider is configured', async () => {
  delete process.env.TRADEGUARD_EVENTS_API_BASE;
  delete process.env.TRADEGUARD_EVENTS_API_KEY;
  const res = await getEvents(makeFetch([]), 'rNVDA');
  assert.equal(res.available, false);
  assert.match(res.reason, /No events provider configured/);
});

test('normalizes a valid earnings calendar', async () => {
  await withConfig(async () => {
    const body = [
      { symbol: 'NVDA', date: '2026-02-25', eps: '2.50', revenue: '38.0B' },
      { symbol: 'NVDA', date: '2026-05-27', eps: '2.80', revenue: '40.0B' },
    ];
    const res = await getEvents(makeFetch(body), 'rNVDA');
    assert.equal(res.available, true);
    assert.equal(res.partial, false);
    assert.equal(res.symbol, 'NVDA');
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].title, 'Earnings');
    assert.equal(res.items[0].date, '2026-02-25');
    assert.match(res.items[0].description, /EPS 2\.50/);
  });
});

test('provider failure degrades to unavailable', async () => {
  await withConfig(async () => {
    const res = await getEvents(async () => {
      throw new Error('network down');
    }, 'rNVDA');
    assert.equal(res.available, false);
    assert.match(res.reason, /request failed/);
  });
});

test('empty provider response is unavailable, not fabricated', async () => {
  await withConfig(async () => {
    const res = await getEvents(makeFetch([]), 'rNVDA');
    assert.equal(res.available, false);
    assert.equal(res.items, undefined);
  });
});

test('malformed response (object, not array) is unavailable', async () => {
  await withConfig(async () => {
    const res = await getEvents(makeFetch({ status: 'weird' }), 'rNVDA');
    assert.equal(res.available, false);
  });
});
