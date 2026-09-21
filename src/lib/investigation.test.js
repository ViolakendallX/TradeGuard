import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVESTIGATION_STAGES,
  INVESTIGATION_STAGE_COUNT,
  STAGE_RUNTIME,
  stageRuntimeState,
  stageById,
  builtStageCount,
  lockedStageCount,
  completedStageCountFromResearch,
  reportState,
  decisionState,
  DECISION_STATUS,
  executionState,
  EXECUTION_STATUS,
} from './investigation.js';

const byId = (id) => stageById(id);

const MARKET_OK = { available: true, source: 'Bitget', symbol: 'RNVDAUSDT', price: 10 };
const MARKET_PARTIAL = { available: true, partial: true, source: 'Bitget', symbol: 'RNVDAUSDT', price: 10 };
const MARKET_UNAVAIL = { available: false, reason: 'no data' };
const EVENTS_OK = { available: true, source: 'fmp', items: [{ title: 'Earnings', date: '2026-01-01', description: 'd' }] };
const EVENTS_UNAVAIL = { available: false, reason: 'none' };

const ATTACK_OK = { available: true, dataLimited: false, supporting: [{ id: 's' }], contradicting: [] };
const ATTACK_LIMITED = { available: true, dataLimited: true, supporting: [], contradicting: [] };
const ATTACK_UNAVAIL = { available: false, reason: 'analysis failed' };

const HISTORY_OK = { available: true, dataLimited: false, status: 'ok', matchedCount: 4 };
const HISTORY_PARTIAL = { available: true, dataLimited: true, status: 'partial', matchedCount: 1 };
const HISTORY_NO_MATCHES = { available: true, dataLimited: true, status: 'no-matches', matchedCount: 0 };
const HISTORY_UNAVAIL = { available: false, dataLimited: true, status: 'unavailable', reason: 'provider down' };

// Phase 6 fixtures — mirror the risk engine's own statuses.
const RISK_READY = { available: true, status: 'ready', statusLabel: 'RISK READY' };
const RISK_INCOMPLETE = { available: true, status: 'incomplete', statusLabel: 'INCOMPLETE' };
const RISK_INVALID = { available: true, status: 'invalid', statusLabel: 'INVALID TRADE CONSTRUCTION' };
const RISK_UNAVAIL = { available: false, statusDetail: 'backend offline' };

// Phase 7 fixtures — mirror the trade-structure service's own statuses.
const STRUCTURE_COMPLETE = { available: true, status: 'complete', statusLabel: 'STRUCTURE COMPLETE' };
const STRUCTURE_INCOMPLETE = { available: true, status: 'incomplete', statusLabel: 'STRUCTURE INCOMPLETE' };
const STRUCTURE_UNAVAIL = { available: false, statusDetail: 'backend offline' };

// Phase 8 fixtures — mirror the final-report service's own statuses.
const REPORT_READY = { available: true, status: 'ready', statusLabel: 'REPORT READY' };
const REPORT_INCOMPLETE = { available: true, status: 'incomplete', statusLabel: 'REPORT INCOMPLETE' };
const REPORT_UNAVAIL = { available: false, statusDetail: 'backend offline' };

/**
 * Phase 9 decision fixtures — mirror the human-decision service's own statuses.
 * Note there is no "recommended" or "good" state: a decision is either not
 * recorded yet, or it is recorded.
 */
const DECISION_RECORDED = { available: true, status: 'recorded', statusLabel: 'DECISION RECORDED' };
const DECISION_REQUIRED = { available: true, status: 'required', statusLabel: 'DECISION REQUIRED' };

/**
 * Phase 10 execution fixtures — mirror the paper-execution service's statuses.
 *
 * Note what is deliberately absent: there is no "executed profitably", no
 * "good fill", no "recommended". `submitted` means a demo order exists, and
 * that is all it means — the outcome is unknown at submission time.
 */
const EXEC_LOCKED = { available: true, status: 'locked', statusLabel: 'EXECUTION LOCKED' };
const EXEC_READY = { available: true, status: 'ready', statusLabel: 'READY FOR PAPER EXECUTION' };
const EXEC_UNAVAILABLE = {
  available: true,
  status: 'unavailable',
  statusLabel: 'PAPER EXECUTION UNAVAILABLE',
};
const EXEC_SUBMITTED = { available: true, status: 'submitted', statusLabel: 'PAPER ORDER SUBMITTED' };
const EXEC_FAILED = { available: true, status: 'failed', statusLabel: 'PAPER ORDER FAILED' };
const EXEC_SERVICE_UNAVAIL = { available: false, statusDetail: 'backend offline' };

