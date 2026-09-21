// Integration verification for Phase 12 — Trade Memory.
//
// Drives the REAL Express app with the same request shape the browser UI sends
// (src/lib/api.js). It is not a unit test: it proves the /api/journal routes, the
// file round-trip, the per-session upsert and the cross-trade isolation all hold
// in a live server.
//
// By default this script starts its OWN API process on a spare port with the
// journal pointed at a temporary file, so it never writes verification records
// into the real Trade Memory. Set BASE to run against an already-running server
// instead — but then the records it creates WILL land in that server's journal.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTERNAL_BASE = process.env.BASE || null;
const PORT = Number(process.env.VERIFY_PORT) || 8790;

let failures = 0;
function check(name, cond, extra = '') {
  const ok = Boolean(cond);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  return ok;
}

// --- fixtures ---------------------------------------------------------------

const THESIS =
  'I think rNVDA will continue higher over the next few days because momentum is bullish and it may ' +
  'hold above the key support area.';
const REASON_A = 'Momentum is holding and my risk is defined at 50, so I am willing to take this.';
const REASON_B = 'BRAVO ONLY — the setup is thin and I am not taking it.';
const NOTE_A = 'ALPHA ONLY — waited too long to enter.';
const NOTE_B = 'BRAVO ONLY — no notes worth keeping.';

const CONTEXT = {
  asset: 'rNVDA',
  direction: 'bullish',
  thesis: THESIS,
  timeframe: 'swing',
  entryPrice: 100,
  invalidationPrice: 95,
  riskAmount: 50,
  confidence: 7,
  existingPosition: 'none',
};

const SUBMITTED_EXECUTION = {
  status: 'submitted',
  statusDetail: null,
  result: {
    status: 'submitted',
    orderId: 'O-PHASE12-1',
    symbol: 'RNVDAUSDT',
    side: 'buy',
    quantity: 10,
    price: 100,
    orderType: 'limit',
    submittedAt: new Date().toISOString(),
    environment: 'demo',
  },
};

const READY_EXECUTION = {
  status: 'ready',
  statusLabel: 'READY FOR PAPER EXECUTION',
  order: { symbol: 'RNVDAUSDT', side: 'buy', quantity: 10, price: 100, orderType: 'limit' },
};

const UNAVAILABLE_EXECUTION = {
  status: 'unavailable',
  statusLabel: 'PAPER EXECUTION UNAVAILABLE',
  statusDetail: 'Bitget Demo credentials were unavailable.',
  result: null,
};

// --- lifecycle --------------------------------------------------------------

let child = null;
let tempDir = null;
let BASE = EXTERNAL_BASE;

/**
 * The session cookie for the account this run creates.
 *
 * Every Trade Memory route requires a session, so this script signs in the way a
 * browser does — POST /api/auth/register, then keep the cookie the server sends
 * back. Nothing here fabricates a session: if sign-in does not work, the script
 * fails at this step rather than pretending the journal routes are open.
 */
let COOKIE = null;

/** The id of that account. Records written directly to the file are stamped with
 *  it, because an unowned record belongs to nobody and would not be visible. */
let USER_ID = null;

async function signIn() {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Verification Trader',
      email: `verify-${Date.now()}@tradeguard.test`,
      password: 'verification-password',
    }),
  });

  if (!r.ok) throw new Error(`The verification account could not be created (${r.status}).`);

  const body = await r.json().catch(() => null);
  const setCookie = r.headers.getSetCookie?.() ?? [];
  if (!setCookie.length) throw new Error('Signing in returned no session cookie.');

  COOKIE = setCookie[0].split(';')[0];
  USER_ID = body?.user?.id ?? null;
  if (!USER_ID) throw new Error('The verification account came back with no id.');
  return COOKIE;
}

async function startOwnServer() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-phase12-'));
  const journalFile = path.join(tempDir, 'trade-journal.json');

  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      TRADEGUARD_JOURNAL_FILE: journalFile,
      // Accounts and sessions are pointed at the same temp directory, so this
      // verification creates its own account and can never read, add to, or
      // invalidate a real trader's sign-in.
      TRADEGUARD_USERS_FILE: path.join(tempDir, 'users.json'),
      TRADEGUARD_SESSIONS_FILE: path.join(tempDir, 'sessions.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });

  BASE = `http://127.0.0.1:${PORT}`;

  // Wait for the API to come up.
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return journalFile;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  throw new Error(`The verification API did not start on port ${PORT}. ${stderr}`);
}

function stopOwnServer() {
  if (child) {
    child.kill();
    child = null;
  }
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
    tempDir = null;
  }
}

// --- http helpers -----------------------------------------------------------

