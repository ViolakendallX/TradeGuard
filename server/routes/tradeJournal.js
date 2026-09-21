/**
 * Trade Memory journal routes (Phase 12, extended in Phase 13).
 *
 *   POST /api/journal       — save (create or update) one trade in Trade Memory.
 *   GET  /api/journal       — list the saved trades, newest first (summaries).
 *   GET  /api/journal/:id   — read one saved trade in full.
 *
 * Phase 13 added one optional group to the stored record — the trader's own
 * reflection, written in Trader Review. It is additive: a record saved by the
 * Phase 12 build (no `traderReview` key) still reads back correctly, as an
 * honest "not recorded" rather than an error or a repaired guess.
 *
 * Body for POST: { id, idea, decision, execution, review, notes, traderReview }
 *   - id        REQUIRED. The trade session id. It is what makes a save an UPSERT
 *               rather than a duplicate: saving the same session twice updates the
 *               same record. It is validated, never trusted.
 *   - idea      the submitted trade context (Phase 1) — asset, direction, thesis,
 *               timeframe, entry, invalidation, risk amount, confidence, position.
 *   - decision  the Phase 9 human decision record (the trader's own choice).
 *   - execution the Phase 10 paper-execution record, if one exists.
 *   - review    the Phase 11 assembled review, if one exists.
 *   - notes     the trader's own review notes, stored verbatim.
 *   - traderReview  the trader's own reflection (Phase 13) — `{ notes }`, stored
 *               verbatim. Omitted or null keeps whatever was stored before, so a
 *               save that does not carry it can never erase it.
 *
 * Every group except `id` is OPTIONAL and group-scoped: whatever the request does
 * not carry is left exactly as it was. That is what lets Trader Review look back
 * at an older trade and save ONLY a reflection — `{ id, traderReview }` — without
 * re-sending, and so without any chance of rewriting, that trade's thesis,
 * decision, execution or review. Such a write is refused for an id that is not
 * already saved, so it can never create a record that has no trade in it.
 *
 * Design rules:
 *   - This is MEMORY, not analysis. Nothing here runs the chain: no market call,
 *     no model, no risk engine, no structure, no report. It normalises what it is
 *     given and writes it to one JSON file.
 *   - It never computes profit, loss, return or performance. `pnl` and `filled`
 *     are null by construction and cannot be supplied by the client.
 *   - It never invents an order ID or a fill. The only path to an order ID is a
 *     real venue result on a 'submitted' record.
 *   - It never generates a recommendation, a prediction, a signal, or a
 *     good/bad-trade classification. There is no field for one.
 *   - GET always returns 200. A missing record is a 404 with an honest body; a
 *     corrupt journal file is reported in the body rather than thrown, so the UI
 *     can say what is actually wrong instead of showing a blank list.
 *   - The handler never returns 500.
 *   - No credential value is ever read into a response or a log line.
 *
 * OWNERSHIP (added with real authentication)
 * Every route here requires an authenticated session, and every operation is
 * scoped to the account behind it. The owner is read from `req.user.id` — set by
 * the auth middleware from the session — and NEVER from the request body, query
 * or headers, so a client cannot ask for someone else's Trade Memory by naming
 * them. Reading another account's trade id returns the ordinary 404 body, which
 * is the same answer a genuinely unknown id gets: a distinct "403 forbidden"
 * would confirm the id is real.
 */

import { Router } from 'express';
import {
  createJournalStore,
  auditJournal,
  normalizeSessionId,
  newSessionId,
  JOURNAL_STORAGE_NOTE,
  JOURNAL_METHOD_NOTE,
  JOURNAL_DISCLAIMER,
  JOURNAL_LIMITATIONS,
  JOURNAL_STATE_LABELS,
  TRADER_REVIEW_STATUS_LABELS,
  TRADER_REFLECTION_NOTE,
  DEFAULT_JOURNAL_FILE,
  JOURNAL_FILE_ENV,
} from '../services/tradeJournal.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/** The file the journal is ACTUALLY reading and writing right now. */
function journalFilePath() {
  return process.env[JOURNAL_FILE_ENV] || DEFAULT_JOURNAL_FILE;
}

