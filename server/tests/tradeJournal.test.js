/**
 * Trade Memory journal (Phase 12) — persistence + retrieval tests.
 *
 * These tests assert the product boundary of Phase 12: Trade Memory REMEMBERS a
 * completed trade and reads it back. It never analyses, never scores, never
 * fabricates an order, a fill or a P&L, and never rewrites what the trader wrote.
 *
 * Every test writes to its own temporary file — nothing touches the real journal
 * and no test depends on another test's file.
 *
 * The 14 scenarios from the Phase 12 spec are covered by the named tests below,
 * followed by the honesty guards and the route-level contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';

import {
  createJournalStore,
  normalizeRecord,
  normalizeSessionId,
  newSessionId,
  summarizeRecord,
  summarizeInvestigation,
  deriveUnavailable,
  stateOf,
  JOURNAL_STATE,
  JOURNAL_VERSION,
  PNL_NOTE,
} from '../services/tradeJournal.js';
import journalRouter from '../routes/tradeJournal.js';

// --- helpers ----------------------------------------------------------------

/** A fresh, empty journal file path in its own temp directory. */
function tempJournalFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-journal-'));
  return path.join(dir, 'trade-journal.json');
}

/** A completed trade: idea -> investigation -> decision -> paper order -> notes. */
function completedSources(overrides = {}) {
  return {
    id: 'sess-A',
    idea: {
      asset: 'rNVDA',
      direction: 'bullish',
      thesis: 'NVDA should move higher after earnings because results beat expectations.',
      timeframe: 'swing',
      entryPrice: 100,
      invalidationPrice: 95,
      riskAmount: 50,
      confidence: 7,
      existingPosition: 'none',
    },
    decision: {
      status: 'recorded',
      decision: 'TAKE',
      decisionLabel: 'TAKE',
      reason: 'Risk/reward is acceptable and the structure is clean.',
      timestamp: '2026-09-19T18:00:00.000Z',
    },
    execution: {
      status: 'submitted',
      statusLabel: 'PAPER ORDER SUBMITTED',
      statusDetail: 'Submitted to Bitget Demo.',
      result: {
        orderId: 'DEMO-ORDER-123',
        symbol: 'NVDAUSDT',
        side: 'buy',
        quantity: 10,
        price: 100,
        orderType: 'limit',
        submittedAt: '2026-09-19T18:05:00.000Z',
        environment: 'demo',
      },
    },
    review: {
      status: 'ready',
      statusLabel: 'REVIEW READY',
      statusDetail: 'The trade review is assembled from your verified records.',
      plan: {
        entryPrice: 100,
        invalidationPrice: 95,
        riskBudget: 50,
        priceRiskPerUnit: 5,
        positionSize: 10,
        definedRisk: 50,
      },
      executionRecord: {
        executed: true,
        status: 'submitted',
        detail: 'A paper order was submitted to Bitget Demo (order DEMO-ORDER-123).',
      },
      outcome: {
        status: 'submitted',
        executed: true,
        fillNote: 'Order submitted; fill outcome not available.',
        pnl: null,
        pnlNote: PNL_NOTE,
      },
      knownBefore: {
        finalReport: { available: true, summary: 'Report assembled.' },
        marketContext: { available: true, summary: 'price 100, +2% (24h), trend up' },
        eventsCatalysts: { available: true, summary: '1 event recorded.' },
        devilsAdvocate: { available: true, summary: 'Evidence strength recorded as moderate.' },
        historicalStressTest: { available: true, summary: 'Historical stress test status: matched.' },
      },
    },
    notes: 'Waited too long to enter — next time take the first pullback.',
    ...overrides,
  };
}

/** Walks every object key in a value. */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

// --- S1: creating a trade memory record --------------------------------------

test('S1 — creating a trade memory record stores the trade and writes it to disk', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const result = store.upsert(completedSources(), new Date('2026-09-19T19:00:00.000Z'));

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.problem, null);

  const record = result.record;
  assert.equal(record.id, 'sess-A');
  assert.equal(record.createdAt, '2026-09-19T19:00:00.000Z');
  assert.equal(record.updatedAt, '2026-09-19T19:00:00.000Z');

  // The trade context, carried through — the thesis is the trader's own words.
  assert.equal(record.trade.asset, 'RNVDA');
  assert.equal(record.trade.direction, 'bullish');
  assert.equal(record.trade.timeframe, 'swing');
  assert.equal(record.trade.entryPrice, 100);
  assert.equal(record.trade.invalidationPrice, 95);
  assert.equal(record.trade.riskAmount, 50);
  assert.equal(record.trade.confidence, 7);
  assert.equal(record.trade.existingPosition, 'none');
  assert.equal(record.trade.thesis, completedSources().idea.thesis);

  // The investigation state and the report state are remembered, not re-run.
  assert.equal(record.investigation.status, 'complete');
  assert.equal(record.investigation.stages.research, 'available');
  assert.equal(record.investigation.stages.attack, 'available');
  assert.equal(record.investigation.stages.history, 'available');
  assert.equal(record.investigation.stages.plan, 'available');
  assert.equal(record.investigation.stages.report, 'available');

  // It really is on disk, in the documented envelope.
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.version, JOURNAL_VERSION);
  assert.equal(raw.records.length, 1);
  assert.equal(raw.records[0].id, 'sess-A');
});

test('S1b — saving the same session twice updates it instead of duplicating it', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });

  const first = store.upsert(completedSources(), new Date('2026-09-19T19:00:00.000Z'));
  const second = store.upsert(
    completedSources({ notes: 'Updated note.' }),
    new Date('2026-09-19T19:30:00.000Z')
  );

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.record.createdAt, '2026-09-19T19:00:00.000Z', 'createdAt is preserved');
  assert.equal(second.record.updatedAt, '2026-09-19T19:30:00.000Z');
  assert.equal(second.record.notes, 'Updated note.');

  const list = store.list();
  assert.equal(list.summaries.length, 1);
});

// --- S2: retrieving saved trades ---------------------------------------------

