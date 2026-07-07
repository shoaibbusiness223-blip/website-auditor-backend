import { Request, Response } from 'express';
import { getAnonClient, getAdminClient } from '../db/supabase';
import { createAndSendOtp, verifyOtp, checkOtpRequired } from '../services/otp.service';
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

    // Send email verification OTP
    await createAndSendOtp(data.user.id, email, 'email_verification');

    sendSuccess(res, {
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
      requiresEmailVerification: true,
    }, 201, 'Account created. Check your email for a 6-digit verification code.');
  } catch (err) {
    logError(err as Error, { handler: 'handleSignup' });
    sendError(res, (err as Error).message, 400, 'SIGNUP_ERROR');
  }
}

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
export async function handleVerifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { user_id, code } = req.body as { user_id: string; code: string };

    const result = await verifyOtp(user_id, code, 'email_verification');
    if (!result.valid) {
      sendError(res, result.reason || 'Invalid OTP', 400, 'INVALID_OTP');
      return;
    }

    sendSuccess(res, { verified: true }, 200, 'Email verified successfully.');
  } catch (err) {
    logError(err as Error, { handler: 'handleVerifyEmail' });
    sendError(res, 'Verification failed', 500);
  }
}

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
export async function handleResendOtp(req: Request, res: Response): Promise<void> {
  try {
    const { user_id, email, type } = req.body as {
      user_id: string; email: string; type: 'email_verification' | 'login_2fa';
    };

    await createAndSendOtp(user_id, email, type);
    sendSuccess(res, { sent: true }, 200, 'OTP sent. Check your email.');
  } catch (err) {
    logError(err as Error, { handler: 'handleResendOtp' });
    sendError(res, (err as Error).message, 500);
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

    // Check if user has 2FA enabled
    const requires2FA = await checkOtpRequired(data.user.id);

    if (requires2FA) {
      // Send 2FA OTP and return a partial session flag
      await createAndSendOtp(data.user.id, email, 'login_2fa');
      sendSuccess(res, {
        requires2FA: true,
        user_id: data.user.id,
        // Don't return the full session yet — user must complete 2FA
      }, 200, 'Check your email for a login verification code.');
      return;
    }

    // No 2FA — return full session
    sendSuccess(res, {
      requires2FA: false,
      user: { id: data.user.id, email: data.user.email, created_at: data.user.created_at },
      session: data.session,
    }, 200);
  } catch (err) {
    logError(err as Error, { handler: 'handleLogin' });
    sendError(res, 'Login failed', 500, 'LOGIN_ERROR');
  }
}

// ── POST /api/auth/verify-2fa ─────────────────────────────────────────────────
export async function handleVerify2FA(req: Request, res: Response): Promise<void> {
  try {
    const { user_id, code } = req.body as { user_id: string; code: string };

    const result = await verifyOtp(user_id, code, 'login_2fa');
    if (!result.valid) {
      sendError(res, result.reason || 'Invalid OTP', 400, 'INVALID_OTP');
      return;
    }

    // Generate a fresh session for the user
    const db = getAdminClient();
    

    // Return the admin-generated session link
    const { data: linkData } = await db.auth.admin.getUserById(user_id);

    sendSuccess(res, {
      verified: true,
      user: {
        id: linkData.user?.id,
        email: linkData.user?.email,
        created_at: linkData.user?.created_at,
      },
    }, 200, '2FA verified. Redirecting...');
  } catch (err) {
    logError(err as Error, { handler: 'handleVerify2FA' });
    sendError(res, 'Verification failed', 500);
  }
}

// ── POST /api/auth/toggle-2fa ─────────────────────────────────────────────────
export async function handleToggle2FA(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { enable } = req.body as { enable: boolean };

    const db = getAdminClient();

    if (enable) {
      // Send a verification OTP first to confirm the user controls the email
      await createAndSendOtp(userId, req.user!.email, 'login_2fa');
      sendSuccess(res, { pending: true }, 200, 'Enter the OTP sent to your email to enable 2FA.');
      return;
    }

    // Disable 2FA
    await db.from('users').update({ two_fa_enabled: false }).eq('id', userId);
    sendSuccess(res, { two_fa_enabled: false }, 200, '2FA disabled.');
  } catch (err) {
    logError(err as Error, { handler: 'handleToggle2FA' });
    sendError(res, 'Failed to update 2FA setting', 500);
  }
}

// ── POST /api/auth/confirm-2fa-enable ─────────────────────────────────────────
export async function handleConfirm2FAEnable(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { code } = req.body as { code: string };

    const result = await verifyOtp(userId, code, 'login_2fa');
    if (!result.valid) {
      sendError(res, result.reason || 'Invalid OTP', 400, 'INVALID_OTP');
      return;
    }

    const db = getAdminClient();
    await db.from('users').update({ two_fa_enabled: true }).eq('id', userId);
    sendSuccess(res, { two_fa_enabled: true }, 200, '2FA enabled successfully.');
  } catch (err) {
    logError(err as Error, { handler: 'handleConfirm2FAEnable' });
    sendError(res, 'Failed to enable 2FA', 500);
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export async function handleMe(req: Request, res: Response): Promise<void> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from('users')
      .select('id, email, full_name, plan, plan_expires_at, audit_count_month, email_verified, two_fa_enabled, created_at')
      .eq('id', req.user!.id)
      .single();

    sendSuccess(res, data);
  } catch (err) {
    logError(err as Error, { handler: 'handleMe' });
    sendError(res, 'Failed to fetch user', 500);
  }
}