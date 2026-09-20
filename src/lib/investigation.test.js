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

test('every declared stage is now built; nothing in the investigation is locked', () => {
  assert.equal(builtStageCount(), 8);
  assert.equal(lockedStageCount(), 0);
  assert.equal(INVESTIGATION_STAGE_COUNT, 8);
});

test('Phase 9+ screens remain planned and are not reachable', async () => {
  const { NAV_ITEMS } = await import('./constants.js');
  const future = NAV_ITEMS.filter((item) => item.phase > 8);

  // The trade report is now Phase 8 and reachable; the decision, review and
  // trader review screens are still placeholders.
  assert.ok(future.length >= 3);
  assert.deepEqual(
    future.map((item) => item.id),
    ['decision', 'trade-review', 'trader-review']
  );

  // Phase 8's own screen, by contrast, is now active.
  const report = NAV_ITEMS.find((item) => item.id === 'trade-report');
  assert.equal(report.phase, 8);
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

test('a fully researched trade with a full attack, a usable sample, a defined risk, a complete structure and a ready report marks eight stages complete', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  assert.equal(
    completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE, REPORT_READY),
    8
  );
  assert.equal(INVESTIGATION_STAGE_COUNT, 8);

  // Phase 1-7 stages are unaffected by the Phase 8 addition: with no report
  // result yet, the report stage is loading rather than complete.
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY, STRUCTURE_COMPLETE), 7);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY), 6);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK), 5);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, null), 4);
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
