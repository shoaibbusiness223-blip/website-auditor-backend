import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

// ── Parse comma-separated Groq keys ────────────────────────────────────────────
// Set GROQ_API_KEYS=key1,key2,key3 in your environment (Render/Vercel).
// Falls back to single GROQ_API_KEY for backward compatibility.
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