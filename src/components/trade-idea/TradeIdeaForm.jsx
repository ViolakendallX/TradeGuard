import {
  DIRECTIONS,
  TIMEFRAMES,
  EXISTING_POSITIONS,
  CONFIDENCE_LABELS,
  THESIS_MIN_LENGTH,
  THESIS_MAX_LENGTH,
} from '../../lib/constants.js';

const TONE_VARS = {
  up: { '--dir-color': 'var(--up)', '--dir-soft': 'var(--up-soft)' },
  down: { '--dir-color': 'var(--down)', '--dir-soft': 'var(--down-soft)' },
  neutral: { '--dir-color': 'var(--neutral)', '--dir-soft': 'var(--neutral-soft)' },
};

export default function TradeIdeaForm({ form, errors, submitting, onChange, onSubmit, onReset }) {
  const setField = (name) => (event) => onChange(name, event.target.value);

  const thesisLength = form.thesis.trim().length;
  const confidenceFill = ((form.confidence - 1) / 9) * 100;

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="card__header">
        <div>
          <div className="card__title">Proposed trade</div>
          <div className="card__hint">
            Required: asset, direction, thesis. Everything else is optional context.
          </div>
        </div>
        <button type="button" className="btn btn--link" onClick={onReset} disabled={submitting}>
          Clear
        </button>
      </div>

      <div className="card__body">
        {/* ---------- Required ---------- */}
        <div className="section-label">Required</div>

        <div className="field__row">
          <div className="field">
            <label className="label" htmlFor="asset">
              Asset <span className="label__req">*</span>
            </label>
            <input
              id="asset"
              name="asset"
              className={`input input--ticker${errors.asset ? ' has-error' : ''}`}
              placeholder="e.g. rNVDA"
              autoComplete="off"
              spellCheck="false"
              value={form.asset}
              onChange={setField('asset')}
              aria-invalid={Boolean(errors.asset)}
              aria-describedby={errors.asset ? 'asset-error' : undefined}
            />
            {errors.asset && (
              <div className="field__error" id="asset-error">
                {errors.asset}
              </div>
            )}
          </div>

          <div className="field">
            <span className="label">
              Direction <span className="label__req">*</span>
            </span>
            <div className="direction" role="radiogroup" aria-label="Direction">
              {DIRECTIONS.map((option) => {
                const selected = form.direction === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    style={TONE_VARS[option.tone]}
                    className={`direction__option${selected ? ' is-selected' : ''}${
                      errors.direction ? ' has-error' : ''
                    }`}
                    onClick={() => onChange('direction', option.value)}
                  >
                    <span className="direction__title">{option.label}</span>
                    <span className="direction__desc">{option.hint}</span>
                  </button>
                );
              })}
            </div>
            {errors.direction && <div className="field__error">{errors.direction}</div>}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="thesis">
            Thesis <span className="label__req">*</span>
          </label>
          <textarea
            id="thesis"
            name="thesis"
            className={`textarea${errors.thesis ? ' has-error' : ''}`}
            placeholder="Why do you think this trade works? What has to happen for you to be right?"
            value={form.thesis}
            onChange={setField('thesis')}
            aria-invalid={Boolean(errors.thesis)}
            aria-describedby="thesis-meta"
          />
          <div
            className={`field__meta${thesisLength > THESIS_MAX_LENGTH ? ' is-over' : ''}`}
            id="thesis-meta"
          >
            <span>
              {thesisLength === 0
                ? `Minimum ${THESIS_MIN_LENGTH} characters`
                : `${thesisLength} / ${THESIS_MAX_LENGTH}`}
            </span>
            {errors.thesis && <span style={{ color: 'var(--up)' }}>{errors.thesis}</span>}
          </div>
        </div>

        <div className="divider" />

        {/* ---------- Optional ---------- */}
        <div className="section-label">Optional context</div>

        <div className="field__row">
          <div className="field">
            <label className="label" htmlFor="timeframe">
              Timeframe <span className="label__opt">optional</span>
            </label>
            <select
              id="timeframe"
              name="timeframe"
              className="select"
              value={form.timeframe}
              onChange={setField('timeframe')}
            >
              {TIMEFRAMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="existingPosition">
              Existing position <span className="label__opt">optional</span>
            </label>
            <select
              id="existingPosition"
              name="existingPosition"
              className="select"
              value={form.existingPosition}
              onChange={setField('existingPosition')}
            >
              <option value="">Not specified</option>
              {EXISTING_POSITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field__row field__row--3">
          <div className="field">
            <label className="label" htmlFor="entryPrice">
              Entry price <span className="label__opt">optional</span>
            </label>
            <input
              id="entryPrice"
              name="entryPrice"
              className={`input${errors.entryPrice ? ' has-error' : ''}`}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              value={form.entryPrice}
              onChange={setField('entryPrice')}
            />
            {errors.entryPrice && <div className="field__error">{errors.entryPrice}</div>}
          </div>

          <div className="field">
            <label className="label" htmlFor="invalidationPrice">
              Invalidation / stop <span className="label__opt">optional</span>
            </label>
            <input
              id="invalidationPrice"
              name="invalidationPrice"
              className={`input${errors.invalidationPrice ? ' has-error' : ''}`}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              value={form.invalidationPrice}
              onChange={setField('invalidationPrice')}
            />
            {errors.invalidationPrice && (
              <div className="field__error">{errors.invalidationPrice}</div>
            )}
            <div className="field__meta">
              <span>The price at which your thesis would be wrong. You set it — TradeGuard never guesses it.</span>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="riskAmount">
              Risk amount <span className="label__opt">optional</span>
            </label>
            <input
              id="riskAmount"
              name="riskAmount"
              className={`input${errors.riskAmount ? ' has-error' : ''}`}
              placeholder="500"
              inputMode="decimal"
              autoComplete="off"
              value={form.riskAmount}
              onChange={setField('riskAmount')}
            />
            {errors.riskAmount && <div className="field__error">{errors.riskAmount}</div>}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="confidence">
            Confidence <span className="label__opt">optional</span>
          </label>
          <div className="confidence">
            <input
              id="confidence"
              name="confidence"
              type="range"
              min="1"
              max="10"
              step="1"
              className="confidence__slider"
              style={{ '--fill': `${confidenceFill}%` }}
              value={form.confidence}
              onChange={(event) => onChange('confidence', Number(event.target.value))}
            />
            <span className="confidence__value">
              {form.confidence}/10 · {CONFIDENCE_LABELS[form.confidence]}
            </span>
          </div>
        </div>

        <div className="divider" />

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Capturing thesis…
            </>
          ) : (
            'Stress-test my trade'
          )}
        </button>
      </div>
    </form>
  );
}
