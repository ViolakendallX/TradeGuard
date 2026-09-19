/**
 * Thesis attack / Devil's Advocate service (Phase 4).
 *
 * Purpose: actively look for what could make the trader's thesis WRONG — not to
 * predict whether the trade wins or loses.
 *
 * Design decisions (deliberate, documented):
 *   - This is a DETERMINISTIC analysis over the REAL Phase 3 research data. It
 *     does NOT call an external LLM. TradeGuard's principles are "evidence before
 *     opinion" and "no fake certainty", and the Phase 4 brief explicitly requires
 *     unit tests that do not depend on a live AI provider. Every statement here
 *     is derived from an observable input (market price/trend/volatility, events,
 *     or the trader's own context). Nothing is invented.
 *   - It never emits BUY / SELL / PASS and never predicts an outcome. The human
 *     remains responsible for the decision.
 *   - It does NOT force a 50/50 presentation. If the data does not meaningfully
 *     contradict the thesis, it says so ("contradicting evidence is limited").
 *   - When data is unavailable, it is reported as MISSING INFORMATION and the
 *     evidence-strength label degrades to "insufficient evidence" — never faked.
 *   - The strongest counterargument must MATCH the evidence state. With ZERO
 *     usable evidence it may not imply the thesis is supported; it must state
 *     that the thesis is unconfirmed/unvalidated. Absence of evidence is never
 *     presented as evidence for the trade, and bearish evidence is never
 *     manufactured to fill the gap (see buildStrongestCounterargument).
 *   - "How TradeGuard read your thesis" is an interpretation of the trader's own
 *     stated reasoning (see INTERPRETATION_NOTE) and is explicitly labelled as
 *     such so it can never be read as verified market/event evidence.
 *   - The module is a clean seam: an LLM provider could be layered on later to
 *     "explain" the numbers, but the numbers/classification stay deterministic.
 *
 * Inputs:
 *   context  — { asset, direction, thesis, timeframe, entryPrice, riskAmount,
 *                confidence, existingPosition }
 *   research — the Phase 3 response: { market, events, ... }
 *
 * Output: a structured, frontend-safe analysis object (see analyzeThesis).
 */

export const DIRECTION = Object.freeze({ BULLISH: 'bullish', BEARISH: 'bearish', NEUTRAL: 'neutral' });

/**
 * Documented, transparent thresholds. These are stated rules, NOT model scores —
 * they exist so the classification is explainable and reproducible.
 */
export const THRESHOLDS = Object.freeze({
  flatBandPct: 0.5, // |move| <= 0.5% is treated as flat / neutral
  extendedMovePct: 3, // a 24h move this large in the thesis direction may already be priced in
  elevatedVolPct: 2, // realized hourly volatility >= 2% is treated as elevated
  nearExtremePct: 1, // price within 1% of the 24h high/low is treated as extended
});

/**
 * Where the strongest counterargument came from. Exposed on the analysis so the
 * UI (and tests) can tell a real, evidence-backed challenge apart from the
 * honest "there is nothing to challenge it with yet" states.
 *   - 'contradicting'          — a classified contradicting market/event signal
 *   - 'risk'                   — no contradiction, but a concrete risk applies
 *   - 'insufficient-evidence'  — NO usable evidence either way (data-limited, or
 *                                data retrieved but nothing classified): the
 *                                honest challenge is that the thesis is unconfirmed
 *   - 'none'                   — supporting evidence exists and nothing
 *                                contradicts it ("contradicting evidence is limited")
 */
export const COUNTERARGUMENT_BASIS = Object.freeze({
  CONTRADICTING: 'contradicting',
  RISK: 'risk',
  INSUFFICIENT_EVIDENCE: 'insufficient-evidence',
  NONE: 'none',
});

/**
 * Shown with "How TradeGuard read your thesis". That section restates the
 * trader's own argument — it is NOT verified market/event evidence and must
 * never be presented as such.
 */
export const INTERPRETATION_NOTE =
  "This is TradeGuard's reading of the reasoning you stated in your own thesis — an interpretation of your argument, not verified market or event evidence, and not a statement about what the market will do.";