/**
 * The store for this request, scoped to the authenticated account.
 * Recreated per call so the file can be configured and the scope is never stale.
 *
 * `req.user.id` is the ONLY source of the owner. It is written by `requireAuth`
 * from the session, so it cannot be influenced by the client.
 */
function store(req) {
  return createJournalStore({
    filePath: journalFilePath(),
    userId: req.user.id,
  });
}

/**
 * How many records predate accounts and therefore belong to nobody.
 *
 * Reported so the situation is visible rather than silent: a trader with a
 * pre-auth journal sees an empty Trade Memory AND an explanation, instead of
 * concluding their data was deleted.
 */
function legacyReport() {
  const audit = auditJournal({ filePath: journalFilePath() });
  if (!audit.ok) return { count: 0, known: false, note: null };
  return {
    count: audit.unattributed,
    known: true,
    note:
      audit.unattributed > 0
        ? `${audit.unattributed} saved trade${audit.unattributed === 1 ? '' : 's'} in this journal ` +
          'were recorded before accounts existed and belong to no account, so they are not shown. ' +
          'They have not been deleted and have not been attributed to anyone.'
        : null,
  };
}

/** Static contract description, returned with every response. */
export function meta() {
  return {
    phase: 12,
    scope: {
      kind: 'authenticated-user',
      source: 'session',
      // Stated explicitly so it is never mistaken for a client-supplied field.
      clientSuppliedUserId: false,
      note:
        'Every Trade Memory operation is scoped to the account behind the request session. ' +
        'A record belonging to another account is reported as not found.',
    },
    states: { ...JOURNAL_STATE_LABELS },
    storage: {
      kind: 'local-json-file',
      // The resolved path, so an override is never hidden behind a default.
      path: journalFilePath(),
      override: JOURNAL_FILE_ENV,
      note: JOURNAL_STORAGE_NOTE,
      cloud: false,
      database: false,
      encrypted: false,
      backedUp: false,
    },
    sources: {
      trade: 'Phase 1 submitted trade context — the thesis is preserved verbatim',
      investigation: 'Phase 3/4/5/6/7/8 states as recorded in the Phase 11 review — nothing is re-run',
      decision: 'Phase 9 human decision — recorded by the trader, never chosen or scored here',
      execution: 'Phase 10 paper-execution state and result — read only, never re-submitted',
      review: 'Phase 11 assembled review, stored as a compact projection',
      notes: 'Written by the trader — never generated, completed or edited by TradeGuard',
      traderReview: 'Phase 13 trader reflection — written by the trader, stored verbatim',
    },
    // The journal itself is the Phase 12 feature; the trader's own reflection was
    // added in Phase 13. Both are reported rather than one number overwriting the
    // other, so neither phase's contract becomes ambiguous.
    traderReview: {
      phase: 13,
      statuses: { ...TRADER_REVIEW_STATUS_LABELS },
      note: TRADER_REFLECTION_NOTE,
    },
    derived: {
      pnl: null,
      filled: null,
      note: 'Trade Memory computes no profit, loss, fill, score, rating or performance figure. Those fields are null by construction.',
    },
    method: JOURNAL_METHOD_NOTE,
    disclaimer: JOURNAL_DISCLAIMER,
    limitations: [...JOURNAL_LIMITATIONS],
    generatedAt: new Date().toISOString(),
  };
}

/** Reads the journal sources off the request body, tolerating missing inputs. */
function readSources(body) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (v) => (v && typeof v === 'object' ? v : null);
  return {
    id: b.id,
    idea: pick(b.idea) || pick(b.context) || pick(b.trade) || null,
    decision: pick(b.decision),
    execution: pick(b.execution),
    review: pick(b.review),
    // Notes are raw text and may legitimately be the empty string.
    notes: typeof b.notes === 'string' ? b.notes : null,
    // The Phase 13 reflection. Left null when the client does not carry one, so
    // an ordinary save cannot silently wipe a reflection the trader wrote.
    traderReview: pick(b.traderReview),
  };
}

