import { Request, Response, NextFunction } from 'express';
import { logRequest } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logRequest(req.method, req.path, res.statusCode, durationMs, req.user?.id);
  });

  next();
}
