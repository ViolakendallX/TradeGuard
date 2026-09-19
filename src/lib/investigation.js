/**
 * TradeGuard investigation stages.
 *
 * Phase 2 declared the stages. Phase 3 made market-context and events-catalysts
 * REAL, and Phase 4 makes the Devil's Advocate stage REAL. A stage's completion
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
    label: 'Historical comparisons',
    phase: 5,
    available: false,
    description: 'Similar past setups and how they resolved, used to stress-test the idea. (Phase 5)',
  },
  {
    id: 'risk-assessment',
    label: 'Risk assessment',
    phase: 6,
    available: false,
    description: 'Position sizing, downside, reward/risk and exposure from the deterministic risk engine. (Phase 6)',
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
 * Runtime status of a stage given the live research + thesis-attack results.
 * `research` is the Phase 3 backend response; `attack` is the Phase 4 analysis
 * (both null while loading / not yet fetched).
 */
export function stageRuntimeState(stage, research, attack) {
  if (!stage.available) return STAGE_RUNTIME.LOCKED;
  if (stage.id === 'thesis-captured') return STAGE_RUNTIME.COMPLETE;
  if (stage.id === 'contradicting-evidence') return attackState(attack);
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

export function completedStageCountFromResearch(research, attack) {
  return INVESTIGATION_STAGES.filter(
    (stage) => stageRuntimeState(stage, research, attack) === STAGE_RUNTIME.COMPLETE
  ).length;
}
