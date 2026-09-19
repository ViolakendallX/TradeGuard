/**
 * Deterministic risk engine service (Phase 6).
 *
 * Purpose: answer "given the way this trade is constructed, what is the defined
 * risk, and what important risk information is missing or inconsistent?"
 *
 * Everything in this module is arithmetic on numbers the TRADER supplied. There
 * is no market-data call, no provider, no model and no estimation. Code
 * calculates; the UI explains.
 *
 * What this module deliberately never does:
 *   - It never substitutes the current market price for the trader's entry.
 *     Entry and invalidation are the trader's own levels, taken as given.
 *   - It never invents an invalidation level, a position size, an account
 *     balance, a risk percentage, an expected return or a probability.
 *   - It never emits BUY / SELL / PASS, a score, or any "this trade is good /
 *     safe / worth taking" judgement. The human decides.
 *   - It never calculates around an unusable input. A missing input produces
 *     INCOMPLETE naming exactly what is missing; a self-contradicting
 *     construction produces INVALID TRADE CONSTRUCTION naming the contradiction.
 *
 * Method (long / bullish):
 *   price risk per unit = entry - invalidation
 *   position size       = risk budget / |price risk per unit|
 *   defined risk        = position size * price risk per unit
 *
 * Method (short / bearish):
 *   price risk per unit = invalidation - entry
 *   position size and defined risk are identical to the long case.
 *
 * The price risk per unit must be strictly positive. Zero or negative means the
 * invalidation is on the wrong side of the entry for the stated direction, and
 * that is reported as an invalid construction rather than computed around.
 *
 * Output: a structured, frontend-safe object (see runRiskAssessment).
 */

export const RISK_STATUS = Object.freeze({
  READY: 'ready', // every input present and the construction is coherent
  INCOMPLETE: 'incomplete', // an input the calculation needs is missing
  INVALID: 'invalid', // the inputs contradict each other
});

/**
 * Human-facing status labels. These are the only three states the engine
 * reports — deliberately NOT a BUY/SELL/PASS verdict.
 */
export const RISK_STATUS_LABELS = Object.freeze({
  ready: 'RISK READY',
  incomplete: 'INCOMPLETE',
  invalid: 'INVALID TRADE CONSTRUCTION',
});

/** Which side of the market the thesis takes. `neutral` has no side. */
export const RISK_SIDES = Object.freeze({ long: 'long', short: 'short', none: 'none' });

/**
 * How the numbers are produced, stated plainly. Shipped with every response so
 * the frontend (and the trader) never has to infer the method.
 */
export const RISK_METHOD_NOTE =
  'Price risk per unit is the distance between your entry and your invalidation, measured in the ' +
  'direction the trade goes against you. The position size is your risk budget divided by that ' +
  'distance, so that a move from your entry to your invalidation loses the amount you budgeted. ' +
  'This is arithmetic on the levels you supplied — TradeGuard does not check them against the market ' +
  'and does not judge whether they are good levels.';

export const RISK_DISCLAIMER =
  'The defined risk is the loss implied by your entry, your invalidation and your risk budget. It is ' +
  'not a promise about the outcome and not a trading instruction — the decision remains yours.';

/** Non-negotiable caveats. Always returned, so the UI cannot omit them. */
export const RISK_LIMITATIONS = Object.freeze([
  'The defined risk assumes the position is filled at the stated entry and closed at the stated ' +
    'invalidation. Slippage, fees, financing and gaps through the invalidation can all make the ' +
    'realised loss different — usually larger, not smaller.',
  'TradeGuard did not verify the entry or the invalidation against live market prices. Both are the ' +
    'levels you supplied, taken as given.',
  'A calculated position size that is not a whole number of units may not be executable on venues ' +
    'that only allow whole units. Rounding down would reduce the risk below the stated budget.',
  'This engine measures price risk at a single invalidation level. It does not model portfolio ' +
    'exposure, correlated positions, or drawdown across several trades.',
  'The risk budget is taken as given. TradeGuard does not know your account size and does not judge ' +
    'whether the amount is appropriate for you.',
]);

/** Extra caveat added only when the trader declared an existing position. */
export const EXISTING_POSITION_NOTE =
  'You declared an existing position. The calculated size covers this trade only — it does not account ' +
  'for exposure you already hold, so your total risk on this asset may be larger.';

