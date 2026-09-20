/**
 * Investigation workspace (Step 2).
 *
 * Information architecture:
 *
 *   TRADE CONTEXT  →  INVESTIGATION NAVIGATION  →  ANALYSIS CONTENT
 *
 * Phase 10 adds a tenth rail item, Paper execution. It is shown read-only here —
 * the gate is evaluated so the rail can say EXECUTION LOCKED or READY honestly
 * rather than sitting on "Retrieving" — but it is never confirmed from inside
 * the investigation. Confirmation happens on the Paper Execution screen, so
 * there is exactly one place in the product where an order can be released.
 *
 * The screen is now an orchestrator: it reads the current trade's records from
 * the shared trade session and owns only the selected-section state, composing
 * three regions:
 *
 *   1. TradeHeader        — persistent, sticky trade context + Edit Thesis
 *   2. InvestigationNav   — the sections, selectable, with runtime status
 *   3. InvestigationPanel — the selected section's analysis, one at a time
 *
 * Nothing about the phases, the API contracts or the analysis logic changed.
 * The previous version rendered every stage's full detail inline in one column,
 * which is what pushed Edit Thesis and later sections far down the page.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STAGE_RUNTIME } from '../lib/investigation.js';
import { buildSectionNav, DEFAULT_SECTION_ID } from '../lib/investigationView.js';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import InvestigationNav from '../components/investigation/InvestigationNav.jsx';
import InvestigationPanel from '../components/investigation/InvestigationPanel.jsx';

function EmptyInvestigation({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to investigate yet
          </div>
          Submit a trade idea from the Trade Idea screen and TradeGuard will begin examining it here.
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

export default function InvestigationScreen({ submission, session, onEdit, decision, execution, onNavigate }) {
  // Every analysis record comes from the shared trade session: the chain ran
  // ONCE, when the trade was submitted. Selecting a stage — or leaving and
  // re-entering this workspace — reuses those records rather than re-running it.
  const idea = session?.idea || submission?.idea || null;
  const research = session?.research ?? null;
  const attack = session?.attack ?? null;
  const history = session?.history ?? null;
  const risk = session?.risk ?? null;
  const structure = session?.structure ?? null;
  const report = session?.report ?? null;
  // The execution gate is evaluated once per (trade, decision) in the session.
  // It is read-only: it sends nothing to any venue.
  const gateResult = session?.gate ?? null;

  const [activeId, setActiveId] = useState(DEFAULT_SECTION_ID);

  // The trade header is sticky, so the navigation rail needs to know how tall it
  // is in order to stick directly beneath it. Measured rather than hard-coded so
  // it stays correct when the facts wrap on narrower screens.
  const headRef = useRef(null);
  const [headHeight, setHeadHeight] = useState(0);

  // A new submission restarts the investigation from its first section.
  useEffect(() => {
    setActiveId(DEFAULT_SECTION_ID);
  }, [submission]);

  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;

    const update = () => setHeadHeight(el.offsetHeight);
    update();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [submission, research, attack, history, risk, structure, report]);

  // A submission result (PAPER ORDER SUBMITTED / FAILED) outranks a fresh gate
  // evaluation — it is what actually happened. Without one, the rail shows the
  // gate as it stands right now.
  const shownExecution = execution ?? gateResult;

  const sections = useMemo(
    () =>
      buildSectionNav(research, attack, history, risk, structure, report, decision, shownExecution),
    [research, attack, history, risk, structure, report, decision, shownExecution]
  );

  if (!submission || !submission.idea) {
    return <EmptyInvestigation onEdit={onEdit} />;
  }

  // The progress bar shows only the eight analysis stages. Human Decision and
  // Paper Execution are distinct workflow steps (their own screens), so they
  // are excluded from the bar and surfaced as a "next step" affordance instead.
  const analysisSections = useMemo(
    () => sections.filter((s) => s.id !== 'human-decision' && s.id !== 'paper-execution'),
    [sections]
  );
  const analysisCompleted = analysisSections.filter((s) => s.runtime === STAGE_RUNTIME.COMPLETE).length;
  const analysisTotal = analysisSections.length;
  const analysisLocked = analysisSections.filter((s) => s.runtime === STAGE_RUNTIME.LOCKED).length;

  const activeSection = sections.find((section) => section.id === activeId) || sections[0];

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard gathers live market and event research for this trade, runs the Devil's Advocate — a
          deliberate search for evidence that could make your thesis wrong — then looks for similar past
          setups and what happened afterwards. Finally it calculates the defined risk from your entry,
          invalidation and risk budget, brings the whole trade together into one structure, and consolidates
          the whole investigation into a final report. Where a data source is unavailable, it says so
          honestly rather than guessing.
        </p>
      </div>

      <div className="inv-workspace" style={{ '--inv-head-h': `${headHeight}px` }}>
        <TradeHeader
          idea={idea}
          offline={Boolean(submission.offline)}
          onEdit={onEdit}
          innerRef={headRef}
        />

        <InvestigationNav
          sections={analysisSections}
          activeId={activeSection.id}
          onSelect={setActiveId}
          completed={analysisCompleted}
          total={analysisTotal}
          locked={analysisLocked}
          gate={shownExecution}
          decision={decision}
          onNavigate={onNavigate}
        />

        <InvestigationPanel
          section={activeSection}
          research={research}
          attack={attack}
          history={history}
          risk={risk}
          structure={structure}
          report={report}
          decision={decision}
          execution={shownExecution}
          idea={idea}
          onEdit={onEdit}
        />
      </div>
    </>
  );
}
