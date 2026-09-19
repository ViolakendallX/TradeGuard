/**
 * Trade idea validation — Phase 1 (Foundation).
 *
 * Scope: validate + normalise what the trader submits.
 * Out of scope (later phases): market data, news, AI research, thesis attack,
 * historical stress testing, risk engine, trade structuring, persistence.
 */

export const DIRECTIONS = ['bullish', 'bearish', 'neutral'];

export const TIMEFRAMES = [
  'intraday',
  'swing',
  'short-term',
  'position',
  'earnings-event',
  'macro-event',
];

export const EXISTING_POSITIONS = ['none', 'long', 'short'];

export const THESIS_MIN_LENGTH = 10;
export const THESIS_MAX_LENGTH = 1000;
export const ASSET_MAX_LENGTH = 12;
const MAX_NUMBER = 1_000_000_000;

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';
const asString = (value) => (isBlank(value) ? '' : String(value).trim());

/**
 * Parses an optional numeric field.
 * Returns { value, error }. `value` is null when the field was left empty.
 */
function parseOptionalNumber(raw, label) {
  const text = asString(raw);
  if (text === '') return { value: null, error: null };

  // Allow plain numbers, currency symbols and thousands separators.
  const cleaned = text.replace(/[$,\s]/g, '');
  if (cleaned === '') return { value: null, error: `${label} is not a valid number.` };

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, error: `${label} must be a number.` };
  if (parsed < 0) return { value: null, error: `${label} cannot be negative.` };
  if (parsed > MAX_NUMBER) return { value: null, error: `${label} is out of range.` };

  return { value: parsed, error: null };
}

/**
 * @param {unknown} payload
 * @returns {{ valid: boolean, errors: Record<string, string>, value: object|null }}
 */
export function validateTradeIdea(payload) {
  const errors = {};
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const asset = asString(input.asset).toUpperCase();
  const direction = asString(input.direction).toLowerCase();
  const thesis = asString(input.thesis);
  const timeframe = asString(input.timeframe).toLowerCase();
  const existingPosition = asString(input.existingPosition).toLowerCase();

  // --- Required ---------------------------------------------------------
  if (!asset) {
    errors.asset = 'Asset is required.';
  } else if (asset.length > ASSET_MAX_LENGTH) {
    errors.asset = `Asset must be ${ASSET_MAX_LENGTH} characters or fewer.`;
  } else if (!/^[A-Z0-9.\-/]+$/.test(asset)) {
    errors.asset = 'Asset can only contain letters, numbers, dot, slash or dash.';
  }

  if (!direction) {
    errors.direction = 'Direction is required.';
  } else if (!DIRECTIONS.includes(direction)) {
    errors.direction = `Direction must be one of: ${DIRECTIONS.join(', ')}.`;
  }

  if (!thesis) {
    errors.thesis = 'Thesis is required.';
  } else if (thesis.length < THESIS_MIN_LENGTH) {
    errors.thesis = `Thesis must be at least ${THESIS_MIN_LENGTH} characters.`;
  } else if (thesis.length > THESIS_MAX_LENGTH) {
    errors.thesis = `Thesis must be ${THESIS_MAX_LENGTH} characters or fewer.`;
  }

  // --- Optional ---------------------------------------------------------
  const entryPrice = parseOptionalNumber(input.entryPrice, 'Entry price');
  if (entryPrice.error) {
    errors.entryPrice = entryPrice.error;
  } else if (entryPrice.value === 0) {
    errors.entryPrice = 'Entry price must be greater than zero.';
  }

  const riskAmount = parseOptionalNumber(input.riskAmount, 'Risk amount');
  if (riskAmount.error) errors.riskAmount = riskAmount.error;
  else if (riskAmount.value === 0) errors.riskAmount = 'Risk amount must be greater than zero.';

  let confidence = null;
  if (!isBlank(input.confidence)) {
    const parsed = Number(input.confidence);
    if (!Number.isFinite(parsed)) {
      errors.confidence = 'Confidence must be a number.';
    } else if (parsed < 1 || parsed > 10) {
      errors.confidence = 'Confidence must be between 1 and 10.';
    } else {
      confidence = Math.round(parsed);
    }
  }

  if (timeframe && !TIMEFRAMES.includes(timeframe)) {
    errors.timeframe = `Timeframe must be one of: ${TIMEFRAMES.join(', ')}.`;
  }

  if (existingPosition && !EXISTING_POSITIONS.includes(existingPosition)) {
    errors.existingPosition = `Existing position must be one of: ${EXISTING_POSITIONS.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, value: null };
  }

  return {
    valid: true,
    errors: {},
    value: {
      asset,
      direction,
      thesis,
      timeframe: timeframe || null,
      entryPrice: entryPrice.value,
      riskAmount: riskAmount.value,
      confidence,
      existingPosition: existingPosition || null,
    },
  };
}

/**
 * Basic sanity response for Phase 1.
 * Deliberately contains no analysis, no scores and no probabilities.
 */
export function buildCaptureResponse(value) {
  return {
    status: 'captured',
    receivedAt: new Date().toISOString(),
    idea: value,
    // Phase 1 only validates and captures the thesis. Everything below is
    // intentionally NOT built yet and must not be faked.
    nextSteps: [
      { step: 'Research', phase: 2, available: false },
      { step: 'Thesis attack', phase: 4, available: false },
      { step: 'Historical stress test', phase: 5, available: false },
      { step: 'Risk engine', phase: 6, available: false },
      { step: 'Trade structure', phase: 7, available: false },
    ],
    message:
      'Thesis captured. TradeGuard has recorded what you believe and why. ' +
      'Research, thesis attack and stress testing are not enabled in this build.',
  };
}
