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
import { fetchResearch } from '../lib/api.js';

const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };

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

function StageItem({ stage, research }) {
  const runtime = stageRuntimeState(stage, research);
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

  useEffect(() => {
    if (!submission || !submission.idea) return undefined;

    // Backend unreachable: research cannot be fetched — show honest unavailable.
    if (submission.offline) {
      setResearch({
        market: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
        events: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
      });
      return undefined;
    }

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

    let cancelled = false;
    fetchResearch(context)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setResearch(r.data);
        } else {
          setResearch({
            market: { available: false, reason: r.message },
            events: { available: false, reason: r.message },
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        setResearch({
          market: { available: false, reason: message },
          events: { available: false, reason: message },
        });
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
  const completed = completedStageCountFromResearch(research);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard is now gathering live market and event research for this trade before you risk
          capital. Where a data source is unavailable, it says so honestly rather than guessing.
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
                <StageItem key={stage.id} stage={stage} research={research} />
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