test('declares the expected investigation stages in order', () => {
  const ids = INVESTIGATION_STAGES.map((stage) => stage.id);
  assert.deepEqual(ids, [
    'thesis-captured',
    'market-context',
    'events-catalysts',
    'contradicting-evidence',
    'historical-comparisons',
    'risk-assessment',
    'trade-structure',
    'final-report',
    'human-decision',
    'paper-execution',
  ]);
});

test('thesis-captured is always complete; market/events are built (phase 3) but not complete without data', () => {
  const thesis = byId('thesis-captured');
  assert.equal(stageRuntimeState(thesis, null), STAGE_RUNTIME.COMPLETE);

  const market = byId('market-context');
  assert.equal(market.available, true);
  assert.equal(market.phase, 3);
  // Before research resolves, the stage is loading — NOT complete.
  assert.equal(stageRuntimeState(market, null), STAGE_RUNTIME.LOADING);
  // With unavailable data, it is unavailable — NOT complete.
  assert.equal(stageRuntimeState(market, { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL }), STAGE_RUNTIME.UNAVAILABLE);
  // With valid data, it is complete.
  assert.equal(stageRuntimeState(market, { market: MARKET_OK, events: EVENTS_UNAVAIL }), STAGE_RUNTIME.COMPLETE);
});

