import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runHistoricalStressTest,
  unavailableHistorical,
  HISTORY_STATUS,
  HISTORY_STATUS_LABELS,
  HISTORY_THRESHOLDS,
  TIMEFRAME_PROFILES,
  MATCH_CRITERIA,
  MIN_SAMPLE_BARS,
  moveBucketOf,
  volRegimeOf,
  extremeBucketOf,
  trendDirectionOf,
} from '../services/historicalStressTest.js';
import { getMarketContext, toCandleRow } from '../services/marketData.js';

// --- fixtures ---------------------------------------------------------------

const START_TS = 1700000000000;

/** Bitget v2 candle shape: [ts, open, high, low, close, baseVol, quoteVol]. */
function candlesFromCloses(closes, stepMs = 3600000) {
  return {
    data: closes.map((c, i) => [
      String(START_TS + i * stepMs),
      String(c),
      String(c * 1.001),
      String(c * 0.999),
      String(c),
      String(c * 100),
      String(c * 1000),
    ]),
  };
}

/** Deterministic geometric series: every window buckets identically. */
function geometricSeries(n, base = 100, step = 0.003) {
  const out = [];
  let p = base;
  for (let i = 0; i < n; i++) {
    out.push(Number(p.toFixed(6)));
    p *= 1 + step;
  }
  return out;
}

/** Flat for a long stretch, then a sustained rise only in the most recent bars. */
function flatThenRise(n = 140, flatUntil = 120) {
  const closes = [];
  for (let i = 0; i < n; i++) {
    closes.push(i < flatUntil ? 100 : Number((100 * 1.003 ** (i - flatUntil + 1)).toFixed(6)));
  }
  return closes;
}

function makeFetch({ candles, candleError }) {
  return async (url) => {
    if (candleError && url.includes('/candles')) throw new Error(candleError);
    return { ok: true, status: 200, json: async () => (url.includes('/candles') ? candles : {}) };
  };
}

const bull = (over = {}) => ({
  asset: 'rNVDA',
  direction: 'bullish',
  thesis: 'Momentum should carry rNVDA higher.',
  timeframe: 'swing',
  ...over,
});

const RISING_1000 = candlesFromCloses(geometricSeries(1000));

// --- 1. historical data successfully retrieved ------------------------------

test('1. retrieves historical data and characterises the current setup', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });

  assert.equal(res.available, true);
  assert.equal(res.dataLimited, false);
  assert.equal(res.status, HISTORY_STATUS.OK);
  assert.equal(res.statusLabel, HISTORY_STATUS_LABELS.ok);
  assert.equal(res.source, 'Bitget Spot API v2');
  assert.equal(res.symbol, 'RNVDAUSDT');
  assert.equal(res.sampleSize, 1000);
  assert.ok(res.sampleFrom && res.sampleTo, 'the sampled window is reported');

  // The current setup is derived from the same series, never invented.
  assert.equal(res.currentSetup.trendDirection, 'up');
  assert.equal(res.currentSetup.moveBucket, 'extended');
  assert.equal(res.currentSetup.volRegime, 'low');
  assert.ok(res.currentSetup.price > 0);

  // Profile is explicit and auditable.
  assert.equal(res.profile.key, 'swing');
  assert.equal(res.profile.windowBars, TIMEFRAME_PROFILES.swing.windowBars);
  assert.equal(res.profile.horizonBars, TIMEFRAME_PROFILES.swing.horizonBars);
  assert.equal(res.timeframeAssumed, false);
});

// --- 2. matching historical setups found ------------------------------------

