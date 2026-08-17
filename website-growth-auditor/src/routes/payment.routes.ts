import { Router } from 'express';
import { handleCreateOrder, handleCapturePayPal, handlePayPalWebhook } from '../controllers/payment.controller';
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

router.post('/webhook/paypal', handlePayPalWebhook);

router.post('/create-order',
  requireAuth,
  [body('plan').isIn(['pro', 'agency']).withMessage('Invalid plan'), validate],
  handleCreateOrder
);

router.post('/capture-paypal',
  requireAuth,
  [body('order_id').notEmpty(), validate],
  handleCapturePayPal
);

export default router;