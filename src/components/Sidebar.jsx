import { NAV_ITEMS } from '../lib/constants.js';

// Phases that are actually built. Everything at or below this is interactive;
// later phases remain disabled until their phase lands.
const CURRENT_PHASE = 10;

export default function Sidebar({ activeId, onNavigate, apiOnline }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">TG</div>
        <div>
          <div className="brand__name">TradeGuard</div>
          <div className="brand__tag">Trading decision desk</div>
        </div>
      </div>

      <nav className="nav" aria-label="Main navigation">
        <div className="nav__label">Decision flow</div>
        {NAV_ITEMS.map((item, index) => {
          const isActive = item.id === activeId;
          const isAvailable = item.phase <= CURRENT_PHASE;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav__item${isActive ? ' is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              disabled={!isAvailable}
              aria-current={isActive ? 'page' : undefined}
              title={isAvailable ? item.label : `${item.label} — not built yet (phase ${item.phase})`}
            >
              <span className="nav__index">{index + 1}</span>
              <span className="nav__text">{item.label}</span>
              {!isAvailable && <span className="nav__badge">Phase {item.phase}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__footer-title">Build status</div>
        <div className="sidebar__footer-text">
          <span className={`status-dot${apiOnline ? '' : ' is-offline'}`} />
          {apiOnline ? 'Backend connected' : 'Backend offline'}
          <br />
          Phase 10 — Paper execution. The Devil's Advocate challenges your thesis, history shows what followed
          similar past setups, the risk engine calculates the defined risk from your own entry, invalidation
          and risk budget, the trade structure brings it all together into one plan, the final report
          consolidates the whole investigation into a single report, you record your own decision —
          TradeGuard records it, it does not make it — and only then can you confirm paper execution, which
          sends the trade to Bitget Demo with virtual funds. No live-money order is ever placed.
        </div>
      </div>
    </aside>
  );
}
