import {
  DIRECTIONS,
  TIMEFRAME_LABELS,
  EXISTING_POSITION_LABELS,
  CONFIDENCE_LABELS,
} from '../lib/constants.js';
import {
  INVESTIGATION_STAGES,
  stageStatus,
  completedStageCount,
  INVESTIGATION_STAGE_COUNT,
} from '../lib/investigation.js';

const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };

function money(value) {
  if (typeof value !== 'number') return null;
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not specified';
  if (typeof value === 'number') return money(value) ?? String(value);
  return String(value);
}

function EmptyInvestigation({ onEdit }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            Nothing to investigate yet
          </div>
          Submit a trade idea from the Trade Idea screen and TradeGuard will begin examining it here.
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" style={{ width: 'auto' }} onClick={onEdit}>
              Submit a trade idea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvestigationScreen({ submission, onEdit }) {
  if (!submission || !submission.idea) {
    return <EmptyInvestigation onEdit={onEdit} />;
  }

  const idea = submission.idea;
  const direction = DIRECTIONS.find((d) => d.value === idea.direction);
  const completed = completedStageCount();

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 2 — Investigation</div>
        <h1 className="page-head__title">Investigating your trade</h1>
        <p className="page-head__lede">
          TradeGuard is now preparing to examine this trade before you risk capital. Live market
          and event research is not available until Phase 3 — below is exactly what TradeGuard has
          already captured and what it will investigate next.
        </p>
      </div>

      <div className="invest-layout">
        <section className="card">
          <div className="card__header">
            <div>
              <div className="card__title">What TradeGuard is investigating</div>
              <div className="card__hint">The thesis you submitted from the Trade Idea screen.</div>
            </div>
            <span className={`status-dot${submission.offline ? ' is-offline' : ''}`} />
          </div>
          <div className="card__body">
            <div className="preview__asset">
              <span className="preview__ticker">{idea.asset}</span>
              {direction && (
                <span className={`chip ${TONE_CLASS[direction.value] ?? 'chip--neutral'}`}>
                  {direction.label}
                </span>
              )}
            </div>

            <p className="preview__thesis">{idea.thesis}</p>

            <div className="divider" />

            <dl className="kv">
              <dt>Timeframe</dt>
              <dd className={idea.timeframe ? '' : 'is-empty'}>
                {idea.timeframe ? TIMEFRAME_LABELS[idea.timeframe] ?? idea.timeframe : 'Not specified'}
              </dd>

              <dt>Entry price</dt>
              <dd className={idea.entryPrice === null || idea.entryPrice === '' ? 'is-empty' : ''}>
                {formatValue(idea.entryPrice)}
              </dd>

              <dt>Risk amount</dt>
              <dd className={idea.riskAmount === null || idea.riskAmount === '' ? 'is-empty' : ''}>
                {formatValue(idea.riskAmount)}
              </dd>

              <dt>Confidence</dt>
              <dd>
                {idea.confidence != null
                  ? `${idea.confidence}/10 · ${CONFIDENCE_LABELS[idea.confidence]}`
                  : 'Not specified'}
              </dd>

              <dt>Existing position</dt>
              <dd className={idea.existingPosition ? '' : 'is-empty'}>
                {idea.existingPosition
                  ? EXISTING_POSITION_LABELS[idea.existingPosition] ?? idea.existingPosition
                  : 'Not specified'}
              </dd>
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Investigation progress</div>
              <div className="card__hint">
                {completed} of {INVESTIGATION_STAGE_COUNT} stages ready — the rest arrive in later
                phases.
              </div>
            </div>
          </div>
          <div className="card__body">
            <ul className="invest-stages">
              {INVESTIGATION_STAGES.map((stage) => {
                const isComplete = stageStatus(stage) === 'complete';
                return (
                  <li
                    key={stage.id}
                    className={`stage${isComplete ? ' stage--complete' : ' stage--locked'}`}
                  >
                    <span className="stage__icon" aria-hidden="true">
                      {isComplete ? '✓' : '○'}
                    </span>
                    <div className="stage__body">
                      <div className="stage__top">
                        <span className="stage__label">{stage.label}</span>
                        {isComplete ? (
                          <span className="stage__status stage__status--done">Captured</span>
                        ) : (
                          <span className="stage__status stage__status--soon">
                            Coming in Phase {stage.phase}
                          </span>
                        )}
                      </div>
                      <p className="stage__desc">{stage.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      <div className="invest-actions">
        <button type="button" className="btn btn--primary" onClick={onEdit}>
          Edit thesis
        </button>
        {submission.offline && (
          <p className="invest-actions__note">
            Captured locally — the TradeGuard backend was not reachable, so nothing was validated or
            analysed server-side.
          </p>
        )}
      </div>
    </>
  );
}
