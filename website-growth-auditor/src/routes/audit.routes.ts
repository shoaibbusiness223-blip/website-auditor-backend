import { Router } from 'express';
import { handleRunAudit, handleGetAudit, handleListAudits } from '../controllers/audit.controller';
import { validateAuditRequest } from '../validators';
import { requireAuth } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const router = Router();

// Stricter rate limit specifically for audit (expensive operation)
const auditRateLimit = rateLimit({
  windowMs: config.security.rateLimitWindowMs, // 15 min
  max: config.security.auditRateLimitMax,       // 10 audits per window
  message: { success: false, error: 'Too many audit requests. Please wait before trying again.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// All audit routes require authentication
router.use(requireAuth);

// POST /api/audit
router.post('/', auditRateLimit, validateAuditRequest, handleRunAudit);

// GET /api/audit
router.get('/', handleListAudits);

// GET /api/audit/:id
router.get('/:id', handleGetAudit);

export default router;
