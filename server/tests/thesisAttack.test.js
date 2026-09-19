import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeThesis,
  interpretThesis,
  emptyAnalysis,
  INTERPRETATION_NOTE,
  COUNTERARGUMENT_BASIS,
} from '../services/thesisAttack.js';

// Fixed clock so event timing (past vs upcoming) is deterministic.
const NOW = Date.parse('2026-06-01T00:00:00Z');

const bull = (over = {}) => ({
  asset: 'rNVDA',
  direction: 'bullish',
  thesis: 'I think rNVDA will continue higher after earnings because the results beat expectations.',
  timeframe: 'earnings-event',
  ...over,
});

// --- market fixtures --------------------------------------------------------

const M_SUPPORT = {
  available: true,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 105,
  openUtc: 100,
  high24h: 110,
  low24h: 99,
  change24hPct: 1.5,
  trendPercent: 2,
  trendDirection: 'up',
  volatilityPct: 1,
};

const M_BULL_CONTRADICT = {
  available: true,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 95,
  openUtc: 100,
  high24h: 101,
  low24h: 94,
  change24hPct: -4,
  trendPercent: -5,
  trendDirection: 'down',
  volatilityPct: 3,
};

const M_BEAR_CONTRADICT = {
  available: true,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 105,
  openUtc: 100,
  high24h: 106,
  low24h: 99,
  change24hPct: 4,
  trendPercent: 5,
  trendDirection: 'up',
  volatilityPct: 1,
};

const M_MIXED = {
  available: true,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 100,
  openUtc: 101,
  high24h: 108,
  low24h: 98,
  change24hPct: -2,
  trendPercent: 1.2,
  trendDirection: 'up',
  volatilityPct: 1,
};

const EV_UPCOMING = {
  available: true,
  source: 'fmp',
  items: [{ title: 'Earnings', date: '2026-12-01', description: 'Q4 earnings' }],
};
const EV_PAST = {
  available: true,
  source: 'fmp',
  items: [{ title: 'Earnings', date: '2026-01-15', description: 'Q1 earnings' }],
};
const EV_UNAVAIL = { available: false, reason: 'No events provider configured.' };

// Market that IS retrievable but contains no signal that can be classified as
// supporting or contradicting evidence (flat price, flat trend, low volatility).
const M_NO_SIGNAL = {
  available: true,
  source: 'Bitget Spot API v2',
  symbol: 'RNVDAUSDT',
  price: 100,
  openUtc: 100,
  high24h: 103,
  low24h: 97,
  change24hPct: 0.1,
  trendPercent: 0.05,
  trendDirection: 'flat',
  volatilityPct: 0.5,
};

// The exact production scenario: neither market nor event data is retrievable.
const NO_DATA = {
  market: { available: false, reason: 'Bitget ticker unavailable: fetch failed' },
  events: { available: false, reason: 'Events provider request failed: HTTP 503' },
};

const ids = (list) => list.map((e) => e.id);

// --- 1. bullish thesis with genuine contradictory evidence -------------------

test('bullish thesis with genuine contradictory evidence', () => {
  const res = analyzeThesis(bull(), { market: M_BULL_CONTRADICT, events: EV_UNAVAIL }, { now: NOW });
  assert.equal(res.available, true);
  assert.ok(res.contradicting.length >= 1);
  assert.ok(ids(res.contradicting).includes('market-trend-contradict'));
  assert.ok(ids(res.contradicting).includes('market-move-contradict'));
  assert.equal(res.supporting.length, 0);
  assert.equal(res.evidenceStrength.label, 'weak');
  assert.equal(res.strongestCounterargument.basis, 'contradicting');
});

// --- 2. bearish thesis with genuine contradictory evidence -------------------

test('bearish thesis with genuine contradictory evidence', () => {
  const res = analyzeThesis(
    { asset: 'rNVDA', direction: 'bearish', thesis: 'Momentum is fading so the price should fall.', timeframe: 'swing' },
    { market: M_BEAR_CONTRADICT, events: EV_UNAVAIL },
    { now: NOW }
  );
  assert.ok(res.contradicting.length >= 1);
  assert.ok(ids(res.contradicting).includes('market-trend-contradict'));
  assert.ok(ids(res.contradicting).includes('market-move-contradict'));
  assert.equal(res.evidenceStrength.label, 'weak');
});

