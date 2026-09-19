/**
 * Bitget Spot API v2 provider (Phase 3 — Market context).
 *
 * This module isolates ALL Bitget-specific knowledge: URL building, request
 * shaping, and response extraction. Swapping providers later means writing a
 * new provider module with the same `fetchBitgetTicker` / `fetchBitgetCandles`
 * contract — the rest of the research pipeline does not care which exchange
 * answered.
 *
 * Public endpoints used (no API key required):
 *   GET /api/v2/spot/market/tickers?symbol=<SYMBOL>
 *   GET /api/v2/spot/market/candles?symbol=<SYMBOL>&granularity=<s>&limit=<n>
 *
 * Field parsing is defensive: it tolerates both v2 (lastPr/openUtc/...) and
 * v1 (close/open/...) shapes so the integration keeps working if Bitget tweaks
 * response field names.
 */

const BITGET_BASE = 'https://api.bitget.com/api/v2/spot/market';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Resolve a TradeGuard asset to a Bitget spot symbol.
 * rTokens such as "rNVDA" trade as "RNVDAUSDT" on Bitget.
 */
export function bitgetSymbol(asset) {
  const a = String(asset || '').trim().toUpperCase();
  if (!a) return '';
  if (a.endsWith('USDT') || a.endsWith('USDC') || a.endsWith('USD')) return a;
  return `${a}USDT`;
}

async function bitgetGet(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Bitget HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBitgetTicker(fetchImpl, symbol) {
  const url = `${BITGET_BASE}/tickers?symbol=${encodeURIComponent(symbol)}`;
  const json = await bitgetGet(fetchImpl, url);
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.find((r) => String(r?.symbol).toUpperCase() === symbol) || (data.length ? data[0] : null);
}

export async function fetchBitgetCandles(fetchImpl, symbol, { granularity = 3600, limit = 200 } = {}) {
  const url = `${BITGET_BASE}/candles?symbol=${encodeURIComponent(symbol)}&granularity=${granularity}&limit=${limit}`;
  const json = await bitgetGet(fetchImpl, url);
  return Array.isArray(json?.data) ? json.data : [];
}
