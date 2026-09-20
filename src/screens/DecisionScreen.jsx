/**
 * Human Decision screen (Phase 9).
 *
 * This is where TradeGuard hands the decision back. The investigation has run —
 * thesis, research, attack, stress test, risk, structure, final report — and the
 * trader now records what THEY are going to do about it.
 *
 * The screen is the natural final step after reading the Final Trade Report, so
 * it renders that report above the decision form. The report is CONTEXT: it is
 * what the trader is deciding against. The decision itself sits below it and
 * clearly belongs to the trader.
 *
 * What this screen does:
 *   - runs the same deterministic chain the investigation screen runs, so the
 *     report the trader reads here is the same report, from the same services
 *   - fetches the current decision record (if any) so a recorded decision
 *     survives navigation
 *   - sends the trader's decision to the backend and shows exactly what was
 *     stored
 *
 * What it does NOT do:
 *   - choose, suggest, score or predict the decision
 *   - write the trader's reason
 *   - place an order, contact an exchange, or execute anything
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  recordHumanDecision,
  fetchResearch,
  fetchThesisAttack,
  fetchHistoricalStressTest,
  fetchRiskAssessment,
  fetchTradeStructure,
  fetchFinalReport,
} from '../lib/api.js';
import { buildSectionNav } from '../lib/investigationView.js';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import InvestigationPanel from '../components/investigation/InvestigationPanel.jsx';
import DecisionPanel from '../components/investigation/DecisionPanel.jsx';

function EmptyDecision({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to decide on yet
          </div>
          Submit a trade idea from the Trade Idea screen and TradeGuard will examine it. Once the
          investigation and the final report are on screen, you can record your own decision here.
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

export default function DecisionScreen({ submission, onEdit, decision, onDecisionRecorded }) {
  const [report, setReport] = useState(null);
  // The Phase 6 risk result, kept so the decision record can carry the defined
  // risk through with it. Held here rather than inside the report chain because
  // the decision needs it independently of whether the report finished.
  const [risk, setRisk] = useState(null);
  const [showReport, setShowReport] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [localErrors, setLocalErrors] = useState({});

  const idea = submission?.idea || null;

  // --- build the report context, exactly as the investigation screen does -----
  // The decision screen renders the Phase 8 report so the trader decides against
  // something real. It is the same deterministic chain: no new analysis, no new
  // provider, no new arithmetic.
  useEffect(() => {
    if (!submission || !idea) return undefined;

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

    if (submission.offline) {
      setReport({
        available: false,
        statusLabel: 'REPORT UNAVAILABLE',
        statusDetail: 'Backend offline — the final report is assembled server-side and requires the TradeGuard API.',
      });
      return undefined;
    }

    let cancelled = false;

    // The report is a synthesis of the whole investigation, so it needs every
    // earlier result. We run the same deterministic chain the investigation
    // screen runs — the same services, the same order, the same dependencies —
    // so the report shown here is the same report, not a second opinion.
    const settled = {
      market: null,
      events: null,
      attack: null,
      history: null,
      risk: null,
      structure: null,
    };
    let reportRequested = false;
    let structureRequested = false;

    // The structure depends on the risk result and the attack, so it fires once
    // both are in — including on the failure paths, so it can never hang on
    // "loading" when a provider dies mid-chain.
    const requestStructure = () => {
      if (cancelled || structureRequested || !settled.risk || !settled.attack) return;
      structureRequested = true;

      fetchTradeStructure(context, { risk: settled.risk, attack: settled.attack })
        .then((s) => {
          if (cancelled) return;
          settled.structure = s.ok ? s.data.structure : { available: false, statusDetail: s.message };
          requestReport();
        })
        .catch((e) => {
          if (cancelled) return;
          settled.structure = { available: false, statusDetail: String(e?.message || e) };
          requestReport();
        });
    };

    const requestReport = () => {
      if (cancelled || reportRequested) return;
      if (Object.values(settled).some((v) => v === null)) return;
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

    // The risk engine is pure arithmetic on the trader's own levels, so it runs
    // outside the market-data chain and still resolves when providers are down.
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
        settled.market = researchData.market;
        settled.events = researchData.events;

        return fetchThesisAttack(context, {
          market: researchData.market,
          events: researchData.events,
        })
          .then((a) => {
            if (cancelled) return undefined;
            settled.attack = a.ok ? a.data.analysis : { available: false, reason: a.message };
            requestStructure();

            return fetchHistoricalStressTest(context, {
              market: researchData.market,
              events: researchData.events,
            })
              .then((h) => {
                if (cancelled) return;
                settled.history = h.ok ? h.data.history : { available: false, reason: h.message };
                requestReport();
              })
              .catch((e) => {
                if (cancelled) return;
                settled.history = { available: false, reason: String(e?.message || e) };
                requestReport();
              });
          })
          .catch((e) => {
            if (cancelled) return;
            const message = String(e?.message || e);
            settled.attack = { available: false, reason: message };
            settled.history = { available: false, reason: message };
            requestStructure();
            requestReport();
          });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        settled.market = { available: false, reason: message };
        settled.events = { available: false, reason: message };
        settled.attack = { available: false, reason: message };
        settled.history = { available: false, reason: message };
        requestStructure();
        requestReport();
      });

    return () => {
      cancelled = true;
    };
  }, [submission, idea]);

  // A new submission clears any errors from the previous one.
  useEffect(() => {
    setErrors({});
    setLocalErrors({});
  }, [submission]);

  // Prefer the freshly calculated Phase 6 result; fall back to the risk already
  // stored on a recorded decision when this is an edit and the fetch has not
  // settled yet. Either way the figures are the ENGINE's — nothing here computes.
  const riskContext = risk || decision?.risk || null;

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

  /**
   * Record the trader's decision.
   *
   * A local pre-check runs first so the trader gets an immediate answer on the
   * two things the backend will certainly reject — no decision selected, or an
   * empty reason — but the BACKEND remains authoritative: whatever it says is
   * what is displayed.
   */
  const handleRecord = useCallback(
    async ({ decision: chosen, reason }) => {
      if (!context) return;

      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      const next = {};
      if (!chosen) next.decision = 'Select a decision before recording it.';
      if (!trimmed) next.reason = 'Write a reason for your decision. An empty reason cannot be recorded.';

      if (Object.keys(next).length > 0) {
        setLocalErrors(next);
        setErrors({});
        return;
      }

      setLocalErrors({});
      setErrors({});
      setSaving(true);

      try {
        const result = await recordHumanDecision(context, {
          decision: chosen,
          reason,
          risk: riskContext,
        });

        if (!result.ok) {
          // Server-side validation is the source of truth.
          if (result.kind === 'validation') setErrors(result.errors || {});
          else setErrors({ general: result.message });
          return;
        }

        onDecisionRecorded?.(result.data.record);
      } catch (e) {
        setErrors({ general: String(e?.message || e) });
      } finally {
        setSaving(false);
      }
    },
    [context, riskContext, onDecisionRecorded]
  );

  if (!submission || !idea) {
    return <EmptyDecision onEdit={onEdit} />;
  }

  const sections = buildSectionNav(null, null, null, null, null, report, decision);
  const reportSection = sections.find((section) => section.id === 'final-report');
  const decisionSection = sections.find((section) => section.id === 'human-decision');

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 4 — Decision</div>
        <h1 className="page-head__title">Your decision</h1>
        <p className="page-head__lede">
          The investigation is done. Read the final report, then record the decision you are making
          — TAKE, WAIT or SKIP — with your own reason. TradeGuard does not choose this for you, does
          not suggest an option, and does not execute anything. It records what you decided.
        </p>
      </div>

      <div className="inv-workspace">
        <TradeHeader idea={idea} offline={Boolean(submission.offline)} onEdit={onEdit} />

        <div className="decision__layout">
          {/* --- the report, as context --- */}
          <div className="decision__context">
            <div className="decision__context-head">
              <div>
                <div className="decision__context-eyebrow">Context</div>
                <div className="decision__context-title">The final trade report you are deciding on</div>
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowReport((v) => !v)}
                data-decision-toggle-report="true"
              >
                {showReport ? 'Hide report' : 'Show report'}
              </button>
            </div>

            {showReport && reportSection && (
              <InvestigationPanel
                section={{ ...reportSection }}
                research={null}
                attack={null}
                history={null}
                risk={null}
                structure={null}
                report={report}
                decision={decision}
                idea={idea}
                onEdit={onEdit}
              />
            )}
          </div>

          {/* --- the decision --- */}
          <div className="decision__stage">
            <div className="decision__stage-head">
              <h2 className="decision__stage-title">Record your decision</h2>
              <p className="decision__stage-desc">
                This is your call, not TradeGuard&apos;s. Recording it stores what you decided and
                why — nothing more.
              </p>
            </div>

            <DecisionPanel
              decision={decision}
              idea={idea}
              onRecord={handleRecord}
              saving={saving}
              errors={{ ...errors, ...localErrors }}
              onEditDecision={() => onDecisionRecorded?.(null)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
