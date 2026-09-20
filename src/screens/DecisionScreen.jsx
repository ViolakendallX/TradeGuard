/**
 * Human Decision screen (Phase 9).
 *
 * This is where TradeGuard hands the decision back. The investigation has run —
 * thesis, research, attack, stress test, risk, structure, final report — and the
 * trader now records what THEY are going to do about it.
 *
 * INFORMATION ARCHITECTURE: this screen answers exactly one question —
 * "what am I deciding, and what do I need immediately before deciding?"
 * It shows a compact decision brief (report status, quick summary, investigation
 * status), the original thesis, the risk figures, and the decision form. It does
 * NOT render the entire Final Trade Report inline any more; a "View full report →"
 * action opens the dedicated, navigable report workspace. The report is not
 * removed — it is separated from the act of deciding.
 *
 * What this screen does:
 *   - runs the same deterministic chain the investigation screen runs, so the
 *     report status and the investigation status are the same ones, from the same
 *     services
 *   - sends the trader's decision to the backend and shows exactly what was stored
 *
 * What it does NOT do:
 *   - choose, suggest, score or predict the decision
 *   - write the trader's reason
 *   - place an order, contact an exchange, or execute anything
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { recordHumanDecision } from '../lib/api.js';
import { STAGE_RUNTIME } from '../lib/investigation.js';
import { buildSectionNav, fmt } from '../lib/investigationView.js';
import { TIMEFRAME_LABELS } from '../lib/constants.js';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import DecisionPanel from '../components/investigation/DecisionPanel.jsx';
import { DataRow, UnavailableNotice } from '../components/investigation/primitives.jsx';

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

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

export default function DecisionScreen({ submission, session, onEdit, decision, onDecisionRecorded, onNavigate }) {
  // Every analysis input comes from the shared trade session — the chain ran
  // once, when the trade was submitted. Recording a decision therefore does NOT
  // re-run it: only the execution gate and the review depend on the decision,
  // and both are cheap server-side assemblies with no providers behind them.
  const idea = session?.idea || submission?.idea || null;
  const context = session?.context || null;
  const research = session?.research ?? null;
  const attack = session?.attack ?? null;
  const history = session?.history ?? null;
  const risk = session?.risk ?? null;
  const structure = session?.structure ?? null;
  const report = session?.report ?? null;

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [localErrors, setLocalErrors] = useState({});

  // A new submission clears any errors from the previous one.
  useEffect(() => {
    setErrors({});
    setLocalErrors({});
  }, [submission]);

  // Prefer the freshly calculated Phase 6 result; fall back to the risk already
  // stored on a recorded decision when this is an edit. Either way the figures
  // are the ENGINE's — nothing here computes.
  const riskContext = risk || decision?.risk || null;

  // Investigation status: how many analysis stages produced usable data, from the
  // SAME stage model the investigation rail uses. No new computation.
  const investigationCounts = useMemo(() => {
    const sections = buildSectionNav(research, attack, history, risk, structure, report, decision).filter(
      (s) => s.id !== 'human-decision' && s.id !== 'paper-execution'
    );
    const count = (runtime) => sections.filter((s) => s.runtime === runtime).length;
    return {
      total: sections.length,
      available: count(STAGE_RUNTIME.COMPLETE),
      partial: count(STAGE_RUNTIME.PARTIAL),
      unavailable:
        count(STAGE_RUNTIME.UNAVAILABLE) + count(STAGE_RUNTIME.LOCKED) + count(STAGE_RUNTIME.LOADING),
    };
  }, [research, attack, history, risk, structure, report, decision]);

  /**
   * Record the trader's decision.
   *
   * A local pre-check runs first so the trader gets an immediate answer on the
   * two things the backend will certainly reject — no decision selected, or an
   * empty reason — but the BACKEND remains authoritative.
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

  const reportReady = report && report.available !== false;
  const riskReady = risk && risk.available !== false && Boolean(risk.calculation);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 4 — Decision</div>
        <h1 className="page-head__title">Your decision</h1>
        <p className="page-head__lede">
          Everything you need immediately before deciding is on this screen. Record the decision you are
          making — TAKE, WAIT or SKIP — with your own reason. TradeGuard does not choose this for you, does
          not suggest an option, and does not execute anything. It records what you decided.
        </p>
      </div>

      <div className="inv-workspace">
        <TradeHeader idea={idea} offline={Boolean(submission.offline)} onEdit={onEdit} />

        <div className="decision__workspace">
          {/* --- YOUR DECISION: the decision brief --------------------------- */}
          <section className="report__section" data-decision-brief="true">
            <div className="report__section-title">
              <span className="report__section-label">Your decision</span>
            </div>

            <div className="decision__brief-top">
              <span
                className={`report__badge report__badge--${reportReady ? report.status : 'unavailable'}`}
                data-decision-report-status="true"
              >
                {reportReady ? report.statusLabel : 'REPORT UNAVAILABLE'}
              </span>
              {onNavigate && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onNavigate('trade-report')}
                  data-decision-view-report="true"
                >
                  View full report →
                </button>
              )}
            </div>

            <div className="report__sub-label">Quick summary</div>
            <dl className="data-grid">
              <DataRow label="Asset" value={idea.asset || '—'} />
              <DataRow label="Direction" value={DIRECTION_LABELS[idea.direction] || idea.direction || '—'} />
              <DataRow
                label="Timeframe"
                value={TIMEFRAME_LABELS[idea.timeframe] || idea.timeframe || 'Not specified'}
              />
              <DataRow label="Entry" value={fmt(idea.entryPrice)} />
              <DataRow label="Invalidation / stop" value={fmt(idea.invalidationPrice)} />
              <DataRow label="Risk" value={fmt(idea.riskAmount)} />
              <DataRow label="Confidence" value={idea.confidence != null ? `${idea.confidence} / 10` : '—'} />
            </dl>

            <div className="report__sub-label">Investigation status</div>
            <div className="decision__counts" data-decision-investigation-status="true">
              <span className="report__count report__count--available">
                <strong>{investigationCounts.available}</strong> available
              </span>
              <span className="report__count report__count--partial">
                <strong>{investigationCounts.partial}</strong> partial
              </span>
              <span className="report__count report__count--unavailable">
                <strong>{investigationCounts.unavailable}</strong> unavailable
              </span>
              <span className="report__count report__count--total">of {investigationCounts.total} sections</span>
            </div>
            <p className="report__footnote">
              The full investigation and the consolidated report remain available — this brief is only what
              you need to decide.
            </p>
          </section>

          {/* --- THESIS ------------------------------------------------------ */}
          <section className="report__section" data-decision-thesis="true">
            <div className="report__section-title">
              <span className="report__section-label">Thesis</span>
            </div>
            <blockquote className="report__thesis">{idea.thesis}</blockquote>
            <p className="report__footnote">Your own words, unchanged.</p>
          </section>

          {/* --- RISK -------------------------------------------------------- */}
          <section className="report__section" data-decision-risk-section="true">
            <div className="report__section-title">
              <span className="report__section-label">Risk</span>
            </div>
            {riskReady ? (
              <dl className="data-grid">
                <DataRow label="Entry" value={fmt(risk.inputs?.entryPrice ?? idea.entryPrice)} />
                <DataRow
                  label="Invalidation / stop"
                  value={fmt(risk.inputs?.invalidationPrice ?? idea.invalidationPrice)}
                />
                <DataRow label="Risk budget" value={fmt(risk.calculation?.riskBudget)} />
                <DataRow label="Price risk / unit" value={fmt(risk.calculation?.priceRiskPerUnit)} />
                <DataRow label="Position size" value={`${fmt(risk.calculation?.positionSize)} units`} />
                <DataRow label="Defined risk" value={fmt(risk.calculation?.definedRisk)} />
              </dl>
            ) : (
              <UnavailableNotice reason={risk?.statusDetail || 'The risk assessment is not available.'} />
            )}
            <p className="report__footnote">
              Calculated by the Phase 6 risk engine from your own entry, invalidation and risk budget — not
              recalculated here.
            </p>
          </section>

          {/* --- DECISION ---------------------------------------------------- */}
          <section className="report__section" data-decision-form-section="true">
            <div className="report__section-title">
              <span className="report__section-label">Record your decision</span>
            </div>
            <p className="decision__stage-desc">
              This is your call, not TradeGuard&apos;s. Recording it stores what you decided and why —
              nothing more.
            </p>
            <DecisionPanel
              decision={decision}
              idea={idea}
              onRecord={handleRecord}
              saving={saving}
              errors={{ ...errors, ...localErrors }}
              onEditDecision={() => onDecisionRecorded?.(null)}
            />
          </section>

          {onNavigate && (
            <div className="decision__brief-foot">
              <button
                type="button"
                className="btn btn--inline"
                onClick={() => onNavigate('trade-report')}
                data-decision-view-report-foot="true"
              >
                View full report →
              </button>
              <span className="decision__actions-note">
                Opens the navigable Final Trade Report. It stays available whether or not you decide now.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