/**
 * POST /api/journal — save one trade to Trade Memory.
 *
 * Always 200 on success (201 when the record is new), 400 only when the session
 * id is missing or unusable — because without an id there is nothing to upsert
 * against, and silently inventing one would scatter one trade across many rows.
 */
router.post('/journal', requireAuth, (req, res) => {
  const sources = readSources(req.body);

  const id = normalizeSessionId(sources.id);
  if (!id) {
    return res.status(400).json({
      status: 'invalid',
      message:
        'A trade session id is required to save this trade to Trade Memory. It is what makes saving ' +
        'an update rather than a duplicate.',
      errors: { id: 'A valid trade session id is required.' },
      ...meta(),
    });
  }

  let result;
  try {
    // The owner is `req.user.id` from the session. `sources.userId`, if a client
    // sent one, is not read at all — `readSources` does not even copy it.
    result = store(req).upsert({ ...sources, id });
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      message: `The trade could not be saved to Trade Memory: ${e?.message || e}`,
      record: null,
      ...meta(),
    });
  }

  if (!result.ok) {
    return res.status(200).json({
      status: 'unavailable',
      message: result.problem,
      record: null,
      ...meta(),
    });
  }

  return res.status(result.created ? 201 : 200).json({
    status: 'saved',
    created: result.created,
    message: result.created
      ? 'This trade has been saved to Trade Memory. It will still be here after a page reload.'
      : 'This trade has been updated in Trade Memory.',
    record: result.record,
    ...meta(),
  });
});

/**
 * GET /api/journal — the saved trades, newest first.
 *
 * Returns summaries only: enough to identify and choose a trade, without
 * shipping every full record on every visit.
 */
router.get('/journal', requireAuth, (req, res) => {
  let loaded;
  try {
    // Scoped to the session account: the store is constructed with `req.user.id`,
    // so `list()` can only ever see this account's records.
    loaded = store(req).list();
  } catch (e) {
    return res.status(200).json({
      status: 'unavailable',
      message: `Trade Memory could not be read: ${e?.message || e}`,
      records: [],
      count: 0,
      ...meta(),
    });
  }

  if (!loaded.ok) {
    // The honest answer: the journal exists but could not be read. Not an empty
    // list, which would look like "you have no saved trades".
    return res.status(200).json({
      status: 'unavailable',
      message: loaded.problem,
      records: [],
      count: 0,
      ...meta(),
    });
  }

  // Only when this account has nothing to show is the pre-account situation
  // worth explaining: an empty Trade Memory that is actually a hidden one must
  // say so, or it reads as data loss.
  const legacy = loaded.summaries.length ? null : legacyReport();

  return res.status(200).json({
    status: 'ok',
    message: loaded.summaries.length
      ? `${loaded.summaries.length} saved trade${loaded.summaries.length === 1 ? '' : 's'}.`
      : legacy?.note || 'No trades have been saved to Trade Memory yet.',
    records: loaded.summaries,
    count: loaded.summaries.length,
    legacy,
    ...meta(),
  });
});

/** GET /api/journal/:id — one saved trade, in full. */
router.get('/journal/:id', requireAuth, (req, res) => {
  let loaded;
  try {
    // Scoped to the session account. An id that belongs to another account is
    // simply not in this store, so it takes the same 404 path as an unknown id —
    // the response never confirms that someone else's trade exists.
    loaded = store(req).get(req.params.id);
  } catch (e) {
    return res.status(200).json({
      status: 'unavailable',
      message: `Trade Memory could not be read: ${e?.message || e}`,
      record: null,
      ...meta(),
    });
  }

  if (!loaded.ok) {
    return res.status(200).json({ status: 'unavailable', message: loaded.problem, record: null, ...meta() });
  }

  if (!loaded.record) {
    return res.status(404).json({
      status: 'not-found',
      message: 'No saved trade with that id exists in Trade Memory.',
      id: String(req.params.id || ''),
      record: null,
      ...meta(),
    });
  }

  return res.status(200).json({ status: 'ok', record: loaded.record, ...meta() });
});

export { newSessionId };
export default router;
