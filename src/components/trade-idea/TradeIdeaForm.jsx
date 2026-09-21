import {
  DIRECTIONS,
  TIMEFRAMES,
  EXISTING_POSITIONS,
  CONFIDENCE_LABELS,
  THESIS_MIN_LENGTH,
  THESIS_MAX_LENGTH,
} from '../../lib/constants.js';
import Icon from '../Icon.jsx';

/**
 * Selected-option colours for the direction selector. These read from the
 * direction tokens, not from --up/--down (which are the market-magnitude and
 * form-error tokens): bullish green, bearish red.
 */
const TONE_VARS = {
  up: { '--dir-color': 'var(--dir-bullish)', '--dir-soft': 'var(--dir-bullish-soft)' },
  down: { '--dir-color': 'var(--dir-bearish)', '--dir-soft': 'var(--dir-bearish-soft)' },
  neutral: { '--dir-color': 'var(--neutral)', '--dir-soft': 'var(--neutral-soft)' },
};

/**
 * One named block of the form.
 *
 * The brief is explicit that the trade idea must not read as one long undifferentiated
 * list of inputs: TRADE DETAILS, THESIS and RISK PARAMETERS are three different
 * questions, so they are three visibly different blocks, each carrying its own
 * icon and accent from the section system.
 */
function IdeaSection({ step, title, note, accent, icon, children }) {
  return (
    <section className="idea-section" data-accent={accent}>
      <div className="idea-section__head">
        <span className="idea-section__icon" aria-hidden="true">
          <Icon name={icon} size={15} />
        </span>
        <div className="idea-section__titles">
          <div className="idea-section__title">
            <span className="idea-section__step">{step}</span>
            {title}
          </div>
          {note && <div className="idea-section__note">{note}</div>}
        </div>
      </div>
      <div className="idea-section__body">{children}</div>
    </section>
  );
}

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
        {/* -------------------------------------------------------------- */}
        {/* 01 — TRADE DETAILS                                              */}
        {/* -------------------------------------------------------------- */}
        <IdeaSection
          step="01"
          title="Trade details"
          note="What you want to trade, and which way."
          accent="market"
          icon="market"
        >
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
        </IdeaSection>

        {/* -------------------------------------------------------------- */}
        {/* 02 — THESIS                                                     */}
        {/* -------------------------------------------------------------- */}
        <IdeaSection
          step="02"
          title="Thesis"
          note="The reason this trade works. This is what TradeGuard will attack."
          accent="thesis"
          icon="thesis"
        >
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
        </IdeaSection>

        {/* -------------------------------------------------------------- */}
        {/* 03 — RISK PARAMETERS                                            */}
        {/* -------------------------------------------------------------- */}
        <IdeaSection
          step="03"
          title="Risk parameters"
          note="You set these. TradeGuard never guesses a price, a stop or a size."
          accent="risk"
          icon="risk"
        >
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
                <span>
                  The price at which your thesis would be wrong. You set it — TradeGuard never
                  guesses it.
                </span>
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
        </IdeaSection>

        {/* The one action on this screen. It is a hero control: the whole form
            exists to reach it, so it is the loudest thing on the page. */}
        <div className="idea-submit">
          <button
            type="submit"
            className="btn btn--hero"
            disabled={submitting}
            data-idea-submit
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Capturing thesis…
              </>
            ) : (
              <>
                <Icon name="attack" size={17} />
                Stress-test my trade
              </>
            )}
          </button>
          <p className="idea-submit__note">
            TradeGuard records your thesis first, then challenges it. It never tells you what to do.
          </p>
        </div>
      </div>
    </form>
  );
}
