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

test('Phase 4/5/6 stages remain locked and point to later phases', () => {
  for (const id of ['contradicting-evidence', 'historical-comparisons', 'risk-assessment']) {
    const stage = byId(id);
    assert.equal(stage.available, false);
    assert.ok(stage.phase >= 4);
    assert.equal(stageRuntimeState(stage, { market: MARKET_OK, events: EVENTS_OK }), STAGE_RUNTIME.LOCKED);
  }
  assert.equal(lockedStageCount(), 3);
  assert.equal(builtStageCount(), 3);
});

test('no fabricated completion: unavailable market/events are never marked complete', () => {
  const research = { market: MARKET_UNAVAIL, events: EVENTS_UNAVAIL };
  assert.equal(completedStageCountFromResearch(research), 1); // only thesis-captured
});

test('partial data is reported as partial, not complete', () => {
  const research = { market: MARKET_PARTIAL, events: EVENTS_UNAVAIL };
  assert.equal(stageRuntimeState(byId('market-context'), research), STAGE_RUNTIME.PARTIAL);
  assert.equal(completedStageCountFromResearch(research), 1);
});

test('a fully researched trade marks market + events complete', () => {
  const research = { market: MARKET_OK, events: EVENTS_OK };
  assert.equal(completedStageCountFromResearch(research), 3);
  assert.equal(INVESTIGATION_STAGE_COUNT, 6);
});
