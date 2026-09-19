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
};

export function navLabel(stage) {
  return NAV_LABELS[stage.id] || stage.label;
}

/** Human-readable status copy for a stage's runtime state. */
export function runtimeLabel(runtime, stage) {
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
 */
export function buildSectionNav(research, attack, history) {
  return INVESTIGATION_STAGES.map((stage) => {
    const runtime = stageRuntimeState(stage, research, attack, history);
    return {
      id: stage.id,
      stage,
      label: navLabel(stage),
      runtime,
      statusLabel: runtimeLabel(runtime, stage),
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
