/**
 * Market Context section (Phase 3).
 *
 * Renders the market research already retrieved by the investigation — the same
 * fields, in the same order, as the previous inline detail. Only the wrapper
 * changed (the panel shell now supplies the heading and status badge).
 *
 * The range meter is drawn FROM the retrieved high / low / price, not from an
 * invented series: it shows where the last price sits inside the 24h range the
 * provider actually returned. When any one of the three is missing the meter is
 * not drawn at all, because a meter placed from a guessed low would be
 * decoration dressed up as data.
 *
 * When the provider is unreachable the section reports the explicit unavailable
 * state with its reason; no numbers are substituted.
 */

import { fmt, pct, changeTone } from '../../lib/investigationView.js';
import { DataRow, UnavailableNotice, Metric } from './primitives.jsx';

/**
 * Where the last price sits in the 24h range, as a percentage.
 * Returns null when the three numbers needed to place it are not all present.
 */
function rangePosition(price, low, high) {
  const nums = [price, low, high].map((n) =>
    typeof n === 'number' && Number.isFinite(n) ? n : null
  );
  if (nums.some((n) => n === null)) return null;
  const [p, lo, hi] = nums;
  if (hi <= lo) return null;
  const clamped = Math.min(Math.max(p, lo), hi);
  return ((clamped - lo) / (hi - lo)) * 100;
}

export default function MarketPanel({ research }) {
  const m = research?.market;

  if (!m || m.available === false) {
    return <UnavailableNotice reason={m?.reason} />;
  }

  const position = rangePosition(m.price, m.low24h, m.high24h);
  const tone24h =
    m.change24hPct == null
      ? undefined
      : Number(m.change24hPct) > 0
      ? 'up'
      : Number(m.change24hPct) < 0
      ? 'down'
      : undefined;

  return (
    <div className="inv-detail" data-accent="market">
      {/* The numbers a trader looks at first. */}
      <div className="metric-grid">
        <Metric
          label="Last price"
          value={m.price != null ? `${fmt(m.price)} ${m.currency || 'USDT'}` : '—'}
        />
        <Metric label="24h change" value={pct(m.change24hPct)} tone={tone24h} />
        <Metric
          label="Realized vol (1h)"
          value={m.volatilityPct != null ? `${m.volatilityPct}%` : '—'}
        />
        <Metric label="Quote volume" value={fmt(m.quoteVolume)} />
      </div>

      {/* A chart surface that only ever draws what was retrieved. */}
      {position !== null && (
        <div className="tg-card tg-card--data market-range" data-card-type="data">
          <div className="market-range__head">
            <span className="market-range__title">Position in the 24h range</span>
            <span className="market-range__legend">
              <span className="market-range__bound">Low {fmt(m.low24h)}</span>
              <span className="market-range__bound">High {fmt(m.high24h)}</span>
            </span>
          </div>

          <div className="market-range__track" role="presentation">
            <div className="market-range__fill" style={{ '--pos': `${position}%` }} />
            <div className="market-range__marker" style={{ left: `${position}%` }}>
              <span className="market-range__marker-value">{fmt(m.price)}</span>
            </div>
          </div>

          <p className="market-range__note">
            {m.symbol} last traded at {fmt(m.price)} — {position.toFixed(0)}% of the way up the 24h
            range the provider returned.
          </p>
        </div>
      )}

      {/* The full field set, unchanged. */}
      <div className="tg-card tg-card--data" data-card-type="data">
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
      </div>

      <div className="stage__meta">
        Source: {m.source} · {m.timestamp ? `Updated ${m.timestamp}` : 'timestamp unavailable'}
        {m.partial ? ' · partial data' : ''}
      </div>
    </div>
  );
}
