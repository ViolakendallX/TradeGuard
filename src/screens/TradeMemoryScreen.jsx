/**
 * Trade Memory screen (Phase 12).
 *
 * A SEPARATE workflow screen, reached from the sidebar after Trade Review. It is
 * a MEMORY: it lists the trades that were saved, and opens one so the trader can
 * see what was originally recorded — the thesis, the recorded decision and its
 * reason, the paper-execution state, the trade review, and their own notes.
 *
 * What this screen does:
 *   - lists the saved trades as a compact, scannable table
 *   - opens one saved trade and reads it back from the stored record
 *   - says plainly where the records are stored (a local file on the API, not a
 *     cloud service) and what each record does not contain
 *
 * What it does NOT do:
 *   - re-run the investigation. Opening a saved trade issues NO research, attack,
 *     historical, risk, structure or report request — the stored record is what
 *     you see.
 *   - compute a profit, a loss, a fill, a win rate, a score or a rating. None of
 *     those exist in a saved record.
 *   - classify a trade as good or bad, or suggest anything about what to do next.
 */

import { useCallback, useState } from 'react';
import { useJournalList, useJournalRecord } from '../lib/journal.js';
import TradeHeader from '../components/investigation/TradeHeader.jsx';
import JournalList from '../components/journal/JournalList.jsx';
import JournalDetail from '../components/journal/JournalDetail.jsx';

/** Shown while the journal is being read, and when it cannot be read. */
function JournalNotice({ title, children, onRetry }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="empty-state">
          <div className="card__title" style={{ marginBottom: 8 }}>
            {title}
          </div>
          {children}
          {onRetry && (
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--ghost btn--inline" onClick={onRetry}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TradeMemoryScreen({ onNavigate }) {
  const list = useJournalList();
  const [selectedId, setSelectedId] = useState(null);
  const detail = useJournalRecord(selectedId);

  const close = useCallback(() => setSelectedId(null), []);

  const openTrade = detail.status === 'ready' ? detail.record : null;

  return (
    <>
      <div className="page-head">
        <div className="page-head__eyebrow">Step 7 — Trade Memory</div>
        <h1 className="page-head__title">Trade Memory</h1>
        <p className="page-head__lede">
          Every trade you complete is saved here, so you can come back to it later and see what you
          originally recorded — your thesis, your decision and the reason you gave for it, what was (or
          was not) executed, the review, and your own notes. Opening a saved trade re-runs no analysis:
          it reads the record back. No profit, loss, fill or performance figure is ever calculated.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* ONE SAVED TRADE, OPENED                                           */}
      {/* ---------------------------------------------------------------- */}
      {selectedId ? (
        <div className="inv-workspace">
          <div className="journal__toolbar">
            <button type="button" className="btn btn--ghost btn--inline" onClick={close}>
              ← All saved trades
            </button>
            <span className="journal__toolbar-meta">
              {openTrade ? `Reading the saved record for ${openTrade.trade?.asset || 'this trade'}` : 'Opening…'}
            </span>
          </div>

          {detail.status === 'loading' && (
            <div className="card">
              <div className="card__body">
                <p className="journal__loading">Reading this trade back from Trade Memory…</p>
              </div>
            </div>
          )}

          {detail.status === 'unavailable' && (
            <JournalNotice title="This saved trade could not be read" onRetry={close}>
              {detail.message || 'Trade Memory could not be read.'}
            </JournalNotice>
          )}

          {openTrade && (
            <>
              <TradeHeader idea={openTrade.trade || {}} offline={false} onEdit={close} />
              <div className="exec__stage">
                <JournalDetail record={openTrade} />
              </div>
            </>
          )}
        </div>
      ) : (
        /* -------------------------------------------------------------- */
        /* THE JOURNAL INDEX                                              */
        /* -------------------------------------------------------------- */
        <>
          {list.status === 'loading' && (
            <div className="card">
              <div className="card__body">
                <p className="journal__loading">Reading Trade Memory…</p>
              </div>
            </div>
          )}

          {list.status === 'unavailable' && (
            <JournalNotice title="Trade Memory could not be read" onRetry={list.reload}>
              {list.message ||
                'The journal could not be read. That is not the same as having no saved trades, so it is reported rather than shown as an empty list.'}
            </JournalNotice>
          )}

          {list.status === 'ready' && list.records.length === 0 && (
            <JournalNotice title="No trades saved yet">
              Submit a trade idea and work it through the decision flow. Once you record your own
              decision, the trade is saved here automatically — and it will still be here after a page
              reload or a restart of the frontend.
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn--primary btn--inline"
                  onClick={() => onNavigate?.('trade-idea')}
                >
                  Start a trade idea
                </button>
              </div>
            </JournalNotice>
          )}

          {list.status === 'ready' && list.records.length > 0 && (
            <div className="card">
              <div className="card__header">
                <div>
                  <div className="card__title">
                    {list.count} saved trade{list.count === 1 ? '' : 's'}
                  </div>
                  <div className="card__hint">
                    Newest first. Select a trade to open the record that was saved for it.
                  </div>
                </div>
                <button type="button" className="btn btn--ghost btn--inline" onClick={list.reload}>
                  Reload
                </button>
              </div>

              <JournalList records={list.records} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          )}

          <p className="journal__storage-note">
            Trade Memory is stored in a single JSON file on the TradeGuard server — local persistence on
            this machine. It is not cloud storage, not a database and not a backup. Saved trades are
            never analysed, scored or ranked.
          </p>
        </>
      )}
    </>
  );
}
