export const NAV_ITEMS = [
  { id: 'trade-idea', label: 'Trade Idea', phase: 1 },
  { id: 'investigation', label: 'Investigation', phase: 2 },
  { id: 'trade-report', label: 'Trade Report', phase: 8 },
  { id: 'decision', label: 'Decision', phase: 9 },
  { id: 'paper-execution', label: 'Paper Execution', phase: 10 },
  { id: 'trade-review', label: 'Trade Review', phase: 12 },
  { id: 'trader-review', label: 'Trader Review', phase: 13 },
];

export const DIRECTIONS = [
  { value: 'bullish', label: 'Bullish', hint: 'Expecting the asset to rise', tone: 'up' },
  { value: 'bearish', label: 'Bearish', hint: 'Expecting the asset to fall', tone: 'down' },
  { value: 'neutral', label: 'Neutral', hint: 'Range / volatility, no direction', tone: 'neutral' },
];

export const TIMEFRAMES = [
  { value: '', label: 'Not specified' },
  { value: 'intraday', label: 'Intraday' },
  { value: 'swing', label: 'Swing (days)' },
  { value: 'short-term', label: 'Short-term (1–2 weeks)' },
  { value: 'position', label: 'Position (months)' },
  { value: 'earnings-event', label: 'Earnings event' },
  { value: 'macro-event', label: 'Macro event' },
];

export const EXISTING_POSITIONS = [
  { value: 'none', label: 'No existing position' },
  { value: 'long', label: 'Already long' },
  { value: 'short', label: 'Already short' },
];

export const THESIS_MIN_LENGTH = 10;
export const THESIS_MAX_LENGTH = 1000;

export const CONFIDENCE_LABELS = {
  1: 'Very low',
  2: 'Very low',
  3: 'Low',
  4: 'Low',
  5: 'Moderate',
  6: 'Moderate',
  7: 'Good',
  8: 'Strong',
  9: 'Very strong',
  10: 'Conviction',
};

export const TIMEFRAME_LABELS = Object.fromEntries(
  TIMEFRAMES.map((t) => [t.value, t.label])
);

export const EXISTING_POSITION_LABELS = Object.fromEntries(
  EXISTING_POSITIONS.map((p) => [p.value, p.label])
);
