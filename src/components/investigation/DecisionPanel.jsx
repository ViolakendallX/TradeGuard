/**
 * Human Decision section (Phase 9).
 *
 * This is the one screen in TradeGuard where the trader does something rather
 * than reads something. Everything else in the investigation examines the trade;
 * here the trader records the decision THEY are making — TAKE, WAIT or SKIP —
 * with their own reason.
 *
 * The whole file is built around one rule:
 *
 *   TradeGuard RECORDS the decision. It does not MAKE it.
 *
 * So there is deliberately:
 *   - no preselected option
 *   - no suggested or recommended choice
 *   - no reason written for the trader, and no "generate" button
 *   - no score, no grade, no verdict on whether the choice was right
 *   - no BUY / SELL / PASS vocabulary — those are instructions; TAKE / WAIT /
 *     SKIP record a human choice that has already been made
 *   - nothing that executes anything: no order, no exchange, no wallet
 *
 * The component holds only FORM state (which option is selected, what is typed,
 * what errors came back). The SAVED record lives in App, so it survives
 * navigation and the Final Trade Report stays reachable beside it.
 */

import { useState } from 'react';
import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS } from '../../lib/constants.js';
import { DataRow } from './primitives.jsx';

/**
 * The three options, in the order the trader should consider them.
 *
 * The hint text is deliberately neutral: it describes what the WORD means, not
 * whether the choice is attractive. "Wait for a better entry" must not read as
 * "this is the sensible choice".
 */
const OPTIONS = [
  {
    value: 'TAKE',
    label: 'TAKE',
    hint: 'You are going ahead with this trade as described.',
  },
  {
    value: 'WAIT',
    label: 'WAIT',
    hint: 'You are holding off for now — the trade is not ready in your view.',
  },
  {
    value: 'SKIP',
    label: 'SKIP',
    hint: 'You are passing on this trade and moving on.',
  },
];

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

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
 * The decision form. Shown until a decision is recorded.
 *
 * `errors` comes from the backend (server-side validation is authoritative) and
 * from a local pre-check so the trader is not made to wait for a round trip to
 * learn that the reason is empty.
 */
