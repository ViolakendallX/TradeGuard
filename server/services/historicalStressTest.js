/**
 * Historical stress test service (Phase 5).
 *
 * Purpose: answer "have similar market setups happened before, and what
 * happened afterwards?" — using REAL historical candles from the SAME provider
 * architecture Phase 3 already uses. This module does NOT introduce a second
 * market-data integration: it reuses `fetchBitgetCandles` + `toCandleRow`.
 *
 * What this module is NOT:
 *   - It is not a predictor. It reports what happened after similar past setups
 *     and says so in those words.
 *   - It does not produce BUY / SELL / PASS, a trade recommendation, or a score
 *     that could be mistaken for a probability or an edge.
 *   - It never fabricates a historical observation, a win rate, or a "match"
 *     when the data is missing. No data -> an explicit UNAVAILABLE state that
 *     names exactly what is missing.
 *
 * Method (fully deterministic; the rules are the specification):
 *   1. Pick a profile from the trader's timeframe. A profile fixes the candle
 *      granularity, the SETUP window (how many bars characterise the setup) and
 *      the OUTCOME horizon (how many bars forward we measure).
 *   2. Characterise the CURRENT setup from the most recent `windowBars` bars.
 *      Features + bucket thresholds are reused from the Phase 4 engine
 *      (flat band 0.5%, extended move 3%, elevated volatility 2%, near-extreme
 *      1%) so both engines classify the market the same way.
 *   3. Walk the SAME candle series backwards. A historical window is a MATCH
 *      only if every assessable criterion is EQUAL to the current setup's.
 *      Windows that overlap the current setup, or whose outcome horizon runs
 *      past the end of the series, are excluded (no look-ahead).
 *   4. Matches must be spaced at least `windowBars + horizonBars` apart, so the
 *      reported sample is non-overlapping rather than one market move counted
 *      many times.
 *   5. For each accepted match, measure what happened over the horizon.
 *
 * Inputs:
 *   context — { asset, direction, thesis, timeframe, entryPrice, ... }
 *   opts    — { fetchImpl, now, research }
 *
 * Output: a structured, frontend-safe object (see runHistoricalStressTest).
 */

import { fetchBitgetCandles, bitgetSymbol } from './providers/bitget.js';
import { toCandleRow } from './marketData.js';

export const HISTORY_STATUS = Object.freeze({
  OK: 'ok',
  NO_MATCHES: 'no-matches',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
});

/** Human-facing status labels. UNAVAILABLE is the explicit data-honesty state. */
export const HISTORY_STATUS_LABELS = Object.freeze({
  ok: 'Historical sample available',
  'no-matches': 'No comparable setups found',
  partial: 'Partial / data-limited',
  unavailable: 'HISTORICAL DATA UNAVAILABLE',
});

/**
 * Bucket thresholds. Deliberately the SAME values the Phase 4 thesis-attack
 * engine uses, so "flat", "extended" and "elevated volatility" mean one thing
 * across TradeGuard.
 */
export const HISTORY_THRESHOLDS = Object.freeze({
  flatBandPct: 0.5, // |move| <= 0.5% is flat
  extendedMovePct: 3, // |move| >= 3% is an extended move
  lowVolPct: 1, // realized vol < 1% is a low-volatility regime
  elevatedVolPct: 2, // realized vol >= 2% is an elevated-volatility regime
  nearExtremePct: 1, // within 1% of the window high/low is "near" that extreme
});

/** Sampled-history requirement. Below this we still run, but label it partial. */
export const MIN_SAMPLE_BARS = 60;

/** Fewer independent matches than this and the sample is labelled partial. */
export const MIN_INDEPENDENT_MATCHES = 3;

/** How many matched observations are returned to the UI. */
export const MAX_OBSERVATIONS = 12;

/** Provider candle page size (Bitget caps this at 1000). */
export const CANDLE_FETCH_LIMIT = 1000;

/**
 * Timeframe -> sampling profile. `granularity` is in SECONDS (Bitget's unit).
 * `windowBars` = setup lookback, `horizonBars` = forward outcome measurement.
 * Every profile is explicit here so the sampling is auditable, not tuned.
 */