test('S2 — saved trades can be retrieved as a list, newest first', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });

  store.upsert(
    completedSources({ id: 'sess-old', idea: { ...completedSources().idea, asset: 'rAAPL' } }),
    new Date('2026-09-18T10:00:00.000Z')
  );
  store.upsert(completedSources({ id: 'sess-new' }), new Date('2026-09-19T10:00:00.000Z'));

  const list = store.list();
  assert.equal(list.ok, true);
  assert.equal(list.problem, null);
  assert.equal(list.summaries.length, 2);

  assert.equal(list.summaries[0].id, 'sess-new', 'most recently updated first');
  assert.equal(list.summaries[1].id, 'sess-old');

  // A summary is enough to identify a trade without shipping the whole record.
  const row = list.summaries[0];
  assert.equal(row.asset, 'RNVDA');
  assert.equal(row.direction, 'bullish');
  assert.equal(row.decision, 'TAKE');
  assert.equal(row.decisionLabel, 'TAKE');
  assert.equal(row.decidedAt, '2026-09-19T18:00:00.000Z');
  assert.equal(row.state, JOURNAL_STATE.EXECUTED);
  assert.equal(row.stateLabel, 'PAPER ORDER SUBMITTED');
  assert.equal(row.executionStatus, 'submitted');
  assert.equal(row.reviewStatus, 'ready');
  assert.equal(row.hasNotes, true);
  assert.match(row.thesisPreview, /NVDA should move higher/);
  assert.equal(row.unavailableCount > 0, true, 'the honest gaps are counted');

  // Summaries carry no analysis and no verdict.
  assert.equal('pnl' in row, false);
  assert.equal('score' in row, false);
});

// --- S3: persistence after a reload / restart --------------------------------

test('S3 — a saved trade survives a frontend reload and a server restart', () => {
  const file = tempJournalFile();

  // Save through one store instance...
  createJournalStore({ filePath: file }).upsert(completedSources(), new Date('2026-09-19T19:00:00.000Z'));

  // ...then read it back through a completely NEW instance. This is exactly what
  // happens after a page reload or a frontend restart: nothing is carried over
  // in memory, the file is the only thing that survives.
  const restarted = createJournalStore({ filePath: file });

  const list = restarted.list();
  assert.equal(list.summaries.length, 1);

  const found = restarted.get('sess-A');
  assert.equal(found.ok, true);
  assert.equal(found.record.id, 'sess-A');
  assert.equal(found.record.trade.asset, 'RNVDA');
  assert.equal(found.record.decision.decision, 'TAKE');
  assert.equal(found.record.execution.orderId, 'DEMO-ORDER-123');
  assert.equal(found.record.notes, completedSources().notes);
});

// --- S4: opening a saved trade -----------------------------------------------

test('S4 — opening a saved trade returns it in full, and an unknown id is not an error', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });
  store.upsert(completedSources());

  const opened = store.get('sess-A');
  assert.equal(opened.ok, true);
  assert.equal(opened.record.trade.thesis, completedSources().idea.thesis);
  assert.equal(opened.record.review.statusLabel, 'REVIEW READY');
  assert.deepEqual(opened.record.review.plan, completedSources().review.plan);

  const missing = store.get('sess-does-not-exist');
  assert.equal(missing.ok, true, 'a missing record is a real answer, not a failure');
  assert.equal(missing.record, null);
});

// --- S5: decision persistence ------------------------------------------------

test('S5 — the recorded decision and its timestamp persist, and can be changed', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources());
  assert.equal(store.get('sess-A').record.decision.status, 'recorded');
  assert.equal(store.get('sess-A').record.decision.decision, 'TAKE');
  assert.equal(store.get('sess-A').record.decision.timestamp, '2026-09-19T18:00:00.000Z');

  // The trader changes their mind. The new decision replaces the old one.
  store.upsert(
    completedSources({
      decision: {
        status: 'recorded',
        decision: 'WAIT',
        reason: 'I want the earnings print first.',
        timestamp: '2026-09-19T20:00:00.000Z',
      },
      execution: null,
    })
  );

  const after = createJournalStore({ filePath: file }).get('sess-A').record;
  assert.equal(after.decision.decision, 'WAIT');
  assert.equal(after.decision.timestamp, '2026-09-19T20:00:00.000Z');
  assert.equal(after.decision.reason, 'I want the earnings print first.');
  // The old execution belonged to the old decision and is gone with it.
  assert.equal(after.execution.status, 'not-recorded');
  assert.equal(after.execution.orderId, null);

  // A trade with no decision at all stays honestly undecided.
  const undecided = store.upsert({
    id: 'sess-undecided',
    idea: completedSources().idea,
    decision: { status: 'required', decision: null, reason: null, timestamp: null },
  });
  assert.equal(undecided.record.decision.status, 'required');
  assert.equal(undecided.record.decision.decision, null);
  assert.equal(stateOf(undecided.record), JOURNAL_STATE.NO_DECISION);
});

// --- S6: decision reason persistence -----------------------------------------

test('S6 — the decision reason persists verbatim, exactly as the trader wrote it', () => {
  const reason =
    'Risk/reward is acceptable.\n\n  I am sizing small because the catalyst is binary.  ';
  const store = createJournalStore({ filePath: tempJournalFile() });

  store.upsert(completedSources({ decision: { ...completedSources().decision, reason } }));

  const record = store.get('sess-A').record;
  assert.equal(record.decision.reason, reason, 'not trimmed, not reworded, not summarised');

  // And it is still exact after a reload.
  assert.equal(store.list().records[0].decision.reason, reason);
});

// --- S7: execution state persistence -----------------------------------------

