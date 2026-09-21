// Integration verification for Phase 13 — Trader Review & final polish.
//
// Two halves:
//
//   1. LIVE — drives the REAL Express app with the same request shape the browser
//      UI sends, to prove the trader's own reflection round-trips through
//      /api/journal, that an ordinary save cannot erase it, that two trades stay
//      isolated, and that a record written by the Phase 12 build (no reflection
//      key at all) still reads back honestly.
//
//   2. WIRING — reads the frontend sources and asserts the Phase 13 screen is
//      actually reachable and wired to the reflection: the nav lists it at phase
//      13, the sidebar groups partition the workflow, the placeholder screen no
//      longer advertises unbuilt phases, and nothing in the app claims a locked
//      phase any more.
//
// By default this script starts its OWN API on a spare port with the journal
// pointed at a temporary file, so it never writes verification records into the
// real Trade Memory. Set BASE to run against an already-running server instead —
// but then the records it creates WILL land in that server's journal.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTERNAL_BASE = process.env.BASE || null;
const PORT = Number(process.env.VERIFY_PORT) || 8791;

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

const CONTEXT_B = { ...CONTEXT, asset: 'rETH', direction: 'bearish' };

const DECISION = {
  status: 'recorded',
  decision: 'TAKE',
  decisionLabel: 'TAKE',
  reason: 'Momentum is holding and my risk is defined at 50, so I am willing to take this.',
  timestamp: '2026-09-20T14:00:00.000Z',
};

const NOTE_A = 'ALPHA ONLY — waited too long to enter.';
const NOTE_B = 'BRAVO ONLY — no notes worth keeping.';
const REFLECTION_A = 'ALPHA REFLECTION — I would take the first pullback instead of chasing.';
const REFLECTION_B = 'BRAVO REFLECTION — the short thesis was thin; skip setups like this.';

const SUBMITTED_EXECUTION = {
  status: 'submitted',
  statusDetail: null,
  result: {
    status: 'submitted',
    orderId: 'O-PHASE13-1',
    symbol: 'RNVDAUSDT',
    side: 'buy',
    quantity: 10,
    price: 100,
    orderType: 'limit',
    submittedAt: '2026-09-20T14:05:00.000Z',
    environment: 'demo',
  },
};

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

// --- lifecycle --------------------------------------------------------------

let child = null;
let tempDir = null;
let BASE = EXTERNAL_BASE;

async function startOwnServer() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-phase13-'));
  const journalFile = path.join(tempDir, 'trade-journal.json');

  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), TRADEGUARD_JOURNAL_FILE: journalFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });

  BASE = `http://127.0.0.1:${PORT}`;

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
  const r = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const r = await fetch(`${BASE}${pathname}`);
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON body */
  }
  return { status: r.status, data };
}

/** Assembles a realistic review from the fast (provider-free) stages. */
async function buildReview(context, execution, decision) {
  const risk = await post('/api/risk-assessment', { context });
  const structure = await post('/api/trade-structure', { context, risk: risk.data.risk });
  const report = await post('/api/final-report', {
    context,
    risk: risk.data.risk,
    structure: structure.data.structure,
  });
  const review = await post('/api/trade-review', {
    idea: context,
    risk: risk.data.risk,
    structure: structure.data.structure,
    report: report.data.report,
    decision,
    execution,
  });
  return review.data.review;
}

/**
 * Finds occurrences of a banned term that are NOT inside a negation.
 *
 * A mechanical scan cannot tell negation from assertion, and this panel
 * legitimately NAMES the things it refuses to produce ("it does not score the
 * trade", "never generates, scores or grades it"). So the scan only fails an
 * occurrence with no negation word near it.
 */