// --- 3. thesis where evidence mostly supports --------------------------------

test('thesis where evidence mostly supports the thesis (no manufactured contradiction)', () => {
  const res = analyzeThesis(
    { asset: 'rNVDA', direction: 'bullish', thesis: 'Momentum should carry rNVDA higher.', timeframe: 'swing' },
    { market: M_SUPPORT, events: EV_UNAVAIL },
    { now: NOW }
  );
  assert.equal(res.contradicting.length, 0);
  assert.ok(res.supporting.length >= 1);
  assert.equal(res.evidenceStrength.label, 'supported');
  assert.equal(res.strongestCounterargument.basis, 'none');
  assert.match(res.strongestCounterargument.title, /limited/i);
  assert.match(res.summary, /supports your bullish thesis/i);
});

// --- 4. missing market data --------------------------------------------------

test('missing market data is reported as missing information', () => {
  const res = analyzeThesis(bull(), { market: { available: false, reason: 'provider down' }, events: EV_UPCOMING }, { now: NOW });
  assert.ok(ids(res.missingInformation).includes('missing-market'));
  assert.equal(res.dataLimited, false); // events still usable
  assert.equal(res.supporting.length, 0);
  assert.equal(res.contradicting.length, 0);
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');
});

// --- 5. missing event data ---------------------------------------------------

test('missing event data is reported and the thesis catalyst is flagged as unverifiable', () => {
  const res = analyzeThesis(bull(), { market: M_SUPPORT, events: { available: false, reason: 'no provider' } }, { now: NOW });
  assert.ok(ids(res.missingInformation).includes('missing-events'));
  assert.ok(res.supporting.length >= 1); // market evidence still works
  assert.ok(res.invalidationConditions.some((c) => /cannot be verified/i.test(c.title)));
});

// --- 6. provider / engine failure -------------------------------------------

test('provider failure degrades to an honest, data-limited analysis (never fabricated)', () => {
  const res = analyzeThesis(
    bull(),
    {
      market: { available: false, reason: 'Bitget ticker unavailable: fetch failed' },
      events: { available: false, reason: 'Events provider request failed: HTTP 503' },
    },
    { now: NOW }
  );
  assert.equal(res.available, true); // the analysis itself still runs, honestly
  assert.equal(res.dataLimited, true);
  assert.equal(res.supporting.length, 0);
  assert.equal(res.contradicting.length, 0);
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');
  assert.ok(res.missingInformation.length >= 2);
  assert.match(res.summary, /could not retrieve/i);
});

test('a hard analysis failure is represented by emptyAnalysis (available:false)', () => {
  const res = emptyAnalysis('Thesis analysis failed: boom');
  assert.equal(res.available, false);
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');
  assert.match(res.reason, /boom/);
});

// --- 7. malformed analysis / research response ------------------------------

test('malformed research input does not throw and yields missing-information states', () => {
  const res = analyzeThesis(bull(), { market: 'garbage', events: 42 }, { now: NOW });
  assert.equal(res.available, true);
  assert.ok(ids(res.missingInformation).includes('missing-market'));
  assert.ok(ids(res.missingInformation).includes('missing-events'));
  assert.equal(res.supporting.length, 0);

  // Empty objects (no usable fields) are also treated as missing, not "usable".
  const res2 = analyzeThesis(bull(), { market: {}, events: {} }, { now: NOW });
  assert.ok(ids(res2.missingInformation).includes('missing-market'));
  assert.ok(ids(res2.missingInformation).includes('missing-events'));
  assert.equal(res2.dataLimited, true);
});

test('null / undefined research does not throw', () => {
  const res = analyzeThesis(bull(), null, { now: NOW });
  assert.equal(res.available, true);
  assert.equal(res.dataLimited, true);
  assert.equal(res.supporting.length, 0);
});

// --- 8. no fabricated evidence when data is unavailable ---------------------

