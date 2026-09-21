/**
 * Trade Memory journal service (Phase 12).
 *
 * Purpose: REMEMBER a completed trade session, so the trader can come back to it
 * later — after navigating away, after reloading the page, or after restarting
 * the frontend — and see what was originally recorded.
 *
 * This is a MEMORY. It is deliberately not an analytics engine, not a learning
 * engine, not a portfolio manager and not a performance tracker. Phase 12 is
 * storage and retrieval, nothing more.
 *
 * What this module deliberately never does:
 *   - It never computes a profit, a loss, a return, a win rate, an expectancy, a
 *     score, a rating or a ranking. There is no such field: `execution.pnl` and
 *     `execution.filled` are hard-coded to null and are never derived.
 *   - It never invents an order. `execution.orderId` is taken ONLY from a real
 *     venue result on a record whose status is 'submitted'. If the venue returned
 *     no order ID then there is no order ID — null, not a placeholder.
 *   - It never treats a submitted demo order as a filled order, and never treats
 *     a recorded TAKE as a successful trade. A recorded TAKE is a recorded human
 *     decision, and nothing more.
 *   - It never generates a recommendation, a prediction, a signal, or a
 *     "good trade / bad trade" classification. There is no field for one.
 *   - It never rewrites what the trader wrote. The thesis, the decision reason,
 *     the trader's review notes and the trader's own reflection are stored
 *     verbatim — not trimmed, not summarised, not completed, not generated.
 *   - It never grades a reflection or turns it into a lesson, a score or a
 *     pattern. A reflection is the trader's own words and nothing more.
 *   - It never runs the analysis chain. Reading the journal touches no provider,
 *     no model, no engine and no network — it reads one file.
 *
 * Storage: one JSON file on the TradeGuard server
 * (`server/data/trade-journal.json` by default, overridable with
 * `TRADEGUARD_JOURNAL_FILE`). This is deliberately the smallest reliable
 * mechanism that fits the existing architecture: one Express process, no
 * database, no migrations, no authentication, no cloud service, no cache server.
 *
 * It is LOCAL storage on the TradeGuard server — not cloud storage, not a
 * database and not a backup — and the UI is told to label it as such.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');

export const JOURNAL_VERSION = 1;

/** Where the journal lives by default, and the environment override for it. */
export const DEFAULT_JOURNAL_FILE = path.join(SERVER_ROOT, 'data', 'trade-journal.json');
export const JOURNAL_FILE_ENV = 'TRADEGUARD_JOURNAL_FILE';

/**
 * The journal row state — how a saved trade is identified in the list. Three
 * deterministic states, no ranking and no judgement about the trade.
 */
export const JOURNAL_STATE = Object.freeze({
  NO_DECISION: 'no-decision', // saved, but no human decision was ever recorded
  DECIDED: 'decided', // a decision was recorded; no paper order was submitted
  EXECUTED: 'executed', // a paper order was actually submitted to the demo venue
});

export const JOURNAL_STATE_LABELS = Object.freeze({
  'no-decision': 'NO DECISION',
  decided: 'DECISION RECORDED',
  executed: 'PAPER ORDER SUBMITTED',
});

/** The investigation stages the record remembers, and their human names. */
export const STAGE_LABELS = Object.freeze({
  research: 'Market & event research',
  attack: "Devil's Advocate",
  history: 'Historical stress test',
  plan: 'Risk engine & trade structure',
  report: 'Final report',
});

export const INVESTIGATION_STATUS_LABELS = Object.freeze({
  complete: 'INVESTIGATION COMPLETE',
  partial: 'INVESTIGATION PARTIAL',
  unavailable: 'INVESTIGATION UNAVAILABLE',
  'not-recorded': 'INVESTIGATION NOT RECORDED',
});

/**
 * The trader's own reflection (Phase 13) — the note they write when they look
 * back at a completed trade in Trader Review.
 *
 * It is stored SEPARATELY from the Phase 11 review notes on purpose: those were
 * written at review time, this is written afterwards, and neither may overwrite
 * the other. Both are the trader's own words and both are shown back to them.
 */
export const TRADER_REVIEW_STATUS = Object.freeze({
  NOT_RECORDED: 'not-recorded', // no reflection was written
  RECORDED: 'recorded', // the trader wrote one
});

export const TRADER_REVIEW_STATUS_LABELS = Object.freeze({
  'not-recorded': 'REFLECTION NOT RECORDED',
  recorded: 'REFLECTION RECORDED',
});

export const TRADER_REFLECTION_NOTE =
  'Your reflection is your own words, stored exactly as you wrote it. TradeGuard never generates, ' +
  'completes, scores or grades it, and it is not an assessment of whether the trade worked.';

