import axios from 'axios';
import { config } from '../config';
import { logError } from '../utils/logger';
import { OtpPurpose } from '../types';

const SUBJECTS: Record<OtpPurpose, string> = {
  signup: 'Verify your email',
  login: 'Your login verification code',
  reset_password: 'Reset your password',
};

const INTROS: Record<OtpPurpose, string> = {
  signup: 'Use this code to finish creating your account.',
  login: 'Use this code to finish logging in.',
  reset_password: 'Use this code to reset your password.',
};

export async function sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
  const subject = SUBJECTS[purpose];
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 4px;">${subject}</h2>
      <p style="color: #555;">${INTROS[purpose]}</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${code}</p>
      <p style="color: #888; font-size: 13px;">
        This code expires in ${config.otp.ttlMinutes} minutes. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from: config.email.fromAddress, to: [email], subject, html },
      {
        headers: {
          Authorization: `Bearer ${config.email.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), { service: 'email.service', purpose });
    throw new Error('Failed to send verification email. Please try again shortly.');
  }
}