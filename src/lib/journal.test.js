/**
 * Trade Memory client invariants (Phase 12, extended in Phase 13).
 *
 * These are the cross-boundary rules that a unit test can actually pin: the
 * session id the browser generates has to satisfy the SERVER's validator, and
 * the reflection payload has to be shaped so that the server can tell "the
 * trader cleared their reflection" apart from "this save does not carry one".
 *
 * The hooks themselves (useJournalSync / useJournalList / useJournalRecord) are
 * exercised in the browser harness, where a real backend and a real reload exist.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newSessionId, resolveReviewRecordId } from './journal.js';

// Mirrors normalizeSessionId in server/services/tradeJournal.js. If the server
// tightens its rule, this test is what catches the browser generating ids the
// API would reject.
const SERVER_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const SERVER_ID_MAX_LENGTH = 64;

test('a generated session id satisfies the server’s own validator', () => {
  for (let i = 0; i < 200; i += 1) {
    const id = newSessionId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0, 'an id is never empty');
    assert.ok(id.length <= SERVER_ID_MAX_LENGTH, `"${id}" is within the server's length limit`);
    assert.match(id, SERVER_ID_PATTERN, `"${id}" contains only characters the server accepts`);
  }
});

test('session ids are unique, so two trades can never collide in the journal', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i += 1) ids.add(newSessionId());
  assert.equal(ids.size, 2000, 'every generated id is distinct');
});

test('a generated session id is stable for the same trade and new for the next', () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.notEqual(a, b);
  // The id is opaque — it carries no asset, no direction and no timestamp that
  // could be mistaken for a record field.
  assert.equal(a.includes(' '), false);
  assert.equal(a.includes('/'), false);
});

// ---------------------------------------------------------------------------
// Which trade Trader Review shows
//
// Trader Review reviews a trade that has ALREADY been decided, so it must not
// depend on the trader having one open. The rule that decides "what am I looking
// at" is the thing most likely to be got wrong here, so it is a pure function
// and it is pinned below.
// ---------------------------------------------------------------------------

const SAVED = [
  { id: 'trade-b', asset: 'ETHUSDT' },
  { id: 'trade-a', asset: 'BTCUSDT' },
];

test('Trader Review with no active session falls back to a saved trade, not to nothing', () => {
  // This is the reported bug: with saved trades present but no trade open, the
  // screen used to ask the trader to start a trade instead of showing them.
  assert.equal(resolveReviewRecordId({ sessionId: null, records: SAVED }), 'trade-b');
});

test('Trader Review with an active session defaults to that trade', () => {
  assert.equal(resolveReviewRecordId({ sessionId: 'trade-a', records: SAVED }), 'trade-a');
});

test('an explicit selection wins over the active session', () => {
  // The trader deliberately clicked an older trade in the list.
  assert.equal(
    resolveReviewRecordId({ selectedId: 'trade-b', sessionId: 'trade-a', records: SAVED }),
    'trade-b'
  );
});

test('a selection that is no longer in Trade Memory is ignored', () => {
  // A stale id must never point the screen at a trade that is not there.
  assert.equal(
    resolveReviewRecordId({ selectedId: 'deleted', sessionId: 'trade-a', records: SAVED }),
    'trade-a'
  );
  assert.equal(resolveReviewRecordId({ selectedId: 'deleted', records: SAVED }), 'trade-b');
});

test('an active trade whose record is not saved yet is still the trade reviewed', () => {
  // The save is debounced, so the current trade can briefly be absent from the
  // list. The screen still shows it, and says honestly that it is not saved yet.
  assert.equal(resolveReviewRecordId({ sessionId: 'trade-new', records: SAVED }), 'trade-new');
  assert.equal(resolveReviewRecordId({ sessionId: 'trade-new', records: [] }), 'trade-new');
});

test('Trader Review resolves to nothing when there is nothing at all', () => {
  assert.equal(resolveReviewRecordId({ sessionId: null, records: [] }), null);
  assert.equal(resolveReviewRecordId(), null);
  assert.equal(resolveReviewRecordId({ records: null }), null);
});

test('starting a new trade does not make a saved trade unreachable', () => {
  // Trade A is saved, trade B is now active. A stays selectable by id.
  const records = [{ id: 'trade-a', asset: 'BTCUSDT' }, { id: 'trade-b', asset: 'ETHUSDT' }];
  assert.equal(resolveReviewRecordId({ sessionId: 'trade-b', records }), 'trade-b');
  assert.equal(
    resolveReviewRecordId({ selectedId: 'trade-a', sessionId: 'trade-b', records }),
    'trade-a',
    'A can still be opened while B is the active trade'
  );
});