/** The single honest answer for profit/loss, everywhere, always. */
export const PNL_NOTE = 'Outcome not yet available.';

export const JOURNAL_STORAGE_NOTE =
  'Trade Memory is stored in a single JSON file on the TradeGuard server (local persistence on this ' +
  'machine). It is not cloud storage, not a database and not a backup — it is the smallest mechanism ' +
  'that lets a recorded trade survive a page reload and a frontend restart in this build.';

export const JOURNAL_METHOD_NOTE =
  'Trade Memory stores the records TradeGuard already produced for a completed trade — the thesis, the ' +
  'investigation state, your recorded decision, the paper-execution state, your own review notes and ' +
  'your own reflection — and reads them back later. It runs no analysis, calls no model, calculates no ' +
  'profit or loss, and draws no conclusion about how the trade turned out.';

export const JOURNAL_DISCLAIMER =
  'A saved trade is a record of what you decided and what was (or was not) executed. It is not evidence ' +
  'that the trade worked. A recorded TAKE is not a successful trade, and a submitted demo order is not a ' +
  'filled order. No profit, loss, win rate or performance figure is ever computed here.';

export const JOURNAL_LIMITATIONS = Object.freeze([
  'Trade Memory never calculates or displays profit, loss, return or performance. Those fields are stored ' +
    'as null by construction, because a verified execution outcome that reports them does not exist.',
  'No order ID is ever invented. If the demo venue returned no order ID, the record says so rather than ' +
    'showing a placeholder.',
  'A submitted demo order is not a filled order. The record never claims a fill.',
  'A recorded TAKE is only a record of your own decision. Trade Memory does not classify it as good, bad, ' +
    'correct or successful.',
  'Records are stored locally on the TradeGuard server as plain JSON. They are not encrypted, not backed ' +
    'up, and not synced anywhere.',
]);

