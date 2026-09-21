import { useCallback, useEffect, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import TradeIdeaScreen from './screens/TradeIdeaScreen.jsx';
import InvestigationScreen from './screens/InvestigationScreen.jsx';
import DecisionScreen from './screens/DecisionScreen.jsx';
import PaperExecutionScreen from './screens/PaperExecutionScreen.jsx';
import TradeReportScreen from './screens/TradeReportScreen.jsx';
import TradeReviewScreen from './screens/TradeReviewScreen.jsx';
import TradeMemoryScreen from './screens/TradeMemoryScreen.jsx';
import TraderReviewScreen from './screens/TraderReviewScreen.jsx';
import PlaceholderScreen from './screens/PlaceholderScreen.jsx';
import { NAV_ITEMS } from './lib/constants.js';
import { checkHealth } from './lib/api.js';
import useTradeSession from './lib/useTradeSession.js';
import { newSessionId, useJournalSync } from './lib/journal.js';

const DEFAULT_SCREEN = 'trade-idea';
const SCREEN_IDS = NAV_ITEMS.map((item) => item.id);

function readScreenFromHash() {
  const id = window.location.hash.replace(/^#\/?/, '');
  return SCREEN_IDS.includes(id) ? id : DEFAULT_SCREEN;
}

export default function App() {
  const [screen, setScreen] = useState(readScreenFromHash);
  const [apiOnline, setApiOnline] = useState(false);
  // Phase 2: carry the submitted trade context from Trade Idea into Investigation.
  const [submission, setSubmission] = useState(null);
  const [draft, setDraft] = useState(null);
  // Phase 9: the trader's own decision record. Held here rather than inside the
  // decision screen so it survives navigation — the trader must be able to step
  // back into the investigation and return to a decision that is still there.
  const [decision, setDecision] = useState(null);
  // Phase 10: the paper-execution record — the gate evaluation, and later the
  // venue's own response if the trader confirmed an order. Held here so a
  // submitted order is still visible after the trader navigates back into the
  // investigation.
  const [execution, setExecution] = useState(null);
  // Phase 11: trader-entered review notes. Held here so they survive navigation
  // within the session. TradeGuard never auto-fills or learns from them.
  const [reviewNotes, setReviewNotes] = useState('');
  // Phase 12: the identity of the CURRENT trade session. It is what makes saving
  // to Trade Memory an update of one record rather than a new one, and it is
  // regenerated for every new trade — so a new trade can never overwrite the
  // previous one in the journal.
  const [sessionId, setSessionId] = useState(null);
  // Phase 13: the trader's own reflection on the completed trade, written in
  // Trader Review. Held here so it survives navigation, and saved with the trade
  // in Trade Memory. `reflectionTouched` matters: until the trader has actually
  // written or cleared a reflection, the save carries no reflection at all — so
  // an ordinary save can never overwrite a reflection that is already stored.
  const [reflection, setReflection] = useState('');
  const [reflectionTouched, setReflectionTouched] = useState(false);

  // The current trade's server-side records (research, attack, history, risk,
  // structure, report, the execution gate, and the trade review). Fetched ONCE
  // per trade here, at the level that owns the trade — so switching between
  // workspaces reuses what is already loaded instead of re-running the chain,
  // and a new trade resets the session to empty.
  const session = useTradeSession(submission, decision, execution);

  // Phase 12: save the current trade to Trade Memory whenever the records that
  // describe it change. This writes only what the app already holds — it runs no
  // analysis and sends nothing to any venue. The gate evaluation is used when no
  // order was submitted, so the journal remembers LOCKED / READY / UNAVAILABLE
  // honestly rather than as a blank. Phase 13 adds the trader's own reflection.
  const journalSync = useJournalSync({
    sessionId,
    idea: session.idea,
    decision,
    execution: execution || session.gate || null,
    review: session.review,
    notes: reviewNotes,
    traderReview: reflectionTouched ? { notes: reflection } : null,
  });

  useEffect(() => {
    const onHashChange = () => setScreen(readScreenFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const online = await checkHealth();
      if (!cancelled) setApiOnline(online);
    };
    ping();
    const interval = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navigate = useCallback((id) => {
    window.location.hash = `#/${id}`;
    setScreen(id);
  }, []);

  // Called by Trade Idea on a successful submission (online or local offline capture).
  const handleSubmitted = useCallback(
    (data, form) => {
      setSubmission(data);
      setDraft(form);
      // A different trade is a different decision, a different execution and a
      // different Trade Memory record: none of the previous trade's state may
      // carry over and be mistaken for something about this one. The session id
      // is regenerated here, so this trade gets its own row in the journal.
      setDecision(null);
      setExecution(null);
      setReviewNotes('');
      setReflection('');
      setReflectionTouched(false);
      setSessionId(newSessionId());
      navigate('investigation');
    },
    [navigate]
  );

  // Phase 9: the decision screen hands back the record the backend stored.
  // Passing null clears it (the trader chose to change their decision).
  const handleDecisionRecorded = useCallback((record) => {
    setDecision(record || null);
    // The execution gate is derived from the decision, so changing the decision
    // invalidates any execution record taken from the previous one. It is
    // re-evaluated rather than left on screen stale.
    setExecution(null);
  }, []);

  // Phase 10: the execution screen hands back the gate evaluation, and later the
  // venue's own response. Nothing was submitted unless this carries a result.
  const handleExecutionRecorded = useCallback((record) => {
    setExecution(record || null);
  }, []);

  // Phase 13: the trader's reflection. Marked as touched on the first keystroke
  // (including the keystroke that empties it), which is what lets a deliberate
  // clear be saved while an untouched reflection leaves the stored one alone.
  const handleReflectionChange = useCallback((value) => {
    setReflection(value);
    setReflectionTouched(true);
  }, []);

  // Return the trader to the Trade Idea screen with the previous submission restored.
  const handleEdit = useCallback(() => {
    navigate('trade-idea');
  }, [navigate]);

  const active = NAV_ITEMS.find((item) => item.id === screen) ?? NAV_ITEMS[0];

  const subtitle =
    screen === 'trade-idea'
      ? 'Submit the trade you are considering.'
      : screen === 'investigation'
      ? 'TradeGuard is examining your thesis before you risk capital.'
      : screen === 'trade-report'
      ? 'The whole investigation consolidated into one navigable report. A synthesis, not a verdict.'
      : screen === 'decision'
      ? 'Record the decision you are making. TradeGuard records it — it does not make it.'
      : screen === 'paper-execution'
      ? 'Confirm, or do not, that this trade goes to Bitget Demo with virtual funds.'
      : screen === 'trade-review'
      ? 'This review describes what happened after the decision you already made. It does not tell you what to do next.'
      : screen === 'trade-memory'
      ? 'The trades you have saved. Open one to see what you originally recorded — no analysis is re-run.'
      : screen === 'trader-review'
      ? 'Look back at a trade you have recorded and write your own reflection. TradeGuard does not score it or draw conclusions from it.'
      : 'This screen is not part of the TradeGuard workflow.';

  return (
    <AppShell
      activeId={screen}
      onNavigate={navigate}
      apiOnline={apiOnline}
      title={active.label}
      subtitle={subtitle}
    >
      {screen === 'trade-idea' ? (
        <TradeIdeaScreen initialForm={draft} onSubmitted={handleSubmitted} />
      ) : screen === 'investigation' ? (
        <InvestigationScreen
          submission={submission}
          session={session}
          onEdit={handleEdit}
          decision={decision}
          execution={execution}
          onNavigate={navigate}
        />
      ) : screen === 'trade-report' ? (
        <TradeReportScreen submission={submission} session={session} onEdit={handleEdit} onNavigate={navigate} />
      ) : screen === 'decision' ? (
        <DecisionScreen
          submission={submission}
          session={session}
          onEdit={handleEdit}
          decision={decision}
          onDecisionRecorded={handleDecisionRecorded}
          onNavigate={navigate}
        />
      ) : screen === 'paper-execution' ? (
        <PaperExecutionScreen
          submission={submission}
          session={session}
          onEdit={handleEdit}
          decision={decision}
          onExecutionRecorded={handleExecutionRecorded}
        />
      ) : screen === 'trade-review' ? (
        <TradeReviewScreen
          submission={submission}
          session={session}
          onEdit={handleEdit}
          decision={decision}
          execution={execution}
          notes={reviewNotes}
          onNotesChange={setReviewNotes}
        />
      ) : screen === 'trade-memory' ? (
        <TradeMemoryScreen onNavigate={navigate} />
      ) : screen === 'trader-review' ? (
        <TraderReviewScreen
          submission={submission}
          session={session}
          sessionId={sessionId}
          reflection={reflection}
          onReflectionChange={handleReflectionChange}
          sync={journalSync}
          onEdit={handleEdit}
          onNavigate={navigate}
        />
      ) : (
        <PlaceholderScreen screenId={screen} onNavigate={navigate} />
      )}
    </AppShell>
  );
}
