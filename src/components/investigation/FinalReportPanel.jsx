/**
 * Final Trade Report section (Phase 8).
 *
 * Renders ONLY what the deterministic final-report service returned. There is no
 * arithmetic, no derivation and no estimation in this file: every figure is the
 * one an earlier stage produced, restated.
 *
 * INFORMATION ARCHITECTURE: this is a navigable report workspace, not one giant
 * document. The ten report sections are shown ONE AT A TIME behind a horizontal
 * navigator (SUMMARY | THESIS | MARKET | EVENTS | ATTACK | HISTORY | RISK |
 * STRUCTURE | GAPS | BOUNDARY), and SUMMARY is the default landing section. Every
 * section, state, disclaimer and footnote is preserved — only the presentation
 * changed, so the trader no longer has to scroll the whole report to reach one
 * part of it.
 *
 * Three honest states, straight from the service:
 *   REPORT READY       — the investigation was consolidated in full
 *   REPORT INCOMPLETE  — the report exists but part of the investigation is missing
 *   REPORT UNAVAILABLE — the report could not be assembled at all
 *
 * And, per section, the three availability markers the trader needs in order to
 * know what they are actually looking at: AVAILABLE / PARTIAL / UNAVAILABLE.
 *
 * There is deliberately no verdict here: no BUY / SELL / PASS, no score, no
 * probability, no "worth taking". The report consolidates the investigation and
 * explicitly hands the decision back to the trader.
 */

import { useEffect, useState } from 'react';
import { fmt, pct, bucketLabel } from '../../lib/investigationView.js';
import { TIMEFRAME_LABELS, EXISTING_POSITION_LABELS } from '../../lib/constants.js';
import { DataRow, UnavailableNotice } from './primitives.jsx';
import WorkspaceNav from './WorkspaceNav.jsx';

/** Plain-language headline for each report status. */
const STATUS_TITLE = {
  ready: 'The investigation is consolidated in full',
  incomplete: 'The report is here, but part of the investigation is missing',
};

const DIRECTION_LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
const SIDE_LABELS = { long: 'Long (bullish)', short: 'Short (bearish)', none: 'None — no directional side' };

/** Direction -> display tone. Conventional trading semantics: bullish green, bearish red. */
const DIRECTION_TONE = { bullish: 'bullish', bearish: 'bearish' };
const SIDE_TONE = { long: 'bullish', short: 'bearish' };

/** Availability marker -> badge modifier. */
const STATE_MODIFIER = { available: 'available', partial: 'partial', unavailable: 'unavailable' };
const STATE_LABELS = { available: 'AVAILABLE', partial: 'PARTIAL', unavailable: 'UNAVAILABLE' };

/** Report-section state -> workspace-nav dot modifier (nav reuses the inv-nav classes). */
const NAV_MODIFIER = { available: 'complete', partial: 'partial', unavailable: 'unavailable' };

/** The ten report sections, in order. `state` is resolved per report below. */
const REPORT_TABS = [
  { id: 'summary', label: 'Summary', index: 1, title: 'Executive summary' },
  { id: 'thesis', label: 'Thesis', index: 2, title: 'Trade thesis' },
  { id: 'market', label: 'Market', index: 3, title: 'Market context' },
  { id: 'events', label: 'Events', index: 4, title: 'Events & catalysts' },
  { id: 'attack', label: 'Attack', index: 5, title: "Devil's Advocate" },
  { id: 'history', label: 'History', index: 6, title: 'Historical stress test' },
  { id: 'risk', label: 'Risk', index: 7, title: 'Risk assessment' },
  { id: 'structure', label: 'Structure', index: 8, title: 'Trade structure' },
  { id: 'gaps', label: 'Gaps', index: 9, title: 'Information gaps & limitations' },
  { id: 'boundary', label: 'Boundary', index: 10, title: 'Final decision boundary' },
];

/** A small AVAILABLE / PARTIAL / UNAVAILABLE chip. */
function StateBadge({ state }) {
  if (!state) return null;
  return (
    <span className={`report__state report__state--${STATE_MODIFIER[state] || 'unavailable'}`}>
      {STATE_LABELS[state] || String(state).toUpperCase()}
    </span>
  );
}

