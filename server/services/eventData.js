/**
 * Events & catalysts service (Phase 3).
 *
 * This is the integration BOUNDARY for event research. It is gated entirely by
 * environment configuration: without TRADEGUARD_EVENTS_API_BASE + _API_KEY it
 * returns an honest "Data unavailable" state instead of fabricating events.
 *
 * The default contract targets a Financial Modeling Prep-style earnings
 * calendar (https://site.financialmodelingprep.com/developer/docs/earnings-calendar-api),
 * but the provider is isolatable — swap the URL building here to use another
 * source. No secrets live in code; they come from the environment only.
 */

const DEFAULT_PROVIDER = 'fmp';

/** Map a TradeGuard asset to the underlying equity for event lookups. */
export function underlyingSymbol(asset) {
  const a = String(asset || '').trim();
  // rToken convention: "rNVDA" tracks the equity "NVDA".
  if (/^r[a-z0-9]/i.test(a) && a.length > 1) return a.slice(1).toUpperCase();
  return a.toUpperCase();
}

function normalizeEvent(raw) {
  if (!raw) return null;
  const title = raw.title || raw.event || raw.name || 'Earnings';
  const date =
    raw.date ||
    raw.reportDate ||
    raw.fiscalDateEnding ||
    (raw.year && raw.quarter ? `${raw.year}-Q${raw.quarter}` : null);
  const detail = [raw.eps != null ? `EPS ${raw.eps}` : null, raw.revenue != null ? `Revenue ${raw.revenue}` : null]
    .filter(Boolean)
    .join(', ');
  const description = raw.description || detail || 'No further detail provided by the provider.';
  return {
    title: String(title),
    date: date ? String(date) : null,
    source: raw.source ? String(raw.source) : null,
    description: String(description),
  };
}

export async function getEvents(fetchImpl, rawAsset) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const base = process.env.TRADEGUARD_EVENTS_API_BASE;
  const key = process.env.TRADEGUARD_EVENTS_API_KEY;
  const provider = (process.env.TRADEGUARD_EVENTS_PROVIDER || DEFAULT_PROVIDER).toLowerCase();

  if (!base || !key) {
    return {
      available: false,
      source: provider === 'fmp' ? 'Financial Modeling Prep (earnings calendar)' : provider,
      reason:
        'No events provider configured. Set TRADEGUARD_EVENTS_API_BASE and TRADEGUARD_EVENTS_API_KEY to enable event research.',
    };
  }

  const symbol = underlyingSymbol(rawAsset);
  const url = `${base.replace(/\/+$/, '')}/earnings_calendar?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;

  let json;
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Events provider HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    return {
      available: false,
      source: provider,
      symbol,
      reason: `Events provider request failed: ${e?.message || 'unknown error'}.`,
    };
  }

  const rawItems = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : [];
  if (!rawItems.length) {
    return { available: false, source: provider, symbol, reason: `No upcoming events returned for ${symbol}.` };
  }

  const items = rawItems.slice(0, 12).map(normalizeEvent).filter(Boolean);
  if (!items.length) {
    return { available: false, source: provider, symbol, reason: 'Event data was malformed.' };
  }

  return { available: true, partial: false, source: provider, symbol, items };
}