export const TIMEFRAME_PROFILES = Object.freeze({
  intraday: { key: 'intraday', granularity: 900, windowBars: 16, horizonBars: 4 },
  'earnings-event': { key: 'earnings-event', granularity: 3600, windowBars: 24, horizonBars: 4 },
  'macro-event': { key: 'macro-event', granularity: 3600, windowBars: 24, horizonBars: 4 },
  swing: { key: 'swing', granularity: 14400, windowBars: 18, horizonBars: 3 },
  'short-term': { key: 'short-term', granularity: 86400, windowBars: 10, horizonBars: 3 },
  position: { key: 'position', granularity: 86400, windowBars: 20, horizonBars: 5 },
});

/** Used when the trader supplied no timeframe — and always flagged as assumed. */
export const DEFAULT_TIMEFRAME_KEY = 'swing';

const GRANULARITY_LABELS = {
  60: '1m',
  300: '5m',
  900: '15m',
  1800: '30m',
  3600: '1h',
  14400: '4h',
  21600: '6h',
  43200: '12h',
  86400: '1d',
};

/**
 * The matching criteria, in the order they are reported. `key` is stable for
 * tests and UI; each criterion is an EQUALITY test on a bucketed feature.
 */
export const MATCH_CRITERIA = Object.freeze([
  { key: 'trend-direction', label: 'Trend direction', values: 'up | down | flat' },
  { key: 'move-magnitude', label: 'Recent move magnitude', values: 'flat | modest | extended' },
  { key: 'volatility-regime', label: 'Volatility regime', values: 'low | normal | elevated' },
  { key: 'position-in-range', label: 'Position within the recent range', values: 'near-high | near-low | mid' },
]);

/**
 * How the similarity works, stated plainly. Shipped with every response so the
 * frontend (and the trader) never has to infer what a "match" means.
 */
export const MATCH_METHOD_NOTE =
  'A historical window matches only when EVERY criterion listed is equal to the current setup. ' +
  'This is rule agreement, not a probability and not a statistical edge: it says the setups looked alike, ' +
  'not that the outcome will repeat.';

export const HISTORY_DISCLAIMER =
  'Historical observations describe what happened after similar past setups. They are not a prediction, ' +
  'they do not guarantee that history repeats, and they are not a trading instruction — the decision remains yours.';

// --- small helpers ----------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return null;
  return n % 2 ? sorted[(n - 1) / 2] : round2((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}

/**
 * Epoch (ms or s) -> ISO string, matching the Phase 3 market-data contract so
 * the frontend renders one timestamp format everywhere.
 */
function toIsoTs(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return typeof v === 'string' ? v : null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeDirection(v) {
  const d = String(v || '').toLowerCase();
  return d === 'bullish' || d === 'bearish' || d === 'neutral' ? d : 'neutral';
}

/** Bucket a window's net move using the Phase 4 flat/extended thresholds. */
export function moveBucketOf(movePct) {
  const a = Math.abs(movePct);
  if (a < HISTORY_THRESHOLDS.flatBandPct) return 'flat';
  if (a < HISTORY_THRESHOLDS.extendedMovePct) return 'modest';
  return 'extended';
}

/** Bucket realized volatility into a regime. */
export function volRegimeOf(volPct) {
  if (volPct === null || volPct === undefined) return 'unknown';
  if (volPct < HISTORY_THRESHOLDS.lowVolPct) return 'low';
  if (volPct < HISTORY_THRESHOLDS.elevatedVolPct) return 'normal';
  return 'elevated';
}

/** Bucket where the close sits relative to the window's high/low. */
export function extremeBucketOf(distFromHighPct, distFromLowPct) {
  if (distFromHighPct !== null && distFromHighPct <= HISTORY_THRESHOLDS.nearExtremePct) return 'near-high';
  if (distFromLowPct !== null && distFromLowPct <= HISTORY_THRESHOLDS.nearExtremePct) return 'near-low';
  return 'mid';
}

/** Trend direction over a window, using the shared 0.5% flat band. */
export function trendDirectionOf(trendPct) {
  if (trendPct > HISTORY_THRESHOLDS.flatBandPct) return 'up';
  if (trendPct < -HISTORY_THRESHOLDS.flatBandPct) return 'down';
  return 'flat';
}

/**
 * Characterise the setup ending at `endIndex` (inclusive) over `windowBars`.
 * Returns null when the window is not fully available.
 */
function setupFeaturesAt(rows, endIndex, windowBars) {
  const startIndex = endIndex - windowBars + 1;
  if (startIndex < 0 || endIndex >= rows.length) return null;

  const window = rows.slice(startIndex, endIndex + 1);
  const closes = window.map((r) => r.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!first || !last) return null;

  const trendPct = round2(((last - first) / first) * 100);

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev) returns.push((closes[i] - prev) / prev);
  }
  const volPct = returns.length ? round2(stddev(returns) * 100) : null;

  const highs = window.map((r) => (r.high !== null && r.high !== undefined ? r.high : r.close));
  const lows = window.map((r) => (r.low !== null && r.low !== undefined ? r.low : r.close));
  const high = Math.max(...highs);
  const low = Math.min(...lows);

  const distFromHighPct = high > 0 ? round2(((high - last) / high) * 100) : null;
  const distFromLowPct = low > 0 ? round2(((last - low) / low) * 100) : null;

  return {
    startIndex,
    endIndex,
    startTs: window[0].ts,
    endTs: window[window.length - 1].ts,
    startClose: first,
    close: last,
    trendPct,
    trendDirection: trendDirectionOf(trendPct),
    volPct,
    volRegime: volRegimeOf(volPct),
    moveBucket: moveBucketOf(trendPct),
    extremeBucket: extremeBucketOf(distFromHighPct, distFromLowPct),
    high,
    low,
    distFromHighPct,
    distFromLowPct,
  };
}

