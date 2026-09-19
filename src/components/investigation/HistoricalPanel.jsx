/**
 * Historical Stress Test section (Phase 5).
 *
 * The markup and the copy are unchanged from the inline version — the explicit
 * HISTORICAL DATA UNAVAILABLE state, the historical sample, the current setup,
 * the observed outcomes ("Historical observations in this sample showed…"), the
 * matched setups list, the matching methodology, the limitations and the missing
 * information are all preserved.
 *
 * Only the wrapper changed: the panel shell now supplies the heading and the
 * status badge instead of the stage list item.
 *
 * The Phase 5 matching logic is untouched — it runs entirely in the backend and
 * this component only renders what it returned.
 */

import { fmt, pct, changeTone, bucketLabel } from '../../lib/investigationView.js';
import { DataRow, EvidenceSection } from './primitives.jsx';

export default function HistoricalPanel({ history }) {
  if (!history) return null;

  const missing = Array.isArray(history.missingInformation) ? history.missingInformation : [];
  const limitations = Array.isArray(history.limitations) ? history.limitations : [];

  // --- explicit, honest unavailable state ---------------------------------
  if (history.available === false) {
    return (
      <div className="hs">
        <div className="hs__status">
          <span className="hs__badge hs__badge--unavailable">
            {history.statusLabel || 'HISTORICAL DATA UNAVAILABLE'}
          </span>
        </div>
        <p className="hs__reason">
          {history.reason || 'Historical data could not be retrieved for this asset.'}
        </p>
        <p className="hs__honesty">
          No historical comparison is shown, because none could be computed from real data. TradeGuard
          does not substitute fabricated examples, generic market statistics, made-up win rates or
          assumed outcomes.
        </p>
        {missing.length > 0 && (
          <ul className="hs__missing">
            {missing.map((m) => (
              <li key={m.id || m.title}>
                <strong>{m.title}</strong>
                {m.detail ? ` — ${m.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
        {limitations.length > 0 && (
          <>
            <div className="hs__section-title">Important limitations</div>
            <ul className="hs__limits">
              {limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const cs = history.currentSetup || {};
  const s = history.outcomeSummary;
  const statusClass = String(history.status || '').toLowerCase().replace(/[^a-z]+/g, '-');
  const horizonLabel = `${history.profile?.horizonBars ?? '—'} × ${history.profile?.granularityLabel || '—'}`;
  const dirWord =
    history.direction === 'bearish' ? 'bearish' : history.direction === 'bullish' ? 'bullish' : 'neutral';

  return (
    <div className="hs">
      <div className="hs__status">
        <span className={`hs__badge hs__badge--${statusClass}`}>{history.statusLabel}</span>
        <span className="hs__status-note">
          {history.matchedCount > 0
            ? `${history.matchedCount} matched setup${history.matchedCount === 1 ? '' : 's'} out of ${history.eligibleCandidates} eligible historical windows.`
            : `No match out of ${history.eligibleCandidates} eligible historical windows.`}
        </span>
      </div>

      {history.dataLimited && (
        <div className="hs__notice">
          This result is data-limited, so it should be read with care rather than as a pattern.
          {history.timeframeAssumed
            ? ' No timeframe was supplied, so a default sampling profile was assumed — the outcome horizon may not match your holding period.'
            : ''}
        </div>
      )}

      <div className="hs__grid">
        <section className="hs__section">
          <div className="hs__section-title">Historical sample</div>
          <div className="data-grid">
            <DataRow label="Provider" value={history.source || '—'} />
            <DataRow label="Candle size" value={history.profile?.granularityLabel || '—'} />
            <DataRow label="Bars examined" value={fmt(history.sampleSize)} />
            <DataRow label="Sample from" value={history.sampleFrom || '—'} />
            <DataRow label="Sample to" value={history.sampleTo || '—'} />
            <DataRow label="Setup window" value={`${history.profile?.windowBars ?? '—'} bars`} />
            <DataRow label="Outcome horizon" value={`${horizonLabel} bars`} />
          </div>
        </section>

        <section className="hs__section">
          <div className="hs__section-title">Current setup</div>
          <div className="data-grid">
            <DataRow label="Trend" value={pct(cs.trendPct)} tone={changeTone(cs.trendPct)} />
            <DataRow label="Trend direction" value={bucketLabel(cs.trendDirection)} />
            <DataRow label="Recent move" value={bucketLabel(cs.moveBucket)} />
            <DataRow label="Volatility regime" value={bucketLabel(cs.volRegime)} />
            <DataRow label="Position in range" value={bucketLabel(cs.extremeBucket)} />
            <DataRow label="Realized vol" value={cs.volPct != null ? `${cs.volPct}%` : '—'} />
          </div>
        </section>
      </div>

      {s ? (
        <section className="hs__section hs__section--outcome">
          <div className="hs__section-title">Observed outcomes</div>
          <p className="hs__outcome-text">
            Historical observations in this sample showed a median move of {pct(s.medianMovePct)} over the
            following {horizonLabel} bars: {s.alignedCount} of {s.count} moved in the direction of your{' '}
            {dirWord} thesis, {s.againstCount} moved against it, and {s.flatCount} stayed inside the flat
            band.
          </p>
          <div className="data-grid">
            <DataRow label="Matched setups" value={fmt(s.count)} />
            <DataRow label="Moved with the thesis" value={fmt(s.alignedCount)} />
            <DataRow label="Moved against it" value={fmt(s.againstCount)} />
            <DataRow label="Stayed flat" value={fmt(s.flatCount)} />
            <DataRow label="Median move" value={pct(s.medianMovePct)} />
            <DataRow label="Best / worst move" value={`${pct(s.bestMovePct)} / ${pct(s.worstMovePct)}`} />
            <DataRow label="Median adverse excursion" value={pct(s.medianAdverseExcursionPct)} />
            <DataRow label="Median favourable excursion" value={pct(s.medianFavourableExcursionPct)} />
          </div>
          <p className="hs__caveat">
            These are measurements of what already happened after similar setups — not a forecast, and not
            a claim that this trade will behave the same way.
          </p>
        </section>
      ) : (
        <section className="hs__section hs__section--outcome">
          <div className="hs__section-title">Observed outcomes</div>
          <p className="hs__empty">
            No comparable historical setups were found, so there are no outcomes to report. Nothing has been
            substituted in their place.
          </p>
        </section>
      )}

      {history.observations.length > 0 && (
        <section className="hs__section">
          <div className="hs__section-title">
            Matched historical setups
            <span className="hs__count">{history.observations.length}</span>
          </div>
          <ul className="hs__list">
            {history.observations.map((o) => (
              <li key={o.id} className="hs__item">
                <div className="hs__item-top">
                  <span className="hs__item-date">{o.setupEndTs || '—'}</span>
                  <span
                    className={`hs__item-flag hs__item-flag--${
                      o.flat ? 'flat' : o.aligned ? 'with' : 'against'
                    }`}
                  >
                    {o.flat ? 'stayed flat' : o.aligned ? 'with thesis' : 'against thesis'}
                  </span>
                </div>
                <div className="hs__item-detail">
                  {fmt(o.entryPrice)} → {fmt(o.exitPrice)} · horizon move {pct(o.movePct)} · worst point{' '}
                  {pct(o.adverseExcursionPct)} · best point {pct(o.favourableExcursionPct)}
                </div>
              </li>
            ))}
          </ul>
          {history.matchedCount > history.observations.length && (
            <div className="hs__more">
              Showing the {history.observations.length} most recent of {history.matchedCount} matched setups.
            </div>
          )}
        </section>
      )}

      {history.matching && (
        <section className="hs__section">
          <div className="hs__section-title">Matching methodology</div>
          <p className="hs__method">{history.matching.note}</p>
          <ul className="hs__criteria">
            {(history.matching.criteria || []).map((c) => (
              <li key={c.key}>
                <span className="hs__criterion-label">{c.label}</span>
                <span className="hs__criterion-value">{bucketLabel(c.currentValue)}</span>
                <span className="hs__criterion-values">match requires: {c.values}</span>
              </li>
            ))}
          </ul>
          <div className="hs__meta">
            Historical windows are compared against the current one across the same candle series. Windows
            that overlap the current setup are excluded, and matches are spaced at least{' '}
            {history.matching.minSpacingBars} bars apart so a single move is not counted several times.
            {history.matchFrequencyPct != null &&
              ` This setup matched ${history.matchFrequencyPct}% of the ${history.eligibleCandidates} eligible historical windows. ${history.matchFrequencyNote}`}
          </div>
        </section>
      )}

      {limitations.length > 0 && (
        <section className="hs__section hs__section--limits">
          <div className="hs__section-title">Important limitations</div>
          <ul className="hs__limits">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <EvidenceSection
          title="Missing information"
          tone="missing"
          items={missing}
          empty="None — the historical inputs were available."
        />
      )}

      {history.disclaimer && <div className="stage__meta hs__disclaimer">{history.disclaimer}</div>}
    </div>
  );
}