test('S7 — the paper-execution state persists, with the venue order only when one really exists', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });

  // (a) a submitted order carries the venue's own result
  store.upsert(completedSources());
  const submitted = store.get('sess-A').record.execution;
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.statusLabel, 'PAPER ORDER SUBMITTED');
  assert.equal(submitted.orderId, 'DEMO-ORDER-123');
  assert.equal(submitted.order.symbol, 'NVDAUSDT');
  assert.equal(submitted.order.quantity, 10);
  assert.equal(submitted.order.price, 100);
  assert.equal(submitted.order.environment, 'demo');
  assert.equal(submitted.submittedAt, '2026-09-19T18:05:00.000Z');
  // A submission is not a fill.
  assert.equal(submitted.filled, null);
  assert.equal(submitted.fillNote, 'Order submitted; fill outcome not available.');

  // (b) ready-but-not-submitted: the intended order is kept, clearly unsubmitted,
  // and there is no order id anywhere.
  store.upsert({
    id: 'sess-ready',
    idea: completedSources().idea,
    decision: completedSources().decision,
    execution: {
      status: 'ready',
      statusLabel: 'READY FOR PAPER EXECUTION',
      order: { symbol: 'NVDAUSDT', side: 'buy', quantity: 10, price: 100, orderType: 'limit' },
    },
  });
  const ready = store.get('sess-ready').record.execution;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.orderId, null, 'nothing was submitted, so there is no order id');
  assert.equal(ready.order, null, 'no real order exists');
  assert.equal(ready.intendedOrder.submitted, false);
  assert.equal(ready.intendedOrder.symbol, 'NVDAUSDT');

  // (c) locked: no decision recorded, so execution was never unlocked
  store.upsert({
    id: 'sess-locked',
    idea: completedSources().idea,
    decision: { status: 'recorded', decision: 'SKIP', reason: 'Not my setup.', timestamp: '2026-09-19T18:00:00.000Z' },
    execution: { status: 'locked', statusDetail: 'A recorded TAKE is required.' },
  });
  const locked = store.get('sess-locked').record.execution;
  assert.equal(locked.status, 'locked');
  assert.equal(locked.orderId, null);
  assert.equal(stateOf(store.get('sess-locked').record), JOURNAL_STATE.DECIDED);
});

// --- S8: review notes persistence --------------------------------------------

test('S8 — the trader’s review notes persist, and can be cleared', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const notes = 'Should have waited for the retest.\n\nNext time: half size at first touch.';
  store.upsert(completedSources({ notes }));
  assert.equal(store.get('sess-A').record.notes, notes);

  // Still there after a reload.
  assert.equal(createJournalStore({ filePath: file }).get('sess-A').record.notes, notes);

  // Clearing the notes really clears them — it does not fall back to the old text.
  store.upsert(completedSources({ notes: '' }));
  assert.equal(store.get('sess-A').record.notes, '');
  assert.equal(store.list().summaries[0].hasNotes, false);
});

// --- S9: unavailable execution persistence -----------------------------------

test('S9 — an unavailable execution is remembered as unavailable, never as an order', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(
    completedSources({
      execution: {
        status: 'unavailable',
        statusLabel: 'PAPER EXECUTION UNAVAILABLE',
        statusDetail: 'Bitget Demo credentials were not configured.',
      },
    })
  );

  const record = createJournalStore({ filePath: file }).get('sess-A').record;
  assert.equal(record.execution.status, 'unavailable');
  assert.equal(record.execution.statusLabel, 'PAPER EXECUTION UNAVAILABLE');
  assert.equal(record.execution.statusDetail, 'Bitget Demo credentials were not configured.');
  assert.equal(record.execution.orderId, null);
  assert.equal(record.execution.order, null);
  assert.equal(record.execution.filled, null);

  const gaps = record.unavailable.join(' | ');
  assert.match(gaps, /Paper execution: unavailable/);
  assert.match(gaps, /no order ID and no fill/);

  // And a trade saved with no execution record at all says exactly that.
  store.upsert({ id: 'sess-none', idea: completedSources().idea, decision: completedSources().decision });
  const none = store.get('sess-none').record;
  assert.equal(none.execution.status, 'not-recorded');
  assert.equal(none.execution.orderId, null);
  assert.match(none.unavailable.join(' | '), /no execution record was saved/);
});

// --- S10: missing P&L stays unavailable --------------------------------------

test('S10 — profit/loss and fill stay unavailable, even if a client sends values', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  // A hostile / buggy client tries to write a P&L, a fill and a score.
  store.upsert(
    completedSources({
      execution: {
        ...completedSources().execution,
        filled: true,
        pnl: 1234.56,
        profit: 1234.56,
        score: 9,
      },
      review: {
        ...completedSources().review,
        outcome: { ...completedSources().review.outcome, pnl: 1234.56 },
        score: 9,
      },
    })
  );

  const record = createJournalStore({ filePath: file }).get('sess-A').record;
  assert.equal(record.execution.pnl, null);
  assert.equal(record.execution.filled, null);
  assert.equal(record.review.outcome.pnl, null);
  assert.equal(record.review.outcome.pnlNote, PNL_NOTE);
  assert.equal(record.execution.pnlNote, PNL_NOTE);
  assert.equal('score' in record.execution, false);
  assert.equal('score' in record.review, false);

  // The raw file does not contain the fabricated figures either.
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('1234.56'), false, 'a fabricated P&L is never written to disk');

  assert.match(record.unavailable.join(' | '), /never calculates P&L/);
});

test('S10b — no record ever exposes a score, rating or recommendation field', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });
  const record = store.upsert(completedSources()).record;

  const forbidden = [
    'score',
    'rating',
    'grade',
    'winRate',
    'expectancy',
    'recommendation',
    'prediction',
    'signal',
    'expectedReturn',
    'profit',
    'loss',
    'performance',
    'verdict',
  ];

  const keys = allKeys(record);
  for (const key of forbidden) {
    assert.equal(keys.has(key), false, `the record must not carry a "${key}" field`);
  }
});

// --- S11: multiple trades remain isolated ------------------------------------

