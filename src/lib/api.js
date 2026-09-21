const API_BASE = '/api';

/**
 * How the app finds out that the session it was using is gone.
 *
 * A session can end while the trader is working: it expires, it is revoked on
 * another device, or the account is removed. The server answers those with a 401
 * — and the server is the only authority on whether a session is valid, so the
 * frontend does not try to predict it. It registers a reaction here and the API
 * layer reports the 401 when it sees one.
 *
 * This exists rather than a check inside each screen because a screen that
 * happens to be looking at the wrong thing must not be able to leave the app
 * believing it is still signed in.
 */
let unauthorizedHandler = null;

/** Registers the reaction to a 401. Pass null to clear it. */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = typeof fn === 'function' ? fn : null;
}

/** Reports a 401 to whoever is listening. Safe when nobody is. */
function noteUnauthorized(status) {
  if (status === 401 && unauthorizedHandler) unauthorizedHandler();
}

/** Reads a JSON body, tolerating a response that is not JSON. */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * The session behind the current browser, if there is one.
 *
 * The session token is in an HttpOnly cookie the page cannot read, so "am I
 * signed in?" is not a question the frontend can answer from its own state. It
 * asks the server. `authenticated: false` is a normal answer, not a failure, so
 * this resolves rather than throwing.
 */