test('no fabricated evidence when all data is unavailable', () => {
  // Non-catalyst thesis so the generic "insufficient data" invalidation fallback applies.
  const res = analyzeThesis(
    bull({ thesis: 'The stock looks strong to me.' }),
    { market: { available: false, reason: 'x' }, events: { available: false, reason: 'y' } },
    { now: NOW }
  );
  assert.equal(res.supporting.length, 0);
  assert.equal(res.contradicting.length, 0);
  assert.equal(res.uncertainty.length, 0);
  assert.equal(res.dataLimited, true);
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');
  assert.ok(res.invalidationConditions.some((c) => /Insufficient data/i.test(c.title)));
  // No market source or price should be asserted anywhere.
  assert.ok(!JSON.stringify(res).includes('Bitget'));
});

test('a catalyst thesis with no event data yields an honest "cannot be verified" condition', () => {
  const res = analyzeThesis(
    bull(),
    { market: { available: false, reason: 'x' }, events: { available: false, reason: 'y' } },
    { now: NOW }
  );
  assert.ok(res.invalidationConditions.some((c) => /cannot be verified/i.test(c.title)));
});

// --- 8b. the strongest counterargument must MATCH the evidence state --------

test('data-limited: the strongest counterargument reflects ZERO evidence, never support', () => {
  const res = analyzeThesis(bull(), NO_DATA, { now: NOW });

  assert.equal(res.dataLimited, true);
  assert.equal(res.supporting.length, 0);
  assert.equal(res.contradicting.length, 0);

  const c = res.strongestCounterargument;
  assert.equal(c.basis, COUNTERARGUMENT_BASIS.INSUFFICIENT_EVIDENCE);
  // It must say the thesis is unconfirmed / cannot be validated.
  assert.match(c.title, /cannot currently be validated|unconfirmed/i);
  assert.match(c.detail, /unconfirmed/i);
  // It must frame the situation as an ABSENCE of evidence, both ways.
  assert.match(c.detail, /absence of evidence/i);
  assert.match(c.detail, /not evidence against the trade/i);
  // It must NOT imply the thesis is supported.
  assert.doesNotMatch(c.detail, /supports the core thesis/i);
  assert.doesNotMatch(c.detail, /currently supports/i);
  assert.doesNotMatch(c.detail, /evidence (currently )?supports/i);
  assert.doesNotMatch(c.title, /limited/i);
  // No provider may be credited for a statement no provider backed.
  assert.equal(c.source, null);
  // The missing inputs are named so the reader knows what to supply.
  assert.match(c.detail, /What is missing/i);
});

test('data-limited: no bearish evidence is manufactured to fill the gap', () => {
  const res = analyzeThesis(bull(), NO_DATA, { now: NOW });
  assert.equal(res.contradicting.length, 0);
  assert.equal(res.uncertainty.length, 0);
  assert.equal(res.keyRisks.length, 0);
  assert.equal(res.strongestCounterargument.source, null);
  assert.ok(!JSON.stringify(res.strongestCounterargument).includes('Bitget'));
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');
});

test('usable data with no classifiable signal yields "unconfirmed", not "supported"', () => {
  const res = analyzeThesis(bull({ timeframe: 'swing' }), { market: M_NO_SIGNAL, events: EV_UNAVAIL }, { now: NOW });

  assert.equal(res.dataLimited, false); // market data WAS retrievable
  assert.equal(res.supporting.length, 0);
  assert.equal(res.contradicting.length, 0);
  assert.equal(res.evidenceStrength.label, 'insufficient evidence');

  const c = res.strongestCounterargument;
  assert.equal(c.basis, COUNTERARGUMENT_BASIS.INSUFFICIENT_EVIDENCE);
  assert.match(c.title, /unconfirmed/i);
  assert.doesNotMatch(c.detail, /supports the core thesis/i);
  assert.doesNotMatch(c.title, /limited/i);
});

test('"contradicting evidence is limited" is only used when supporting evidence exists', () => {
  // Only the supported case (supporting > 0, contradicting = 0, no uncertainty)
  // may use the "limited" wording.
  const supported = analyzeThesis(
    { asset: 'rNVDA', direction: 'bullish', thesis: 'Momentum should carry rNVDA higher.', timeframe: 'swing' },
    { market: M_SUPPORT, events: EV_UNAVAIL },
    { now: NOW }
  );
  assert.ok(supported.supporting.length >= 1);
  assert.equal(supported.strongestCounterargument.basis, COUNTERARGUMENT_BASIS.NONE);
  assert.match(supported.strongestCounterargument.title, /limited/i);
  // Even then it must not present consistency as confirmation.
  assert.match(supported.strongestCounterargument.detail, /not confirmation/i);
});