function DecisionForm({ onSave, saving, errors, onClearError }) {
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState('');

  const canSubmit = Boolean(decision) && reason.trim().length > 0 && !saving;

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    // The reason is sent as typed — trimmed only for the emptiness check, never
    // rewritten, so the trader's own words are what gets stored.
    onSave({ decision, reason });
  };

  return (
    <form className="decision__form" onSubmit={submit} data-decision-form="true">
      {/* --- the ownership statement: the thing this whole phase exists for --- */}
      <div className="decision__ownership">
        <div className="decision__ownership-title">This decision is yours to make</div>
        <p className="decision__ownership-text">
          TradeGuard does not choose this for you. Record the decision you are making based on the
          report.
        </p>
      </div>

      {/* --- 1. which decision --- */}
      <div className="decision__block">
        <div className="decision__block-head">
          <span className="decision__step">1</span>
          <div>
            <div className="decision__block-title">Your decision</div>
            <div className="decision__block-hint">
              One of the three. Nothing is selected for you.
            </div>
          </div>
        </div>

        <div
          className="decision__options"
          role="radiogroup"
          aria-label="Your decision"
          data-decision-options="true"
        >
          {OPTIONS.map((option) => {
            const selected = decision === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`decision__option${selected ? ' is-selected' : ''}`}
                data-decision-option={option.value}
                onClick={() => {
                  setDecision(option.value);
                  onClearError?.('decision');
                }}
              >
                <span className={`decision__radio${selected ? ' is-on' : ''}`} aria-hidden="true" />
                <span className="decision__option-body">
                  <span className="decision__option-label">{option.label}</span>
                  <span className="decision__option-hint">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {errors?.decision && (
          <p className="field__error" data-decision-error="decision">
            {errors.decision}
          </p>
        )}
      </div>

      {/* --- 2. why --- */}
      <div className="decision__block">
        <div className="decision__block-head">
          <span className="decision__step">2</span>
          <div>
            <div className="decision__block-title">
              Your reason <span className="label__req">required</span>
            </div>
            <div className="decision__block-hint">
              In your own words, why you are making this decision. TradeGuard will not write this
              for you and will not change it.
            </div>
          </div>
        </div>

        <textarea
          id="decision-reason"
          className={`textarea${errors?.reason ? ' has-error' : ''}`}
          rows={5}
          value={reason}
          maxLength={2000}
          placeholder="e.g. Price held the support area on the last two sessions and momentum is still pointing up, so I am comfortable risking 50 on this setup."
          aria-required="true"
          aria-invalid={Boolean(errors?.reason)}
          data-decision-reason="true"
          onChange={(e) => {
            setReason(e.target.value);
            onClearError?.('reason');
          }}
        />

        {errors?.reason ? (
          <p className="field__error" data-decision-error="reason">
            {errors.reason}
          </p>
        ) : (
          <p className="field__meta">{reason.trim().length} / 2000 characters</p>
        )}
      </div>

      {/* --- 3. save --- */}
      <div className="decision__actions">
        <button
          type="submit"
          className="btn btn--primary"
          style={{ width: 'auto' }}
          disabled={!canSubmit}
          data-decision-save="true"
        >
          {saving ? 'Recording…' : 'Record decision'}
        </button>
        <span className="decision__actions-note">
          Recording a decision does not place an order, contact an exchange or execute anything.
          It stores what you decided.
        </span>
      </div>

      {errors?.general && (
        <p className="field__error" data-decision-error="general">
          {errors.general}
        </p>
      )}
    </form>
  );
}

/**
 * The recorded decision. Shown once the trader has decided.
 *
 * The framing is deliberate throughout: "You recorded", "The decision was
 * recorded by the trader", "Written by the trader". Nothing here says the trade
 * is good, approved, valid or advisable — only that a human made a call.
 */
function DecisionRecord({ record, onEdit }) {
  return (
    <div className="decision__record" data-decision-record="true">
      <div className="decision__record-head">
        <div>
          <div className="decision__record-eyebrow">Recorded by you</div>
          <div className="decision__record-decision" data-decision-recorded-value={record.decision}>
            You recorded: <strong>{record.decisionLabel || record.decision}</strong>
          </div>
        </div>
        <span className="decision__status" data-decision-status="recorded">
          {record.statusLabel || 'DECISION RECORDED'}
        </span>
      </div>

      <div className="decision__reason">
        <div className="decision__reason-label">
          Your reason
          <span className="decision__reason-src">
            {record.reasonSource || 'Written by the trader — not generated by TradeGuard'}
          </span>
        </div>
        <blockquote className="decision__reason-text" data-decision-reason-text="true">
          {record.reason}
        </blockquote>
      </div>

      <dl className="data-grid" data-decision-context="true">
        <DataRow label="Recorded at" value={formatTimestamp(record.timestamp)} />
        <DataRow label="Asset" value={record.trade?.asset || '—'} />
        <DataRow
          label="Direction"
          value={DIRECTION_LABELS[record.trade?.direction] || record.trade?.direction || '—'}
        />
        <DataRow
          label="Timeframe"
          value={TIMEFRAME_LABELS[record.trade?.timeframe] || record.trade?.timeframe || 'Not specified'}
        />
        <DataRow label="Entry" value={fmt(record.trade?.entryPrice)} />
        <DataRow label="Invalidation / stop" value={fmt(record.trade?.invalidationPrice)} />
        <DataRow label="Risk amount" value={fmt(record.trade?.riskAmount)} />
        <DataRow label="Confidence" value={fmt(record.trade?.confidence)} />
        <DataRow
          label="Existing position"
          value={
            EXISTING_POSITION_LABELS[record.trade?.existingPosition] ||
            record.trade?.existingPosition ||
            'Not specified'
          }
        />
      </dl>

      <div className="decision__risk">
        <div className="decision__risk-title">
          Risk context at the time you decided
          <span className="decision__risk-src">
            Calculated by the Phase 6 risk engine — not recalculated here
          </span>
        </div>
        {record.risk?.state === 'available' ? (
          <dl className="data-grid" data-decision-risk="true">
            <DataRow label="Price risk / unit" value={fmt(record.risk.priceRiskPerUnit)} />
            <DataRow label="Position size" value={`${fmt(record.risk.positionSize)} units`} />
            <DataRow label="Defined risk" value={fmt(record.risk.definedRisk)} />
            <DataRow label="Risk budget" value={fmt(record.risk.riskBudget)} />
          </dl>
        ) : (
          <p className="decision__risk-partial" data-decision-risk-state={record.risk?.state || 'unavailable'}>
            {record.risk?.state === 'partial'
              ? `The risk assessment was ${record.risk?.statusLabel || 'incomplete'} when you decided, so there is no defined risk in this record.`
              : 'No risk assessment was available when you recorded this decision, so no risk figures are stored here.'}
            {record.risk?.reason ? ` ${record.risk.reason}` : ''}
          </p>
        )}
      </div>

      <p className="decision__attribution" data-decision-attribution="true">
        {record.ownership || 'The decision was recorded by the trader.'} TradeGuard did not choose
        it, did not suggest it and does not score it. Recording a decision is not a claim that the
        trade is good, and nothing has been executed.
      </p>

      <div className="decision__record-actions">
        <button type="button" className="btn btn--ghost" onClick={onEdit} data-decision-change="true">
          Change this decision
        </button>
        <span className="decision__actions-note">
          Changing it updates this record rather than adding a second one.
        </span>
      </div>
    </div>
  );
}

/**
 * The honest "nothing recorded yet" shape.
 *
 * The backend returns this when recording is attempted but validation fails, and
 * the frontend uses it as the initial state before any attempt. It is what makes
 * the DECISION REQUIRED state a real, renderable thing rather than an absence.
 */
const PENDING = {
  status: 'required',
  statusLabel: 'DECISION REQUIRED',
  decision: null,
  decisionLabel: null,
  reason: null,
  timestamp: null,
  available: true,
  limitations: [
    'TradeGuard did not evaluate whether this decision is good, correct or likely to work. It will record what you choose.',
    'Recording a decision does not place an order, contact an exchange or execute anything.',
    'The decision is stored and attributed to you. It is not a TradeGuard recommendation.',
  ],
};

export default function DecisionPanel({ decision, idea, onRecord, saving, errors, onEditDecision }) {
  // No record yet means the trader has not decided — that is the initial state,
  // not a missing render. The form must be on screen from the start.
  const record = decision || PENDING;

  const recorded = record.status === 'recorded' && record.available !== false;
  // The same panel is embedded read-only in the investigation workspace, where
  // there is nothing to save to. In that context the form is shown for context
  // but the save action is inert and says where to go.
  const canRecord = typeof onRecord === 'function';

  // The backend was unreachable while trying to record. Say so plainly rather
  // than showing a decision that was never stored.
  if (record.available === false) {
    return (
      <div className="decision" data-decision-stage="true">
        <div className="decision__status-row">
          <span
            className="decision__status decision__status--offline"
            data-decision-status="offline"
          >
            {record.statusLabel || 'DECISION NOT RECORDED'}
          </span>
        </div>
        <p className="report__honesty">
          {record.statusDetail ||
            record.reason ||
            'The decision could not be recorded, because the TradeGuard backend could not be reached.'}
        </p>
        <p className="report__notice report__notice--muted">
          Nothing has been stored, and no decision has been inferred from your activity. Retry once
          the backend is reachable.
        </p>
      </div>
    );
  }

  return (
    <div className="decision" data-decision-stage="true">
      <div className="decision__status-row">
        <span
          className={`decision__status decision__status--${recorded ? 'recorded' : 'required'}`}
          data-decision-status={recorded ? 'recorded' : 'required'}
        >
          {record.statusLabel || (recorded ? 'DECISION RECORDED' : 'DECISION REQUIRED')}
        </span>
        <span className="decision__status-note">
          {recorded
            ? 'You have recorded the decision you are making. You can change it at any time.'
            : 'No decision has been recorded for this trade yet.'}
        </span>
      </div>

      {recorded ? (
        <DecisionRecord record={record} onEdit={onEditDecision} />
      ) : canRecord ? (
        <DecisionForm onSave={onRecord} saving={saving} errors={errors} />
      ) : (
        // Embedded in the investigation workspace (read-only): explain where the
        // decision is actually recorded rather than showing a dead form.
        <p className="report__notice">
          Your decision is recorded on the <strong>Decision</strong> screen, in the step after this
          investigation. TradeGuard does not choose it for you.
        </p>
      )}

      {/* The rule this stage cannot break, stated once, in the panel. */}
      <ul className="decision__boundary">
        {(record.limitations || []).map((line, i) => (
          <li key={i} className="decision__boundary-item">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