test('2. finds matching historical setups in a repeated regime', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });

  assert.ok(res.matchedCount >= 2, `expected matches, got ${res.matchedCount}`);
  assert.ok(res.eligibleCandidates > res.matchedCount, 'candidates were scanned, not just the first match');
  assert.equal(res.independentMatchCount, res.matchedCount);
  assert.ok(res.observations.length >= 1);
  assert.ok(res.outcomeSummary && res.outcomeSummary.count === res.matchedCount);

  // Every observation carries a real, derived outcome — no placeholders.
  for (const o of res.observations) {
    assert.ok(o.entryPrice > 0 && o.exitPrice > 0);
    assert.equal(typeof o.movePct, 'number');
    assert.equal(typeof o.aligned, 'boolean');
    assert.ok(Number.isFinite(Date.parse(o.ts)));
    assert.deepEqual(o.matchedCriteria, res.matching.criteria.map((c) => c.key));
  }

  // Matching is transparent: method + criteria + spacing are all published.
  assert.equal(res.matching.method, 'all-criteria-equal');
  assert.equal(res.matching.criteria.length, MATCH_CRITERIA.length);
  assert.equal(
    res.matching.minSpacingBars,
    res.profile.windowBars + res.profile.horizonBars,
    'matches are spaced so windows do not overlap'
  );
  assert.equal(res.matching.excludesCurrentWindow, true);
  assert.match(res.matching.note, /not a probability and not a statistical edge/i);
  assert.match(res.matchFrequencyNote, /not a probability, a win rate, or an edge/i);
});

// --- 3. no historical matches found ----------------------------------------

test('3. reports no matches honestly when the current setup is unique', async () => {
  const res = await runHistoricalStressTest(bull({ timeframe: 'swing' }), {
    fetchImpl: makeFetch({ candles: candlesFromCloses(flatThenRise()) }),
  });

  assert.equal(res.available, true);
  assert.equal(res.matchedCount, 0);
  assert.equal(res.status, HISTORY_STATUS.NO_MATCHES);
  assert.equal(res.statusLabel, HISTORY_STATUS_LABELS['no-matches']);
  assert.equal(res.dataLimited, true);
  assert.deepEqual(res.observations, []);
  assert.equal(res.outcomeSummary, null);
  // It genuinely looked: candidates existed and none matched.
  assert.ok(res.eligibleCandidates > 0, 'eligible candidates were scanned');
  // The mismatch is explained, not just asserted.
  assert.ok(res.missingInformation.some((m) => m.id === 'no-matches'));
  assert.match(
    res.missingInformation.find((m) => m.id === 'no-matches').detail,
    /none matched the current setup/i
  );
  // The current setup really is the rising one; history really is flat.
  assert.equal(res.currentSetup.trendDirection, 'up');
});

// --- 4. historical data unavailable ---------------------------------------

test('4. reports HISTORICAL DATA UNAVAILABLE when the provider fails', async () => {
  const res = await runHistoricalStressTest(bull(), {
    fetchImpl: makeFetch({ candleError: 'Bitget HTTP 503' }),
  });

  assert.equal(res.available, false);
  assert.equal(res.dataLimited, true);
  assert.equal(res.status, HISTORY_STATUS.UNAVAILABLE);
  assert.equal(res.statusLabel, 'HISTORICAL DATA UNAVAILABLE');
  assert.match(res.reason, /could not be retrieved/i);
  assert.match(res.reason, /Bitget HTTP 503/);
  assert.equal(res.observations.length, 0);
  assert.equal(res.matchedCount, 0);
  assert.equal(res.outcomeSummary, null);
  assert.equal(res.matchFrequencyPct, null);
  assert.equal(res.currentSetup, null);
  assert.ok(res.missingInformation.some((m) => m.id === 'missing-history'));
});

test('4b. an empty or malformed provider response is unavailable, not fabricated', async () => {
  const empty = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: { data: [] } }) });
  assert.equal(empty.status, HISTORY_STATUS.UNAVAILABLE);
  assert.equal(empty.observations.length, 0);
  assert.match(empty.reason, /Not enough historical candles/i);

  const junk = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: { data: 'nonsense' } }) });
  assert.equal(junk.status, HISTORY_STATUS.UNAVAILABLE);
  assert.equal(junk.observations.length, 0);
  assert.equal(junk.outcomeSummary, null);

  // A too-short series (one setup window but no room for an outcome horizon).
  const tooShort = await runHistoricalStressTest(bull(), {
    fetchImpl: makeFetch({ candles: candlesFromCloses(geometricSeries(12)) }),
  });
  assert.equal(tooShort.status, HISTORY_STATUS.UNAVAILABLE);
  assert.ok(tooShort.missingInformation.some((m) => m.id === 'insufficient-history'));
});

