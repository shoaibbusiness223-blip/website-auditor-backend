import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function getGroqKeys(): string[] {
  const multiKey = process.env.GROQ_API_KEYS;
  if (multiKey) {
    const keys = multiKey.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const singleKey = process.env.GROQ_API_KEY;
  if (singleKey) return [singleKey];
  throw new Error('Missing required environment variable: GROQ_API_KEYS or GROQ_API_KEY');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  isProd: process.env.NODE_ENV === 'production',

  supabase: {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: requireEnv('SUPABASE_JWT_SECRET'),
  },

  groq: {
    apiKeys: getGroqKeys(),
    model: 'llama-3.3-70b-versatile',
    maxTokens: 2048,
  },

  // ── Email (Supabase handles OTP email sending via SMTP) ────────────────────
  // Configure SMTP in Supabase Dashboard → Authentication → Email Templates
  otp: {
    expiryMinutes: 10,
    maxAttempts: 3,
  },

  // ── Razorpay (Indian users) ────────────────────────────────────────────────
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  // ── PayPal (International users) ──────────────────────────────────────────
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    baseUrl: process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
  },

  // ── Plan pricing ───────────────────────────────────────────────────────────
  plans: {
    pro: {
      priceUsdCents: 1900,       // $19.00
      priceInrPaise: 149900,     // ₹1,499
      auditsPerMonth: 50,
    },
    agency: {
      priceUsdCents: 7900,       // $79.00
      priceInrPaise: 649900,     // ₹6,499
      auditsPerMonth: 999,
    },
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    auditRateLimitMax: parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '10', 10),
  },

  scraper: {
    timeoutMs: parseInt(process.env.FETCH_TIMEOUT_MS || '10000', 10),
    maxResponseSizeBytes: parseInt(process.env.MAX_RESPONSE_SIZE_BYTES || '5242880', 10),
  },
} as const;