// --- small helpers ----------------------------------------------------------

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Trimmed, non-empty text or null. Used for metadata, never for trader prose. */
function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Raw text, preserved EXACTLY as written. Used for thesis, reason and notes. */
function raw(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : String(v);
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v) {
  const s = txt(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Collapses whitespace and truncates, for the list preview only. */
function preview(text, max) {
  const s = txt(text);
  if (!s) return null;
  const flat = s.replace(/\s+/g, ' ');
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

// --- the session id ---------------------------------------------------------

const ID_MAX_LENGTH = 64;
const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * A journal record is identified by the trade session id. It is validated rather
 * than trusted: a malformed id would make upsert ambiguous, and an unbounded one
 * would be a way to write junk keys into the store.
 *
 * Only a string is accepted. A number, an object or an empty value is not
 * coerced — a silent coercion is how two different ids end up as the same key.
 *
 * @returns {string|null} the normalised id, or null when it is unusable
 */
export function normalizeSessionId(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  if (s.length > ID_MAX_LENGTH) return null;
  if (!ID_PATTERN.test(s)) return null;
  return s;
}

/** A fresh session id, used when a caller does not supply one. */
export function newSessionId() {
  return randomUUID();
}

/**
 * The owner of a record: an account id, or null for an unattributed record.
 *
 * A userId is never accepted from a client — the route layer reads it from the
 * authenticated session and passes it in. This function only guards the SHAPE,
 * so a hand-edited file cannot introduce an owner that is an object or an array
 * and confuse the scoping comparison.
 *
 * @returns {string|null}
 */
export function normalizeUserId(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.length > 128) return null;
  return s;
}

// --- normalising each group -------------------------------------------------

const DECISIONS = ['TAKE', 'WAIT', 'SKIP'];

/** The trade itself, carried through from the submitted idea. Never re-derived. */
function normalizeTrade(source) {
  const t = isObj(source) ? source : {};
  const direction = txt(t.direction)?.toLowerCase() || null;
  const existingPosition = txt(t.existingPosition)?.toLowerCase() || null;

  let confidence = num(t.confidence);
  if (confidence !== null && (confidence < 1 || confidence > 10)) confidence = null;

  return {
    asset: txt(t.asset)?.toUpperCase() || null,
    direction,
    // The trader's own words, exactly as written.
    thesis: raw(t.thesis),
    timeframe: txt(t.timeframe)?.toLowerCase() || null,
    entryPrice: num(t.entryPrice),
    invalidationPrice: num(t.invalidationPrice),
    riskAmount: num(t.riskAmount),
    confidence,
    existingPosition,
  };
}

/** The trader's recorded decision. Recorded, never chosen, never scored. */
function normalizeDecision(source) {
  const d = isObj(source) ? source : {};
  const claimed = txt(d.decision)?.toUpperCase() || null;
  const decision = DECISIONS.includes(claimed) ? claimed : null;

  // A decision only exists when a valid one was actually stated. An unstated or
  // unrecognised value is NOT silently defaulted to anything.
  const status = txt(d.status) === 'recorded' && decision !== null ? 'recorded' : 'required';

  return {
    status,
    decision,
    // The trader's own reason, stored verbatim — never trimmed, never generated.
    reason: status === 'recorded' ? raw(d.reason) : null,
    timestamp: status === 'recorded' ? iso(d.timestamp) : null,
  };
}

const EXECUTION_STATES = ['locked', 'ready', 'unavailable', 'submitted', 'failed', 'unknown'];

const EXECUTION_LABELS = Object.freeze({
  locked: 'EXECUTION LOCKED',
  ready: 'READY FOR PAPER EXECUTION',
  unavailable: 'PAPER EXECUTION UNAVAILABLE',
  submitted: 'PAPER ORDER SUBMITTED',
  failed: 'PAPER ORDER FAILED',
  unknown: 'EXECUTION STATE UNKNOWN',
  'not-recorded': 'EXECUTION NOT RECORDED',
});

/**
 * The paper-execution state and, when it genuinely exists, its result.
 *
 * The ONLY path to a non-null orderId is a 'submitted' record whose own result
 * carries one. Everything else is null, including the "the venue did not return
 * an ID" case — which is reported as unavailable, not filled in.
 */
function normalizeExecution(source) {
  const e = isObj(source) ? source : null;

  if (!e) {
    return {
      status: 'not-recorded',
      statusLabel: EXECUTION_LABELS['not-recorded'],
      statusDetail: 'No paper-execution record was saved for this trade.',
      orderId: null,
      order: null,
      intendedOrder: null,
      submittedAt: null,
      // Never derived. A demo submission is not a fill, so this stays null.
      filled: null,
      fillNote: null,
      // Never derived. TradeGuard does not compute profit or loss.
      pnl: null,
      pnlNote: PNL_NOTE,
    };
  }

  const claimed = txt(e.status);
  const status = EXECUTION_STATES.includes(claimed) ? claimed : 'not-recorded';

  // The ONE AND ONLY way an order ID can exist: a venue payload that carries one,
  // on a record whose status is 'submitted'. A bare top-level `orderId` is never
  // trusted — that is exactly the field a hand-edited file would try to smuggle
  // through, and normalisation runs again on every read.
  //
  // `result` is the venue's own response (fresh from Phase 10). `order` carrying
  // an orderId is that same response re-read from disk, which is what makes this
  // function idempotent: normalising a stored record returns the same record.
  const venueOrder = isObj(e.result) && e.result.orderId != null
    ? e.result
    : isObj(e.order) && e.order.orderId != null
    ? e.order
    : null;

  const hasOrder = status === 'submitted' && venueOrder !== null;
  const orderId = hasOrder ? txt(venueOrder.orderId) : null;

  const order = hasOrder
    ? {
        orderId,
        symbol: txt(venueOrder.symbol),
        side: txt(venueOrder.side),
        quantity: num(venueOrder.quantity),
        price: num(venueOrder.price),
        orderType: txt(venueOrder.orderType),
        submittedAt: iso(venueOrder.submittedAt),
        environment: txt(venueOrder.environment) || 'demo',
      }
    : null;

  // What was PREPARED is kept separately and explicitly labelled as not
  // submitted, so it can never be mistaken for a real order. `intendedOrder` is
  // read back too, so a prepared order survives a reload without ever becoming
  // an order that was placed.
  const preparedSource = !hasOrder
    ? isObj(e.order)
      ? e.order
      : isObj(e.intendedOrder)
      ? e.intendedOrder
      : null
    : null;

  const intendedOrder = preparedSource
    ? {
        symbol: txt(preparedSource.symbol),
        side: txt(preparedSource.side),
        quantity: num(preparedSource.quantity),
        price: num(preparedSource.price),
        orderType: txt(preparedSource.orderType),
        environment: 'demo',
        submitted: false,
      }
    : null;

  return {
    status,
    statusLabel: txt(e.statusLabel) || EXECUTION_LABELS[status],
    statusDetail: txt(e.statusDetail) || txt(e.reason) || null,
    orderId,
    order,
    intendedOrder,
    submittedAt: iso(venueOrder?.submittedAt) ?? iso(e.submittedAt) ?? null,
    filled: null,
    fillNote:
      status === 'submitted'
        ? 'Order submitted; fill outcome not available.'
        : null,
    pnl: null,
    pnlNote: PNL_NOTE,
  };
}

/** A compact projection of the Phase 11 review — only what the journal shows. */
function normalizeReview(source) {
  const r = isObj(source) ? source : null;
  if (!r) return null;

  const plan = isObj(r.plan)
    ? {
        entryPrice: num(r.plan.entryPrice),
        invalidationPrice: num(r.plan.invalidationPrice),
        riskBudget: num(r.plan.riskBudget),
        priceRiskPerUnit: num(r.plan.priceRiskPerUnit),
        positionSize: num(r.plan.positionSize),
        definedRisk: num(r.plan.definedRisk),
      }
    : null;

  const execRec = isObj(r.executionRecord)
    ? {
        executed: r.executionRecord.executed === true,
        status: txt(r.executionRecord.status),
        detail: txt(r.executionRecord.detail),
      }
    : null;

  const outcome = isObj(r.outcome)
    ? {
        status: txt(r.outcome.status),
        executed: r.outcome.executed === true,
        fillNote: txt(r.outcome.fillNote),
        // Forced null regardless of what was posted.
        pnl: null,
        pnlNote: txt(r.outcome.pnlNote) || PNL_NOTE,
      }
    : null;

  const known = isObj(r.knownBefore) ? r.knownBefore : null;
  const knownBefore = known
    ? {
        finalReport: compactBlock(known.finalReport),
        marketContext: compactBlock(known.marketContext),
        eventsCatalysts: compactBlock(known.eventsCatalysts),
        devilsAdvocate: compactBlock(known.devilsAdvocate),
        historicalStressTest: compactBlock(known.historicalStressTest),
      }
    : null;

  return {
    status: txt(r.status) || 'unknown',
    statusLabel: txt(r.statusLabel) || null,
    statusDetail: txt(r.statusDetail) || null,
    plan,
    executionRecord: execRec,
    outcome,
    knownBefore,
  };
}

/**
 * The trader's own reflection on the completed trade (Phase 13).
 *
 * Idempotent, like every other group here: it accepts both the request shape
 * (`{ notes, recordedAt }`) and its own stored shape (`{ status, statusLabel,
 * notes, recordedAt, updatedAt }`), so a read-modify-write upsert cannot corrupt
 * it. A reflection exists only when the trader actually wrote something — an
 * empty or whitespace-only note is "not recorded", never an empty string
 * presented as a written reflection.
 */
function normalizeTraderReview(source, now) {
  const s = isObj(source) ? source : null;
  const stamp = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const stampIso = stamp.toISOString();

  const notes = s ? raw(s.notes) : null;
  const hasNotes = Boolean(txt(notes));
  const status = hasNotes ? TRADER_REVIEW_STATUS.RECORDED : TRADER_REVIEW_STATUS.NOT_RECORDED;

  return {
    status,
    statusLabel: TRADER_REVIEW_STATUS_LABELS[status],
    // Verbatim. Never trimmed, summarised or generated.
    notes: hasNotes ? notes : null,
    recordedAt: hasNotes ? iso(s?.recordedAt) || stampIso : null,
  };
}

function compactBlock(block) {
  if (!isObj(block)) return null;
  return {
    available: block.available !== false,
    summary: txt(block.summary),
  };
}

/**
 * The remembered investigation state.
 *
 * The review's own "what was known before the decision" block IS the recorded
 * investigation state, so it is read rather than re-derived — no research is
 * re-run and no engine is re-executed to write a journal row.
 */
export function summarizeInvestigation(review) {
  const known = isObj(review?.knownBefore) ? review.knownBefore : null;

  const stages = {
    research: 'unknown',
    attack: 'unknown',
    history: 'unknown',
    plan: 'unknown',
    report: 'unknown',
  };

  if (known) {
    const availability = (block) => (isObj(block) ? block.available !== false : null);

    const market = availability(known.marketContext);
    const events = availability(known.eventsCatalysts);
    stages.research =
      market === null && events === null
        ? 'unknown'
        : market === true || events === true
        ? market === true && events === true
          ? 'available'
          : 'partial'
        : 'unavailable';

    const stage = (block) => {
      const a = availability(block);
      return a === null ? 'unknown' : a ? 'available' : 'unavailable';
    };
    stages.attack = stage(known.devilsAdvocate);
    stages.history = stage(known.historicalStressTest);
    stages.report = stage(known.finalReport);
  }

  // The review's plan block is the joint output of the Phase 6 risk engine and
  // the Phase 7 structure — the review only builds it when both are present.
  const planPresent = isObj(review?.plan);
  stages.plan = known ? (planPresent ? 'available' : 'unavailable') : 'unknown';

  const values = Object.values(stages);
  const status = !known
    ? 'not-recorded'
    : values.every((v) => v === 'available')
    ? 'complete'
    : values.every((v) => v === 'unavailable')
    ? 'unavailable'
    : 'partial';

  return { status, statusLabel: INVESTIGATION_STATUS_LABELS[status], stages };
}

/**
 * Everything this record does NOT have, stated plainly. This is what makes the
 * "unavailable must show as unavailable" rule structural rather than a matter of
 * remembering to render a dash in the UI.
 *
 * @returns {string[]}
 */
export function deriveUnavailable(record) {
  const out = [];
  const d = record.decision;
  const e = record.execution;
  const r = record.review;

  // --- the human decision ---------------------------------------------------
  if (d.status !== 'recorded') {
    out.push('Human decision: not recorded for this trade.');
  } else {
    if (!d.reason) out.push('Decision reason: none was recorded.');
    if (!d.timestamp) out.push('Decision timestamp: not recorded.');
  }

  // --- the paper execution --------------------------------------------------
  switch (e.status) {
    case 'not-recorded':
      out.push('Paper execution: no execution record was saved for this trade.');
      break;
    case 'locked':
      out.push('Paper execution: locked — execution requires a recorded TAKE.');
      break;
    case 'ready':
      out.push(
        'Paper order: none was submitted. The trade was ready for paper execution but no confirmation was given.'
      );
      break;
    case 'unavailable':
      out.push(`Paper execution: unavailable — ${e.statusDetail || 'the demo venue could not be reached.'}`);
      break;
    case 'failed':
      out.push(`Paper order: failed — ${e.statusDetail || 'the demo venue rejected the order.'}`);
      break;
    case 'unknown':
      out.push('Paper execution: the recorded execution state is not recognised.');
      break;
    default:
      break;
  }

  if (e.status !== 'submitted') {
    out.push('Execution result: no order was submitted, so there is no order ID and no fill.');
  } else if (!e.orderId) {
    out.push('Order ID: not returned by the venue. No order ID is invented here.');
  }

  out.push('Fill: not available. A submitted demo order is not a filled order.');
  out.push(`Profit / loss: not available. TradeGuard never calculates P&L. (${PNL_NOTE})`);

  // --- the trade review -----------------------------------------------------
  if (!r) out.push('Trade review: not recorded.');
  else if (r.status !== 'ready') out.push(`Trade review: ${r.statusLabel || r.status}`);

  // --- the trader's own reflection (Phase 13) -------------------------------
  // A reflection nobody wrote is a gap like any other, stated plainly rather
  // than rendered as a blank box that looks like an empty note.
  if (record.traderReview?.status !== TRADER_REVIEW_STATUS.RECORDED) {
    out.push('Trader reflection: none was recorded for this trade.');
  }

  // --- the recorded investigation state -------------------------------------
  for (const [key, label] of Object.entries(STAGE_LABELS)) {
    const stage = record.investigation.stages[key];
    if (stage === 'unavailable') out.push(`${label}: unavailable in the recorded investigation.`);
    else if (stage === 'unknown') out.push(`${label}: not recorded.`);
  }

  return out;
}

/**
 * Normalises one record into the canonical stored shape.
 *
 * It accepts BOTH the request shape (`{ id, idea, decision, execution, review,
 * notes }`) and its own output shape, and is idempotent: normalising a stored
 * record again returns the same record. That is what makes reading a
 * hand-edited or partially corrupted file safe — every record goes through the
 * same guards on the way out as on the way in, so `pnl` can never be smuggled in.
 *
 * @returns {object|null} null when the record has no usable id
 */
export function normalizeRecord(input, now = new Date()) {
  const src = isObj(input) ? input : {};
  const id = normalizeSessionId(src.id);
  if (!id) return null;

  const stamp = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  const review = normalizeReview(src.review);

  const record = {
    id,

    // OWNERSHIP. The account this trade belongs to, or null for a record saved
    // before accounts existed. `null` is NOT "everyone's" — it is nobody's, and
    // it is deliberately invisible to every signed-in user. See the OWNERSHIP
    // note at the head of the store section below.
    userId: normalizeUserId(src.userId),

    createdAt: iso(src.createdAt) || stamp.toISOString(),
    updatedAt: iso(src.updatedAt) || stamp.toISOString(),

    // `trade` is the stored name; `idea` is what the request calls it.
    trade: normalizeTrade(isObj(src.trade) ? src.trade : src.idea),
    investigation: summarizeInvestigation(review),
    decision: normalizeDecision(src.decision),
    execution: normalizeExecution(src.execution),
    review,

    // The trader's own review notes, stored verbatim.
    notes: raw(src.notes),

    // Phase 13: the trader's own reflection, written in Trader Review. Additive
    // and optional — a Phase 12 record saved before this field existed reads
    // back as "not recorded" rather than being rejected or repaired.
    traderReview: normalizeTraderReview(src.traderReview, stamp),
  };

  record.unavailable = deriveUnavailable(record);
  return record;
}

/** The row state shown in the journal list. Descriptive, never evaluative. */
export function stateOf(record) {
  if (!isObj(record)) return JOURNAL_STATE.NO_DECISION;
  if (record.decision?.status !== 'recorded') return JOURNAL_STATE.NO_DECISION;
  if (record.execution?.status === 'submitted') return JOURNAL_STATE.EXECUTED;
  return JOURNAL_STATE.DECIDED;
}

/** The compact row a journal list renders. No analysis, no judgement. */
export function summarizeRecord(record) {
  if (!isObj(record)) return null;
  const state = stateOf(record);

  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,

    asset: record.trade?.asset ?? null,
    direction: record.trade?.direction ?? null,
    timeframe: record.trade?.timeframe ?? null,
    thesisPreview: preview(record.trade?.thesis, 140),

    state,
    stateLabel: JOURNAL_STATE_LABELS[state],

    decision: record.decision?.decision ?? null,
    decisionLabel: record.decision?.decision ?? 'NOT RECORDED',
    decidedAt: record.decision?.timestamp ?? null,

    executionStatus: record.execution?.status ?? null,
    executionLabel: record.execution?.statusLabel ?? null,
    reviewStatus: record.review?.status ?? null,
    reviewStatusLabel: record.review?.statusLabel ?? null,

    hasNotes: Boolean(txt(record.notes)),
    notesPreview: preview(record.notes, 100),

    // Phase 13: whether the trader wrote a reflection on the completed trade.
    hasReflection: record.traderReview?.status === TRADER_REVIEW_STATUS.RECORDED,
    reflectionAt: record.traderReview?.recordedAt ?? null,

    // How much of this record is honestly missing. Shown, never hidden.
    unavailableCount: Array.isArray(record.unavailable) ? record.unavailable.length : 0,
  };
}

// --- the store --------------------------------------------------------------

/**
 * OWNERSHIP AND SCOPING — the rule this store exists to enforce
 *
 * A store is created WITH a scope: `createJournalStore({ filePath, userId })`.
 * Every read and every write is then confined to that one account, and a
 * record belonging to anyone else is indistinguishable from a record that does
 * not exist. That is deliberate: a "403 forbidden" would confirm that the id is
 * real, which is exactly what someone enumerating ids wants to learn.
 *
 * WHY THE SCOPE IS AN OPTION AND NOT A PER-CALL ARGUMENT
 * A per-call argument is one a caller can forget, and the failure mode of
 * forgetting it is silent over-permission. Binding it at construction means a
 * method cannot be invoked without a scope having been chosen.
 *
 * WHAT NO SCOPE MEANS — and why it is safe
 * A store created without a `userId` operates on the UNATTRIBUTED bucket: the
 * records whose `userId` is null, saved before accounts existed. That is the
 * least-privileged view there is — it can see legacy rows and nothing else. So a
 * caller who forgets the scope sees too little rather than too much, and can
 * never reach a real user's trade.
 *
 * LEGACY RECORDS
 * Records with `userId: null` are never shown to a signed-in user, never
 * reassigned by guesswork and never deleted. They stay in the file, and
 * `auditJournal()` reports how many there are so the situation is visible rather
 * than silently swallowed. Attributing them to an account is an explicit,
 * operator-run act — see `scripts/claim-legacy-journal.mjs`.
 */

/**
 * Creates a journal store bound to one file and one owner.
 *
 * @param {{ filePath?: string, userId?: string }} [options]
 *   `userId` scopes every operation to one account. Omit it only to work with
 *   unattributed (legacy) records.
 */
export function createJournalStore(options = {}) {
  const filePath =
    txt(options.filePath) || txt(process.env[JOURNAL_FILE_ENV]) || DEFAULT_JOURNAL_FILE;

  // null means the unattributed bucket, never "all users".
  const scope = normalizeUserId(options.userId);

  /** True when a record belongs to the scope this store was created with. */
  const owned = (record) => normalizeUserId(record?.userId) === scope;

  /**
   * Reads the file. Never throws: a missing file is an empty journal, and a
   * corrupt one is reported as a problem with an empty record set rather than
   * crashing the request. Malformed entries are skipped, not repaired.
   */
  function read() {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') {
        return { ok: true, exists: false, records: [], skipped: 0, problem: null };
      }
      return {
        ok: false,
        exists: true,
        records: [],
        skipped: 0,
        problem: `The journal file could not be read: ${e?.message || e}`,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        exists: true,
        records: [],
        skipped: 0,
        problem: 'The journal file is not valid JSON, so no saved trades could be read from it.',
      };
    }

    const list = Array.isArray(parsed)
      ? parsed
      : isObj(parsed) && Array.isArray(parsed.records)
      ? parsed.records
      : null;

    if (!list) {
      return {
        ok: false,
        exists: true,
        records: [],
        skipped: 0,
        problem: 'The journal file does not contain a records list, so no saved trades could be read from it.',
      };
    }

    // Re-normalise on the way out: a hand-edited file cannot smuggle in an
    // invented order, a fill or a P&L, and an entry without a usable id is
    // skipped rather than trusted.
    const records = [];
    for (const entry of list) {
      const normalised = normalizeRecord(entry, new Date(0));
      if (normalised) {
        // Preserve the stored timestamps exactly; only the guards are re-applied.
        normalised.createdAt = iso(entry?.createdAt) || normalised.createdAt;
        normalised.updatedAt = iso(entry?.updatedAt) || normalised.updatedAt;
        records.push(normalised);
      }
    }

    return { ok: true, exists: true, records, skipped: list.length - records.length, problem: null };
  }

  /** Writes the whole file atomically (temp file + rename), creating the dir. */
  function write(records) {
    const payload = JSON.stringify(
      { version: JOURNAL_VERSION, updatedAt: new Date().toISOString(), records },
      null,
      2
    );

    const dir = path.dirname(filePath);
    const tmp = `${filePath}.${process.pid}.tmp`;

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, filePath);
      return { ok: true, count: records.length, problem: null };
    } catch (e) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* the temp file is best-effort cleanup only */
      }
      return { ok: false, count: 0, problem: `The journal could not be written: ${e?.message || e}` };
    }
  }

  /** This owner's saved trades, newest first. Never another account's. */
  function list() {
    const loaded = read();
    if (!loaded.ok) return { ok: false, records: [], summaries: [], problem: loaded.problem };

    const records = loaded.records.filter(owned);

    const summaries = records
      .map(summarizeRecord)
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    return { ok: true, records, summaries, problem: null };
  }

  /**
   * One saved trade in full, or null.
   *
   * A record owned by someone else returns null — the same answer as a record
   * that does not exist, so the caller cannot learn that an id is taken.
   */
  function get(id) {
    const wanted = normalizeSessionId(id);
    if (!wanted) return { ok: true, record: null, problem: null };

    const loaded = read();
    if (!loaded.ok) return { ok: false, record: null, problem: loaded.problem };

    return {
      ok: true,
      record: loaded.records.find((r) => r.id === wanted && owned(r)) ?? null,
      problem: null,
    };
  }

  /** True when the id exists at all, under any owner. Used only to refuse a collision. */
  function idExistsElsewhere(id, wanted) {
    const loaded = read();
    if (!loaded.ok) return false;
    return loaded.records.some((r) => r.id === wanted && !owned(r));
  }

  /**
   * Creates or updates one saved trade.
   *
   * A group is only replaced when the request actually carried it, so a later
   * save that omits the execution record cannot silently erase an order that was
   * genuinely submitted. The one exception is deliberate: when the DECISION
   * changed, the execution belongs to the old decision and is replaced too.
   *
   * That same rule is what lets Trader Review save ONLY a reflection against an
   * older trade: the request carries `traderReview` and nothing else, so the
   * stored trade, decision, execution, review and notes are all preserved
   * untouched. A reflection-only write is refused for an id that is not already
   * in the journal, so it can never create an empty record.
   */
  function upsert(input, now = new Date()) {
    const src = isObj(input) ? input : {};
    const incoming = normalizeRecord(src, now);
    if (!incoming) {
      return {
        ok: false,
        created: false,
        record: null,
        problem: 'A session id is required to save a trade to Trade Memory.',
      };
    }

    const loaded = read();
    if (!loaded.ok) {
      return { ok: false, created: false, record: null, problem: loaded.problem };
    }

    const records = loaded.records.slice();

    // The lookup is scoped to this store's owner, so a save can only ever update
    // a record the caller already owns.
    const index = records.findIndex((r) => r.id === incoming.id && owned(r));
    const stamp = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

    // A scoped store stamps its own owner onto the record. It cannot be talked
    // into writing a record for someone else, because the owner never comes from
    // the request.
    incoming.userId = scope;

    let record;
    let created;

    if (index === -1) {
      // A save that carries no trade context at all would create a record with
      // nothing in it. The only request that can do that is a reflection-only
      // write — Trader Review editing the reflection on a trade that is no longer
      // in the journal — so it is refused rather than allowed to litter Trade
      // Memory with a row that has no trade. Every ordinary save carries the
      // submitted idea, so this cannot affect one.
      if (!isObj(src.trade) && !isObj(src.idea)) {
        return {
          ok: false,
          created: false,
          record: null,
          problem:
            'That saved trade is no longer in Trade Memory, so there is nothing to update. ' +
            'A new trade is only ever created by submitting a trade idea.',
        };
      }

      // The id is already used by ANOTHER account. Refusing keeps the file free
      // of two records sharing an id, and the message is the ordinary
      // "not in your Trade Memory" one — so a caller who guessed an id learns
      // nothing about whether it exists.
      if (idExistsElsewhere(incoming.id, incoming.id)) {
        return {
          ok: false,
          created: false,
          record: null,
          problem:
            'That saved trade is not in your Trade Memory, so there is nothing to update. ' +
            'A new trade is only ever created by submitting a trade idea.',
        };
      }

      record = incoming;
      created = true;
    } else {
      const prev = records[index];
      const carriedTrade = isObj(src.trade) || isObj(src.idea);

      // Only a request that actually CARRIED a decision can have changed it.
      // Without this guard an absent decision compares as "different" from the
      // stored one, and the rule below would then take the stored execution down
      // with it — silently erasing a genuinely submitted order. That is exactly
      // what a reflection-only save does (it carries neither a decision nor an
      // execution), so the guard is what makes looking back at an old trade safe.
      const carriedDecision = isObj(src.decision);
      const decisionChanged =
        carriedDecision &&
        (prev.decision.decision !== incoming.decision.decision ||
          prev.decision.timestamp !== incoming.decision.timestamp);

      const merged = {
        ...incoming,
        createdAt: prev.createdAt,
        updatedAt: stamp.toISOString(),
        trade: carriedTrade ? incoming.trade : prev.trade,
        decision: isObj(src.decision) ? incoming.decision : prev.decision,
        execution: isObj(src.execution)
          ? incoming.execution
          : decisionChanged
          ? incoming.execution
          : prev.execution,
        review: isObj(src.review) ? incoming.review : prev.review,
        // Notes are raw text, so the signal that the request CARRIED notes is
        // that it carried a string — `''` means the trader cleared them, and
        // anything else (absent, null, undefined) means the save does not
        // concern notes at all. Testing for the KEY instead would be wrong: the
        // route always shapes a `notes` key, so a reflection-only save would look
        // like it carried notes and would silently erase the trader's own.
        notes: typeof src.notes === 'string' ? incoming.notes : prev.notes,
        traderReview: isObj(src.traderReview)
          ? {
              ...incoming.traderReview,
              // When the trader FIRST recorded a reflection is preserved across
              // edits — re-stamping it on every keystroke would make the
              // timestamp meaningless. Clearing and re-writing does re-stamp it.
              recordedAt:
                prev.traderReview?.status === TRADER_REVIEW_STATUS.RECORDED &&
                incoming.traderReview.status === TRADER_REVIEW_STATUS.RECORDED
                  ? prev.traderReview.recordedAt
                  : incoming.traderReview.recordedAt,
            }
          : prev.traderReview,
      };

      merged.investigation = summarizeInvestigation(merged.review);
      merged.unavailable = deriveUnavailable(merged);

      record = merged;
      created = false;
    }

    if (created) records.push(record);
    else records[index] = record;

    const written = write(records);
    if (!written.ok) {
      return { ok: false, created: false, record: null, problem: written.problem };
    }

    return { ok: true, created, record, problem: null };
  }

  return { filePath, userId: scope, read, write, list, get, upsert };
}