test('S11 — two saved trades stay completely isolated from each other', () => {
  const store = createJournalStore({ filePath: tempJournalFile() });

  store.upsert(
    completedSources({
      id: 'trade-A',
      idea: { ...completedSources().idea, asset: 'rNVDA', thesis: 'ALPHA THESIS — NVDA breaks out.' },
      decision: { ...completedSources().decision, decision: 'TAKE', reason: 'ALPHA REASON' },
      notes: 'ALPHA NOTE',
    }),
    new Date('2026-09-19T10:00:00.000Z')
  );

  store.upsert(
    {
      id: 'trade-B',
      idea: {
        ...completedSources().idea,
        asset: 'rAAPL',
        direction: 'bearish',
        thesis: 'BRAVO THESIS — AAPL rolls over.',
      },
      decision: {
        status: 'recorded',
        decision: 'SKIP',
        reason: 'BRAVO REASON',
        timestamp: '2026-09-19T11:00:00.000Z',
      },
      execution: null,
      review: null,
      notes: 'BRAVO NOTE',
    },
    new Date('2026-09-19T11:00:00.000Z')
  );

  const a = store.get('trade-A').record;
  const b = store.get('trade-B').record;

  assert.equal(a.trade.asset, 'RNVDA');
  assert.equal(a.trade.thesis, 'ALPHA THESIS — NVDA breaks out.');
  assert.equal(a.decision.decision, 'TAKE');
  assert.equal(a.decision.reason, 'ALPHA REASON');
  assert.equal(a.notes, 'ALPHA NOTE');
  assert.equal(a.execution.orderId, 'DEMO-ORDER-123');

  assert.equal(b.trade.asset, 'RAAPL');
  assert.equal(b.trade.thesis, 'BRAVO THESIS — AAPL rolls over.');
  assert.equal(b.decision.decision, 'SKIP');
  assert.equal(b.decision.reason, 'BRAVO REASON');
  assert.equal(b.notes, 'BRAVO NOTE');

  // No leakage in either direction.
  const bJson = JSON.stringify(b);
  assert.equal(bJson.includes('ALPHA'), false);
  assert.equal(bJson.includes('RNVDA'), false);
  assert.equal(b.execution.orderId, null);
  assert.equal(b.execution.status, 'not-recorded');
  assert.equal(b.review, null);

  const aJson = JSON.stringify(a);
  assert.equal(aJson.includes('BRAVO'), false);
  assert.equal(aJson.includes('RAAPL'), false);
});

// --- S12: old trades stay intact when a new one is created -------------------

test('S12 — creating a new trade leaves the previous trades byte-for-byte intact', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources({ id: 'trade-A' }), new Date('2026-09-19T10:00:00.000Z'));
  const before = store.get('trade-A').record;

  store.upsert(
    {
      id: 'trade-B',
      idea: { ...completedSources().idea, asset: 'rAAPL', thesis: 'BRAVO THESIS — AAPL rolls over.' },
      decision: { status: 'recorded', decision: 'SKIP', reason: 'BRAVO REASON', timestamp: '2026-09-19T11:00:00.000Z' },
      notes: 'BRAVO NOTE',
    },
    new Date('2026-09-19T11:00:00.000Z')
  );

  const after = createJournalStore({ filePath: file }).get('trade-A').record;
  assert.deepEqual(after, before, 'trade A is untouched by trade B');

  const list = store.list();
  assert.equal(list.summaries.length, 2);
  assert.equal(list.summaries.map((s) => s.id).includes('trade-A'), true);
});

// --- S13: empty journal state ------------------------------------------------

test('S13 — an empty journal is an honest empty state, not an error', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const list = store.list();
  assert.equal(list.ok, true);
  assert.equal(list.problem, null);
  assert.deepEqual(list.summaries, []);
  assert.deepEqual(list.records, []);

  assert.equal(store.get('anything').record, null);
  assert.equal(fs.existsSync(file), false, 'reading an empty journal creates no file');

  const summaries = list.summaries.map(summarizeRecord).filter(Boolean);
  assert.deepEqual(summaries, []);
});

// --- S14: malformed / missing records handled safely -------------------------

test('S14 — a corrupt journal file is reported honestly and never crashes a read', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not json', 'utf8');

  const store = createJournalStore({ filePath: file });
  const list = store.list();

  assert.equal(list.ok, false);
  assert.match(list.problem, /not valid JSON/);
  assert.deepEqual(list.summaries, [], 'no invented records');

  const got = store.get('sess-A');
  assert.equal(got.ok, false);
  assert.match(got.problem, /not valid JSON/);
  assert.equal(got.record, null);

  // A save against a corrupt file reports the problem and does NOT destroy it.
  const saved = store.upsert(completedSources());
  assert.equal(saved.ok, false);
  assert.match(saved.problem, /not valid JSON/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ this is not json', 'the unreadable file is left alone');
});

test('S14b — a journal file with the wrong shape is reported, not guessed at', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ hello: 'world' }), 'utf8');

  const list = createJournalStore({ filePath: file }).list();
  assert.equal(list.ok, false);
  assert.match(list.problem, /does not contain a records list/);
  assert.deepEqual(list.summaries, []);
});

test('S14c — malformed entries inside the journal are skipped, valid ones survive', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const good = normalizeRecord(completedSources(), new Date('2026-09-19T19:00:00.000Z'));

  fs.writeFileSync(
    file,
    JSON.stringify({
      version: JOURNAL_VERSION,
      records: [
        null,
        42,
        'a string',
        {},
        { id: '' },
        { id: '   ' },
        { id: 'x'.repeat(200) },
        { id: 'not a valid id!' },
        { id: { nested: true } },
        good,
      ],
    }),
    'utf8'
  );

  const list = createJournalStore({ filePath: file }).list();
  assert.equal(list.ok, true);
  assert.equal(list.summaries.length, 1, 'only the valid record is returned');
  assert.equal(list.summaries[0].id, 'sess-A');

  const read = createJournalStore({ filePath: file }).read();
  assert.equal(read.skipped, 9, 'the malformed entries are counted, not repaired');
});

test('S14d — a tampered stored record cannot smuggle in an order, a fill or a P&L', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  fs.writeFileSync(
    file,
    JSON.stringify({
      version: JOURNAL_VERSION,
      records: [
        {
          id: 'tampered',
          createdAt: '2026-09-19T10:00:00.000Z',
          updatedAt: '2026-09-19T10:00:00.000Z',
          trade: { asset: 'rNVDA', thesis: 'Hand edited.' },
          decision: { status: 'recorded', decision: 'TAKE', reason: 'Hand edited.', timestamp: '2026-09-19T10:00:00.000Z' },
          // Claims a submitted order with a fill and a profit — but carries no
          // venue result at all, so none of it can be true.
          execution: {
            status: 'submitted',
            orderId: 'INVENTED-ORDER',
            filled: true,
            pnl: 9999,
            result: null,
          },
          review: { status: 'ready', outcome: { pnl: 9999 } },
          notes: 'Hand edited.',
        },
      ],
    }),
    'utf8'
  );

  const record = createJournalStore({ filePath: file }).get('tampered').record;

  assert.equal(record.execution.orderId, null, 'no venue result means no order id');
  assert.equal(record.execution.filled, null);
  assert.equal(record.execution.pnl, null);
  assert.equal(record.review.outcome.pnl, null);
  assert.equal(JSON.stringify(record).includes('INVENTED-ORDER'), false);
  assert.equal(JSON.stringify(record).includes('9999'), false);
});

