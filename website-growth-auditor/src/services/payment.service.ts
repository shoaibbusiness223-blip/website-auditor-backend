import axios from 'axios';
import crypto from 'crypto';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

export type PaymentProvider = 'razorpay' | 'paypal';
export type PlanType = 'pro' | 'agency';

// ─────────────────────────────────────────────────────────────────────────────
// GEO DETECTION — Detect if user is from India to route to Razorpay
// Uses ip-api.com (free, 1000 req/min, no key needed)
// ─────────────────────────────────────────────────────────────────────────────

export async function detectProvider(ip: string): Promise<PaymentProvider> {
  // Private/local IPs → default to PayPal (dev environment)
  if (!ip || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('127.')) {
    return 'paypal';
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      timeout: 3000,
    });
    const country = res.data?.countryCode;
    logger.debug('GEO detected', { ip, country });
    return country === 'IN' ? 'razorpay' : 'paypal';
  } catch {
    logger.warn('GEO detection failed — defaulting to PayPal', { ip });
    return 'paypal';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY — Create order
// ─────────────────────────────────────────────────────────────────────────────

export async function createRazorpayOrder(
  userId: string,
  plan: PlanType
): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
  const amount = config.plans[plan].priceInrPaise;
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');

  const { data } = await axios.post(
    'https://api.razorpay.com/v1/orders',
    {
      amount,
      currency: 'INR',
      receipt: `wga_${userId}_${Date.now()}`,
      notes: { userId, plan },
    },
    { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } }
  );

  // Store pending payment record
  const db = getAdminClient();
  await db.from('payments').insert({
    user_id: userId,
    provider: 'razorpay',
    provider_order_id: data.id,
    plan,
    amount,
    currency: 'INR',
    status: 'pending',
  });

  logger.info('Razorpay order created', { userId, plan, orderId: data.id });
  return { orderId: data.id, amount, currency: 'INR', keyId: config.razorpay.keyId };
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');
  return expected === signature;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYPAL — Create order
// ─────────────────────────────────────────────────────────────────────────────

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

  // Store pending payment record
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
      await activatePlan(userId, plan as PlanType, 'paypal', paypalOrderId);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — Activate plan after successful payment
// ─────────────────────────────────────────────────────────────────────────────

export async function activatePlan(
  userId: string,
  plan: PlanType,
  provider: PaymentProvider,
  orderId: string
): Promise<void> {
  const db = getAdminClient();

  // Plan expires 30 days from now
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.from('users').update({ plan, plan_expires_at: expiresAt }).eq('id', userId);

  await db.from('payments')
    .update({ status: 'completed' })
    .eq('provider_order_id', orderId)
    .eq('provider', provider);

  logger.info('Plan activated', { userId, plan, provider, expiresAt });
}