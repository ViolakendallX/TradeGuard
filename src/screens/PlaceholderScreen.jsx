import { NAV_ITEMS } from '../lib/constants.js';

export default function PlaceholderScreen({ screenId, onNavigate }) {
  const item = NAV_ITEMS.find((entry) => entry.id === screenId);

  return (
    <div className="placeholder-screen">
      <div>
        <div className="placeholder-screen__badge">Planned · Phase {item?.phase ?? '—'}</div>
        <h1 className="placeholder-screen__title">{item?.label ?? 'Screen'}</h1>
        <p className="placeholder-screen__text">
          This screen is part of a later phase of TradeGuard and has not been built yet. The
          current build covers Phase 1 — the Trade Idea screen only.
        </p>
        <p style={{ marginTop: 20 }}>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate('trade-idea')}>
            Back to Trade Idea
          </button>
        </p>
      </div>
    </div>
  );
}
