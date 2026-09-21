/**
 * Trader Review panel (Phase 13).
 *
 * This is the trader's own closing review of a completed trade. It answers a
 * different question from Trade Review (Phase 11):
 *
 *   Trade Review   — "what happened after I made the decision?"
 *   Trader Review  — "what do I actually know about this trade, what did I put
 *                     in myself, what is still missing, and what do I think of
 *                     it now?"
 *
 * INFORMATION ARCHITECTURE: one section at a time behind a horizontal navigator —
 * SUMMARY | KNOWN | RECORDED | NOT AVAILABLE | REFLECTION — so it reads as a
 * workspace rather than one long page.
 *
 * Every fact here is READ from the stored record for this trade. Opening this
 * screen re-runs no analysis: no research, no thesis attack, no historical stress
 * test, no risk engine, no structure, no report. The record was assembled when
 * the trade was saved; this screen only presents it.
 *
 * The three-way split is the point of the screen:
 *   KNOWN         what TradeGuard itself produced or verified
 *   RECORDED      what the trader put in, in their own words
 *   NOT AVAILABLE what nobody has — stated plainly, never guessed at
 *
 * The ONLY thing this panel writes is the trader's reflection, and it goes
 * straight back to App state so it survives navigation and is saved with the
 * trade. TradeGuard never generates, completes, scores or grades it.
 */

import { useEffect, useState } from 'react';
import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS, CONFIDENCE_LABELS } from '../../lib/constants.js';
import { DataRow } from './primitives.jsx';
import WorkspaceNav from './WorkspaceNav.jsx';
import { formatTimestamp } from '../journal/JournalList.jsx';

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
  { id: 'summary', label: 'Summary', index: 1, title: 'Where this trade stands' },
  { id: 'known', label: 'Known', index: 2, title: 'What TradeGuard knows' },
  { id: 'recorded', label: 'Recorded', index: 3, title: 'What you recorded' },
  { id: 'gaps', label: 'Not available', index: 4, title: 'What is not available' },
  { id: 'reflection', label: 'Reflection', index: 5, title: 'Your reflection' },
];

/** How the reflection save is going, in the trader's words. */
function syncLine(sync) {
  if (!sync) return null;
  switch (sync.state) {
    case 'pending':
      return 'Saving…';
    case 'saved':
      return `Saved with this trade · ${formatTimestamp(sync.at)}`;
    case 'failed':
      return `Not saved: ${sync.message || 'Trade Memory could not be reached.'}`;
    default:
      return null;
  }
}

function Section({ index, title, children }) {
  return (
    <section className="report__section" data-trader-section={title}>
      <div className="report__section-title">
        {index != null && <span className="report__section-index">{index}</span>}
        <span className="report__section-label">{title}</span>
      </div>
      <div className="report__section-body">{children}</div>
    </section>
  );
}

function confidenceText(value) {
  if (value == null) return 'Not specified';
  const label = CONFIDENCE_LABELS[value];
  return `${value}/10${label ? ` · ${label}` : ''}`;
}

