/**
 * Trade Structure section (Phase 7).
 *
 * Renders ONLY what the deterministic trade-structure service returned. There is
 * no arithmetic, no derivation and no estimation in this file: the setup values,
 * the risk figures and the conditions are all assembled server-side, so the panel
 * can never disagree with the service and never invents a value the trader did
 * not supply.
 *
 * Two honest states, straight from the service:
 *   STRUCTURE COMPLETE    — every parameter present and a defined risk exists
 *   STRUCTURE INCOMPLETE  — something the structure needs is missing or unusable
 *
 * There is deliberately no verdict: no BUY / SELL / PASS, no trade-quality score,
 * no probability, no "worth taking". The panel answers "what exactly is the trade
 * being considered, what defines its risk, and what would invalidate the thesis?"
 * and leaves the decision to the trader.
 *
 * The four sections follow the approved workspace language, reusing the existing
 * section, grid and evidence primitives rather than introducing a new visual
 * system.
 */

import { fmt } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS } from '../../lib/constants.js';
import { DataRow, EvidenceSection, UnavailableNotice } from './primitives.jsx';

/** Plain-language headline for each structure status. */
const STATUS_TITLE = {
  complete: 'The trade is fully structured',
  incomplete: 'The trade is not fully structured yet',
};

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };

/** Direction -> display tone. Conventional trading semantics: bullish green, bearish red. */
const DIRECTION_TONE = { bullish: 'bullish', bearish: 'bearish' };

/** How the direction maps onto a market side, stated rather than implied. */
const SIDE_LABELS = {
  long: 'Long (bullish)',
  short: 'Short (bearish)',
  none: 'None — no directional side',
};

/** Side -> display tone, matching the direction it belongs to. */
const SIDE_TONE = { long: 'bullish', short: 'bearish' };