/**
 * Reports the shape of the journal WITHOUT exposing any record's content.
 *
 * This is the only function that looks across owners, and it returns counts
 * only — never an id, never a thesis, never an owner. It exists so the API can
 * say honestly "there are 3 saved trades from before accounts existed, and they
 * belong to nobody" instead of those rows simply vanishing from view.
 */
export function auditJournal(options = {}) {
  const filePath =
    txt(options.filePath) || txt(process.env[JOURNAL_FILE_ENV]) || DEFAULT_JOURNAL_FILE;

  const loaded = createJournalStore({ filePath }).read();
  if (!loaded.ok) {
    return { ok: false, total: 0, attributed: 0, unattributed: 0, owners: 0, problem: loaded.problem };
  }

  const owners = new Set();
  let attributed = 0;
  let unattributed = 0;

  for (const record of loaded.records) {
    const owner = normalizeUserId(record.userId);
    if (owner) {
      attributed += 1;
      owners.add(owner);
    } else {
      unattributed += 1;
    }
  }

  return {
    ok: true,
    total: loaded.records.length,
    attributed,
    unattributed,
    owners: owners.size,
    problem: null,
  };
}

// --- convenience wrappers over the default store ----------------------------

export function readJournal(options = {}) {
  return createJournalStore(options).read();
}

export function listJournal(options = {}) {
  return createJournalStore(options).list();
}

export function getJournalRecord(id, options = {}) {
  return createJournalStore(options).get(id);
}

export function upsertJournalRecord(input, options = {}) {
  return createJournalStore(options).upsert(input);
}
