/**
 * Journal detail (Phase 12, extended in Phase 13).
 *
 * One saved trade, opened. INFORMATION ARCHITECTURE: like the Trade Report and
 * the Trade Review, this is a NAVIGABLE workspace rather than one long page — the
 * record is read one section at a time behind a horizontal navigator:
 *
 *   SUMMARY | DECISION | EXECUTION | PLAN | REVIEW | NOTES | REFLECTION | NOT AVAILABLE
 *
 * Everything here comes from the STORED record. Opening an old trade re-runs
 * nothing: no research, no thesis attack, no historical stress test, no risk
 * engine, no structure, no report. That is what makes the journal a memory rather
 * than a re-investigation.
 *
 * It never computes a profit, a loss, a fill or a score — the stored fields are
 * null by construction and are rendered as unavailable rather than as zero.
 */

import { useEffect, useState } from 'react';
import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS, CONFIDENCE_LABELS } from '../../lib/constants.js';
import { DataRow } from '../investigation/primitives.jsx';
import WorkspaceNav from '../investigation/WorkspaceNav.jsx';
import { formatTimestamp } from './JournalList.jsx';

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

const STAGE_ORDER = [
  ['research', 'Market & event research'],
  ['attack', "Devil's Advocate"],
  ['history', 'Historical stress test'],
  ['plan', 'Risk engine & trade structure'],
  ['report', 'Final report'],
];

const STAGE_LABELS = {
  available: 'Recorded',
  partial: 'Partly recorded',
  unavailable: 'Unavailable',
  unknown: 'Not recorded',
};

const TABS = [
  { id: 'summary', label: 'Summary', index: 1, title: 'Saved trade summary' },
  { id: 'decision', label: 'Decision', index: 2, title: 'Your recorded decision' },
  { id: 'execution', label: 'Execution', index: 3, title: 'Paper execution state' },
  { id: 'plan', label: 'Plan', index: 4, title: 'Thesis and trade plan' },
  { id: 'review', label: 'Review', index: 5, title: 'Trade review' },
  { id: 'notes', label: 'Notes', index: 6, title: 'Review notes' },
  { id: 'reflection', label: 'Reflection', index: 7, title: 'Your reflection' },
  { id: 'gaps', label: 'Not available', index: 8, title: 'What is not available in this record' },
];