test('S14e — record normalisation rejects anything without a usable session id', () => {
  assert.equal(normalizeSessionId(''), null);
  assert.equal(normalizeSessionId('   '), null);
  assert.equal(normalizeSessionId(null), null);
  assert.equal(normalizeSessionId(undefined), null);
  assert.equal(normalizeSessionId(42), null);
  assert.equal(normalizeSessionId('x'.repeat(65)), null);
  assert.equal(normalizeSessionId('bad id!'), null);
  assert.equal(normalizeSessionId('good-id_1:2.3'), 'good-id_1:2.3');

  assert.equal(normalizeRecord({}), null);
  assert.equal(normalizeRecord(null), null);
  assert.equal(normalizeRecord({ idea: { asset: 'rNVDA' } }), null, 'no id, no record');

  const generated = newSessionId();
  assert.equal(normalizeSessionId(generated), generated);
});

// --- the investigation state is read, never re-derived ------------------------

test('S-investigation — the recorded investigation state is read from the review, not re-run', () => {
  const partial = summarizeInvestigation({
    plan: null,
    knownBefore: {
      finalReport: { available: true },
      marketContext: { available: false },
      eventsCatalysts: { available: false },
      devilsAdvocate: { available: true },
      historicalStressTest: { available: true },
    },
  });

  assert.equal(partial.status, 'partial');
  assert.equal(partial.stages.research, 'unavailable');
  assert.equal(partial.stages.attack, 'available');
  assert.equal(partial.stages.history, 'available');
  assert.equal(partial.stages.report, 'available');
  assert.equal(partial.stages.plan, 'unavailable', 'no plan block means the risk/structure leg is missing');

  const none = summarizeInvestigation(null);
  assert.equal(none.status, 'not-recorded');
  assert.deepEqual(Object.values(none.stages), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown']);

  const all = summarizeInvestigation(completedSources().review);
  assert.equal(all.status, 'complete');
});

test('S-unavailable — the gaps are listed explicitly and honestly', () => {
  const record = normalizeRecord(
    {
      id: 'sess-gaps',
      idea: completedSources().idea,
      decision: { status: 'required' },
      execution: null,
      review: null,
    },
    new Date('2026-09-19T19:00:00.000Z')
  );

  const gaps = record.unavailable;
  assert.equal(Array.isArray(gaps), true);
  assert.equal(gaps.length > 0, true);
  assert.equal(gaps.some((g) => /Human decision: not recorded/.test(g)), true);
  assert.equal(gaps.some((g) => /Trade review: not recorded/.test(g)), true);
  assert.equal(gaps.some((g) => /never calculates P&L/.test(g)), true);

  // deriveUnavailable is a pure function of the record.
  assert.deepEqual(deriveUnavailable(record), gaps);
});

// --- route-level contract -----------------------------------------------------

test('R1 — POST /api/journal saves, updates, and rejects a missing session id', async (t) => {
  const file = tempJournalFile();
  const previous = process.env.TRADEGUARD_JOURNAL_FILE;
  process.env.TRADEGUARD_JOURNAL_FILE = file;

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', journalRouter);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TRADEGUARD_JOURNAL_FILE;
    else process.env.TRADEGUARD_JOURNAL_FILE = previous;
  });

  // (a) create
  const created = await fetch(`${base}/api/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(completedSources()),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.status, 'saved');
  assert.equal(createdBody.created, true);
  assert.equal(createdBody.record.trade.asset, 'RNVDA');
  assert.equal(createdBody.record.execution.pnl, null);
  assert.equal(createdBody.storage.kind, 'local-json-file');
  assert.equal(createdBody.storage.cloud, false);

  // (b) update the same session
  const updated = await fetch(`${base}/api/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(completedSources({ notes: 'Second pass.' })),
  });
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  assert.equal(updatedBody.created, false);
  assert.equal(updatedBody.record.notes, 'Second pass.');

  // (c) no id -> 400, and nothing is written
  const invalid = await fetch(`${base}/api/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea: completedSources().idea }),
  });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.status, 'invalid');
  assert.equal(Boolean(invalidBody.errors.id), true);

  // (d) list
  const list = await fetch(`${base}/api/journal`);
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.status, 'ok');
  assert.equal(listBody.count, 1);
  assert.equal(listBody.records[0].id, 'sess-A');

  // (e) read one
  const one = await fetch(`${base}/api/journal/sess-A`);
  assert.equal(one.status, 200);
  const oneBody = await one.json();
  assert.equal(oneBody.record.decision.reason, completedSources().decision.reason);

  // (f) unknown id
  const unknown = await fetch(`${base}/api/journal/nope`);
  assert.equal(unknown.status, 404);
  const unknownBody = await unknown.json();
  assert.equal(unknownBody.status, 'not-found');
  assert.equal(unknownBody.record, null);
});

test('R2 — GET /api/journal reports a corrupt file honestly instead of an empty list', async (t) => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not json at all', 'utf8');

  const previous = process.env.TRADEGUARD_JOURNAL_FILE;
  process.env.TRADEGUARD_JOURNAL_FILE = file;

  const app = express();
  app.use(express.json());
  app.use('/api', journalRouter);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TRADEGUARD_JOURNAL_FILE;
    else process.env.TRADEGUARD_JOURNAL_FILE = previous;
  });

  const list = await fetch(`${base}/api/journal`);
  assert.equal(list.status, 200);
  const body = await list.json();
  assert.equal(body.status, 'unavailable');
  assert.match(body.message, /not valid JSON/);
  assert.deepEqual(body.records, []);

  const one = await fetch(`${base}/api/journal/anything`);
  assert.equal(one.status, 200);
  assert.equal((await one.json()).status, 'unavailable');
});

test('R3 — GET /api/journal on a fresh install is an honest empty state', async (t) => {
  const file = tempJournalFile();

  const previous = process.env.TRADEGUARD_JOURNAL_FILE;
  process.env.TRADEGUARD_JOURNAL_FILE = file;

  const app = express();
  app.use(express.json());
  app.use('/api', journalRouter);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TRADEGUARD_JOURNAL_FILE;
    else process.env.TRADEGUARD_JOURNAL_FILE = previous;
  });

  const body = await (await fetch(`${base}/api/journal`)).json();
  assert.equal(body.status, 'ok');
  assert.equal(body.count, 0);
  assert.match(body.message, /No trades have been saved/);
});

// ============================================================================
// Phase 13 — the trader's own reflection (Trader Review)
//
// Additive to the Phase 12 journal: one optional group on the stored record.
// These tests cover the Phase 13 spec — the reflection persists, can be edited,
// can be cleared, survives a save that does not carry it, stays isolated between
// trades, and reads back honestly on a record written before the field existed.
// ============================================================================

/** A Phase-12-era record, written before `traderReview` existed. */
function legacyRecord() {
  const src = completedSources({ id: 'sess-legacy' });
  const record = normalizeRecord(src, new Date('2026-09-19T18:10:00.000Z'));
  delete record.traderReview; // exactly what the Phase 12 build wrote
  delete record.unavailable;
  return record;
}

test('T1 — a reflection written in Trader Review is stored and read back verbatim', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const saved = store.upsert(
    completedSources({
      traderReview: {
        notes: 'I sized this correctly but entered before the retest completed.\nSecond line stays.',
      },
    }),
    new Date('2026-09-20T10:00:00.000Z')
  );

  assert.equal(saved.ok, true);
  assert.equal(saved.record.traderReview.status, 'recorded');
  assert.equal(saved.record.traderReview.statusLabel, 'REFLECTION RECORDED');
  assert.equal(
    saved.record.traderReview.notes,
    'I sized this correctly but entered before the retest completed.\nSecond line stays.',
    'the reflection is stored exactly as written — newlines and all'
  );
  assert.equal(saved.record.traderReview.recordedAt, '2026-09-20T10:00:00.000Z');

  // A fresh store (a page reload / a server restart) reads the same thing back.
  const reread = createJournalStore({ filePath: file }).get('sess-A').record;
  assert.equal(reread.traderReview.notes, saved.record.traderReview.notes);
  assert.equal(reread.traderReview.recordedAt, '2026-09-20T10:00:00.000Z');
});

test('T2 — the reflection can be edited, and when it was first recorded is preserved', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(
    completedSources({ traderReview: { notes: 'First version.' } }),
    new Date('2026-09-20T10:00:00.000Z')
  );

  const edited = store.upsert(
    completedSources({ traderReview: { notes: 'Second, better version.' } }),
    new Date('2026-09-20T11:30:00.000Z')
  );

  assert.equal(edited.record.traderReview.notes, 'Second, better version.');
  assert.equal(
    edited.record.traderReview.recordedAt,
    '2026-09-20T10:00:00.000Z',
    'editing a reflection must not re-stamp when it was first recorded'
  );
  assert.equal(edited.record.updatedAt, '2026-09-20T11:30:00.000Z', 'the record itself was updated');
});

test('T3 — a reflection can be cleared, and clearing it is recorded as not-recorded', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources({ traderReview: { notes: 'Something.' } }));
  const cleared = store.upsert(completedSources({ traderReview: { notes: '' } }));

  assert.equal(cleared.record.traderReview.status, 'not-recorded');
  assert.equal(cleared.record.traderReview.notes, null);
  assert.equal(cleared.record.traderReview.recordedAt, null);

  // Whitespace is not a reflection either.
  const blank = store.upsert(completedSources({ traderReview: { notes: '   \n  ' } }));
  assert.equal(blank.record.traderReview.status, 'not-recorded');
  assert.equal(blank.record.traderReview.notes, null);
});

test('T4 — a save that does not carry a reflection cannot erase the stored one', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources({ traderReview: { notes: 'Do not lose me.' } }));

  // An ordinary later save — a decision change, a notes edit — carries no
  // traderReview at all. It must leave the reflection alone.
  const src = completedSources({ traderReview: null });
  const after = store.upsert(src);

  assert.equal(after.record.traderReview.status, 'recorded');
  assert.equal(after.record.traderReview.notes, 'Do not lose me.');

  // And the route does not invent one either.
  const legacySrc = completedSources({ traderReview: undefined });
  assert.equal(
    store.upsert(legacySrc).record.traderReview.notes,
    'Do not lose me.',
    'omitting the group entirely keeps the previous reflection'
  );
});

test('T5 — a Phase 12 record with no reflection key still reads back honestly', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: JOURNAL_VERSION, records: [legacyRecord()] }), 'utf8');

  const loaded = createJournalStore({ filePath: file }).get('sess-legacy');

  assert.equal(loaded.ok, true, 'a pre-Phase-13 record is not an error');
  assert.ok(loaded.record, 'the record is still readable');
  assert.equal(loaded.record.traderReview.status, 'not-recorded');
  assert.equal(loaded.record.traderReview.notes, null);
  assert.equal(loaded.record.traderReview.recordedAt, null);
  assert.equal(loaded.record.traderReview.statusLabel, 'REFLECTION NOT RECORDED');

  // The rest of the legacy record is untouched by the new field.
  assert.equal(loaded.record.trade.asset, 'RNVDA');
  assert.equal(loaded.record.decision.decision, 'TAKE');
  assert.equal(loaded.record.notes, 'Waited too long to enter — next time take the first pullback.');
  assert.equal(loaded.record.execution.orderId, 'DEMO-ORDER-123');

  // Adding a reflection to a legacy record works without losing the old data.
  const updated = createJournalStore({ filePath: file }).upsert(
    completedSources({ id: 'sess-legacy', traderReview: { notes: 'Looking back, the entry was early.' } })
  );
  assert.equal(updated.created, false, 'it updates the existing legacy record, it does not duplicate it');
  assert.equal(updated.record.traderReview.status, 'recorded');
  assert.equal(updated.record.notes, 'Waited too long to enter — next time take the first pullback.');
});

test('T6 — the reflection is never trimmed, rewritten or summarised', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const exact = '  leading and trailing spaces are the trader’s own  ';
  const saved = store.upsert(completedSources({ traderReview: { notes: exact } }));

  assert.equal(saved.record.traderReview.notes, exact, 'stored verbatim, not trimmed');
  assert.equal(createJournalStore({ filePath: file }).get('sess-A').record.traderReview.notes, exact);
});

test('T7 — reflections stay isolated between two trades', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources({ id: 'sess-A', traderReview: { notes: 'A reflection.' } }));
  store.upsert(
    completedSources({
      id: 'sess-B',
      idea: { ...completedSources().idea, asset: 'rETH', direction: 'bearish' },
      traderReview: { notes: 'B reflection.' },
    })
  );

  const a = store.get('sess-A').record;
  const b = store.get('sess-B').record;

  assert.equal(a.traderReview.notes, 'A reflection.');
  assert.equal(b.traderReview.notes, 'B reflection.');
  assert.equal(b.trade.asset, 'RETH');
  assert.equal(a.trade.asset, 'RNVDA');

  // Editing B's reflection leaves A's byte-for-byte intact.
  const beforeA = JSON.stringify(a);
  store.upsert(
    completedSources({
      id: 'sess-B',
      idea: { ...completedSources().idea, asset: 'rETH', direction: 'bearish' },
      traderReview: { notes: 'B reflection, edited.' },
    })
  );
  assert.equal(JSON.stringify(store.get('sess-A').record), beforeA);
});

test('T8 — a malformed reflection input is handled safely, never coerced into text', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  for (const bad of [42, true, ['a'], { nested: 'x' }]) {
    const saved = store.upsert(completedSources({ traderReview: bad }));
    assert.equal(saved.ok, true, `traderReview=${JSON.stringify(bad)} must not throw`);
    assert.equal(saved.record.traderReview.status, 'not-recorded');
    assert.equal(saved.record.traderReview.notes, null);
  }

  // A string is not an object, so it is ignored rather than becoming a note.
  const asString = store.upsert(completedSources({ traderReview: 'I am not an object' }));
  assert.equal(asString.record.traderReview.status, 'not-recorded');
});

test('T9 — a reflection never grows a score, rating, grade or verdict field', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const record = store.upsert(
    completedSources({
      traderReview: {
        notes: 'A reflection.',
        // A client trying to smuggle a judgement in alongside the note.
        score: 9,
        rating: 'A+',
        grade: 'good trade',
        winRate: 0.75,
        verdict: 'SUCCESS',
        lesson: 'Be patient.',
      },
    })
  ).record;

  const keys = allKeys(record.traderReview);
  for (const banned of ['score', 'rating', 'grade', 'winRate', 'verdict', 'lesson', 'outcome']) {
    assert.equal(keys.has(banned), false, `the reflection must not carry a "${banned}" field`);
  }
  assert.deepEqual(
    Object.keys(record.traderReview).sort(),
    ['notes', 'recordedAt', 'status', 'statusLabel'],
    'the reflection group has exactly four fields'
  );
});

test('T10 — a hand-edited file cannot smuggle a judgement into the reflection', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const tampered = legacyRecord();
  tampered.traderReview = { status: 'recorded', notes: 'ok', score: 10, grade: 'excellent', verdict: 'WIN' };
  fs.writeFileSync(file, JSON.stringify({ version: JOURNAL_VERSION, records: [tampered] }), 'utf8');

  const record = createJournalStore({ filePath: file }).get('sess-legacy').record;
  const keys = allKeys(record.traderReview);

  assert.equal(keys.has('score'), false);
  assert.equal(keys.has('grade'), false);
  assert.equal(keys.has('verdict'), false);
  assert.equal(record.traderReview.notes, 'ok');
});

test('T11 — a missing reflection is named in the honest gaps, not shown as a blank', () => {
  const without = normalizeRecord(completedSources({ traderReview: null }), new Date('2026-09-20T10:00:00.000Z'));
  assert.match(
    without.unavailable.join(' | '),
    /Trader reflection: none was recorded/,
    'a reflection nobody wrote is a stated gap'
  );

  const withReflection = normalizeRecord(
    completedSources({ traderReview: { notes: 'A reflection.' } }),
    new Date('2026-09-20T10:00:00.000Z')
  );
  assert.equal(
    withReflection.unavailable.some((g) => /Trader reflection/.test(g)),
    false,
    'a recorded reflection is not reported as a gap'
  );
});

test('T12 — normalising a stored record twice returns the same record (idempotent)', () => {
  const once = normalizeRecord(
    completedSources({ traderReview: { notes: 'Stable.' } }),
    new Date('2026-09-20T10:00:00.000Z')
  );
  const twice = normalizeRecord(once, new Date('2026-09-20T12:00:00.000Z'));

  assert.deepEqual(twice.traderReview, once.traderReview);
  assert.deepEqual(twice.unavailable, once.unavailable);
});

test('T13 — the journal list reports whether a reflection was recorded', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  store.upsert(completedSources({ id: 'sess-A', traderReview: { notes: 'Reflected.' } }));
  store.upsert(completedSources({ id: 'sess-B', traderReview: null }));

  const rows = store.list().summaries;
  const a = rows.find((r) => r.id === 'sess-A');
  const b = rows.find((r) => r.id === 'sess-B');

  assert.equal(a.hasReflection, true);
  assert.ok(a.reflectionAt);
  assert.equal(b.hasReflection, false);
  assert.equal(b.reflectionAt, null);
});

test('T14 — POST /api/journal carries the reflection through and reports it in meta', async (t) => {
  const file = tempJournalFile();
  const previous = process.env.TRADEGUARD_JOURNAL_FILE;
  process.env.TRADEGUARD_JOURNAL_FILE = file;

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', journalRouter);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TRADEGUARD_JOURNAL_FILE;
    else process.env.TRADEGUARD_JOURNAL_FILE = previous;
  });

  const post = async (body) =>
    (
      await fetch(`${base}/api/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).json();

  const created = await post(
    completedSources({ traderReview: { notes: 'Written in Trader Review.' } })
  );
  assert.equal(created.status, 'saved');
  assert.equal(created.record.traderReview.notes, 'Written in Trader Review.');
  assert.equal(created.traderReview.phase, 13, 'meta reports the reflection as the Phase 13 addition');
  assert.equal(created.phase, 12, 'the journal itself is still the Phase 12 feature');
  assert.ok(created.traderReview.statuses.recorded);
  assert.match(created.traderReview.note, /never generates/i);

  // A later save with no reflection leaves it in place.
  const plain = await post(completedSources({ traderReview: null }));
  assert.equal(plain.record.traderReview.notes, 'Written in Trader Review.');

  // The read-back route returns it too.
  const one = await (await fetch(`${base}/api/journal/sess-A`)).json();
  assert.equal(one.record.traderReview.notes, 'Written in Trader Review.');

  // And the list marks it as reflected on.
  const list = await (await fetch(`${base}/api/journal`)).json();
  assert.equal(list.records[0].hasReflection, true);
});

