/**
 * TradeGuard investigation stages.
 *
 * Phase 2 declared the stages. Phase 3 made market-context and events-catalysts
 * REAL, Phase 4 makes the Devil's Advocate stage REAL, Phase 5 makes the
 * historical stress test REAL, Phase 6 makes the risk assessment REAL, and
 * Phase 7 makes the trade structure REAL. A
 * stage's completion
 * never depends on a static flag — it depends on whether the underlying work
 * actually produced valid output. A stage is marked complete ONLY when its data
 * or analysis came back available and usable; otherwise it is partial,
 * unavailable, or still loading. This prevents the UI from ever claiming work
 * that did not happen.
 */

export const STAGE_RUNTIME = {
  LOCKED: 'locked', // phase not built yet
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
];

export const INVESTIGATION_STAGE_COUNT = INVESTIGATION_STAGES.length;

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
 * Runtime status of a stage given the live research + thesis-attack + historical
 * + risk + structure results. `research` is the Phase 3 backend response;
 * `attack` is the Phase 4 analysis; `history` is the Phase 5 analysis; `risk` is
 * the Phase 6 analysis; `structure` is the Phase 7 analysis (all null while
 * loading).
 *
 * The risk and structure stages are resolved BEFORE the research gate below,
 * because neither depends on market data being reachable: the risk engine is
 * pure arithmetic on the trader's own inputs, and the structure is a synthesis
 * of those inputs and the earlier findings. A research failure must not mark
 * either of them loading.
 */
export function stageRuntimeState(stage, research, attack, history, risk, structure) {
  if (!stage.available) return STAGE_RUNTIME.LOCKED;
  if (stage.id === 'thesis-captured') return STAGE_RUNTIME.COMPLETE;
  if (stage.id === 'contradicting-evidence') return attackState(attack);
  if (stage.id === 'historical-comparisons') return historyState(history);
  if (stage.id === 'risk-assessment') return riskState(risk);
  if (stage.id === 'trade-structure') return structureState(structure);
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

export function completedStageCountFromResearch(research, attack, history, risk, structure) {
  return INVESTIGATION_STAGES.filter(
    (stage) => stageRuntimeState(stage, research, attack, history, risk, structure) === STAGE_RUNTIME.COMPLETE
  ).length;
}
