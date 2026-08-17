import axios from 'axios';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

export type PlanType = 'pro' | 'agency';

async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const { data } = await axios.post(
    `${config.paypal.baseUrl}/v1/oauth2/token`,
    'grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data.access_token;
}

export async function createPayPalOrder(
  userId: string,
  plan: PlanType
): Promise<{ orderId: string; approvalUrl: string }> {
  const amountUsd = (config.plans[plan].priceUsdCents / 100).toFixed(2);
  const token = await getPayPalAccessToken();

  const { data } = await axios.post(
    `${config.paypal.baseUrl}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amountUsd },
        description: `GrowthAuditor ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        custom_id: `${userId}:${plan}`,
      }],
      application_context: {
        return_url: `${config.security.corsOrigin}/payment/success`,
        cancel_url: `${config.security.corsOrigin}/payment/cancel`,
        brand_name: 'GrowthAuditor',
        user_action: 'PAY_NOW',
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const approvalUrl = data.links.find((l: { rel: string; href: string }) => l.rel === 'approve')?.href;

  const db = getAdminClient();
  await db.from('payments').insert({
    user_id: userId,
    provider: 'paypal',
    provider_order_id: data.id,
    plan,
    amount: config.plans[plan].priceUsdCents,
    currency: 'USD',
    status: 'pending',
  });

  logger.info('PayPal order created', { userId, plan, orderId: data.id });
  return { orderId: data.id, approvalUrl };
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<void> {
  const token = await getPayPalAccessToken();
  const { data } = await axios.post(
    `${config.paypal.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  if (data.status === 'COMPLETED') {
    const customId = data.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
    const [userId, plan] = customId.split(':');
    if (userId && plan) {
      await activatePlan(userId, plan as PlanType, paypalOrderId);
    }
  }
}

export async function activatePlan(userId: string, plan: PlanType, orderId: string): Promise<void> {
  const db = getAdminClient();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.from('users').update({ plan, plan_expires_at: expiresAt }).eq('id', userId);
  await db.from('payments').update({ status: 'completed' }).eq('provider_order_id', orderId).eq('provider', 'paypal');

  logger.info('Plan activated', { userId, plan, expiresAt });
}