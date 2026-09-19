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

test('declares the expected investigation stages in order', () => {
  const ids = INVESTIGATION_STAGES.map((stage) => stage.id);
  assert.deepEqual(ids, [
    'thesis-captured',
    'market-context',
    'events-catalysts',
    'contradicting-evidence',
    'historical-comparisons',
    'risk-assessment',
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

test('every declared stage is now built; nothing in the investigation is locked', () => {
  assert.equal(builtStageCount(), 6);
  assert.equal(lockedStageCount(), 0);
  assert.equal(INVESTIGATION_STAGE_COUNT, 6);
});

test('Phase 7+ screens remain planned and are not reachable', async () => {
  const { NAV_ITEMS } = await import('./constants.js');
  const future = NAV_ITEMS.filter((item) => item.phase > 6);

  // The trade report, decision, review and trader review screens are still
  // placeholders — Phase 6 did not activate any of them.
  assert.ok(future.length >= 4);
  assert.deepEqual(
    future.map((item) => item.id),
    ['trade-report', 'decision', 'trade-review', 'trader-review']
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

test('a fully researched trade with a full attack, a usable sample and a defined risk marks six stages complete', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK, RISK_READY), 6);
  assert.equal(INVESTIGATION_STAGE_COUNT, 6);

  // Phase 1-5 stages are unaffected by the Phase 6 addition: with no risk
  // result yet, the risk stage is loading rather than complete.
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK), 5);
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, null), 4);
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
