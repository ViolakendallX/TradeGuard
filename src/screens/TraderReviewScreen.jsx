/**
 * Trader Review screen (Phase 13).
 *
 * The last step of the TradeGuard loop: the trader looks back at a completed
 * trade and writes their own reflection on it.
 *
 * Where it sits:
 *   ... → Decision → Paper Execution → Trade Review → Trade Memory → Trader Review
 *
 * WHICH TRADE IS REVIEWED
 * -----------------------
 * Trader Review is a review of a trade that has ALREADY been decided, so it does
 * not require the trader to have one open. It resolves the trade to show in this
 * order (see `resolveReviewRecordId`):
 *
 *   1. the trade the trader explicitly selected from the list;
 *   2. otherwise the CURRENT trade session, so it still defaults to the trade
 *      being worked on;
 *   3. otherwise the most recently saved trade in Trade Memory — a trader who has
 *      closed the app can still look back at what they recorded.
 *
 * Trade Memory stays the source of truth: a saved trade is loaded by its
 * persistent trade/session id and rendered from that record. Starting a new
 * trade therefore never hides the previous one — it stays in the list and stays
 * selectable.
 *
 * What this screen does NOT do:
 *   - re-run the analysis chain. The record was assembled when the trade was
 *     saved; this screen presents it. No research, attack, historical test, risk
 *     engine, structure or report request is issued here — opening a saved trade
 *     is a read of one local JSON file.
 *   - reconstruct anything that was unavailable when the trade was recorded. A
 *     gap stays a gap.
 *   - calculate a profit, a loss, a return, a fill, a win rate or a score.
 *   - generate a lesson, a pattern, a rating or a hindsight conclusion. The
 *     reflection is the trader's own words and nothing else.
 */

import { useEffect, useState } from 'react';
import { resolveReviewRecordId, useJournalList, useJournalRecord, useJournalReflectionSync } from '../lib/journal.js';
import EmptyState from '../components/EmptyState.jsx';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import TraderReviewPicker from '../components/investigation/TraderReviewPicker.jsx';
import TraderReviewPanel from '../components/investigation/TraderReviewPanel.jsx';

/** Nothing has ever been saved, so there is genuinely nothing to review yet. */
function EmptyNoSavedTrades({ onEdit, onNavigate }) {
  return (
    <div className="card">
      <div className="card__body">
        <EmptyState
          title="No saved trades to review"
          actions={
            <>
              <button type="button" className="btn btn--primary btn--inline" onClick={onEdit}>
                Submit a trade idea
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--inline"
                onClick={() => onNavigate?.('trade-memory')}
              >
                Open Trade Memory
              </button>
            </>
          }
        >
          <span data-trader-no-trades="true">
            Trader Review looks back at a trade that has already been recorded, so it needs something
            in Trade Memory to work on. Submit a trade idea and it will be saved there automatically —
            from then on you can reopen it here at any time and write your reflection on it.
          </span>
        </EmptyState>
      </div>
    </div>
  );
}

