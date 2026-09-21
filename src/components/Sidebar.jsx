import { NAV_ITEMS, NAV_GROUPS } from '../lib/constants.js';

// Phases that are actually built. Every phase through 13 has landed, so nothing
// in the sidebar is locked — the mechanism stays because it is the honest way to
// mark a screen that does not exist yet, rather than pretending it works.
const CURRENT_PHASE = 13;

export default function Sidebar({ activeId, onNavigate, apiOnline }) {
  const byId = new Map(NAV_ITEMS.map((item) => [item.id, item]));

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
        {NAV_GROUPS.map((group) => (
          <div className="nav__group" key={group.id}>
            <div className="nav__label">{group.label}</div>
            {group.caption && <div className="nav__caption">{group.caption}</div>}

            {group.items.map((id, index) => {
              const item = byId.get(id);
              if (!item) return null;

              const isActive = item.id === activeId;
              const isAvailable = item.phase <= CURRENT_PHASE;
              const step = NAV_ITEMS.findIndex((entry) => entry.id === item.id) + 1;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav__item${isActive ? ' is-active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  disabled={!isAvailable}
                  aria-current={isActive ? 'page' : undefined}
                  title={isAvailable ? item.label : `${item.label} — available from phase ${item.phase}`}
                >
                  <span className="nav__index">{step}</span>
                  <span className="nav__text">{item.label}</span>
                  {!isAvailable && <span className="nav__badge">Phase {item.phase}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__footer-title">Build status</div>
        <div className="sidebar__footer-text">
          <span className={`status-dot${apiOnline ? '' : ' is-offline'}`} />
          {apiOnline ? 'Backend connected' : 'Backend offline'}
          <br />
          Phases 1–13 complete. TradeGuard challenges your trade thesis before you risk capital — and
          stops there. The decision is always yours, no live-money order is ever placed, and no profit
          or loss is shown unless a venue actually reported one.
        </div>
      </div>
    </aside>
  );
}
