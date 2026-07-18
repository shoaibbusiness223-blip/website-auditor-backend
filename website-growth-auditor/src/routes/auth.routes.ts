import { Router } from 'express';
import {
  handleSignup,
  handleLogin,
  handleVerifyEmail,
  handleResendOtp,
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

router.post('/signup', validateSignup, handleSignup);
router.post('/login', validateLogin, handleLogin);

router.post('/verify-email',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('code').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits'),
    validate,
  ],
  handleVerifyEmail
);

router.post('/resend-otp',
  [body('email').isEmail().withMessage('Valid email required'), validate],
  handleResendOtp
);

router.get('/me', requireAuth, handleMe);

export default router;