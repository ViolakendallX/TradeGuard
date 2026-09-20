/**
 * Trade Report screen (Phase 8) — the navigable report workspace.
 *
 * Step 3. It is the Final Trade Report as a first-class workspace rather than a
 * section buried at the bottom of the investigation: a persistent trade header, a
 * horizontal section navigator, and ONE report section on screen at a time
 * (Summary is the default landing section).
 *
 * The report itself is unchanged — the same Phase 8 deterministic service, the
 * same ten sections, the same AVAILABLE / PARTIAL / UNAVAILABLE states, the same
 * disclaimers. This screen renders the report panel from the shared trade
 * session, so opening it costs no network work: the chain ran once, when the
 * trade was submitted.
 *
 * What it does NOT do: no new analysis, no provider of its own, no arithmetic,
 * no verdict. It restates what the earlier stages produced.
 */

import TradeHeader from '../components/investigation/TradeHeader.jsx';
import FinalReportPanel from '../components/investigation/FinalReportPanel.jsx';

function EmptyReport({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to report yet
          </div>
          Submit a trade idea and let TradeGuard investigate it. The final report consolidates the whole
          investigation into one navigable workspace.
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

export default function TradeReportScreen({ submission, session, onEdit, onNavigate }) {
  // The report comes from the shared trade session: it was fetched once, when
  // the trade was submitted. Entering this screen does not re-run the chain.
  const idea = session?.idea || submission?.idea || null;
  const report = session?.report || null;

  if (!submission || !idea) {
    return <EmptyReport onEdit={onEdit} />;
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 3 — Trade report</div>
        <h1 className="page-head__title">Final trade report</h1>
        <p className="page-head__lede">
          The whole investigation consolidated into one report — the setup, the thesis and its evidence, the
          market and event context, the attack, the historical comparison, the defined risk and the gaps.
          Each section is marked available, partial or unavailable. It is a synthesis, not a verdict: the
          decision remains yours.
        </p>
      </div>

      <div className="inv-workspace">
        <TradeHeader idea={idea} offline={Boolean(submission.offline)} onEdit={onEdit} />

        <FinalReportPanel report={report} />

        {onNavigate && (
          <div className="inv-nav__next" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn--inline" onClick={() => onNavigate('decision')}>
              Record decision →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
