import { Request, Response } from 'express';
import { createPayPalOrder, capturePayPalOrder, type PlanType } from '../services/payment.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function handleCreateOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { plan } = req.body as { plan: PlanType };

    if (!['pro', 'agency'].includes(plan)) {
      sendError(res, 'Invalid plan', 400);
      return;
    }

    const order = await createPayPalOrder(userId, plan);
    sendSuccess(res, order);
  } catch (err) {
    logError(err as Error, { handler: 'handleCreateOrder' });
    sendError(res, 'Failed to create payment order', 500);
  }
}

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

export async function handlePayPalWebhook(req: Request, res: Response): Promise<void> {
  try {
    const event = req.body;
    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource?.id;
      if (orderId) await capturePayPalOrder(orderId);
    }
    res.json({ received: true });
  } catch (err) {
    logError(err as Error, { handler: 'handlePayPalWebhook' });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}