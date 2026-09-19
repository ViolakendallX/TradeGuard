/**
 * Events & Catalysts section (Phase 3).
 *
 * Kept as a distinct section from Market Context — the two are separate stages
 * with separate providers and separate availability, and merging them would hide
 * which source failed.
 *
 * An unconfigured or failing events provider produces the explicit unavailable
 * state with its reason; no events are invented.
 */

import { UnavailableNotice } from './primitives.jsx';

export default function EventsPanel({ research }) {
  const e = research?.events;

  if (!e || e.available === false) {
    return <UnavailableNotice reason={e?.reason} />;
  }

  return (
    <div className="inv-detail">
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
      <div className="stage__meta">
        Source: {e.source}
        {e.partial ? ' · partial data' : ''}
      </div>
    </div>
  );
}
