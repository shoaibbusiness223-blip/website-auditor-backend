import { Request, Response } from 'express';
import { signUp, signIn } from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function handleSignup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, full_name } = req.body as {
      email: string;
      password: string;
      full_name?: string;
    };

    const result = await signUp(email, password, full_name);
    sendSuccess(res, result, 201, 'Account created. Check your email to confirm.');
  } catch (err) {
    logError(err as Error, { handler: 'handleSignup' });
    sendError(res, (err as Error).message, 400, 'SIGNUP_ERROR');
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await signIn(email, password);
    sendSuccess(res, result, 200);
  } catch (err) {
    logError(err as Error, { handler: 'handleLogin' });
    sendError(res, 'Invalid email or password', 401, 'LOGIN_ERROR');
  }
}

export function handleMe(req: Request, res: Response): void {
  sendSuccess(res, req.user);
}
