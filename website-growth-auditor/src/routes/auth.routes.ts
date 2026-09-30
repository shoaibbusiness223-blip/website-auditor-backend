import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  handleSignup,
  handleLoginPassword,
  handleLoginComplete,
  handleResetPassword,
  handleMe,
} from '../controllers/auth.controller';
import { handleSendOtp, handleVerifyOtp } from '../controllers/otp.controller';
import {
  validateSignup,
  validateLoginPassword,
  validateLoginComplete,
  validateSendOtp,
  validateVerifyOtp,
  validateResetPassword,
} from '../validators';
import { requireAuth } from '../middleware/auth';

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many code requests — try again later', code: 'OTP_RATE_LIMITED' },
});

router.post('/otp/send', otpLimiter, validateSendOtp, handleSendOtp);
router.post('/otp/verify', otpLimiter, validateVerifyOtp, handleVerifyOtp);

router.post('/signup', validateSignup, handleSignup);
router.post('/login', validateLoginPassword, handleLoginPassword);
router.post('/login/complete', validateLoginComplete, handleLoginComplete);
router.post('/reset-password', validateResetPassword, handleResetPassword);

router.get('/me', requireAuth, handleMe);

export default router;