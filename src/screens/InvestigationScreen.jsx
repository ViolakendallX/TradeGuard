import { useEffect, useState } from 'react';
import {
  DIRECTIONS,
  TIMEFRAME_LABELS,
  EXISTING_POSITION_LABELS,
  CONFIDENCE_LABELS,
} from '../lib/constants.js';
import {
  INVESTIGATION_STAGES,
  INVESTIGATION_STAGE_COUNT,
  STAGE_RUNTIME,
  stageRuntimeState,
  completedStageCountFromResearch,
  lockedStageCount,
} from '../lib/investigation.js';
import { fetchResearch, fetchThesisAttack, fetchHistoricalStressTest } from '../lib/api.js';

const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };

/**
 * Fallback copy for the interpretation block. The analysis normally supplies its
 * own `interpretationNote`; this keeps the "your thesis, not market evidence"
 * framing visible even if the API response predates that field.
 */
const INTERPRETATION_NOTE =
  "This is TradeGuard's reading of the reasoning you stated in your own thesis — an interpretation of your argument, not verified market or event evidence, and not a statement about what the market will do.";

function fmt(n) {
  if (n === null || n === undefined || n === '') return '—';
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const maxFrac = Math.abs(n) >= 1 ? 2 : 4;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

function pct(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function changeTone(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n > 0 ? 'up' : n < 0 ? 'down' : '';
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not specified';
  if (typeof value === 'number') return fmt(value);
  return String(value);
}

function DataRow({ label, value, tone }) {
  const cls = tone === 'up' ? 'is-up' : tone === 'down' ? 'is-down' : '';
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd className={cls}>{value}</dd>
    </div>
  );
}

function MarketDetail({ research }) {
  const m = research?.market;
  if (!m || m.available === false) {
    return (
      <div className="stage__detail stage__detail--unavailable">
        ⚠ Data unavailable{m?.reason ? ` — ${m.reason}` : '.'}
      </div>
    );
  }
  return (
    <div className="stage__detail">
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

function EventsDetail({ research }) {
  const e = research?.events;
  if (!e || e.available === false) {
    return (
      <div className="stage__detail stage__detail--unavailable">
        ⚠ Data unavailable{e?.reason ? ` — ${e.reason}` : '.'}
      </div>
    );
  }
  return (
    <div className="stage__detail">
      <ul className="event-list">
        {e.items.map((it, i) => (
          <li key={i} className="event-item">
            <div className="event-item__top">
              <span className="event-item__title">{it.title}</span>
              {it.date && <span className="event-item__date">{it.date}</span>}
            </div>
            <p className="event-item__desc">{it.description}</p>
            {it.source && <div className="event-item__src">Source: {it.source}</div>}
          </li>
        ))}
      </ul>
      <div className="stage__meta">Source: {e.source}{e.partial ? ' · partial data' : ''}</div>
    </div>
  );
}

function EvidenceSection({ title, tone, items, empty, emptyDataLimited, dataLimited, ordered }) {
  const list = Array.isArray(items) ? items : [];
  // With no usable data the empty state must say the evidence could not be
  // ASSESSED — never that it was assessed and came back clean.
  const emptyText = list.length === 0 && dataLimited && emptyDataLimited ? emptyDataLimited : empty;
  return (
    <div className={`da__section da__section--${tone}`}>
      <div className="da__section-title">
        {title}
        <span className="da__count">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="da__empty">{emptyText}</p>
      ) : (
        <ul className="da__list">
          {list.map((it, i) => (
            <li key={it.id || `${tone}-${i}`} className="da__item">
              <div className="da__item-title">
                {ordered && <span className="da__item-index">{i + 1}</span>}
                {it.title}
              </div>
              <p className="da__item-detail">{it.detail}</p>
              {it.source && <div className="da__item-src">Source: {it.source}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DevilsAdvocateDetail({ attack }) {
  if (!attack) return null;

  if (attack.available === false) {
    return (
      <div className="stage__detail stage__detail--unavailable">
        ⚠ Analysis unavailable{attack.reason ? ` — ${attack.reason}` : '.'}
      </div>
    );
  }

  const strength = attack.evidenceStrength || { label: 'insufficient evidence', basis: '' };
  const strengthClass = String(strength.label || '').toLowerCase().replace(/\s+/g, '-');
  const counter = attack.strongestCounterargument;

  return (
    <div className="stage__detail da">
      <div className="da__strength">
        <span className={`da__badge da__badge--${strengthClass}`}>{strength.label}</span>
        <span className="da__basis">Evidence strength — {strength.basis}</span>
      </div>

      {attack.summary && <p className="da__summary">{attack.summary}</p>}

      {attack.dataLimited && (
        <div className="da__notice">
          TradeGuard could not retrieve usable market/event data, so this pass is data-limited. The
          sections below report what is missing rather than inventing evidence.
        </div>
      )}

      {counter && (
        <div className="da__callout">
          <div className="da__callout-label">Strongest argument against the trade</div>
          <div className="da__callout-title">{counter.title}</div>
          {counter.basis === 'insufficient-evidence' && (
            <div className="da__callout-basis">
              Basis: no usable evidence either way — the thesis is unconfirmed, not supported
            </div>
          )}
          <p className="da__callout-detail">{counter.detail}</p>
        </div>
      )}

      <div className="da__grid">
        <EvidenceSection
          title="Supporting evidence"
          tone="support"
          items={attack.supporting}
          empty="No supporting market or event signal was found in the available data."
          emptyDataLimited="Supporting evidence could not be assessed — no usable market or event data was available. This is not a supporting signal."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Contradicting evidence"
          tone="contradict"
          items={attack.contradicting}
          empty="No material contradicting evidence was found in the available data."
          emptyDataLimited="Contradicting evidence could not be assessed — no usable market or event data was available, and none has been invented to fill the gap."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Key risks"
          tone="risk"
          items={attack.keyRisks}
          empty="No specific risks could be derived from the available data."
          emptyDataLimited="No specific risks could be derived — no usable market or event data was available."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Invalidation conditions"
          tone="invalidation"
          items={attack.invalidationConditions}
          empty="No invalidation conditions could be derived from the available data."
          ordered
        />
        <EvidenceSection
          title="Missing information"
          tone="missing"
          items={attack.missingInformation}
          empty="None — all expected inputs were available."
        />
      </div>

      {(attack.interpretation || (attack.assumptions && attack.assumptions.length > 0)) && (
        <div className="da__interpretation">
          <div className="section-label">How TradeGuard read your thesis</div>
          <div className="da__interpretation-note">
            {attack.interpretationNote || INTERPRETATION_NOTE}
          </div>
          {attack.interpretation && <p className="da__interpretation-text">{attack.interpretation}</p>}
          {attack.assumptions && attack.assumptions.length > 0 && (
            <>
              <div className="da__assumptions-label">Assumptions your thesis depends on</div>
              <ul className="da__assumptions">
                {attack.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {attack.disclaimer && <div className="stage__meta da__disclaimer">{attack.disclaimer}</div>}
    </div>
  );
}

const BUCKET_LABELS = {
  up: 'Up',
  down: 'Down',
  flat: 'Flat',
  modest: 'Modest',
  extended: 'Extended',
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  'near-high': 'Near the recent high',
  'near-low': 'Near the recent low',
  mid: 'Mid-range',
  unknown: 'Not assessable',
};

function bucketLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  return BUCKET_LABELS[value] || String(value);
}

function HistoricalStressTestDetail({ history }) {
  if (!history) return null;

  const missing = Array.isArray(history.missingInformation) ? history.missingInformation : [];
  const limitations = Array.isArray(history.limitations) ? history.limitations : [];

  // --- explicit, honest unavailable state ---------------------------------
  if (history.available === false) {
    return (
      <div className="stage__detail hs">
        <div className="hs__status">
          <span className="hs__badge hs__badge--unavailable">
            {history.statusLabel || 'HISTORICAL DATA UNAVAILABLE'}
          </span>
        </div>
        <p className="hs__reason">{history.reason || 'Historical data could not be retrieved for this asset.'}</p>
        <p className="hs__honesty">
          No historical comparison is shown, because none could be computed from real data. TradeGuard does not
          substitute fabricated examples, generic market statistics, made-up win rates or assumed outcomes.
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
    <div className="stage__detail hs">
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
            following {horizonLabel} bars: {s.alignedCount} of {s.count} moved in the direction of your {dirWord}{' '}
            thesis, {s.againstCount} moved against it, and {s.flatCount} stayed inside the flat band.
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
            These are measurements of what already happened after similar setups — not a forecast, and not a claim
            that this trade will behave the same way.
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
            Historical windows are compared against the current one across the same candle series. Windows that
            overlap the current setup are excluded, and matches are spaced at least{' '}
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

function StageItem({ stage, research, attack, history }) {
  const runtime = stageRuntimeState(stage, research, attack, history);
  const isComplete = runtime === STAGE_RUNTIME.COMPLETE;
  const isPartial = runtime === STAGE_RUNTIME.PARTIAL;
  const isUnavailable = runtime === STAGE_RUNTIME.UNAVAILABLE;
  const isLocked = runtime === STAGE_RUNTIME.LOCKED;
  const isLoading = runtime === STAGE_RUNTIME.LOADING;

  const cls = isComplete
    ? 'stage--complete'
    : isPartial
    ? 'stage--partial'
    : isUnavailable
    ? 'stage--unavailable'
    : isLocked
    ? 'stage--locked'
    : 'stage--loading';

  let badge;
  if (isComplete) badge = <span className="stage__status stage__status--done">Complete</span>;
  else if (isPartial) badge = <span className="stage__status stage__status--partial">Partial</span>;
  else if (isUnavailable) badge = <span className="stage__status stage__status--soon">Data unavailable</span>;
  else if (isLocked) badge = <span className="stage__status stage__status--soon">Coming in Phase {stage.phase}</span>;
  else badge = <span className="stage__status stage__status--loading">Loading…</span>;

  const icon = isComplete || isPartial ? '✓' : isLoading ? <span className="spinner" aria-hidden="true" /> : '○';

  return (
    <li className={`stage ${cls}`}>
      <span className="stage__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="stage__body">
        <div className="stage__top">
          <span className="stage__label">{stage.label}</span>
          {badge}
        </div>
        <p className="stage__desc">{stage.description}</p>
        {stage.id === 'market-context' && runtime !== STAGE_RUNTIME.LOADING && <MarketDetail research={research} />}
        {stage.id === 'events-catalysts' && runtime !== STAGE_RUNTIME.LOADING && <EventsDetail research={research} />}
        {stage.id === 'contradicting-evidence' && runtime !== STAGE_RUNTIME.LOADING && (
          <DevilsAdvocateDetail attack={attack} />
        )}
        {stage.id === 'historical-comparisons' && runtime !== STAGE_RUNTIME.LOADING && (
          <HistoricalStressTestDetail history={history} />
        )}
      </div>
    </li>
  );
}

function EmptyInvestigation({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to investigate yet
          </div>
          Submit a trade idea from the Trade Idea screen and TradeGuard will begin examining it here.
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" style={{ width: 'auto' }} onClick={onEdit}>
              Submit a trade idea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvestigationScreen({ submission, onEdit }) {
  const [research, setResearch] = useState(null);
  const [attack, setAttack] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!submission || !submission.idea) return undefined;

    const idea = submission.idea;
    const context = {
      asset: idea.asset,
      direction: idea.direction,
      thesis: idea.thesis,
      timeframe: idea.timeframe,
      entryPrice: idea.entryPrice,
      riskAmount: idea.riskAmount,
      confidence: idea.confidence,
      existingPosition: idea.existingPosition,
    };

    // Backend unreachable: none of the research, attack or historical passes can run.
    if (submission.offline) {
      setResearch({
        market: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
        events: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
      });
      setAttack({ available: false, reason: 'Backend offline — the thesis attack requires the TradeGuard API.' });
      setHistory({
        available: false,
        statusLabel: 'HISTORICAL DATA UNAVAILABLE',
        reason: 'Backend offline — the historical stress test requires the TradeGuard API.',
      });
      return undefined;
    }

    let cancelled = false;

    fetchResearch(context)
      .then((r) => {
        if (cancelled) return undefined;
        const researchData = r.ok
          ? r.data
          : {
              market: { available: false, reason: r.message },
              events: { available: false, reason: r.message },
            };
        setResearch(researchData);

        // Chain the Devil's Advocate pass on the research we just retrieved.
        return fetchThesisAttack(context, { market: researchData.market, events: researchData.events })
          .then((a) => {
            if (cancelled) return undefined;
            setAttack(a.ok ? a.data.analysis : { available: false, reason: a.message });

            // Phase 5 runs after the attack, reusing the same research context.
            return fetchHistoricalStressTest(context, {
              market: researchData.market,
              events: researchData.events,
            })
              .then((h) => {
                if (cancelled) return;
                setHistory(h.ok ? h.data.history : { available: false, reason: h.message });
              })
              .catch((e) => {
                if (!cancelled) setHistory({ available: false, reason: String(e?.message || e) });
              });
          })
          .catch((e) => {
            if (!cancelled) {
              setAttack({ available: false, reason: String(e?.message || e) });
              setHistory({ available: false, reason: String(e?.message || e) });
            }
          });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        setResearch({
          market: { available: false, reason: message },
          events: { available: false, reason: message },
        });
        setAttack({ available: false, reason: message });
        setHistory({ available: false, reason: message });
      });

    return () => {
      cancelled = true;
    };
  }, [submission]);

  if (!submission || !submission.idea) {
    return <EmptyInvestigation onEdit={onEdit} />;
  }

  const idea = submission.idea;
  const direction = DIRECTIONS.find((d) => d.value === idea.direction);
  const completed = completedStageCountFromResearch(research, attack, history);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard gathers live market and event research for this trade, runs the Devil's Advocate — a
          deliberate search for evidence that could make your thesis wrong — then looks for similar past setups and
          what happened afterwards. Where a data source is unavailable, it says so honestly rather than guessing.
        </p>
      </div>

      <div className="invest-layout">
        <section className="card">
          <div className="card__header">
            <div>
              <div className="card__title">What TradeGuard is investigating</div>
              <div className="card__hint">The thesis you submitted from the Trade Idea screen.</div>
            </div>
            <span className={`status-dot${submission.offline ? ' is-offline' : ''}`} />
          </div>
          <div className="card__body">
            <div className="preview__asset">
              <span className="preview__ticker">{idea.asset}</span>
              {direction && (
                <span className={`chip ${TONE_CLASS[direction.value] ?? 'chip--neutral'}`}>
                  {direction.label}
                </span>
              )}
            </div>

            <p className="preview__thesis">{idea.thesis}</p>

            <div className="divider" />

            <dl className="kv">
              <dt>Timeframe</dt>
              <dd className={idea.timeframe ? '' : 'is-empty'}>
                {idea.timeframe ? TIMEFRAME_LABELS[idea.timeframe] ?? idea.timeframe : 'Not specified'}
              </dd>

              <dt>Entry price</dt>
              <dd className={idea.entryPrice === null || idea.entryPrice === '' ? 'is-empty' : ''}>
                {formatValue(idea.entryPrice)}
              </dd>

              <dt>Risk amount</dt>
              <dd className={idea.riskAmount === null || idea.riskAmount === '' ? 'is-empty' : ''}>
                {formatValue(idea.riskAmount)}
              </dd>

              <dt>Confidence</dt>
              <dd>
                {idea.confidence != null
                  ? `${idea.confidence}/10 · ${CONFIDENCE_LABELS[idea.confidence]}`
                  : 'Not specified'}
              </dd>

              <dt>Existing position</dt>
              <dd className={idea.existingPosition ? '' : 'is-empty'}>
                {idea.existingPosition
                  ? EXISTING_POSITION_LABELS[idea.existingPosition] ?? idea.existingPosition
                  : 'Not specified'}
              </dd>
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Investigation progress</div>
              <div className="card__hint">
                {completed} of {INVESTIGATION_STAGE_COUNT} stages with data · {lockedStageCount()} arrive in
                later phases.
              </div>
            </div>
          </div>
          <div className="card__body">
            <ul className="invest-stages">
              {INVESTIGATION_STAGES.map((stage) => (
                <StageItem key={stage.id} stage={stage} research={research} attack={attack} history={history} />
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="invest-actions">
        <button type="button" className="btn btn--primary" onClick={onEdit}>
          Edit thesis
        </button>
        {submission.offline && (
          <p className="invest-actions__note">
            Captured locally — the TradeGuard backend was not reachable, so nothing was validated or
            analysed server-side.
          </p>
        )}
      </div>
    </>
  );
}
