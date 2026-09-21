/**
 * Data isolation — one account's Trade Memory is not another's.
 *
 * THE MANDATORY SCENARIO
 * Account A creates a trade. A signs out. Account B signs in and must see an
 * EMPTY Trade Memory. A signs back in and must still see the original trade.
 *
 * WHAT THIS SUITE ADDS ON TOP OF THAT
 * The same scenario at the store level, where the property can be stated
 * directly: an id is only ever readable by the account that owns it, and reading
 * another account's id is answered EXACTLY as an unknown id is answered — same
 * status, same body — so a response can never be used to learn that someone
 * else's trade exists.
 *
 * WHY IT GOES THROUGH THE REAL ROUTES
 * `req.user.id` is the only source of ownership. A test that called the store
 * with a `userId` it chose would prove the store honours a scope, not that the
 * route derives the scope from the session. So the primary test signs in for
 * real and speaks HTTP.
 *
 * LEGACY RECORDS
 * Records written before accounts existed carry no `userId`. They are covered at
 * the end: they belong to no account, are shown to no account, and are not
 * silently adopted by whoever signs in first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createJournalStore,
  normalizeRecord,
  normalizeUserId,
  auditJournal,
} from '../services/tradeJournal.js';
import journalRouter from '../routes/tradeJournal.js';
import { createAuthTestKit, TEST_PASSWORD } from './helpers/authTestKit.js';

/** A fresh journal file path in its own temp directory. */
function tempJournalFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-isolation-'));
  return path.join(dir, 'trade-journal.json');
}

/** A minimal but complete trade for the given session id. */
function trade(id, overrides = {}) {
  return {
    id,
    idea: {
      asset: 'rNVDA',
      direction: 'bullish',
      thesis: `Thesis for ${id}.`,
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
      reason: `Reason for ${id}.`,
      timestamp: '2026-09-19T18:00:00.000Z',
    },
    notes: `Notes for ${id}.`,
    ...overrides,
  };
}

// ============================================================================
// The mandatory scenario, over HTTP
// ============================================================================

test('I1 — Account A saves a trade; Account B sees an empty Trade Memory; A still sees it', async (t) => {
  const kit = await createAuthTestKit({
    routers: [journalRouter],
    env: { TRADEGUARD_JOURNAL_FILE: tempJournalFile() },
  });
  t.after(() => kit.cleanup());

  // --- Account A creates a trade -------------------------------------------
  const a = await kit.signedInUser({ name: 'Account A', email: 'a@example.com' });
  const saved = await kit.post('/api/journal', trade('sess-A-1'), { cookie: a.cookie });
  assert.equal(saved.status, 201);
  const savedBody = await saved.json();
  assert.equal(savedBody.record.trade.asset, 'RNVDA');
  assert.equal(savedBody.record.userId, a.user.id, 'the record is attributed from the session');

  // A sees it.
  const aList = await (await kit.get('/api/journal', { cookie: a.cookie })).json();
  assert.equal(aList.count, 1);
  assert.equal(aList.records[0].id, 'sess-A-1');

  // --- A signs out ----------------------------------------------------------
  const logout = await kit.post('/api/auth/logout', {}, { cookie: a.cookie });
  assert.equal(logout.status, 200);

  // The old cookie is dead: Trade Memory is not reachable with it.
  assert.equal((await kit.get('/api/journal', { cookie: a.cookie })).status, 401);

  // --- Account B signs in ---------------------------------------------------
  const b = await kit.signedInUser({ name: 'Account B', email: 'b@example.com' });
  assert.notEqual(b.user.id, a.user.id, 'two accounts, two identities');

  const bList = await (await kit.get('/api/journal', { cookie: b.cookie })).json();
  assert.equal(bList.status, 'ok');
  assert.equal(bList.count, 0, "B's Trade Memory must be empty");
  assert.deepEqual(bList.records, []);
  assert.match(bList.message, /No trades have been saved/);

  // The isolation holds even for the exact id B should not be able to guess.
  const bReadA = await kit.get('/api/journal/sess-A-1', { cookie: b.cookie });
  assert.equal(bReadA.status, 404);
  const bReadABody = await bReadA.json();
  assert.equal(bReadABody.status, 'not-found');
  assert.equal(bReadABody.record, null);
  // The refusal must not leak a single field of A's trade.
  assert.equal(JSON.stringify(bReadABody).includes('Thesis for sess-A-1'), false);
  assert.equal(JSON.stringify(bReadABody).includes(a.user.id), false);

  // B cannot overwrite A's trade by naming its id either.
  const bWriteA = await kit.post('/api/journal', trade('sess-A-1', { notes: 'B was here.' }), {
    cookie: b.cookie,
  });
  const bWriteABody = await bWriteA.json();
  assert.notEqual(bWriteABody.status, 'saved', "B must not be able to write into A's record");

  // --- A signs back in ------------------------------------------------------
  const login = await kit.post('/api/auth/login', { email: 'a@example.com', password: TEST_PASSWORD });
  assert.equal(login.status, 200);
  const aAgain = login.headers.getSetCookie()[0].split(';')[0];

  const aListAgain = await (await kit.get('/api/journal', { cookie: aAgain })).json();
  assert.equal(aListAgain.count, 1, "A's trade survived B's session");
  assert.equal(aListAgain.records[0].id, 'sess-A-1');

  const aRead = await (await kit.get('/api/journal/sess-A-1', { cookie: aAgain })).json();
  assert.equal(aRead.record.notes, 'Notes for sess-A-1.', "A's notes are unchanged");
  assert.equal(aRead.record.trade.thesis, 'Thesis for sess-A-1.');
});

