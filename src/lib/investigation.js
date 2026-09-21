/**
 * TradeGuard investigation stages.
 *
 * Phase 2 declared the stages. Phase 3 made market-context and events-catalysts
 * REAL, Phase 4 makes the Devil's Advocate stage REAL, Phase 5 makes the
 * historical stress test REAL, Phase 6 makes the risk assessment REAL,
 * Phase 7 makes the trade structure REAL, Phase 8 makes the final trade report
 * REAL, Phase 9 makes the human decision REAL — the stage where the trader
 * records their own choice — and Phase 10 makes paper execution REAL, which is
 * reachable only after the trader has explicitly decided to TAKE. Phases 11–13
 * add the post-decision workflow (Trade Review, Trade Memory and Trader Review)
 * as their own screens rather than investigation stages, so every stage listed
 * here is now available. A stage's completion
 * never depends on a static flag — it depends on whether the underlying work
 * actually produced valid output. A stage is marked complete ONLY when its data
 * or analysis came back available and usable; otherwise it is partial,
 * unavailable, or still loading. This prevents the UI from ever claiming work
 * that did not happen.
 */

export const STAGE_RUNTIME = {
  LOCKED: 'locked', // stage not available in this build
  LOADING: 'loading', // research in flight
  COMPLETE: 'complete', // valid data retrieved
  PARTIAL: 'partial', // some data retrieved, some missing
  UNAVAILABLE: 'unavailable', // provider unreachable / not configured / no data
};

export const INVESTIGATION_STAGES = [
  {
    id: 'thesis-captured',
    label: 'Thesis captured',
    phase: 1,
    available: true,
    description:
      'TradeGuard has recorded your asset, direction and thesis. This is the only step complete at submission.',
  },
  {
    id: 'market-context',
    label: 'Market context',
    phase: 3,
    available: true,
    description:
      'Current price, 24h change, volume, realized volatility and trend for the asset, fetched from market data.',
  },
  {
    id: 'events-catalysts',
    label: 'Events & catalysts',
    phase: 3,
    available: true,
    description:
      'Earnings, company announcements and other catalysts relevant to the trade, fetched from an events provider.',
  },
  {
    id: 'contradicting-evidence',
    label: "Devil's Advocate",
    phase: 4,
    available: true,
    description:
      "The Devil's Advocate pass: it actively searches for evidence that could break the thesis, separating supporting evidence from contradicting evidence, key risks and invalidation conditions.",
  },
  {
    id: 'historical-comparisons',
    label: 'Historical stress test',
    phase: 5,
    available: true,
    description:
      'Similar past setups for this asset and what happened afterwards, matched with published rules — or an explicit "historical data unavailable" state.',
  },
  {
    id: 'risk-assessment',
    label: 'Risk assessment',
    phase: 6,
    available: true,
    description:
      'Deterministic price risk, calculated position size and defined risk from the entry, invalidation and risk budget you supplied — or an explicit incomplete or invalid-construction state when those inputs are missing or inconsistent.',
  },
  {
    id: 'trade-structure',
    label: 'Trade structure',
    phase: 7,
    available: true,
    description:
      'The trade you described, brought together with the findings of the earlier stages: the setup, the risk calculated by the risk engine, the thesis with its supporting and contradicting context, and the conditions that would invalidate it — or an explicit incomplete state whenever information is missing.',
  },
  {
    id: 'final-report',
    label: 'Final trade report',
    phase: 8,
    available: true,
    description:
      'The whole investigation consolidated into one scannable report: the setup, the thesis and its evidence, the market and event context, the attack, the historical comparison, the defined risk and the conditions — each marked available, partial or unavailable. A synthesis, not a verdict: the decision remains yours.',
  },
  {
    id: 'human-decision',
    label: 'Human decision',
    phase: 9,
    available: true,
    description:
      'Where you record the decision you are making — TAKE, WAIT or SKIP — together with your own reason and the time you recorded it. TradeGuard records the decision; it does not make it, does not suggest one and does not score the trade.',
  },
  {
    id: 'paper-execution',
    label: 'Paper execution',
    phase: 10,
    available: true,
    description:
      'Sends the trade you decided to TAKE to the Bitget Demo environment using virtual funds. It stays locked until you have recorded TAKE, and even then nothing is sent until you explicitly confirm. No live-money order is ever placed.',
  },
];

export const INVESTIGATION_STAGE_COUNT = INVESTIGATION_STAGES.length;

/**
 * Phase 9 decision states, mirroring the backend's `DECISION_STATUS`.
 *   - required: nothing has been recorded yet
 *   - recorded: the trader has recorded a decision, with their own reason
 *
 * Note what is deliberately absent: there is no "recommended", "good" or
 * "high-confidence" state. A recorded decision says only that a decision was
 * recorded — never that it was the right one.
 */
export const DECISION_STATUS = {
  REQUIRED: 'required',
  RECORDED: 'recorded',
};

