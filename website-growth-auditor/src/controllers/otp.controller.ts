import { Request, Response } from 'express';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { OtpPurpose } from '../types';

export async function handleSendOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, purpose } = req.body as { email: string; purpose: OtpPurpose };
    await requestOtp(email, purpose);
    sendSuccess(res, { sent: true }, 200, 'Verification code sent — check your email');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send verification code';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleSendOtp' });
    sendError(res, message, 400, 'OTP_SEND_ERROR');
  }
}

export async function handleVerifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, code, purpose } = req.body as { email: string; code: string; purpose: OtpPurpose };
    const otp_ticket = await verifyOtp(email, code, purpose);
    sendSuccess(res, { otp_ticket }, 200, 'Code verified');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleVerifyOtp' });
    sendError(res, message, 400, 'OTP_VERIFY_ERROR');
  }
}