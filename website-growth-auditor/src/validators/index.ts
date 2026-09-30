import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

function runValidation(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendError(res, errors.array()[0].msg as string, 422, 'VALIDATION_ERROR');
    return;
  }
  next();
}

const OTP_PURPOSES = ['signup', 'login', 'reset_password'];

const emailField = body('email').isEmail().normalizeEmail().withMessage('Valid email required');

const strongPasswordField = (field: string) =>
  body(field)
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number');

export const validateAuditRequest = [
  body('url')
    .trim()
    .notEmpty().withMessage('URL is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Must be a valid http/https URL')
    .isLength({ max: 2048 }).withMessage('URL too long'),
  runValidation,
];

export const validateSendOtp = [
  emailField,
  body('purpose').isIn(OTP_PURPOSES).withMessage('Invalid purpose'),
  runValidation,
];

export const validateVerifyOtp = [
  emailField,
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits'),
  body('purpose').isIn(OTP_PURPOSES).withMessage('Invalid purpose'),
  runValidation,
];

export const validateSignup = [
  emailField,
  strongPasswordField('password'),
  body('full_name').optional().trim().isLength({ max: 100 }),
  body('otp_ticket').notEmpty().withMessage('Please verify your email first'),
  runValidation,
];

export const validateLoginPassword = [
  emailField,
  body('password').notEmpty().withMessage('Password is required'),
  runValidation,
];

export const validateLoginComplete = [
  emailField,
  body('password').notEmpty().withMessage('Password is required'),
  body('otp_ticket').notEmpty().withMessage('Please verify your code first'),
  runValidation,
];

export const validateResetPassword = [
  emailField,
  strongPasswordField('new_password'),
  body('otp_ticket').notEmpty().withMessage('Please verify your code first'),
  runValidation,
];