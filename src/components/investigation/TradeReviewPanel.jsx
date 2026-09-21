/**
 * Trade Review panel (Phase 11).
 *
 * INFORMATION ARCHITECTURE: this is a navigable review workspace, not one giant
 * vertical page. The review is shown ONE section at a time behind a horizontal
 * navigator: SUMMARY | DECISION | EXECUTION | PLAN | OUTCOME | CONTEXT | NOTES.
 *
 * It renders ONLY what the deterministic review service assembled. It computes
 * nothing, never derives a recommendation, and never shows a profit, loss or fill
 * that was not verified. No information was removed in the restructure — the
 * "what was known before the decision" synthesis lives in its own CONTEXT tab so
 * the SUMMARY stays a compact overview.
 *
 * The only thing the panel writes is the trader's own review note, and that write
 * goes straight back to App state (onNotesChange) so it survives navigation. No
 * note is ever auto-generated.
 */

import { useEffect, useState } from 'react';
import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS } from '../../lib/constants.js';
import { DataRow, UnavailableNotice } from './primitives.jsx';
import WorkspaceNav from './WorkspaceNav.jsx';

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

/** The review sections, in order. The navigator shows these one at a time. */
const REVIEW_TABS = [
  { id: 'summary', label: 'Summary', index: 1, title: 'Review summary' },
  { id: 'decision', label: 'Decision', index: 2, title: 'Your decision' },
  { id: 'execution', label: 'Execution', index: 3, title: 'Execution record' },
  { id: 'plan', label: 'Plan', index: 4, title: 'Trade plan' },
  { id: 'outcome', label: 'Outcome', index: 5, title: 'Outcome status' },
  { id: 'context', label: 'Context', index: 6, title: 'What was known before the decision' },
  { id: 'notes', label: 'Notes', index: 7, title: 'Review notes' },
];

function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** A titled review section — keeps the sections visually uniform. */
function Section({ index, title, children }) {
  return (
    <section className="report__section" data-review-section={title}>
      <div className="report__section-title">
        {index != null && <span className="report__section-index">{index}</span>}
        <span className="report__section-label">{title}</span>
      </div>
      <div className="report__section-body">{children}</div>
    </section>
  );
}

function KnownBlock({ label, block }) {
  if (!block) return null;
  if (block.available === false) {
    return (
      <div className="review__known">
        <div className="review__known-title">{label}</div>
        <p className="review__known-text is-empty">{block.summary || 'Not available.'}</p>
      </div>
    );
  }
  return (
    <div className="review__known">
      <div className="review__known-title">{label}</div>
      <p className="review__known-text">{block.summary || '—'}</p>
    </div>
  );
}

