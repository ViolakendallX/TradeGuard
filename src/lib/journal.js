/**
 * Trade Memory client (Phase 12).
 *
 * Three small pieces, all of them about REMEMBERING and READING BACK:
 *
 *   - `newSessionId()` — the identity of one trade session. It is what makes a
 *     save an upsert, and what keeps two trades apart in the journal.
 *   - `useJournalSync()` — saves the current trade to Trade Memory whenever the
 *     records that describe it change. It writes only what the app already holds.
 *   - `useJournalList()` / `useJournalRecord()` — read the journal back.
 *
 * What none of this does:
 *   - It does not run the analysis chain. Reading Trade Memory issues no research,
 *     attack, historical, risk, structure or report request — the stored record
 *     is rendered as it was saved.
 *   - It does not compute profit, loss, a fill, a score or a rating. Those fields
 *     arrive as null from the backend and are never filled in here.
 *   - It does not write on a timer for its own sake: a save is scheduled only when
 *     the trade's own records actually change, and rapid changes (typing notes)
 *     collapse into one write.
 *   - It never caches across trades. The sync is keyed on the session id, so a new
 *     trade can never overwrite or leak into the previous one.
 */

import { useEffect, useState } from 'react';
import { fetchJournalList, fetchJournalRecord, saveJournalRecord } from './api.js';

/**
 * A fresh, unique session id for a newly submitted trade.
 *
 * `crypto.randomUUID` is used when the browser provides it. The fallback keeps a
 * non-secure context working — it is still unique enough for a local journal key,
 * which is all this id is for.
 */
export function newSessionId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** How long to wait for the trade to settle before writing. Coalesces keystrokes. */
const SAVE_DEBOUNCE_MS = 700;

/**
 * Saves the current trade to Trade Memory.
 *
 * @param {object} input
 *   - sessionId  the current trade session id (no id, no save)
 *   - idea       the submitted trade context
 *   - decision   the recorded human decision, or null
 *   - execution  the paper-execution record or gate evaluation, or null
 *   - review     the assembled Phase 11 review, or null
 *   - notes      the trader's own review notes
 * @returns {{ state: 'idle'|'pending'|'saved'|'failed', at: string|null, message: string|null }}
 */
export function useJournalSync({ sessionId, idea, decision, execution, review, notes }) {
  const [status, setStatus] = useState({ state: 'idle', at: null, message: null });

  useEffect(() => {
    if (!sessionId || !idea) return undefined;

    let cancelled = false;
    setStatus((prev) => ({ ...prev, state: 'pending' }));

    const timer = setTimeout(() => {
      saveJournalRecord(sessionId, { idea, decision, execution, review, notes })
        .then((r) => {
          if (cancelled) return;
          setStatus(
            r.ok
              ? { state: 'saved', at: r.data?.record?.updatedAt || new Date().toISOString(), message: null }
              : { state: 'failed', at: null, message: r.message }
          );
        })
        .catch((e) => {
          if (cancelled) return;
          setStatus({ state: 'failed', at: null, message: String(e?.message || e) });
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, idea, decision, execution, review, notes]);

  return status;
}

/**
 * The saved trades, newest first.
 *
 * A 200 carrying "unavailable" means the journal file exists but could not be
 * read. That is reported as its own state rather than as an empty list, because
 * "your journal is unreadable" and "you have saved nothing" are different facts.
 */
export function useJournalList() {
  const [state, setState] = useState({ status: 'loading', records: [], count: 0, message: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    fetchJournalList()
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState({ status: 'unavailable', records: [], count: 0, message: r.message });
          return;
        }
        setState({
          status: r.data?.status === 'ok' ? 'ready' : 'unavailable',
          records: Array.isArray(r.data?.records) ? r.data.records : [],
          count: Number.isFinite(r.data?.count) ? r.data.count : 0,
          message: r.data?.message || null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: 'unavailable',
          records: [],
          count: 0,
          message: `Trade Memory could not be reached: ${e?.message || e}`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/**
 * One saved trade, read in full from the journal.
 *
 * This is a READ of a stored record. Nothing is recomputed: no research, no
 * attack, no historical test, no risk engine, no structure, no report.
 *
 * The state is KEY-STAMPED with the id it was fetched for and is only exposed
 * while that still matches. Without this, opening trade B immediately after
 * trade A would render A's record for one frame — the previous trade's thesis,
 * decision reason and notes shown as if they belonged to B. A `useEffect` that
 * resets state runs after paint, which is one frame too late.
 */
export function useJournalRecord(id) {
  const [state, setState] = useState({ id: null, status: 'idle', record: null, message: null });

  useEffect(() => {
    if (!id) return undefined;

    let cancelled = false;
    setState({ id, status: 'loading', record: null, message: null });

    fetchJournalRecord(id)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState({ id, status: 'unavailable', record: null, message: r.message });
          return;
        }
        setState({ id, status: 'ready', record: r.data.record, message: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          id,
          status: 'unavailable',
          record: null,
          message: `Trade Memory could not be reached: ${e?.message || e}`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // A different id means this state belongs to another trade: expose nothing.
  if (state.id !== id) {
    return { status: id ? 'loading' : 'idle', record: null, message: null };
  }

  return { status: state.status, record: state.record, message: state.message };
}