test('I2 — a trade id owned by another account cannot be read, written, or duplicated', async (t) => {
  const kit = await createAuthTestKit({
    routers: [journalRouter],
    env: { TRADEGUARD_JOURNAL_FILE: tempJournalFile() },
  });
  t.after(() => kit.cleanup());

  const a = await kit.signedInUser({ email: 'a@example.com' });
  const b = await kit.signedInUser({ email: 'b@example.com' });

  const aSave = await kit.post('/api/journal', trade('sess-shared', { notes: 'A owns this.' }), {
    cookie: a.cookie,
  });
  assert.equal(aSave.status, 201);
  assert.equal((await aSave.json()).record.userId, a.user.id);

  // Session ids are random UUIDs, so two accounts colliding on one is not a
  // scenario that happens. If it ever did, the id must stay globally
  // unambiguous rather than becoming two records that share a name — so the
  // second save is refused, and it is refused with the ordinary "not yours"
  // message rather than a "forbidden" that would confirm the id is real.
  const bSave = await kit.post('/api/journal', trade('sess-shared', { notes: 'B was here.' }), {
    cookie: b.cookie,
  });
  const bBody = await bSave.json();
  assert.equal(bBody.status, 'unavailable');
  assert.match(bBody.message, /not in your Trade Memory/i);
  assert.equal(bBody.record, null);

  // A's record is untouched, in every field.
  const aRead = await (await kit.get('/api/journal/sess-shared', { cookie: a.cookie })).json();
  assert.equal(aRead.record.notes, 'A owns this.');
  assert.equal(aRead.record.userId, a.user.id);

  // B gained nothing from the attempt.
  const bList = await (await kit.get('/api/journal', { cookie: b.cookie })).json();
  assert.equal(bList.count, 0);

  // And B can still save its own trade under its own id.
  const bOwn = await kit.post('/api/journal', trade('sess-B-1', { notes: 'B owns this.' }), {
    cookie: b.cookie,
  });
  assert.equal(bOwn.status, 201);
  assert.equal((await bOwn.json()).record.userId, b.user.id);

  const aFinal = await (await kit.get('/api/journal', { cookie: a.cookie })).json();
  assert.deepEqual(aFinal.records.map((r) => r.id), ['sess-shared'], 'A sees only A');
});

