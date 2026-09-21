/**
 * Trade Memory client (Phase 12, extended in Phase 13).
 *
 * Three small pieces, all of them about REMEMBERING and READING BACK:
 *
 *   - `newSessionId()` — the identity of one trade session. It is what makes a
 *     save an upsert, and what keeps two trades apart in the journal.
 *   - `useJournalSync()` — saves the current trade to Trade Memory whenever the
 *     records that describe it change. It writes only what the app already holds.
 *     Phase 13 added the trader's own reflection to that payload.
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

import { useCallback, useEffect, useState } from 'react';
import { fetchJournalList, fetchJournalRecord, saveJournalRecord, saveJournalReflection } from './api.js';

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
 * Which saved trade Trader Review should show.
 *
 * Trader Review is a REVIEW of a trade that has already been decided, so it must
 * work whether or not the trader currently has a trade open:
 *
 *   1. an explicit selection wins — the trader clicked a saved trade;
 *   2. otherwise the CURRENT trade session, if there is one, so Trader Review
 *      still defaults to the trade being worked on;
 *   3. otherwise the most recently saved trade in Trade Memory, so a trader who
 *      has closed the app can still look back at what they recorded;
 *   4. otherwise nothing, and the screen says so honestly.
 *
 * Note the explicit selection is only honoured while that record is still in the
 * list, so a stale id can never point the screen at a trade that is not there.
 *
 * Pure on purpose: this is the rule that decides "what am I looking at", and it
 * is the thing most likely to be got wrong, so it is testable on its own.
 */
export function resolveReviewRecordId({ selectedId = null, sessionId = null, records = [] } = {}) {
  const list = Array.isArray(records) ? records : [];
  const has = (id) => Boolean(id) && list.some((r) => r && r.id === id);

  if (has(selectedId)) return selectedId;
  if (sessionId) return sessionId;
  return list[0]?.id ?? null;
}

/**
 * Saves the current trade to Trade Memory.
 *
 * @param {object} input
 *   - sessionId     the current trade session id (no id, no save)
 *   - idea          the submitted trade context
 *   - decision      the recorded human decision, or null
 *   - execution     the paper-execution record or gate evaluation, or null
 *   - review        the assembled Phase 11 review, or null
 *   - notes         the trader's own review notes
 *   - traderReview  the trader's own reflection, or null to leave the stored one
 *                   alone. Only ever passed once the trader has actually written
 *                   (or cleared) it — see App.jsx — so an ordinary save cannot
 *                   wipe a reflection that is already stored.
 * @returns {{ state: 'idle'|'pending'|'saved'|'failed', at: string|null, message: string|null }}
 */
export function useJournalSync({ sessionId, idea, decision, execution, review, notes, traderReview }) {
  const [status, setStatus] = useState({ state: 'idle', at: null, message: null });

  // The reflection is an object identity that changes on every keystroke, so the
  // effect keys on its TEXT rather than the object.
  const reflectionNotes = traderReview && typeof traderReview.notes === 'string' ? traderReview.notes : null;

  useEffect(() => {
    if (!sessionId || !idea) return undefined;

    let cancelled = false;
    setStatus((prev) => ({ ...prev, state: 'pending' }));

    const timer = setTimeout(() => {
      saveJournalRecord(sessionId, {
        idea,
        decision,
        execution,
        review,
        notes,
        traderReview: reflectionNotes === null ? null : { notes: reflectionNotes },
      })
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
  }, [sessionId, idea, decision, execution, review, notes, reflectionNotes]);

  return status;
}

/**
 * Saves ONLY the trader's reflection on an already-saved trade.
 *
 * This is the Trader Review path for a trade that is NOT the current session —
 * an older trade opened from Trade Memory. The trade's own records are not
 * re-sent: this carries the reflection and nothing else, so the stored thesis,
 * decision, execution, review and notes cannot be rewritten by looking back at
 * them.
 *
 * `notes === null` means "the trader has not touched this reflection", and
 * nothing is written at all. That distinction is what keeps simply *opening* a
 * saved trade from writing to it.
 *
 * @returns {{ state: 'idle'|'pending'|'saved'|'failed', at: string|null, message: string|null }}
 */
export function useJournalReflectionSync({ id, notes }) {
  const [status, setStatus] = useState({ state: 'idle', at: null, message: null });

  // A different trade is a different reflection: drop the previous trade's save
  // state rather than showing it against this one.
  useEffect(() => {
    setStatus({ state: 'idle', at: null, message: null });
  }, [id]);

  useEffect(() => {
    if (!id || notes === null) return undefined;

    let cancelled = false;
    setStatus((prev) => ({ ...prev, state: 'pending' }));

    const timer = setTimeout(() => {
      saveJournalReflection(id, notes)
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
  }, [id, notes]);

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
  const [state, setState] = useState({
    id: null,
    status: 'idle',
    kind: null,
    record: null,
    meta: null,
    message: null,
  });
  const [nonce, setNonce] = useState(0);
  // Stable, so a caller can refetch in an effect keyed on its own save state
  // without the effect re-firing on every render.
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!id) return undefined;

    let cancelled = false;

    // A refetch for the SAME id keeps the record that is already on screen; only
    // a different id starts from a clean slate. This is what lets the Trader
    // Review panel re-read the record after a save without unmounting — and so
    // without stealing focus from — the editor the trader is typing in.
    setState((prev) =>
      prev.id === id && prev.record
        ? prev
        : { id, status: 'loading', kind: null, record: null, meta: null, message: null }
    );

    fetchJournalRecord(id)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState((prev) =>
            prev.id === id && prev.record
              ? prev // a failed refresh must not blank a record we already have
              : {
                  id,
                  status: 'unavailable',
                  // `not-found` is NOT the same as unreadable: the trade simply
                  // has not been written to the journal yet (the save is
                  // debounced), so the screen can say that honestly.
                  kind: r.kind || 'server',
                  record: null,
                  meta: null,
                  message: r.message,
                }
          );
          return;
        }
        setState({ id, status: 'ready', kind: null, record: r.data.record, meta: r.data, message: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState((prev) =>
          prev.id === id && prev.record
            ? prev
            : {
                id,
                status: 'unavailable',
                kind: 'server',
                record: null,
                meta: null,
                message: `Trade Memory could not be reached: ${e?.message || e}`,
              }
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  // A different id means this state belongs to another trade: expose nothing.
  if (state.id !== id) {
    return {
      status: id ? 'loading' : 'idle',
      kind: null,
      record: null,
      meta: null,
      message: null,
      reload,
    };
  }

  return {
    status: state.status,
    kind: state.kind,
    record: state.record,
    meta: state.meta,
    message: state.message,
    reload,
  };
}