// ---------------------------------------------------------------------------
// T15+ — looking back at an OLDER saved trade
//
// Trader Review can open any trade in Trade Memory, not only the one currently
// open, and the trader can write their reflection on it there. That write must
// carry the reflection and nothing else, so it is impossible for looking back at
// a trade to rewrite its thesis, decision, execution or review.
// ---------------------------------------------------------------------------

test('T15 — a reflection-only save changes the reflection and nothing else', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const first = store.upsert(completedSources(), new Date('2026-09-20T10:00:00.000Z'));
  assert.equal(first.ok, true);
  const before = first.record;

  // Exactly what Trader Review sends for an older trade: the id it read from
  // Trade Memory, and the reflection. No trade, no decision, no execution, no
  // review, no notes.
  const after = store.upsert(
    { id: before.id, traderReview: { notes: 'Looking back: I entered before the retest completed.' } },
    new Date('2026-09-20T12:00:00.000Z')
  );

  assert.equal(after.ok, true);
  assert.equal(after.created, false, 'an existing trade is updated, never duplicated');
  assert.equal(after.record.traderReview.notes, 'Looking back: I entered before the retest completed.');
  assert.equal(after.record.traderReview.status, 'recorded');

  // The safety property: every other group is byte-identical to what it was.
  for (const group of ['trade', 'decision', 'execution', 'review', 'notes', 'investigation']) {
    assert.deepEqual(after.record[group], before[group], `${group} must be untouched`);
  }
  assert.equal(after.record.createdAt, before.createdAt, 'the trade was not recreated');

  // `unavailable` is the one thing that legitimately changes: the missing
  // reflection was a gap, and it no longer is.
  assert.ok(
    before.unavailable.some((line) => /reflection/i.test(line)),
    'the missing reflection was listed as a gap before it was written'
  );
  assert.ok(
    !after.record.unavailable.some((line) => /reflection/i.test(line)),
    'writing the reflection closes that gap and adds no other'
  );

  // And it survives a re-read from disk.
  const reread = store.get(before.id);
  assert.equal(reread.record.traderReview.notes, 'Looking back: I entered before the retest completed.');
  assert.equal(reread.record.trade.thesis, before.trade.thesis);
});

