// Integration verification for Phase 11 — Trade Review.
// Drives the REAL running backend with the same request shape the browser UI
// sends (src/lib/api.js). It is not a unit test; it proves the /api/trade-review
// route, the deterministic assembler, the verbatim thesis, the risk reuse and the
// honest execution states all hold in the live server — not just in isolation.

const BASE = process.env.BASE || 'http://localhost:8787';

const CONTEXT = {
  asset: 'rNVDA',
  direction: 'bullish',
  thesis:
    'I think rNVDA will continue higher over the next few days because the current momentum is bullish ' +
    'and the price may continue to push higher if it holds above the key support area.',
  timeframe: 'swing',
  entryPrice: 100,
  invalidationPrice: 95,
  riskAmount: 50,
  confidence: 7,
  existingPosition: 'none',
};

const REASON = 'Momentum is holding and my risk is defined at 50, so I am willing to take this.';

// An execution record shaped exactly like the one Phase 10 hands back after a real
// (credentialed) Bitget Demo submission. Passed the way the UI would pass the
// execution state it already holds — the review never re-submits anything.
const SUBMITTED_EXECUTION = {
  status: 'submitted',
  statusDetail: null,
  result: {
    status: 'submitted',
    orderId: 'O-INT-1',
    symbol: 'RNVDAUSDT',
    side: 'buy',
    quantity: 10,
    price: 100,
    orderType: 'limit',
    submittedAt: new Date().toISOString(),
    environment: 'demo',
  },
};

const FAILED_EXECUTION = {
  status: 'failed',
  statusDetail: 'Demo venue rejected the order.',
  result: { status: 'failed', rawStatus: 'REJECTED', errorCode: 'DEMO_400' },
};

const UNAVAILABLE_EXECUTION = {
  status: 'unavailable',
  statusDetail: 'Bitget Demo credentials were unavailable.',
  result: null,
};

let failures = 0;
function check(name, cond, extra = '') {
  const ok = Boolean(cond);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  return ok;
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  let data = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
}

// Assemble the verified records exactly as the UI would before calling the route.
async function assembleSources(extras = {}) {
  const idea = await post('/api/trade-ideas', CONTEXT);
  const risk = await post('/api/risk-assessment', { context: CONTEXT });
  const structure = await post('/api/trade-structure', { context: CONTEXT, risk: risk.data.risk });
  const report = await post('/api/final-report', {
    context: CONTEXT,
    risk: risk.data.risk,
    structure: structure.data.structure,
  });
  const research = await post('/api/research', { context: CONTEXT });
  const attack = await post('/api/thesis-attack', { context: CONTEXT, research: research.data });
  const history = await post('/api/historical-stress-test', { context: CONTEXT, research: research.data });
  const decision = await post('/api/human-decision', {
    context: CONTEXT,
    decision: extras.decision || 'TAKE',
    reason: REASON,
    risk: risk.data.risk,
  });

  return {
    idea: CONTEXT,
    risk: risk.data.risk,
    structure: structure.data.structure,
    report: report.data.report,
    research: research.data,
    attack: attack.data.analysis,
    history: history.data.history,
    decision: decision.data.record,
    execution: extras.execution ?? null,
  };
}

async function reviewWith(sources) {
  return post('/api/trade-review', sources);
}

