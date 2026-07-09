import crypto from 'crypto';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// OTP Service
// - Generates a 6-digit OTP, hashes it, stores in otp_codes table
// - Sends the email directly via Resend API
// ─────────────────────────────────────────────────────────────────────────────

export type OtpType = 'email_verification' | 'login_2fa';

function generateOtp(): string {
  const bytes = crypto.randomBytes(3);
  const num = parseInt(bytes.toString('hex'), 16) % 1000000;
  return num.toString().padStart(6, '0');
}

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function createAndSendOtp(
  userId: string,
  email: string,
  type: OtpType
): Promise<void> {
  const db = getAdminClient();
  const code = generateOtp();
  const hashedCode = hashOtp(code);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000).toISOString();

  // Invalidate any existing unused OTPs of same type for this user
  await db
    .from('otp_codes')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('type', type)
    .eq('used', false);

  // Store new OTP
  const { error } = await db.from('otp_codes').insert({
    user_id: userId,
    email,
    code: hashedCode,
    type,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error('Failed to store OTP', { error: error.message, userId, type });
    throw new Error('Failed to generate OTP');
  }

  // ── Send email directly via Resend API ─────────────────────────────────────
  const subject = type === 'email_verification'
    ? 'Verify your GrowthAuditor account'
    : 'Your GrowthAuditor login code';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GrowthAuditor <onboarding@resend.dev>',
        to: [email],
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${subject}</h2>
            <p style="color: #475569;">Enter this code to continue:</p>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #4f46e5; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #94a3b8; font-size: 13px;">This code expires in ${config.otp.expiryMinutes} minutes.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error('Resend email send failed', { status: response.status, body: errBody, email });

      if (config.isProd) {
        throw new Error('Failed to send verification email. Please try again.');
      }
    }
  } catch (err) {
    logger.error('Resend request failed', {
      errorMessage: err instanceof Error ? err.message : 'non-error-thrown',
      errorName: err instanceof Error ? err.name : typeof err,
      errorRaw: JSON.stringify(err),
      email,
    });
    if (config.isProd) {
      throw new Error('Failed to send verification email. Please try again.');
    }
  }

  logger.info('OTP created and sent', { userId, type, email });
}

export async function verifyOtp(
  userId: string,
  code: string,
  type: OtpType
): Promise<{ valid: boolean; reason?: string }> {
  const db = getAdminClient();
  const hashedCode = hashOtp(code);
  const now = new Date().toISOString();

  // Fetch the most recent unused matching OTP
  const { data: otpRow, error } = await db
    .from('otp_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('used', false)
    .eq('code', hashedCode)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !otpRow) {
    // Check if there's an expired or wrong-code entry so we can give a helpful message
    const { data: anyOtp } = await db
      .from('otp_codes')
      .select('expires_at, used')
      .eq('user_id', userId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!anyOtp) {
      return { valid: false, reason: 'No OTP found. Please request a new one.' };
    }
    if (anyOtp.used) {
      return { valid: false, reason: 'This OTP has already been used.' };
    }
    if (new Date(anyOtp.expires_at) < new Date()) {
      return { valid: false, reason: 'OTP has expired. Please request a new one.' };
    }
    return { valid: false, reason: 'Invalid OTP code.' };
  }

  // Mark as used
  await db.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

  // If this is email verification, mark the user as verified
  if (type === 'email_verification') {
    await db.from('users').update({ email_verified: true }).eq('id', userId);
  }

  logger.info('OTP verified successfully', { userId, type });
  return { valid: true };
}

export async function checkOtpRequired(userId: string): Promise<boolean> {
  const db = getAdminClient();
  const { data } = await db
    .from('users')
    .select('two_fa_enabled')
    .eq('id', userId)
    .single();

  return data?.two_fa_enabled === true;
}