export default function TradeReviewPanel({ review, idea, notes, onNotesChange }) {
  const [activeId, setActiveId] = useState('summary');

  // A different review (a different trade) starts back on the summary.
  useEffect(() => {
    setActiveId('summary');
  }, [review]);

  // Still assembling — not a locked gate, so show a neutral loading state.
  if (!review) {
    return (
      <div className="review" data-review-stage="true">
        <span className="report__badge report__badge--incomplete">ASSEMBLING</span>
        <p className="report__notice report__notice--muted">Assembling the trade review from your verified records.</p>
      </div>
    );
  }

  // Backend could not be reached at all.
  if (review.available === false) {
    return (
      <div className="review" data-review-stage="true">
        <div className="review__status-row">
          <span className="report__badge report__badge--unavailable" data-review-status="unavailable">
            {review.statusLabel || 'REVIEW UNAVAILABLE'}
          </span>
        </div>
        <p className="report__honesty">
          {review.statusDetail ||
            'Trade Review could not be assembled because the TradeGuard backend could not be reached.'}
        </p>
      </div>
    );
  }

  const status = review.status;
  const badgeClass =
    status === 'ready'
      ? 'report__badge--ready'
      : status === 'incomplete'
      ? 'report__badge--incomplete'
      : 'report__badge--unavailable';

  const summary = review.summary || {};
  const thesis = review.thesis;
  const plan = review.plan;
  const decision = review.decision || {};
  const execRec = review.executionRecord || {};
  const outcome = review.outcome || {};
  const known = review.knownBefore || {};

  const active = REVIEW_TABS.find((tab) => tab.id === activeId) || REVIEW_TABS[0];

  /** The content of exactly one review section, selected by the navigator. */
  const renderBody = () => {
    switch (active.id) {
      /* ---------------------------------------------------------------- */
      /* SUMMARY                                                           */
      /* ---------------------------------------------------------------- */
      case 'summary':
        return (
          <dl className="data-grid">
            <DataRow label="Asset" value={summary.asset || idea?.asset || '—'} />
            <DataRow
              label="Direction"
              value={DIRECTION_LABELS[summary.direction] || summary.direction || idea?.direction || '—'}
            />
            <DataRow
              label="Timeframe"
              value={TIMEFRAME_LABELS[summary.timeframe] || summary.timeframe || 'Not specified'}
            />
            <DataRow label="Decision" value={decision.decisionLabel || decision.decision || '—'} />
            <DataRow label="Execution status" value={summary.executionStatus || '—'} />
            <DataRow label="Review status" value={review.statusLabel} />
          </dl>
        );

      /* ---------------------------------------------------------------- */
      /* DECISION                                                          */
      /* ---------------------------------------------------------------- */
      case 'decision':
        return (
          <>
            <dl className="data-grid">
              <DataRow label="Decision" value={decision.decisionLabel || decision.decision || '—'} />
              <DataRow label="Recorded at" value={formatTimestamp(decision.timestamp)} />
            </dl>
            <div className="review__known">
              <div className="review__known-title">Your reason</div>
              {decision.reason ? (
                <blockquote className="review__reason" data-review-reason="true">
                  {decision.reason}
                </blockquote>
              ) : (
                <p className="review__known-text is-empty">No reason was recorded with this decision.</p>
              )}
            </div>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* EXECUTION                                                         */
      /* ---------------------------------------------------------------- */
      case 'execution':
        return execRec.executed && execRec.order ? (
          <>
            <p className="report__notice">{execRec.detail}</p>
            <dl className="data-grid">
              <DataRow label="Order status" value={execRec.status ? String(execRec.status).toUpperCase() : '—'} />
              <DataRow label="Order ID" value={execRec.order.orderId || 'Not returned by the venue'} />
              <DataRow label="Symbol" value={execRec.order.symbol || '—'} />
              <DataRow label="Side" value={execRec.order.side ? String(execRec.order.side).toUpperCase() : '—'} />
              <DataRow label="Quantity" value={fmt(execRec.order.quantity)} />
              <DataRow label="Price" value={fmt(execRec.order.price)} />
              <DataRow label="Type" value={execRec.order.orderType ? String(execRec.order.orderType).toUpperCase() : '—'} />
              <DataRow label="Submitted" value={formatTimestamp(execRec.order.submittedAt)} />
              <DataRow
                label="Environment"
                value={execRec.order.environment === 'demo' ? 'Bitget Demo (virtual funds)' : '—'}
              />
            </dl>
          </>
        ) : (
          <>
            <dl className="data-grid">
              <DataRow label="Order status" value={execRec.status ? String(execRec.status).toUpperCase() : '—'} />
            </dl>
            <p className="review__known-text" data-review-execution-detail="true">
              {execRec.detail || 'No paper order was submitted.'}
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* PLAN                                                              */
      /* ---------------------------------------------------------------- */
      case 'plan':
        return (
          <>
            <div className="report__sub-label">Original thesis</div>
            <p className="review__thesis" data-review-thesis="true">
              {thesis || '—'}
            </p>
            <p className="report__notice report__notice--muted">
              Preserved verbatim from your submitted thesis. Trade Review does not reinterpret it.
            </p>

            <div className="report__sub-label">Trade plan</div>
            {plan ? (
              <dl className="data-grid">
                <DataRow label="Entry" value={fmt(plan.entryPrice)} />
                <DataRow label="Invalidation / stop" value={fmt(plan.invalidationPrice)} />
                <DataRow label="Risk budget" value={fmt(plan.riskBudget)} />
                <DataRow label="Price risk / unit" value={fmt(plan.priceRiskPerUnit)} />
                <DataRow label="Position size" value={fmt(plan.positionSize)} />
                <DataRow label="Defined risk" value={fmt(plan.definedRisk)} />
              </dl>
            ) : (
              <UnavailableNotice reason="The risk assessment needed to show the plan is missing." />
            )}
            {plan?.source && <p className="review__src-note">{plan.source}</p>}
          </>
        );

      /* ---------------------------------------------------------------- */
      /* OUTCOME                                                           */
      /* ---------------------------------------------------------------- */
      case 'outcome':
        return (
          <>
            <dl className="data-grid">
              <DataRow label="Outcome" value={outcome.status ? String(outcome.status).toUpperCase() : '—'} />
              <DataRow label="Fill" value={outcome.fillNote || '—'} />
              <DataRow label="Profit / loss" value={outcome.pnlNote || '—'} />
            </dl>
            <p className="report__notice report__notice--muted">
              Trade Review never calculates P&amp;L. It appears only if a verified execution outcome reports a
              fill — and a demo submission is not a fill.
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* CONTEXT — what was known before the decision (synthesis, no model) */
      /* ---------------------------------------------------------------- */
      case 'context':
        return (
          <>
            <p className="report__notice report__notice--muted">
              A synthesis of the investigation you already ran — not new research, no model.
            </p>
            <div className="review__known-list">
              <KnownBlock label="Final report" block={known.finalReport} />
              <KnownBlock label="Market context" block={known.marketContext} />
              <KnownBlock label="Events & catalysts" block={known.eventsCatalysts} />
              <KnownBlock label="Devil's Advocate" block={known.devilsAdvocate} />
              <KnownBlock label="Historical stress test" block={known.historicalStressTest} />
            </div>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* NOTES — trader-entered, survives navigation                        */
      /* ---------------------------------------------------------------- */
      case 'notes':
        return (
          <>
            <textarea
              className="textarea review__notes-input"
              placeholder="What did you learn from this trade? What would you do differently? This note is yours — TradeGuard does not auto-generate conclusions from it."
              value={notes || ''}
              onChange={(e) => onNotesChange?.(e.target.value)}
              data-review-notes="true"
            />
            {review.notesPersistenceNote && <p className="review__src-note">{review.notesPersistenceNote}</p>}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="review" data-review-stage="true">
      <div className="review__status-row">
        <span className={`report__badge ${badgeClass}`} data-review-status={status}>
          {review.statusLabel}
        </span>
        <span className="review__status-note">{review.statusDetail}</span>
      </div>

      <WorkspaceNav
        title="Trade review"
        items={REVIEW_TABS.map((tab) => ({ id: tab.id, label: tab.label, index: tab.index }))}
        activeId={active.id}
        onSelect={setActiveId}
        ariaLabel="Trade review sections"
      />

      <Section index={active.index} title={active.title}>
        {renderBody()}
      </Section>

      {/* Standing limitations + disclaimer. Always present. */}
      <ul className="review__limits">
        {(review.limitations || []).map((line, i) => (
          <li key={i} className="review__limit">
            {line}
          </li>
        ))}
      </ul>
      {review.disclaimer && <p className="review__disclaimer">{review.disclaimer}</p>}
    </div>
  );
}
