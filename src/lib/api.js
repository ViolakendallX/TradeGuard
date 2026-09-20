const API_BASE = '/api';

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
