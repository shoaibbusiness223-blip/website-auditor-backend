import { Router } from 'express';
import { handleRunAudit, handleGetAudit, handleListAudits } from '../controllers/audit.controller';
import { validateAuditRequest } from '../validators';
import { requireAuth } from '../middleware/auth';
import { checkAuditLimit, requireFeature } from '../middleware/planEnforcement';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const router = Router();

const auditRateLimit = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.auditRateLimitMax,
  message: { success: false, error: 'Too many audit requests. Please wait.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// All audit routes require authentication
router.use(requireAuth);

// POST /api/audit — run new audit
// checkAuditLimit enforces monthly quota per plan before running
router.post('/', auditRateLimit, validateAuditRequest, checkAuditLimit, handleRunAudit);

// GET /api/audit — list audits (Pro+ only for full history)
router.get('/', handleListAudits);

// GET /api/audit/:id — get single audit report
router.get('/:id', handleGetAudit);

export default router;