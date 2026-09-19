/**
 * Investigation workspace view model — PRESENTATION ONLY.
 *
 * The stage model, its completion rules and its phase logic live in
 * `investigation.js` and are deliberately NOT re-implemented here. This module
 * only maps those declared stages onto the workspace navigation (labels and
 * status copy) and holds the display formatters the panels share.
 *
 * No phase logic, no data logic, no API access, no state.
 */

import { INVESTIGATION_STAGES, STAGE_RUNTIME, stageRuntimeState } from './investigation.js';

/** Direction chip tones, shared by the trade header and the thesis section. */
export const TONE_CLASS = { bullish: 'chip--up', bearish: 'chip--down', neutral: 'chip--neutral' };

/**
 * Navigation labels. Display-only: the canonical stage labels stay in
 * `investigation.js` (and its tests) untouched.
 */
const NAV_LABELS = {
  'thesis-captured': 'Thesis',
  'market-context': 'Market Context',
  'events-catalysts': 'Events & Catalysts',
  'contradicting-evidence': "Devil's Advocate",
  'historical-comparisons': 'Historical Stress Test',
  'risk-assessment': 'Risk Assessment',
  'trade-structure': 'Trade Structure',
};

export function navLabel(stage) {
  return NAV_LABELS[stage.id] || stage.label;
}

/**
 * Short navigation labels for the risk engine's own statuses. The canonical
 * labels ('RISK READY', 'INCOMPLETE', 'INVALID TRADE CONSTRUCTION') are the
 * engine's and are used verbatim inside the panel; the rail needs something that
 * fits a 252px column, so the mapping lives here in the view model.
 */
const RISK_NAV_LABELS = {
  ready: 'Risk ready',
  incomplete: 'Incomplete',
  invalid: 'Invalid construction',
};

/**
 * Short navigation labels for the trade structure's own statuses. Same reasoning
 * as the risk labels: the canonical 'STRUCTURE COMPLETE' / 'STRUCTURE INCOMPLETE'
 * wording is used verbatim inside the panel, while the rail needs something that
 * fits a 252px column.
 */
const STRUCTURE_NAV_LABELS = {
  complete: 'Structure complete',
  incomplete: 'Structure incomplete',
};

/**
 * Human-readable status copy for a stage's runtime state.
 *
 * `detail` is the stage's own analysis result, when it has one. The risk stage
 * uses it because its two non-complete outcomes (missing inputs vs a
 * self-contradicting construction) are genuinely different and the generic
 * "Partial" badge would hide that. The structure stage uses it for the same
 * reason: "incomplete" is the meaningful word, not "partial".
 */
export function runtimeLabel(runtime, stage, detail) {
  if (stage?.id === 'risk-assessment' && detail && detail.status) {
    return RISK_NAV_LABELS[detail.status] || detail.statusLabel || 'Partial';
  }
  if (stage?.id === 'trade-structure' && detail && detail.status) {
    return STRUCTURE_NAV_LABELS[detail.status] || detail.statusLabel || 'Partial';
  }

  switch (runtime) {
    case STAGE_RUNTIME.COMPLETE:
      return 'Complete';
    case STAGE_RUNTIME.PARTIAL:
      return 'Partial';
    case STAGE_RUNTIME.UNAVAILABLE:
      return 'Data unavailable';
    case STAGE_RUNTIME.LOCKED:
      return `Coming in Phase ${stage?.phase ?? '—'}`;
    default:
      return 'Loading…';
  }
}

/**
 * Badge modifier. Deliberately reuses the existing `stage__status--*` classes so
 * the navigation keeps the established colour language rather than inventing one.
 */
export function runtimeModifier(runtime) {
  switch (runtime) {
    case STAGE_RUNTIME.COMPLETE:
      return 'done';
    case STAGE_RUNTIME.PARTIAL:
      return 'partial';
    default:
      // unavailable + locked + loading all use the neutral badge.
      return runtime === STAGE_RUNTIME.LOADING ? 'loading' : 'soon';
  }
}

/**
 * Build the workspace navigation FROM the declared stages, so the navigation can
 * never drift from the stage model. Locked stages stay listed — the user should
 * be able to see what is coming — but they are not selectable.
 *
 * `risk` is the Phase 6 result and `structure` the Phase 7 result; they are
 * passed to runtimeLabel so those rows can report their own status rather than a
 * generic one.
 */
export function buildSectionNav(research, attack, history, risk, structure) {
  return INVESTIGATION_STAGES.map((stage) => {
    const runtime = stageRuntimeState(stage, research, attack, history, risk, structure);
    const detail =
      stage.id === 'risk-assessment' ? risk : stage.id === 'trade-structure' ? structure : null;
    return {
      id: stage.id,
      stage,
      label: navLabel(stage),
      runtime,
      statusLabel: runtimeLabel(runtime, stage, detail),
      selectable: stage.available,
    };
  });
}

/** The section shown first — the thesis being tested. */
export const DEFAULT_SECTION_ID = 'thesis-captured';

// --- display formatters -----------------------------------------------------
// Moved out of the screen so every panel formats numbers identically.

export function fmt(n) {
  if (n === null || n === undefined || n === '') return '—';
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const maxFrac = Math.abs(n) >= 1 ? 2 : 4;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

export function pct(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function changeTone(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n > 0 ? 'up' : n < 0 ? 'down' : '';
}

export function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not specified';
  if (typeof value === 'number') return fmt(value);
  return String(value);
}

export const BUCKET_LABELS = {
  up: 'Up',
  down: 'Down',
  flat: 'Flat',
  modest: 'Modest',
  extended: 'Extended',
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  'near-high': 'Near the recent high',
  'near-low': 'Near the recent low',
  mid: 'Mid-range',
  unknown: 'Not assessable',
};

export function bucketLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  return BUCKET_LABELS[value] || String(value);
}
