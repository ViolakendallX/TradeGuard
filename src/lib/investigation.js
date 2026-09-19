/**
 * TradeGuard investigation stages — Phase 2 (Investigation Flow).
 *
 * Scope: declare what TradeGuard will investigate and what it has already
 * captured. This is intentionally a *description* of stages, not research.
 * No market data, news, AI, or stress testing happens here — those belong to
 * later phases (3+). Every non-Phase-1 stage is explicitly flagged as not yet
 * available so the UI can never pretend research has already been performed.
 */

export const INVESTIGATION_STAGES = [
  {
    id: 'thesis-captured',
    label: 'Thesis captured',
    phase: 1,
    available: true,
    description:
      'TradeGuard has recorded your asset, direction and thesis. This is the only step that is already complete.',
  },
  {
    id: 'market-context',
    label: 'Market context',
    phase: 3,
    available: false,
    description:
      'Price, volume, volatility and trend context for the asset — gathered from market data once Phase 3 lands.',
  },
  {
    id: 'events-catalysts',
    label: 'Events & catalysts',
    phase: 3,
    available: false,
    description:
      'Earnings, company announcements, macro events and any other catalysts relevant to the trade.',
  },
  {
    id: 'contradicting-evidence',
    label: 'Contradicting evidence',
    phase: 4,
    available: false,
    description:
      "The Devil's Advocate pass: evidence that could break the thesis, not just support it.",
  },
  {
    id: 'historical-comparisons',
    label: 'Historical comparisons',
    phase: 5,
    available: false,
    description:
      'Similar past setups and how they resolved, used to stress-test the idea against history.',
  },
  {
    id: 'risk-assessment',
    label: 'Risk assessment',
    phase: 6,
    available: false,
    description:
      'Position sizing, downside, reward/risk and exposure checks from the deterministic risk engine.',
  },
];

export const INVESTIGATION_STAGE_COUNT = INVESTIGATION_STAGES.length;

export function stageStatus(stage) {
  return stage.available ? 'complete' : 'locked';
}

export function completedStageCount() {
  return INVESTIGATION_STAGES.filter((stage) => stage.available).length;
}

export function unavailableStageCount() {
  return INVESTIGATION_STAGES.filter((stage) => !stage.available).length;
}