test('4c. a missing asset never invents a series', async () => {
  const res = await runHistoricalStressTest({ asset: '', direction: 'bullish' }, { fetchImpl: makeFetch({ candles: RISING_1000 }) });
  assert.equal(res.available, false);
  assert.equal(res.status, HISTORY_STATUS.UNAVAILABLE);
  assert.equal(res.observations.length, 0);
});

// --- 5. partial historical data -------------------------------------------

test('5. a short but usable sample is labelled partial, not complete', async () => {
  const res = await runHistoricalStressTest(bull(), {
    fetchImpl: makeFetch({ candles: candlesFromCloses(geometricSeries(40)) }),
  });

  assert.equal(res.available, true);
  assert.equal(res.sampleSize, 40);
  assert.ok(res.sampleSize < MIN_SAMPLE_BARS);
  assert.ok(res.matchedCount >= 1, 'a short series can still yield a match');
  assert.equal(res.status, HISTORY_STATUS.PARTIAL);
  assert.equal(res.statusLabel, HISTORY_STATUS_LABELS.partial);
  assert.equal(res.dataLimited, true);
  assert.ok(res.missingInformation.some((m) => m.id === 'short-sample'));
});

test('5b. partial data never claims more confidence than it has', async () => {
  const res = await runHistoricalStressTest(bull(), {
    fetchImpl: makeFetch({ candles: candlesFromCloses(geometricSeries(40)) }),
  });
  // Few non-overlapping matches must be called out as unreadable as a pattern.
  assert.ok(res.limitations.some((l) => /too few to read as a pattern/i.test(l)));
});

// --- 6. missing timeframe -------------------------------------------------

test('6. a missing timeframe is disclosed and downgrades the result to partial', async () => {
  const res = await runHistoricalStressTest(bull({ timeframe: '' }), {
    fetchImpl: makeFetch({ candles: RISING_1000 }),
  });

  assert.equal(res.timeframeAssumed, true);
  assert.equal(res.profile.key, 'swing'); // documented default, stated explicitly
  assert.equal(res.status, HISTORY_STATUS.PARTIAL);
  assert.equal(res.dataLimited, true);
  assert.ok(res.missingInformation.some((m) => m.id === 'missing-timeframe'));
  assert.ok(res.limitations.some((l) => /No timeframe was supplied/i.test(l)));
  // It still reports real observations — the data was available, the horizon was assumed.
  assert.ok(res.matchedCount >= 1);
});

test('6b. a supplied timeframe selects its own profile and is not marked assumed', async () => {
  const res = await runHistoricalStressTest(bull({ timeframe: 'intraday' }), {
    fetchImpl: makeFetch({ candles: RISING_1000 }),
  });
  assert.equal(res.timeframeAssumed, false);
  assert.equal(res.profile.key, 'intraday');
  assert.equal(res.profile.granularity, TIMEFRAME_PROFILES.intraday.granularity);
  assert.equal(res.profile.granularityLabel, '15m');
});

// --- 7 / 8. bullish vs bearish interpretation ------------------------------

test('7. a bullish thesis counts rising historical outcomes as aligned', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });

  const s = res.outcomeSummary;
  assert.ok(s.count >= 2);
  assert.equal(s.alignedCount, s.count);
  assert.equal(s.againstCount, 0);
  assert.equal(s.flatCount, 0);
  assert.ok(s.medianMovePct > 0, 'median move is positive in a rising sample');
  assert.ok(s.bestMovePct >= s.medianMovePct && s.medianMovePct >= s.worstMovePct);
  // Excursions are thesis-relative and signed consistently.
  assert.ok(s.medianFavourableExcursionPct >= 0);
  assert.ok(s.medianAdverseExcursionPct <= 0);
});