export default function TradeStructurePanel({ structure }) {
  if (!structure) return null;

  // The service could not produce a structure at all (backend unreachable).
  if (structure.available === false) {
    return (
      <div className="struct">
        <div className="struct__status">
          <span className="struct__badge struct__badge--unavailable">
            {structure.statusLabel || 'TRADE STRUCTURE UNAVAILABLE'}
          </span>
        </div>
        <UnavailableNotice reason={structure.statusDetail || structure.reason} />
        <p className="struct__honesty">
          No structure is shown, because it could not be assembled. TradeGuard does not guess your entry,
          your invalidation or your position size to fill the gap.
        </p>
      </div>
    );
  }

  const setup = structure.setup || {};
  const riskStructure = structure.riskStructure || {};
  const thesis = structure.thesis || {};
  const conditions = structure.conditions || {};
  const limitations = Array.isArray(structure.limitations) ? structure.limitations : [];
  const caveats = Array.isArray(structure.caveats) ? structure.caveats : [];
  const missing = Array.isArray(structure.missingInformation) ? structure.missingInformation : [];
  const blockers = missing.filter((m) => m.blocking);

  const missingSet = new Set(Array.isArray(setup.missing) ? setup.missing : []);
  const notSupplied = <span className="struct__absent">Not supplied</span>;

  const setupRows = [
    { key: 'asset', label: 'Asset', value: setup.asset || notSupplied },
    {
      key: 'direction',
      label: 'Direction',
      value: DIRECTION_LABELS[setup.direction] || notSupplied,
      tone: DIRECTION_TONE[setup.direction],
    },
    {
      key: 'timeframe',
      label: 'Timeframe',
      value: setup.timeframe ? TIMEFRAME_LABELS[setup.timeframe] || setup.timeframe : notSupplied,
    },
    {
      key: 'entryPrice',
      label: 'Entry price',
      value: setup.entryPrice != null ? fmt(setup.entryPrice) : notSupplied,
    },
    {
      key: 'invalidationPrice',
      label: 'Invalidation / stop',
      value: setup.invalidationPrice != null ? fmt(setup.invalidationPrice) : notSupplied,
    },
    {
      key: 'confidence',
      label: 'Confidence',
      value: setup.confidence != null ? `${setup.confidence} / 10` : notSupplied,
    },
    {
      key: 'existingPosition',
      label: 'Existing position',
      value: setup.existingPosition
        ? EXISTING_POSITION_LABELS[setup.existingPosition] || setup.existingPosition
        : notSupplied,
    },
  ];

  return (
    <div className="struct">
      <div className="struct__status">
        <span className={`struct__badge struct__badge--${structure.status}`}>{structure.statusLabel}</span>
        <span className="struct__status-note">{STATUS_TITLE[structure.status] || ''}</span>
      </div>

      {structure.statusDetail && <p className="struct__detail">{structure.statusDetail}</p>}

      {caveats.length > 0 && (
        <ul className="struct__caveats">
          {caveats.map((c, i) => (
            <li key={i} className="struct__caveat">
              {c}
            </li>
          ))}
        </ul>
      )}

      {structure.status !== 'complete' && (
        <div className="struct__notice">
          TradeGuard does not fill in a missing value. The gaps below are named so you can supply them and
          run the investigation again.
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 1. Trade setup                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="struct__section struct__section--setup">
        <div className="struct__section-title">
          <span className="struct__section-index">1</span>
          Trade setup
        </div>
        <div className="data-grid">
          {setupRows.map((row) => (
            <DataRow key={row.key} label={row.label} value={row.value} tone={row.tone} />
          ))}
        </div>
        <div className="struct__meta-row">
          <span className="struct__meta-label">Side</span>
          <span className={`struct__meta-value${SIDE_TONE[setup.side] ? ` is-${SIDE_TONE[setup.side]}` : ''}`}>
            {SIDE_LABELS[setup.side] || SIDE_LABELS.none}
          </span>
        </div>
        <p className="struct__footnote">
          These are the values you supplied. TradeGuard did not derive the entry or the invalidation from
          the market price, from historical data, from an indicator, or from a reading of your thesis.
          {missingSet.size > 0 && ' The parameters marked as not supplied are the reason this structure is incomplete.'}
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Risk structure                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="struct__section struct__section--risk">
        <div className="struct__section-title">
          <span className="struct__section-index">2</span>
          Risk structure
        </div>

        {riskStructure.complete ? (
          <>
            <div className="data-grid">
              <DataRow label="Risk budget" value={fmt(riskStructure.riskBudget)} />
              <DataRow label="Price risk per unit" value={fmt(riskStructure.priceRiskPerUnit)} />
              <DataRow
                label="Calculated position size"
                value={`${fmt(riskStructure.positionSize)} units`}
              />
              <DataRow label="Defined risk" value={fmt(riskStructure.definedRisk)} />
            </div>
            <p className="struct__footnote">
              Reused unchanged from the Risk Assessment stage — the risk engine calculated these figures and
              the structure does not recalculate them. Full methodology, validation warnings and the engine's
              own limitations are in the Risk Assessment section.
            </p>
          </>
        ) : (
          <>
            <p className="struct__empty">
              No risk figures — {riskStructure.reason || 'the risk assessment did not produce a defined risk.'}
            </p>
            <p className="struct__footnote">
              Nothing has been assumed in place of the missing numbers. The Risk Assessment section explains
              exactly which input is missing or inconsistent.
            </p>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Thesis                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="struct__section struct__section--thesis">
        <div className="struct__section-title">
          <span className="struct__section-index">3</span>
          Thesis
        </div>

        {thesis.present ? (
          <blockquote className="struct__thesis">{thesis.text}</blockquote>
        ) : (
          <p className="struct__empty">No thesis text was supplied.</p>
        )}

        {thesis.interpretation && (
          <div className="struct__interpretation">
            <div className="struct__sub-label">How TradeGuard read your thesis</div>
            <p className="struct__interpretation-text">{thesis.interpretation}</p>
            {thesis.interpretationNote && (
              <p className="struct__interpretation-note">{thesis.interpretationNote}</p>
            )}
          </div>
        )}

        {thesis.available ? (
          <>
            {thesis.evidenceStrength && (
              <div className="struct__strength">
                <span className="struct__strength-label">Evidence strength</span>
                <span className={`da__badge da__badge--${thesis.evidenceStrength.label.replace(/\s+/g, '-')}`}>
                  {thesis.evidenceStrength.label}
                </span>
              </div>
            )}

            <div className="struct__grid">
              <EvidenceSection
                title="Supporting context"
                tone="support"
                items={thesis.supporting}
                empty="No supporting market or event signal was found in the data retrieved."
                dataLimited={thesis.dataLimited}
                emptyDataLimited="Not assessable — no usable market or event data was available to classify supporting evidence."
              />
              <EvidenceSection
                title="Contradicting context"
                tone="contradict"
                items={thesis.contradicting}
                empty="No contradicting market or event signal was found in the data retrieved."
                dataLimited={thesis.dataLimited}
                emptyDataLimited="Not assessable — no usable market or event data was available to classify contradicting evidence."
              />
            </div>

            {(thesis.supportingShown < thesis.supportingTotal ||
              thesis.contradictingShown < thesis.contradictingTotal) && (
              <p className="struct__footnote">
                Showing a concise subset — {thesis.supportingShown} of {thesis.supportingTotal} supporting and{' '}
                {thesis.contradictingShown} of {thesis.contradictingTotal} contradicting items. The full list is
                in the Devil&apos;s Advocate section.
              </p>
            )}
          </>
        ) : (
          <div className="struct__notice struct__notice--muted">
            {thesis.reason || 'The Devil\'s Advocate findings are unavailable for this trade.'} No supporting
            or contradicting context is shown, and none has been invented to fill the section.
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Invalidation & conditions                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="struct__section struct__section--conditions">
        <div className="struct__section-title">
          <span className="struct__section-index">4</span>
          Invalidation &amp; conditions
        </div>

        <div className="struct__invalidation">
          <span className="struct__meta-label">Your invalidation / stop</span>
          <span className="struct__invalidation-value">
            {conditions.traderInvalidation != null ? fmt(conditions.traderInvalidation) : 'Not supplied'}
          </span>
          {conditions.traderInvalidationNote && (
            <p className="struct__footnote">{conditions.traderInvalidationNote}</p>
          )}
        </div>

        {conditions.available ? (
          <>
            <div className="struct__grid">
              <EvidenceSection
                title="Conditions that would weaken the thesis"
                tone="invalidation"
                items={conditions.invalidationConditions}
                empty="No specific conditions could be derived from the available data. Define them from your own levels."
                ordered
              />
              <EvidenceSection
                title="Key risk considerations"
                tone="risk"
                items={conditions.keyRisks}
                empty="No key risks were identified from the available data."
              />
            </div>

            {conditions.invalidationConditionsNote && (
              <p className="struct__footnote">{conditions.invalidationConditionsNote}</p>
            )}

            {conditions.keyRisksShown < conditions.keyRisksTotal && (
              <p className="struct__footnote">
                Showing {conditions.keyRisksShown} of {conditions.keyRisksTotal} risks. The full list is in the
                Devil&apos;s Advocate section.
              </p>
            )}

            {conditions.assumptions.length > 0 && (
              <div className="struct__assumptions">
                <div className="struct__sub-label">Assumptions this thesis relies on</div>
                <ul className="struct__assumption-list">
                  {conditions.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="struct__notice struct__notice--muted">
            No thesis conditions, key risks or assumptions are shown, because the Devil&apos;s Advocate
            findings are unavailable. TradeGuard will not invent them.
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Missing information                                               */}
      {/* ---------------------------------------------------------------- */}
      <EvidenceSection
        title="Missing information"
        tone="missing"
        items={missing}
        empty="None — every parameter the structure needs was supplied."
        dataLimited={blockers.length > 0}
        emptyDataLimited="Not assessable — a required parameter is missing, so the rest cannot be confirmed."
      />

      {conditions.missingInformation.length > 0 && (
        <EvidenceSection
          title="Gaps in the underlying research"
          tone="missing"
          items={conditions.missingInformation}
          empty="None — the earlier stages retrieved everything they needed."
        />
      )}

      {structure.method && (
        <section className="struct__section">
          <div className="struct__section-title">How this structure was assembled</div>
          <p className="struct__method">{structure.method}</p>
        </section>
      )}

      {limitations.length > 0 && (
        <section className="struct__section struct__section--limits">
          <div className="struct__section-title">Important limitations</div>
          <ul className="struct__limits">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {structure.disclaimer && <div className="stage__meta struct__disclaimer">{structure.disclaimer}</div>}
    </div>
  );
}