test('T16 — a reflection-only save for a trade that is not saved creates no record', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  // A reflection with no trade behind it has nothing to attach to. It must be
  // refused rather than allowed to create an empty row in Trade Memory.
  const result = store.upsert({ id: 'sess-ghost', traderReview: { notes: 'Nowhere to go.' } }, new Date());

  assert.equal(result.ok, false);
  assert.equal(result.created, false);
  assert.equal(result.record, null);
  assert.match(result.problem, /no longer in Trade Memory/i);

  const listed = store.list();
  assert.equal(listed.ok, true);
  assert.equal(listed.records.length, 0, 'no junk row was created');
});

test('T17 — a reflection-only save cannot disturb a second trade', () => {
  const file = tempJournalFile();
  const store = createJournalStore({ filePath: file });

  const a = store.upsert(completedSources({ id: 'sess-A' }), new Date('2026-09-20T10:00:00.000Z')).record;
  const b = store.upsert(
    completedSources({
      id: 'sess-B',
      idea: { ...completedSources().idea, asset: 'rAAPL', direction: 'bearish' },
    }),
    new Date('2026-09-20T10:05:00.000Z')
  ).record;

  store.upsert({ id: 'sess-A', traderReview: { notes: 'A only.' } }, new Date('2026-09-20T11:00:00.000Z'));

  const rereadA = store.get('sess-A').record;
  const rereadB = store.get('sess-B').record;

  assert.equal(rereadA.traderReview.notes, 'A only.');
  assert.equal(rereadB.traderReview.status, 'not-recorded', "B's reflection is untouched");
  assert.deepEqual(rereadB.trade, b.trade, "B's trade is untouched");
  assert.equal(rereadB.trade.asset, 'RAAPL');
  assert.equal(JSON.stringify(rereadB).includes('A only.'), false, "A's reflection never leaks into B");
});

