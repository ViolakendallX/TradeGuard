/**
 * useTradeSession — the CURRENT trade's server-side records, fetched once.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every workspace used to run the deterministic chain itself, inside its own
 * `useEffect`. Because App renders exactly one screen at a time, navigating
 * unmounted the previous screen and destroyed its results, so:
 *
 *   - entering Trade Report / Decision / Paper Execution / Trade Review re-ran
 *     the whole chain (research -> attack -> history -> risk -> structure ->
 *     report) even though the answers could not have changed;
 *   - returning to a screen you had already loaded re-ran it again;
 *   - recording a decision re-ran it again, because `decision` was in the
 *     screen's effect dependencies.
 *
 * The chain is a pure function of the trade, so it only ever needed to run once
 * PER TRADE. This hook runs it once and holds the result, so every workspace
 * reads the same records and navigation is a local, instant operation.
 *
 * WHAT IT OWNS
 *   - the deterministic chain: research, attack, history, risk, structure, report
 *   - the Phase 10 execution GATE evaluation (sends nothing to any venue)
 *   - the Phase 11 trade review assembly
 *
 * WHAT IT DOES NOT DO
 *   - it does not compute risk, analysis, verdicts or signals of any kind
 *   - it does not submit anything: the paper order is submitted from the Paper
 *     Execution screen, by the trader, with the confirmation token
 *   - it does not cache across trades. Every slice is stamped with the
 *     `submission` (and `decision` / `execution`) it was built from, and is only
 *     exposed while those still match. A new trade therefore exposes an empty
 *     session immediately — the previous trade's records can never leak into it,
 *     not even for a single frame.
 *
 * This is deliberately plain React state. There is no store, no context
 * provider, no persistence and no backend cache: the trade already lives in App
 * state, so its records live there with it.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  fetchResearch,
  fetchThesisAttack,
  fetchHistoricalStressTest,
  fetchRiskAssessment,
  fetchTradeStructure,
  fetchFinalReport,
  fetchPaperExecution,
  fetchTradeReview,
} from './api.js';

/** The chain before anything has settled. Frozen so it is safe to share. */
export const EMPTY_CHAIN = Object.freeze({
  research: null,
  attack: null,
  history: null,
  risk: null,
  structure: null,
  report: null,
});

/** The trade context every endpoint expects. */
function tradeContextOf(idea) {
  if (!idea) return null;
  return {
    asset: idea.asset,
    direction: idea.direction,
    thesis: idea.thesis,
    timeframe: idea.timeframe,
    entryPrice: idea.entryPrice,
    invalidationPrice: idea.invalidationPrice,
    riskAmount: idea.riskAmount,
    confidence: idea.confidence,
    existingPosition: idea.existingPosition,
  };
}

/**
 * The honest states when the backend is unreachable. Identical wording to the
 * per-screen versions this replaces — nothing is invented, everything says so.
 */
function offlineChain() {
  const noApi = 'Backend offline — the TradeGuard API could not be reached.';
  return {
    research: {
      market: { available: false, reason: `${noApi} Market research requires it.` },
      events: { available: false, reason: `${noApi} Event research requires it.` },
    },
    attack: { available: false, reason: `${noApi} The thesis attack requires it.` },
    history: {
      available: false,
      statusLabel: 'HISTORICAL DATA UNAVAILABLE',
      reason: `${noApi} The historical stress test requires it.`,
    },
    risk: {
      available: false,
      statusLabel: 'RISK ASSESSMENT UNAVAILABLE',
      statusDetail: `${noApi} The risk engine runs server-side.`,
    },
    structure: {
      available: false,
      statusLabel: 'TRADE STRUCTURE UNAVAILABLE',
      statusDetail: `${noApi} The trade structure is assembled server-side.`,
    },
    report: {
      available: false,
      statusLabel: 'REPORT UNAVAILABLE',
      statusDetail: `${noApi} The final report is assembled server-side.`,
    },
  };
}

/**
 * @param {object|null} submission the submitted trade (its `idea` is the context)
 * @param {object|null} decision   the trader's recorded decision
 * @param {object|null} execution  the paper-execution record, if one exists
 */
