/**
 * Persistent trade header for the investigation workspace.
 *
 * Answers "what trade am I investigating?" without any scrolling: it is sticky
 * under the app topbar, so the trade identity, the submitted context and the
 * Edit Thesis action stay available while the analysis below scrolls.
 *
 * It renders the SAME submission data the thesis section used to render, so
 * nothing is duplicated further down — the thesis section holds only the thesis
 * text itself.
 */

import {
  DIRECTIONS,
  TIMEFRAME_LABELS,
  EXISTING_POSITION_LABELS,
  CONFIDENCE_LABELS,
} from '../../lib/constants.js';
import { TONE_CLASS, formatValue } from '../../lib/investigationView.js';

export default function TradeHeader({ idea, offline, onEdit, innerRef }) {
  const direction = DIRECTIONS.find((d) => d.value === idea.direction);
  const hasEntry = idea.entryPrice !== null && idea.entryPrice !== undefined && idea.entryPrice !== '';
  const hasRisk = idea.riskAmount !== null && idea.riskAmount !== undefined && idea.riskAmount !== '';
  const hasPosition = Boolean(idea.existingPosition);

  return (
    <header className="inv-head" ref={innerRef}>
      <div className="inv-head__id">
        <span className="preview__ticker">{idea.asset}</span>
        {direction && (
          <span className={`chip ${TONE_CLASS[direction.value] ?? 'chip--neutral'}`}>
            {direction.label}
          </span>
        )}
      </div>

      <dl className="inv-head__facts">
        <div className="inv-fact">
          <dt>Timeframe</dt>
          <dd className={idea.timeframe ? '' : 'is-empty'}>
            {idea.timeframe ? TIMEFRAME_LABELS[idea.timeframe] ?? idea.timeframe : 'Not specified'}
          </dd>
        </div>

        <div className="inv-fact">
          <dt>Entry</dt>
          <dd className={hasEntry ? '' : 'is-empty'}>
            {hasEntry ? formatValue(idea.entryPrice) : 'Not specified'}
          </dd>
        </div>

        <div className="inv-fact">
          <dt>Risk</dt>
          <dd className={hasRisk ? '' : 'is-empty'}>
            {hasRisk ? formatValue(idea.riskAmount) : 'Not specified'}
          </dd>
        </div>

        <div className="inv-fact">
          <dt>Confidence</dt>
          <dd>
            {idea.confidence != null
              ? `${idea.confidence}/10 · ${CONFIDENCE_LABELS[idea.confidence]}`
              : 'Not specified'}
          </dd>
        </div>

        <div className="inv-fact">
          <dt>Position</dt>
          <dd className={hasPosition ? '' : 'is-empty'}>
            {hasPosition
              ? EXISTING_POSITION_LABELS[idea.existingPosition] ?? idea.existingPosition
              : 'Not specified'}
          </dd>
        </div>
      </dl>

      <div className="inv-head__actions">
        <button type="button" className="btn btn--primary btn--inline" onClick={onEdit}>
          Edit thesis
        </button>
      </div>

      {offline && (
        <p className="inv-head__note">
          Captured locally — the TradeGuard backend was not reachable, so nothing was validated or
          analysed server-side.
        </p>
      )}
    </header>
  );
}
