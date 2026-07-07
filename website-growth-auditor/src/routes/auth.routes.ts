import { Router } from 'express';
import {
  handleSignup,
  handleLogin,
  handleVerifyEmail,
  handleResendOtp,
  handleVerify2FA,
  handleToggle2FA,
  handleConfirm2FAEnable,
  handleMe,
} from '../controllers/auth.controller';
import { validateSignup, validateLogin } from '../validators';
import { requireAuth } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

const router = Router();

function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendError(res, errors.array()[0].msg as string, 422, 'VALIDATION_ERROR');
    return;
  }
  next();
}

const validateOtp = [
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),
  validate,
];

// ── Public routes ──────────────────────────────────────────────────────────────

// POST /api/auth/signup
router.post('/signup', validateSignup, handleSignup);

// POST /api/auth/login
router.post('/login', validateLogin, handleLogin);

// POST /api/auth/verify-email  (called right after signup)
router.post('/verify-email',
  [body('user_id').notEmpty(), body('code').isLength({ min: 6, max: 6 }).isNumeric(), validate],
  handleVerifyEmail
);

// POST /api/auth/verify-2fa  (called after login when 2FA is enabled)
router.post('/verify-2fa',
  [body('user_id').notEmpty(), body('code').isLength({ min: 6, max: 6 }).isNumeric(), validate],
  handleVerify2FA
);

// POST /api/auth/resend-otp
router.post('/resend-otp',
  [body('user_id').notEmpty(), body('email').isEmail(), body('type').isIn(['email_verification', 'login_2fa']), validate],
  handleResendOtp
);

// ── Protected routes ───────────────────────────────────────────────────────────

// GET /api/auth/me
router.get('/me', requireAuth, handleMe);

// POST /api/auth/toggle-2fa  (enable or disable 2FA)
router.post('/toggle-2fa',
  requireAuth,
  [body('enable').isBoolean(), validate],
  handleToggle2FA
);

// POST /api/auth/confirm-2fa-enable  (confirm OTP to finish enabling 2FA)
router.post('/confirm-2fa-enable',
  requireAuth,
  validateOtp,
  handleConfirm2FAEnable
);

export default router;