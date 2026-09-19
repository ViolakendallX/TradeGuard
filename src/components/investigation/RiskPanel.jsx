/**
 * Risk Assessment section (Phase 6).
 *
 * Renders ONLY what the deterministic risk engine returned. There is no
 * arithmetic in this file beyond echoing the numbers back: the price risk, the
 * position size and the defined risk are all calculated server-side, so the UI
 * can never disagree with the engine, and the UI never estimates anything the
 * engine did not produce.
 *
 * Three honest states, straight from the engine:
 *   RISK READY                    — inputs present, construction coherent
 *   INCOMPLETE                    — an input the calculation needs is missing
 *   INVALID TRADE CONSTRUCTION    — the inputs contradict each other
 *
 * There is deliberately no verdict: no BUY / SELL / PASS, no "good trade", no
 * "safe", no score. The panel states what the numbers are and what is missing,
 * and leaves the decision to the trader.
 */

import { fmt } from '../../lib/investigationView.js';
import { DataRow, EvidenceSection, UnavailableNotice } from './primitives.jsx';

/** Plain-language headline for each engine status. */
const STATUS_TITLE = {
  ready: 'The defined risk could be calculated',
  incomplete: 'The risk cannot be calculated yet',
  invalid: 'This trade construction is inconsistent',
};

/** Copy for the calculated-risk block when there is nothing to show. */
const NOT_CALCULATED = {
  incomplete: 'Not calculated — a required input is missing. Nothing has been assumed in its place.',
  invalid: 'Not calculated — the entry and the invalidation are inconsistent, so there is no defined risk to report.',
};

