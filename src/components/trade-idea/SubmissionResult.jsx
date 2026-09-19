import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS, CONFIDENCE_LABELS } from '../../lib/constants.js';

const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };
const DIRECTION_LABEL = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

const money = (value) =>
  typeof value === 'number'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : null;

export default function SubmissionResult({ result, onDismiss }) {
  if (!result) return null;

  const { kind, data, message, errors, offline } = result;

  if (kind === 'error') {
    return (
      <div className="result result--error">
        <div className="result__head">
          <span className="result__badge result__badge--error">Not accepted</span>
        </div>
        <p className="result__message">
          {message || 'The trade idea could not be accepted.'}
          {errors && Object.keys(errors).length > 0 && (
            <>
              <br />
              <br />
              The backend rejected these fields:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {Object.entries(errors).map(([field, text]) => (
                  <li key={field}>
                    <strong>{field}</strong>: {text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </p>
        <button type="button" className="btn btn--ghost" onClick={onDismiss}>
          Back to the form
        </button>
      </div>
    );
  }

  const idea = data?.idea ?? {};

  return (
    <div className={`result ${offline ? 'result--warn' : 'result--ok'}`}>
      <div className="result__head">
        <span className={`result__badge ${offline ? 'result__badge--warn' : 'result__badge--ok'}`}>
          {offline ? 'Captured locally' : 'Thesis captured'}
        </span>
        <span className="result__time">{formatTime(data?.receivedAt)}</span>
      </div>

      <p className="result__message">{message || data?.message}</p>

      <div className="section-label">What you submitted</div>
      <dl className="kv">
        <dt>Asset</dt>
        <dd>
          <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            {idea.asset}
          </span>
        </dd>

        <dt>Direction</dt>
        <dd>
          <span className={`chip ${TONE_CLASS[idea.direction] ?? 'chip--neutral'}`}>
            {DIRECTION_LABEL[idea.direction] ?? idea.direction}
          </span>
        </dd>

        <dt>Thesis</dt>
        <dd>{idea.thesis}</dd>

        <dt>Timeframe</dt>
        <dd className={idea.timeframe ? '' : 'is-empty'}>
          {idea.timeframe ? TIMEFRAME_LABELS[idea.timeframe] ?? idea.timeframe : 'Not specified'}
        </dd>

        <dt>Entry price</dt>
        <dd className={idea.entryPrice === null ? 'is-empty' : ''}>
          {idea.entryPrice === null ? 'Not specified' : money(idea.entryPrice)}
        </dd>

        <dt>Risk amount</dt>
        <dd className={idea.riskAmount === null ? 'is-empty' : ''}>
          {idea.riskAmount === null ? 'Not specified' : money(idea.riskAmount)}
        </dd>

        <dt>Confidence</dt>
        <dd>
          {idea.confidence}/10 · {CONFIDENCE_LABELS[idea.confidence]}
        </dd>

        <dt>Existing position</dt>
        <dd className={idea.existingPosition ? '' : 'is-empty'}>
          {idea.existingPosition
            ? EXISTING_POSITION_LABELS[idea.existingPosition] ?? idea.existingPosition
            : 'Not specified'}
        </dd>
      </dl>

      {Array.isArray(data?.nextSteps) && data.nextSteps.length > 0 && (
        <>
          <div className="divider" />
          <div className="section-label">Not enabled in this build</div>
          <ul className="roadmap">
            {data.nextSteps.map((step) => (
              <li key={step.step}>
                <span>{step.step}</span>
                <span className="roadmap__phase">Phase {step.phase}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="divider" />
      <button type="button" className="btn btn--ghost" onClick={onDismiss}>
        Edit thesis
      </button>
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour12: false });
}