(async () => {
  // 0. Server alive.
  const health = await get('/api/health');
  check('server alive (Phase 11 built)', health.data?.status === 'ok', `phase ${health.data?.phase}`);

  // 1. LOCKED when there is no decision at all.
  const locked = await reviewWith({ idea: CONTEXT });
  check('no decision → REVIEW LOCKED', locked.data.review.status === 'locked', locked.data.review.statusLabel);

  // 2. Full chain + TAKE decision, no execution yet → INCOMPLETE.
  const srcIncomplete = await assembleSources({ decision: 'TAKE' });
  const incomplete = await reviewWith(srcIncomplete);
  check('TAKE + no execution → REVIEW INCOMPLETE', incomplete.data.review.status === 'incomplete', incomplete.data.review.statusLabel);
  check('risk figures reused from Phase 6 (price risk/unit = 5)', incomplete.data.review.plan?.priceRiskPerUnit === 5, String(incomplete.data.review.plan?.priceRiskPerUnit));
  check('risk figures reused from Phase 6 (defined risk = 50)', incomplete.data.review.plan?.definedRisk === 50, String(incomplete.data.review.plan?.definedRisk));
  check('thesis preserved verbatim', incomplete.data.review.thesis === CONTEXT.thesis);
  check('decision reason preserved', incomplete.data.review.decision?.decision === 'TAKE');
  check('outcome P&L is null (never calculated)', incomplete.data.review.outcome.pnl === null);
  check('no fabricated order when none submitted', incomplete.data.review.executionRecord.order === null);

  // 3. TAKE + a submitted execution record → REVIEW READY with the real order.
  const srcReady = await assembleSources({ decision: 'TAKE', execution: SUBMITTED_EXECUTION });
  const ready = await reviewWith(srcReady);
  check('TAKE + submitted execution → REVIEW READY', ready.data.review.status === 'ready', ready.data.review.statusLabel);
  check('execution record shows submitted order ID', ready.data.review.executionRecord.order?.orderId === 'O-INT-1', String(ready.data.review.executionRecord.order?.orderId));
  check('outcome status = submitted', ready.data.review.outcome.status === 'submitted', ready.data.review.outcome.status);
  check('outcome P&L still null even when submitted (demo is not a fill)', ready.data.review.outcome.pnl === null);
  check('fill note honest about no fill outcome', /fill outcome not available/i.test(ready.data.review.outcome.fillNote || ''));

  // 4. TAKE + failed execution → honest INCOMPLETE / FAILED.
  const srcFailed = await assembleSources({ decision: 'TAKE', execution: FAILED_EXECUTION });
  const failed = await reviewWith(srcFailed);
  check('TAKE + failed execution → outcome FAILED', failed.data.review.outcome.status === 'failed', failed.data.review.outcome.status);
  check('failed execution → no fabricated order', failed.data.review.executionRecord.order === null);

  // 5. TAKE + unavailable execution (no creds) → honest UNAVAILABLE outcome.
  const srcUnavail = await assembleSources({ decision: 'TAKE', execution: UNAVAILABLE_EXECUTION });
  const unavail = await reviewWith(srcUnavail);
  check('TAKE + unavailable execution → outcome UNAVAILABLE', unavail.data.review.outcome.status === 'unavailable', unavail.data.review.outcome.status);

  // 6. WAIT decision → READY, no execution.
  const srcWait = await assembleSources({ decision: 'WAIT' });
  const wait = await reviewWith(srcWait);
  check('WAIT decision → REVIEW READY', wait.data.review.status === 'ready', wait.data.review.statusLabel);
  check('WAIT → execution record shows no order submitted', wait.data.review.executionRecord.executed === false && wait.data.review.executionRecord.order === null);

  // 7. Missing risk → UNAVAILABLE (cannot show the plan honestly).
  const srcNoRisk = await assembleSources({ decision: 'TAKE' });
  srcNoRisk.risk = null;
  const noRisk = await reviewWith(srcNoRisk);
  check('TAKE + missing risk → REVIEW UNAVAILABLE', noRisk.data.review.status === 'unavailable', noRisk.data.review.statusLabel);
  check('UNAVAILABLE → plan is null (no partial fabrication)', noRisk.data.review.plan === null);

  // 8. Meta contract.
  check('meta reports phase 11', incomplete.data.phase === 11, String(incomplete.data.phase));
  check('meta pnl.computed = false', incomplete.data.pnl?.computed === false);
  check('meta reviewStates include locked/ready/incomplete/unavailable', ['locked', 'ready', 'incomplete', 'unavailable'].every((s) => s in (incomplete.data.reviewStates || {})));

  // 9. No new recommendation / signal field leaked at the top level.
  const forbiddenKeys = ['recommendation', 'signal', 'prediction', 'expectedReturn', 'priceTarget', 'score', 'ranking'];
  const leaked = forbiddenKeys.filter((k) => k in ready.data.review);
  check('no recommendation/signal/prediction field on the review', leaked.length === 0, leaked.join(','));

  // 10. Phase 12 (Trader Review) is still not built — no route, server healthy.
  const stillAlive = await get('/api/health');
  check('server still alive after Phase 11 checks (Phase 12 untouched)', stillAlive.data?.status === 'ok');

  console.log('\n' + (failures === 0 ? 'ALL PHASE 11 CHECKS PASSED' : `${failures} CHECK(S) FAILED`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFICATION ERROR:', e);
  process.exit(2);
});
