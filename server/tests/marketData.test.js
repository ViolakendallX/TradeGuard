import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMarketContext, num } from '../services/marketData.js';
import { bitgetSymbol } from '../services/providers/bitget.js';

function makeFetch({ tickers, candles, tickerError, candleError }) {
  return async (url) => {
    if (tickerError && url.includes('/tickers')) throw new Error(tickerError);
    if (candleError && url.includes('/candles')) throw new Error(candleError);
    const body = url.includes('/tickers') ? tickers : url.includes('/candles') ? candles : {};
    return { ok: true, status: 200, json: async () => body };
  };
}

const VALID_TICKER = {
  data: [
    {
      symbol: 'RNVDAUSDT',
      lastPr: '10.25',
      openUtc: '9.80',
      high24h: '10.50',
      low24h: '9.60',
      baseVolume: '1200',
      quoteVolume: '12000',
      usdtVolume: '12000',
      ts: '1700000000000',
    },
  ],
};

function candlesFromCloses(closes, startTs = 1700000000000, stepMs = 3600000) {
  return {
    data: closes.map((c, i) => [
      String(startTs + i * stepMs),
      String(c),
      String(c * 1.02),
      String(c * 0.98),
      String(c),
      String(c * 100),
      String(c * 1000),
    ]),
  };
}

test('resolves rToken asset to a Bitget USDT symbol', () => {
  assert.equal(bitgetSymbol('rNVDA'), 'RNVDAUSDT');
  assert.equal(bitgetSymbol('btc'), 'BTCUSDT');
  assert.equal(bitgetSymbol('SOLUSDT'), 'SOLUSDT');
});

test('num() parses numeric strings and rejects junk', () => {
  assert.equal(num('12.5'), 12.5);
  assert.equal(num(''), null);
  assert.equal(num('abc'), null);
  assert.equal(num(null), null);
});

test('normalizes valid market data and derives deterministic metrics', async () => {
  const closes = [];
  for (let i = 0; i < 30; i++) closes.push(9.8 + i * 0.05); // steadily rising
  const res = await getMarketContext(makeFetch({ tickers: VALID_TICKER, candles: candlesFromCloses(closes) }), 'rNVDA');

  assert.equal(res.available, true);
  assert.equal(res.partial, false);
  assert.equal(res.symbol, 'RNVDAUSDT');
  assert.equal(res.price, 10.25);
  assert.equal(res.currency, 'USDT');
  assert.equal(res.openUtc, 9.8);
  assert.equal(res.high24h, 10.5);
  assert.equal(res.low24h, 9.6);
  assert.equal(res.quoteVolume, 12000);
  assert.ok(Math.abs(res.changeSinceOpenPct - 4.59) < 0.05);
  assert.ok(res.trendPercent > 0);
  assert.equal(res.trendDirection, 'up');
  assert.ok(typeof res.volatilityPct === 'number' && res.volatilityPct >= 0);
});

test('reports unavailable (no fabricated price) when ticker has no rows', async () => {
  const res = await getMarketContext(makeFetch({ tickers: { data: [] }, candles: { data: [] } }), 'rNVDA');
  assert.equal(res.available, false);
  assert.equal(res.price, undefined); // never fabricate a price
  assert.match(res.reason, /No market data returned/);
});

test('handles malformed provider responses without fabricating', async () => {
  const res = await getMarketContext(
    makeFetch({ tickers: { data: [{ symbol: 'RNVDAUSDT', lastPr: 'not-a-number' }] }, candles: { data: 'garbage' } }),
    'rNVDA'
  );
  assert.equal(res.available, false);
  assert.equal(res.price, undefined);
});

test('provider/API failure (ticker throws) degrades to unavailable', async () => {
  const res = await getMarketContext(
    makeFetch({ tickers: {}, candles: { data: [] }, tickerError: 'Bitget HTTP 503' }),
    'rNVDA'
  );
  assert.equal(res.available, false);
  assert.match(res.reason, /Bitget ticker unavailable/);
});

test('partial data when candles fail but ticker is valid', async () => {
  const res = await getMarketContext(
    makeFetch({ tickers: VALID_TICKER, candles: { data: [] }, candleError: 'Bitget HTTP 500' }),
    'rNVDA'
  );
  assert.equal(res.available, true);
  assert.equal(res.partial, true);
  assert.equal(res.price, 10.25);
  assert.equal(res.volatilityPct, null);
  assert.equal(res.trendPercent, null);
});

test('derived calculations are deterministic', async () => {
  // closes [100,110,99] -> returns [0.10, -0.10]; trend = (99-100)/100 = -1%
  const res = await getMarketContext(
    makeFetch({ tickers: { data: [{ symbol: 'RNVDAUSDT', lastPr: '99', openUtc: '100' }] }, candles: candlesFromCloses([100, 110, 99]) }),
    'rNVDA'
  );
  assert.equal(res.trendPercent, -1);
  assert.equal(res.trendDirection, 'down');
  assert.equal(res.volatilityPct, 10); // stddev of [0.10,-0.10] = 0.10 -> 10%
});

test('missing asset yields unavailable without throwing', async () => {
  const res = await getMarketContext(makeFetch({ tickers: VALID_TICKER, candles: { data: [] } }), '');
  assert.equal(res.available, false);
  assert.match(res.reason, /No asset supplied/);
});