const THEMES = [
  { key: 'earnings', re: /\b(earn|earnings|results|quarterly|q[1-4]\b|report)\b/i, label: 'earnings / results' },
  { key: 'beat', re: /\b(beat|beats|exceed|exceeds|better than expected|above expectations|surprise)\b/i, label: 'results beating expectations' },
  { key: 'guidance', re: /\b(guidance|outlook|forecast|raise[sd]?)\b/i, label: 'forward guidance' },
  { key: 'momentum', re: /\b(momentum|trend|continue higher|continue lower|keeps? (rising|falling|climbing|dropping))\b/i, label: 'price momentum' },
  { key: 'breakout', re: /\b(break ?out|breakout|new high|new low|all[- ]time high)\b/i, label: 'a technical breakout' },
  { key: 'valuation', re: /\b(valuation|overvalued|undervalued|cheap|expensive|multiple|p\/e|pe ratio)\b/i, label: 'valuation' },
  { key: 'macro', re: /\b(macro|fed|federal reserve|rate[s]?|inflation|cpi|gdp|tariff|recession)\b/i, label: 'the macro backdrop' },
  { key: 'sector', re: /\b(sector|industry|peers?|competitor|supply chain)\b/i, label: 'the sector / peers' },
];

// --- small helpers ----------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function fmtPct(n) {
  const v = num(n);
  if (v === null) return 'n/a';
  return `${v > 0 ? '+' : ''}${round2(v)}%`;
}