/** A numbered report section with its own availability badge. */
function ReportSection({ index, title, state, children }) {
  return (
    <section className="report__section" data-report-section={title}>
      <div className="report__section-title">
        {index != null && <span className="report__section-index">{index}</span>}
        <span className="report__section-label">{title}</span>
        <StateBadge state={state} />
      </div>
      {children}
    </section>
  );
}

/** The consistent honest shape for a section that has no data. */
function SectionUnavailable({ reason, what }) {
  return (
    <>
      <UnavailableNotice reason={reason} />
      <p className="report__footnote">
        {what} No figures, events, observations or commentary have been invented to fill this section.
      </p>
    </>
  );
}

export default function FinalReportPanel({ report }) {
  const [activeId, setActiveId] = useState('summary');

  // A different report (a different trade) starts back on the summary.
  useEffect(() => {
    setActiveId('summary');
  }, [report]);

  if (!report) return null;

  // The service could not produce a report at all (backend unreachable).
  if (report.available === false) {
    return (
      <div className="report">
        <div className="report__status">
          <span className="report__badge report__badge--unavailable">
            {report.statusLabel || 'REPORT UNAVAILABLE'}
          </span>
        </div>
        <UnavailableNotice reason={report.statusDetail || report.reason} />
        <p className="report__honesty">
          No report is shown, because it could not be assembled. TradeGuard does not summarise an
          investigation it was unable to run.
        </p>
      </div>
    );
  }

  const exec = report.executiveSummary || {};
  const thesis = report.thesis || {};
  const market = report.market || {};
  const events = report.events || {};
  const da = report.devilsAdvocate || {};
  const historical = report.historical || {};
  const risk = report.risk || {};
  const structure = report.structure || {};
  const summary = report.evidenceSummary || { sections: [], available: 0, partial: 0, unavailable: 0, total: 0 };
  const gaps = Array.isArray(report.gaps) ? report.gaps : [];
  const caveats = Array.isArray(report.caveats) ? report.caveats : [];
  const limitations = Array.isArray(report.limitations) ? report.limitations : [];

  const missingSet = new Set(Array.isArray(exec.missing) ? exec.missing : []);
  const notSupplied = <span className="report__absent">Not supplied</span>;

  const summaryRows = [
    { key: 'asset', label: 'Asset', value: exec.asset || notSupplied },
    {
      key: 'direction',
      label: 'Direction',
      value: DIRECTION_LABELS[exec.direction] || notSupplied,
      tone: DIRECTION_TONE[exec.direction],
    },
    {
      key: 'timeframe',
      label: 'Timeframe',
      value: exec.timeframe ? TIMEFRAME_LABELS[exec.timeframe] || exec.timeframe : notSupplied,
      missing: false,
    },
    { key: 'entryPrice', label: 'Entry', value: exec.entryPrice != null ? fmt(exec.entryPrice) : notSupplied },
    {
      key: 'invalidationPrice',
      label: 'Invalidation / stop',
      value: exec.invalidationPrice != null ? fmt(exec.invalidationPrice) : notSupplied,
    },
    {
      key: 'riskAmount',
      label: 'Risk budget',
      value: exec.riskAmount != null ? fmt(exec.riskAmount) : notSupplied,
    },
    {
      key: 'confidence',
      label: 'Confidence',
      value: exec.confidence != null ? `${exec.confidence} / 10` : notSupplied,
    },
    {
      key: 'existingPosition',
      label: 'Existing position',
      value: exec.existingPosition
        ? EXISTING_POSITION_LABELS[exec.existingPosition] || exec.existingPosition
        : notSupplied,
    },
  ];

  // Per-section availability, used for both the nav dots and the section badge.
  const stateOf = {
    thesis: thesis.state,
    market: market.state,
    events: events.state,
    attack: da.state,
    history: historical.state,
    risk: risk.state,
    structure: structure.state,
  };

  const navItems = REPORT_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    index: tab.index,
    mod: NAV_MODIFIER[stateOf[tab.id]],
  }));

  const active = REPORT_TABS.find((tab) => tab.id === activeId) || REPORT_TABS[0];

  /** The content of exactly one report section, selected by the navigator. */
  const renderBody = () => {
    switch (active.id) {
      /* ---------------------------------------------------------------- */
      /* 1. Executive summary + the availability roll-up (the landing tab)  */
      /* ---------------------------------------------------------------- */
      case 'summary':
        return (
          <>
            {/* The availability roll-up: what the trader actually has. */}
            <div className="report__roll-up">
              <div className="report__roll-up-counts">
                <span className="report__count report__count--available">
                  <strong>{summary.available}</strong> available
                </span>
                <span className="report__count report__count--partial">
                  <strong>{summary.partial}</strong> partial
                </span>
                <span className="report__count report__count--unavailable">
                  <strong>{summary.unavailable}</strong> unavailable
                </span>
                <span className="report__count report__count--total">of {summary.total} sections</span>
              </div>
              <ul className="report__roll-up-list">
                {(summary.sections || []).map((s) => (
                  <li key={s.id} className={`report__roll-up-item report__roll-up-item--${STATE_MODIFIER[s.state]}`}>
                    <span className="report__roll-up-label">{s.label}</span>
                    <StateBadge state={s.state} />
                  </li>
                ))}
              </ul>
            </div>

            {caveats.length > 0 && (
              <ul className="report__caveats">
                {caveats.map((c, i) => (
                  <li key={i} className="report__caveat">
                    {c}
                  </li>
                ))}
              </ul>
            )}

            {report.status !== 'ready' && (
              <div className="report__notice">
                TradeGuard does not present an incomplete investigation as a complete one. The gaps are named
                in the sections below and consolidated in the Gaps section.
              </div>
            )}

            <div className="data-grid">
              {summaryRows.map((row) => (
                <DataRow key={row.key} label={row.label} value={row.value} tone={row.tone} />
              ))}
            </div>
            <div className="report__meta-row">
              <span className="report__meta-label">Side</span>
              <span className={`report__meta-value${SIDE_TONE[exec.side] ? ` is-${SIDE_TONE[exec.side]}` : ''}`}>
                {SIDE_LABELS[exec.side] || SIDE_LABELS.none}
              </span>
              <span className="report__meta-label">Investigation status</span>
              <span className="report__meta-value">{report.statusLabel}</span>
            </div>
            <p className="report__footnote">
              These are the values you supplied, restated. TradeGuard did not derive the entry or the
              invalidation from the market price, from historical data, or from a reading of your thesis.
              {missingSet.size > 0 && ' The parameters marked as not supplied are why this report is incomplete.'}
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 2. Trade thesis                                                   */
      /* ---------------------------------------------------------------- */
      case 'thesis':
        return (
          <>
            <div className="report__sub-label">Your thesis</div>
            {thesis.traderThesisPresent ? (
              <blockquote className="report__thesis">{thesis.traderThesis}</blockquote>
            ) : (
              <p className="report__empty">No thesis text was supplied.</p>
            )}

            {/* Kept clearly distinct from the trader's own words. */}
            {thesis.interpretation ? (
              <div className="report__interpretation">
                <div className="report__sub-label">How TradeGuard read your thesis</div>
                <p className="report__interpretation-text">{thesis.interpretation}</p>
                {thesis.interpretationNote && (
                  <p className="report__interpretation-note">{thesis.interpretationNote}</p>
                )}
              </div>
            ) : (
              <p className="report__footnote">
                No interpretation of your thesis is shown, because the Devil&apos;s Advocate analysis it comes
                from is unavailable.
              </p>
            )}

            {thesis.evidenceStrength && (
              <div className="report__strength">
                <span className="report__sub-label">Evidence strength</span>
                <span className={`da__badge da__badge--${String(thesis.evidenceStrength.label).replace(/\s+/g, '-')}`}>
                  {thesis.evidenceStrength.label}
                </span>
                {thesis.evidenceStrength.basis && (
                  <span className="report__strength-basis">{thesis.evidenceStrength.basis}</span>
                )}
              </div>
            )}

            <div className="report__two-col">
              <div className="report__mini da__section--support">
                <div className="report__mini-title">
                  Supporting evidence
                  <span className="da__count">{thesis.supportingTotal || 0}</span>
                </div>
                {thesis.supporting && thesis.supporting.length > 0 ? (
                  <ul className="da__list">
                    {thesis.supporting.map((it, i) => (
                      <li key={it.id || `sup-${i}`} className="da__item">
                        <div className="da__item-title">{it.title}</div>
                        <p className="da__item-detail">{it.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="da__empty">
                    {thesis.state === 'available'
                      ? 'No supporting market or event signal was found in the data retrieved.'
                      : 'Not assessable — no usable evidence was available to classify supporting signals.'}
                  </p>
                )}
              </div>

              <div className="report__mini da__section--contradict">
                <div className="report__mini-title">
                  Contradicting evidence
                  <span className="da__count">{thesis.contradictingTotal || 0}</span>
                </div>
                {thesis.contradicting && thesis.contradicting.length > 0 ? (
                  <ul className="da__list">
                    {thesis.contradicting.map((it, i) => (
                      <li key={it.id || `con-${i}`} className="da__item">
                        <div className="da__item-title">{it.title}</div>
                        <p className="da__item-detail">{it.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="da__empty">
                    {thesis.state === 'available'
                      ? 'No contradicting market or event signal was found in the data retrieved.'
                      : 'Not assessable — no usable evidence was available to classify contradicting signals.'}
                  </p>
                )}
              </div>
            </div>

            {thesis.state !== 'available' && thesis.reason && (
              <p className="report__footnote">{thesis.reason}</p>
            )}

            {thesis.supportingShown < thesis.supportingTotal ||
            thesis.contradictingShown < thesis.contradictingTotal ? (
              <p className="report__footnote">
                Showing a concise subset. The full classified list is in the Devil&apos;s Advocate section.
              </p>
            ) : null}
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 3. Market context                                                 */
      /* ---------------------------------------------------------------- */
      case 'market':
        return market.state === 'unavailable' ? (
          <SectionUnavailable reason={market.reason} what="No market readings are shown." />
        ) : (
          <>
            <div className="data-grid">
              <DataRow label="Price" value={market.readings?.price != null ? fmt(market.readings.price) : '—'} />
              <DataRow
                label="24h change"
                value={<span className={tone2(market.readings?.change24hPct)}>{pct(market.readings?.change24hPct)}</span>}
              />
              <DataRow label="Realized volatility" value={pct(market.readings?.volatilityPct)} />
              <DataRow label="Trend" value={bucketLabel(market.readings?.trendDirection)} />
              <DataRow label="24h high" value={fmt(market.readings?.high24h)} />
              <DataRow label="24h low" value={fmt(market.readings?.low24h)} />
            </div>
            <p className="report__footnote">
              {market.source ? `Retrieved from ${market.source}. ` : ''}
              Restated from the Market Context stage — not re-fetched or re-derived here.
              {market.state === 'partial' && ' Some derived readings were unavailable, so this summary is partial.'}
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 4. Events & catalysts                                             */
      /* ---------------------------------------------------------------- */
      case 'events':
        return events.state === 'unavailable' ? (
          <SectionUnavailable reason={events.reason} what="No events or catalysts are shown." />
        ) : (
          <>
            {events.items && events.items.length > 0 ? (
              <ul className="da__list">
                {events.items.map((it, i) => (
                  <li key={it.id || `ev-${i}`} className="da__item">
                    <div className="da__item-title">{it.title || it.event || 'Event'}</div>
                    {it.detail && <p className="da__item-detail">{it.detail}</p>}
                    {it.date && <div className="da__item-src">{it.date}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="report__empty">No upcoming events were returned for this asset.</p>
            )}
            <p className="report__footnote">
              {events.source ? `Retrieved from ${events.source}. ` : ''}
              Restated from the Events &amp; Catalysts stage.
              {events.itemCount > (events.itemsShown || 0) &&
                ` Showing ${events.itemsShown} of ${events.itemCount} events.`}
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 5. Devil's Advocate                                               */
      /* ---------------------------------------------------------------- */
      case 'attack':
        return da.state === 'unavailable' ? (
          <SectionUnavailable
            reason={da.reason}
            what="No counterargument, classified evidence or key risks are shown."
          />
        ) : (
          <>
            {da.dataLimited && (
              <div className="report__notice report__notice--muted">
                The attack ran, but with no usable market or event data it could only report what it could
                not assess. Nothing has been manufactured to fill the gap.
              </div>
            )}

            <div className="report__counter">
              <div className="report__sub-label">Strongest argument against your thesis</div>
              {da.strongestCounterargument ? (
                <>
                  <div className="report__counter-title">{da.strongestCounterargument.title}</div>
                  <p className="report__counter-detail">{da.strongestCounterargument.detail}</p>
                  {da.strongestCounterargument.basis && (
                    <div className="da__item-src">Basis: {da.strongestCounterargument.basis}</div>
                  )}
                </>
              ) : (
                <p className="report__empty">
                  No counterargument was produced. TradeGuard will not write one the analysis did not find.
                </p>
              )}
            </div>

            {da.summary && <p className="report__summary-line">{da.summary}</p>}

            <div className="report__two-col">
              <div className="report__mini da__section--support">
                <div className="report__mini-title">
                  Supporting evidence
                  <span className="da__count">{da.supportingTotal || 0}</span>
                </div>
                {da.supporting && da.supporting.length > 0 ? (
                  <ul className="da__list">
                    {da.supporting.map((it, i) => (
                      <li key={it.id || `dsup-${i}`} className="da__item">
                        <div className="da__item-title">{it.title}</div>
                        <p className="da__item-detail">{it.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="da__empty">No supporting signal was found in the data retrieved.</p>
                )}
              </div>

              <div className="report__mini da__section--contradict">
                <div className="report__mini-title">
                  Contradicting evidence
                  <span className="da__count">{da.contradictingTotal || 0}</span>
                </div>
                {da.contradicting && da.contradicting.length > 0 ? (
                  <ul className="da__list">
                    {da.contradicting.map((it, i) => (
                      <li key={it.id || `dcon-${i}`} className="da__item">
                        <div className="da__item-title">{it.title}</div>
                        <p className="da__item-detail">{it.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="da__empty">No contradicting signal was found in the data retrieved.</p>
                )}
              </div>
            </div>

            {da.keyRisks && da.keyRisks.length > 0 && (
              <div className="report__block da__section--risk">
                <div className="report__mini-title">
                  Key risks
                  <span className="da__count">{da.keyRisksTotal}</span>
                </div>
                <ul className="da__list">
                  {da.keyRisks.map((it, i) => (
                    <li key={it.id || `risk-${i}`} className="da__item">
                      <div className="da__item-title">{it.title}</div>
                      <p className="da__item-detail">{it.detail}</p>
                    </li>
                  ))}
                </ul>
                {da.keyRisksShown < da.keyRisksTotal && (
                  <p className="report__footnote">
                    Showing {da.keyRisksShown} of {da.keyRisksTotal}. The full list is in the Devil&apos;s
                    Advocate section.
                  </p>
                )}
              </div>
            )}

            {da.invalidationConditions && da.invalidationConditions.length > 0 && (
              <div className="report__block da__section--invalidation">
                <div className="report__mini-title">
                  Invalidation conditions
                  <span className="da__count">{da.invalidationConditions.length}</span>
                </div>
                <ul className="da__list">
                  {da.invalidationConditions.map((c, i) => (
                    <li key={`ic-${i}`} className="da__item">
                      <div className="da__item-title">
                        <span className="da__item-index">{i + 1}</span>
                        {c.title}
                      </div>
                      <p className="da__item-detail">{c.detail}</p>
                    </li>
                  ))}
                </ul>
                <p className="report__footnote">
                  These are conditions that would weaken the thesis, not exit prices. The one price level
                  that defines this trade&apos;s risk is the invalidation you supplied yourself.
                </p>
              </div>
            )}
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 6. Historical stress test                                         */
      /* ---------------------------------------------------------------- */
      case 'history':
        return historical.state === 'unavailable' ? (
          <SectionUnavailable
            reason={historical.reason}
            what="No comparable past setups or observed outcomes are shown."
          />
        ) : (
          <>
            <div className="data-grid">
              <DataRow label="Comparable setups found" value={fmt(historical.matchedCount)} />
              <DataRow label="Usable sample" value={historical.sampleSize != null ? `${fmt(historical.sampleSize)} bars` : '—'} />
              <DataRow label="Granularity" value={historical.profile?.granularityLabel || '—'} />
              <DataRow
                label="Window / horizon"
                value={
                  historical.profile
                    ? `${historical.profile.windowBars} / ${historical.profile.horizonBars} bars`
                    : '—'
                }
              />
            </div>

            {historical.timeframeAssumed && (
              <p className="report__footnote">
                No timeframe was supplied, so a default sampling profile was assumed. The horizon may not
                match your intended holding period.
              </p>
            )}

            {historical.observations && historical.observations.length > 0 ? (
              <div className="report__block">
                <div className="report__mini-title">
                  Observed outcomes after comparable setups
                  <span className="da__count">{historical.observationsTotal}</span>
                </div>
                <table className="report__table">
                  <thead>
                    <tr>
                      <th>Setup ended</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>Move</th>
                      <th>Favourable</th>
                      <th>Adverse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historical.observations.map((o, i) => (
                      <tr key={o.index ?? i}>
                        <td>{String(o.setupEndTs || '').slice(0, 10) || '—'}</td>
                        <td>{fmt(o.entryPrice)}</td>
                        <td>{fmt(o.exitPrice)}</td>
                        <td className={tone2(o.movePct)}>{pct(o.movePct)}</td>
                        <td>{pct(o.favourableExcursionPct)}</td>
                        <td>{pct(o.adverseExcursionPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {historical.observationsShown < historical.observationsTotal && (
                  <p className="report__footnote">
                    Showing {historical.observationsShown} of {historical.observationsTotal} matched setups. The
                    full list is in the Historical Stress Test section.
                  </p>
                )}
              </div>
            ) : (
              <p className="report__empty">No comparable setups were found in the sampled history.</p>
            )}

            {/* Phase 5's own non-predictive framing, carried through verbatim. */}
            {historical.matchFrequencyNote && (
              <p className="report__footnote report__footnote--guard">{historical.matchFrequencyNote}</p>
            )}

            {historical.state === 'partial' && historical.reason && (
              <p className="report__footnote">{historical.reason}</p>
            )}

            <p className="report__footnote">
              Observed outcomes are a description of the past, not a forecast. Nothing here is a probability,
              a win rate or an expected return.
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 7. Risk assessment                                                */
      /* ---------------------------------------------------------------- */
      case 'risk':
        return risk.ready ? (
          <>
            <div className="data-grid">
              <DataRow label="Entry" value={fmt(risk.entryPrice)} />
              <DataRow label="Invalidation" value={fmt(risk.invalidationPrice)} />
              <DataRow label="Risk budget" value={fmt(risk.riskBudget)} />
              <DataRow label="Price risk per unit" value={fmt(risk.priceRiskPerUnit)} />
              <DataRow label="Calculated position size" value={`${fmt(risk.positionSize)} units`} />
              <DataRow label="Defined risk" value={fmt(risk.definedRisk)} />
            </div>
            <div className="report__meta-row">
              <span className="report__meta-label">Risk status</span>
              <span className="report__meta-value">{risk.statusLabel}</span>
            </div>
            {risk.interpretation && <p className="report__summary-line">{risk.interpretation}</p>}
            <p className="report__footnote">
              These are the risk engine&apos;s own figures, reused unchanged — this report does not
              recalculate them. They are deterministic arithmetic on the entry, invalidation and risk budget
              you supplied, not predictions, and they are not verified against the market. The engine&apos;s
              full methodology and limitations are in the Risk Assessment section.
            </p>
          </>
        ) : (
          <>
            <p className="report__empty">No defined risk — {risk.reason}</p>
            {risk.missingInformation && risk.missingInformation.length > 0 && (
              <ul className="report__plain-list">
                {risk.missingInformation.map((m) => (
                  <li key={m.id}>
                    <strong>{m.title}</strong> — {m.detail}
                  </li>
                ))}
              </ul>
            )}
            <p className="report__footnote">Nothing has been assumed in place of the missing numbers.</p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 8. Trade structure                                                */
      /* ---------------------------------------------------------------- */
      case 'structure':
        return structure.state === 'unavailable' ? (
          <SectionUnavailable reason={structure.reason} what="No consolidated plan is shown." />
        ) : (
          <>
            <div className="report__meta-row">
              <span className="report__meta-label">Structure status</span>
              <span className="report__meta-value">{structure.statusLabel}</span>
            </div>

            {structure.setup && (
              <div className="data-grid">
                <DataRow label="Asset" value={structure.setup.asset || '—'} />
                <DataRow
                  label="Direction"
                  value={DIRECTION_LABELS[structure.setup.direction] || '—'}
                  tone={DIRECTION_TONE[structure.setup.direction]}
                />
                <DataRow label="Entry" value={fmt(structure.setup.entryPrice)} />
                <DataRow label="Invalidation / stop" value={fmt(structure.setup.invalidationPrice)} />
              </div>
            )}

            {structure.riskStructure && structure.riskStructure.complete && (
              <div className="data-grid">
                <DataRow label="Price risk per unit" value={fmt(structure.riskStructure.priceRiskPerUnit)} />
                <DataRow label="Calculated position size" value={`${fmt(structure.riskStructure.positionSize)} units`} />
                <DataRow label="Defined risk" value={fmt(structure.riskStructure.definedRisk)} />
                <DataRow label="Risk budget" value={fmt(structure.riskStructure.riskBudget)} />
              </div>
            )}

            {structure.invalidationConditions && structure.invalidationConditions.length > 0 && (
              <div className="report__block">
                <div className="report__mini-title">
                  Conditions that would weaken the thesis
                  <span className="da__count">{structure.invalidationConditions.length}</span>
                </div>
                <ul className="da__list">
                  {structure.invalidationConditions.map((c, i) => (
                    <li key={`sic-${i}`} className="da__item">
                      <div className="da__item-title">{c.title}</div>
                      <p className="da__item-detail">{c.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {structure.missingInformation && structure.missingInformation.length > 0 && (
              <div className="report__block">
                <div className="report__mini-title">Missing information</div>
                <ul className="report__plain-list">
                  {structure.missingInformation.map((m) => (
                    <li key={m.id}>
                      <strong>{m.title}</strong> — {m.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {structure.caveats && structure.caveats.length > 0 && (
              <ul className="report__caveats report__caveats--inline">
                {structure.caveats.map((c, i) => (
                  <li key={i} className="report__caveat">
                    {c}
                  </li>
                ))}
              </ul>
            )}

            <p className="report__footnote">
              A concise restatement of the Trade Structure. The full plan — supporting and contradicting
              context, assumptions and the complete conditions list — is in the Trade Structure section.
            </p>
          </>
        );

      /* ---------------------------------------------------------------- */
      /* 9. Information gaps & limitations                                 */
      /* ---------------------------------------------------------------- */
      case 'gaps':
        return (
          <>
            {gaps.length === 0 ? (
              <p className="report__empty">
                None — every investigation section produced a usable result for this trade.
              </p>
            ) : (
              <ul className="report__gaps">
                {gaps.map((g) => (
                  <li key={g.id} className="report__gap">
                    <div className="report__gap-head">
                      <StateBadge state={g.state} />
                      <span className="report__gap-title">{g.title}</span>
                      <span className="report__gap-stage">
                        {g.stage} · Phase {g.phase}
                      </span>
                    </div>
                    <p className="report__gap-detail">{g.detail}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="report__footnote">
              Only gaps the underlying stages actually reported are listed. TradeGuard does not add generic
              caveats to pad this section.
            </p>

            {limitations.length > 0 && (
              <div className="report__block report__block--limits">
                <div className="report__mini-title">Important limitations</div>
                <ul className="report__limits">
                  {limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="report">
      <div className="report__status">
        <span className={`report__badge report__badge--${report.status}`}>{report.statusLabel}</span>
        <span className="report__status-note">{STATUS_TITLE[report.status] || ''}</span>
      </div>

      {report.statusDetail && <p className="report__detail">{report.statusDetail}</p>}

      <WorkspaceNav
        title="Final trade report"
        meta={`${summary.available} of ${summary.total} sections available`}
        items={navItems}
        activeId={active.id}
        onSelect={setActiveId}
        ariaLabel="Final trade report sections"
      />

      {active.id === 'boundary' ? (
        /* 10. Final decision boundary */
        <section className="report__section report__section--boundary" data-report-section="Final decision boundary">
          <div className="report__section-title">
            <span className="report__section-index">10</span>
            <span className="report__section-label">Final decision boundary</span>
          </div>
          <div className="report__boundary">{report.decisionBoundary}</div>
          {report.decisionBoundaryDetail && (
            <p className="report__boundary-detail">{report.decisionBoundaryDetail}</p>
          )}
        </section>
      ) : (
        <ReportSection index={active.index} title={active.title} state={stateOf[active.id]}>
          {renderBody()}
        </ReportSection>
      )}

      {report.method && (
        <section className="report__section">
          <div className="report__section-title">
            <span className="report__section-label">How this report was assembled</span>
          </div>
          <p className="report__method">{report.method}</p>
        </section>
      )}

      {report.disclaimer && <div className="stage__meta report__disclaimer">{report.disclaimer}</div>}
    </div>
  );
}

/** Market-magnitude tone for a percentage: positive red, negative green (Chinese convention). */
function tone2(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'is-up' : 'is-down';
}