export default function RiskPanel({ risk }) {
  if (!risk) return null;

  // Engine could not run at all (backend unreachable, or a hard failure).
  if (risk.available === false) {
    return (
      <div className="rk">
        <div className="rk__status">
          <span className="rk__badge rk__badge--unavailable">
            {risk.statusLabel || 'RISK ASSESSMENT UNAVAILABLE'}
          </span>
        </div>
        <UnavailableNotice reason={risk.statusDetail || risk.reason} />
        <p className="rk__honesty">
          No defined risk is shown, because the calculation could not be run. TradeGuard does not
          estimate a position size, substitute a market price for your entry, or invent an invalidation
          level to fill the gap.
        </p>
      </div>
    );
  }

  const inputs = risk.inputs || {};
  const calc = risk.calculation;
  const warnings = Array.isArray(risk.warnings) ? risk.warnings : [];
  const missing = Array.isArray(risk.missingInformation) ? risk.missingInformation : [];
  const limitations = Array.isArray(risk.limitations) ? risk.limitations : [];
  const methodology = risk.methodology || {};
  const formula = risk.formula || {};

  // Which way round the subtraction runs depends on the side. A short risks the
  // distance UP to the invalidation, a long the distance DOWN to it.
  const priceRiskLeft = risk.side === 'short' ? inputs.invalidationPrice : inputs.entryPrice;
  const priceRiskRight = risk.side === 'short' ? inputs.entryPrice : inputs.invalidationPrice;

  return (
    <div className="rk">
      <div className="rk__status">
        <span className={`rk__badge rk__badge--${risk.status}`}>{risk.statusLabel}</span>
        <span className="rk__status-note">{STATUS_TITLE[risk.status] || ''}</span>
      </div>

      {risk.statusDetail && <p className="rk__detail">{risk.statusDetail}</p>}

      {/* The engine states plainly that it will not work around bad inputs. */}
      {risk.status !== 'ready' && (
        <div className="rk__notice">
          TradeGuard does not calculate around a missing or contradictory input. The assessment below
          reports exactly what is wrong so you can fix it and run the trade again.
        </div>
      )}

      <div className="rk__grid">
        <section className="rk__section">
          <div className="rk__section-title">Risk inputs</div>
          <div className="data-grid">
            <DataRow label="Entry price" value={inputs.entryPrice != null ? fmt(inputs.entryPrice) : 'Not supplied'} />
            <DataRow
              label="Invalidation / stop"
              value={inputs.invalidationPrice != null ? fmt(inputs.invalidationPrice) : 'Not supplied'}
            />
            <DataRow label="Risk amount" value={inputs.riskAmount != null ? fmt(inputs.riskAmount) : 'Not supplied'} />
            <DataRow label="Direction" value={risk.direction || 'Not supplied'} />
            <DataRow
              label="Side"
              value={
                risk.side === 'long' ? 'Long (bullish)' : risk.side === 'short' ? 'Short (bearish)' : 'None — no directional side'
              }
            />
          </div>
          <p className="rk__footnote">
            These are the levels you supplied. TradeGuard did not read the current market price and did
            not verify them against one.
          </p>
        </section>

        <section className="rk__section rk__section--calc">
          <div className="rk__section-title">Calculated risk</div>

          {calc ? (
            <>
              <div className="data-grid">
                <DataRow label="Price risk per unit" value={fmt(calc.priceRiskPerUnit)} />
                <DataRow label="Calculated position size" value={`${fmt(calc.positionSize)} units`} />
                <DataRow label="Defined risk" value={fmt(calc.definedRisk)} />
                <DataRow label="Risk budget supplied" value={fmt(calc.riskBudget)} />
                <DataRow
                  label="Price risk as % of entry"
                  value={calc.priceRiskPctOfEntry != null ? `${fmt(calc.priceRiskPctOfEntry)}%` : '—'}
                />
                <DataRow label="Notional at entry" value={calc.notionalValue != null ? fmt(calc.notionalValue) : '—'} />
                <DataRow label="Formula used" value={formula.priceRiskExpression || '—'} />
              </div>

              <div className="rk__working">
                <div className="rk__working-title">The arithmetic, step by step</div>
                <ul className="rk__steps">
                  <li>
                    <span className="rk__step-label">Price risk per unit</span>
                    <span className="rk__step-calc">
                      {fmt(priceRiskLeft)} − {fmt(priceRiskRight)} = {fmt(calc.priceRiskPerUnit)}
                    </span>
                  </li>
                  <li>
                    <span className="rk__step-label">Position size</span>
                    <span className="rk__step-calc">
                      {fmt(inputs.riskAmount)} ÷ {fmt(calc.priceRiskPerUnit)} = {fmt(calc.positionSize)} units
                    </span>
                  </li>
                  <li>
                    <span className="rk__step-label">Defined risk</span>
                    <span className="rk__step-calc">
                      {fmt(calc.positionSize)} × {fmt(calc.priceRiskPerUnit)} = {fmt(calc.definedRisk)}
                    </span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <p className="rk__empty">{NOT_CALCULATED[risk.status] || NOT_CALCULATED.incomplete}</p>
          )}
        </section>
      </div>

      {risk.interpretation && (
        <section className="rk__section rk__section--read">
          <div className="rk__section-title">What the numbers mean</div>
          <p className="rk__interpretation">{risk.interpretation}</p>
          <p className="rk__caveat">
            That is a description of the risk you defined — not an opinion on whether the trade is worth
            taking.
          </p>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="rk__section rk__section--warnings">
          <div className="rk__section-title">
            Validation warnings
            <span className="rk__count">{warnings.length}</span>
          </div>
          <ul className="rk__warnings">
            {warnings.map((w) => (
              <li key={w.id} className="rk__warning">
                <div className="rk__warning-title">{w.title}</div>
                <p className="rk__warning-detail">{w.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rk__section">
        <div className="rk__section-title">Calculation methodology</div>
        <p className="rk__method">{methodology.note}</p>
        <ul className="rk__criteria">
          <li>
            <span className="rk__criterion-label">Price risk per unit</span>
            <span className="rk__criterion-value">{methodology.priceRiskPerUnit}</span>
          </li>
          <li>
            <span className="rk__criterion-label">Position size</span>
            <span className="rk__criterion-value">{methodology.positionSize}</span>
          </li>
          <li>
            <span className="rk__criterion-label">Defined risk</span>
            <span className="rk__criterion-value">{methodology.definedRisk}</span>
          </li>
        </ul>
        <p className="rk__meta">{methodology.rounding}</p>
      </section>

      <EvidenceSection
        title="Missing information"
        tone="missing"
        items={missing}
        empty="None — every input the calculation needs was supplied."
        dataLimited={risk.status === 'incomplete'}
        emptyDataLimited="Not assessable — a required input is missing, so TradeGuard cannot report on the rest."
      />

      {limitations.length > 0 && (
        <section className="rk__section rk__section--limits">
          <div className="rk__section-title">Important limitations</div>
          <ul className="rk__limits">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {risk.disclaimer && <div className="stage__meta rk__disclaimer">{risk.disclaimer}</div>}
    </div>
  );
}