export default function TraderReviewScreen({
  submission,
  session,
  sessionId,
  reflection,
  onReflectionChange,
  sync,
  onEdit,
  onNavigate,
}) {
  const list = useJournalList();
  const [selectedId, setSelectedId] = useState(null);

  // A new trade resets the explicit selection, so Trader Review follows the trade
  // being worked on. The previous trade is NOT lost — it stays in the list below
  // and stays selectable.
  useEffect(() => {
    setSelectedId(null);
  }, [sessionId]);

  const reviewingId = resolveReviewRecordId({
    selectedId,
    sessionId,
    records: list.records,
  });

  const saved = useJournalRecord(reviewingId);
  const { reload } = saved;
  const record = saved.status === 'ready' ? saved.record : null;

  // Is the trade on screen the one currently open in the workspace? Only then do
  // the app's own live reflection state and its normal save path apply.
  const isCurrentTrade = Boolean(sessionId) && reviewingId === sessionId;

  // The reflection draft for a SAVED trade that is not the current session. It is
  // keyed on the record it belongs to, so switching between saved trades can never
  // carry one trade's half-written note into another.
  const [draft, setDraft] = useState({ id: null, notes: '', touched: false });
  const storedNotes = record?.traderReview?.notes ?? '';
  const draftForRecord = draft.id === record?.id ? draft : null;
  const historyNotes = draftForRecord ? draftForRecord.notes : storedNotes;
  const historyTouched = Boolean(draftForRecord?.touched);

  // Writes ONLY the reflection, and only once the trader has actually touched it.
  // Disabled for the current trade, where the app's own sync already saves it.
  const historySync = useJournalReflectionSync({
    id: isCurrentTrade ? null : record?.id ?? null,
    notes: historyTouched ? historyNotes : null,
  });

  // After a successful save, re-read the stored record. The panel presents the
  // STORED record — including whether a reflection exists and when it was first
  // written — so without this the badge would keep saying "not recorded" until
  // the screen was remounted. The refetch is one local file read, and it is
  // non-destructive for the same id, so it cannot unmount the editor.
  const savedAt = sync?.state === 'saved' ? sync.at : null;
  useEffect(() => {
    if (savedAt) reload();
  }, [savedAt, reload]);

  const historySavedAt = historySync.state === 'saved' ? historySync.at : null;
  useEffect(() => {
    if (historySavedAt) reload();
  }, [historySavedAt, reload]);

  const activeIdea = session?.idea || submission?.idea || null;
  const hasActiveTrade = Boolean(submission && activeIdea && sessionId);
  const hasSavedTrades = list.status === 'ready' && list.records.length > 0;

  const reflectionValue = isCurrentTrade ? reflection : historyNotes;
  const reflectionSync = isCurrentTrade ? sync : historySync;
  const handleReflectionChange = isCurrentTrade
    ? onReflectionChange
    : (value) => setDraft({ id: record?.id ?? null, notes: value, touched: true });

  // The list is the way to reach any other saved trade, so it is shown whenever
  // there is no current trade, or whenever it could actually offer a choice.
  const showPicker = hasSavedTrades && (!hasActiveTrade || list.records.length > 1);

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 8 — Trader Review</div>
        <h1 className="page-head__title">Trader Review</h1>
        <p className="page-head__lede">
          Look back at a trade you have already recorded and write down what you make of it. This screen
          separates what TradeGuard actually knows from what you recorded yourself, and says plainly what
          is still missing. It does not score the trade, calculate a profit or loss, or tell you what it
          means — the reflection is yours.
        </p>
      </div>

      <div className="inv-workspace">
        {showPicker && (
          <TraderReviewPicker
            records={list.records}
            status={list.status}
            message={list.message}
            selectedId={reviewingId}
            sessionId={sessionId}
            onSelect={setSelectedId}
            onReload={list.reload}
          />
        )}

        {!hasActiveTrade && list.status === 'ready' && list.records.length === 0 && (
          <EmptyNoSavedTrades onEdit={onEdit} onNavigate={onNavigate} />
        )}

        {!hasActiveTrade && list.status === 'loading' && (
          <div className="card">
            <div className="card__body">
              <p className="journal__loading">Reading your saved trades from Trade Memory…</p>
            </div>
          </div>
        )}

        {!hasActiveTrade && list.status === 'unavailable' && (
          <div className="card">
            <div className="card__body">
              <EmptyState
                title="Your saved trades could not be listed"
                actions={
                  <button type="button" className="btn btn--ghost btn--inline btn--auto" onClick={list.reload}>
                    Try again
                  </button>
                }
              >
                <span data-trader-list-unavailable="true">
                  {list.message || 'Trade Memory could not be read, so there is nothing to show yet.'}
                </span>
              </EmptyState>
            </div>
          </div>
        )}

        {(hasActiveTrade || hasSavedTrades) && (
          <div className="exec__stage">
            {saved.status === 'loading' && (
              <div className="card">
                <div className="card__body">
                  <p className="journal__loading">Reading this trade back from Trade Memory…</p>
                </div>
              </div>
            )}

            {saved.status === 'unavailable' && (
              <div className="card">
                <div className="card__body">
                  <EmptyState
                    title={
                      saved.kind === 'not-found'
                        ? 'This trade has not been saved to Trade Memory yet'
                        : 'This trade could not be read back'
                    }
                    actions={
                      <button type="button" className="btn btn--ghost btn--inline btn--auto" onClick={saved.reload}>
                        Try again
                      </button>
                    }
                  >
                    {saved.kind === 'not-found'
                      ? 'Trade Memory saves a trade as soon as there is something to save. Give it a moment, then try again — nothing is lost.'
                      : saved.message ||
                        'Trade Memory could not be reached, so the saved record for this trade cannot be shown.'}
                  </EmptyState>
                </div>
              </div>
            )}

            {saved.status === 'ready' && record && (
              <>
                <TradeHeader
                  idea={isCurrentTrade && activeIdea ? activeIdea : record.trade}
                  offline={isCurrentTrade ? Boolean(submission?.offline) : false}
                  onEdit={isCurrentTrade ? onEdit : undefined}
                />

                {!isCurrentTrade && (
                  <p className="report__notice report__notice--muted" data-trader-historical="true">
                    Reviewing a trade saved in Trade Memory, read back by its trade id. Nothing is
                    re-run: everything below is the record that was stored when this trade was saved —
                    including anything that was already unavailable then, which stays unavailable.
                  </p>
                )}

                <TraderReviewPanel
                  record={record}
                  reflection={reflectionValue}
                  onReflectionChange={handleReflectionChange}
                  sync={reflectionSync}
                  reflectionNote={saved.meta?.traderReview?.note}
                />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