async function post(pathname, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (COOKIE) headers.Cookie = COOKIE;
  const r = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON body */
  }
  return { status: r.status, data };
}

async function get(pathname) {
  const r = await fetch(`${BASE}${pathname}`, { headers: COOKIE ? { Cookie: COOKIE } : {} });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON body */
  }
  return { status: r.status, data };
}

/** Assembles a realistic review from the fast (provider-free) stages. */
async function buildReview(execution, decision) {
  const risk = await post('/api/risk-assessment', { context: CONTEXT });
  const structure = await post('/api/trade-structure', { context: CONTEXT, risk: risk.data.risk });
  const report = await post('/api/final-report', {
    context: CONTEXT,
    risk: risk.data.risk,
    structure: structure.data.structure,
  });
  const review = await post('/api/trade-review', {
    idea: CONTEXT,
    risk: risk.data.risk,
    structure: structure.data.structure,
    report: report.data.report,
    decision,
    execution,
  });
  return review.data.review;
}

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

// --- the run ----------------------------------------------------------------

(async () => {
  let journalFile = EXTERNAL_BASE ? null : await startOwnServer();

  // 0. Server alive on Phase 12 or later.
  //
  // The health endpoint reports the BUILD's phase, which moves on as later
  // phases land (it read 13 once Phase 13 shipped). What Phase 12 needs to prove
  // is that the running build still includes Trade Memory, so this asserts the
  // phase is at least 12 rather than exactly 12. The journal's OWN meta — which
  // is what this phase owns — is asserted separately below and is still 12.
  const health = await get('/api/health');
  check('server alive (Phase 12 built)', health.data?.status === 'ok', `phase ${health.data?.phase}`);
  check('health reports a build that includes phase 12', Number(health.data?.phase) >= 12, String(health.data?.phase));
  if (journalFile) console.log(`      (journal file: ${journalFile})`);

  // 0b. Sign in. Trade Memory belongs to an account, so every journal route below
  //     runs as a real session — and the routes refuse without one.
  await signIn();
  check('a verification account signs in', Boolean(COOKIE));

  const anonymous = await fetch(`${BASE}/api/journal`);
  check('Trade Memory refuses an unauthenticated read', anonymous.status === 401, `http ${anonymous.status}`);

  const ID_A = `verify-phase12-alpha-${Date.now()}`;
  const ID_B = `verify-phase12-bravo-${Date.now()}`;

  // 1. The journal starts empty in this temp store.
  const empty = await get('/api/journal');
  check('fresh journal → status ok, count 0', empty.data?.status === 'ok' && empty.data?.count === 0);

  // 2. Create trade A.
  const decisionA = await post('/api/human-decision', {
    context: CONTEXT,
    decision: 'TAKE',
    reason: REASON_A,
  });
  const reviewA = await buildReview(SUBMITTED_EXECUTION, decisionA.data.record);

  const savedA = await post('/api/journal', {
    id: ID_A,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: SUBMITTED_EXECUTION,
    review: reviewA,
    notes: NOTE_A,
  });
  check('POST /api/journal creates trade A', savedA.status === 201, String(savedA.status));
  check('trade A reports created = true', savedA.data?.created === true);
  check('trade A is saved with the session id', savedA.data?.record?.id === ID_A);

  const recA = savedA.data?.record || {};
  check('trade A stores the asset', recA.trade?.asset === 'RNVDA', recA.trade?.asset);
  check('trade A stores the thesis VERBATIM', recA.trade?.thesis === THESIS);
  check('trade A stores entry / stop / risk / confidence', recA.trade?.entryPrice === 100 && recA.trade?.invalidationPrice === 95 && recA.trade?.riskAmount === 50 && recA.trade?.confidence === 7);

  // 3. Decision + reason persistence.
  check('trade A stores the recorded decision', recA.decision?.status === 'recorded' && recA.decision?.decision === 'TAKE');
  check('trade A stores the decision reason VERBATIM', recA.decision?.reason === REASON_A);
  check('trade A stores a decision timestamp', Boolean(recA.decision?.timestamp));

  // 4. Execution persistence — the real venue order, and nothing invented.
  check('trade A stores the paper-execution state', recA.execution?.status === 'submitted');
  check('trade A stores the venue order id', recA.execution?.orderId === 'O-PHASE12-1', recA.execution?.orderId);

  // 5. No fabrication.
  check('trade A pnl is null', recA.execution?.pnl === null);
  check('trade A filled is null', recA.execution?.filled === null);
  check('trade A review outcome pnl is null', recA.review?.outcome?.pnl === null);
  check('trade A records the review status', recA.review?.status === 'ready', recA.review?.status);

  // 6. Notes persistence.
  check('trade A stores the notes VERBATIM', recA.notes === NOTE_A);

  // 7. Read it back — a separate request, so this proves the file round-trip.
  const listA = await get('/api/journal');
  check('GET /api/journal lists trade A', (listA.data?.records || []).some((r) => r.id === ID_A));
  check('the list row identifies the trade', (listA.data?.records || []).find((r) => r.id === ID_A)?.asset === 'RNVDA');
  check('the list row shows the decision', (listA.data?.records || []).find((r) => r.id === ID_A)?.decision === 'TAKE');
  check('the list row state is executed', (listA.data?.records || []).find((r) => r.id === ID_A)?.state === 'executed');
  check('the list row carries no pnl field', !('pnl' in ((listA.data?.records || []).find((r) => r.id === ID_A) || {})));

  const oneA = await get(`/api/journal/${encodeURIComponent(ID_A)}`);
  check('GET /api/journal/:id opens trade A', oneA.status === 200 && oneA.data?.record?.id === ID_A);
  check('the opened record has the thesis', oneA.data?.record?.trade?.thesis === THESIS);
  check('the opened record has the reason', oneA.data?.record?.decision?.reason === REASON_A);
  check('the opened record has the order id', oneA.data?.record?.execution?.orderId === 'O-PHASE12-1');
  check('the opened record has the notes', oneA.data?.record?.notes === NOTE_A);
  check('the opened record lists what is not available', Array.isArray(oneA.data?.record?.unavailable) && oneA.data.record.unavailable.length > 0);

  const frozenA0 = JSON.parse(JSON.stringify(oneA.data.record));

  // 8. Updating the same session updates rather than duplicating.
  const updatedA = await post('/api/journal', {
    id: ID_A,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: SUBMITTED_EXECUTION,
    review: reviewA,
    notes: 'ALPHA ONLY — revised note.',
  });
  check('re-saving trade A is an update, not a create', updatedA.status === 200 && updatedA.data?.created === false);
  check('the revised notes are stored', updatedA.data?.record?.notes === 'ALPHA ONLY — revised note.');
  check('createdAt is preserved across an update', updatedA.data?.record?.createdAt === frozenA0.createdAt);

  const listAfterUpdate = await get('/api/journal');
  check('re-saving did not create a second row', listAfterUpdate.data?.count === 1, String(listAfterUpdate.data?.count));

  // Restore trade A's note, then freeze the record exactly as it now stands —
  // this is the snapshot trade B must not be able to disturb.
  await post('/api/journal', {
    id: ID_A,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: SUBMITTED_EXECUTION,
    review: reviewA,
    notes: NOTE_A,
  });
  const frozenA = JSON.parse(JSON.stringify((await get(`/api/journal/${encodeURIComponent(ID_A)}`)).data.record));

  // 9. Create trade B — a different trade, isolated from A.
  const contextB = { ...CONTEXT, asset: 'rAAPL', direction: 'bearish', thesis: 'BRAVO ONLY — AAPL rolls over from here.' };
  const decisionB = await post('/api/human-decision', {
    context: contextB,
    decision: 'SKIP',
    reason: REASON_B,
  });
  const savedB = await post('/api/journal', {
    id: ID_B,
    idea: contextB,
    decision: decisionB.data.record,
    execution: null,
    review: null,
    notes: NOTE_B,
  });
  check('POST /api/journal creates trade B', savedB.status === 201 && savedB.data?.created === true);

  const recB = savedB.data?.record || {};
  check('trade B stores only B’s asset', recB.trade?.asset === 'RAAPL', recB.trade?.asset);
  check('trade B stores only B’s thesis', recB.trade?.thesis === 'BRAVO ONLY — AAPL rolls over from here.');
  check('trade B stores only B’s decision', recB.decision?.decision === 'SKIP');
  check('trade B stores only B’s reason', recB.decision?.reason === REASON_B);
  check('trade B stores only B’s notes', recB.notes === NOTE_B);
  check('trade B has no execution record', recB.execution?.status === 'not-recorded' && recB.execution?.orderId === null);
  check('trade B carries no ALPHA data', !JSON.stringify(recB).includes('ALPHA'));
  check('trade B carries no A asset', !JSON.stringify(recB).includes('rNVDA'));

  // 10. Trade A is untouched by trade B.
  const afterB = await get(`/api/journal/${encodeURIComponent(ID_A)}`);
  check('trade A is byte-for-byte unchanged after trade B', JSON.stringify(afterB.data?.record) === JSON.stringify(frozenA));
  check('trade A still has its own thesis', afterB.data?.record?.trade?.thesis === THESIS);
  check('trade A still has its own order id', afterB.data?.record?.execution?.orderId === 'O-PHASE12-1');

  const listBoth = await get('/api/journal');
  check('both trades are listed', listBoth.data?.count === 2, String(listBoth.data?.count));

  // 11. Honest execution states.
  const ID_READY = `verify-phase12-ready-${Date.now()}`;
  const ready = await post('/api/journal', {
    id: ID_READY,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: READY_EXECUTION,
  });
  check('a ready-but-unsubmitted execution keeps status ready', ready.data?.record?.execution?.status === 'ready');
  check('a ready-but-unsubmitted execution has NO order id', ready.data?.record?.execution?.orderId === null);
  check('the prepared order is kept, labelled not submitted', ready.data?.record?.execution?.intendedOrder?.submitted === false);

  const ID_UNAVAIL = `verify-phase12-unavail-${Date.now()}`;
  const unavail = await post('/api/journal', {
    id: ID_UNAVAIL,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: UNAVAILABLE_EXECUTION,
  });
  check('an unavailable execution persists as unavailable', unavail.data?.record?.execution?.status === 'unavailable');
  check('an unavailable execution has no order id', unavail.data?.record?.execution?.orderId === null);
  check('the unavailability reason is remembered', /credentials were unavailable/.test(unavail.data?.record?.execution?.statusDetail || ''));

  // 12. A hostile client cannot write a P&L, a fill or a score.
  const ID_TAMPER = `verify-phase12-tamper-${Date.now()}`;
  const tampered = await post('/api/journal', {
    id: ID_TAMPER,
    idea: CONTEXT,
    decision: decisionA.data.record,
    execution: { ...SUBMITTED_EXECUTION, filled: true, pnl: 4321.99, profit: 4321.99, score: 10 },
    review: { status: 'ready', outcome: { status: 'submitted', pnl: 4321.99 } },
    notes: 'tamper',
  });
  check('a client-supplied pnl is dropped', tampered.data?.record?.execution?.pnl === null);
  check('a client-supplied fill is dropped', tampered.data?.record?.execution?.filled === null);
  check('a client-supplied review pnl is dropped', tampered.data?.record?.review?.outcome?.pnl === null);
  check('a client-supplied score is dropped', !('score' in (tampered.data?.record?.execution || {})));
  check('the fabricated figure never reaches the record', !JSON.stringify(tampered.data?.record).includes('4321.99'));

  // 13. No verdict vocabulary anywhere on a saved record.
  const forbidden = ['score', 'rating', 'grade', 'winRate', 'expectancy', 'recommendation', 'prediction', 'signal', 'expectedReturn', 'profit', 'loss', 'performance', 'verdict'];
  const keys = allKeys(afterB.data?.record);
  const leaked = forbidden.filter((k) => keys.has(k));
  check('no score / rating / recommendation / prediction field on a saved record', leaked.length === 0, leaked.join(','));

  // 14. Validation + not-found.
  const noId = await post('/api/journal', { idea: CONTEXT });
  check('a save with no session id is a 400', noId.status === 400, String(noId.status));
  check('the 400 explains that an id is required', /session id is required/.test(noId.data?.message || ''));

  const badId = await post('/api/journal', { id: 'not a valid id!', idea: CONTEXT });
  check('a save with a malformed session id is a 400', badId.status === 400, String(badId.status));

  const missing = await get('/api/journal/verify-phase12-does-not-exist');
  check('an unknown saved trade is a 404', missing.status === 404, String(missing.status));
  check('the 404 is honest, not an empty record', missing.data?.status === 'not-found' && missing.data?.record === null);

  // 15. Storage is labelled as local, not cloud.
  check('meta labels the storage as a local JSON file', savedA.data?.storage?.kind === 'local-json-file');
  check('meta says it is NOT cloud storage', savedA.data?.storage?.cloud === false);
  check('meta says it is NOT a database', savedA.data?.storage?.database === false);
  check('meta reports phase 12', savedA.data?.phase === 12);

  // 16. The journal write path runs no analysis: no provider request is possible.
  const started = Date.now();
  await get('/api/journal');
  await get(`/api/journal/${encodeURIComponent(ID_A)}`);
  const readMs = Date.now() - started;
  check('reading Trade Memory is fast (no analysis re-run)', readMs < 1500, `${readMs} ms`);

  // 17. The API is still healthy after all of it.
  const stillAlive = await get('/api/health');
  check('server still alive after the Phase 12 checks', stillAlive.data?.status === 'ok');

  console.log('\n' + (failures === 0 ? 'ALL PHASE 12 CHECKS PASSED' : `${failures} CHECK(S) FAILED`));
  stopOwnServer();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFICATION ERROR:', e);
  stopOwnServer();
  process.exit(2);
});
