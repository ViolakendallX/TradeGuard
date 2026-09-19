/**
 * Investigation workspace (Step 2).
 *
 * Information architecture:
 *
 *   TRADE CONTEXT  →  INVESTIGATION NAVIGATION  →  ANALYSIS CONTENT
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
import {
  INVESTIGATION_STAGE_COUNT,
  completedStageCountFromResearch,
  lockedStageCount,
} from '../lib/investigation.js';
import { buildSectionNav, DEFAULT_SECTION_ID } from '../lib/investigationView.js';
import {
  fetchResearch,
  fetchThesisAttack,
  fetchHistoricalStressTest,
  fetchRiskAssessment,
  fetchTradeStructure,
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

export default function InvestigationScreen({ submission, onEdit }) {
  const [research, setResearch] = useState(null);
  const [attack, setAttack] = useState(null);
  const [history, setHistory] = useState(null);
  const [risk, setRisk] = useState(null);
  const [structure, setStructure] = useState(null);
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

  useEffect(() => {
    if (!submission || !submission.idea) return undefined;

    const idea = submission.idea;
    const context = {
      asset: idea.asset,
      direction: idea.direction,
      thesis: idea.thesis,
      timeframe: idea.timeframe,
      entryPrice: idea.entryPrice,
      invalidationPrice: idea.invalidationPrice,
      riskAmount: idea.riskAmount,
      confidence: idea.confidence,
      existingPosition: idea.existingPosition,
    };

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
      return undefined;
    }

    let cancelled = false;

    // Phase 7 needs BOTH the risk result (Phase 6) and the attack (Phase 4), but
    // it must not re-derive either: the risk figures are reused verbatim and the
    // conditions come straight from the Devil's Advocate. So we hold whichever
    // settles first and fire the structure call as soon as both are in.
    let riskResult = null;
    let attackResult = null;
    let structureRequested = false;

    const requestStructure = () => {
      if (cancelled || structureRequested || !riskResult || !attackResult) return;
      structureRequested = true;

      fetchTradeStructure(context, { risk: riskResult, attack: attackResult })
        .then((s) => {
          if (!cancelled) setStructure(s.ok ? s.data.structure : { available: false, statusDetail: s.message });
        })
        .catch((e) => {
          if (!cancelled) setStructure({ available: false, statusDetail: String(e?.message || e) });
        });
    };

    // Phase 6 is deliberately fetched OUTSIDE the market-data chain below. The
    // risk engine is pure arithmetic on the trader's own levels, so it must
    // still produce a result when the provider chain fails — and it must not
    // wait behind three network calls to do so.
    fetchRiskAssessment(context)
      .then((r) => {
        if (cancelled) return;
        riskResult = r.ok ? r.data.risk : { available: false, statusDetail: r.message };
        setRisk(riskResult);
        requestStructure();
      })
      .catch((e) => {
        if (cancelled) return;
        riskResult = { available: false, statusDetail: String(e?.message || e) };
        setRisk(riskResult);
        requestStructure();
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

        // Chain the Devil's Advocate pass on the research we just retrieved.
        return fetchThesisAttack(context, { market: researchData.market, events: researchData.events })
          .then((a) => {
            if (cancelled) return undefined;
            attackResult = a.ok ? a.data.analysis : { available: false, reason: a.message };
            setAttack(attackResult);
            requestStructure();

            // Phase 5 runs after the attack, reusing the same research context.
            return fetchHistoricalStressTest(context, {
              market: researchData.market,
              events: researchData.events,
            })
              .then((h) => {
                if (cancelled) return;
                setHistory(h.ok ? h.data.history : { available: false, reason: h.message });
              })
              .catch((e) => {
                if (!cancelled) setHistory({ available: false, reason: String(e?.message || e) });
              });
          })
          .catch((e) => {
            if (!cancelled) {
              attackResult = { available: false, reason: String(e?.message || e) };
              setAttack(attackResult);
              setHistory({ available: false, reason: String(e?.message || e) });
              requestStructure();
            }
          });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        setResearch({
          market: { available: false, reason: message },
          events: { available: false, reason: message },
        });
        attackResult = { available: false, reason: message };
        setAttack(attackResult);
        setHistory({ available: false, reason: message });
        requestStructure();
      });

    return () => {
      cancelled = true;
    };
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
  }, [submission, research, attack, history, risk, structure]);

  const sections = useMemo(
    () => buildSectionNav(research, attack, history, risk, structure),
    [research, attack, history, risk, structure]
  );

  if (!submission || !submission.idea) {
    return <EmptyInvestigation onEdit={onEdit} />;
  }

  const idea = submission.idea;
  const activeSection = sections.find((section) => section.id === activeId) || sections[0];
  const completed = completedStageCountFromResearch(research, attack, history, risk, structure);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard gathers live market and event research for this trade, runs the Devil's Advocate — a
          deliberate search for evidence that could make your thesis wrong — then looks for similar past
          setups and what happened afterwards. Finally it calculates the defined risk from your entry,
          invalidation and risk budget, and brings the whole trade together into one structure. Where a
          data source is unavailable, it says so honestly rather than guessing.
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
          sections={sections}
          activeId={activeSection.id}
          onSelect={setActiveId}
          completed={completed}
          total={INVESTIGATION_STAGE_COUNT}
          locked={lockedStageCount()}
        />

        <InvestigationPanel
          section={activeSection}
          research={research}
          attack={attack}
          history={history}
          risk={risk}
          structure={structure}
          idea={idea}
          onEdit={onEdit}
        />
      </div>
    </>
  );
}
