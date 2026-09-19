import { Router } from 'express';
import { validateTradeIdea, buildCaptureResponse } from '../lib/validateTradeIdea.js';

const router = Router();

/**
 * POST /api/trade-ideas
 * Phase 1: validate + capture the submitted thesis.
 */
router.post('/trade-ideas', (req, res) => {
  const result = validateTradeIdea(req.body);

  if (!result.valid) {
    return res.status(400).json({
      status: 'invalid',
      message: 'The trade idea could not be accepted. Fix the highlighted fields.',
      errors: result.errors,
    });
  }

  return res.status(201).json(buildCaptureResponse(result.value));
});

export default router;
