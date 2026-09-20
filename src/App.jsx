import { useCallback, useEffect, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import TradeIdeaScreen from './screens/TradeIdeaScreen.jsx';
import InvestigationScreen from './screens/InvestigationScreen.jsx';
import DecisionScreen from './screens/DecisionScreen.jsx';
import PlaceholderScreen from './screens/PlaceholderScreen.jsx';
import { NAV_ITEMS } from './lib/constants.js';
import { checkHealth } from './lib/api.js';

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
      // A different trade is a different decision: the previous record must not
      // carry over and be mistaken for a decision about this one.
      setDecision(null);
      navigate('investigation');
    },
    [navigate]
  );

  // Phase 9: the decision screen hands back the record the backend stored.
  // Passing null clears it (the trader chose to change their decision).
  const handleDecisionRecorded = useCallback((record) => {
    setDecision(record || null);
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
      : screen === 'decision'
      ? 'Record the decision you are making. TradeGuard records it — it does not make it.'
      : 'Not built in this phase.';

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
        <InvestigationScreen submission={submission} onEdit={handleEdit} decision={decision} />
      ) : screen === 'decision' ? (
        <DecisionScreen
          submission={submission}
          onEdit={handleEdit}
          decision={decision}
          onDecisionRecorded={handleDecisionRecorded}
        />
      ) : (
        <PlaceholderScreen screenId={screen} onNavigate={navigate} />
      )}
    </AppShell>
  );
}
