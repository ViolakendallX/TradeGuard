import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import { NAV_ITEMS, NAV_GROUPS } from '../lib/constants.js';
import { INVESTIGATION_STAGES, STAGE_STYLE } from '../lib/investigation.js';

// Phases that are actually built. Every phase through 13 has landed, so nothing
// in the sidebar is locked — the mechanism stays because it is the honest way to
// mark a screen that does not exist yet, rather than pretending it works.
const CURRENT_PHASE = 13;

/**
 * The eight analysis stages, as a colour legend.
 *
 * This is NOT a second navigation. The stages are selected by the rail inside
 * the Investigation workspace, and duplicating that control here would give the
 * trader two places to do the same thing — and two places for the two to
 * disagree. What the sidebar needs is the *vocabulary*: which hue belongs to
 * which stage, so the rail is already familiar the first time it is opened.
 *
 * The names live in the group's caption; the pips carry the colours.
 */
const ANALYSIS_PIPELINE = INVESTIGATION_STAGES.filter(
  (stage) => stage.id !== 'human-decision' && stage.id !== 'paper-execution'
).map((stage) => ({
  id: stage.id,
  label: stage.label,
  accent: STAGE_STYLE[stage.id]?.accent ?? 'thesis',
}));

/**
 * The workflow sidebar.
 *
 * Its job is to teach the product's structure, so it is built from four things:
 *
 *   1. GROUPING — four labelled, captioned groups separated by rules, so the
 *      hierarchy is visible before any single item is read.
 *   2. ACCENT — every item carries its section hue, applied as ONE custom
 *      property (`--section-accent`) that the icon, the active background, the
 *      edge and the glow all read. Nothing here hardcodes a colour.
 *   3. THE PIPELINE LEGEND — the eight analysis stages as accent pips, so the
 *      colour language is legible before the rail is ever opened.
 *   4. QUIET INACTIVE ITEMS — only the active item is loud. Colour is spent on
 *      where the trader is, not on everything else.
 *
 * The sidebar ends after the navigation. It used to carry a "Build status" card
 * (backend connected, phases 1–13 complete) — that was developer information in
 * a trader-facing product, so it is gone, and `apiOnline` went with it. The live
 * API indicator still lives in the topbar, which is where a status belongs.
 */
export default function Sidebar({ activeId, onNavigate }) {
  const byId = new Map(NAV_ITEMS.map((item) => [item.id, item]));

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo size="md" showTagline />
      </div>

      <nav className="nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div className="nav__group" key={group.id} data-nav-group={group.id}>
            <div className="nav__label">{group.label}</div>
            {group.caption && <div className="nav__caption">{group.caption}</div>}

            {/* The analysis group's caption names the eight stages; this row
                gives each name its colour. It sits directly under the caption
                so the two read as one legend.
                Decorative by design — the rail inside the Investigation
                workspace is the control, and the caption carries the words. */}
            {group.id === 'analysis' && (
              <div className="nav__pipeline" aria-hidden="true">
                {ANALYSIS_PIPELINE.map((stage) => (
                  <span
                    key={stage.id}
                    className="nav__pip"
                    style={{ '--pip-hue': `var(--sec-${stage.accent})` }}
                    title={stage.label}
                  />
                ))}
              </div>
            )}

            <div className="nav__items">
              {group.items.map((id) => {
                const item = byId.get(id);
                if (!item) return null;

                const isActive = item.id === activeId;
                const isAvailable = item.phase <= CURRENT_PHASE;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav__item${isActive ? ' is-active' : ''}`}
                    data-accent={item.accent}
                    data-nav-item={item.id}
                    onClick={() => onNavigate(item.id)}
                    disabled={!isAvailable}
                    aria-current={isActive ? 'page' : undefined}
                    title={isAvailable ? item.label : `${item.label} — available from phase ${item.phase}`}
                  >
                    <span className="nav__icon">
                      <Icon name={item.icon} size={17} />
                    </span>
                    <span className="nav__text">{item.label}</span>
                    {isActive && <span className="nav__edge" aria-hidden="true" />}
                    {!isAvailable && <span className="nav__badge">Phase {item.phase}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
