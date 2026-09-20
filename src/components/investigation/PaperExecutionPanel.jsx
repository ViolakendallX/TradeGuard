/**
 * Paper Execution panel (Phase 10).
 *
 * This panel is the gate's face. It shows ONE of five deterministic states —
 * locked, ready, unavailable, submitted, failed — and in the ready state it
 * shows the exact order that would be sent before anything is sent.
 *
 * The whole file is built around one rule:
 *
 *   TradeGuard does not decide to execute. The trader does, twice: once by
 *   recording TAKE, and once by confirming here.
 *
 * So there is deliberately:
 *   - no auto-submit on mount, and none after recording TAKE
 *   - no prefilled or suggested confirmation
 *   - no verdict vocabulary — no BUY SIGNAL, no RECOMMENDED, no probability,
 *     no win rate, no prediction
 *   - no position, wallet, leverage or portfolio control of any kind
 *   - no live-venue path: every surface says this is the demo environment
 *
 * The panel renders only what the service returned. It computes nothing: the
 * risk figures come from the Phase 6 engine, the order from the Phase 7
 * structure, and the authorisation from the trader's Phase 9 decision.
 */

import { useState } from 'react';
import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS } from '../../lib/constants.js';
import { DataRow } from './primitives.jsx';

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const SIDE_LABELS = { long: 'Long', short: 'Short', none: '—' };

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

/**
 * The pre-execution review: the exact trade that will be submitted.
 *
 * Everything here is a value the earlier stages produced. Nothing is derived
 * here — the risk figures are the engine's, the levels are the trader's, and
 * the decision is the trader's own words.
 */
