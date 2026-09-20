/**
 * Paper execution route (Phase 10).
 *
 *   POST /api/paper-execution          — the gate + pre-execution review.
 *                                        Builds nothing and sends nothing.
 *   POST /api/paper-execution/submit   — the confirmed submission. Requires an
 *                                        explicit confirmation token.
 *
 * Body for both: { idea, risk, structure, report, decision }
 *   - idea      the submitted trade context
 *   - risk      the Phase 6 risk result (reused, never recalculated)
 *   - structure the Phase 7 trade structure (source of truth for the order)
 *   - report    the Phase 8 final report (must exist)
 *   - decision  the Phase 9 human decision record (must be TAKE)
 *
 * Design rules:
 *   - The evaluation endpoint ALWAYS returns 200. A locked or unavailable
 *     execution is a real, reportable answer, not an error — exactly like the
 *     analysis routes.
 *   - The submit endpoint returns 400 ONLY when the confirmation token is
 *     absent or wrong, because that is a validation failure on a deliberate
 *     human act. It never falls back to submitting anyway.
 *   - Nothing is submitted unless the gate is satisfied AND the confirmation
 *     matches exactly. Recording TAKE is not sufficient on its own.
 *   - The handler never returns 500. Every failure is an honest state.
 *   - No credential VALUE is ever read into a response or a log line. Only the
 *     NAMES of missing variables are reported.
 *   - There is no live-execution branch anywhere in this route.
 */

import { Router } from 'express';
import {
  buildExecutionRecord,
  runPaperExecution,
  emptyExecution,
  CONFIRM_TOKEN,
  CONFIRMATION_NOTICE,
  EXECUTION_STATUS_LABELS,
  detectLiveConfiguration,
} from '../services/bitgetDemoExecution.js';
import { DEMO_CREDENTIAL_ENV } from '../services/providers/bitgetDemo.js';

const router = Router();

/**
 * Reads the four upstream results off the request body.
 * Malformed or missing inputs are tolerated — they are exactly what the gate
 * exists to detect, and it reports them rather than rejecting the request.
 */
function readSources(body) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (v) => (v && typeof v === 'object' ? v : null);
  return {
    idea: pick(b.idea) || pick(b.context) || null,
    risk: pick(b.risk),
    structure: pick(b.structure),
    report: pick(b.report),
    decision: pick(b.decision),
  };
}

/** Static contract description, returned with every response. */
function meta() {
  return {
    environment: 'demo',
    venue: 'Bitget Demo trading (virtual funds)',
    confirmation: {
      required: true,
      token: CONFIRM_TOKEN,
      notice: CONFIRMATION_NOTICE,
    },
    states: { ...EXECUTION_STATUS_LABELS },
    credentials: {
      source: 'environment variables — never hardcoded, never returned',
      required: [
        DEMO_CREDENTIAL_ENV.key,
        DEMO_CREDENTIAL_ENV.secret,
        DEMO_CREDENTIAL_ENV.passphrase,
      ],
      optional: [DEMO_CREDENTIAL_ENV.base],
    },
    sources: {
      risk: 'Phase 6 deterministic risk engine, reused unchanged — never recalculated here',
      structure: 'Phase 7 trade structure, the source of truth for the order',
      report: 'Phase 8 final trade report',
      decision: 'Phase 9 human decision — only a recorded TAKE unlocks execution',
      execution: 'Bitget Demo only. No live order is placed and no live fallback exists.',
    },
    live: { available: false, note: 'TradeGuard does not place live-money orders from this phase.' },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * POST /api/paper-execution — evaluate the gate and build the review.
 * Sends nothing. Always 200.
 */
router.post('/paper-execution', (req, res) => {
  const sources = readSources(req.body);

  let record;
  try {
    record = buildExecutionRecord(sources);
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      message: `Paper execution could not be evaluated: ${e?.message || e}`,
      execution: emptyExecution(`Paper execution could not be evaluated: ${e?.message || e}`),
      ...meta(),
    });
  }

  return res.status(200).json({
    status: record.status,
    execution: record,
    ...meta(),
  });
});

/**
 * POST /api/paper-execution/submit — submit, but only with explicit confirmation.
 *
 * A missing or wrong token is a 400 and submits nothing. A satisfied gate with a
 * correct token that the venue rejects returns 200 with PAPER ORDER FAILED,
 * because a rejection by the demo venue is a real outcome to report, not a
 * malformed request.
 */
router.post('/paper-execution/submit', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sources = readSources(body);
  const confirmation = typeof body.confirmation === 'string' ? body.confirmation : null;

  // The live guard is checked here too, independently of the service, so that
  // even a future refactor of the service cannot open a live path in this route.
  const live = detectLiveConfiguration();
  if (live.requested) {
    return res.status(200).json({
      status: 'refused',
      message:
        'Live execution is not available in TradeGuard. A live-execution variable was found in the ' +
        'environment and was refused.',
      execution: emptyExecution(
        'TradeGuard does not place live-money orders. The live-execution setting found in the environment has been refused.'
      ),
      liveVariablesFound: live.variables,
      ...meta(),
    });
  }

  if (confirmation !== CONFIRM_TOKEN) {
    // Evaluate anyway so the UI can show WHY nothing happened, but submit nothing.
    let record;
    try {
      record = buildExecutionRecord(sources);
    } catch (e) {
      record = emptyExecution(String(e?.message || e));
    }
    return res.status(400).json({
      status: 'confirmation-required',
      message: `Nothing was submitted. Confirm by sending "${CONFIRM_TOKEN}" — recording TAKE does not submit an order by itself.`,
      execution: {
        ...record,
        confirmationRequired: true,
      },
      ...meta(),
    });
  }

  let record;
  try {
    record = await runPaperExecution(sources, confirmation);
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      message: `The paper order could not be submitted: ${e?.message || e}`,
      execution: emptyExecution(`The paper order could not be submitted: ${e?.message || e}`),
      ...meta(),
    });
  }

  return res.status(200).json({
    status: record.status,
    execution: record,
    ...meta(),
  });
});

export default router;
