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
