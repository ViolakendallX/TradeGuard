/**
 * TradeGuard investigation stages.
 *
 * Phase 2 declared the stages. Phase 3 makes two of them REAL: market-context
 * and events-catalysts can now attempt to gather data, so their completion no
 * longer depends on a static flag — it depends on whether the research actually
 * returned valid data. A stage is marked complete ONLY when its research came
 * back available and valid; otherwise it is partial, unavailable, or still
 * loading. This prevents the UI from ever claiming research that did not happen.
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
    available: false,
    description:
      "The Devil's Advocate pass: evidence that could break the thesis, not just support it. (Phase 4)",
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
 * Runtime status of a stage given the live research result.
 * `research` is the backend research response (or null while loading / not yet fetched).
 */
export function stageRuntimeState(stage, research) {
  if (!stage.available) return STAGE_RUNTIME.LOCKED;
  if (stage.id === 'thesis-captured') return STAGE_RUNTIME.COMPLETE;
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

export function completedStageCountFromResearch(research) {
  return INVESTIGATION_STAGES.filter(
    (stage) => stageRuntimeState(stage, research) === STAGE_RUNTIME.COMPLETE
  ).length;
}