test('events-catalysts stage reflects real data availability', () => {
  const events = byId('events-catalysts');
  assert.equal(stageRuntimeState(events, null), STAGE_RUNTIME.LOADING);
  assert.equal(stageRuntimeState(events, { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL }), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(stageRuntimeState(events, { market: MARKET_UNAVAIL, events: EVENTS_OK }), STAGE_RUNTIME.COMPLETE);
});

test("Devil's Advocate is now built (phase 4) and reflects the attack runtime state", () => {
  const da = byId('contradicting-evidence');
  assert.equal(da.available, true);
  assert.equal(da.phase, 4);
  // No analysis yet -> loading (NOT complete).
  assert.equal(stageRuntimeState(da, { market: MARKET_OK, events: EVENTS_OK }, null), STAGE_RUNTIME.LOADING);
  // Analysis failed -> unavailable (honest), never complete.
  assert.equal(stageRuntimeState(da, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_UNAVAIL), STAGE_RUNTIME.UNAVAILABLE);
  // Ran but data-limited -> partial, never complete.
  assert.equal(stageRuntimeState(da, { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL }, ATTACK_LIMITED), STAGE_RUNTIME.PARTIAL);
  // Ran with usable evidence -> complete.
  assert.equal(stageRuntimeState(da, { market: MARKET_OK, events: EVENTS_UNAVAIL }, ATTACK_OK), STAGE_RUNTIME.COMPLETE);
});

test('historical stress test is now built (phase 5) and reflects the history runtime state', () => {
  const hist = byId('historical-comparisons');
  assert.equal(hist.available, true);
  assert.equal(hist.phase, 5);
  assert.equal(hist.label, 'Historical stress test');
  // No result yet -> loading (NOT complete).
  assert.equal(stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, null), STAGE_RUNTIME.LOADING);
  // Provider failure -> unavailable (explicit HISTORICAL DATA UNAVAILABLE), never complete.
  assert.equal(
    stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, HISTORY_UNAVAIL),
    STAGE_RUNTIME.UNAVAILABLE
  );
  // Ran but partial or with no matches -> partial, never complete.
  assert.equal(
    stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, HISTORY_PARTIAL),
    STAGE_RUNTIME.PARTIAL
  );
  assert.equal(
    stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, HISTORY_NO_MATCHES),
    STAGE_RUNTIME.PARTIAL
  );
  // Ran with a usable sample -> complete.
  assert.equal(
    stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, HISTORY_OK),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the historical stage never claims completion without a usable sample', () => {
  const hist = byId('historical-comparisons');
  for (const history of [null, HISTORY_UNAVAIL, HISTORY_PARTIAL, HISTORY_NO_MATCHES]) {
    assert.notEqual(
      stageRuntimeState(hist, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, history),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('risk assessment is now built (phase 6) and reflects the risk runtime state', () => {
  const risk = byId('risk-assessment');
  assert.equal(risk.available, true);
  assert.equal(risk.phase, 6);
  assert.equal(risk.label, 'Risk assessment');

  const research = { market: MARKET_OK, events: EVENTS_OK };

  // No result yet -> loading (NOT complete).
  assert.equal(stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, null), STAGE_RUNTIME.LOADING);

  // The engine could not run at all -> unavailable, never complete.
  assert.equal(
    stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, RISK_UNAVAIL),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // Ran, but inputs are missing -> partial: there is no defined risk.
  assert.equal(
    stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, RISK_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );

  // Ran, but the construction contradicts itself -> partial, never complete.
  assert.equal(
    stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, RISK_INVALID),
    STAGE_RUNTIME.PARTIAL
  );

  // Ran with a coherent construction -> complete.
  assert.equal(
    stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, RISK_READY),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the risk stage never claims completion without a defined risk', () => {
  const risk = byId('risk-assessment');
  const research = { market: MARKET_OK, events: EVENTS_OK };

  for (const value of [null, RISK_UNAVAIL, RISK_INCOMPLETE, RISK_INVALID]) {
    assert.notEqual(
      stageRuntimeState(risk, research, ATTACK_OK, HISTORY_OK, value),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('the risk stage does not depend on market data being reachable', () => {
  const risk = byId('risk-assessment');
  // Research failed entirely, but the risk engine is pure arithmetic on the
  // trader's own levels, so it still resolves rather than sitting on "loading".
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };

  assert.equal(
    stageRuntimeState(risk, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY),
    STAGE_RUNTIME.COMPLETE
  );
  assert.equal(
    stageRuntimeState(risk, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );
});

test('trade structure is now built (phase 7) and reflects the structure runtime state', () => {
  const structure = byId('trade-structure');
  assert.equal(structure.available, true);
  assert.equal(structure.phase, 7);
  assert.equal(structure.label, 'Trade structure');

  const research = { market: MARKET_OK, events: EVENTS_OK };

  // No result yet -> loading (NOT complete).
  assert.equal(
    stageRuntimeState(structure, research, ATTACK_OK, HISTORY_OK, RISK_READY, null),
    STAGE_RUNTIME.LOADING
  );

  // The structure could not be produced at all -> unavailable, never complete.
  assert.equal(
    stageRuntimeState(structure, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_UNAVAIL),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // Ran, but the structure is incomplete -> partial, never complete.
  assert.equal(
    stageRuntimeState(structure, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );

  // Ran with a complete structure -> complete.
  assert.equal(
    stageRuntimeState(structure, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the structure stage never claims completion without a complete structure', () => {
  const structure = byId('trade-structure');
  const research = { market: MARKET_OK, events: EVENTS_OK };

  for (const value of [null, STRUCTURE_UNAVAIL, STRUCTURE_INCOMPLETE]) {
    assert.notEqual(
      stageRuntimeState(structure, research, ATTACK_OK, HISTORY_OK, RISK_READY, value),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('the structure stage does not depend on market data being reachable', () => {
  const structure = byId('trade-structure');
  // The market-data chain failed entirely, but the structure is a synthesis of
  // the trader's own parameters and the earlier findings, so it still resolves.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };

  assert.equal(
    stageRuntimeState(structure, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_COMPLETE),
    STAGE_RUNTIME.COMPLETE
  );
  assert.equal(
    stageRuntimeState(structure, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );
});

test('the final trade report is now built (phase 8) and reflects the report runtime state', () => {
  const report = byId('final-report');
  assert.equal(report.available, true);
  assert.equal(report.phase, 8);
  assert.equal(report.label, 'Final trade report');

  const research = { market: MARKET_OK, events: EVENTS_OK };

  // No result yet -> loading (NOT complete).
  assert.equal(
    stageRuntimeState(report, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, null),
    STAGE_RUNTIME.LOADING
  );

  // The report could not be assembled at all -> unavailable, never complete.
  assert.equal(
    stageRuntimeState(report, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_UNAVAIL),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // Assembled over an investigation that is genuinely incomplete -> partial.
  assert.equal(
    stageRuntimeState(report, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );

  // Assembled over a complete investigation -> complete.
  assert.equal(
    stageRuntimeState(report, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_READY),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the report stage never claims completion without a ready report', () => {
  const report = byId('final-report');
  const research = { market: MARKET_OK, events: EVENTS_OK };

  for (const value of [null, REPORT_UNAVAIL, REPORT_INCOMPLETE]) {
    assert.notEqual(
      stageRuntimeState(report, research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, value),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('the report stage does not depend on market data being reachable', () => {
  const report = byId('final-report');
  // The market-data chain failed entirely, but the report is a synthesis of the
  // trader's own parameters and the earlier findings, so it still resolves
  // rather than sitting on "loading" forever.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };

  assert.equal(
    stageRuntimeState(report, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_COMPLETE, REPORT_READY),
    STAGE_RUNTIME.COMPLETE
  );
  assert.equal(
    stageRuntimeState(report, deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_COMPLETE, REPORT_INCOMPLETE),
    STAGE_RUNTIME.PARTIAL
  );
});

test('an unavailable or incomplete report is never reported as ready', () => {
  // reportState is the single point that maps the service's own status onto a
  // runtime state, so guard it directly.
  assert.equal(reportState(null), STAGE_RUNTIME.LOADING);
  assert.equal(reportState(REPORT_UNAVAIL), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(reportState(REPORT_INCOMPLETE), STAGE_RUNTIME.PARTIAL);
  assert.equal(reportState(REPORT_READY), STAGE_RUNTIME.COMPLETE);
  assert.equal(reportState({ available: true, status: 'incomplete' }), STAGE_RUNTIME.PARTIAL);

  // And any status the service might publish that is not exactly 'ready' is
  // treated as incomplete rather than silently promoted to complete.
  for (const status of ['incomplete', 'unavailable', 'READY', '', undefined, null]) {
    assert.notEqual(reportState({ available: true, status }), STAGE_RUNTIME.COMPLETE);
  }
});

test('the human decision is now built (phase 9) and reflects the decision runtime state', () => {
  const decision = byId('human-decision');
  assert.equal(decision.available, true);
  assert.equal(decision.phase, 9);
  assert.equal(decision.label, 'Human decision');

  const research = { market: MARKET_OK, events: EVENTS_OK };

  // No record and nothing requested yet -> unavailable (NOT complete, and NOT
  // loading: the decision is never fetched on the workspace, so there is no
  // request to be in flight — a missing decision is the honest "not decided yet"
  // state, not a spinner).
  assert.equal(
    stageRuntimeState(
      decision,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      null
    ),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // The decision has not been recorded yet -> nothing to complete.
  assert.equal(
    stageRuntimeState(
      decision,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_REQUIRED
    ),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // The trader recorded a decision -> complete.
  assert.equal(
    stageRuntimeState(
      decision,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED
    ),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the decision stage never claims completion without a recorded decision', () => {
  const decision = byId('human-decision');
  const research = { market: MARKET_OK, events: EVENTS_OK };

  for (const value of [
    null,
    DECISION_REQUIRED,
    { available: true, status: 'required' }, // no statusLabel
    { available: true, status: 'pending' }, // an unsupported status
    { available: false, status: 'recorded' }, // the service could not be reached
  ]) {
    assert.notEqual(
      stageRuntimeState(
        decision,
        research,
        ATTACK_OK,
        HISTORY_OK,
        RISK_READY,
        STRUCTURE_COMPLETE,
        REPORT_READY,
        value
      ),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('the decision stage does not depend on market data being reachable', () => {
  const decision = byId('human-decision');
  // The whole market-data chain is dead, but the decision is the trader's own
  // record — nothing about it depends on a provider being up.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };

  assert.equal(
    stageRuntimeState(
      decision,
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      null,
      null,
      REPORT_UNAVAIL,
      DECISION_RECORDED
    ),
    STAGE_RUNTIME.COMPLETE
  );
});

test('decisionState maps only "recorded" onto complete', () => {
  // decisionState is the single point that maps the service's own status onto a
  // runtime state, so guard it directly.
  // A null decision is the honest "not decided yet" state, NOT loading: nothing
  // is fetched for the decision on the workspace, so it must never read as if a
  // request were in flight. It is unavailable, exactly like the PENDING record.
  assert.equal(decisionState(null), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(decisionState(DECISION_REQUIRED), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(decisionState(DECISION_RECORDED), STAGE_RUNTIME.COMPLETE);
  assert.equal(decisionState({ available: true, status: 'required' }), STAGE_RUNTIME.UNAVAILABLE);

  // An unreachable decision service is unavailable, never complete — a status
  // string alone must not be trusted when the record itself was not available.
  assert.equal(decisionState({ available: false, status: 'recorded' }), STAGE_RUNTIME.UNAVAILABLE);

  // Any status the service might publish that is not exactly 'recorded' is
  // treated as not-yet-decided rather than silently promoted to complete.
  for (const status of ['required', 'RECORDED', '', undefined, null, 'taken', 'approved']) {
    assert.notEqual(decisionState({ available: true, status }), STAGE_RUNTIME.COMPLETE);
  }
});

test('there are exactly two decision states and neither is a verdict', () => {
  assert.deepEqual(Object.values(DECISION_STATUS).sort(), ['recorded', 'required']);

  // The state names must never read as an opinion on the trade. TAKE, WAIT and
  // SKIP all land on the SAME state — recording a decision is the work, and the
  // stage does not grade which one you picked.
  for (const label of Object.values(DECISION_STATUS)) {
    assert.ok(!/good|bad|approve|recommend|valid|best|success/i.test(label), `${label} must not be a verdict`);
  }
});

test('paper execution is now built (phase 10) and reflects the execution runtime state', () => {
  const exec = byId('paper-execution');
  assert.equal(exec.available, true);
  assert.equal(exec.phase, 10);
  assert.equal(exec.label, 'Paper execution');

  const research = { market: MARKET_OK, events: EVENTS_OK };

  // No record yet -> loading (NOT complete, and not a refusal).
  assert.equal(
    stageRuntimeState(
      exec,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      null
    ),
    STAGE_RUNTIME.LOADING
  );

  // The gate is not met -> not available, never complete.
  assert.equal(
    stageRuntimeState(
      exec,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      EXEC_LOCKED
    ),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // Eligible, nothing sent yet -> partial. READY is an offer, not an outcome.
  assert.equal(
    stageRuntimeState(
      exec,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      EXEC_READY
    ),
    STAGE_RUNTIME.PARTIAL
  );

  // An attempt was made and it did not succeed -> partial, never complete.
  assert.equal(
    stageRuntimeState(
      exec,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      EXEC_FAILED
    ),
    STAGE_RUNTIME.PARTIAL
  );

  // A demo order was submitted and the venue returned an ID -> complete.
  assert.equal(
    stageRuntimeState(
      exec,
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      EXEC_SUBMITTED
    ),
    STAGE_RUNTIME.COMPLETE
  );
});

test('the execution stage never claims completion without a submitted order', () => {
  const exec = byId('paper-execution');
  const research = { market: MARKET_OK, events: EVENTS_OK };

  for (const value of [
    null,
    EXEC_LOCKED,
    EXEC_READY,
    EXEC_UNAVAILABLE,
    EXEC_FAILED,
    EXEC_SERVICE_UNAVAIL,
    { available: true, status: 'ready' }, // no statusLabel
    { available: true, status: 'pending' }, // an unsupported status
    { available: false, status: 'submitted' }, // the service could not be reached
  ]) {
    assert.notEqual(
      stageRuntimeState(
        exec,
        research,
        ATTACK_OK,
        HISTORY_OK,
        RISK_READY,
        STRUCTURE_COMPLETE,
        REPORT_READY,
        DECISION_RECORDED,
        value
      ),
      STAGE_RUNTIME.COMPLETE
    );
  }
});

test('the execution stage does not depend on market data or a decision record being reachable', () => {
  const exec = byId('paper-execution');
  // The whole investigation chain is dead. Paper execution is gated on the
  // trader's decision and the venue's response — not on a provider — so it
  // still resolves rather than sitting on "loading" forever.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };

  assert.equal(
    stageRuntimeState(
      exec,
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      null,
      null,
      REPORT_UNAVAIL,
      null,
      EXEC_SUBMITTED
    ),
    STAGE_RUNTIME.COMPLETE
  );
  assert.equal(
    stageRuntimeState(
      exec,
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      null,
      null,
      REPORT_UNAVAIL,
      null,
      EXEC_LOCKED
    ),
    STAGE_RUNTIME.UNAVAILABLE
  );
});

test('executionState maps only "submitted" onto complete', () => {
  assert.equal(executionState(null), STAGE_RUNTIME.LOADING);
  assert.equal(executionState(EXEC_LOCKED), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(executionState(EXEC_UNAVAILABLE), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(executionState(EXEC_READY), STAGE_RUNTIME.PARTIAL);
  assert.equal(executionState(EXEC_FAILED), STAGE_RUNTIME.PARTIAL);
  assert.equal(executionState(EXEC_SUBMITTED), STAGE_RUNTIME.COMPLETE);

  // An unreachable service is unavailable, never complete — a status string
  // alone must not be trusted when the record itself was not available.
  assert.equal(executionState(EXEC_SERVICE_UNAVAIL), STAGE_RUNTIME.UNAVAILABLE);
  assert.equal(
    executionState({ available: false, status: 'submitted' }),
    STAGE_RUNTIME.UNAVAILABLE
  );

  // Any status the service might publish that is not exactly 'submitted' is
  // treated as not-yet-executed rather than promoted to complete.
  for (const status of ['ready', 'SUBMITTED', 'locked', '', undefined, null, 'filled', 'open']) {
    assert.notEqual(executionState({ available: true, status }), STAGE_RUNTIME.COMPLETE);
  }
});

test('there are exactly five execution states and none of them is a verdict', () => {
  assert.deepEqual(Object.values(EXECUTION_STATUS).sort(), [
    'failed',
    'locked',
    'ready',
    'submitted',
    'unavailable',
  ]);

  // These describe WHAT HAPPENED, never whether the trade is good. A submitted
  // order is not a good trade, and a failed one is not a bad one — one is a
  // venue response, the other a venue refusal.
  for (const label of Object.values(EXECUTION_STATUS)) {
    assert.ok(!/good|bad|profit|loss|approve|recommend|win|best|success/i.test(label), `${label} must not be a verdict`);
  }
});

test('every declared stage is now built; nothing in the investigation is locked', () => {
  assert.equal(builtStageCount(), 10);
  assert.equal(lockedStageCount(), 0);
  assert.equal(INVESTIGATION_STAGE_COUNT, 10);
});

test('Trade Review (11), Trade Memory (12) and Trader Review (13) are all built, in workflow order', async () => {
  const { NAV_ITEMS } = await import('./constants.js');

  const review = NAV_ITEMS.find((item) => item.id === 'trade-review');
  assert.equal(review.phase, 11);
  assert.equal(review.label, 'Trade Review');

  const memory = NAV_ITEMS.find((item) => item.id === 'trade-memory');
  assert.equal(memory.phase, 12);
  assert.equal(memory.label, 'Trade Memory');

  // Phase 13 landed the last screen, so nothing in the navigation is planned any
  // more — every declared phase has an implementation behind it.
  const trader = NAV_ITEMS.find((item) => item.id === 'trader-review');
  assert.equal(trader.phase, 13);
  assert.equal(trader.label, 'Trader Review');
  assert.deepEqual(
    NAV_ITEMS.filter((item) => item.phase > 13),
    [],
    'no screen is left unimplemented'
  );
  assert.deepEqual(
    NAV_ITEMS.map((item) => item.phase),
    [1, 2, 8, 9, 10, 11, 12, 13],
    'the phases that own a screen are exactly the ones that are built'
  );

  // Paper execution is Phase 10 and sits directly after the decision, which is
  // what unlocks it. The post-decision screens follow in workflow order.
  const execution = NAV_ITEMS.find((item) => item.id === 'paper-execution');
  assert.equal(execution.phase, 10);
  assert.equal(execution.label, 'Paper Execution');

  const ids = NAV_ITEMS.map((item) => item.id);
  assert.equal(ids.indexOf('paper-execution'), ids.indexOf('decision') + 1);
  assert.equal(ids.indexOf('trade-review'), ids.indexOf('paper-execution') + 1);
  assert.equal(ids.indexOf('trade-memory'), ids.indexOf('trade-review') + 1);
  assert.equal(ids.indexOf('trader-review'), ids.indexOf('trade-memory') + 1);
});

test('the sidebar groups partition the workflow exactly — every screen once, in order', async () => {
  const { NAV_ITEMS, NAV_GROUPS } = await import('./constants.js');

  const grouped = NAV_GROUPS.flatMap((group) => group.items);

  assert.deepEqual(
    grouped,
    NAV_ITEMS.map((item) => item.id),
    'the groups list every screen exactly once, in navigation order'
  );
  assert.equal(new Set(grouped).size, grouped.length, 'no screen appears in two groups');

  // Four labelled, captioned groups create the hierarchy the eye reads before it
  // reads any single item. The invariant is the partition and the labels — not
  // the historical number of groups, which changes with the product's shape.
  assert.equal(NAV_GROUPS.length, 4);
  for (const group of NAV_GROUPS) {
    assert.ok(group.label, `${group.id} has a label`);
    assert.ok(group.caption, `${group.id} has a caption`);
  }

  // The groups run in workflow order, and every screen lands in exactly one.
  assert.deepEqual(
    NAV_GROUPS.map((group) => group.id),
    ['trading', 'analysis', 'decision', 'memory'],
    'the sidebar runs start → analyse → decide → remember'
  );
  assert.deepEqual(
    NAV_GROUPS.flatMap((group) => group.items.map((id) => `${group.id}:${id}`)),
    [
      'trading:trade-idea',
      'analysis:investigation',
      'analysis:trade-report',
      'decision:decision',
      'decision:paper-execution',
      'memory:trade-review',
      'memory:trade-memory',
      'memory:trader-review',
    ]
  );

  // Every analysis stage is named in the ANALYSIS caption, so the sidebar does
  // not have to repeat the eight-stage rail to communicate the workflow.
  const analysis = NAV_GROUPS.find((group) => group.id === 'analysis');
  assert.ok(analysis, 'there is an analysis group');
  for (const stage of ['Thesis', 'Market', 'Events', 'Attack', 'History', 'Risk', 'Structure', 'Report']) {
    assert.match(analysis.caption, new RegExp(stage), `the analysis caption names ${stage}`);
  }
});

test('every workflow screen carries an icon and one of the section accents', async () => {
  const { NAV_ITEMS } = await import('./constants.js');

  // The colour language is only a language if every section speaks it. A screen
  // with no accent, or an accent outside the token set, silently breaks it.
  const ACCENTS = [
    'thesis',
    'market',
    'events',
    'attack',
    'history',
    'risk',
    'structure',
    'report',
    'decision',
    'execution',
    'memory',
    'review',
  ];

  for (const item of NAV_ITEMS) {
    assert.ok(item.icon, `${item.id} has an icon`);
    assert.ok(ACCENTS.includes(item.accent), `${item.id} uses a known accent, not ${item.accent}`);
  }

  // And the accents are used, not all set to one safe blue.
  assert.ok(
    new Set(NAV_ITEMS.map((item) => item.accent)).size >= 6,
    'the sidebar spans the colour language rather than defaulting everything to one hue'
  );
});

test('no fabricated completion: unavailable market/events/attack are never marked complete', () => {
  const research = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(completedStageCountFromResearch(research, ATTACK_UNAVAIL, HISTORY_UNAVAIL), 1); // only thesis-captured
  assert.equal(completedStageCountFromResearch(research, ATTACK_LIMITED, HISTORY_PARTIAL), 1); // limited = partial
});

test('partial data is reported as partial, not complete', () => {
  const research = { market: MARKET_PARTIAL, events: EVENTS_UNAVAIL };
  assert.equal(stageRuntimeState(byId('market-context'), research), STAGE_RUNTIME.PARTIAL);
  assert.equal(completedStageCountFromResearch(research, ATTACK_UNAVAIL, HISTORY_UNAVAIL), 1);
});

test('a fully researched trade with a full attack, a usable sample, a defined risk, a complete structure, a ready report and a recorded decision marks nine stages complete', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  assert.equal(
    completedStageCountFromResearch(
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED
    ),
    9
  );
  assert.equal(INVESTIGATION_STAGE_COUNT, 10);

  // A submitted demo order is the tenth and last stage.
  assert.equal(
    completedStageCountFromResearch(
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED,
      EXEC_SUBMITTED
    ),
    10
  );

  // Phase 1-9 stages are unaffected by the Phase 10 addition: with no decision
  // recorded yet, neither the decision stage nor execution is complete.
  assert.equal(
    completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_READY),
    8
  );
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE), 7);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY), 6);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK), 5);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, null), 4);
});

test('a recorded decision adds exactly one stage and never covers for a missing one', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };

  // Everything else complete -> the decision is the ninth and last stage.
  assert.equal(
    completedStageCountFromResearch(
      research,
      ATTACK_OK,
      HISTORY_OK,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY,
      DECISION_RECORDED
    ) -
      completedStageCountFromResearch(
        research,
        ATTACK_OK,
        HISTORY_OK,
        RISK_READY,
        STRUCTURE_COMPLETE,
        REPORT_READY
      ),
    1
  );

  // With the whole data chain dead, recording a decision completes only the
  // thesis stage and the decision stage — it does not stand in for evidence.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(
    completedStageCountFromResearch(
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      null,
      null,
      REPORT_UNAVAIL,
      DECISION_RECORDED
    ),
    2 // thesis-captured + human-decision
  );

  // And a not-yet-recorded decision adds nothing.
  assert.equal(
    completedStageCountFromResearch(
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      null,
      null,
      REPORT_UNAVAIL,
      DECISION_REQUIRED
    ),
    1
  );
});

test('a submitted demo order adds exactly one stage; being merely eligible adds none', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  const base = [
    research,
    ATTACK_OK,
    HISTORY_OK,
    RISK_READY,
    STRUCTURE_COMPLETE,
    REPORT_READY,
    DECISION_RECORDED,
  ];
  const withDecision = completedStageCountFromResearch(...base);

  // A demo order the venue accepted -> the tenth stage.
  assert.equal(completedStageCountFromResearch(...base, EXEC_SUBMITTED) - withDecision, 1);

  // READY means eligible, not executed. Nothing has been sent, so nothing is claimed.
  assert.equal(completedStageCountFromResearch(...base, EXEC_READY) - withDecision, 0);

  // A refused or unreachable venue placed no order either.
  assert.equal(completedStageCountFromResearch(...base, EXEC_FAILED) - withDecision, 0);
  assert.equal(completedStageCountFromResearch(...base, EXEC_LOCKED) - withDecision, 0);
  assert.equal(completedStageCountFromResearch(...base, EXEC_UNAVAILABLE) - withDecision, 0);
  assert.equal(completedStageCountFromResearch(...base, EXEC_SERVICE_UNAVAIL) - withDecision, 0);
});

test('an incomplete or unavailable report adds no completion', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };

  assert.equal(
    completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_INCOMPLETE),
    7
  );
  assert.equal(
    completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_UNAVAIL),
    7
  );
});

test('a complete structure still cannot complete a trade whose other stages have no data', () => {
  // A structured plan does not stand in for market context, events, the attack or
  // history — each stage is complete only on its own evidence.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(
    completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_COMPLETE),
    3
  );

  // And an incomplete structure adds nothing beyond the risk stage.
  assert.equal(
    completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, STRUCTURE_INCOMPLETE),
    2
  );
});

test('a ready report still cannot complete a trade whose other stages have no data', () => {
  // The report is a synthesis — it summarises what the other stages found, and
  // an unavailable section stays unavailable no matter how well-written the
  // report around it is. It never manufactures the evidence it is missing.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(
    completedStageCountFromResearch(
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY
    ),
    4 // thesis-captured + risk + structure + report; no fabricated market/events/attack/history
  );

  // With the earlier stages dead and no structure either, the report adds one
  // stage over the risk assessment and nothing more.
  assert.equal(
    completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY, null, REPORT_READY),
    3
  );
});

test('a ready report is a real report even when part of the investigation is unavailable', () => {
  // The important nuance of Phase 8: a report assembled over an investigation
  // with a dead provider is still REPORT READY — it honestly labels that
  // section UNAVAILABLE rather than pretending it does not exist. The stage
  // model reflects the report's OWN status, not a re-derivation of the inputs.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(
    stageRuntimeState(
      byId('final-report'),
      deadResearch,
      ATTACK_UNAVAIL,
      HISTORY_UNAVAIL,
      RISK_READY,
      STRUCTURE_COMPLETE,
      REPORT_READY
    ),
    STAGE_RUNTIME.COMPLETE
  );
});

test('a ready risk assessment still cannot complete a trade whose other stages have no data', () => {
  // A defined risk does not stand in for market context, events, the attack or
  // history — each stage is complete only on its own evidence.
  const deadResearch = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_READY), 2);

  // And an incomplete or invalid risk assessment adds nothing.
  assert.equal(completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_INCOMPLETE), 1);
  assert.equal(completedStageCountFromResearch(deadResearch, ATTACK_UNAVAIL, HISTORY_UNAVAIL, RISK_INVALID), 1);
});