test('8. the same series read as a bearish thesis flips the interpretation', async () => {
  const bullRes = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });
  const bearRes = await runHistoricalStressTest(bull({ direction: 'bearish' }), {
    fetchImpl: makeFetch({ candles: RISING_1000 }),
  });

  // The SETUP match is direction-agnostic (it describes the market, not the thesis)...
  assert.equal(bearRes.matchedCount, bullRes.matchedCount);
  assert.deepEqual(
    bearRes.observations.map((o) => o.movePct),
    bullRes.observations.map((o) => o.movePct)
  );
  // ...but the outcome interpretation is direction-aware.
  const s = bearRes.outcomeSummary;
  assert.equal(s.alignedCount, 0);
  assert.equal(s.againstCount, s.count);
  assert.ok(s.medianMovePct > 0, 'raw price moves are reported as price moves, not flipped');
  // Thesis-relative excursions flip with the direction.
  assert.ok(s.medianFavourableExcursionPct >= 0);
  assert.ok(s.medianAdverseExcursionPct <= 0);
});

// --- 9. outcomes are separated from predictions ----------------------------

test('9. historical outcomes are never presented as predictions', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });
  const text = JSON.stringify(res);

  // The honest framing must be present...
  assert.match(res.disclaimer, /not a prediction/i);
  assert.match(res.disclaimer, /do(es)? not guarantee that history repeats/i);
  assert.match(res.disclaimer, /decision remains yours/i);
  assert.ok(res.limitations.length >= 4);
  assert.ok(res.limitations.some((l) => /description of the past, not a forecast/i.test(l)));
  assert.match(res.matching.note, /not that the outcome will repeat/i);

  // ...and no affirmative prediction about THIS trade may appear anywhere.
  // (Blunt substring scans would false-positive on the caveats themselves, so
  // these patterns are specific to a positive claim.)
  assert.doesNotMatch(text, /likely to (rise|fall|go up|go down|continue)/i);
  assert.doesNotMatch(text, /probability of/i);
  assert.doesNotMatch(text, /will (rise|fall|go up|go down)/i);
  assert.doesNotMatch(text, /we (expect|predict)/i);
  assert.doesNotMatch(text, /expected (move|return|outcome|gain)/i);
  assert.doesNotMatch(text, /guaranteed to/i);

  // The outcome summary is a fixed whitelist of descriptive measurements —
  // adding a probability/score field would fail here.
  assert.deepEqual(
    Object.keys(res.outcomeSummary).sort(),
    [
      'againstCount',
      'alignedCount',
      'bestMovePct',
      'count',
      'flatCount',
      'medianAdverseExcursionPct',
      'medianFavourableExcursionPct',
      'medianMovePct',
      'worstMovePct',
    ].sort()
  );

  // No predictive or scoring FIELD exists anywhere in the payload.
  for (const banned of ['probability', 'confidence', 'forecast', 'prediction', 'winRate', 'edge', 'expectedMove', 'score', 'verdict']) {
    assert.equal(new RegExp(`"${banned}"`).test(text), false, `payload must not expose a "${banned}" field`);
  }

  // Each observation is a measurement, not an opinion.
  assert.deepEqual(
    Object.keys(res.observations[0]).sort(),
    [
      'adverseExcursionPct',
      'aligned',
      'entryPrice',
      'exitPrice',
      'favourableExcursionPct',
      'flat',
      'id',
      'index',
      'matchedCriteria',
      'movePct',
      'setup',
      'setupEndTs',
      'ts',
    ].sort()
  );
});

// --- 10. no fabricated historical observations -----------------------------

test('10. no fabricated observations when history is unavailable', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candleError: 'fetch failed' }) });

  assert.deepEqual(res.observations, []);
  assert.equal(res.sampleSize, 0);
  assert.equal(res.eligibleCandidates, 0);
  assert.equal(res.matchedCount, 0);
  assert.equal(res.outcomeSummary, null);
  assert.equal(res.matchFrequencyPct, null);
  assert.equal(res.currentSetup, null);
  // No price or metric may be asserted anywhere in an unavailable payload.
  assert.equal(res.currentSetup, null);
  assert.equal(res.profile.windowBars > 0, true); // profile is descriptive only
  assert.equal(JSON.stringify(res.observations), '[]');
});

test('10b. unavailableHistorical() is the single honest shape for failures', () => {
  const res = unavailableHistorical('boom');
  assert.equal(res.available, false);
  assert.equal(res.statusLabel, 'HISTORICAL DATA UNAVAILABLE');
  assert.equal(res.reason, 'boom');
  assert.deepEqual(res.observations, []);
  assert.equal(res.outcomeSummary, null);
  assert.match(res.disclaimer, /not a prediction/i);
});