function fmtNum(n) {
  const v = num(n);
  if (v === null) return 'n/a';
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function joinList(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A single classified evidence/insight item. `id` is stable for tests + UI keys. */
function ev(id, category, title, detail, source) {
  return { id, category, title, detail, source: source || null };
}

function normalizeDirection(v) {
  const d = String(v || '').toLowerCase();
  if (d === 'bullish' || d === 'bearish' || d === 'neutral') return d;
  return 'neutral';
}

// --- thesis interpretation --------------------------------------------------

export function interpretThesis(rawContext) {
  const c = rawContext || {};
  const direction = normalizeDirection(c.direction);
  const thesis = typeof c.thesis === 'string' ? c.thesis.trim() : '';
  const matched = THEMES.filter((t) => t.re.test(thesis));
  const themes = matched.map((t) => t.key);
  const themeLabels = matched.map((t) => t.label);

  const dirWord = direction === 'bullish' ? 'rise' : direction === 'bearish' ? 'fall' : 'stay range-bound';
  const tf = c.timeframe ? ` over your stated timeframe (${c.timeframe})` : '';
  let interpretation = `You expect ${c.asset || 'the asset'} to ${dirWord}${tf}.`;
  if (themeLabels.length) interpretation += ` Your stated reasoning centres on ${joinList(themeLabels)}.`;
  else if (thesis) interpretation += ' Your reasoning is captured in the thesis you submitted.';
  else interpretation += ' No thesis text was supplied, so the argument itself could not be summarised.';

  const assumptions = [];
  if (themes.includes('earnings') || themes.includes('beat')) {
    assumptions.push('The positive catalyst outcome is not already fully reflected in the price.');
  }
  if (themes.includes('momentum')) {
    assumptions.push('The current price trend will persist long enough for the thesis to play out.');
  }
  if (themes.includes('breakout')) {
    assumptions.push('The breakout will hold and follow through rather than reversing.');
  }
  if (themes.includes('guidance')) {
    assumptions.push('Forward guidance will be sustained or improved.');
  }
  assumptions.push(
    `The market will price ${c.asset || 'the asset'} in line with your ${direction} view${
      c.timeframe ? ` over ${c.timeframe}` : ''
    }.`
  );

  return { direction, thesis, themes, interpretation, assumptions };
}

// --- evidence collection ----------------------------------------------------

/** Returns true when usable market signals were available, false when missing. */
function marketEvidence(context, market, out) {
  const src = isObj(market) ? market.source || 'Bitget Spot API v2' : 'Bitget Spot API v2';

  const hasSignals =
    isObj(market) &&
    market.available !== false &&
    (num(market.price) !== null || num(market.trendPercent) !== null || typeof market.trendDirection === 'string');

  if (!hasSignals) {
    out.missing.push(
      ev(
        'missing-market',
        'market',
        'Market data unavailable',
        (isObj(market) && market.reason) ||
          'No usable market data was available for this asset, so price, trend and volatility could not be assessed.',
        null
      )
    );
    return false;
  }

  const dir = context.direction;
  const price = num(market.price);
  const trendPct = num(market.trendPercent);
  const trendDir = market.trendDirection;
  const chg24 = num(market.change24hPct);
  const vol = num(market.volatilityPct);
  const high = num(market.high24h);
  const low = num(market.low24h);

  // 1) Trend alignment
  if (trendDir && trendPct !== null) {
    const word = trendDir === 'up' ? 'up' : trendDir === 'down' ? 'down' : 'flat';
    const detail = `Price trend over the sampled window is ${word} (${fmtPct(trendPct)}).`;
    if (dir === 'bullish') {
      if (trendDir === 'up') out.supporting.push(ev('market-trend-support', 'market', 'Trend supports a bullish thesis', `${detail} That is consistent with your bullish thesis.`, src));
      else if (trendDir === 'down') out.contradicting.push(ev('market-trend-contradict', 'market', 'Trend contradicts a bullish thesis', `${detail} That moves against your bullish thesis.`, src));
    } else if (dir === 'bearish') {
      if (trendDir === 'down') out.supporting.push(ev('market-trend-support', 'market', 'Trend supports a bearish thesis', `${detail} That is consistent with your bearish thesis.`, src));
      else if (trendDir === 'up') out.contradicting.push(ev('market-trend-contradict', 'market', 'Trend contradicts a bearish thesis', `${detail} That moves against your bearish thesis.`, src));
    } else if (trendDir !== 'flat') {
      out.uncertainty.push(ev('market-trend-neutral', 'market', 'Directional trend vs a neutral thesis', `${detail} A sustained directional move may not suit a range / neutral thesis.`, src));
    }
  }

  // 2) Recent 24h move alignment
  if (chg24 !== null && Math.abs(chg24) > THRESHOLDS.flatBandPct) {
    const word = chg24 > 0 ? 'up' : 'down';
    const detail = `The asset is ${word} ${fmtPct(Math.abs(chg24))} over the last 24 hours.`;
    if (dir === 'bullish') {
      if (chg24 > 0) out.supporting.push(ev('market-move-support', 'market', 'Recent movement supports a bullish thesis', detail, src));
      else out.contradicting.push(ev('market-move-contradict', 'market', 'Recent movement contradicts a bullish thesis', detail, src));
    } else if (dir === 'bearish') {
      if (chg24 < 0) out.supporting.push(ev('market-move-support', 'market', 'Recent movement supports a bearish thesis', detail, src));
      else out.contradicting.push(ev('market-move-contradict', 'market', 'Recent movement contradicts a bearish thesis', detail, src));
    }
  }

  // 3) "Already priced in?" — a move this large in the thesis direction may be spent
  if (chg24 !== null) {
    const aligned = (dir === 'bullish' && chg24 >= THRESHOLDS.extendedMovePct) || (dir === 'bearish' && chg24 <= -THRESHOLDS.extendedMovePct);
    if (aligned) {
      out.uncertainty.push(
        ev('market-priced-in', 'market', 'Move may already be priced in', `Price has already moved ${fmtPct(Math.abs(chg24))} in the direction of your thesis over 24h. A thesis that relies on that move continuing may be partly reflected in the price already.`, src)
      );
    }
  }

  // 4) Volatility
  if (vol !== null && vol >= THRESHOLDS.elevatedVolPct) {
    out.uncertainty.push(
      ev('market-volatility', 'market', 'Elevated realized volatility', `Realized hourly volatility is elevated at ${vol}%. Larger adverse excursions and wider swings raise the risk of being stopped out even if the direction is right.`, src)
    );
  }

  // 5) Entry extension (near a 24h extreme)
  if (price !== null && high !== null && low !== null && high > 0 && low > 0 && high > low) {
    const distHighPct = ((high - price) / high) * 100;
    const distLowPct = ((price - low) / low) * 100;
    if (dir === 'bullish' && distHighPct <= THRESHOLDS.nearExtremePct) {
      out.uncertainty.push(ev('market-extended-entry', 'market', 'Entry is extended (near the 24h high)', `Price (${fmtNum(price)}) sits within ${THRESHOLDS.nearExtremePct}% of its 24h high (${fmtNum(high)}). Buying strength here leaves limited near-term room and raises the cost of being wrong.`, src));
    } else if (dir === 'bearish' && distLowPct <= THRESHOLDS.nearExtremePct) {
      out.uncertainty.push(ev('market-extended-entry', 'market', 'Entry is extended (near the 24h low)', `Price (${fmtNum(price)}) sits within ${THRESHOLDS.nearExtremePct}% of its 24h low (${fmtNum(low)}). A bearish thesis has less room to run from here and may be late.`, src));
    }
  }

  return true;
}

/** Returns true when usable event data was available, false when missing. */
function eventEvidence(context, events, out, now) {
  if (!isObj(events) || events.available === false) {
    out.missing.push(
      ev('missing-events', 'event', 'Event / catalyst data unavailable', (isObj(events) && events.reason) || 'No event data was available, so upcoming catalysts could not be confirmed or ruled out.', null)
    );
    return false;
  }

  const items = Array.isArray(events.items) ? events.items : [];
  if (!items.length) {
    out.missing.push(ev('missing-events', 'event', 'No events returned', 'The events provider returned no upcoming events for this asset.', events.source || null));
    return false;
  }

  const src = events.source || 'events provider';
  for (const it of items) {
    if (!it || !it.title) continue;
    const ts = Date.parse(it.date);
    const hasDate = Number.isFinite(ts);
    const when = it.date ? ` (${it.date})` : '';
    if (hasDate && ts < now) {
      out.uncertainty.push(ev('event-past', 'event', 'Catalyst may already be priced in', `"${it.title}"${when} appears to be in the past. If your thesis rests on this catalyst, its effect may already be reflected in the price.`, src));
    } else {
      out.uncertainty.push(ev('event-upcoming', 'event', 'Upcoming event risk', `Upcoming catalyst: "${it.title}"${when}. Prices can gap around scheduled events, which can invalidate a thesis regardless of direction.`, src));
    }
  }

  return true;
}

function contextEvidence(context, market, out) {
  const price = isObj(market) && market.available !== false ? num(market.price) : null;
  const entry = num(context.entryPrice);

  if (entry !== null && price !== null && price > 0) {
    const diffPct = ((entry - price) / price) * 100;
    if (context.direction === 'bullish' && diffPct > 0.5) {
      out.uncertainty.push(ev('context-entry-above', 'context', 'Entry price is above the current price', `Your stated entry (${fmtNum(entry)}) is above the current price (${fmtNum(price)}). If you intend to buy higher, the setup may have already moved away from you.`, null));
    } else if (context.direction === 'bearish' && diffPct < -0.5) {
      out.uncertainty.push(ev('context-entry-below', 'context', 'Entry price is below the current price', `Your stated entry (${fmtNum(entry)}) is below the current price (${fmtNum(price)}). If you intend to sell lower, the setup may have already moved away from you.`, null));
    }
  }

  if (context.existingPosition === 'long' && context.direction === 'bullish') {
    out.uncertainty.push(ev('context-existing-long', 'context', 'Adding to existing long exposure', 'You already hold a long position and are considering another bullish trade. This concentrates exposure and increases the impact if the thesis is wrong.', null));
  }
  if (context.existingPosition === 'short' && context.direction === 'bearish') {
    out.uncertainty.push(ev('context-existing-short', 'context', 'Adding to existing short exposure', 'You already hold a short position and are considering another bearish trade. This concentrates exposure and increases the impact if the thesis is wrong.', null));
  }

  if (!context.timeframe) {
    out.missing.push(ev('missing-timeframe', 'context', 'No timeframe specified', 'Without a timeframe, invalidation conditions and holding assumptions are less precise.', null));
  }
  if (entry === null) {
    out.missing.push(ev('missing-entry', 'context', 'No entry price supplied', 'Entry context was not provided, so entry quality could not be assessed.', null));
  }
  if (num(context.riskAmount) === null) {
    out.missing.push(ev('missing-risk', 'context', 'No risk amount supplied', 'Position sizing and maximum-loss context were not provided.', null));
  }
}

// --- synthesis --------------------------------------------------------------

/**
 * Evidence-strength label. DERIVED from the classified counts — it is a stated
 * rule, not an arbitrary model number. Labels follow the PRD vocabulary:
 * Supported / Mixed / Weak / Insufficient evidence.
 */
function deriveEvidenceStrength(supporting, contradicting, dataAvailable) {
  const s = supporting.length;
  const c = contradicting.length;

  if (!dataAvailable || (s === 0 && c === 0)) {
    return {
      label: 'insufficient evidence',
      basis: 'No usable market or event data was available to classify supporting or contradicting evidence.',
    };
  }
  if (c === 0) {
    return {
      label: 'supported',
      basis: `${s} supporting market/event signal${s === 1 ? '' : 's'} and no contradicting signal in the available data.`,
    };
  }
  if (s === 0) {
    return {
      label: 'weak',
      basis: `${c} contradicting market/event signal${c === 1 ? '' : 's'} and no supporting signal in the available data.`,
    };
  }
  return {
    label: 'mixed',
    basis: `${s} supporting vs ${c} contradicting signal${c === 1 ? '' : 's'} — evidence is not one-sided.`,
  };
}

function buildKeyRisks(contradicting, uncertainty) {
  const seen = new Set();
  const risks = [];
  for (const e of [...contradicting, ...uncertainty]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    risks.push({ id: e.id, category: e.category, title: e.title, detail: e.detail, source: e.source });
  }
  return risks.slice(0, 8);
}

function buildInvalidationConditions(context, market, events, themes, now) {
  const out = [];
  const dir = context.direction;
  const marketUsable = isObj(market) && market.available !== false;
  const price = marketUsable ? num(market.price) : null;
  const high = marketUsable ? num(market.high24h) : null;
  const low = marketUsable ? num(market.low24h) : null;

  if (marketUsable) {
    if (dir === 'bullish') {
      if (low !== null) out.push({ title: `A sustained move below the recent 24h low (${fmtNum(low)})`, detail: 'A break and hold below the recent low would indicate the bullish structure has failed.' });
      out.push({ title: 'A trend reversal to the downside', detail: 'A change from the current up/flat trend into a sustained downtrend would remove the momentum the thesis relies on.' });
    } else if (dir === 'bearish') {
      if (high !== null) out.push({ title: `A sustained move above the recent 24h high (${fmtNum(high)})`, detail: 'A break and hold above the recent high would indicate the bearish structure has failed.' });
      out.push({ title: 'A trend reversal to the upside', detail: 'A change from the current down/flat trend into a sustained uptrend would remove the momentum the thesis relies on.' });
    } else {
      out.push({ title: 'A decisive break out of the current range', detail: 'A sustained directional break would invalidate a neutral / range thesis.' });
    }
    if (num(market.volatilityPct) !== null && num(market.volatilityPct) >= THRESHOLDS.elevatedVolPct) {
      out.push({ title: 'Further volatility expansion', detail: 'If volatility expands beyond its current elevated level, the risk profile changes materially.' });
    }
  }

  if (isObj(events) && events.available !== false && Array.isArray(events.items) && events.items.length) {
    const upcoming = events.items.find((it) => Number.isFinite(Date.parse(it.date)) && Date.parse(it.date) >= now) || events.items[0];
    if (upcoming && upcoming.title) {
      out.push({ title: `The catalyst "${upcoming.title}" fails to confirm the thesis`, detail: 'If the event outcome contradicts the assumption your thesis rests on, the catalyst leg of the thesis breaks.' });
    }
  }

  if ((themes.includes('earnings') || themes.includes('beat')) && (!isObj(events) || events.available === false)) {
    out.push({ title: 'The earnings outcome cannot be verified', detail: 'Your thesis references earnings, but no event data was available to pin down the catalyst or its timing.' });
  }

  if (!out.length) {
    out.push({ title: 'Insufficient data to define precise invalidation levels', detail: 'Because market data was unavailable, explicit invalidation levels could not be derived from the data. Define them from your own levels.' });
  }
  return out;
}

/**
 * The single strongest challenge to the trade, chosen to MATCH the evidence
 * state — this is the section the trader reads first, so it must never
 * overstate what TradeGuard actually knows.
 *
 * Priority:
 *   1. A classified contradicting signal          -> that signal
 *   2. Data-limited (no usable market/event data) -> "cannot be validated"
 *   3. A concrete risk with no contradiction      -> that risk
 *   4. Data retrieved but nothing classified      -> "remains unconfirmed"
 *   5. Supporting evidence exists, nothing against-> "contradicting evidence is limited"
 *
 * Rules enforced here:
 *   - With ZERO usable evidence (cases 2 and 4) the text must NOT imply that the
 *     thesis is supported; the challenge IS the lack of confirmation.
 *   - It must also not imply the thesis is refuted: absence of evidence is
 *     stated as an absence, and no bearish evidence is manufactured.
 *   - `source` stays null when no data provider backed the statement.
 */
function buildStrongestCounterargument(contradicting, uncertainty, ctx) {
  const { supporting, dataLimited, asset, direction, missingInformation } = ctx;

  // 1. A real, classified contradicting signal is always the strongest challenge.
  if (contradicting.length) {
    const top = contradicting[0];
    return {
      title: top.title,
      detail: top.detail,
      basis: COUNTERARGUMENT_BASIS.CONTRADICTING,
      source: top.source,
    };
  }

  const missingTitles = (Array.isArray(missingInformation) ? missingInformation : [])
    .map((m) => m && m.title)
    .filter(Boolean);
  const missingText = missingTitles.length ? ` What is missing: ${missingTitles.join('; ')}.` : '';
  const noEvidenceNote = uncertainty.length
    ? ' The risk items listed below are context/risk observations — they are not evidence against the trade.'
    : '';

  // 2. Data-limited: nothing was retrievable, so nothing supports or contradicts.
  //    The honest strongest challenge is that the thesis is unconfirmed.
  if (dataLimited) {
    return {
      title: 'The thesis cannot currently be validated',
      detail: `No usable market or event data was available for ${asset}, so TradeGuard found no evidence that supports your ${direction} thesis and no evidence that contradicts it. The strongest challenge available is therefore that the thesis remains UNCONFIRMED: it cannot be validated right now and should be treated as unproven rather than supported. This is an absence of evidence, not evidence against the trade — TradeGuard has not manufactured a bearish case to fill the gap.${noEvidenceNote}${missingText}`,
      basis: COUNTERARGUMENT_BASIS.INSUFFICIENT_EVIDENCE,
      source: null,
    };
  }

  // 3. Data was usable and no contradiction was found, but a concrete risk applies.
  if (uncertainty.length) {
    const top = uncertainty[0];
    return {
      title: top.title,
      detail: top.detail,
      basis: COUNTERARGUMENT_BASIS.RISK,
      source: top.source,
    };
  }

  // 4. Data came back usable but nothing in it could be classified as evidence
  //    for or against the thesis — it is still unconfirmed, not supported.
  if (!supporting.length) {
    return {
      title: 'The thesis remains unconfirmed',
      detail: `The data retrieved for ${asset} contained no signal that supports or contradicts your ${direction} thesis, so the thesis is unconfirmed. The strongest challenge available is that it is unproven at this point — not that the evidence supports it.${missingText}`,
      basis: COUNTERARGUMENT_BASIS.INSUFFICIENT_EVIDENCE,
      source: null,
    };
  }

  // 5. Supporting evidence exists and nothing contradicts it. Only this case may
  //    say the evidence leans towards the thesis, and it still stays qualified.
  return {
    title: 'Contradicting evidence is limited',
    detail: `Based on the available data, no material contradicting evidence was found. The supporting signals above are consistent with the core thesis, but consistency is not confirmation — the risks listed above are what remains to be managed.`,
    basis: COUNTERARGUMENT_BASIS.NONE,
    source: null,
  };
}

function buildSummary(context, supporting, contradicting, strength) {
  const asset = context.asset || 'the asset';
  const dir = context.direction;
  const s = supporting.length;
  const c = contradicting.length;
  switch (strength.label) {
    case 'supported':
      return `The available evidence supports your ${dir} thesis on ${asset}. No material contradicting market or event signal was found in the data TradeGuard could retrieve, though the listed risks remain.`;
    case 'weak':
      return `The available evidence does not support your ${dir} thesis on ${asset}: ${c} contradicting signal${c === 1 ? '' : 's'} and no supporting signal were found in the data retrieved.`;
    case 'mixed':
      return `The evidence is mixed for your ${dir} thesis on ${asset}: ${s} supporting vs ${c} contradicting signal${c === 1 ? '' : 's'}. Weigh the strongest counterargument before deciding.`;
    default:
      return `TradeGuard could not retrieve enough market or event data to assess your ${dir} thesis on ${asset}. This is a data limitation, not a judgement on the trade.`;
  }
}

// --- public API -------------------------------------------------------------

function normalizeContext(rawContext) {
  const b = rawContext || {};
  return {
    asset: String(b.asset || '').trim().toUpperCase(),
    direction: normalizeDirection(b.direction),
    thesis: typeof b.thesis === 'string' ? b.thesis.trim() : '',
    timeframe: b.timeframe || '',
    entryPrice: num(b.entryPrice),
    riskAmount: num(b.riskAmount),
    confidence: num(b.confidence),
    existingPosition: b.existingPosition || '',
  };
}

/**
 * Run the deterministic thesis attack.
 * `opts.now` may be supplied for deterministic event-timing tests.
 */
export function analyzeThesis(rawContext, rawResearch, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const context = normalizeContext(rawContext);
  const research = isObj(rawResearch) ? rawResearch : {};
  const market = research.market || null;
  const events = research.events || null;

  const interpretation = interpretThesis({ ...context, asset: context.asset });
  context.themes = interpretation.themes;

  const supporting = [];
  const contradicting = [];
  const uncertainty = [];
  const missing = [];
  const bucket = { supporting, contradicting, uncertainty, missing };

  const marketUsable = marketEvidence(context, market, bucket);
  const eventsUsable = eventEvidence(context, events, bucket, now);
  contextEvidence(context, market, bucket);

  const dataAvailable = marketUsable || eventsUsable;

  const evidenceStrength = deriveEvidenceStrength(supporting, contradicting, dataAvailable);
  const keyRisks = buildKeyRisks(contradicting, uncertainty);
  const invalidationConditions = buildInvalidationConditions(context, market, events, interpretation.themes, now);
  const strongestCounterargument = buildStrongestCounterargument(contradicting, uncertainty, {
    supporting,
    dataLimited: !dataAvailable,
    asset: context.asset || 'the asset',
    direction: context.direction,
    missingInformation: missing,
  });
  const summary = buildSummary(context, supporting, contradicting, evidenceStrength);

  return {
    available: true,
    dataLimited: !dataAvailable,
    asset: context.asset,
    direction: context.direction,
    thesis: context.thesis,
    interpretation: interpretation.interpretation,
    interpretationNote: INTERPRETATION_NOTE,
    assumptions: interpretation.assumptions,
    supporting,
    contradicting,
    uncertainty,
    missingInformation: missing,
    keyRisks,
    invalidationConditions,
    strongestCounterargument,
    evidenceStrength,
    summary,
    generatedAt: new Date(now).toISOString(),
    disclaimer:
      'Research output, not a trading instruction. TradeGuard does not predict outcomes and does not place trades — the decision remains yours.',
  };
}

/** Honest unavailable state when the analysis cannot be produced at all. */
export function emptyAnalysis(reason) {
  return {
    available: false,
    dataLimited: true,
    reason: reason || 'The thesis analysis could not be produced.',
    interpretation: null,
    interpretationNote: null,
    supporting: [],
    contradicting: [],
    uncertainty: [],
    missingInformation: [],
    keyRisks: [],
    invalidationConditions: [],
    strongestCounterargument: null,
    evidenceStrength: { label: 'insufficient evidence', basis: reason || 'Analysis unavailable.' },
  };
}
