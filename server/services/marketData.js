/**
 * Market context service (Phase 3).
 *
 * Fetches REAL market data for the submitted asset from Bitget and derives a
 * small set of deterministic metrics (volatility, trend, 24h change). It never
 * fabricates values: if the provider returns nothing usable, `available` is
 * false and no price/metric fields are present.
 *
 * The service accepts an injectable `fetchImpl` so unit tests can run against
 * fixtures without touching the network.
 */

import { fetchBitgetTicker, fetchBitgetCandles, bitgetSymbol } from './providers/bitget.js';

const SOURCE = 'Bitget Spot API v2';

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function toCandleRow(raw) {
  if (Array.isArray(raw)) {
    return {
      ts: num(raw[0]),
      open: num(raw[1]),
      high: num(raw[2]),
      low: num(raw[3]),
      close: num(raw[4]),
      baseVol: num(raw[5]),
      quoteVol: num(raw[6]),
    };
  }
  return {
    ts: num(raw?.ts ?? raw?.timestamp),
    open: num(pick(raw, ['openUtc', 'open'])),
    high: num(raw?.high),
    low: num(raw?.low),
    close: num(pick(raw, ['close', 'last', 'lastPr'])),
    baseVol: num(pick(raw, ['baseVolume', 'baseVol'])),
    quoteVol: num(pick(raw, ['quoteVolume', 'quoteVol', 'usdtVolume', 'usdtVol'])),
  };
}

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function toIsoTs(v) {
  if (v == null) return null;
  if (typeof v === 'string' && !/^\d+$/.test(v)) return v; // already ISO-ish
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const ms = n < 1e12 ? n * 1000 : n; // Bitget returns ms epoch
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getMarketContext(fetchImpl, rawAsset) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const symbol = bitgetSymbol(rawAsset);
  if (!symbol) {
    return { available: false, source: SOURCE, reason: 'No asset supplied for market research.' };
  }

  let ticker = null;
  let tickerError = null;
  try {
    ticker = await fetchBitgetTicker(fetchFn, symbol);
  } catch (e) {
    tickerError = e?.message || 'Ticker request failed';
  }

  const price = num(pick(ticker, ['lastPr', 'close', 'last']));
  const openUtc = num(pick(ticker, ['openUtc', 'open']));
  const high24h = num(pick(ticker, ['high24h', 'high']));
  const low24h = num(pick(ticker, ['low24h', 'low']));
  const baseVolume = num(pick(ticker, ['baseVolume', 'baseVol']));
  const quoteVolume = num(pick(ticker, ['quoteVolume', 'quoteVol', 'usdtVolume', 'usdtVol']));
  const timestamp = toIsoTs(ticker?.ts);

  let candles = [];
  let candlesError = null;
  try {
    candles = await fetchBitgetCandles(fetchFn, symbol, { granularity: 3600, limit: 200 });
  } catch (e) {
    candlesError = e?.message || 'Candles request failed';
  }

  const rows = candles
    .map(toCandleRow)
    .filter((r) => r.close != null && r.ts != null)
    .sort((a, b) => a.ts - b.ts);

  let volatilityPct = null;
  let trendPercent = null;
  let trendDirection = 'flat';
  let change24hPct = null;

  if (rows.length >= 2) {
    const closes = rows.map((r) => r.close);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      if (prev) {
        const r = (closes[i] - prev) / prev;
        if (Number.isFinite(r)) returns.push(r);
      }
    }
    if (returns.length) volatilityPct = round2(stddev(returns) * 100);
    trendPercent = round2(((closes[closes.length - 1] - closes[0]) / closes[0]) * 100);
    trendDirection = trendPercent > 0.5 ? 'up' : trendPercent < -0.5 ? 'down' : 'flat';
    if (rows.length >= 24) {
      const close24ago = closes[closes.length - 24];
      if (close24ago) change24hPct = round2(((closes[closes.length - 1] - close24ago) / close24ago) * 100);
    }
  }

  let changeSinceOpenPct = null;
  if (price != null && openUtc != null && openUtc !== 0) {
    changeSinceOpenPct = round2(((price - openUtc) / openUtc) * 100);
  }

  if (price == null) {
    return {
      available: false,
      source: SOURCE,
      symbol,
      reason: tickerError
        ? `Bitget ticker unavailable: ${tickerError}`
        : `No market data returned for ${symbol} on Bitget.`,
      errors: { ticker: tickerError, candles: candlesError },
    };
  }

  const hasDerived = volatilityPct != null || trendPercent != null || change24hPct != null;

  return {
    available: true,
    partial: !hasDerived,
    source: SOURCE,
    symbol,
    price,
    currency: 'USDT',
    openUtc,
    high24h,
    low24h,
    baseVolume,
    quoteVolume,
    timestamp,
    changeSinceOpenPct,
    change24hPct,
    volatilityPct,
    trendPercent,
    trendDirection,
  };
}