const MAX_NUMBER = 1_000_000_000;

// --- small helpers ----------------------------------------------------------

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

/**
 * Parses one trader-supplied number. Mirrors the tolerance of the Phase 1
 * validator (currency symbols, thousands separators) so the same string is read
 * the same way everywhere.
 *
 * @returns {{ value: number|null, state: 'empty'|'ok'|'invalid', error: string|null }}
 */
export function parseRiskNumber(raw, label) {
  if (isBlank(raw)) return { value: null, state: 'empty', error: null };

  const cleaned = String(raw).replace(/[$,\s]/g, '');
  if (cleaned === '') return { value: null, state: 'invalid', error: `${label} is not a valid number.` };

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, state: 'invalid', error: `${label} must be a number.` };
  if (parsed < 0) return { value: null, state: 'invalid', error: `${label} cannot be negative.` };
  if (parsed > MAX_NUMBER) return { value: null, state: 'invalid', error: `${label} is out of range.` };

  return { value: parsed, state: 'ok', error: null };
}

const round = (n, dp) => {
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** dp;
  return Math.round(n * factor) / factor;
};

/** Maps a thesis direction onto the side of the market it takes. */
export function riskSideOf(direction) {
  if (direction === 'bullish') return RISK_SIDES.long;
  if (direction === 'bearish') return RISK_SIDES.short;
  return RISK_SIDES.none;
}

const issue = (id, title, detail) => ({ id, title, detail });

/**
 * The core calculation. Pure: same input -> same output, no I/O, no clock.
 *
 * @param {object} input
 * @param {string} input.direction   bullish | bearish | neutral
 * @param {*}      input.entryPrice
 * @param {*}      input.invalidationPrice
 * @param {*}      input.riskAmount
 * @param {*}      [input.timeframe]
 * @param {*}      [input.confidence]
 * @param {*}      [input.existingPosition]
 */
