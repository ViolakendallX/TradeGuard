/**
 * Paper Execution screen (Phase 10).
 *
 * Step 5. The trader has already decided to TAKE — that is what makes this
 * screen reachable at all — and now confirms, or does not, that the trade should
 * be sent to the Bitget Demo environment with virtual funds.
 *
 * What this screen does:
 *   - reads the report and the risk figures behind the order from the shared
 *     trade session, so they are the same records the decision screen showed
 *   - evaluates the execution gate server-side and shows only what came back
 *   - requires a separate, typed confirmation before anything is submitted
 *   - shows Bitget Demo's actual returned order data, or its actual error
 *
 * What it does NOT do:
 *   - decide to execute on TradeGuard's own initiative
 *   - submit anything because TAKE was recorded
 *   - recalculate risk — the figures are the engine's
 *   - manage the position afterwards, or touch a wallet
 *   - place a live-money order, or fall back to a live venue
 */

import { useCallback, useState } from 'react';
import { submitPaperExecution } from '../lib/api.js';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import PaperExecutionPanel from '../components/investigation/PaperExecutionPanel.jsx';

function EmptyExecution({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to execute yet
          </div>
          Submit a trade idea, let TradeGuard investigate it, and record your own decision. Paper
          execution becomes available only after you have recorded TAKE.
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" style={{ width: 'auto' }} onClick={onEdit}>
              Submit a trade idea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaperExecutionScreen({ submission, session, onEdit, decision, execution, onExecutionRecorded }) {
  // The chain ran ONCE, in the shared trade session. This screen reads the
  // records the gate is evaluated against and submits the order — it never
  // re-runs the analysis and never recalculates risk.
  const idea = session?.idea || submission?.idea || null;
  const context = session?.context || null;
  const risk = session?.risk ?? null;
  const structure = session?.structure ?? null;
  const report = session?.report ?? null;
  const gate = session?.gate ?? null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The venue's own answer, if this screen produced one.
  const [venueResult, setVenueResult] = useState(null);

  // What ACTUALLY happened outranks a fresh gate read — and because the record
  // is held in App state, a submitted order is still on screen after navigating
  // away and back.
  const shownExecution = venueResult || execution || gate;

  /**
   * Submit the paper order.
   *
   * The confirmation token is required and is checked server-side; this handler
   * only forwards what the trader typed. Nothing is submitted on any other path.
   */
  const handleExecute = useCallback(
    async (typedToken) => {
      if (!context) return;

      setError('');
      setSubmitting(true);

      try {
        const result = await submitPaperExecution(context, {
          risk,
          structure,
          report,
          decision,
          // Send exactly what the trader typed. If it does not match, the
          // backend refuses and nothing is sent to the venue.
          confirmation: typeof typedToken === 'string' ? typedToken.trim() : null,
        });

        if (!result.ok) {
          if (result.execution) setVenueResult(result.execution);
          setError(result.message);
          return;
        }

        setVenueResult(result.data.execution);
        onExecutionRecorded?.(result.data.execution);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setSubmitting(false);
      }
    },
    [context, risk, structure, report, decision, onExecutionRecorded]
  );

  if (!submission || !idea) {
    return <EmptyExecution onEdit={onEdit} />;
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 5 — Paper execution</div>
        <h1 className="page-head__title">Paper execution</h1>
        <p className="page-head__lede">
          This trades virtual funds in the Bitget Demo environment. It is available only because you
          recorded TAKE — and even then nothing is sent until you confirm it here. TradeGuard never
          executes on its own, and there is no live-money path anywhere in this stage.
        </p>
      </div>

      <div className="inv-workspace">
        <TradeHeader idea={idea} offline={Boolean(submission.offline)} onEdit={onEdit} />

        <div className="exec__stage">
          <PaperExecutionPanel
            execution={shownExecution}
            idea={idea}
            onExecute={handleExecute}
            submitting={submitting}
            error={error}
            canExecute
          />
        </div>
      </div>
    </>
  );
}
