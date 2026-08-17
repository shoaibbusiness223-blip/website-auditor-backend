import { Request, Response } from 'express';
import { getAnonClient, getAdminClient } from '../db/supabase';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

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

    sendSuccess(res, {
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    }, 201, 'Account created successfully.');
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Signup failed. Please try again.';
    logError(err instanceof Error ? err : new Error(String(err)), { handler: 'handleSignup' });
    sendError(res, message, 400, 'SIGNUP_ERROR');
  }
}

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