/**
 * The criteria that are actually assessable for the current setup. A criterion
 * whose current value could not be computed is dropped and reported as such,
 * rather than silently matching on "unknown".
 */
function assessableCriteria(current) {
  const out = [];
  for (const c of MATCH_CRITERIA) {
    if (c.key === 'trend-direction') out.push({ ...c, currentValue: current.trendDirection });
    if (c.key === 'move-magnitude') out.push({ ...c, currentValue: current.moveBucket });
    if (c.key === 'volatility-regime' && current.volRegime !== 'unknown') {
      out.push({ ...c, currentValue: current.volRegime });
    }
    if (c.key === 'position-in-range' && (current.distFromHighPct !== null || current.distFromLowPct !== null)) {
      out.push({ ...c, currentValue: current.extremeBucket });
    }
  }
  return out;
}

function criterionValue(candidate, key) {
  if (key === 'trend-direction') return candidate.trendDirection;
  if (key === 'move-magnitude') return candidate.moveBucket;
  if (key === 'volatility-regime') return candidate.volRegime;
  if (key === 'position-in-range') return candidate.extremeBucket;
  return null;
}

/**
 * What happened over `horizonBars` after the setup at `index`.
 * Excursions are thesis-relative and clamped at zero: `favourableExcursionPct`
 * >= 0 is the best point reached in the thesis direction, and
 * `adverseExcursionPct` <= 0 is the worst point reached against it (0 when
 * price never traded against the thesis at all).
 */
function outcomeAt(rows, index, horizonBars, direction) {
  const endIndex = index + horizonBars;
  if (endIndex >= rows.length) return null;

  const entry = rows[index].close;
  if (!entry) return null;
  const exit = rows[endIndex].close;
  if (!exit) return null;

  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (let k = index + 1; k <= endIndex; k++) {
    const h = rows[k].high !== null && rows[k].high !== undefined ? rows[k].high : rows[k].close;
    const l = rows[k].low !== null && rows[k].low !== undefined ? rows[k].low : rows[k].close;
    if (h !== null && h > maxHigh) maxHigh = h;
    if (l !== null && l < minLow) minLow = l;
  }
  if (!Number.isFinite(maxHigh) || !Number.isFinite(minLow)) return null;

  const movePct = round2(((exit - entry) / entry) * 100);
  const upExcursionPct = round2(((maxHigh - entry) / entry) * 100);
  const downExcursionPct = round2(((minLow - entry) / entry) * 100);

  // Excursions are measured FROM THE ENTRY and clamped at zero: if price never
  // traded below the entry there was no adverse excursion, and reporting a
  // positive number there would overstate what happened.
  // Thesis-relative: favourable >= 0, adverse <= 0, for both directions.
  const favourableExcursionPct = direction === 'bearish' ? Math.max(0, -downExcursionPct) : Math.max(0, upExcursionPct);
  const adverseExcursionPct = direction === 'bearish' ? Math.min(0, -upExcursionPct) : Math.min(0, downExcursionPct);

  // "Aligned" = the horizon move ended in the thesis direction. For a neutral
  // thesis, alignment means price stayed inside the flat band (a range held).
  let aligned;
  if (direction === 'bullish') aligned = movePct > 0;
  else if (direction === 'bearish') aligned = movePct < 0;
  else aligned = Math.abs(movePct) <= HISTORY_THRESHOLDS.flatBandPct;

  const flat = Math.abs(movePct) <= HISTORY_THRESHOLDS.flatBandPct;

  return {
    index,
    ts: rows[endIndex].ts,
    setupEndTs: rows[index].ts,
    entryPrice: entry,
    exitPrice: exit,
    movePct,
    aligned,
    flat,
    favourableExcursionPct,
    adverseExcursionPct,
  };
}

