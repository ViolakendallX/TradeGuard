// Verifies the Phase 9 / Investigation-workspace fix at the unit level:
// a null decision (no decision recorded yet, nothing fetched) must resolve to
// UNAVAILABLE with the badge "Decision required" — never a permanent LOADING /
// "Loading…" state.

import assert from 'node:assert/strict';
import {
  decisionState,
  stageRuntimeState,
  STAGE_RUNTIME,
  INVESTIGATION_STAGES,
} from '../src/lib/investigation.js';
import { runtimeLabel } from '../src/lib/investigationView.js';

const stage = INVESTIGATION_STAGES.find((s) => s.id === 'human-decision');
const decision = null; // as it arrives on the Investigation workspace before recording

// 1. The stage runtime must not be LOADING for a missing decision.
assert.equal(decisionState(decision), STAGE_RUNTIME.UNAVAILABLE);
assert.notEqual(decisionState(decision), STAGE_RUNTIME.LOADING);

// 2. The workspace stage computation must agree.
const rt = stageRuntimeState(stage, null, null, null, null, null, null, decision, null);
assert.equal(rt, STAGE_RUNTIME.UNAVAILABLE);
assert.notEqual(rt, STAGE_RUNTIME.LOADING);

// 3. The nav/badge label must be "Decision required", not "Loading…".
const label = runtimeLabel(rt, stage, decision);
assert.equal(label, 'Decision required');
assert.notEqual(label, 'Loading…');

// 4. A recorded decision still resolves to COMPLETE + "Decision recorded".
const recorded = { available: true, status: 'recorded', decision: 'TAKE' };
assert.equal(decisionState(recorded), STAGE_RUNTIME.COMPLETE);
assert.equal(runtimeLabel(decisionState(recorded), stage, recorded), 'Decision recorded');

console.log('PASS  Human Decision stage resolves to "Decision required" (no perpetual Loading)');
process.exit(0);
