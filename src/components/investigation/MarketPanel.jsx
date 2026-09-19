/**
 * Market Context section (Phase 3).
 *
 * Renders the market research already retrieved by the investigation — the same
 * fields, in the same order, as the previous inline detail. Only the wrapper
 * changed (the panel shell now supplies the heading and status badge).
 *
 * When the provider is unreachable the section reports the explicit unavailable
 * state with its reason; no numbers are substituted.
 */

import { fmt, pct, changeTone } from '../../lib/investigationView.js';
import { DataRow, UnavailableNotice } from './primitives.jsx';

export default function MarketPanel({ research }) {
  const m = research?.market;

  if (!m || m.available === false) {
    return <UnavailableNotice reason={m?.reason} />;
  }

  return (
    <div className="inv-detail">
      <div className="data-grid">
        <DataRow label="Symbol" value={m.symbol} />
        <DataRow label="Price" value={m.price != null ? `${fmt(m.price)} ${m.currency || 'USDT'}` : '—'} />
        <DataRow
          label="Change (UTC open)"
          value={pct(m.changeSinceOpenPct)}
          tone={changeTone(m.changeSinceOpenPct)}
        />
        <DataRow label="24h change" value={pct(m.change24hPct)} tone={changeTone(m.change24hPct)} />
        <DataRow label="24h high" value={fmt(m.high24h)} />
        <DataRow label="24h low" value={fmt(m.low24h)} />
        <DataRow label="Volume (quote)" value={fmt(m.quoteVolume)} />
        <DataRow label="Realized vol (1h)" value={m.volatilityPct != null ? `${m.volatilityPct}%` : '—'} />
        <DataRow label="Trend (window)" value={pct(m.trendPercent)} tone={changeTone(m.trendPercent)} />
        <DataRow label="Trend bias" value={m.trendDirection ? m.trendDirection.toUpperCase() : '—'} />
      </div>

      <div className="stage__meta">
        Source: {m.source} · {m.timestamp ? `Updated ${m.timestamp}` : 'timestamp unavailable'}
        {m.partial ? ' · partial data' : ''}
      </div>
    </div>
  );
}
