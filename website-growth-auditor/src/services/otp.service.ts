import { getAnonClient } from '../db/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// OTP Service — Supabase native
// Uses Supabase Auth's built-in email OTP. No custom generation, hashing,
// storage, or email sending — Supabase handles all of it internally.
// This is the simplest possible reliable approach: zero external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a 6-digit OTP code to the given email using Supabase's built-in mailer.
 * shouldCreateUser: false — the user must already exist (created via signUp first).
 */

 export async function sendOtp(email: string): Promise<void> {
  const supabase = getAnonClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    // Log every possible detail so we can see Supabase's real response
    console.error('signInWithOtp raw error:', {
      message: error.message,
      name: error.name,
      status: error.status,
      code: (error as { code?: string }).code,
      full: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    throw new Error(error.message || `Supabase OTP send failed (status ${error.status})`);
  }
}

/**
 * Verifies the 6-digit code the user received by email.
 * On success, returns a full session — the user is now logged in.
 */
export async function verifyOtpCode(
  email: string,
  token: string
): Promise<{ session: { access_token: string; refresh_token: string }; user: { id: string; email: string; created_at: string } }> {
  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Invalid or expired code');
  }

  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    user: {
      id: data.user.id,
      email: data.user.email || email,
      created_at: data.user.created_at,
    },
  };
}
