import {
  DIRECTIONS,
  TIMEFRAME_LABELS,
  EXISTING_POSITION_LABELS,
  CONFIDENCE_LABELS,
} from '../../lib/constants.js';

const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };

export default function ThesisPreview({ form }) {
  const direction = DIRECTIONS.find((d) => d.value === form.direction);
  const asset = form.asset.trim();

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">Live thesis</div>
          <div className="card__hint">What TradeGuard has captured so far.</div>
        </div>
      </div>
      <div className="card__body">
        <div className="preview__asset">
          <span className={`preview__ticker${asset ? '' : ' is-placeholder'}`}>
            {asset ? asset.toUpperCase() : '—'}
          </span>
          {direction && (
            <span className={`chip ${TONE_CLASS[direction.value]}`}>{direction.label}</span>
          )}
        </div>

        <p className={`preview__thesis${form.thesis.trim() ? '' : ' is-placeholder'}`}>
          {form.thesis.trim() || 'Your thesis will appear here as you type.'}
        </p>

        <div className="divider" />

        <dl className="kv">
          <dt>Timeframe</dt>
          <dd className={form.timeframe ? '' : 'is-empty'}>
            {form.timeframe ? TIMEFRAME_LABELS[form.timeframe] : '—'}
          </dd>

          <dt>Entry</dt>
          <dd className={form.entryPrice.trim() ? '' : 'is-empty'}>
            {form.entryPrice.trim() || '—'}
          </dd>

          <dt>Risk</dt>
          <dd className={form.riskAmount.trim() ? '' : 'is-empty'}>
            {form.riskAmount.trim() || '—'}
          </dd>

          <dt>Confidence</dt>
          <dd>
            {form.confidence}/10 · {CONFIDENCE_LABELS[form.confidence]}
          </dd>

          <dt>Position</dt>
          <dd className={form.existingPosition ? '' : 'is-empty'}>
            {form.existingPosition
              ? EXISTING_POSITION_LABELS[form.existingPosition]
              : '—'}
          </dd>
        </dl>
      </div>
    </div>
  );
}
