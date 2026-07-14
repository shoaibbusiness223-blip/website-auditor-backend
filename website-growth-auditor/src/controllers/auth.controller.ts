import { Request, Response } from 'express';
import { getAnonClient, getAdminClient } from '../db/supabase';
import { sendOtp, verifyOtpCode } from '../services/otp.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
export async function handleSignup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, full_name } = req.body as {
      email: string; password: string; full_name?: string;
    };

    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });

    if (error || !data.user) {
      sendError(res, error?.message || 'Signup failed', 400, 'SIGNUP_ERROR');
      return;
    }

    // Send OTP via Supabase's own mailer — no custom email code needed.
    // Non-blocking: if this fails, the user can still hit "resend" later.
    sendOtp(email).catch((otpErr) => {
      logError(otpErr instanceof Error ? otpErr : new Error(String(otpErr)), {
        handler: 'handleSignup:sendOtp',
        email,
      });
    });

    sendSuccess(res, {
      user: { id: data.user.id, email: data.user.email },
      requiresEmailVerification: true,
    }, 201, 'Account created. Check your email for a 6-digit code.');
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Signup failed. Please try again.';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleSignup' });
    sendError(res, message, 400, 'SIGNUP_ERROR');
  }
}

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
// Body: { email, code } — verifies OTP and returns a full session
export async function handleVerifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email, code } = req.body as { email: string; code: string };

    const result = await verifyOtpCode(email, code);

    sendSuccess(res, result, 200, 'Email verified successfully.');
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleVerifyEmail' });
    sendError(res, err instanceof Error ? err.message : 'Verification failed', 400, 'INVALID_OTP');
  }
}

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
export async function handleResendOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as { email: string };

    await sendOtp(email);
    sendSuccess(res, { sent: true }, 200, 'Code sent. Check your email.');
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleResendOtp' });
    sendError(res, err instanceof Error ? err.message : 'Failed to resend code', 500);
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      sendError(res, 'Invalid email or password', 401, 'LOGIN_ERROR');
      return;
    }

    sendSuccess(res, {
      user: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
      },
      session: data.session,
    }, 200);
  } catch (err) {
    logError(err as Error, { handler: 'handleLogin' });
    sendError(res, 'Login failed', 500, 'LOGIN_ERROR');
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export async function handleMe(req: Request, res: Response): Promise<void> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from('users')
      .select('id, email, full_name, plan, plan_expires_at, audit_count_month, created_at')
      .eq('id', req.user!.id)
      .single();

    sendSuccess(res, data);
  } catch (err) {
    logError(err as Error, { handler: 'handleMe' });
    sendError(res, 'Failed to fetch user', 500);
  }
}
