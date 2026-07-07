import { Router } from 'express';
import {
  handleDetectProvider,
  handleCreateOrder,
  handleVerifyRazorpay,
  handleCapturePayPal,
  handleRazorpayWebhook,
  handlePayPalWebhook,
} from '../controllers/payment.controller';
import { requireAuth } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

const router = Router();

function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendError(res, errors.array()[0].msg as string, 422, 'VALIDATION_ERROR');
    return;
  }
  next();
}

// ── Public (no auth) ───────────────────────────────────────────────────────────

// POST /api/payment/detect  — detect provider by IP
router.post('/detect', handleDetectProvider);

// Webhooks — must be public, signature verified inside handler
// IMPORTANT: use express.raw() for Razorpay webhook body
router.post('/webhook/razorpay', handleRazorpayWebhook);
router.post('/webhook/paypal', handlePayPalWebhook);

// ── Protected ──────────────────────────────────────────────────────────────────

// POST /api/payment/create-order
router.post('/create-order',
  requireAuth,
  [
    body('plan').isIn(['pro', 'agency']).withMessage('Invalid plan'),
    body('provider').isIn(['razorpay', 'paypal']).withMessage('Invalid provider'),
    validate,
  ],
  handleCreateOrder
);

// POST /api/payment/verify-razorpay
router.post('/verify-razorpay',
  requireAuth,
  [
    body('razorpay_order_id').notEmpty(),
    body('razorpay_payment_id').notEmpty(),
    body('razorpay_signature').notEmpty(),
    body('plan').isIn(['pro', 'agency']),
    validate,
  ],
  handleVerifyRazorpay
);

// POST /api/payment/capture-paypal
router.post('/capture-paypal',
  requireAuth,
  [body('order_id').notEmpty(), validate],
  handleCapturePayPal
);

export default router;