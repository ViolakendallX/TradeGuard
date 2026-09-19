import { THESIS_MIN_LENGTH, THESIS_MAX_LENGTH } from './constants.js';

const TICKER_PATTERN = /^[A-Za-z0-9.\-/]+$/;

/**
 * Client-side validation mirroring the backend rules in
 * server/lib/validateTradeIdea.js.
 * Returns a map of field -> message. Empty map means valid.
 */
export function validateIdeaForm(form) {
  const errors = {};

  const asset = form.asset.trim();
  const thesis = form.thesis.trim();

  if (!asset) {
    errors.asset = 'Enter the asset you want to trade.';
  } else if (asset.length > 12) {
    errors.asset = 'Asset must be 12 characters or fewer.';
  } else if (!TICKER_PATTERN.test(asset)) {
    errors.asset = 'Use letters, numbers, dot, slash or dash only.';
  }

  if (!form.direction) {
    errors.direction = 'Pick a direction.';
  }

  if (!thesis) {
    errors.thesis = 'Describe your thesis before stress-testing.';
  } else if (thesis.length < THESIS_MIN_LENGTH) {
    errors.thesis = `Give at least ${THESIS_MIN_LENGTH} characters so the thesis can be evaluated.`;
  } else if (thesis.length > THESIS_MAX_LENGTH) {
    errors.thesis = `Thesis must be ${THESIS_MAX_LENGTH} characters or fewer.`;
  }

  const entry = parseNumber(form.entryPrice);
  if (entry.invalid) errors.entryPrice = 'Entry price must be a number.';
  else if (entry.value !== null && entry.value <= 0) errors.entryPrice = 'Entry price must be above zero.';

  const invalidation = parseNumber(form.invalidationPrice);
  if (invalidation.invalid) errors.invalidationPrice = 'Invalidation price must be a number.';
  else if (invalidation.value !== null && invalidation.value <= 0) {
    errors.invalidationPrice = 'Invalidation price must be above zero.';
  }

  const risk = parseNumber(form.riskAmount);
  if (risk.invalid) errors.riskAmount = 'Risk amount must be a number.';
  else if (risk.value !== null && risk.value <= 0) errors.riskAmount = 'Risk amount must be above zero.';

  return errors;
}

function parseNumber(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null, invalid: false };
  const cleaned = text.replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, invalid: true };
  return { value: parsed, invalid: false };
}

/** Builds the payload sent to the API. */
export function toSubmissionPayload(form) {
  const payload = {
    asset: form.asset.trim().toUpperCase(),
    direction: form.direction,
    thesis: form.thesis.trim(),
    timeframe: form.timeframe || null,
    entryPrice: form.entryPrice.trim() === '' ? null : form.entryPrice.trim(),
    invalidationPrice: form.invalidationPrice.trim() === '' ? null : form.invalidationPrice.trim(),
    riskAmount: form.riskAmount.trim() === '' ? null : form.riskAmount.trim(),
    confidence: form.confidence,
    existingPosition: form.existingPosition || null,
  };
  return payload;
}

export const EMPTY_FORM = {
  asset: '',
  direction: '',
  thesis: '',
  timeframe: '',
  entryPrice: '',
  invalidationPrice: '',
  riskAmount: '',
  confidence: 5,
  existingPosition: '',
};
