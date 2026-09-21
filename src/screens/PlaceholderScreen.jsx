import { NAV_ITEMS } from '../lib/constants.js';

/**
 * The honest fallback for a screen id that is not part of the workflow.
 *
 * Every screen in NAV_ITEMS is built, so this is not a "coming later" screen —
 * it is what the trader sees if the URL carries an id TradeGuard does not know.
 * Saying so plainly is better than a stale "planned phase" notice that would
 * describe work which no longer exists.
 */
export default function PlaceholderScreen({ screenId, onNavigate }) {
  const item = NAV_ITEMS.find((entry) => entry.id === screenId);

  return (
    <div className="placeholder-screen">
      <div>
        <div className="placeholder-screen__badge">Unknown screen</div>
        <h1 className="placeholder-screen__title">{item?.label ?? 'Not a TradeGuard screen'}</h1>
        <p className="placeholder-screen__text">
          {item
            ? `"${item.label}" is part of the TradeGuard workflow but is not reachable from this build's navigation.`
            : 'That address does not match a screen in the TradeGuard workflow.'}{' '}
          Nothing was changed — pick up the workflow where you left off.
        </p>
        <p style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn--ghost btn--inline"
            onClick={() => onNavigate('trade-idea')}
          >
            Back to Trade Idea
          </button>
        </p>
      </div>
    </div>
  );
}