test('I3 — a client-supplied userId is ignored; the session decides', async (t) => {
  const kit = await createAuthTestKit({
    routers: [journalRouter],
    env: { TRADEGUARD_JOURNAL_FILE: tempJournalFile() },
  });
  t.after(() => kit.cleanup());

  const a = await kit.signedInUser({ email: 'a@example.com' });
  const b = await kit.signedInUser({ email: 'b@example.com' });

  // B sends A's id in the body. It must be read as noise.
  const response = await kit.post(
    '/api/journal',
    { ...trade('sess-forged'), userId: a.user.id, ownerId: a.user.id, user: a.user.id },
    { cookie: b.cookie }
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.record.userId, b.user.id, 'the owner is B, from B’s session');

  // A cannot see it.
  const aList = await (await kit.get('/api/journal', { cookie: a.cookie })).json();
  assert.equal(aList.count, 0, "a forged userId must not put a record in A's Trade Memory");
});

test('I4 — a session token from one account cannot be used to read another', async (t) => {
  const kit = await createAuthTestKit({
    routers: [journalRouter],
    env: { TRADEGUARD_JOURNAL_FILE: tempJournalFile() },
  });
  t.after(() => kit.cleanup());

  const a = await kit.signedInUser({ email: 'a@example.com' });
  await kit.post('/api/journal', trade('sess-A-1'), { cookie: a.cookie });

  // A cookie that is well-formed but belongs to nobody is refused, exactly like
  // no cookie at all.
  for (const cookie of ['tg_session=' + 'A'.repeat(43), 'tg_session=garbage', 'other=1']) {
    const response = await kit.get('/api/journal', { cookie });
    assert.equal(response.status, 401, cookie);
    assert.equal((await response.json()).status, 'unauthenticated');
  }
});

// ============================================================================
// The same property at the store level
// ============================================================================

test('I5 — the store only ever returns records it owns', () => {
  const file = tempJournalFile();

  createJournalStore({ filePath: file, userId: 'user-A' }).upsert(trade('sess-A-1'));
  createJournalStore({ filePath: file, userId: 'user-B' }).upsert(trade('sess-B-1'));

  const a = createJournalStore({ filePath: file, userId: 'user-A' });
  const b = createJournalStore({ filePath: file, userId: 'user-B' });

  assert.deepEqual(a.list().summaries.map((r) => r.id), ['sess-A-1']);
  assert.deepEqual(b.list().summaries.map((r) => r.id), ['sess-B-1']);

  assert.equal(a.get('sess-B-1').record, null, "A cannot read B's record");
  assert.equal(b.get('sess-A-1').record, null, "B cannot read A's record");
  assert.equal(a.get('sess-A-1').record.userId, 'user-A');
});

test('I6 — another account’s id is answered exactly as an unknown id is', () => {
  const file = tempJournalFile();
  createJournalStore({ filePath: file, userId: 'user-A' }).upsert(trade('sess-A-1'));

  const b = createJournalStore({ filePath: file, userId: 'user-B' });

  const someoneElses = b.get('sess-A-1');
  const doesNotExist = b.get('sess-does-not-exist');

  // Indistinguishable, so the result cannot be used to test whether an id exists.
  assert.deepEqual(
    { ok: someoneElses.ok, record: someoneElses.record },
    { ok: doesNotExist.ok, record: doesNotExist.record }
  );
  assert.equal(someoneElses.record, null);
});

test('I7 — an upsert cannot steal another account’s id', () => {
  const file = tempJournalFile();
  createJournalStore({ filePath: file, userId: 'user-A' }).upsert(
    trade('sess-A-1', { notes: 'A wrote this.' })
  );

  const b = createJournalStore({ filePath: file, userId: 'user-B' });
  const attempt = b.upsert(trade('sess-A-1', { notes: 'B tried to overwrite.' }));

  assert.equal(attempt.ok, false, 'an id owned by someone else is refused');
  assert.match(
    attempt.problem,
    /not in your Trade Memory/i,
    'the refusal reads as "not yours", not "forbidden" — a 403 would confirm the id is real'
  );

  // A's record is untouched, and B gained nothing.
  const a = createJournalStore({ filePath: file, userId: 'user-A' });
  assert.equal(a.get('sess-A-1').record.notes, 'A wrote this.');
  assert.equal(b.list().summaries.length, 0);
});

