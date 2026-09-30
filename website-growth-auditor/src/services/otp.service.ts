import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getAdminClient } from '../db/supabase';
import { config } from '../config';
import { sendOtpEmail } from './email.service';
import { OtpPurpose, OtpCodeRow } from '../types';

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function hashCode(code: string, email: string, purpose: OtpPurpose): string {
  return crypto
    .createHmac('sha256', config.otp.ticketSecret)
    .update(`${email}:${purpose}:${code}`)
    .digest('hex');
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function requestOtp(email: string, purpose: OtpPurpose): Promise<void> {
  const db = getAdminClient();
  const normalizedEmail = normalizeEmail(email);

  const { data: existing } = await db
    .from('otp_codes')
    .select('id, last_sent_at')
    .eq('email', normalizedEmail)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Pick<OtpCodeRow, 'id' | 'last_sent_at'>>();

  if (existing) {
    const secondsSinceLastSend = (Date.now() - new Date(existing.last_sent_at).getTime()) / 1000;
    if (secondsSinceLastSend < config.otp.resendCooldownSeconds) {
      const wait = Math.ceil(config.otp.resendCooldownSeconds - secondsSinceLastSend);
      throw new Error(`Please wait ${wait}s before requesting another code`);
    }
    await db.from('otp_codes').delete().eq('id', existing.id);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + config.otp.ttlMinutes * 60_000).toISOString();

  const { error } = await db.from('otp_codes').insert({
    email: normalizedEmail,
    purpose,
    code_hash: hashCode(code, normalizedEmail, purpose),
    max_attempts: config.otp.maxAttempts,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Could not create verification code');

  await sendOtpEmail(normalizedEmail, code, purpose);
}

export async function verifyOtp(email: string, code: string, purpose: OtpPurpose): Promise<string> {
  const db = getAdminClient();
  const normalizedEmail = normalizeEmail(email);

  const { data: row } = await db
    .from('otp_codes')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<OtpCodeRow>();

  if (!row) throw new Error('No active code found — request a new one');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('Code expired — request a new one');
  if (row.attempts >= row.max_attempts) throw new Error('Too many attempts — request a new code');

  const isMatch = hashCode(code, normalizedEmail, purpose) === row.code_hash;

  if (!isMatch) {
    const attempts = row.attempts + 1;
    await db.from('otp_codes').update({ attempts }).eq('id', row.id);
    const remaining = row.max_attempts - attempts;
    throw new Error(
      remaining > 0 ? `Incorrect code — ${remaining} attempt(s) left` : 'Too many attempts — request a new code'
    );
  }

  await db.from('otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);

  return jwt.sign({ email: normalizedEmail, purpose }, config.otp.ticketSecret, {
    expiresIn: `${config.otp.ticketTtlMinutes}m`,
  });
}

export function assertOtpTicket(ticket: string, email: string, purpose: OtpPurpose): void {
  let decoded: { email: string; purpose: OtpPurpose };
  try {
    decoded = jwt.verify(ticket, config.otp.ticketSecret) as typeof decoded;
  } catch {
    throw new Error('Verification expired — please verify your code again');
  }
  if (decoded.email !== normalizeEmail(email) || decoded.purpose !== purpose) {
    throw new Error('Verification does not match this request');
  }
}