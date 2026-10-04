import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { sendError } from '../utils/response';

// Runs AFTER requireAuth — needs req.user already set.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const email = req.user?.email?.toLowerCase();
  if (!email || !config.admin.emails.includes(email)) {
    sendError(res, 'Admin access required', 403, 'FORBIDDEN');
    return;
  }
  next();
}