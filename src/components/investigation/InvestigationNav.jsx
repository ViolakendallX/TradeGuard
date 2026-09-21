/**
 * Investigation horizontal stage navigation — a compact progress bar.
 *
 * The eight analysis stages (thesis → market → events → attack → history →
 * risk → structure → report) are shown as one horizontal strip that stays
 * pinned beneath the trade header, so the trader can jump between stages
 * without ever scrolling past the ones above. Human Decision and Paper
 * Execution are deliberately NOT part of this bar — they are distinct workflow
 * steps with their own screens, surfaced here only as a "next step" affordance
 * (the footer) so they never compete with the analysis stages for space.
 *
 * Items are generated from buildSectionNav, so the bar can never drift from the
 * stage model: locked stages are still listed (so the trader can see what is
 * coming) but remain unselectable.
 */

function gateView(gate) {
  if (!gate) return { label: 'Paper execution: evaluating…', mod: 'loading' };
  if (gate.available === false) return { label: 'Paper execution: unavailable', mod: 'unavailable' };
  switch (gate.status) {
    case 'ready':
      return { label: 'Paper execution: ready to confirm', mod: 'ready' };
    case 'submitted':
      return { label: 'Paper order submitted', mod: 'submitted' };
    case 'failed':
      return { label: 'Paper order failed', mod: 'unavailable' };
    case 'locked':
    default:
      return { label: 'Paper execution: locked', mod: 'locked' };
  }
}

import Icon from '../Icon.jsx';
import { STAGE_STYLE } from '../../lib/investigation.js';

export default function InvestigationNav({
  sections,
  activeId,
  onSelect,
  completed,
  total,
  locked,
  gate,
  decision,
  onNavigate,
}) {
  const gv = gateView(gate);
  const decisionRecorded = Boolean(decision && decision.status === 'recorded');

  return (
    <nav className="inv-nav" aria-label="Investigation stages">
      <div className="inv-nav__head">
        <span className="inv-nav__title">Investigation</span>
        <span className="inv-nav__meta">
          {completed} of {total} stages with data
          {locked > 0 ? ` · ${locked} not available in this build` : ''}
        </span>
      </div>

      <ul className="inv-nav__list">
        {sections.map((section, index) => {
          const isActive = section.id === activeId;
          const isLocked = !section.selectable;
          const style = STAGE_STYLE[section.id] ?? { accent: 'thesis', icon: 'thesis' };
          return (
            <li className="inv-step" key={section.id}>
              <button
                type="button"
                className={`inv-nav__item inv-nav__item--${section.runtime}${
                  isActive ? ' is-active' : ''
                }`}
                data-accent={style.accent}
                data-stage={section.id}
                onClick={() => onSelect(section.id)}
                disabled={isLocked}
                aria-current={isActive ? 'true' : undefined}
                title={isLocked ? `${section.label} — not available in this build` : section.label}
              >
                <span className="inv-nav__index">{index + 1}</span>
                <span className="inv-nav__icon">
                  <Icon name={style.icon} size={15} />
                </span>
                <span className="inv-nav__label">
                  <span className="stage__label">{section.label}</span>
                </span>
                <span className="inv-nav__dot" aria-hidden="true" />
              </button>
              {index < sections.length - 1 && (
                <span className="inv-nav__sep" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>

      <div className="inv-nav__foot">
        <span className={`inv-gate inv-gate--${gv.mod}`}>
          <span className="inv-gate__dot" aria-hidden="true" />
          {gv.label}
        </span>
        <div className="inv-nav__next">
          <button type="button" className="btn btn--inline" onClick={() => onNavigate('decision')}>
            Record decision →
          </button>
          <button
            type="button"
            className="btn btn--inline"
            onClick={() => onNavigate('paper-execution')}
            disabled={!decisionRecorded}
            title={decisionRecorded ? undefined : 'Record your decision (TAKE) first'}
          >
            Paper execution →
          </button>
        </div>
      </div>
    </nav>
  );
}
