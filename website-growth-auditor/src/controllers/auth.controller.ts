import { Request, Response } from 'express';
import { getAnonClient, getAdminClient } from '../db/supabase';
import { assertOtpTicket, requestOtp } from '../services/otp.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function handleSignup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, full_name, otp_ticket } = req.body as {
      email: string; password: string; full_name?: string; otp_ticket: string;
    };

    assertOtpTicket(otp_ticket, email, 'signup');

    const db = getAdminClient();
    const normalizedEmail = email.toLowerCase().trim();

    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      sendError(res, 'An account with this email already exists', 409, 'EMAIL_TAKEN');
      return;
    }

    const { data, error } = await db.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error || !data.user) {
      sendError(res, error?.message || 'Signup failed', 400, 'SIGNUP_ERROR');
      return;
    }

    const anon = getAnonClient();
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !signInData.session) {
      sendSuccess(res, { user: { id: data.user.id, email: data.user.email }, session: null },
        201, 'Account created — please log in.');
      return;
    }

    sendSuccess(res, {
      user: { id: data.user.id, email: data.user.email },
      session: signInData.session,
    }, 201, 'Account created successfully.');
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Signup failed. Please try again.';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleSignup' });
    sendError(res, message, 400, 'SIGNUP_ERROR');
  }
}

export async function handleLoginPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const anon = getAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      sendError(res, 'Invalid email or password', 401, 'LOGIN_ERROR');
      return;
    }

    if (data.session?.access_token) {
      const db = getAdminClient();
      await db.auth.admin.signOut(data.session.access_token).catch(() => {});
    }

    await requestOtp(email, 'login');

    sendSuccess(res, { otp_required: true }, 200, 'Enter the code sent to your email');
  } catch (err) {
    logError(err as Error, { handler: 'handleLoginPassword' });
    sendError(res, 'Login failed', 500, 'LOGIN_ERROR');
  }
}

export async function handleLoginComplete(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, otp_ticket } = req.body as {
      email: string; password: string; otp_ticket: string;
    };

    assertOtpTicket(otp_ticket, email, 'login');

    const anon = getAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      sendError(res, 'Invalid email or password', 401, 'LOGIN_ERROR');
      return;
    }

    sendSuccess(res, {
      user: { id: data.user.id, email: data.user.email, created_at: data.user.created_at },
      session: data.session,
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleLoginComplete' });
    sendError(res, message, 401, 'LOGIN_ERROR');
  }
}

export async function handleResetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email, new_password, otp_ticket } = req.body as {
      email: string; new_password: string; otp_ticket: string;
    };

    assertOtpTicket(otp_ticket, email, 'reset_password');

    const db = getAdminClient();
    const normalizedEmail = email.toLowerCase().trim();

    const { data: profile } = await db
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!profile) {
      sendSuccess(res, { reset: true }, 200, 'If that account exists, its password has been updated.');
      return;
    }

    const { error } = await db.auth.admin.updateUserById(profile.id, { password: new_password });
    if (error) {
      sendError(res, error.message, 400, 'RESET_ERROR');
      return;
    }

    sendSuccess(res, { reset: true }, 200, 'Password updated — you can now log in.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Password reset failed';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleResetPassword' });
    sendError(res, message, 400, 'RESET_ERROR');
  }
}

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