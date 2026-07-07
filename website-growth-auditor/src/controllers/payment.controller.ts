import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  detectProvider,
  createRazorpayOrder,
  createPayPalOrder,
  verifyRazorpaySignature,
  capturePayPalOrder,
  activatePlan,
  type PlanType,
} from '../services/payment.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError, logger } from '../utils/logger';
import { config } from '../config';

// ── POST /api/payment/detect ───────────────────────────────────────────────────
// Frontend calls this first to know which payment UI to show
export async function handleDetectProvider(req: Request, res: Response): Promise<void> {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '';

    const provider = await detectProvider(ip);
    sendSuccess(res, { provider });
  } catch (err) {
    sendSuccess(res, { provider: 'paypal' }); // safe fallback
  }
}

// ── POST /api/payment/create-order ────────────────────────────────────────────
export async function handleCreateOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { plan, provider } = req.body as { plan: PlanType; provider: 'razorpay' | 'paypal' };

    if (!['pro', 'agency'].includes(plan)) {
      sendError(res, 'Invalid plan', 400);
      return;
    }

    if (provider === 'razorpay') {
      const order = await createRazorpayOrder(userId, plan);
      sendSuccess(res, order);
    } else {
      const order = await createPayPalOrder(userId, plan);
      sendSuccess(res, order);
    }
  } catch (err) {
    logError(err as Error, { handler: 'handleCreateOrder' });
    sendError(res, 'Failed to create payment order', 500);
  }
}

// ── POST /api/payment/verify-razorpay ─────────────────────────────────────────
// Called by frontend after Razorpay checkout succeeds
export async function handleVerifyRazorpay(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body as {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      plan: PlanType;
    };

    const valid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!valid) {
      sendError(res, 'Payment verification failed — invalid signature', 400, 'INVALID_SIGNATURE');
      return;
    }

    await activatePlan(userId, plan, 'razorpay', razorpay_order_id);
    sendSuccess(res, { activated: true, plan }, 200, `${plan} plan activated!`);
  } catch (err) {
    logError(err as Error, { handler: 'handleVerifyRazorpay' });
    sendError(res, 'Failed to verify payment', 500);
  }
}

// ── POST /api/payment/capture-paypal ──────────────────────────────────────────
// Called by frontend after PayPal approval redirect
export async function handleCapturePayPal(req: Request, res: Response): Promise<void> {
  try {
    const { order_id } = req.body as { order_id: string };
    await capturePayPalOrder(order_id);
    sendSuccess(res, { captured: true }, 200, 'Payment successful!');
  } catch (err) {
    logError(err as Error, { handler: 'handleCapturePayPal' });
    sendError(res, 'Failed to capture PayPal payment', 500);
  }
}

// ── POST /api/payment/webhook/razorpay ────────────────────────────────────────
// Razorpay sends events here — verify signature and activate plan
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const body = JSON.stringify(req.body);

    const expected = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');

    if (expected !== signature) {
      sendError(res, 'Invalid webhook signature', 400);
      return;
    }

    const event = req.body;
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const userId = payment.notes?.userId;
      const plan = payment.notes?.plan as PlanType;

      if (userId && plan) {
        await activatePlan(userId, plan, 'razorpay', payment.order_id);
        logger.info('Razorpay webhook: plan activated', { userId, plan });
      }
    }

    res.json({ received: true });
  } catch (err) {
    logError(err as Error, { handler: 'handleRazorpayWebhook' });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ── POST /api/payment/webhook/paypal ──────────────────────────────────────────
export async function handlePayPalWebhook(req: Request, res: Response): Promise<void> {
  try {
    const event = req.body;

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource?.id;
      if (orderId) {
        await capturePayPalOrder(orderId);
        logger.info('PayPal webhook: order captured', { orderId });
      }
    }

    res.json({ received: true });
  } catch (err) {
    logError(err as Error, { handler: 'handlePayPalWebhook' });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}