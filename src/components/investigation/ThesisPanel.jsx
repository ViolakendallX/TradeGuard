/**
 * Thesis section — the trade idea being tested.
 *
 * This is the first section and the default selection, so the thesis is on
 * screen the moment the investigation opens. It carries its own Edit Thesis
 * action (in addition to the persistent one in the trade header).
 *
 * The submitted context (timeframe, entry, risk, confidence, position) lives in
 * the persistent trade header directly above, so it is not repeated here.
 */

export default function ThesisPanel({ idea, onEdit }) {
  return (
    <div className="inv-thesis">
      <p className="preview__thesis">{idea.thesis}</p>

      <div className="inv-thesis__actions">
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          Edit thesis
        </button>
        <span className="inv-thesis__hint">
          Editing returns you to the Trade Idea screen with this thesis loaded. Submitting it again
          restarts the investigation.
        </span>
      </div>
    </div>
  );
}