test('T18 — POST /api/journal with only a reflection updates only the reflection', async (t) => {
  const file = tempJournalFile();
  const previous = process.env.TRADEGUARD_JOURNAL_FILE;
  process.env.TRADEGUARD_JOURNAL_FILE = file;

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', journalRouter);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.TRADEGUARD_JOURNAL_FILE;
    else process.env.TRADEGUARD_JOURNAL_FILE = previous;
  });

  const post = async (body) =>
    (
      await fetch(`${base}/api/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).json();

  const created = await post(completedSources({ id: 'sess-A' }));
  assert.equal(created.status, 'saved');

  // The reflection-only request Trader Review sends for an older trade.
  const reflected = await post({ id: 'sess-A', traderReview: { notes: 'Written looking back.' } });
  assert.equal(reflected.status, 'saved');
  assert.equal(reflected.created, false);
  assert.equal(reflected.record.traderReview.notes, 'Written looking back.');

  // Read back: the reflection landed, everything else is as it was.
  const one = await (await fetch(`${base}/api/journal/sess-A`)).json();
  assert.equal(one.record.traderReview.notes, 'Written looking back.');
  assert.deepEqual(one.record.trade, created.record.trade);
  assert.deepEqual(one.record.decision, created.record.decision);
  assert.deepEqual(one.record.execution, created.record.execution);

  // And an unknown id is refused rather than creating an empty row.
  const ghost = await post({ id: 'sess-ghost', traderReview: { notes: 'Nowhere to go.' } });
  assert.equal(ghost.status, 'unavailable');
  assert.match(ghost.message, /no longer in Trade Memory/i);

  const list = await (await fetch(`${base}/api/journal`)).json();
  assert.equal(list.count, 1, 'the refused write created no record');
});
