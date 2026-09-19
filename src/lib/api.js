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
