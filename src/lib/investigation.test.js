import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVESTIGATION_STAGES,
  INVESTIGATION_STAGE_COUNT,
  stageStatus,
  completedStageCount,
  unavailableStageCount,
} from './investigation.js';

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

test('only thesis-captured is complete in Phase 2; the rest are locked', () => {
  assert.equal(completedStageCount(), 1);
  assert.equal(unavailableStageCount(), INVESTIGATION_STAGE_COUNT - 1);

  const thesis = INVESTIGATION_STAGES.find((stage) => stage.id === 'thesis-captured');
  assert.equal(stageStatus(thesis), 'complete');

  const locked = INVESTIGATION_STAGES.filter((stage) => !stage.available);
  assert.ok(locked.length > 0);
  assert.ok(locked.every((stage) => stageStatus(stage) === 'locked'));
});

test('every unavailable stage points to a later phase (3+)', () => {
  for (const stage of INVESTIGATION_STAGES) {
    if (!stage.available) {
      assert.ok(stage.phase >= 3, `${stage.id} should reference a later phase`);
    }
  }
});

test('no stage claims to have performed research in Phase 2', () => {
  // Guard against accidentally marking later-phase work as done.
  const fakeComplete = INVESTIGATION_STAGES.filter(
    (stage) => stage.available && stage.id !== 'thesis-captured'
  );
  assert.equal(fakeComplete.length, 0);
});