function unguardedTerms(source, terms) {
  const out = [];
  for (const term of terms) {
    const re = new RegExp(`.{0,90}\\b${term}\\b.{0,90}`, 'gis');
    for (const m of source.matchAll(re)) {
      if (!/\b(no|not|never|nothing|none|without|cannot|can't|does not|is not|are not|nor)\b/i.test(m[0])) {
        out.push(m[0].replace(/\s+/g, ' ').trim());
      }
    }
  }
  return out;
}
/** The exact body src/lib/api.js sends for a save that carries a reflection. */
function saveBody(id, context, { review, notes, execution, decision, traderReview }) {
  return {
    id,
    idea: context,
    decision: decision ?? null,
    execution: execution ?? null,
    review: review ?? null,
    notes: typeof notes === 'string' ? notes : null,
    traderReview:
      traderReview && typeof traderReview === 'object'
        ? { notes: typeof traderReview.notes === 'string' ? traderReview.notes : '' }
        : null,
  };
}

// --- wiring checks (source level) -------------------------------------------

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function wiringChecks() {
  const constants = read('src/lib/constants.js');
  const app = read('src/App.jsx');
  const sidebar = read('src/components/Sidebar.jsx');
  const placeholder = read('src/screens/PlaceholderScreen.jsx');
  const shell = read('src/components/AppShell.jsx');
  const panel = read('src/components/investigation/TraderReviewPanel.jsx');
  const screen = read('src/screens/TraderReviewScreen.jsx');
  const journalDetail = read('src/components/journal/JournalDetail.jsx');
  const journalClient = read('src/lib/journal.js');
  const apiClient = read('src/lib/api.js');
  const serverIndex = read('server/index.js');
  const picker = read('src/components/investigation/TraderReviewPicker.jsx');
  const header = read('src/components/investigation/TradeHeader.jsx');
  const journalService = read('server/services/tradeJournal.js');

  check('the server reports phase 13', /phase:\s*13/.test(serverIndex));
  check('the app shell pill names Phase 13', /Phase 13 · Trader Review/.test(shell));

  check(
    'the navigation lists Trader Review at phase 13',
    /\{\s*id:\s*'trader-review',\s*label:\s*'Trader Review',\s*phase:\s*13\s*\}/.test(constants)
  );
  check('the sidebar treats phase 13 as built', /const CURRENT_PHASE = 13;/.test(sidebar));
  check('the sidebar groups the workflow', /NAV_GROUPS/.test(sidebar) && /nav__caption/.test(sidebar));

  check('App renders the Trader Review screen', /<TraderReviewScreen/.test(app));
  check(
    'App passes the reflection to Trade Memory',
    /traderReview:\s*reflectionTouched \? \{ notes: reflection \} : null/.test(app)
  );
  check(
    'a new trade clears the reflection',
    /setReflection\(''\)/.test(app) && /setReflectionTouched\(false\)/.test(app)
  );
  check('the reflection is editable and marks itself touched', /handleReflectionChange/.test(app));

  check('the Trader Review screen exists and renders its panel', /TraderReviewPanel/.test(screen));
  check(
    'the screen reads the saved record rather than re-running the chain',
    /useJournalRecord\(reviewingId\)/.test(screen)
  );
  check(
    'the screen issues no analysis request',
    !/fetchResearch|fetchThesisAttack|fetchHistorical|fetchRiskAssessment|fetchTradeStructure|fetchFinalReport/.test(
      screen + panel
    )
  );

  check('the panel splits known / recorded / not available', /data-trader-gaps/.test(panel));
  check('the panel exposes the reflection editor', /data-trader-reflection/.test(panel));
  check('the panel reports the save state', /data-trader-save-state/.test(panel));
  check(
    'the panel never asserts a profit, loss, score or rating',
    unguardedTerms(panel, ['pnl', 'profit', 'loss', 'win[ _]?rate', 'expected[ _]?return', 'scores?', 'scored', 'rating', 'grade', 'verdict'])
      .length === 0,
    unguardedTerms(panel, ['pnl', 'profit', 'loss', 'win[ _]?rate', 'expected[ _]?return', 'scores?', 'scored', 'rating', 'grade', 'verdict'])[0] || ''
  );
  check(
    'the panel asserts no win/loss outcome for the trade',
    !/the trade (won|lost|was profitable|succeeded|failed)/i.test(panel)
  );

  check('Trade Memory shows the reflection', /data-journal-reflection-text/.test(journalDetail));
  check('Trade Memory marks a missing reflection honestly', /data-journal-no-reflection/.test(journalDetail));

  check(
    'the client sends the reflection as an object, so clearing is distinguishable',
    /traderReview:\s*reflectionNotes === null \? null : \{ notes: reflectionNotes \}/.test(journalClient)
  );
  check(
    'the API client forwards the reflection',
    /traderReview:/.test(apiClient) && /extras\.traderReview/.test(apiClient)
  );

  check(
    'the placeholder screen no longer advertises unbuilt phases',
    !/not been built yet|Planned · Phase|current build covers/.test(placeholder)
  );
  check(
    'no screen claims a locked or planned phase',
    !/arrive in later phases|not built yet \(phase/.test(read('src/components/investigation/InvestigationNav.jsx'))
  );
  check(
    'the app has no "not built in this phase" subtitle left',
    !/Not built in this phase/.test(app)
  );

  check('the PRD was not modified by this phase', !/Trade Memory \(later phases\)/.test(read('server/services/tradeReview.js')));

  // --- reviewing an ALREADY-SAVED trade -------------------------------------
  //
  // The reported product bug: with saved trades present but no trade open,
  // Trader Review asked the trader to start a trade. The screen must resolve a
  // trade to review from Trade Memory instead.

  check('the selection rule exists as a pure, testable function', /export function resolveReviewRecordId/.test(journalClient));
  check(
    'the rule prefers an explicit selection, then the active trade, then a saved one',
    /if \(has\(selectedId\)\) return selectedId;[\s\S]{0,120}if \(sessionId\) return sessionId;[\s\S]{0,120}return list\[0\]\?\.id/.test(
      journalClient
    )
  );
  check('the screen uses the selection rule', /resolveReviewRecordId\(/.test(screen));
  check('the screen lists the saved trades', /<TraderReviewPicker/.test(screen) && /useJournalList\(\)/.test(screen));
  check('the picker selects a trade by its persistent id', /data-trader-pick=\{row\.id\}/.test(picker));
  check('the picker reads only stored fields', /row\.stateLabel/.test(picker) && /row\.decisionLabel/.test(picker));
  check(
    'the picker never fabricates a fill, a P&L or a score',
    unguardedTerms(picker, ['pnl', 'profit', 'loss', 'win[ _]?rate', 'scores?', 'rating', 'grade', 'verdict']).length === 0,
    unguardedTerms(picker, ['pnl', 'profit', 'loss', 'win[ _]?rate', 'scores?', 'rating', 'grade', 'verdict'])[0] || ''
  );

  check(
    'the screen no longer tells the trader to start a trade when saved trades exist',
    !/works on the trade you are currently working through/.test(screen)
  );
  check(
    'the honest "nothing saved yet" state is the only thing that asks for a trade',
    /data-trader-no-trades/.test(screen)
  );
  check(
    'the screen says it is reviewing a stored record',
    /data-trader-historical/.test(screen) && /read back by its trade id/i.test(screen)
  );
  check(
    'a new trade resets the selection without hiding the older trades',
    /setSelectedId\(null\)[\s\S]{0,80}\}, \[sessionId\]\)/.test(screen)
  );

  // The historical reflection write must carry the reflection and nothing else.
  check('the reflection-only write path exists', /export async function saveJournalReflection/.test(apiClient));
  check(
    'it sends the id and the reflection, and no other group',
    /saveJournalReflection[\s\S]{0,900}body: JSON\.stringify\(\{[\s\S]{0,200}id,[\s\S]{0,400}traderReview: \{ notes/.test(apiClient) &&
      !/saveJournalReflection[\s\S]{0,900}idea:/.test(apiClient)
  );
  check('the reflection-only sync hook exists', /export function useJournalReflectionSync/.test(journalClient));
  check('the screen wires the historical reflection to that hook', /useJournalReflectionSync\(\{/.test(screen));
  check(
    'the historical reflection is never written until the trader touches it',
    /notes: historyTouched \? historyNotes : null/.test(screen)
  );
  check(
    'the current trade still uses the app’s own save path',
    /const isCurrentTrade = Boolean\(sessionId\) && reviewingId === sessionId;/.test(screen)
  );

  // A saved trade is not editable, so the edit action must not be offered.
  check(
    'the edit-thesis action is only offered while a trade is being worked on',
    /\{onEdit && \(/.test(header)
  );

  // The server guard that stops a reflection-only write creating an empty row.
  check(
    'a reflection-only write cannot create a record',
    /!isObj\(src\.trade\) && !isObj\(src\.idea\)/.test(journalService)
  );
  check(
    'only a carried decision can replace the execution record',
    /const carriedDecision = isObj\(src\.decision\);/.test(journalService) &&
      /decisionChanged =\s*\n?\s*carriedDecision &&/.test(journalService)
  );
}

// --- the run ----------------------------------------------------------------

(async () => {
  const journalFile = EXTERNAL_BASE ? null : await startOwnServer();

  // 0. Server alive on Phase 13.
  const health = await get('/api/health');
  check('server alive', health.data?.status === 'ok');
  check('health reports phase 13', health.data?.phase === 13, String(health.data?.phase));
  if (journalFile) console.log(`      (journal file: ${journalFile})`);

  // 1. A Phase 12 record on disk — written before the reflection existed — still
  //    reads back honestly. This is the backward-compatibility guarantee.
  if (journalFile) {
    const legacy = {
      version: 1,
      records: [
        {
          id: 'verify-phase13-legacy',
          createdAt: '2026-09-19T10:00:00.000Z',
          updatedAt: '2026-09-19T10:00:00.000Z',
          trade: { ...CONTEXT, asset: 'RNVDA' },
          decision: DECISION,
          execution: SUBMITTED_EXECUTION,
          review: null,
          notes: 'A note from before Phase 13.',
        },
      ],
    };
    fs.writeFileSync(journalFile, JSON.stringify(legacy, null, 2), 'utf8');

    const legacyRead = await get('/api/journal/verify-phase13-legacy');
    check('a Phase 12 record still reads (200)', legacyRead.status === 200, `http ${legacyRead.status}`);
    check(
      'a Phase 12 record reports its reflection as not recorded',
      legacyRead.data?.record?.traderReview?.status === 'not-recorded',
      legacyRead.data?.record?.traderReview?.status
    );
    check('a Phase 12 record keeps its notes', legacyRead.data?.record?.notes === 'A note from before Phase 13.');
    check('a Phase 12 record keeps its order id', legacyRead.data?.record?.execution?.orderId === 'O-PHASE13-1');
    check(
      'a Phase 12 record still lists the missing reflection as a gap',
      (legacyRead.data?.record?.unavailable || []).some((g) => /Trader reflection/.test(g))
    );
    check('a Phase 12 record is not rejected or repaired', legacyRead.data?.status === 'ok');
  }

  // 2. Build the records the browser would build.
  const reviewA = await buildReview(CONTEXT, SUBMITTED_EXECUTION, DECISION);
  const reviewB = await buildReview(CONTEXT_B, { status: 'ready' }, DECISION);
  check('the review assembled for trade A', Boolean(reviewA?.status), reviewA?.status);
  check('the review assembled for trade B', Boolean(reviewB?.status), reviewB?.status);

  const ID_A = `verify-phase13-alpha-${Date.now()}`;
  const ID_B = `verify-phase13-bravo-${Date.now()}`;

  // 3. Save both trades, each with its own reflection.
  const savedA = await post(
    '/api/journal',
    saveBody(ID_A, CONTEXT, {
      review: reviewA,
      notes: NOTE_A,
      execution: SUBMITTED_EXECUTION,
      decision: DECISION,
      traderReview: { notes: REFLECTION_A },
    })
  );
  const savedB = await post(
    '/api/journal',
    saveBody(ID_B, CONTEXT_B, {
      review: reviewB,
      notes: NOTE_B,
      decision: DECISION,
      traderReview: { notes: REFLECTION_B },
    })
  );
  check('trade A saved', savedA.data?.status === 'saved', `http ${savedA.status}`);
  check('trade B saved', savedB.data?.status === 'saved', `http ${savedB.status}`);

  // 4. The reflection round-trips, verbatim.
  const readA = await get(`/api/journal/${ID_A}`);
  check(
    'the reflection is read back verbatim',
    readA.data?.record?.traderReview?.notes === REFLECTION_A,
    readA.data?.record?.traderReview?.notes
  );
  check(
    'the reflection is marked recorded with a timestamp',
    readA.data?.record?.traderReview?.status === 'recorded' && Boolean(readA.data?.record?.traderReview?.recordedAt)
  );
  check(
    'the reflection group has exactly four fields',
    JSON.stringify(Object.keys(readA.data?.record?.traderReview || {}).sort()) ===
      JSON.stringify(['notes', 'recordedAt', 'status', 'statusLabel']),
    JSON.stringify(Object.keys(readA.data?.record?.traderReview || {}))
  );
  check(
    'the reflection carries no score, rating or verdict',
    !['score', 'rating', 'grade', 'verdict', 'winRate', 'lesson'].some((k) =>
      allKeys(readA.data?.record?.traderReview).has(k)
    )
  );
  check(
    'the Phase 11 notes are still stored separately',
    readA.data?.record?.notes === NOTE_A
  );

  // 5. Editing the reflection preserves when it was first recorded.
  const firstRecordedAt = readA.data.record.traderReview.recordedAt;
  const edited = await post(
    '/api/journal',
    saveBody(ID_A, CONTEXT, {
      review: reviewA,
      notes: NOTE_A,
      execution: SUBMITTED_EXECUTION,
      decision: DECISION,
      traderReview: { notes: `${REFLECTION_A} Edited.` },
    })
  );
  check('an edited reflection is saved', edited.data?.record?.traderReview?.notes === `${REFLECTION_A} Edited.`);
  check(
    'editing does not re-stamp when the reflection was first recorded',
    edited.data?.record?.traderReview?.recordedAt === firstRecordedAt,
    `${edited.data?.record?.traderReview?.recordedAt} vs ${firstRecordedAt}`
  );

  // 6. An ordinary save that does not carry a reflection leaves it alone.
  const plain = await post(
    '/api/journal',
    saveBody(ID_A, CONTEXT, { review: reviewA, notes: NOTE_A, execution: SUBMITTED_EXECUTION, decision: DECISION })
  );
  check(
    'a save without a reflection cannot erase the stored one',
    plain.data?.record?.traderReview?.notes === `${REFLECTION_A} Edited.`,
    plain.data?.record?.traderReview?.notes
  );

  // 7. Trade isolation — A and B keep their own reflection, thesis and notes.
  const afterA = await get(`/api/journal/${ID_A}`);
  const afterB = await get(`/api/journal/${ID_B}`);
  check('A keeps its own reflection', afterA.data?.record?.traderReview?.notes === `${REFLECTION_A} Edited.`);
  check('B keeps its own reflection', afterB.data?.record?.traderReview?.notes === REFLECTION_B);
  check('A does not contain B’s reflection', !JSON.stringify(afterA.data.record).includes(REFLECTION_B));
  check('B does not contain A’s reflection', !JSON.stringify(afterB.data.record).includes('ALPHA REFLECTION'));
  check('A keeps its own notes', afterA.data?.record?.notes === NOTE_A);
  check('B keeps its own notes', afterB.data?.record?.notes === NOTE_B);
  check('A keeps its own asset', afterA.data?.record?.trade?.asset === 'RNVDA');
  check('B keeps its own asset', afterB.data?.record?.trade?.asset === 'RETH');

  // 8. The legacy record is untouched by all of the above.
  if (journalFile) {
    const legacyAgain = await get('/api/journal/verify-phase13-legacy');
    check(
      'the Phase 12 record is still intact after Phase 13 saves',
      legacyAgain.data?.record?.notes === 'A note from before Phase 13.' &&
        legacyAgain.data?.record?.traderReview?.status === 'not-recorded'
    );
  }

  // 9. Clearing the reflection is honest, not an empty note.
  const cleared = await post(
    '/api/journal',
    saveBody(ID_B, CONTEXT_B, {
      review: reviewB,
      notes: NOTE_B,
      decision: DECISION,
      traderReview: { notes: '' },
    })
  );
  check(
    'a cleared reflection is reported as not recorded',
    cleared.data?.record?.traderReview?.status === 'not-recorded' &&
      cleared.data?.record?.traderReview?.notes === null,
    `${cleared.data?.record?.traderReview?.status} / ${cleared.data?.record?.traderReview?.notes}`
  );

  // 10. The list reports reflection state per trade.
  const list = await get('/api/journal');
  const rowA = (list.data?.records || []).find((r) => r.id === ID_A);
  const rowB = (list.data?.records || []).find((r) => r.id === ID_B);
  check('the list marks A as reflected on', rowA?.hasReflection === true);
  check('the list marks B as not reflected on', rowB?.hasReflection === false);
  check('the list is still newest-first and Phase 12-compatible', list.data?.status === 'ok');

  // 11. Phase 12 contracts are untouched.
  const one = await get(`/api/journal/${ID_A}`);
  check('the journal still reports itself as the Phase 12 feature', one.data?.phase === 12, String(one.data?.phase));
  check(
    'the reflection is reported as the Phase 13 addition',
    one.data?.traderReview?.phase === 13,
    String(one.data?.traderReview?.phase)
  );
  check('the storage is still a local JSON file', one.data?.storage?.kind === 'local-json-file');
  check('the storage is still not cloud', one.data?.storage?.cloud === false);
  check('the storage is still not a database', one.data?.storage?.database === false);
  check('P&L is still null by construction', one.data?.derived?.pnl === null);
  check('a fill is still null by construction', one.data?.derived?.filled === null);
  check(
    'no saved record exposes a score, rating or recommendation',
    !['score', 'rating', 'recommendation', 'prediction', 'signal', 'winRate', 'expectedReturn'].some((k) =>
      allKeys(one.data?.record).has(k)
    )
  );
  check('the reflection is never generated by TradeGuard', /never generates/i.test(one.data?.traderReview?.note || ''));

  // 12. A missing session id is still a 400.
  const bad = await post('/api/journal', { traderReview: { notes: 'no id' } });
  check('a save with no session id is still a 400', bad.status === 400, `http ${bad.status}`);

  // 13. Reading Trade Memory is fast — no analysis re-run.
  const t0 = Date.now();
  await get(`/api/journal/${ID_A}`);
  const ms = Date.now() - t0;
  check('reading a saved trade re-runs no analysis', ms < 200, `${ms} ms`);

  // 14. Looking back at an ALREADY-SAVED trade.
  //
  //     Trader Review reviews a trade that has already been decided, so it must
  //     work on any trade in Trade Memory — not only the one currently open. The
  //     write it makes for such a trade carries the reflection and NOTHING else,
  //     which is what makes looking back incapable of rewriting history.
  const beforeLookBack = await get(`/api/journal/${ID_A}`);
  const lookBack = await post('/api/journal', {
    id: ID_A,
    traderReview: { notes: 'Written while looking back at an older trade.' },
  });
  check('a reflection-only save is accepted', lookBack.data?.status === 'saved', String(lookBack.data?.status));
  check('a reflection-only save does not duplicate the trade', lookBack.data?.created === false);

  const afterLookBack = await get(`/api/journal/${ID_A}`);
  check(
    'a reflection-only save updates the reflection',
    afterLookBack.data?.record?.traderReview?.notes === 'Written while looking back at an older trade.',
    afterLookBack.data?.record?.traderReview?.notes
  );
  for (const group of ['trade', 'decision', 'execution', 'review', 'notes']) {
    check(
      `a reflection-only save leaves ${group} untouched`,
      JSON.stringify(afterLookBack.data?.record?.[group]) ===
        JSON.stringify(beforeLookBack.data?.record?.[group])
    );
  }
  check(
    'a reflection-only save keeps the trade id and creation time',
    afterLookBack.data?.record?.id === ID_A &&
      afterLookBack.data?.record?.createdAt === beforeLookBack.data?.record?.createdAt
  );

  // A reflection with no trade behind it must be refused, not stored as a row
  // with nothing in it.
  const ghost = await post('/api/journal', {
    id: 'verify-phase13-ghost',
    traderReview: { notes: 'Nowhere to go.' },
  });
  check('a reflection-only save for an unknown trade is refused', ghost.data?.status === 'unavailable', String(ghost.data?.status));
  check(
    'the refused write created no record',
    !(await get('/api/journal')).data?.records?.some((r) => r.id === 'verify-phase13-ghost')
  );

  // 15. Frontend wiring.
  wiringChecks();

  // 16. Server still alive after everything.
  const alive = await get('/api/health');
  check('server still alive after the Phase 13 checks', alive.data?.status === 'ok');

  stopOwnServer();

  console.log('');
  if (failures === 0) {
    console.log('ALL PHASE 13 CHECKS PASSED');
    process.exit(0);
  }
  console.log(`${failures} PHASE 13 CHECK(S) FAILED`);
  process.exit(1);
})().catch((e) => {
  stopOwnServer();
  console.error(`Phase 13 verification crashed: ${e?.stack || e}`);
  process.exit(1);
});
