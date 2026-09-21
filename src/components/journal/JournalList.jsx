/**
 * Journal list (Phase 12).
 *
 * The compact index of Trade Memory: one row per saved trade, enough to identify
 * it and choose it, and nothing more. It is deliberately a dense table rather than
 * a stack of cards — a journal is for scanning.
 *
 * It renders ONLY what the backend stored. It computes nothing, classifies
 * nothing, and never shows a profit, loss, fill or score, because none of those
 * exist in the record.
 */

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const DIRECTION_TONES = { bullish: 'is-bullish', bearish: 'is-bearish', neutral: '' };

/** Timestamps are stored server-side as ISO strings; render them, never invent one. */
function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // A record with no usable timestamp reads as unknown rather than as 1970.
  if (d.getUTCFullYear() <= 1970) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The row state badge. Descriptive only — it never judges the trade. */
function stateBadgeClass(state) {
  if (state === 'executed') return 'report__badge--ready';
  if (state === 'decided') return 'report__badge--incomplete';
  return 'report__badge--unavailable';
}

export default function JournalList({ records, selectedId, onSelect }) {
  const list = Array.isArray(records) ? records : [];

  return (
    <div className="journal__table-wrap">
      <table className="journal__table">
        <thead>
          <tr>
            <th scope="col">Trade</th>
            <th scope="col">Thesis</th>
            <th scope="col">Decision</th>
            <th scope="col">Execution</th>
            <th scope="col">Notes</th>
            <th scope="col">Last saved</th>
            <th scope="col">
              <span className="journal__th-sr">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => {
            const isSelected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                className={`journal__row${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelect?.(row.id)}
                data-journal-row={row.id}
              >
                <td className="journal__cell journal__cell--trade">
                  <span className="preview__ticker">{row.asset || '—'}</span>
                  <span className={`chip chip--sm ${DIRECTION_TONES[row.direction] ?? ''}`}>
                    {DIRECTION_LABELS[row.direction] || row.direction || '—'}
                  </span>
                  <span className={`report__badge ${stateBadgeClass(row.state)}`} data-journal-state={row.state}>
                    {row.stateLabel}
                  </span>
                </td>

                <td className="journal__cell journal__cell--thesis">
                  {row.thesisPreview ? (
                    <span className="journal__thesis">{row.thesisPreview}</span>
                  ) : (
                    <span className="journal__none">No thesis recorded</span>
                  )}
                </td>

                <td className="journal__cell">
                  <span className="journal__decision" data-journal-decision={row.decision || 'none'}>
                    {row.decisionLabel}
                  </span>
                  <span className="journal__sub">{formatTimestamp(row.decidedAt)}</span>
                </td>

                <td className="journal__cell">
                  <span className="journal__exec">{row.executionLabel || '—'}</span>
                </td>

                <td className="journal__cell journal__cell--notes">
                  {row.hasNotes ? (
                    <span className="journal__notes">{row.notesPreview}</span>
                  ) : (
                    <span className="journal__none">No notes</span>
                  )}
                  {/* Phase 13: whether the trader wrote their own reflection on
                      this trade. A marker, never a judgement about the trade. */}
                  <span
                    className={`journal__reflect${row.hasReflection ? '' : ' is-empty'}`}
                    data-journal-reflection={row.hasReflection ? 'recorded' : 'not-recorded'}
                  >
                    {row.hasReflection ? 'Reflection recorded' : 'No reflection'}
                  </span>
                </td>

                <td className="journal__cell journal__cell--when">{formatTimestamp(row.updatedAt)}</td>

                <td className="journal__cell journal__cell--open">
                  <button
                    type="button"
                    className="btn btn--link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(row.id);
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { formatTimestamp };