export function assessRisk(input) {
  const src = input && typeof input === 'object' ? input : {};
  const direction = typeof src.direction === 'string' ? src.direction.toLowerCase() : '';
  const side = riskSideOf(direction);

  const entry = parseRiskNumber(src.entryPrice, 'Entry price');
  const invalidation = parseRiskNumber(src.invalidationPrice, 'Invalidation price');
  const riskAmount = parseRiskNumber(src.riskAmount, 'Risk amount');

  const missingInformation = [];
  const warnings = [];

  // --- 1. Missing inputs ---------------------------------------------------
  if (entry.state === 'empty') {
    missingInformation.push(
      issue('entry-price', 'Entry price', 'No entry price was supplied, so there is no reference point to measure price risk from.')
    );
  }
  if (invalidation.state === 'empty') {
    missingInformation.push(
      issue(
        'invalidation-price',
        'Invalidation / stop price',
        'No invalidation level was supplied. TradeGuard will not invent one — the trader has to define where the thesis is wrong.'
      )
    );
  }
  if (riskAmount.state === 'empty') {
    missingInformation.push(
      issue('risk-amount', 'Risk amount', 'No risk budget was supplied, so no position size can be derived.')
    );
  }

  // --- 2. Malformed / non-positive numbers ---------------------------------
  if (entry.state === 'invalid') {
    warnings.push(issue('entry-not-usable', 'Entry price is not usable', entry.error));
  } else if (entry.state === 'ok' && entry.value === 0) {
    warnings.push(
      issue('entry-not-positive', 'Entry price is not positive', 'An entry price of zero cannot be used as a reference point.')
    );
  }

  if (invalidation.state === 'invalid') {
    warnings.push(issue('invalidation-not-usable', 'Invalidation price is not usable', invalidation.error));
  } else if (invalidation.state === 'ok' && invalidation.value === 0) {
    warnings.push(
      issue(
        'invalidation-not-positive',
        'Invalidation price is not positive',
        'An invalidation of zero is not a usable stop level.'
      )
    );
  }

  if (riskAmount.state === 'invalid') {
    warnings.push(issue('risk-amount-not-usable', 'Risk amount is not usable', riskAmount.error));
  } else if (riskAmount.state === 'ok' && riskAmount.value === 0) {
    warnings.push(
      issue('risk-amount-not-positive', 'Risk amount is not positive', 'A risk budget of zero cannot size a position.')
    );
  }

  // --- 3. Direction must identify a side -----------------------------------
  if (side === RISK_SIDES.none) {
    missingInformation.push(
      issue(
        'directional-side',
        'Directional side',
        direction === 'neutral'
          ? 'A neutral thesis is not a directional trade, so there is no long or short side to measure price risk against. TradeGuard will not guess which side the invalidation belongs to.'
          : 'No direction was supplied, so there is no long or short side to measure price risk against.'
      )
    );
  }

  const entryUsable = entry.state === 'ok' && entry.value > 0;
  const invalidationUsable = invalidation.state === 'ok' && invalidation.value > 0;
  const riskAmountUsable = riskAmount.state === 'ok' && riskAmount.value > 0;
  const priceLevelsUsable = entryUsable && invalidationUsable;

  // --- 4. The construction must be coherent --------------------------------
  // Only assessable when we have a side and two usable price levels.
  let priceRiskPerUnit = null;
  const constructionAssessable = side !== RISK_SIDES.none && priceLevelsUsable;

  if (constructionAssessable) {
    const difference = side === RISK_SIDES.long ? entry.value - invalidation.value : invalidation.value - entry.value;

    if (difference === 0) {
      warnings.push(
        issue(
          'zero-price-risk',
          'Entry and invalidation are the same price',
          'The price risk per unit is zero, so no position size can be derived and there is no defined risk. Either the invalidation was entered at the entry price by mistake, or the level still needs choosing.'
        )
      );
    } else if (difference < 0) {
      warnings.push(
        issue(
          side === RISK_SIDES.long ? 'wrong-side-long' : 'wrong-side-short',
          side === RISK_SIDES.long
            ? 'A bullish trade has its invalidation at or above the entry'
            : 'A bearish trade has its invalidation at or below the entry',
          side === RISK_SIDES.long
            ? 'For a bullish (long) trade the invalidation has to sit BELOW the entry — that is where the thesis would be wrong and the loss is taken. As entered, the invalidation is on the profitable side, so the price risk per unit is negative and the trade construction is inconsistent.'
            : 'For a bearish (short) trade the invalidation has to sit ABOVE the entry — that is where the thesis would be wrong and the loss is taken. As entered, the invalidation is on the profitable side, so the price risk per unit is negative and the trade construction is inconsistent.'
        )
      );
    } else {
      priceRiskPerUnit = difference;
    }
  }

  // A budget that exists but cannot be applied is worth calling out on its own.
  // Only when the construction WAS assessable — i.e. the price levels were both
  // present and usable and the side was known — but the price risk still came
  // out unusable. If a price level is simply missing, or the thesis has no side,
  // that is the real problem and it is already reported as missing information.
  if (riskAmountUsable && constructionAssessable && priceRiskPerUnit === null) {
    warnings.push(
      issue(
        'unusable-risk-budget',
        'The risk budget cannot be applied',
        'A risk budget was supplied, but it cannot be converted into a position size because the price risk per unit is not usable.'
      )
    );
  }

  // --- 5. Decide the status ------------------------------------------------
  let status;
  if (warnings.length > 0) {
    // Anything contradictory or malformed dominates: never calculate around it.
    status = RISK_STATUS.INVALID;
  } else if (missingInformation.length > 0 || !entryUsable || !invalidationUsable || !riskAmountUsable) {
    status = RISK_STATUS.INCOMPLETE;
  } else {
    status = RISK_STATUS.READY;
  }

  // --- 6. Calculate only when everything is usable -------------------------
  let calculation = null;
  let interpretation = null;

  if (status === RISK_STATUS.READY) {
    const positionSize = riskAmount.value / priceRiskPerUnit;
    const definedRisk = positionSize * priceRiskPerUnit;

    calculation = {
      priceRiskPerUnit: round(priceRiskPerUnit, 6),
      positionSize: round(positionSize, 6),
      definedRisk: round(definedRisk, 2),
      riskBudget: round(riskAmount.value, 2),
      priceRiskPctOfEntry: round((priceRiskPerUnit / entry.value) * 100, 2),
      notionalValue: round(positionSize * entry.value, 2),
    };

    const sideWord = side === RISK_SIDES.long ? 'long' : 'short';
    interpretation =
      `At an entry of ${fmtNum(entry.value)} with the invalidation at ${fmtNum(invalidation.value)}, ` +
      `this ${sideWord} trade risks ${fmtNum(calculation.priceRiskPerUnit)} per unit ` +
      `(${fmtNum(calculation.priceRiskPctOfEntry)}% of the entry). With a risk budget of ` +
      `${fmtNum(calculation.riskBudget)}, the calculated position size is ${fmtNum(calculation.positionSize)} units, ` +
      `which puts the loss at the invalidation level at ${fmtNum(calculation.definedRisk)} before costs. ` +
      `Whether those levels are the right ones for this trade is your call, not TradeGuard's.`;
  }

  const limitations = [...RISK_LIMITATIONS];
  if (src.existingPosition === 'long' || src.existingPosition === 'short') {
    limitations.push(EXISTING_POSITION_NOTE);
  }

  return {
    available: true,
    status,
    statusLabel: RISK_STATUS_LABELS[status],
    statusDetail: buildStatusDetail(status, side, missingInformation, warnings),
    direction,
    side,
    inputs: {
      entryPrice: entry.state === 'ok' ? entry.value : null,
      invalidationPrice: invalidation.state === 'ok' ? invalidation.value : null,
      riskAmount: riskAmount.state === 'ok' ? riskAmount.value : null,
      timeframe: src.timeframe || null,
      confidence: src.confidence ?? null,
      existingPosition: src.existingPosition || null,
    },
    formula: {
      side,
      priceRiskExpression:
        side === RISK_SIDES.long
          ? 'entry − invalidation'
          : side === RISK_SIDES.short
          ? 'invalidation − entry'
          : null,
      positionSizeExpression: 'risk budget ÷ price risk per unit',
      definedRiskExpression: 'position size × price risk per unit',
    },
    calculation,
    interpretation,
    missingInformation,
    warnings,
    methodology: {
      note: RISK_METHOD_NOTE,
      priceRiskPerUnit:
        'For a long trade: entry − invalidation. For a short trade: invalidation − entry. The result must be positive, otherwise the invalidation is on the wrong side of the entry.',
      positionSize:
        'Risk budget ÷ price risk per unit. The size is the amount that loses your full budget if the price travels from your entry to your invalidation.',
      definedRisk:
        'Position size × price risk per unit — the loss implied by the stated entry, invalidation and budget.',
      rounding:
        'Position size is shown to six decimal places and money values to two. The size is not rounded up or down before the defined risk is derived, so the defined risk matches the budget you supplied.',
    },
    limitations,
    disclaimer: RISK_DISCLAIMER,
  };
}

