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

test('Phase 6 remains locked and points to a later phase', () => {
  const risk = byId('risk-assessment');
  assert.equal(risk.available, false);
  assert.equal(risk.phase, 6);
  assert.equal(
    stageRuntimeState(risk, { market: MARKET_OK, events: EVENTS_OK }, ATTACK_OK, HISTORY_OK),
    STAGE_RUNTIME.LOCKED
  );
  assert.equal(lockedStageCount(), 1);
  assert.equal(builtStageCount(), 5);
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

test('a fully researched trade with a full attack and a usable sample marks five stages complete', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, HISTORY_OK), 5);
  assert.equal(INVESTIGATION_STAGE_COUNT, 6);
  // Phase 1-4 stages are unaffected by the Phase 5 addition.
  assert.equal(completedStageCountFromResearch(research, ATTACK_OK, null), 4);
});