test('I8 — every record the store writes is attributed to its scope', () => {
  const file = tempJournalFile();
  createJournalStore({ filePath: file, userId: 'user-A' }).upsert(trade('sess-A-1'));

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.records.length, 1);
  assert.equal(raw.records[0].userId, 'user-A');

  // A scope is not a per-call argument, so it cannot be forgotten on a write.
  assert.equal(normalizeUserId('  user-A  '), 'user-A');
  assert.equal(normalizeUserId(''), null);
  assert.equal(normalizeUserId(null), null);
  assert.equal(normalizeUserId(42), null);
  assert.equal(normalizeUserId('x'.repeat(200)), null, 'an absurd id is refused, not truncated');
});

// ============================================================================
// Legacy records — written before accounts existed
// ============================================================================

test('I9 — a pre-account record is visible to NO account, and is not adopted by the first to sign in', () => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Exactly what the Phase 12/13 build wrote: a record with no `userId`.
  const legacy = normalizeRecord(trade('sess-legacy', { notes: 'Written before accounts.' }), new Date());
  delete legacy.userId;
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), records: [legacy] }, null, 2),
    'utf8'
  );

  // It is still on disk, byte for byte — nothing was deleted or rewritten.
  const before = fs.readFileSync(file, 'utf8');

  for (const userId of ['user-A', 'user-B']) {
    const store = createJournalStore({ filePath: file, userId });
    assert.equal(store.list().summaries.length, 0, `${userId} must not see it`);
    assert.equal(store.get('sess-legacy').record, null, `${userId} must not read it by id`);
  }

  // A brand-new account, signing in for the first time, does not inherit it.
  const firstEver = createJournalStore({ filePath: file, userId: 'brand-new-account' });
  assert.equal(firstEver.list().summaries.length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'the file was not rewritten');

  // It is reported by COUNT, so the situation is visible without being exposed.
  const audit = auditJournal({ filePath: file });
  assert.equal(audit.ok, true);
  assert.equal(audit.total, 1);
  assert.equal(audit.unattributed, 1);
  assert.equal(audit.attributed, 0);
  assert.equal(audit.owners, 0);
  // The audit reports numbers only — no id, no content.
  assert.equal(JSON.stringify(audit).includes('sess-legacy'), false);
  assert.equal(JSON.stringify(audit).includes('before accounts'), false);
});

test('I10 — a signed-in account with no trades is told the legacy situation, not just "empty"', async (t) => {
  const file = tempJournalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = normalizeRecord(trade('sess-legacy'), new Date());
  delete legacy.userId;
  fs.writeFileSync(file, JSON.stringify({ version: 2, records: [legacy] }), 'utf8');

  const kit = await createAuthTestKit({
    routers: [journalRouter],
    env: { TRADEGUARD_JOURNAL_FILE: file },
  });
  t.after(() => kit.cleanup());

  const { cookie } = await kit.signedInUser();
  const body = await (await kit.get('/api/journal', { cookie })).json();

  assert.equal(body.count, 0);
  assert.equal(body.legacy.count, 1, 'the count is reported');
  assert.equal(body.legacy.known, true);
  assert.match(body.message, /before accounts existed/);
  assert.match(body.message, /not been deleted/);
  // Reported without exposing the record.
  assert.equal(JSON.stringify(body).includes('sess-legacy'), false);
});

test('I11 — an attributed record is never counted as legacy, and vice versa', () => {
  const file = tempJournalFile();
  createJournalStore({ filePath: file, userId: 'user-A' }).upsert(trade('sess-A-1'));
  createJournalStore({ filePath: file, userId: 'user-B' }).upsert(trade('sess-B-1'));

  const audit = auditJournal({ filePath: file });
  assert.equal(audit.total, 2);
  assert.equal(audit.attributed, 2);
  assert.equal(audit.unattributed, 0);
  assert.equal(audit.owners, 2);
});
