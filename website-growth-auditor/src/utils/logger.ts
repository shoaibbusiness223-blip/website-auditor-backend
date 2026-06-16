import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

// ─── Production: structured JSON logs (for log aggregators like Datadog, Logtail)
const productionFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ─── Development: human-readable colored output
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  simple()
);

export const logger = winston.createLogger({
  level: config.isProd ? 'info' : 'debug',
  format: config.isProd ? productionFormat : devFormat,
  defaultMeta: { service: 'website-growth-auditor' },
  transports: [
    new winston.transports.Console(),
    // In production, add file or remote transports here:
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

// ─── Convenience wrappers ──────────────────────────────────────────────────────

export function logRequest(method: string, path: string, statusCode: number, durationMs: number, userId?: string) {
  logger.info('HTTP Request', { method, path, statusCode, durationMs, userId });
}

export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error(error.message, { stack: error.stack, ...context });
}

export function logAudit(event: string, data: Record<string, unknown>) {
  logger.info(`[AUDIT] ${event}`, data);
}
