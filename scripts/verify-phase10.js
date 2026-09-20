// Integration verification for Phase 10 — exact rNVDA trade from the plan.
// This drives the REAL running backend with the same request shape the browser
// UI sends (src/lib/api.js). It is not a unit test; it proves the wiring,
// the gate, the risk figures and the honest unavailable state all hold in the
// live server, not just in isolation.

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

(async () => {
  // 1. Validate the trade idea (sanity). 201 = created.
  const idea = await post('/api/trade-ideas', CONTEXT);
  check('trade idea validates', idea.status === 200 || idea.status === 201, `HTTP ${idea.status}`);

  // 2. Phase 6 risk.
  const risk = await post('/api/risk-assessment', { context: CONTEXT });
  const rk = risk.data.risk;
  check('risk engine returns READY', rk.status === 'ready', rk.status);
  check('Phase 6 price risk/unit = 5', rk.calculation.priceRiskPerUnit === 5, String(rk.calculation.priceRiskPerUnit));
  check('Phase 6 position size = 10', rk.calculation.positionSize === 10, String(rk.calculation.positionSize));
  check('Phase 6 defined risk = 50', rk.calculation.definedRisk === 50, String(rk.calculation.definedRisk));
  check('Phase 6 side = long', rk.side === 'long', rk.side);

  // 3. Phase 7 structure.
  const structure = await post('/api/trade-structure', { context: CONTEXT, risk: rk });
  const st = structure.data.structure;
  check('trade structure completes', st.status === 'complete', st.status);

  // 4. Phase 8 report.
  const report = await post('/api/final-report', { context: CONTEXT, risk: rk, structure: st });
  check('final report available', report.data.report.available === true);

  // 5. Phase 9 decision = TAKE.
  const take = await post('/api/human-decision', { context: CONTEXT, decision: 'TAKE', reason: REASON, risk: rk });
  check('human decision recorded as TAKE', take.data.record.decision === 'TAKE', take.data.record.decision);
  check('decision status = recorded', take.data.record.status === 'recorded', take.data.record.status);
  const decision = take.data.record;

  // 5b. A WAIT decision must lock execution.
  const wait = await post('/api/human-decision', { context: CONTEXT, decision: 'WAIT', reason: REASON, risk: rk });
  const gateWait = await post('/api/paper-execution', { idea: CONTEXT, risk: rk, structure: st, report: report.data.report, decision: wait.data.record });
  check('WAIT decision → EXECUTION LOCKED', gateWait.data.execution.status === 'locked', gateWait.data.execution.statusLabel);

  // 6. Phase 10 gate with TAKE.
  const gate = await post('/api/paper-execution', { idea: CONTEXT, risk: rk, structure: st, report: report.data.report, decision });
  const ex = gate.data.execution;
  check('TAKE → gate READY', ex.status === 'ready', ex.statusLabel);
  check('gate status label = READY FOR PAPER EXECUTION', ex.statusLabel === 'READY FOR PAPER EXECUTION', ex.statusLabel);
  check('review asset = rNVDA (normalised to RNVDA)', ex.review.asset === 'RNVDA', ex.review.asset);
  check('review direction = bullish', ex.review.direction === 'bullish', ex.review.direction);
  check('review timeframe = swing', ex.review.timeframe === 'swing', ex.review.timeframe);
  check('review entry = 100', ex.review.entryPrice === 100, String(ex.review.entryPrice));
  check('review invalidation = 95', ex.review.invalidationPrice === 95, String(ex.review.invalidationPrice));
  check('review risk budget = 50', ex.review.riskBudget === 50, String(ex.review.riskBudget));
  check('review price risk/unit = 5', ex.review.priceRiskPerUnit === 5, String(ex.review.priceRiskPerUnit));
  check('review position size = 10', ex.review.positionSize === 10, String(ex.review.positionSize));
  check('review defined risk = 50', ex.review.definedRisk === 50, String(ex.review.definedRisk));
  check('review decision = TAKE', ex.review.decision === 'TAKE', ex.review.decision);
  check('review reason is trader’s own words', ex.review.reason === REASON);
  check('order symbol = RNVDAUSDT', ex.order.symbol === 'RNVDAUSDT', ex.order.symbol);
  check('order side = buy', ex.order.side === 'buy', ex.order.side);
  check('order type = limit', ex.order.orderType === 'limit', ex.order.orderType);
  check('order quantity = 10', ex.order.quantity === 10, String(ex.order.quantity));
  check('order price = 100', ex.order.price === 100, String(ex.order.price));
  check('confirmation token = PAPER EXECUTE', ex.confirmationToken === 'PAPER EXECUTE', ex.confirmationToken);
  check('confirmation notice names Bitget Demo + virtual funds', /Bitget Demo/.test(ex.confirmationNotice) && /virtual funds/.test(ex.confirmationNotice));
  check('meta says environment is demo', gate.data.environment === 'demo', gate.data.environment);
  check('meta live.available = false', gate.data.live.available === false);

  // 7. Submit WITHOUT confirmation → refused (400, nothing sent).
  const noConfirm = await post('/api/paper-execution/submit', { idea: CONTEXT, risk: rk, structure: st, report: report.data.report, decision, confirmation: null });
  check('submit without confirmation → 400', noConfirm.status === 400, `HTTP ${noConfirm.status}`);
  check('submit without confirmation → confirmation-required', noConfirm.data.status === 'confirmation-required', noConfirm.data.status);
  check('no order recorded without confirmation', noConfirm.data.execution.ordered === false);

  // 8. Submit WITH confirmation "PAPER EXECUTE" → honest UNAVAILABLE (no creds).
  const submitted = await post('/api/paper-execution/submit', { idea: CONTEXT, risk: rk, structure: st, report: report.data.report, decision, confirmation: 'PAPER EXECUTE' });
  check('submit with confirmation → UNAVAILABLE (no creds)', submitted.data.execution.status === 'unavailable', submitted.data.execution.statusLabel);
  check('unavailable label = PAPER EXECUTION UNAVAILABLE', submitted.data.execution.statusLabel === 'PAPER EXECUTION UNAVAILABLE', submitted.data.execution.statusLabel);
  check('result orderId is null (no fabricated order)', submitted.data.execution.result.orderId === null);
  check('missing credentials named (3 demo env vars)',
    Array.isArray(submitted.data.execution.result.missingCredentials) &&
    submitted.data.execution.result.missingCredentials.length === 3 &&
    submitted.data.execution.result.missingCredentials.includes('TRADEGUARD_BITGET_DEMO_API_KEY') &&
    submitted.data.execution.result.missingCredentials.includes('TRADEGUARD_BITGET_DEMO_API_SECRET') &&
    submitted.data.execution.result.missingCredentials.includes('TRADEGUARD_BITGET_DEMO_PASSPHRASE'),
    JSON.stringify(submitted.data.execution.result.missingCredentials));
  check('no live-money path: status is not submitted/failed-by-fabrication', submitted.data.execution.status !== 'submitted');

  // 9. Secret scan — none of the env secret values appear in any response.
  const blob = JSON.stringify(submitted);
  check('no secret value leaks in response', !/demo-secret|demo-key|demo-pass/.test(blob));

  // 10. Later phases must not have broken this one. Phases 11 and 12 were built
  //     afterwards, so this only asserts the server is still healthy and that
  //     adding them changed nothing about the Phase 10 contract above.
  const nav = await fetch(`${BASE}/api/health`);
  const navData = await nav.json().catch(() => ({}));
  check('server still alive after the Phase 10 checks', navData.status === 'ok');

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFICATION ERROR:', e);
  process.exit(2);
});