function summarizeOutcomes(observations) {
  if (!observations.length) return null;
  const moves = observations.map((o) => o.movePct).sort((a, b) => a - b);
  const adverse = observations.map((o) => o.adverseExcursionPct).sort((a, b) => a - b);
  const favourable = observations.map((o) => o.favourableExcursionPct).sort((a, b) => a - b);

  return {
    count: observations.length,
    alignedCount: observations.filter((o) => o.aligned && !o.flat).length,
    againstCount: observations.filter((o) => !o.aligned && !o.flat).length,
    flatCount: observations.filter((o) => o.flat).length,
    medianMovePct: median(moves),
    bestMovePct: moves[moves.length - 1],
    worstMovePct: moves[0],
    medianAdverseExcursionPct: median(adverse),
    medianFavourableExcursionPct: median(favourable),
  };
}

function profileFor(timeframe) {
  const key = String(timeframe || '').trim();
  if (key && TIMEFRAME_PROFILES[key]) return { profile: TIMEFRAME_PROFILES[key], assumed: false };
  return { profile: TIMEFRAME_PROFILES[DEFAULT_TIMEFRAME_KEY], assumed: true };
}

function describeProfile(profile, sampleBars) {
  const g = GRANULARITY_LABELS[profile.granularity] || `${profile.granularity}s`;
  return {
    key: profile.key,
    granularity: profile.granularity,
    granularityLabel: g,
    windowBars: profile.windowBars,
    horizonBars: profile.horizonBars,
    sampleBars,
  };
}

/** The always-present limitations. Honesty about the method, not boilerplate. */
function buildLimitations({ profile, sampleBars, timeframeAssumed, independentCount }) {
  const out = [];
  out.push(
    'Historical observations are a description of the past, not a forecast. Nothing here says this trade will behave the same way.'
  );
  out.push(
    `The sample is drawn from this asset's own recent history on one venue (Bitget spot): ${sampleBars} ${profile.granularityLabel} bars, which is a limited window and not a broad market study.`
  );
  out.push(
    `Matched setups are spaced at least ${profile.windowBars + profile.horizonBars} bars apart so the sample is non-overlapping, but market regimes are still not statistically independent.`
  );
  out.push(
    'Matches come from fixed, published thresholds (flat 0.5%, extended move 3%, elevated volatility 2%, near-extreme 1%). Different thresholds would select a different sample.'
  );
  out.push('Outcomes ignore fees, slippage, funding and liquidity. They are raw price moves.');
  if (independentCount > 0 && independentCount < MIN_INDEPENDENT_MATCHES) {
    out.push(
      `Only ${independentCount} non-overlapping match${independentCount === 1 ? '' : 'es'} were found — too few to read as a pattern.`
    );
  }
  if (timeframeAssumed) {
    out.push(
      `No timeframe was supplied, so a default sampling profile was assumed (${profile.granularityLabel} bars, ${profile.windowBars}-bar setup, ${profile.horizonBars}-bar outcome). The horizon may not match your intended holding period.`
    );
  }
  return out;
}

// --- public API -------------------------------------------------------------

/** Honest UNAVAILABLE state. Never carries fabricated observations. */
export function unavailableHistorical(reason, extra = {}) {
  return {
    available: false,
    dataLimited: true,
    status: HISTORY_STATUS.UNAVAILABLE,
    statusLabel: HISTORY_STATUS_LABELS[HISTORY_STATUS.UNAVAILABLE],
    reason: reason || 'Historical data could not be retrieved.',
    asset: extra.asset || '',
    symbol: extra.symbol || '',
    direction: extra.direction || '',
    timeframe: extra.timeframe || '',
    profile: extra.profile || null,
    currentSetup: null,
    matching: null,
    observations: [],
    sampleSize: 0,
    eligibleCandidates: 0,
    matchedCount: 0,
    independentMatchCount: 0,
    matchFrequencyPct: null,
    outcomeSummary: null,
    limitations: extra.limitations || [],
    missingInformation: extra.missingInformation || [],
    disclaimer: HISTORY_DISCLAIMER,
  };
}