export default function TraderReviewPanel({
  record,
  reflection,
  onReflectionChange,
  sync,
  reflectionNote,
}) {
  const [activeId, setActiveId] = useState('summary');

  // A different trade starts back on the summary.
  useEffect(() => {
    setActiveId('summary');
  }, [record?.id]);

  if (!record) return null;

  const trade = record.trade || {};
  const decision = record.decision || {};
  const execution = record.execution || {};
  const review = record.review || null;
  const plan = review?.plan || null;
  const investigation = record.investigation || { status: 'not-recorded', stages: {} };
  const gaps = Array.isArray(record.unavailable) ? record.unavailable : [];
  const reflectedOn = record.traderReview?.status === 'recorded';

  const active = TABS.find((tab) => tab.id === activeId) || TABS[0];
  const syncText = syncLine(sync);

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
              <DataRow label="Your decision" value={decision.status === 'recorded' ? decision.decision : 'Not recorded'} />
              <DataRow label="Decided at" value={formatTimestamp(decision.timestamp)} />
              <DataRow label="Execution" value={execution.statusLabel || '—'} />
              <DataRow label="Investigation" value={investigation.statusLabel || '—'} />
              <DataRow
                label="Your reflection"
                value={reflectedOn ? `Recorded ${formatTimestamp(record.traderReview.recordedAt)}` : 'Not recorded'}
              />
            </dl>
            <p className="report__notice report__notice--muted">
              Read from the record saved for this trade. Opening Trader Review re-runs no analysis and
              calculates no profit, loss or performance figure.
            </p>
          </>
        );

      /* ------------------------------------------------------------------ */
      /* KNOWN — what TradeGuard produced or verified                        */
      /* ------------------------------------------------------------------ */
      case 'known':
        return (
          <>
            <p className="report__notice report__notice--muted">
              Facts TradeGuard holds for this trade — the levels you supplied and the figures the risk
              engine calculated from them. None of this is a prediction or a verdict.
            </p>

            <div className="report__sub-label">The trade you submitted</div>
            <dl className="data-grid">
              <DataRow label="Asset" value={trade.asset || '—'} />
              <DataRow label="Direction" value={DIRECTION_LABELS[trade.direction] || trade.direction || '—'} />
              <DataRow
                label="Timeframe"
                value={TIMEFRAME_LABELS[trade.timeframe] || trade.timeframe || 'Not specified'}
              />
              <DataRow label="Entry" value={trade.entryPrice != null ? fmt(trade.entryPrice) : 'Not specified'} />
              <DataRow
                label="Invalidation / stop"
                value={trade.invalidationPrice != null ? fmt(trade.invalidationPrice) : 'Not specified'}
              />
              <DataRow label="Risk amount" value={trade.riskAmount != null ? fmt(trade.riskAmount) : 'Not specified'} />
              <DataRow label="Confidence" value={confidenceText(trade.confidence)} />
              <DataRow
                label="Existing position"
                value={
                  trade.existingPosition
                    ? EXISTING_POSITION_LABELS[trade.existingPosition] || trade.existingPosition
                    : 'Not specified'
                }
              />
            </dl>

            <div className="report__sub-label">What the risk engine calculated</div>
            {plan ? (
              <>
                <dl className="data-grid">
                  <DataRow label="Risk budget" value={fmt(plan.riskBudget)} />
                  <DataRow label="Price risk / unit" value={fmt(plan.priceRiskPerUnit)} />
                  <DataRow label="Position size" value={fmt(plan.positionSize)} />
                  <DataRow label="Defined risk" value={fmt(plan.definedRisk)} />
                </dl>
                <p className="review__src-note">
                  Phase 6 deterministic risk engine, reused unchanged — never recalculated here.
                </p>
              </>
            ) : (
              <p className="review__known-text is-empty">
                No risk/structure figures were recorded for this trade, so there are none to show. The
                levels above are the ones you supplied.
              </p>
            )}

            <div className="report__sub-label">Investigation state</div>
            <dl className="data-grid">
              {STAGE_ORDER.map(([key, label]) => (
                <DataRow key={key} label={label} value={STAGE_LABELS[investigation.stages?.[key]] || 'Not recorded'} />
              ))}
            </dl>
          </>
        );

      /* ------------------------------------------------------------------ */
      /* RECORDED — what the trader put in, in their own words               */
      /* ------------------------------------------------------------------ */
      case 'recorded':
        return (
          <>
            <div className="report__sub-label">Your thesis, as submitted</div>
            <p className="review__thesis" data-trader-thesis="true">
              {trade.thesis || '—'}
            </p>

            <div className="report__sub-label">Your decision</div>
            {decision.status === 'recorded' ? (
              <>
                <dl className="data-grid">
                  <DataRow label="Decision" value={decision.decision || '—'} />
                  <DataRow label="Recorded at" value={formatTimestamp(decision.timestamp)} />
                </dl>
                <div className="review__known">
                  <div className="review__known-title">Your reason, as recorded</div>
                  {decision.reason ? (
                    <blockquote className="review__reason" data-trader-reason="true">
                      {decision.reason}
                    </blockquote>
                  ) : (
                    <p className="review__known-text is-empty">No reason was recorded with this decision.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="review__known-text is-empty" data-trader-no-decision="true">
                No decision was recorded for this trade, so there is nothing here. Trader Review stores
                the gap rather than filling it in.
              </p>
            )}

            <div className="report__sub-label">Your notes written at review time</div>
            {record.notes ? (
              <blockquote className="journal__note-text" data-trader-review-notes="true">
                {record.notes}
              </blockquote>
            ) : (
              <p className="review__known-text is-empty">No notes were written at review time.</p>
            )}

            <p className="report__notice report__notice--muted">
              Stored verbatim. TradeGuard recorded these — it did not write them, and it does not judge
              whether the trade was a good one.
            </p>
          </>
        );

      /* ------------------------------------------------------------------ */
      /* NOT AVAILABLE — everything nobody has                               */
      /* ------------------------------------------------------------------ */
      case 'gaps':
        return (
          <>
            <p className="report__notice report__notice--muted">
              These are the things this trade does not have. Trader Review records what happened —
              including what did not — rather than filling a gap with a guess.
            </p>
            {gaps.length ? (
              <ul className="review__limits" data-trader-gaps="true">
                {gaps.map((line, i) => (
                  <li key={i} className="review__limit">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="review__known-text">Nothing is missing from this record.</p>
            )}
          </>
        );

      /* ------------------------------------------------------------------ */
      /* REFLECTION — the trader's own words, and the only thing written here */
      /* ------------------------------------------------------------------ */
      case 'reflection':
        return (
          <>
            <p className="report__notice report__notice--muted">
              This is your own note on the completed trade — what you would keep doing, what you would
              change. It is saved with the trade and will still be here after a reload.
            </p>

            <textarea
              className="textarea trader__reflection"
              placeholder="Looking back at this trade: what did you get right, what would you do differently, and what will you watch for next time? This note is yours — TradeGuard does not draw conclusions from it."
              value={reflection || ''}
              onChange={(e) => onReflectionChange?.(e.target.value)}
              data-trader-reflection="true"
            />

            <div className="trader__reflection-foot">
              <span
                className={`trader__save-state trader__save-state--${sync?.state || 'idle'}`}
                data-trader-save-state={sync?.state || 'idle'}
              >
                {syncText || 'Not saved yet'}
              </span>
              {reflectedOn && (
                <span className="trader__reflection-at">
                  First recorded {formatTimestamp(record.traderReview.recordedAt)}
                </span>
              )}
            </div>

            {reflectionNote && <p className="review__src-note">{reflectionNote}</p>}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="trader" data-trader-stage="true">
      <div className="review__status-row">
        <span className="report__badge report__badge--ready" data-trader-status={investigation.status}>
          {reflectedOn ? 'REFLECTION RECORDED' : 'REFLECTION NOT RECORDED'}
        </span>
        <span className="review__status-note">
          {reflectedOn
            ? 'You have written your own reflection on this trade.'
            : 'You have not written a reflection on this trade yet.'}
        </span>
      </div>

      <WorkspaceNav
        title="Trader review"
        meta={trade.asset ? `${trade.asset} · ${decision.status === 'recorded' ? decision.decision : 'no decision'}` : undefined}
        items={TABS.map((tab) => ({ id: tab.id, label: tab.label, index: tab.index }))}
        activeId={active.id}
        onSelect={setActiveId}
        ariaLabel="Trader review sections"
      />

      <Section index={active.index} title={active.title}>
        {renderBody()}
      </Section>
    </div>
  );
}
