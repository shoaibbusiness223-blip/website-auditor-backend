import crypto from 'crypto';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// OTP Service — EmailJS version
// Backend ONLY generates and stores the code. It does NOT send any email.
// The frontend calls EmailJS directly (client-side) using the code returned
// in the API response, right after signup/resend. This avoids all backend
// email infrastructure entirely — no Resend, no SMTP, no domain, no IPv6 issues.
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

async function ensureUserProfileExists(userId: string, email: string): Promise<void> {
  const db = getAdminClient();
  const { error } = await db.from('users').select('id').eq('id', userId).single();

  if (error) {
    logger.warn('User row missing in public.users — creating it now', { userId, email });
    const { error: insertError } = await db.from('users').insert({ id: userId, email });
    if (insertError) {
      logger.error('Failed to create fallback user profile', { error: insertError.message, userId });
    }
  }
}

/**
 * Generates and stores a new OTP. Returns the PLAIN code so the caller
 * (the API response) can hand it to the frontend, which sends it via EmailJS.
 * The plain code is never logged or persisted anywhere except hashed in the DB.
 */
export async function createOtp(userId: string, email: string, type: OtpType): Promise<string> {
  const db = getAdminClient();

  await ensureUserProfileExists(userId, email);

  const code = generateOtp();
  const hashedCode = hashOtp(code);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000).toISOString();

  await db.from('otp_codes').update({ used: true }).eq('email', email).eq('type', type).eq('used', false);

  const { error } = await db.from('otp_codes').insert({
    user_id: userId,
    email,
    code: hashedCode,
    type,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error('Failed to store OTP in database', { error: error.message, userId, type });
    throw new Error('Failed to generate verification code. Please try again.');
  }

  logger.info('OTP created (email send delegated to frontend)', { userId, type, email });
  return code;
}

export async function verifyOtpCode(
  email: string,
  code: string,
  type: OtpType
): Promise<{ valid: boolean; reason?: string }> {
  const db = getAdminClient();
  const hashedCode = hashOtp(code);
  const now = new Date().toISOString();

  const { data: otpRow, error } = await db
    .from('otp_codes')
    .select('*')
    .eq('email', email)
    .eq('type', type)
    .eq('used', false)
    .eq('code', hashedCode)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !otpRow) {
    const { data: anyOtp } = await db
      .from('otp_codes')
      .select('expires_at, used')
      .eq('email', email)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!anyOtp) {
      return { valid: false, reason: 'No verification code found. Please request a new one.' };
    }
    if (anyOtp.used) {
      return { valid: false, reason: 'This code has already been used.' };
    }
    if (new Date(anyOtp.expires_at) < new Date()) {
      return { valid: false, reason: 'Code has expired. Please request a new one.' };
    }
    return { valid: false, reason: 'Invalid code. Please check and try again.' };
  }

  await db.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

  if (type === 'email_verification') {
    await db.from('users').update({ email_verified: true }).eq('id', otpRow.user_id);
  }

  logger.info('OTP verified successfully', { email, type });
  return { valid: true };
}

export async function checkOtpRequired(userId: string): Promise<boolean> {
  const db = getAdminClient();
  const { data } = await db.from('users').select('two_fa_enabled').eq('id', userId).single();
  return data?.two_fa_enabled === true;
}