function fmtNum(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const maxFrac = Math.abs(v) >= 1 ? 2 : 6;
  return v.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

function buildStatusDetail(status, side, missingInformation, warnings) {
  if (status === RISK_STATUS.READY) {
    return side === RISK_SIDES.long
      ? 'Every input needed is present and the invalidation sits below the entry, so the defined risk could be calculated.'
      : 'Every input needed is present and the invalidation sits above the entry, so the defined risk could be calculated.';
  }
  if (status === RISK_STATUS.INCOMPLETE) {
    const titles = missingInformation.map((m) => m.title.toLowerCase());
    return titles.length > 0
      ? `The risk could not be calculated. Missing: ${titles.join(', ')}.`
      : 'The risk could not be calculated because a required input is not usable.';
  }
  return warnings.length > 0
    ? `The trade construction is inconsistent: ${warnings.map((w) => w.title).join('; ')}.`
    : 'The trade construction is inconsistent, so no defined risk is reported.';
}

/**
 * Entry point used by the API route. Wraps assessRisk with the fields the
 * investigation carries, and adds the asset label for traceability.
 *
 * This is a pure function: it never touches the network, so it cannot fail for
 * data reasons. `available` is therefore always true — a missing input is an
 * INCOMPLETE assessment, not an unavailable one.
 *
 * @param {object} context the submitted trade context
 */
export function runRiskAssessment(context) {
  const src = context && typeof context === 'object' ? context : {};

  const result = assessRisk({
    direction: src.direction,
    entryPrice: src.entryPrice,
    invalidationPrice: src.invalidationPrice,
    riskAmount: src.riskAmount,
    timeframe: src.timeframe,
    confidence: src.confidence,
    existingPosition: src.existingPosition,
  });

  return {
    ...result,
    asset: typeof src.asset === 'string' ? src.asset.trim().toUpperCase() : '',
    generatedAt: new Date().toISOString(),
  };
}
