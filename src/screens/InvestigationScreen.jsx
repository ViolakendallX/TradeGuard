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
 * The screen is now an orchestrator: it owns the data fetching (unchanged) and
 * the selected-section state, and composes three regions:
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
import {
  fetchResearch,
  fetchThesisAttack,
  fetchHistoricalStressTest,
  fetchRiskAssessment,
  fetchTradeStructure,
  fetchFinalReport,
  fetchPaperExecution,
} from '../lib/api.js';
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

export default function InvestigationScreen({ submission, onEdit, decision, execution, onNavigate }) {
  const [research, setResearch] = useState(null);
  const [attack, setAttack] = useState(null);
  const [history, setHistory] = useState(null);
  const [risk, setRisk] = useState(null);
  const [structure, setStructure] = useState(null);
  const [report, setReport] = useState(null);
  const [activeId, setActiveId] = useState(DEFAULT_SECTION_ID);
  // The gate evaluation for the rail. This endpoint sends nothing to any venue;
  // it only reports whether paper execution is locked, ready or unavailable.
  const [gateResult, setGateResult] = useState(null);

  // The trade header is sticky, so the navigation rail needs to know how tall it
  // is in order to stick directly beneath it. Measured rather than hard-coded so
  // it stays correct when the facts wrap on narrower screens.
  const headRef = useRef(null);
  const [headHeight, setHeadHeight] = useState(0);

  // A new submission restarts the investigation from its first section, and
  // invalidates the execution gate evaluated for the previous one.
  useEffect(() => {
    setActiveId(DEFAULT_SECTION_ID);
    setGateResult(null);
  }, [submission]);

  const idea = submission?.idea || null;

  const context = useMemo(
    () =>
      idea
        ? {
            asset: idea.asset,
            direction: idea.direction,
            thesis: idea.thesis,
            timeframe: idea.timeframe,
            entryPrice: idea.entryPrice,
            invalidationPrice: idea.invalidationPrice,
            riskAmount: idea.riskAmount,
            confidence: idea.confidence,
            existingPosition: idea.existingPosition,
          }
        : null,
    [idea]
  );

  useEffect(() => {
    if (!submission || !submission.idea) return undefined;

    // Backend unreachable: none of the research, attack, historical or risk
    // passes can run.
    if (submission.offline) {
      setResearch({
        market: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
        events: { available: false, reason: 'Backend offline — research requires the TradeGuard API.' },
      });
      setAttack({ available: false, reason: 'Backend offline — the thesis attack requires the TradeGuard API.' });
      setHistory({
        available: false,
        statusLabel: 'HISTORICAL DATA UNAVAILABLE',
        reason: 'Backend offline — the historical stress test requires the TradeGuard API.',
      });
      setRisk({
        available: false,
        statusLabel: 'RISK ASSESSMENT UNAVAILABLE',
        statusDetail: 'Backend offline — the risk engine runs server-side and requires the TradeGuard API.',
      });
      setStructure({
        available: false,
        statusLabel: 'TRADE STRUCTURE UNAVAILABLE',
        statusDetail: 'Backend offline — the trade structure is assembled server-side and requires the TradeGuard API.',
      });
      setReport({
        available: false,
        statusLabel: 'REPORT UNAVAILABLE',
        statusDetail: 'Backend offline — the final report is assembled server-side and requires the TradeGuard API.',
      });
      return undefined;
    }

    let cancelled = false;

    // Phase 8 needs the results of EVERY earlier stage, but it must not re-derive
    // any of them: it restates the research, the attack, the history, the risk
    // figures and the structure. Phase 7 in turn needs the risk result and the
    // attack. So we hold whichever results settle first and fire each dependent
    // call as soon as its own inputs are in — including on the failure paths, so
    // neither call can hang on "loading" when a provider dies mid-chain.
    const settled = {
      market: null,
      events: null,
      attack: null,
      history: null,
      risk: null,
      structure: null,
    };
    let structureRequested = false;
    let reportRequested = false;

    const requestStructure = () => {
      if (cancelled || structureRequested || !settled.risk || !settled.attack) return;
      structureRequested = true;

      fetchTradeStructure(context, { risk: settled.risk, attack: settled.attack })
        .then((s) => {
          if (cancelled) return;
          settled.structure = s.ok ? s.data.structure : { available: false, statusDetail: s.message };
          setStructure(settled.structure);
          requestReport();
        })
        .catch((e) => {
          if (cancelled) return;
          settled.structure = { available: false, statusDetail: String(e?.message || e) };
          setStructure(settled.structure);
          requestReport();
        });
    };

    // The report is the last stage: it consolidates all six earlier results. It
    // fires once each of them has settled, so it is never assembled from a
    // half-finished investigation.
    const requestReport = () => {
      if (cancelled || reportRequested) return;
      const ready = Object.values(settled).every((v) => v !== null);
      if (!ready) return;
      reportRequested = true;

      fetchFinalReport(context, {
        market: settled.market,
        events: settled.events,
        attack: settled.attack,
        history: settled.history,
        risk: settled.risk,
        structure: settled.structure,
      })
        .then((r) => {
          if (!cancelled) setReport(r.ok ? r.data.report : { available: false, statusDetail: r.message });
        })
        .catch((e) => {
          if (!cancelled) setReport({ available: false, statusDetail: String(e?.message || e) });
        });
    };

    // Phase 6 is deliberately fetched OUTSIDE the market-data chain below. The
    // risk engine is pure arithmetic on the trader's own levels, so it must
    // still produce a result when the provider chain fails — and it must not
    // wait behind three network calls to do so.
    fetchRiskAssessment(context)
      .then((r) => {
        if (cancelled) return;
        settled.risk = r.ok ? r.data.risk : { available: false, statusDetail: r.message };
        setRisk(settled.risk);
        requestStructure();
        requestReport();
      })
      .catch((e) => {
        if (cancelled) return;
        settled.risk = { available: false, statusDetail: String(e?.message || e) };
        setRisk(settled.risk);
        requestStructure();
        requestReport();
      });

    fetchResearch(context)
      .then((r) => {
        if (cancelled) return undefined;
        const researchData = r.ok
          ? r.data
          : {
              market: { available: false, reason: r.message },
              events: { available: false, reason: r.message },
            };
        setResearch(researchData);
        settled.market = researchData.market;
        settled.events = researchData.events;

        // Chain the Devil's Advocate pass on the research we just retrieved.
        return fetchThesisAttack(context, { market: researchData.market, events: researchData.events })
          .then((a) => {
            if (cancelled) return undefined;
            settled.attack = a.ok ? a.data.analysis : { available: false, reason: a.message };
            setAttack(settled.attack);
            requestStructure();

            // Phase 5 runs after the attack, reusing the same research context.
            return fetchHistoricalStressTest(context, {
              market: researchData.market,
              events: researchData.events,
            })
              .then((h) => {
                if (cancelled) return;
                settled.history = h.ok ? h.data.history : { available: false, reason: h.message };
                setHistory(settled.history);
                requestReport();
              })
              .catch((e) => {
                if (cancelled) return;
                settled.history = { available: false, reason: String(e?.message || e) };
                setHistory(settled.history);
                requestReport();
              });
          })
          .catch((e) => {
            if (cancelled) return;
            const message = String(e?.message || e);
            settled.attack = { available: false, reason: message };
            settled.history = { available: false, reason: message };
            setAttack(settled.attack);
            setHistory(settled.history);
            requestStructure();
            requestReport();
          });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        setResearch({
          market: { available: false, reason: message },
          events: { available: false, reason: message },
        });
        settled.market = { available: false, reason: message };
        settled.events = { available: false, reason: message };
        settled.attack = { available: false, reason: message };
        settled.history = { available: false, reason: message };
        setAttack(settled.attack);
        setHistory(settled.history);
        requestStructure();
        requestReport();
      });

    return () => {
      cancelled = true;
    };
  }, [submission]);

  /**
   * Phase 10 — evaluate the execution gate for the rail.
   *
   * This is a read-only evaluation: it reports EXECUTION LOCKED, READY or
   * UNAVAILABLE and sends nothing to any venue. It is requested here so the
   * tenth rail item is honest on its own, rather than appearing to load forever
   * until the trader happens to open the Paper Execution screen.
   */
  useEffect(() => {
    if (!submission || !idea || !context) return undefined;

    if (submission.offline) {
      setGateResult({
        available: false,
        statusDetail:
          'Backend offline — paper execution is evaluated server-side and requires the TradeGuard API.',
      });
      return undefined;
    }

    // The gate needs the risk result, the structure and the report, exactly as
    // the Paper Execution screen does.
    if (!risk || !structure || !report) return undefined;

    let cancelled = false;

    fetchPaperExecution(context, { risk, structure, report, decision })
      .then((e) => {
        if (cancelled) return;
        setGateResult(e.ok ? e.data.execution : { available: false, statusDetail: e.message });
      })
      .catch((err) => {
        if (cancelled) return;
        setGateResult({ available: false, statusDetail: String(err?.message || err) });
      });

    return () => {
      cancelled = true;
    };
  }, [submission, idea, context, risk, structure, report, decision]);

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
