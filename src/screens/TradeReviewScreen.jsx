/**
 * Trade Review screen (Phase 11).
 *
 * A SEPARATE workflow screen, reached from the sidebar after Paper Execution.
 * It is a REVIEW tool: it assembles the records TradeGuard already produced —
 * the thesis, the Phase 6/7 risk and structure, the Phase 9 decision, and the
 * Phase 10 paper-execution outcome — into one read-only review that answers
 * "what happened after I made this trade decision?"
 *
 * What this screen does:
 *   - runs the same deterministic chain the other screens run, so the review is
 *     built from the exact records the trader saw when they decided
 *   - assembles those records into a review via POST /api/trade-review
 *   - shows the trader's own notes (held in App state so they survive navigation)
 *
 * What it does NOT do:
 *   - tell the trader BUY / SELL / HOLD / EXIT / change size — ever
 *   - generate predictions, probabilities, scores, targets or signals
 *   - recalculate risk — the figures come from the Phase 6 engine, verbatim
 *   - submit anything — it is read-only; the only write is the trader's note
 *   - fabricate an order, a fill, or a P&L
 */

import TradeHeader from '../components/investigation/TradeHeader.jsx';
import TradeReviewPanel from '../components/investigation/TradeReviewPanel.jsx';

function EmptyReview({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title">
            Nothing to review yet
          </div>
          Submit a trade idea, let TradeGuard investigate it, and record your own decision. Trade Review
          becomes available only after you have recorded a decision.
          <div className="empty-state__actions">
            <button type="button" className="btn btn--primary btn--inline" onClick={onEdit}>
              Submit a trade idea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TradeReviewScreen({ submission, session, onEdit, notes, onNotesChange }) {
  // The review is assembled ONCE, in the shared trade session, and re-assembled
  // only when the decision or the execution record it is built from changes.
  // Opening this screen, and switching between its sections, costs no network
  // work — the panel's tabs are local state.
  const idea = session?.idea || submission?.idea || null;
  const review = session?.review || null;

  if (!submission || !idea) {
    return <EmptyReview onEdit={onEdit} />;
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 6 — Trade Review</div>
        <h1 className="page-head__title">Trade Review</h1>
        <p className="page-head__lede">
          This review describes what happened after the decision you already made. It assembles the
          records TradeGuard produced — your thesis, the risk and structure you saw, your recorded
          decision, and the paper-execution outcome — into one read-only view. It does not tell you
          what to do next, and it never shows a profit, loss or fill unless one was actually verified.
        </p>
      </div>

      <div className="inv-workspace">
        <TradeHeader idea={idea} offline={Boolean(submission.offline)} onEdit={onEdit} />

        <div className="exec__stage">
          <TradeReviewPanel
            review={review}
            idea={idea}
            notes={notes}
            onNotesChange={onNotesChange}
          />
        </div>
      </div>
    </>
  );
}
