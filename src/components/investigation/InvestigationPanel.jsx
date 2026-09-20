/**
 * Investigation analysis panel — the MAIN content area of the workspace.
 *
 * It is a shell (section title, section description, runtime status) plus a
 * dispatch to the one panel that renders the selected section. Nothing is
 * appended: exactly one section is on screen at a time, which is what removes
 * the old "scroll through everything" behaviour.
 *
 * Locked sections are not selectable from the navigation, so they never reach
 * this component.
 */

import { STAGE_RUNTIME } from '../../lib/investigation.js';
import { StatusBadge } from './primitives.jsx';
import ThesisPanel from './ThesisPanel.jsx';
import MarketPanel from './MarketPanel.jsx';
import EventsPanel from './EventsPanel.jsx';
import DevilsAdvocatePanel from './DevilsAdvocatePanel.jsx';
import HistoricalPanel from './HistoricalPanel.jsx';
import RiskPanel from './RiskPanel.jsx';
import TradeStructurePanel from './TradeStructurePanel.jsx';
import FinalReportPanel from './FinalReportPanel.jsx';
import DecisionPanel from './DecisionPanel.jsx';
import PaperExecutionPanel from './PaperExecutionPanel.jsx';

function SectionBody({
  section,
  research,
  attack,
  history,
  risk,
  structure,
  report,
  decision,
  execution,
  idea,
  onEdit,
}) {
  switch (section.id) {
    case 'thesis-captured':
      return <ThesisPanel idea={idea} onEdit={onEdit} />;
    case 'market-context':
      return <MarketPanel research={research} />;
    case 'events-catalysts':
      return <EventsPanel research={research} />;
    case 'contradicting-evidence':
      return <DevilsAdvocatePanel attack={attack} />;
    case 'historical-comparisons':
      return <HistoricalPanel history={history} />;
    case 'risk-assessment':
      return <RiskPanel risk={risk} />;
    case 'trade-structure':
      return <TradeStructurePanel structure={structure} />;
    case 'final-report':
      return <FinalReportPanel report={report} />;
    case 'human-decision':
      return <DecisionPanel decision={decision} idea={idea} />;
    // Phase 10 lives in the workspace too, but confirms nowhere: this in-workspace
    // view is read-only and points at the Paper Execution screen, which is where
    // the trader actually confirms. One confirmation surface, not two.
    case 'paper-execution':
      return <PaperExecutionPanel execution={execution} idea={idea} canExecute={false} />;
    default:
      return null;
  }
}

export default function InvestigationPanel({
  section,
  research,
  attack,
  history,
  risk,
  structure,
  report,
  decision,
  execution,
  idea,
  onEdit,
}) {
  if (!section) return null;

  const isLoading = section.runtime === STAGE_RUNTIME.LOADING;

  return (
    <section className="inv-panel" data-panel={section.id} aria-label={section.label}>
      <header className="inv-panel__head">
        <div className="inv-panel__heading">
          <h2 className="inv-panel__title">{section.label}</h2>
          <p className="inv-panel__desc">{section.stage.description}</p>
        </div>
        <StatusBadge runtime={section.runtime} label={section.statusLabel} />
      </header>

      <div className="inv-panel__body">
        {isLoading ? (
          <p className="inv-loading">
            <span className="spinner" aria-hidden="true" />
            Retrieving…
          </p>
        ) : (
          <SectionBody
            section={section}
            research={research}
            attack={attack}
            history={history}
            risk={risk}
            structure={structure}
            report={report}
            decision={decision}
            execution={execution}
            idea={idea}
            onEdit={onEdit}
          />
        )}
      </div>
    </section>
  );
}