function ExecutionReview({ review }) {
  if (!review) return null;

  return (
    <div className="exec__review" data-exec-review="true">
      <div className="exec__review-head">
        <div>
          <div className="exec__review-eyebrow">What would be submitted</div>
          <div className="exec__review-title">The exact order, before it is sent</div>
        </div>
      </div>

      <dl className="data-grid" data-exec-review-trade="true">
        <DataRow label="Asset" value={review.asset || '—'} />
        <DataRow label="Bitget symbol" value={review.symbol || '—'} />
        <DataRow
          label="Direction"
          value={DIRECTION_LABELS[review.direction] || review.direction || '—'}
        />
        <DataRow label="Side" value={SIDE_LABELS[review.side] || review.side || '—'} />
        <DataRow
          label="Timeframe"
          value={TIMEFRAME_LABELS[review.timeframe] || review.timeframe || 'Not specified'}
        />
        <DataRow label="Entry" value={fmt(review.entryPrice)} />
        <DataRow label="Invalidation / stop" value={fmt(review.invalidationPrice)} />
        <DataRow label="Risk budget" value={fmt(review.riskBudget)} />
        <DataRow label="Price risk / unit" value={fmt(review.priceRiskPerUnit)} />
        <DataRow label="Position size" value={fmt(review.positionSize)} />
        <DataRow label="Defined risk" value={fmt(review.definedRisk)} />
      </dl>

      <div className="exec__authorisation" data-exec-authorisation="true">
        <div className="exec__authorisation-label">
          Authorised by your recorded decision
          <span className="exec__authorisation-src">Recorded by the trader in Phase 9</span>
        </div>
        <div className="exec__authorisation-body">
          <span className="exec__decision-chip" data-exec-decision={review.decision || ''}>
            {review.decisionLabel || review.decision || '—'}
          </span>
          {review.decidedAt && (
            <span className="exec__decided-at">Recorded {formatTimestamp(review.decidedAt)}</span>
          )}
        </div>
        {review.reason && (
          <blockquote className="exec__reason" data-exec-reason="true">
            {review.reason}
          </blockquote>
        )}
      </div>

      {review.order && (
        <div className="exec__order" data-exec-order="true">
          <div className="exec__order-title">
            Order to be sent
            <span className="exec__order-src">
              Mapped from your trade structure — nothing is invented
            </span>
          </div>
          <dl className="data-grid">
            <DataRow label="Symbol" value={review.order.symbol} />
            <DataRow label="Side" value={String(review.order.side).toUpperCase()} />
            <DataRow label="Type" value={String(review.order.orderType).toUpperCase()} />
            <DataRow label="Quantity" value={fmt(review.order.quantity)} />
            <DataRow label="Price" value={fmt(review.order.price)} />
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * The explicit confirmation step.
 *
 * The trader must type the token and click. There is no prefilled value, no
 * "confirm for me", and no submission on any other path.
 */
function ConfirmationStep({ token, notice, onConfirm, submitting, error }) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === token;

  return (
    <div className="exec__confirm" data-exec-confirm="true">
      <div className="exec__confirm-notice" data-exec-confirm-notice="true">
        <strong>{notice}</strong>
      </div>

      <label className="exec__confirm-label" htmlFor="exec-confirm-input">
        Type <span className="exec__confirm-token">{token}</span> to confirm
      </label>
      <input
        id="exec-confirm-input"
        className={`input${error ? ' has-error' : ''}`}
        value={typed}
        autoComplete="off"
        placeholder={token}
        data-exec-confirm-input="true"
        onChange={(e) => setTyped(e.target.value)}
      />

      {error && (
        <p className="field__error" data-exec-error="true">
          {error}
        </p>
      )}

      <div className="exec__confirm-actions">
        <button
          type="button"
          className="btn btn--primary"
          style={{ width: 'auto' }}
          disabled={!matches || submitting}
          onClick={() => onConfirm(typed)}
          data-exec-confirm-button="true"
        >
          {submitting ? 'Submitting…' : 'Confirm paper execution'}
        </button>
        <span className="exec__confirm-note">
          This is a separate step from your decision to TAKE. Nothing is sent until you click.
        </span>
      </div>
    </div>
  );
}

/** The result of a submission — Bitget Demo's own returned data. */
function ExecutionResult({ result }) {
  if (!result) return null;

  // Three possible outcomes, and only one of them is a submission.
  const submitted = result.status === 'Submitted';
  const unusable = result.status === 'Unavailable';
  const failed = !submitted;

  return (
    <div className={`exec__result${failed ? ' is-failed' : ''}`} data-exec-result="true">
      <div className="exec__result-head">
        <div className="exec__result-title">
          {submitted ? 'PAPER ORDER SUBMITTED' : unusable ? 'PAPER EXECUTION UNAVAILABLE' : 'PAPER ORDER FAILED'}
        </div>
        <div className="exec__result-note">
          {submitted
            ? 'A demo order was accepted by Bitget Demo using virtual funds.'
            : unusable
            ? 'The demo venue could not be used, so no order was attempted and no live-money order was placed.'
            : 'No order was placed and no live-money order was attempted.'}
        </div>
      </div>

      <dl className="data-grid" data-exec-result-data="true">
        <DataRow label="Status" value={result.status} />
        {/* Only ever the ID the venue actually returned. Never a placeholder. */}
        <DataRow label="Order ID" value={result.orderId || 'Not returned by the venue'} />
        <DataRow label="Client reference" value={result.clientOrderId || 'Not returned by the venue'} />
        <DataRow label="Symbol" value={result.symbol || 'Not returned by the venue'} />
        <DataRow label="Side" value={result.side ? String(result.side).toUpperCase() : 'Not returned by the venue'} />
        <DataRow label="Quantity" value={result.quantity || 'Not returned by the venue'} />
        <DataRow label="Price" value={result.price || 'Not returned by the venue'} />
        <DataRow label="Type" value={result.orderType ? String(result.orderType).toUpperCase() : '—'} />
        <DataRow label="Submitted" value={formatTimestamp(result.submittedAt)} />
        <DataRow label="Environment" value={result.environment === 'demo' ? 'Bitget Demo (virtual funds)' : '—'} />
        {result.errorCode && <DataRow label="Provider code" value={result.errorCode} />}
      </dl>

      {result.missingCredentials && result.missingCredentials.length > 0 && (
        <div className="exec__credentials" data-exec-missing-credentials="true">
          <div className="exec__credentials-title">Bitget Demo credentials are not configured.</div>
          <p className="exec__credentials-text">
            Set these environment variables and restart the backend to enable paper execution:
          </p>
          <ul className="exec__credentials-list">
            {result.missingCredentials.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          <p className="exec__credentials-note">
            These are DEMO credentials. TradeGuard reads no live-trading credential and has no
            live-execution path.
          </p>
        </div>
      )}

      <p className="exec__result-caveat">
        TradeGuard does not manage this position afterwards — no stop adjustment, no take-profit, no
        exit. A submitted order is not a filled order, and an accepted demo order is not a successful
        trade.
      </p>
    </div>
  );
}

export default function PaperExecutionPanel({
  execution,
  idea,
  onExecute,
  submitting,
  error,
  canExecute,
}) {
  // No record yet — the stage has not been evaluated. That is loading, not a
  // locked gate, so it must not be rendered as a refusal.
  if (!execution) {
    return (
      <div className="exec" data-exec-stage="true">
        <div className="exec__status-row">
          <span className="exec__status exec__status--loading" data-exec-status="loading">
            EVALUATING
          </span>
        </div>
        <p className="report__notice report__notice--muted">
          Checking whether this trade is allowed to be paper-executed.
        </p>
      </div>
    );
  }

  // The service could not be reached at all.
  if (execution.available === false) {
    return (
      <div className="exec" data-exec-stage="true">
        <div className="exec__status-row">
          <span className="exec__status exec__status--offline" data-exec-status="offline">
            PAPER EXECUTION UNAVAILABLE
          </span>
        </div>
        <p className="report__honesty">
          {execution.statusDetail ||
            execution.reason ||
            'Paper execution could not be evaluated because the TradeGuard backend could not be reached.'}
        </p>
      </div>
    );
  }

  const status = execution.status;
  const locked = status === 'locked';
  const unavailable = status === 'unavailable';
  const ready = status === 'ready';
  const submitted = status === 'submitted';
  const failed = status === 'failed';

  // A result exists only when an attempt reached the venue, or when the venue
  // could not be used at all. A gate-level UNAVAILABLE (no risk, no symbol) has
  // no result and is rendered by the block above instead.
  const showResult = Boolean(execution.result) && (submitted || failed || unavailable);

  return (
    <div className="exec" data-exec-stage="true">
      <div className="exec__status-row">
        <span
          className={`exec__status exec__status--${status}`}
          data-exec-status={status}
        >
          {execution.statusLabel}
        </span>
        <span className="exec__status-note">
          {submitted
            ? 'A demo order was submitted with virtual funds.'
            : failed
            ? 'No order was placed.'
            : ready
            ? 'Nothing has been sent yet.'
            : locked
            ? 'Paper execution is not available for this trade.'
            : 'Paper execution cannot be used right now.'}
        </span>
      </div>

      {/* The demo boundary, stated once and always. */}
      <div className="exec__boundary" data-exec-demo-notice="true">
        <span className="exec__boundary-badge">DEMO</span>
        <p className="exec__boundary-text">
          Paper execution sends orders to the <strong>Bitget Demo</strong> environment using{' '}
          <strong>virtual funds</strong>. No live-money order is placed, and TradeGuard has no
          live-execution path.
        </p>
      </div>

      {locked && (
        <div className="exec__locked" data-exec-locked="true">
          <p className="exec__locked-text">{execution.statusDetail || execution.reason}</p>
          <p className="exec__locked-note">
            Only a recorded decision of TAKE unlocks paper execution — and even then nothing is
            submitted until you confirm it here.
          </p>
        </div>
      )}

      {unavailable && (
        <div className="exec__locked" data-exec-unavailable="true">
          <p className="exec__locked-text">{execution.statusDetail || execution.reason}</p>
          {execution.liveConfigurationRefused && (
            <p className="exec__locked-note">
              A live-execution setting was found in the environment and has been refused. This stage
              only ever submits to the demo environment.
            </p>
          )}
        </div>
      )}

      {ready && (
        <>
          <ExecutionReview review={execution.review} />
          {canExecute ? (
            <ConfirmationStep
              token={execution.confirmationToken}
              notice={execution.confirmationNotice}
              onConfirm={onExecute}
              submitting={submitting}
              error={error}
            />
          ) : (
            <p className="report__notice">
              Paper execution is confirmed on the <strong>Paper Execution</strong> screen, in the
              step after your decision.
            </p>
          )}
        </>
      )}

      {showResult && (
        <>
          <ExecutionReview review={execution.review} />
          <ExecutionResult result={execution.result} />
          {/* Retry is offered only after a real attempt. If the venue could not
              be used at all, there is nothing to retry against until it is
              configured. */}
          {failed && canExecute && (
            <div className="exec__retry" data-exec-retry="true">
              <button
                type="button"
                className="btn btn--ghost"
                style={{ width: 'auto' }}
                onClick={() => onExecute(execution.confirmationToken)}
                disabled={submitting}
              >
                Try again
              </button>
              <span className="exec__confirm-note">
                Retrying sends another demo order. Nothing is retried against a live venue.
              </span>
            </div>
          )}
        </>
      )}

      {/* The standing guarantees. Always present, so the UI cannot omit them. */}
      <ul className="exec__limits">
        {(execution.limitations || []).map((line, i) => (
          <li key={i} className="exec__limit">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