export default function useTradeSession(submission, decision, execution) {
  const idea = submission?.idea || null;
  const context = useMemo(() => tradeContextOf(idea), [idea]);

  // Each slice records WHAT it was built from. Data is only exposed while that
  // still matches, so a stale trade can never be shown.
  const [chainState, setChainState] = useState({ sub: null, data: EMPTY_CHAIN });
  const [gateState, setGateState] = useState({ sub: null, dec: null, data: null });
  const [reviewState, setReviewState] = useState({ sub: null, dec: null, exec: null, data: null });

  // --- 1. the deterministic chain — ONCE per trade --------------------------
  useEffect(() => {
    if (!submission || !idea || !context) return undefined;

    let cancelled = false;

    // Patch the chain for THIS submission only. The first call for a new trade
    // starts from an empty chain, so nothing carries over.
    const set = (patch) => {
      if (cancelled) return;
      setChainState((prev) => ({
        sub: submission,
        data: { ...(prev.sub === submission ? prev.data : EMPTY_CHAIN), ...patch },
      }));
    };

    // A new trade starts empty, immediately.
    setChainState({ sub: submission, data: EMPTY_CHAIN });

    if (submission.offline) {
      set(offlineChain());
      return undefined;
    }

    // Phase 8 needs every earlier result, but must not re-derive any of them.
    // Phase 7 needs the risk result and the attack. So we hold whichever results
    // settle first and fire each dependent call as soon as its own inputs are in
    // — including on the failure paths, so nothing can hang on "loading" when a
    // provider dies mid-chain.
    const settled = {
      market: null,
      events: null,
      attack: null,
      history: null,
      risk: null,
      structure: null,
    };
    let structureRequested = false;
    let reportRequested = false;

    const requestStructure = () => {
      if (cancelled || structureRequested || !settled.risk || !settled.attack) return;
      structureRequested = true;

      fetchTradeStructure(context, { risk: settled.risk, attack: settled.attack })
        .then((s) => {
          if (cancelled) return;
          settled.structure = s.ok ? s.data.structure : { available: false, statusDetail: s.message };
          set({ structure: settled.structure });
          requestReport();
        })
        .catch((e) => {
          if (cancelled) return;
          settled.structure = { available: false, statusDetail: String(e?.message || e) };
          set({ structure: settled.structure });
          requestReport();
        });
    };

    const requestReport = () => {
      if (cancelled || reportRequested) return;
      if (Object.values(settled).some((v) => v === null)) return;
      reportRequested = true;

      fetchFinalReport(context, {
        market: settled.market,
        events: settled.events,
        attack: settled.attack,
        history: settled.history,
        risk: settled.risk,
        structure: settled.structure,
      })
        .then((r) => {
          if (cancelled) return;
          set({ report: r.ok ? r.data.report : { available: false, statusDetail: r.message } });
        })
        .catch((e) => {
          if (cancelled) return;
          set({ report: { available: false, statusDetail: String(e?.message || e) } });
        });
    };

    // Phase 6 is fetched OUTSIDE the market-data chain: it is pure arithmetic on
    // the trader's own levels, so it must still resolve when the provider chain
    // fails — and must not wait behind three network calls to do so.
    fetchRiskAssessment(context)
      .then((r) => {
        if (cancelled) return;
        settled.risk = r.ok ? r.data.risk : { available: false, statusDetail: r.message };
        set({ risk: settled.risk });
        requestStructure();
        requestReport();
      })
      .catch((e) => {
        if (cancelled) return;
        settled.risk = { available: false, statusDetail: String(e?.message || e) };
        set({ risk: settled.risk });
        requestStructure();
        requestReport();
      });

    fetchResearch(context)
      .then((r) => {
        if (cancelled) return undefined;
        const researchData = r.ok
          ? r.data
          : {
              market: { available: false, reason: r.message },
              events: { available: false, reason: r.message },
            };
        settled.market = researchData.market;
        settled.events = researchData.events;
        set({ research: { market: researchData.market, events: researchData.events } });

        return fetchThesisAttack(context, { market: researchData.market, events: researchData.events })
          .then((a) => {
            if (cancelled) return undefined;
            settled.attack = a.ok ? a.data.analysis : { available: false, reason: a.message };
            set({ attack: settled.attack });
            requestStructure();

            return fetchHistoricalStressTest(context, {
              market: researchData.market,
              events: researchData.events,
            })
              .then((h) => {
                if (cancelled) return;
                settled.history = h.ok ? h.data.history : { available: false, reason: h.message };
                set({ history: settled.history });
                requestReport();
              })
              .catch((e) => {
                if (cancelled) return;
                settled.history = { available: false, reason: String(e?.message || e) };
                set({ history: settled.history });
                requestReport();
              });
          })
          .catch((e) => {
            if (cancelled) return;
            const message = String(e?.message || e);
            settled.attack = { available: false, reason: message };
            settled.history = { available: false, reason: message };
            set({ attack: settled.attack, history: settled.history });
            requestStructure();
            requestReport();
          });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = String(e?.message || e);
        settled.market = { available: false, reason: message };
        settled.events = { available: false, reason: message };
        settled.attack = { available: false, reason: message };
        settled.history = { available: false, reason: message };
        set({
          research: { market: settled.market, events: settled.events },
          attack: settled.attack,
          history: settled.history,
        });
        requestStructure();
        requestReport();
      });

    return () => {
      cancelled = true;
    };
  }, [submission, idea, context]);

  const chain = chainState.sub === submission ? chainState.data : EMPTY_CHAIN;
  const { research, attack, history, risk, structure, report } = chain;

  // --- 2. the execution gate — re-evaluated when the DECISION changes --------
  // Read-only: it reports LOCKED / READY / UNAVAILABLE and sends nothing.
  useEffect(() => {
    if (!submission || !context) return undefined;

    if (submission.offline) {
      setGateState({
        sub: submission,
        dec: decision,
        data: {
          available: false,
          statusDetail: 'Backend offline — paper execution is evaluated server-side.',
        },
      });
      return undefined;
    }

    // The gate needs the risk result, the structure and the report.
    if (!risk || !structure || !report) return undefined;

    let cancelled = false;
    fetchPaperExecution(context, { risk, structure, report, decision })
      .then((e) => {
        if (cancelled) return;
        setGateState({
          sub: submission,
          dec: decision,
          data: e.ok ? e.data.execution : { available: false, statusDetail: e.message },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setGateState({
          sub: submission,
          dec: decision,
          data: { available: false, statusDetail: String(err?.message || err) },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [submission, context, risk, structure, report, decision]);

  const gate = gateState.sub === submission && gateState.dec === decision ? gateState.data : null;

  // --- 3. the trade review — re-assembled when decision/execution change -----
  useEffect(() => {
    if (!submission || !context) return undefined;

    if (submission.offline) {
      setReviewState({
        sub: submission,
        dec: decision,
        exec: execution,
        data: {
          available: false,
          status: 'unavailable',
          statusLabel: 'REVIEW UNAVAILABLE',
          statusDetail: 'Backend offline — Trade Review is assembled server-side.',
        },
      });
      return undefined;
    }

    if (!risk || !structure || !report) return undefined;

    let cancelled = false;
    fetchTradeReview(context, {
      risk,
      structure,
      report,
      decision,
      execution,
      research,
      attack,
      history,
    })
      .then((r) => {
        if (cancelled) return;
        setReviewState({
          sub: submission,
          dec: decision,
          exec: execution,
          data: r.ok ? r.data.review : { available: false, statusDetail: r.message },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setReviewState({
          sub: submission,
          dec: decision,
          exec: execution,
          data: { available: false, statusDetail: String(err?.message || err) },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [submission, context, risk, structure, report, decision, execution, research, attack, history]);

  const review =
    reviewState.sub === submission && reviewState.dec === decision && reviewState.exec === execution
      ? reviewState.data
      : null;

  return { idea, context, research, attack, history, risk, structure, report, gate, review };
}