// --- 11. no BUY / SELL / PASS ----------------------------------------------

test('11. the analysis never emits a trade instruction or a score', async () => {
  const res = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });
  const text = JSON.stringify(res);

  assert.equal(res.action, undefined);
  assert.equal(res.instruction, undefined);
  assert.equal(res.recommendation, undefined);
  assert.equal(res.signal, undefined);
  assert.equal(res.score, undefined);
  assert.equal(res.verdict, undefined);
  assert.doesNotMatch(text, /\b(BUY|SELL|PASS|HOLD)\b/);
  assert.doesNotMatch(text, /recommend/i);
});

// --- 12. Phase 1–4 regression safety ---------------------------------------

test('12. the shared candle contract used by Phase 3 still behaves', async () => {
  // Phase 5 now imports toCandleRow from the Phase 3 service. Verify both the
  // exported parser and getMarketContext are unaffected.
  const v2 = toCandleRow(['1700000000000', '1', '2', '0.5', '1.5', '10', '15']);
  assert.deepEqual(
    { ts: v2.ts, open: v2.open, high: v2.high, low: v2.low, close: v2.close },
    { ts: 1700000000000, open: 1, high: 2, low: 0.5, close: 1.5 }
  );
  const v1 = toCandleRow({ ts: 1700000000000, open: 1, high: 2, low: 0.5, close: 1.5 });
  assert.equal(v1.close, 1.5);

  const closes = [];
  for (let i = 0; i < 30; i++) closes.push(9.8 + i * 0.05);
  const market = await getMarketContext(
    async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/tickers')
          ? { data: [{ symbol: 'RNVDAUSDT', lastPr: '10.25', openUtc: '9.8', high24h: '10.5', low24h: '9.6', ts: '1700000000000' }] }
          : candlesFromCloses(closes),
    }),
    'rNVDA'
  );
  assert.equal(market.available, true);
  assert.equal(market.price, 10.25);
  assert.equal(market.trendDirection, 'up');
  assert.equal(market.symbol, 'RNVDAUSDT');
});

test('12b. historical matching reuses the Phase 4 bucket thresholds', () => {
  // If these ever drift apart, the two engines would disagree about the market.
  assert.equal(HISTORY_THRESHOLDS.flatBandPct, 0.5);
  assert.equal(HISTORY_THRESHOLDS.extendedMovePct, 3);
  assert.equal(HISTORY_THRESHOLDS.elevatedVolPct, 2);
  assert.equal(HISTORY_THRESHOLDS.nearExtremePct, 1);

  assert.equal(trendDirectionOf(1), 'up');
  assert.equal(trendDirectionOf(-1), 'down');
  assert.equal(trendDirectionOf(0.2), 'flat');
  assert.equal(moveBucketOf(0.2), 'flat');
  assert.equal(moveBucketOf(2), 'modest');
  assert.equal(moveBucketOf(5), 'extended');
  assert.equal(volRegimeOf(0.5), 'low');
  assert.equal(volRegimeOf(1.5), 'normal');
  assert.equal(volRegimeOf(3), 'elevated');
  assert.equal(volRegimeOf(null), 'unknown');
  assert.equal(extremeBucketOf(0.4, 8), 'near-high');
  assert.equal(extremeBucketOf(8, 0.4), 'near-low');
  assert.equal(extremeBucketOf(5, 5), 'mid');
});

test('12c. research context is echoed for traceability but never fabricated', async () => {
  const res = await runHistoricalStressTest(bull(), {
    fetchImpl: makeFetch({ candles: RISING_1000 }),
    research: { market: { available: true, source: 'Bitget Spot API v2' }, events: { available: false, reason: 'none' } },
  });
  assert.equal(res.marketSource, 'Bitget Spot API v2');

  const noResearch = await runHistoricalStressTest(bull(), { fetchImpl: makeFetch({ candles: RISING_1000 }) });
  assert.equal(noResearch.marketSource, null);
});
