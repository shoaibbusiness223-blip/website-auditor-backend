import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import auditRoutes from './routes/audit.routes';

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.isProd
    ? [config.security.corsOrigin]  // Strict in production
    : true,                          // Allow all in dev
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24h
}));

// ─── Body Parsing + Size Limits ────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));     // Reject huge JSON bodies
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ─── Trust proxy (needed for rate limiting behind Vercel/Nginx) ────────────────
app.set('trust proxy', 1);

// ─── Global Rate Limiting ──────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
}));

// ─── Request Logger ────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env, timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