/**
 * Run the historical stress test.
 * `opts.fetchImpl` is injectable so tests run against fixtures with no network.
 */
export async function runHistoricalStressTest(rawContext, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const context = rawContext || {};
  const asset = String(context.asset || '').trim().toUpperCase();
  const direction = normalizeDirection(context.direction);
  const timeframe = String(context.timeframe || '');
  const research = isObj(opts.research) ? opts.research : null;

  if (!asset) {
    return unavailableHistorical('No asset supplied, so no historical series could be requested.', {
      asset,
      direction,
      timeframe,
    });
  }

  const symbol = bitgetSymbol(asset);
  const { profile, assumed: timeframeAssumed } = profileFor(timeframe);

  let rawCandles;
  try {
    rawCandles = await fetchBitgetCandles(fetchImpl, symbol, {
      granularity: profile.granularity,
      limit: CANDLE_FETCH_LIMIT,
    });
  } catch (e) {
    return unavailableHistorical(
      `Historical candles could not be retrieved from Bitget for ${symbol}: ${e?.message || e}`,
      {
        asset,
        symbol,
        direction,
        timeframe,
        profile: describeProfile(profile, 0),
        missingInformation: [
          { id: 'missing-history', category: 'historical', title: 'Historical candles unavailable', detail: `The candle request for ${symbol} failed, so no historical setups could be examined.` },
        ],
        limitations: ['No historical sample was retrieved, so no comparison is shown rather than a fabricated one.'],
      }
    );
  }

  const rows = (Array.isArray(rawCandles) ? rawCandles : [])
    .map(toCandleRow)
    .filter((r) => r.close !== null && r.close !== undefined && r.ts !== null && r.ts !== undefined)
    .sort((a, b) => a.ts - b.ts);

  const profileDescription = describeProfile(profile, rows.length);

  const missingInformation = [];
  if (timeframeAssumed) {
    missingInformation.push({
      id: 'missing-timeframe',
      category: 'context',
      title: 'No timeframe specified',
      detail: `Historical sampling used the default profile (${profileDescription.granularityLabel} bars). Without a timeframe, the outcome horizon is assumed rather than matched to your holding period.`,
    });
  }

  // Not even one candidate window fits.
  const minimumBars = profile.windowBars + profile.horizonBars + 1;
  if (rows.length < minimumBars) {
    missingInformation.push({
      id: 'insufficient-history',
      category: 'historical',
      title: 'Insufficient historical bars',
      detail: `Only ${rows.length} usable ${profileDescription.granularityLabel} bars were returned; at least ${minimumBars} are needed for one setup window plus its outcome horizon.`,
    });
    return unavailableHistorical(
      `Not enough historical candles were returned for ${symbol} to compare anything: ${rows.length} bar${rows.length === 1 ? '' : 's'} available, ${minimumBars} required.`,
      {
        asset,
        symbol,
        direction,
        timeframe,
        profile: profileDescription,
        missingInformation,
        limitations: ['The historical series was too short, so no comparison is shown rather than a fabricated one.'],
      }
    );
  }

  const currentSetup = setupFeaturesAt(rows, rows.length - 1, profile.windowBars);
  if (!currentSetup) {
    return unavailableHistorical(`The current setup for ${symbol} could not be characterised from the returned candles.`, {
      asset,
      symbol,
      direction,
      timeframe,
      profile: profileDescription,
      missingInformation,
    });
  }

  const criteria = assessableCriteria(currentSetup);
  const minSpacingBars = profile.windowBars + profile.horizonBars;

  // Candidate setups must be complete, must have a complete outcome horizon, and
  // must NOT overlap the current setup window (no look-ahead).
  const lastEligibleIndex = rows.length - profile.windowBars - profile.horizonBars - 1;
  const firstEligibleIndex = profile.windowBars - 1;
  const eligibleCandidates = Math.max(0, lastEligibleIndex - firstEligibleIndex + 1);

  const matches = [];
  let lastAcceptedIndex = null;
  for (let i = lastEligibleIndex; i >= firstEligibleIndex; i--) {
    const candidate = setupFeaturesAt(rows, i, profile.windowBars);
    if (!candidate) continue;

    const matchedAll = criteria.every((c) => criterionValue(candidate, c.key) === c.currentValue);
    if (!matchedAll) continue;

    // Enforce spacing so overlapping windows are not counted as separate cases.
    if (lastAcceptedIndex !== null && lastAcceptedIndex - i < minSpacingBars) continue;

    const outcome = outcomeAt(rows, i, profile.horizonBars, direction);
    if (!outcome) continue;

    lastAcceptedIndex = i;
    matches.push({
      ...outcome,
      matchedCriteria: criteria.map((c) => c.key),
      setup: {
        trendPct: candidate.trendPct,
        trendDirection: candidate.trendDirection,
        volPct: candidate.volPct,
        volRegime: candidate.volRegime,
        moveBucket: candidate.moveBucket,
        extremeBucket: candidate.extremeBucket,
        distFromHighPct: candidate.distFromHighPct,
        distFromLowPct: candidate.distFromLowPct,
      },
    });
  }

  const observations = matches.slice(0, MAX_OBSERVATIONS).map((m, i) => ({
    id: `hist-${i + 1}`,
    ...m,
    ts: toIsoTs(m.ts),
    setupEndTs: toIsoTs(m.setupEndTs),
  }));

  const outcomeSummary = summarizeOutcomes(matches);
  const matchFrequencyPct = eligibleCandidates > 0 ? round2((matches.length / eligibleCandidates) * 100) : null;

  let status;
  if (matches.length === 0) status = HISTORY_STATUS.NO_MATCHES;
  else if (timeframeAssumed || rows.length < MIN_SAMPLE_BARS || matches.length < MIN_INDEPENDENT_MATCHES) {
    status = HISTORY_STATUS.PARTIAL;
  } else status = HISTORY_STATUS.OK;

  if (matches.length === 0) {
    missingInformation.push({
      id: 'no-matches',
      category: 'historical',
      title: 'No comparable setups found',
      detail: `Across ${eligibleCandidates} eligible historical window${eligibleCandidates === 1 ? '' : 's'}, none matched the current setup on every criterion (${criteria
        .map((c) => c.label.toLowerCase())
        .join(', ')}).`,
    });
  }
  if (rows.length < MIN_SAMPLE_BARS) {
    missingInformation.push({
      id: 'short-sample',
      category: 'historical',
      title: 'Short historical sample',
      detail: `Only ${rows.length} usable ${profileDescription.granularityLabel} bars were returned (fewer than the ${MIN_SAMPLE_BARS} treated as a meaningful sample).`,
    });
  }

  return {
    available: true,
    dataLimited: status === HISTORY_STATUS.PARTIAL || status === HISTORY_STATUS.NO_MATCHES,
    status,
    statusLabel: HISTORY_STATUS_LABELS[status],
    asset,
    symbol,
    direction,
    timeframe,
    timeframeAssumed,
    source: 'Bitget Spot API v2',
    marketSource: research?.market?.source || null,
    profile: profileDescription,
    sampleFrom: toIsoTs(rows[0].ts),
    sampleTo: toIsoTs(rows[rows.length - 1].ts),
    currentSetup: {
      asOf: toIsoTs(rows[rows.length - 1].ts),
      price: currentSetup.close,
      trendPct: currentSetup.trendPct,
      trendDirection: currentSetup.trendDirection,
      volPct: currentSetup.volPct,
      volRegime: currentSetup.volRegime,
      moveBucket: currentSetup.moveBucket,
      extremeBucket: currentSetup.extremeBucket,
      distFromHighPct: currentSetup.distFromHighPct,
      distFromLowPct: currentSetup.distFromLowPct,
      windowHigh: currentSetup.high,
      windowLow: currentSetup.low,
    },
    matching: {
      method: 'all-criteria-equal',
      criteria,
      minSpacingBars,
      excludesCurrentWindow: true,
      note: MATCH_METHOD_NOTE,
    },
    observations,
    sampleSize: rows.length,
    eligibleCandidates,
    matchedCount: matches.length,
    independentMatchCount: matches.length,
    matchFrequencyPct,
    matchFrequencyNote:
      'Share of eligible historical windows that matched. It describes how common this setup was in the sampled history — it is not a probability, a win rate, or an edge.',
    outcomeSummary,
    limitations: buildLimitations({
      profile: profileDescription,
      sampleBars: rows.length,
      timeframeAssumed,
      independentCount: matches.length,
    }),
    missingInformation,
    disclaimer: HISTORY_DISCLAIMER,
    generatedAt: new Date(Number.isFinite(opts.now) ? opts.now : Date.now()).toISOString(),
  };
}
