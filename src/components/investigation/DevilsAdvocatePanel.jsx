/**
 * Devil's Advocate section (Phase 4).
 *
 * The markup and the copy are unchanged from the inline version — every section
 * is preserved: evidence strength, strongest argument against the trade,
 * supporting evidence, contradicting evidence, key risks, invalidation
 * conditions, missing information, and "How TradeGuard read your thesis".
 *
 * Only the wrapper changed: the panel shell now supplies the heading and the
 * status badge instead of the stage list item.
 *
 * The analysis itself is untouched — it still arrives fully computed from the
 * backend and is never re-derived in the UI.
 */

import { EvidenceSection, UnavailableNotice } from './primitives.jsx';

/**
 * Fallback copy for the interpretation block. The analysis normally supplies its
 * own `interpretationNote`; this keeps the "your thesis, not market evidence"
 * framing visible even if the API response predates that field.
 */
const INTERPRETATION_NOTE =
  "This is TradeGuard's reading of the reasoning you stated in your own thesis — an interpretation of your argument, not verified market or event evidence, and not a statement about what the market will do.";

export default function DevilsAdvocatePanel({ attack }) {
  if (!attack) return null;

  if (attack.available === false) {
    return <UnavailableNotice reason={attack.reason} />;
  }

  const strength = attack.evidenceStrength || { label: 'insufficient evidence', basis: '' };
  const strengthClass = String(strength.label || '').toLowerCase().replace(/\s+/g, '-');
  const counter = attack.strongestCounterargument;

  return (
    <div className="da">
      <div className="da__strength">
        <span className={`da__badge da__badge--${strengthClass}`}>{strength.label}</span>
        <span className="da__basis">Evidence strength — {strength.basis}</span>
      </div>

      {attack.summary && <p className="da__summary">{attack.summary}</p>}

      {attack.dataLimited && (
        <div className="da__notice">
          TradeGuard could not retrieve usable market/event data, so this pass is data-limited. The
          sections below report what is missing rather than inventing evidence.
        </div>
      )}

      {counter && (
        <div className="da__callout">
          <div className="da__callout-label">Strongest argument against the trade</div>
          <div className="da__callout-title">{counter.title}</div>
          {counter.basis === 'insufficient-evidence' && (
            <div className="da__callout-basis">
              Basis: no usable evidence either way — the thesis is unconfirmed, not supported
            </div>
          )}
          <p className="da__callout-detail">{counter.detail}</p>
        </div>
      )}

      <div className="da__grid">
        <EvidenceSection
          title="Supporting evidence"
          tone="support"
          items={attack.supporting}
          empty="No supporting market or event signal was found in the available data."
          emptyDataLimited="Supporting evidence could not be assessed — no usable market or event data was available. This is not a supporting signal."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Contradicting evidence"
          tone="contradict"
          items={attack.contradicting}
          empty="No material contradicting evidence was found in the available data."
          emptyDataLimited="Contradicting evidence could not be assessed — no usable market or event data was available, and none has been invented to fill the gap."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Key risks"
          tone="risk"
          items={attack.keyRisks}
          empty="No specific risks could be derived from the available data."
          emptyDataLimited="No specific risks could be derived — no usable market or event data was available."
          dataLimited={attack.dataLimited}
        />
        <EvidenceSection
          title="Invalidation conditions"
          tone="invalidation"
          items={attack.invalidationConditions}
          empty="No invalidation conditions could be derived from the available data."
          ordered
        />
        <EvidenceSection
          title="Missing information"
          tone="missing"
          items={attack.missingInformation}
          empty="None — all expected inputs were available."
        />
      </div>

      {(attack.interpretation || (attack.assumptions && attack.assumptions.length > 0)) && (
        <div className="da__interpretation">
          <div className="section-label">How TradeGuard read your thesis</div>
          <div className="da__interpretation-note">{attack.interpretationNote || INTERPRETATION_NOTE}</div>
          {attack.interpretation && <p className="da__interpretation-text">{attack.interpretation}</p>}
          {attack.assumptions && attack.assumptions.length > 0 && (
            <>
              <div className="da__assumptions-label">Assumptions your thesis depends on</div>
              <ul className="da__assumptions">
                {attack.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {attack.disclaimer && <div className="stage__meta da__disclaimer">{attack.disclaimer}</div>}
    </div>
  );
}
