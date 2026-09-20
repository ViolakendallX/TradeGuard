/**
 * Paper Execution screen (Phase 10).
 *
 * Step 5. The trader has already decided to TAKE — that is what makes this
 * screen reachable at all — and now confirms, or does not, that the trade should
 * be sent to the Bitget Demo environment with virtual funds.
 *
 * What this screen does:
 *   - runs the same deterministic chain the decision screen runs, so the report
 *     and the risk figures behind the order are the same ones
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPaperExecution,
  submitPaperExecution,
  fetchResearch,
  fetchThesisAttack,
  fetchHistoricalStressTest,
  fetchRiskAssessment,
  fetchTradeStructure,
  fetchFinalReport,
} from '../lib/api.js';
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

export default function PaperExecutionScreen({ submission, onEdit, decision, onExecutionRecorded }) {
  const [execution, setExecution] = useState(null);
  const [report, setReport] = useState(null);
  const [risk, setRisk] = useState(null);
  const [structure, setStructure] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  /**
   * Runs the deterministic chain so the gate is evaluated against the same
   * report, risk and structure the trader saw when they decided.
   *
   * Nothing here computes risk — every figure comes from a service.
   */
  useEffect(() => {
    if (!submission || !idea) return undefined;

    const tradeContext = {
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
      setExecution({
        available: false,
        status: 'unavailable',
        statusLabel: 'PAPER EXECUTION UNAVAILABLE',
        statusDetail: 'Backend offline — paper execution is evaluated server-side and requires the TradeGuard API.',
      });
      return undefined;
    }

    let cancelled = false;

    const settled = { market: null, events: null, attack: null, history: null, risk: null, structure: null };
    let structureRequested = false;
    let reportRequested = false;
    let executionRequested = false;

    // The gate needs the risk result, the structure and the report. It is
    // requested once all three settle — including on the failure paths, so it
    // can never hang on "evaluating" when a provider dies mid-chain.
    const requestExecution = () => {
      if (cancelled || executionRequested) return;
      if (!settled.risk || !settled.structure || !settled.report) return;
      executionRequested = true;

      fetchPaperExecution(tradeContext, {
        risk: settled.risk,
        structure: settled.structure,
        report: settled.report,
        decision,
      })
        .then((e) => {
          if (cancelled) return;
          setExecution(e.ok ? e.data.execution : { available: false, statusDetail: e.message });
          onExecutionRecorded?.(e.ok ? e.data.execution : null);
        })
        .catch((err) => {
          if (cancelled) return;
          setExecution({ available: false, statusDetail: String(err?.message || err) });
        });
    };

    const requestReport = () => {
      if (cancelled || reportRequested) return;
      if (Object.values(settled).some((v) => v === null)) return;
      reportRequested = true;

      fetchFinalReport(tradeContext, {
        market: settled.market,
        events: settled.events,
        attack: settled.attack,
        history: settled.history,
        risk: settled.risk,
        structure: settled.structure,
      })
        .then((r) => {
          if (cancelled) return;
          settled.report = r.ok ? r.data.report : { available: false, statusDetail: r.message };
          setReport(settled.report);
          requestExecution();
        })
        .catch((e) => {
          if (cancelled) return;
          settled.report = { available: false, statusDetail: String(e?.message || e) };
          setReport(settled.report);
          requestExecution();
        });
    };

    const requestStructure = () => {
      if (cancelled || structureRequested || !settled.risk || !settled.attack) return;
      structureRequested = true;

      fetchTradeStructure(tradeContext, { risk: settled.risk, attack: settled.attack })
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

    fetchRiskAssessment(tradeContext)
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

    fetchResearch(tradeContext)
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

        return fetchThesisAttack(tradeContext, { market: researchData.market, events: researchData.events })
          .then((a) => {
            if (cancelled) return undefined;
            settled.attack = a.ok ? a.data.analysis : { available: false, reason: a.message };
            requestStructure();

            return fetchHistoricalStressTest(tradeContext, {
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
  }, [submission, idea, decision]);

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
          if (result.execution) setExecution(result.execution);
          setError(result.message);
          return;
        }

        setExecution(result.data.execution);
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
            execution={execution}
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
