/**
 * Trader Review — saved-trade picker (Phase 13).
 *
 * Trader Review is a review of a trade that has ALREADY been decided. It must
 * therefore work on any trade in Trade Memory, not only the one currently open —
 * a trader who has closed the app, or who has since started a different trade,
 * must still be able to look back at what they recorded.
 *
 * This component is the list that makes that possible: one row per saved trade,
 * read from Trade Memory, selectable by its persistent trade/session id.
 *
 * What it does NOT do:
 *   - it runs no analysis and contacts no provider. Every row is a stored
 *     record, read back — no research, attack, historical test, risk engine,
 *     structure or report is re-run to build this list.
 *   - it computes nothing. No profit, loss, fill, win rate or score appears,
 *     because none of those exist in the record.
 *   - it never edits a trade. Selecting a row is a read.
 *
 * It shows the SAME facts Trade Memory shows, so the two screens cannot disagree
 * about what was saved.
 */

import { formatTimestamp } from '../journal/JournalList.jsx';

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const DIRECTION_TONES = { bullish: 'is-bullish', bearish: 'is-bearish', neutral: '' };

/** The row state badge. Descriptive only — it never judges the trade. */
function stateBadgeClass(state) {
  if (state === 'executed') return 'report__badge--ready';
  if (state === 'decided') return 'report__badge--incomplete';
  return 'report__badge--unavailable';
}

export default function TraderReviewPicker({
  records,
  status,
  message,
  selectedId,
  sessionId,
  onSelect,
  onReload,
}) {
  const list = Array.isArray(records) ? records : [];

  return (
    <div className="card picker" data-trader-picker="true">
      <div className="card__body">
        <div className="card__title">Saved trades</div>
        <p className="picker__lede">
          Trade Memory is the record of every trade case you have submitted. Pick one to review what
          was recorded for it — opening it re-runs no analysis.
        </p>

        {status === 'loading' && (
          <p className="journal__loading" data-trader-picker-state="loading">
            Reading Trade Memory…
          </p>
        )}

        {status === 'unavailable' && (
          <div className="picker__empty" data-trader-picker-state="unavailable">
            <p className="review__known-text is-empty">
              {message || 'Trade Memory could not be read, so your saved trades cannot be listed.'}
            </p>
            {onReload && (
              <button type="button" className="btn btn--ghost btn--inline btn--auto" onClick={onReload}>
                Try again
              </button>
            )}
          </div>
        )}

        {status === 'ready' && list.length === 0 && (
          <p className="review__known-text is-empty" data-trader-picker-state="empty">
            No trades have been saved to Trade Memory yet. A trade is saved as soon as you submit it,
            so it will appear here once you have one.
          </p>
        )}

        {status === 'ready' && list.length > 0 && (
          <ul className="picker__list">
            {list.map((row) => {
              const isSelected = row.id === selectedId;
              const isCurrent = Boolean(sessionId) && row.id === sessionId;
              return (
                <li key={row.id} className="picker__li">
                  <button
                    type="button"
                    className={`picker__row${isSelected ? ' is-selected' : ''}`}
                    onClick={() => onSelect?.(row.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    data-trader-pick={row.id}
                    data-trader-pick-selected={isSelected ? 'true' : 'false'}
                    data-trader-pick-current={isCurrent ? 'true' : 'false'}
                  >
                    <span className="picker__row-main">
                      <span className="preview__ticker">{row.asset || '—'}</span>
                      <span className={`chip chip--sm ${DIRECTION_TONES[row.direction] ?? ''}`}>
                        {DIRECTION_LABELS[row.direction] || row.direction || '—'}
                      </span>
                      <span className={`report__badge ${stateBadgeClass(row.state)}`} data-picker-state={row.state}>
                        {row.stateLabel}
                      </span>
                      {isCurrent && <span className="picker__tag">Current trade</span>}
                    </span>

                    <span className="picker__row-sub">
                      <span className="picker__fact">
                        Decision <strong>{row.decisionLabel || '—'}</strong>
                      </span>
                      <span className="picker__fact">
                        Execution <strong>{row.executionLabel || '—'}</strong>
                      </span>
                      <span className="picker__fact" data-picker-reflection={row.hasReflection ? 'recorded' : 'not-recorded'}>
                        Reflection <strong>{row.hasReflection ? 'Recorded' : 'Not recorded'}</strong>
                      </span>
                      <span className="picker__fact picker__fact--when">
                        Saved <strong>{formatTimestamp(row.updatedAt)}</strong>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
