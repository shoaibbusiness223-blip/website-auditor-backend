import crypto from 'crypto';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// OTP Service
// - Generates a 6-digit OTP, hashes it, stores in otp_codes table
// - Email delivery is handled by Supabase Auth email templates (SMTP)
//   OR you can plug in any email provider (Resend, SendGrid, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export type OtpType = 'email_verification' | 'login_2fa';

function generateOtp(): string {
  // Cryptographically secure 6-digit code
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

  // ── Send email via Supabase Auth (uses your configured SMTP) ──────────────
  // Supabase doesn't have a direct "send custom email" API on the admin client,
  // so we use their OTP sign-in flow to trigger the email, OR send via a
  // transactional email provider. Here we use Supabase's built-in OTP:

  const { error: emailError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      data: {
        otp_code: code,       // embed our code in the link metadata
        otp_type: type,
      },
    },
  });

  if (emailError) {
    // Fallback: log the OTP for development, don't throw in prod
    // In production wire up Resend/SendGrid here instead
    logger.warn('Supabase email send failed — using console fallback', {
      userId,
      type,
      // Only log OTP in development!
      ...(config.isProd ? {} : { otp: code }),
    });

    if (config.isProd) {
      throw new Error('Failed to send OTP email. Please try again.');
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