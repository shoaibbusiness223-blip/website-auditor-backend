import { Request, Response, NextFunction } from 'express';
import { getAnonClient } from '../db/supabase';
import { sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
      return;
    }

    const token = authHeader.split(' ')[1];

    // ── Validate JWT via Supabase (handles expiry, signature, revocation)
    const supabase = getAnonClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      sendError(res, 'Invalid or expired token', 401, 'UNAUTHORIZED');
      return;
    }

    // ── Attach user to request
    req.user = {
      id: user.id,
      email: user.email!,
      created_at: user.created_at,
    };

    next();
  } catch (err) {
    logError(err as Error, { middleware: 'requireAuth' });
    sendError(res, 'Authentication failed', 500, 'AUTH_ERROR');
  }
}
