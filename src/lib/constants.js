/**
 * The eight workflow screens.
 *
 * `accent` names ONE of the section hues in the token system, and it is the
 * only place that mapping is decided — the sidebar, the header, the section
 * chrome and the badges all read it from here, so a section cannot end up two
 * different colours in two places.
 *
 * `icon` names a glyph from `src/components/Icon.jsx`.
 */
export const NAV_ITEMS = [
  { id: 'trade-idea', label: 'Trade Idea', phase: 1, icon: 'compass', accent: 'thesis' },
  { id: 'investigation', label: 'Investigation', phase: 2, icon: 'thesis', accent: 'thesis' },
  { id: 'trade-report', label: 'Trade Report', phase: 8, icon: 'report', accent: 'report' },
  { id: 'decision', label: 'Decision', phase: 9, icon: 'decision', accent: 'decision' },
  { id: 'paper-execution', label: 'Paper Execution', phase: 10, icon: 'execution', accent: 'execution' },
  { id: 'trade-review', label: 'Trade Review', phase: 11, icon: 'history', accent: 'history' },
  { id: 'trade-memory', label: 'Trade Memory', phase: 12, icon: 'memory', accent: 'memory' },
  { id: 'trader-review', label: 'Trader Review', phase: 13, icon: 'review', accent: 'review' },
];

/**
 * The four stages of the TradeGuard workflow, as shown in the sidebar.
 *
 * The sidebar deliberately does NOT grow to thirteen entries. The eight analysis
 * stages (thesis → market → events → attack → history → risk → structure →
 * report) already have their own rail inside the Investigation workspace, so
 * repeating them here would create a second, competing navigation. Instead:
 *
 *   - each group is labelled, spaced and captioned, which is what creates the
 *     hierarchy the eye reads before it reads any single item;
 *   - the investigation group's caption names all eight stages, so the whole
 *     pipeline is legible at a glance without duplicating any control;
 *   - each item carries its own accent and icon, so the sidebar teaches the
 *     product's colour language before the trader ever opens a section.
 *
 * `items` must partition NAV_ITEMS exactly — every id appears once, in NAV_ITEMS
 * order. That invariant is asserted in investigation.test.js, and it is the
 * thing that stops the sidebar drifting out of step with the real routes.
 */
export const NAV_GROUPS = [
  {
    id: 'trading',
    label: 'Trading',
    caption: 'Start with the idea',
    items: ['trade-idea'],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    caption: 'Thesis · Market · Events · Attack · History · Risk · Structure · Report',
    items: ['investigation', 'trade-report'],
  },
  {
    id: 'decision',
    label: 'Decision',
    caption: 'Decide · Execute',
    items: ['decision', 'paper-execution'],
  },
  {
    id: 'memory',
    label: 'Memory',
    caption: 'Review · Remember · Reflect',
    items: ['trade-review', 'trade-memory', 'trader-review'],
  },
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