export async function fetchSession() {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/me`);
  } catch {
    return { ok: false, kind: 'offline', authenticated: false, user: null, message: 'TradeGuard could not reach the server.' };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      authenticated: false,
      user: null,
      message: payload?.message || `Session check failed (${response.status}).`,
    };
  }

  return { ok: true, kind: null, authenticated: Boolean(payload?.authenticated), user: payload?.user || null };
}

/**
 * Creates an account. On success the server also opens a session, so the caller
 * lands signed in — which is what "create an account and start using it" means.
 */
export async function registerAccount({ name, email, password, confirmPassword }) {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, confirmPassword }),
    });
  } catch {
    return { ok: false, kind: 'offline', errors: {}, message: 'TradeGuard could not reach the server. Check that the API is running.' };
  }

  const payload = await readJson(response);

  if (response.status === 400) {
    return { ok: false, kind: 'invalid', errors: payload?.errors || {}, message: payload?.message || 'Check the highlighted fields.' };
  }
  if (response.status === 409) {
    return { ok: false, kind: 'duplicate', errors: payload?.errors || {}, message: payload?.message || 'That email address is already registered.' };
  }
  if (!response.ok) {
    return { ok: false, kind: 'server', errors: {}, message: payload?.message || `Account creation failed (${response.status}).` };
  }

  // A 200 that is not `ok` means the account may exist but no session was
  // opened. That is not a sign-in, so it is not reported as one.
  if (payload?.status !== 'ok') {
    return { ok: false, kind: 'unavailable', errors: {}, message: payload?.message || 'The account could not be created.' };
  }

  return { ok: true, kind: null, user: payload.user || null, message: payload.message };
}

/**
 * Checks a credential pair and opens a session.
 *
 * Every failure — unknown email, wrong password, malformed input — comes back as
 * one 401 with one message, because the server refuses to say which it was. This
 * function does not try to guess either.
 */
export async function loginAccount({ email, password }) {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, kind: 'offline', errors: {}, message: 'TradeGuard could not reach the server. Check that the API is running.' };
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    return { ok: false, kind: 'rejected', errors: {}, message: payload?.message || 'Email or password is incorrect.' };
  }
  if (!response.ok) {
    return { ok: false, kind: 'server', errors: {}, message: payload?.message || `Sign-in failed (${response.status}).` };
  }
  if (payload?.status !== 'ok') {
    return { ok: false, kind: 'unavailable', errors: {}, message: payload?.message || 'Sign-in could not be completed.' };
  }

  return { ok: true, kind: null, user: payload.user || null, message: payload.message };
}

/**
 * Destroys the session and clears the cookie.
 *
 * Always resolves: a logout that reported failure because it found nothing to
 * destroy would leave the trader unable to tell "already signed out" from "still
 * signed in".
 */
export async function logoutAccount() {
  try {
    const response = await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    await readJson(response);
    return { ok: true };
  } catch {
    // The session may well be gone server-side; what matters is that the app
    // stops treating this browser as signed in. The next session check settles it.
    return { ok: false, message: 'TradeGuard could not reach the server to sign out.' };
  }
}

/**
 * Phase 1: submit a trade thesis to the backend for validation + capture.
 * Throws on network failure so the UI can degrade gracefully.
 */
export async function submitTradeIdea(idea) {
  const response = await fetch(`${API_BASE}/trade-ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(idea),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Phase 3: request market + event research for the submitted trade context.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchResearch(context) {
  const response = await fetch(`${API_BASE}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Research request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 4: request the Devil's Advocate thesis attack for the submitted trade
 * context, passing along the Phase 3 research we already fetched.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchThesisAttack(context, research) {
  const response = await fetch(`${API_BASE}/thesis-attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, research }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Thesis attack request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 6: request the deterministic risk assessment for the submitted trade
 * context. This is pure arithmetic on the trader's own entry, invalidation and
 * risk budget — it reads no market data, so it is the one analysis that still
 * works when the market-data provider is unreachable.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchRiskAssessment(context) {
  const response = await fetch(`${API_BASE}/risk-assessment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Risk assessment request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 5: request the historical stress test for the submitted trade context.
 * The research we already fetched is passed along for traceability only — the
 * historical analysis is derived from the historical candle series.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchHistoricalStressTest(context, research) {
  const response = await fetch(`${API_BASE}/historical-stress-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, research }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Historical stress test request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 7: request the structured trade plan.
 *
 * The Phase 6 risk result and the Phase 4 attack we already hold are sent along
 * so the backend can reuse them rather than re-derive them. Like the risk
 * assessment, this endpoint reads no market data — it is a synthesis of the
 * trader's own parameters and the findings the earlier stages already produced,
 * so it still resolves when the market-data provider is unreachable.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchTradeStructure(context, extras = {}) {
  const response = await fetch(`${API_BASE}/trade-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, risk: extras.risk || null, attack: extras.attack || null }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Trade structure request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 8: request the consolidated final trade report.
 *
 * Every earlier result we already hold is sent along so the backend can RESTATE
 * them rather than re-derive them — the market and event research, the attack,
 * the historical stress test, the risk assessment and the trade structure. The
 * report therefore reads no market data of its own and computes no new analysis,
 * so it still resolves when every provider is unreachable.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchFinalReport(context, extras = {}) {
  const response = await fetch(`${API_BASE}/final-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      market: extras.market || null,
      events: extras.events || null,
      attack: extras.attack || null,
      history: extras.history || null,
      risk: extras.risk || null,
      structure: extras.structure || null,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400 && payload?.errors) {
    return { ok: false, kind: 'validation', errors: payload.errors, message: payload.message };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Final report request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 10: evaluate the paper-execution gate and build the pre-execution review.
 *
 * This request SENDS NOTHING. It asks the backend whether paper execution is
 * permitted for this trade and, if so, exactly what would be submitted. The
 * answer is one of the deterministic execution states; a locked or unavailable
 * result is a real answer, not an error, so this always resolves.
 *
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchPaperExecution(context, extras = {}) {
  const response = await fetch(`${API_BASE}/paper-execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: context,
      risk: extras.risk || null,
      structure: extras.structure || null,
      report: extras.report || null,
      decision: extras.decision || null,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Paper execution request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 10: submit the paper order — but only with explicit confirmation.
 *
 * Recording TAKE is NOT sufficient on its own, and this function cannot submit
 * without the confirmation token. A missing or wrong token comes back as a 400
 * and nothing is sent to the venue.
 *
 * Returns { ok, data } on success, or { ok:false, kind, message, execution } on
 * failure. A venue rejection is a 200 carrying PAPER ORDER FAILED, because the
 * demo venue refusing an order is a real outcome to report, not a bad request.
 */
export async function submitPaperExecution(context, extras = {}) {
  const response = await fetch(`${API_BASE}/paper-execution/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: context,
      risk: extras.risk || null,
      structure: extras.structure || null,
      report: extras.report || null,
      decision: extras.decision || null,
      confirmation: extras.confirmation ?? null,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400) {
    return {
      ok: false,
      kind: 'confirmation-required',
      errors: {},
      message: payload?.message || 'Confirmation is required before anything is submitted.',
      execution: payload?.execution || null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Paper execution submission failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 11: assemble the post-decision Trade Review from the verified records.
 *
 * This request SENDS the records TradeGuard already produced — the thesis, the
 * Phase 6/7 risk and structure, the Phase 9 decision, the Phase 10 execution
 * record, and the Phase 3/4/5 investigation — and the backend assembles them
 * into one read-only review. It performs NO new analysis and SUBMITS NOTHING.
 *
 * A locked, incomplete, or unavailable review is a real answer, not an error, so
 * this always resolves with { ok:true, data } and the caller reads data.status.
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function fetchTradeReview(context, extras = {}) {
  const response = await fetch(`${API_BASE}/trade-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: context,
      risk: extras.risk || null,
      structure: extras.structure || null,
      report: extras.report || null,
      decision: extras.decision || null,
      execution: extras.execution || null,
      research: extras.research || null,
      attack: extras.attack || null,
      history: extras.history || null,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Trade Review request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 12: save the current trade to Trade Memory.
 *
 * This SENDS the records TradeGuard already produced — the submitted trade, the
 * Phase 9 decision, the Phase 10 execution state, the Phase 11 review and the
 * trader's own Phase 13 reflection — and the backend stores them in a local JSON
 * file. It performs NO new analysis and submits NOTHING to any venue.
 *
 * `sessionId` is what makes a save an upsert: saving the same trade again updates
 * the same record instead of creating a duplicate.
 *
 * Returns { ok, data } on success, or { ok:false, kind, errors, message } on
 * failure.
 */
export async function saveJournalRecord(sessionId, extras = {}) {
  const response = await fetch(`${API_BASE}/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: sessionId,
      idea: extras.idea || null,
      decision: extras.decision || null,
      execution: extras.execution || null,
      review: extras.review || null,
      notes: typeof extras.notes === 'string' ? extras.notes : null,
      // Phase 13: the trader's own reflection. Sent as an object so that clearing
      // it (an empty string) is distinguishable from not carrying it at all — an
      // ordinary save must never wipe a reflection the trader wrote.
      traderReview:
        extras.traderReview && typeof extras.traderReview === 'object'
          ? { notes: typeof extras.traderReview.notes === 'string' ? extras.traderReview.notes : '' }
          : null,
    }),
  });

  // A 401 here means the session ended while the trader was working. The app is
  // told, so it can drop to the sign-in screen rather than render an empty
  // Trade Memory as though that were the truth.
  noteUnauthorized(response.status);

  const payload = await readJson(response);

  if (response.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      errors: payload?.errors || {},
      message: payload?.message || 'This trade could not be saved to Trade Memory.',
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Trade Memory request failed (${response.status}).`,
    };
  }

  // A 200 carrying "unavailable" is the honest answer when the journal file
  // cannot be written — it is not a success, so it is reported as a failure.
  if (payload?.status !== 'saved') {
    return {
      ok: false,
      kind: 'unavailable',
      errors: {},
      message: payload?.message || 'Trade Memory could not be written.',
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 13: save ONLY the trader's reflection on an ALREADY-SAVED trade.
 *
 * WHY THIS EXISTS SEPARATELY FROM `saveJournalRecord`
 * ---------------------------------------------------
 * Trader Review can look back at any trade in Trade Memory, not just the one
 * currently open. Editing a reflection on an older trade must therefore be
 * possible without re-sending that trade's thesis, decision, execution or
 * review — this screen does not hold them, and re-sending stale copies would be
 * a way to silently rewrite history.
 *
 * So this sends the reflection and NOTHING ELSE. The backend's upsert is
 * group-scoped: a group is only replaced when the request actually carried it,
 * so the stored trade, decision, execution, review and notes are left exactly as
 * they were. It cannot create a record either — the id must already exist for
 * Trader Review to offer this editor at all, and the caller only ever passes an
 * id it read from Trade Memory.
 *
 * It runs no analysis and contacts no provider: it is one write of the trader's
 * own words.
 *
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 */
export async function saveJournalReflection(id, notes) {
  const response = await fetch(`${API_BASE}/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      // The ONLY group carried. Every other group is deliberately absent so the
      // server keeps what is already stored.
      traderReview: { notes: typeof notes === 'string' ? notes : '' },
    }),
  });

  // A 401 here means the session ended while the trader was working. The app is
  // told, so it can drop to the sign-in screen rather than render an empty
  // Trade Memory as though that were the truth.
  noteUnauthorized(response.status);

  const payload = await readJson(response);

  if (response.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      errors: payload?.errors || {},
      message: payload?.message || 'This reflection could not be saved.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Trade Memory request failed (${response.status}).`,
    };
  }

  if (payload?.status !== 'saved') {
    return {
      ok: false,
      kind: 'unavailable',
      errors: {},
      message: payload?.message || 'Trade Memory could not be written.',
    };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 12: list the trades saved in Trade Memory, newest first.
 *
 * Returns summaries only. Reading Trade Memory runs no analysis and touches no
 * provider — it reads the stored records back.
 *
 * Returns { ok, data } on success, or { ok:false, kind, message } on failure.
 * A 200 carrying "unavailable" means the journal exists but could not be read,
 * which is deliberately NOT the same as "you have no saved trades".
 */
export async function fetchJournalList() {
  const response = await fetch(`${API_BASE}/journal`);

  // A 401 here means the session ended while the trader was working. The app is
  // told, so it can drop to the sign-in screen rather than render an empty
  // Trade Memory as though that were the truth.
  noteUnauthorized(response.status);

  const payload = await readJson(response);

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      message: payload?.message || `Trade Memory request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}

/** Phase 12: read one saved trade in full. Returns { ok, data } or { ok:false }. */
export async function fetchJournalRecord(id) {
  const response = await fetch(`${API_BASE}/journal/${encodeURIComponent(id)}`);

  // A 401 here means the session ended while the trader was working. The app is
  // told, so it can drop to the sign-in screen rather than render an empty
  // Trade Memory as though that were the truth.
  noteUnauthorized(response.status);

  const payload = await readJson(response);

  if (response.status === 404) {
    return { ok: false, kind: 'not-found', message: payload?.message || 'That saved trade no longer exists.' };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      message: payload?.message || `Trade Memory request failed (${response.status}).`,
    };
  }

  if (!payload?.record) {
    return { ok: false, kind: 'unavailable', message: payload?.message || 'Trade Memory could not be read.' };
  }

  return { ok: true, data: payload };
}

/**
 * Phase 9: record the trader's OWN decision.
 *
 * This is the one request in TradeGuard that does not ask for analysis — it
 * SUBMITS a human judgement. The backend validates it (a decision must be
 * selected and a real reason supplied) and stores it with a server-generated
 * timestamp. TradeGuard does not choose, suggest or score the decision here.
 *
 * A missing decision or an empty reason comes back as a 400 with per-field
 * errors, so they surface as validation messages rather than as a generic
 * failure.
 * Returns { ok, data } on success, or { ok:false, kind, errors, message } on failure.
 */
export async function recordHumanDecision(context, extras = {}) {
  const response = await fetch(`${API_BASE}/human-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      decision: extras.decision ?? null,
      reason: extras.reason ?? '',
      risk: extras.risk || null,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      errors: payload?.errors || {},
      message: payload?.message || 'The decision could not be recorded.',
      record: payload?.record || null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'server',
      errors: {},
      message: payload?.message || `Decision request failed (${response.status}).`,
    };
  }

  return { ok: true, data: payload };
}