function Section({ index, title, children }) {
  return (
    <section className="report__section" data-journal-section={title}>
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
  return (
    <div className="review__known">
      <div className="review__known-title">{label}</div>
      <p className={`review__known-text${block.available === false ? ' is-empty' : ''}`}>
        {block.summary || 'Not available.'}
      </p>
    </div>
  );
}

export default function JournalDetail({ record }) {
  const [activeId, setActiveId] = useState('summary');

  // A different saved trade starts back on the summary.
  useEffect(() => {
    setActiveId('summary');
  }, [record?.id]);

  if (!record) return null;

  const trade = record.trade || {};
  const decision = record.decision || {};
  const execution = record.execution || {};
  const review = record.review || null;
  const investigation = record.investigation || { status: 'not-recorded', stages: {} };
  const gaps = Array.isArray(record.unavailable) ? record.unavailable : [];

  const active = TABS.find((tab) => tab.id === activeId) || TABS[0];

  const renderBody = () => {
    switch (active.id) {
      /* ------------------------------------------------------------------ */
      /* SUMMARY                                                             */
      /* ------------------------------------------------------------------ */
      case 'summary':
        return (
          <>
            <dl className="data-grid">
              <DataRow label="Asset" value={trade.asset || '—'} />
              <DataRow label="Direction" value={DIRECTION_LABELS[trade.direction] || trade.direction || '—'} />
              <DataRow
                label="Timeframe"
                value={TIMEFRAME_LABELS[trade.timeframe] || trade.timeframe || 'Not specified'}
              />
              <DataRow label="Decision" value={decision.decision || 'Not recorded'} />
              <DataRow label="Decided at" value={formatTimestamp(decision.timestamp)} />
              <DataRow label="Execution" value={execution.statusLabel || '—'} />
              <DataRow label="Investigation" value={investigation.statusLabel || '—'} />
              <DataRow label="Review" value={review?.statusLabel || 'Not recorded'} />
              <DataRow
                label="Reflection"
                value={
                  record.traderReview?.status === 'recorded'
                    ? `Recorded ${formatTimestamp(record.traderReview.recordedAt)}`
                    : 'Not recorded'
                }
              />
              <DataRow label="Saved at" value={formatTimestamp(record.createdAt)} />
              <DataRow label="Last updated" value={formatTimestamp(record.updatedAt)} />
            </dl>
            <p className="report__notice report__notice--muted">
              Read from the saved record — opening a trade in Trade Memory re-runs no analysis.
            </p>
          </>
        );

      /* ------------------------------------------------------------------ */
      /* DECISION                                                            */
      /* ------------------------------------------------------------------ */
      case 'decision':
        return decision.status === 'recorded' ? (
          <>
            <dl className="data-grid">
              <DataRow label="Decision" value={decision.decision || '—'} />
              <DataRow label="Recorded at" value={formatTimestamp(decision.timestamp)} />
            </dl>
            <div className="review__known">
              <div className="review__known-title">Your reason, as recorded</div>
              {decision.reason ? (
                <blockquote className="review__reason" data-journal-reason="true">
                  {decision.reason}
                </blockquote>
              ) : (
                <p className="review__known-text is-empty">No reason was recorded with this decision.</p>
              )}
            </div>
            <p className="report__notice report__notice--muted">
              Stored verbatim. TradeGuard recorded this decision; it did not make it, and it does not
              judge whether it was a good one.
            </p>
          </>
        ) : (
          <p className="review__known-text is-empty" data-journal-no-decision="true">
            No decision was recorded for this trade, so there is nothing to show here. Trade Memory
            stores the gap rather than filling it in.
          </p>
        );

      /* ------------------------------------------------------------------ */
      /* EXECUTION                                                           */
      /* ------------------------------------------------------------------ */
      case 'execution': {
        const order = execution.order;
        return (
          <>
            <dl className="data-grid">
              <DataRow label="Execution state" value={execution.statusLabel || '—'} />
              <DataRow label="Submitted at" value={formatTimestamp(execution.submittedAt)} />
              <DataRow label="Order ID" value={execution.orderId || 'Not available'} />
              <DataRow label="Fill" value={execution.fillNote || 'Not available'} />
              <DataRow label="Profit / loss" value={execution.pnlNote || 'Not available'} />
            </dl>

            {execution.statusDetail && <p className="report__notice">{execution.statusDetail}</p>}

            {order && (
              <>
                <div className="report__sub-label">The venue's returned order</div>
                <dl className="data-grid">
                  <DataRow label="Symbol" value={order.symbol || '—'} />
                  <DataRow label="Side" value={order.side ? String(order.side).toUpperCase() : '—'} />
                  <DataRow label="Quantity" value={fmt(order.quantity)} />
                  <DataRow label="Price" value={fmt(order.price)} />
                  <DataRow label="Type" value={order.orderType ? String(order.orderType).toUpperCase() : '—'} />
                  <DataRow
                    label="Environment"
                    value={order.environment === 'demo' ? 'Bitget Demo (virtual funds)' : '—'}
                  />
                </dl>
              </>
            )}

            {!order && execution.intendedOrder && (
              <>
                <div className="report__sub-label">The order that was prepared — NOT submitted</div>
                <dl className="data-grid">
                  <DataRow label="Symbol" value={execution.intendedOrder.symbol || '—'} />
                  <DataRow label="Side" value={execution.intendedOrder.side ? String(execution.intendedOrder.side).toUpperCase() : '—'} />
                  <DataRow label="Quantity" value={fmt(execution.intendedOrder.quantity)} />
                  <DataRow label="Price" value={fmt(execution.intendedOrder.price)} />
                  <DataRow label="Type" value={execution.intendedOrder.orderType ? String(execution.intendedOrder.orderType).toUpperCase() : '—'} />
                  <DataRow label="Submitted" value="No — nothing was sent to the venue" />
                </dl>
              </>
            )}

            <p className="report__notice report__notice--muted">
              A submitted demo order is not a filled order. Trade Memory never invents an order ID, a
              fill, or a profit and loss figure.
            </p>
          </>
        );
      }

      /* ------------------------------------------------------------------ */
      /* PLAN                                                                */
      /* ------------------------------------------------------------------ */
      case 'plan':
        return (
          <>
            <div className="report__sub-label">Thesis, as submitted</div>
            <p className="review__thesis" data-journal-thesis="true">
              {trade.thesis || '—'}
            </p>
            <p className="report__notice report__notice--muted">
              Preserved verbatim from the original submission. Trade Memory does not reinterpret it.
            </p>

            <div className="report__sub-label">Trade plan</div>
            {review?.plan ? (
              <dl className="data-grid">
                <DataRow label="Entry" value={fmt(review.plan.entryPrice)} />
                <DataRow label="Invalidation / stop" value={fmt(review.plan.invalidationPrice)} />
                <DataRow label="Risk budget" value={fmt(review.plan.riskBudget)} />
                <DataRow label="Price risk / unit" value={fmt(review.plan.priceRiskPerUnit)} />
                <DataRow label="Position size" value={fmt(review.plan.positionSize)} />
                <DataRow label="Defined risk" value={fmt(review.plan.definedRisk)} />
              </dl>
            ) : (
              <>
                <dl className="data-grid">
                  <DataRow
                    label="Entry"
                    value={trade.entryPrice != null ? fmt(trade.entryPrice) : 'Not specified'}
                  />
                  <DataRow
                    label="Invalidation / stop"
                    value={trade.invalidationPrice != null ? fmt(trade.invalidationPrice) : 'Not specified'}
                  />
                  <DataRow
                    label="Risk amount"
                    value={trade.riskAmount != null ? fmt(trade.riskAmount) : 'Not specified'}
                  />
                  <DataRow
                    label="Confidence"
                    value={
                      trade.confidence != null
                        ? `${trade.confidence}/10 · ${CONFIDENCE_LABELS[trade.confidence] || ''}`.trim()
                        : 'Not specified'
                    }
                  />
                  <DataRow
                    label="Existing position"
                    value={
                      trade.existingPosition
                        ? EXISTING_POSITION_LABELS[trade.existingPosition] || trade.existingPosition
                        : 'Not specified'
                    }
                  />
                </dl>
                <p className="review__known-text is-empty">
                  No risk/structure plan was recorded for this trade, so the engine's figures are not
                  available here. The levels above are the ones you submitted.
                </p>
              </>
            )}
          </>
        );

      /* ------------------------------------------------------------------ */
      /* REVIEW                                                              */
      /* ------------------------------------------------------------------ */
      case 'review':
        if (!review) {
          return (
            <p className="review__known-text is-empty" data-journal-no-review="true">
              No trade review was recorded for this trade.
            </p>
          );
        }
        return (
          <>
            <div className="review__status-row">
              <span className="report__badge report__badge--incomplete">{review.statusLabel || review.status}</span>
              {review.statusDetail && <span className="review__status-note">{review.statusDetail}</span>}
            </div>

            <div className="report__sub-label">Recorded investigation state</div>
            <dl className="data-grid">
              {STAGE_ORDER.map(([key, label]) => (
                <DataRow key={key} label={label} value={STAGE_LABELS[investigation.stages?.[key]] || 'Not recorded'} />
              ))}
            </dl>

            <div className="report__sub-label">Outcome</div>
            <dl className="data-grid">
              <DataRow
                label="Outcome"
                value={review.outcome?.status ? String(review.outcome.status).toUpperCase() : '—'}
              />
              <DataRow label="Fill" value={review.outcome?.fillNote || 'Not available'} />
              <DataRow label="Profit / loss" value={review.outcome?.pnlNote || 'Not available'} />
            </dl>

            {review.knownBefore && (
              <>
                <div className="report__sub-label">What was known before the decision</div>
                <div className="review__known-list">
                  <KnownBlock label="Final report" block={review.knownBefore.finalReport} />
                  <KnownBlock label="Market context" block={review.knownBefore.marketContext} />
                  <KnownBlock label="Events & catalysts" block={review.knownBefore.eventsCatalysts} />
                  <KnownBlock label="Devil's Advocate" block={review.knownBefore.devilsAdvocate} />
                  <KnownBlock label="Historical stress test" block={review.knownBefore.historicalStressTest} />
                </div>
              </>
            )}
          </>
        );

      /* ------------------------------------------------------------------ */
      /* NOTES                                                               */
      /* ------------------------------------------------------------------ */
      case 'notes':
        return record.notes ? (
          <blockquote className="journal__note-text" data-journal-notes="true">
            {record.notes}
          </blockquote>
        ) : (
          <p className="review__known-text is-empty" data-journal-no-notes="true">
            No review notes were written for this trade.
          </p>
        );

      /* ------------------------------------------------------------------ */
      /* REFLECTION — the trader's own closing note (Phase 13)               */
      /* ------------------------------------------------------------------ */
      case 'reflection': {
        const traderReview = record.traderReview || { status: 'not-recorded' };
        return traderReview.status === 'recorded' ? (
          <>
            <blockquote className="journal__note-text" data-journal-reflection-text="true">
              {traderReview.notes}
            </blockquote>
            <p className="report__notice report__notice--muted">
              Recorded {formatTimestamp(traderReview.recordedAt)}. Written by you in Trader Review and
              stored verbatim — TradeGuard never generates, scores or grades it.
            </p>
          </>
        ) : (
          <p className="review__known-text is-empty" data-journal-no-reflection="true">
            No reflection was written for this trade. Trade Memory records the gap rather than filling
            it in with a conclusion of its own.
          </p>
        );
      }

      /* ------------------------------------------------------------------ */
      /* GAPS — everything this record does not have                         */
      /* ------------------------------------------------------------------ */
      case 'gaps':
        return gaps.length ? (
          <>
            <p className="report__notice report__notice--muted">
              These are the things this saved trade does not contain. Trade Memory records what
              happened — including what did not — rather than filling the gaps with a guess.
            </p>
            <ul className="review__limits" data-journal-gaps="true">
              {gaps.map((line, i) => (
                <li key={i} className="review__limit">
                  {line}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="review__known-text">This record has no gaps recorded.</p>
        );

      default:
        return null;
    }
  };

  return (
    <div className="journal__detail" data-journal-detail={record.id}>
      <WorkspaceNav
        title="Saved trade"
        meta={`${trade.asset || '—'} · saved ${formatTimestamp(record.updatedAt)}`}
        items={TABS.map((tab) => ({ id: tab.id, label: tab.label, index: tab.index }))}
        activeId={active.id}
        onSelect={setActiveId}
        ariaLabel="Saved trade sections"
      />

      <Section index={active.index} title={active.title}>
        {renderBody()}
      </Section>
    </div>
  );
}