/**
 * Phase 10 execution states, mirroring the backend's `EXECUTION_STATUS`.
 *
 * Note what is deliberately absent: nothing here says the trade is good,
 * approved or advisable. These describe WHAT HAPPENED — locked, ready,
 * submitted, failed — never whether the trade was a good decision.
 */
export const EXECUTION_STATUS = {
  LOCKED: 'locked',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  SUBMITTED: 'submitted',
  FAILED: 'failed',
};

function marketState(market) {
  if (!market || market.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  return market.partial ? STAGE_RUNTIME.PARTIAL : STAGE_RUNTIME.COMPLETE;
}

function eventsState(events) {
  if (!events || events.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  return events.partial ? STAGE_RUNTIME.PARTIAL : STAGE_RUNTIME.COMPLETE;
}

/**
 * Devil's Advocate stage state.
 *   - no analysis yet            -> loading
 *   - analysis failed to run     -> unavailable (honest)
 *   - ran, but no usable data    -> partial (data-limited, not complete)
 *   - ran with usable evidence   -> complete
 */
function attackState(attack) {
  if (!attack) return STAGE_RUNTIME.LOADING;
  if (attack.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (attack.dataLimited) return STAGE_RUNTIME.PARTIAL;
  return STAGE_RUNTIME.COMPLETE;
}

/**
 * Historical stress test stage state (Phase 5).
 *   - no result yet                  -> loading
 *   - analysis failed / no history   -> unavailable (explicit, honest)
 *   - ran but partial / no matches   -> partial (data-limited, not complete)
 *   - ran with a usable sample       -> complete
 */
function historyState(history) {
  if (!history) return STAGE_RUNTIME.LOADING;
  if (history.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (history.dataLimited) return STAGE_RUNTIME.PARTIAL;
  return STAGE_RUNTIME.COMPLETE;
}

/**
 * Risk assessment stage state (Phase 6).
 *   - no result yet                       -> loading
 *   - engine could not run at all         -> unavailable (honest)
 *   - ran, but inputs missing or the
 *     construction contradicts itself     -> partial (there is no defined risk)
 *   - ran with a coherent construction
 *     and produced a defined risk         -> complete
 *
 * Note that an INCOMPLETE or INVALID construction is deliberately NOT complete:
 * the stage ran, but the thing it exists to produce — a defined risk — does not
 * exist. Marking it complete would claim a risk picture that was never built.
 */
function riskState(risk) {
  if (!risk) return STAGE_RUNTIME.LOADING;
  if (risk.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (risk.status === 'ready') return STAGE_RUNTIME.COMPLETE;
  return STAGE_RUNTIME.PARTIAL;
}

/**
 * Trade structure stage state (Phase 7).
 *   - no result yet                        -> loading
 *   - the structure could not be produced  -> unavailable (honest)
 *   - ran, but the structure is incomplete
 *     (a parameter is missing, or the risk
 *     leg has no defined risk)             -> partial
 *   - ran with a complete structure        -> complete
 *
 * As with the risk stage, an INCOMPLETE structure is deliberately NOT complete:
 * the stage ran, but the thing it exists to produce — a whole trade plan — does
 * not exist yet.
 */
function structureState(structure) {
  if (!structure) return STAGE_RUNTIME.LOADING;
  if (structure.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (structure.status === 'complete') return STAGE_RUNTIME.COMPLETE;
  return STAGE_RUNTIME.PARTIAL;
}

/**
 * Final trade report stage state (Phase 8).
 *   - no result yet                          -> loading
 *   - the report could not be assembled      -> unavailable (honest)
 *   - assembled, but the investigation is
 *     genuinely incomplete (a provider was
 *     down, a parameter is missing)          -> partial
 *   - assembled over a complete investigation -> complete
 *
 * Note the important nuance: a report over an investigation with an unavailable
 * provider is still a REAL report — it honestly says that section is
 * unavailable. But the stage is not COMPLETE in that case, because completeness
 * here means "the whole investigation was consolidated", and part of it was
 * missing. Marking it complete would overstate what the trader actually has.
 */
export function reportState(report) {
  if (!report) return STAGE_RUNTIME.LOADING;
  if (report.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (report.status === 'ready') return STAGE_RUNTIME.COMPLETE;
  return STAGE_RUNTIME.PARTIAL;
}

/**
 * Human decision stage state (Phase 9).
 *   - no decision record (and none is fetched in the workspace) -> unavailable
 *   - the record could not be reached                          -> unavailable (honest)
 *   - nothing recorded yet                                     -> unavailable
 *   - the trader recorded a decision                          -> complete
 *
 * IMPORTANT: a missing decision record is NOT a "loading" state. Loading implies
 * a request is in flight, but the human decision is never fetched on the
 * investigation workspace — it is recorded by the trader on the Decision screen
 * and reaches this stage as a prop. Returning LOADING here made the workspace
 * show a permanent "Retrieving…" spinner and a "Loading…" badge for a stage that
 * was simply not decided yet, which is misleading and blocked the user from
 * seeing the decision panel. A null decision is therefore treated exactly like
 * the PENDING record below: unavailable, not loading.
 *
 * The `available === false` check comes first, exactly as it does for the risk,
 * structure and report stages: a service that could not be reached must never
 * be read as having recorded something.
 *
 * "Complete" here means exactly one thing: the trader's decision has been
 * recorded. It does NOT mean the trade is good, valid or approved, and it is
 * deliberately not called anything that could read as a verdict. A WAIT or a
 * SKIP makes this stage just as complete as a TAKE — the work the stage exists
 * to do is to capture the human decision, not to grade it.
 */
export function decisionState(decision) {
  // No record yet — and nothing is ever fetched here — is the honest "not
  // decided yet" state, identical to the PENDING record. Never LOADING.
  if (!decision || decision.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (decision.status === DECISION_STATUS.RECORDED) return STAGE_RUNTIME.COMPLETE;
  return STAGE_RUNTIME.UNAVAILABLE;
}

/**
 * Paper execution stage state (Phase 10).
 *   - no execution record yet              -> loading
 *   - the service could not be reached     -> unavailable (honest)
 *   - EXECUTION LOCKED                     -> unavailable (the gate is not met)
 *   - PAPER EXECUTION UNAVAILABLE          -> unavailable
 *   - READY FOR PAPER EXECUTION            -> partial (eligible, nothing sent yet)
 *   - PAPER ORDER FAILED                   -> partial (an attempt was made)
 *   - PAPER ORDER SUBMITTED                -> complete (a demo order exists)
 *
 * "Complete" here means exactly one thing: a demo order was submitted and the
 * venue returned an order ID. It deliberately does NOT mean the trade is good,
 * profitable, or correctly sized — the outcome is unknown at submission time,
 * and this stage never grades the trade.
 *
 * READY is partial rather than complete because the stage exists to submit an
 * order, and while it is merely eligible nothing has been sent yet.
 */
export function executionState(execution) {
  if (!execution) return STAGE_RUNTIME.LOADING;
  if (execution.available === false) return STAGE_RUNTIME.UNAVAILABLE;
  if (execution.status === EXECUTION_STATUS.SUBMITTED) return STAGE_RUNTIME.COMPLETE;
  if (execution.status === EXECUTION_STATUS.READY) return STAGE_RUNTIME.PARTIAL;
  if (execution.status === EXECUTION_STATUS.FAILED) return STAGE_RUNTIME.PARTIAL;
  return STAGE_RUNTIME.UNAVAILABLE;
}

/**
 * Runtime status of a stage given the live research + thesis-attack + historical
 * + risk + structure + report + decision results. `research` is the Phase 3
 * backend response; `attack` is the Phase 4 analysis; `history` is the Phase 5
 * analysis; `risk` is the Phase 6 analysis; `structure` is the Phase 7 analysis;
 * `report` is the Phase 8 analysis; `decision` is the Phase 9 record;
 * `execution` is the Phase 10 record (all null while loading).
 *
 * The risk, structure, report, decision and execution stages are resolved
 * BEFORE the research gate below, because none of them depends on market data
 * being reachable: the risk engine is pure arithmetic on the trader's own
 * inputs, the structure is a synthesis of those inputs and the earlier
 * findings, the report is a synthesis of everything, the decision is the
 * trader's own record, and paper execution is gated on that decision rather
 * than on any provider. A research failure must not mark any of them loading.
 */
export function stageRuntimeState(
  stage,
  research,
  attack,
  history,
  risk,
  structure,
  report,
  decision,
  execution
) {
  if (!stage.available) return STAGE_RUNTIME.LOCKED;
  if (stage.id === 'thesis-captured') return STAGE_RUNTIME.COMPLETE;
  if (stage.id === 'contradicting-evidence') return attackState(attack);
  if (stage.id === 'historical-comparisons') return historyState(history);
  if (stage.id === 'risk-assessment') return riskState(risk);
  if (stage.id === 'trade-structure') return structureState(structure);
  if (stage.id === 'final-report') return reportState(report);
  if (stage.id === 'human-decision') return decisionState(decision);
  if (stage.id === 'paper-execution') return executionState(execution);
  if (!research) return STAGE_RUNTIME.LOADING;
  if (stage.id === 'market-context') return marketState(research.market);
  if (stage.id === 'events-catalysts') return eventsState(research.events);
  return STAGE_RUNTIME.LOCKED;
}

export function stageById(id) {
  return INVESTIGATION_STAGES.find((stage) => stage.id === id);
}

export function builtStageCount() {
  return INVESTIGATION_STAGES.filter((stage) => stage.available).length;
}

export function lockedStageCount() {
  return INVESTIGATION_STAGES.filter((stage) => !stage.available).length;
}

export function completedStageCountFromResearch(
  research,
  attack,
  history,
  risk,
  structure,
  report,
  decision,
  execution
) {
  return INVESTIGATION_STAGES.filter(
    (stage) =>
      stageRuntimeState(stage, research, attack, history, risk, structure, report, decision, execution) ===
      STAGE_RUNTIME.COMPLETE
  ).length;
}