test('the interpretation block is labelled as an interpretation, not market evidence', () => {
  const res = analyzeThesis(bull(), NO_DATA, { now: NOW });
  assert.equal(res.interpretationNote, INTERPRETATION_NOTE);
  assert.match(res.interpretationNote, /reading of the reasoning you stated/i);
  assert.match(res.interpretationNote, /not verified market or event evidence/i);
  // The interpretation itself stays attributed to the trader's own words.
  assert.match(res.interpretation, /You expect/i);
  assert.equal(emptyAnalysis('nope').interpretationNote, null);
});

// --- 9. correct separation of supporting vs contradicting -------------------

test('supporting and contradicting evidence are correctly separated', () => {
  const res = analyzeThesis(
    { asset: 'rNVDA', direction: 'bullish', thesis: 'Momentum continues.', timeframe: 'swing' },
    { market: M_MIXED, events: EV_UNAVAIL },
    { now: NOW }
  );
  assert.ok(ids(res.supporting).includes('market-trend-support'));
  assert.ok(ids(res.contradicting).includes('market-move-contradict'));
  // The trend signal must NOT appear as contradicting, nor the move as supporting.
  assert.equal(ids(res.contradicting).includes('market-trend-support'), false);
  assert.equal(ids(res.supporting).includes('market-move-contradict'), false);
  assert.equal(res.evidenceStrength.label, 'mixed');
});

// --- 10. invalidation conditions --------------------------------------------

test('invalidation conditions reference real levels and the relevant direction', () => {
  const b = analyzeThesis(bull({ timeframe: 'swing' }), { market: M_SUPPORT, events: EV_UNAVAIL }, { now: NOW });
  assert.ok(b.invalidationConditions.some((c) => /24h low/.test(c.title)));
  assert.ok(b.invalidationConditions.some((c) => /99/.test(c.title))); // references the actual low

  const s = analyzeThesis(
    { asset: 'rNVDA', direction: 'bearish', thesis: 'Falling.', timeframe: 'swing' },
    { market: M_BEAR_CONTRADICT, events: EV_UNAVAIL },
    { now: NOW }
  );
  assert.ok(s.invalidationConditions.some((c) => /24h high/.test(c.title)));
  assert.ok(s.invalidationConditions.some((c) => /106/.test(c.title))); // references the actual high

  const withEvent = analyzeThesis(bull(), { market: M_SUPPORT, events: EV_UPCOMING }, { now: NOW });
  assert.ok(withEvent.invalidationConditions.some((c) => /fails to confirm/i.test(c.title)));
});

// --- supporting behaviour: events, interpretation, safety -------------------

test('upcoming vs past events are classified as event risk vs possible priced-in catalyst', () => {
  const upcoming = analyzeThesis(bull(), { market: M_SUPPORT, events: EV_UPCOMING }, { now: NOW });
  assert.ok(ids(upcoming.uncertainty).includes('event-upcoming'));

  const past = analyzeThesis(bull(), { market: M_SUPPORT, events: EV_PAST }, { now: NOW });
  assert.ok(ids(past.uncertainty).includes('event-past'));
});

test('interpretThesis extracts themes and assumptions from the thesis text', () => {
  const interp = interpretThesis(bull());
  assert.equal(interp.direction, 'bullish');
  assert.ok(interp.themes.includes('earnings'));
  assert.ok(interp.themes.includes('beat'));
  assert.ok(interp.assumptions.length >= 1);
  assert.match(interp.interpretation, /rise/i);
});

test('the analysis never emits a trade instruction or an arbitrary score', () => {
  const res = analyzeThesis(bull(), { market: M_SUPPORT, events: EV_UPCOMING }, { now: NOW });
  assert.equal(res.action, undefined);
  assert.equal(res.instruction, undefined);
  assert.equal(res.recommendation, undefined);
  assert.equal(res.score, undefined);
  // Evidence strength is a labelled, evidence-derived status — not a number.
  assert.equal(typeof res.evidenceStrength.label, 'string');
  assert.ok(['supported', 'mixed', 'weak', 'insufficient evidence'].includes(res.evidenceStrength.label));
  assert.ok(typeof res.evidenceStrength.basis === 'string' && res.evidenceStrength.basis.length > 0);
});
