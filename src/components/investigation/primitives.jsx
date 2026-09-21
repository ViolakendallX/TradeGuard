/**
 * Small presentational primitives shared by the investigation panels.
 *
 * These were previously private helpers inside InvestigationScreen.jsx. They are
 * extracted so the split panels render identical markup without duplication.
 * No state, no data fetching, no phase logic.
 *
 * PRESENTATION ONLY. Nothing here decides anything, scores anything or fills in
 * a value that the analysis did not produce.
 */

import { STAGE_RUNTIME } from '../../lib/investigation.js';
import Icon from '../Icon.jsx';
import { runtimeModifier } from '../../lib/investigationView.js';

/**
 * Tone -> class. `up`/`down` are the market-magnitude tones; `bullish`/`bearish`
 * are the trade-direction tones (green / red). They are separate on purpose: a
 * direction is not a price change, and they read from different tokens.
 */
const TONE_CLASSES = { up: 'is-up', down: 'is-down', bullish: 'is-bullish', bearish: 'is-bearish' };

/** One label/value row in a `.data-grid`. */
export function DataRow({ label, value, tone }) {
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd className={TONE_CLASSES[tone] || ''}>{value}</dd>
    </div>
  );
}

/* ============================================================
   STATUS BADGES
   Icon + text + colour. Never colour alone: a badge must still be
   readable by someone who cannot separate the hues.
   ============================================================ */

/** Runtime state -> (badge kind, icon). The mapping lives here, once. */
const RUNTIME_BADGE = {
  [STAGE_RUNTIME.COMPLETE]: { kind: 'complete', icon: 'check' },
  [STAGE_RUNTIME.PARTIAL]: { kind: 'partial', icon: 'alert' },
  [STAGE_RUNTIME.UNAVAILABLE]: { kind: 'unavailable', icon: 'gap' },
  [STAGE_RUNTIME.LOCKED]: { kind: 'locked', icon: 'lock' },
  [STAGE_RUNTIME.LOADING]: { kind: 'pending', icon: 'info' },
};

/**
 * A status badge in the system's own language.
 * `rest` is spread onto the element so callers keep the `data-*` markers the
 * verification harnesses read.
 */
export function Badge({ kind = 'available', icon, label, dot = false, className = '', ...rest }) {
  return (
    <span
      className={`tg-badge tg-badge--${kind} ${className}`.trim()}
      data-badge={kind}
      {...rest}
    >
      {icon ? <Icon name={icon} size={12} /> : dot ? <span className="tg-badge__dot" /> : null}
      {label}
    </span>
  );
}

/**
 * Runtime-status badge. Reuses the established `stage__status--*` styling so
 * the existing navigation colour language is preserved, while carrying the new
 * badge's icon and shape.
 */
export function StatusBadge({ runtime, label }) {
  const mapped = RUNTIME_BADGE[runtime] || { kind: 'unavailable', icon: 'gap' };
  return (
    <span
      className={`stage__status stage__status--${runtimeModifier(runtime)} tg-badge tg-badge--${mapped.kind}`}
      data-badge={mapped.kind}
    >
      <Icon name={mapped.icon} size={12} />
      {label}
    </span>
  );
}

/* ============================================================
   CARD TYPES — different purposes, different faces
   ============================================================ */

/**
 * A titled block of content in one of the system's card types:
 * primary | evidence | warning | success | data | metric | insight | gap | unavailable
 */
export function PanelCard({ type = 'data', title, hint, icon, accent, children, className = '' }) {
  return (
    <div
      className={`tg-card tg-card--${type} ${className}`.trim()}
      data-accent={accent}
      data-card-type={type}
    >
      {(title || icon) && (
        <div className="tg-card__head">
          {icon && (
            <span className="tg-card__icon" aria-hidden="true">
              <Icon name={icon} size={15} />
            </span>
          )}
          {title && (
            <div className="tg-card__titles">
              <div className="tg-card__title">{title}</div>
              {hint && <div className="tg-card__hint">{hint}</div>}
            </div>
          )}
        </div>
      )}
      <div className="tg-card__body">{children}</div>
    </div>
  );
}

/** One large number with its label — the risk terminal's unit of display. */
export function Metric({ label, value, tone, note }) {
  return (
    <div className="tg-card tg-card--metric" data-card-type="metric">
      <div className={`tg-metric__value${tone ? ` is-${tone}` : ''}`}>{value}</div>
      <div className="tg-metric__label">{label}</div>
      {note && <div className="tg-metric__note">{note}</div>}
    </div>
  );
}

/**
 * The single honest shape for "we could not get this data".
 * Used by every panel that depends on an external provider.
 */
export function UnavailableNotice({ reason }) {
  return (
    <div className="tg-card tg-card--unavailable" data-card-type="unavailable">
      <div className="tg-card__head">
        <span className="tg-card__icon" aria-hidden="true">
          <Icon name="gap" size={15} />
        </span>
        <div className="tg-card__titles">
          <div className="tg-card__title">Data unavailable</div>
        </div>
      </div>
      <div className="tg-card__body">
        {reason || 'This source could not be reached, so nothing is shown here rather than an estimate.'}
      </div>
    </div>
  );
}

/**
 * A titled evidence list. Shared by the Devil's Advocate sections and the
 * historical "missing information" section.
 *
 * With no usable data the empty state must say the evidence could not be
 * ASSESSED — never that it was assessed and came back clean.
 */
export function EvidenceSection({ title, tone, items, empty, emptyDataLimited, dataLimited, ordered }) {
  const list = Array.isArray(items) ? items : [];
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
