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
import { fetchResearch, fetchThesisAttack } from '../lib/api.js';

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

function StageItem({ stage, research, attack }) {
  const runtime = stageRuntimeState(stage, research, attack);
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

    // Backend unreachable: neither research nor the thesis attack can run.
    if (submission.offline) {
      setResearch({
        market: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
        events: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
      });
      setAttack({ available: false, reason: 'Backend offline — the thesis attack requires the TradeGuard API.' });
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
            if (cancelled) return;
            setAttack(a.ok ? a.data.analysis : { available: false, reason: a.message });
          })
          .catch((e) => {
            if (!cancelled) setAttack({ available: false, reason: String(e?.message || e) });
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
  const completed = completedStageCountFromResearch(research, attack);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard gathers live market and event research for this trade, then runs the Devil's
          Advocate: a deliberate search for evidence that could make your thesis wrong. Where a data
          source is unavailable, it says so honestly rather than guessing.
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
                <StageItem key={stage.id} stage={stage} research={research} attack={attack} />
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
