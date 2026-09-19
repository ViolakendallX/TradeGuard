/**
 * Small presentational primitives shared by the investigation panels.
 *
 * These were previously private helpers inside InvestigationScreen.jsx. They are
 * extracted so the split panels render identical markup without duplication.
 * No state, no data fetching, no phase logic.
 */

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

/**
 * The single honest shape for "we could not get this data".
 * Used by every panel that depends on an external provider.
 */
export function UnavailableNotice({ reason }) {
  return (
    <div className="inv-unavailable">
      ⚠ Data unavailable{reason ? ` — ${reason}` : '.'}
    </div>
  );
}

/** Runtime-status badge. Reuses the established `stage__status--*` styling. */
export function StatusBadge({ runtime, label }) {
  return (
    <span className={`stage__status stage__status--${runtimeModifier(runtime)}`}>{label}</span>
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
