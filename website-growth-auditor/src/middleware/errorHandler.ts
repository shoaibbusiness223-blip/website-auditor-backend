import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';
import { sendError } from '../utils/response';
import { config } from '../config';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logError(err, { path: req.path, method: req.method });

  const message = config.isProd ? 'Internal server error' : err.message;
  sendError(res, message, 500, 'INTERNAL_ERROR');
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route ${req.method} ${req.path} not found`, 404, 'NOT_FOUND');
}
