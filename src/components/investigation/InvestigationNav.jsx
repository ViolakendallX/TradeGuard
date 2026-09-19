/**
 * Investigation navigation rail.
 *
 * Replaces the old single vertical stack: each investigation stage becomes a
 * selectable section instead of a block appended to one long page, so the user
 * can move straight to a section without scrolling through the ones above it.
 *
 * The items are generated from the declared stages (see buildSectionNav), so the
 * phase logic and the completion rules are unchanged — locked stages are still
 * listed and still report "Coming in Phase N", they are simply not selectable.
 */

import { STAGE_RUNTIME } from '../../lib/investigation.js';
import { StatusBadge } from './primitives.jsx';

export default function InvestigationNav({ sections, activeId, onSelect, completed, total, locked }) {
  return (
    <nav className="inv-nav" aria-label="Investigation sections">
      <div className="inv-nav__head">
        <div className="inv-nav__title">Investigation</div>
        <p className="inv-nav__meta">
          {completed} of {total} stages with data
          {locked > 0 ? ` · ${locked} arrive in later phases.` : '.'}
        </p>
      </div>

      <ul className="inv-nav__list">
        {sections.map((section, index) => {
          const isActive = section.id === activeId;
          const isLocked = !section.selectable;
          const isResolved = section.runtime !== STAGE_RUNTIME.LOADING;

          const icon =
            section.runtime === STAGE_RUNTIME.COMPLETE || section.runtime === STAGE_RUNTIME.PARTIAL ? (
              '✓'
            ) : isResolved ? (
              '○'
            ) : (
              <span className="spinner" aria-hidden="true" />
            );

          return (
            <li key={section.id}>
              <button
                type="button"
                className={`inv-nav__item inv-nav__item--${section.runtime}${
                  isActive ? ' is-active' : ''
                }`}
                data-section={section.id}
                onClick={() => onSelect(section.id)}
                disabled={isLocked}
                aria-current={isActive ? 'true' : undefined}
                title={isLocked ? `${section.label} — not built yet (phase ${section.stage.phase})` : undefined}
              >
                <span className="stage__icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="inv-nav__body">
                  <span className="inv-nav__label">
                    <span className="inv-nav__index">{index + 1}</span>
                    <span className="stage__label">{section.label}</span>
                  </span>
                  <StatusBadge runtime={section.runtime} label={section.statusLabel} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
