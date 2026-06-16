import { Request, Response } from 'express';
import { runAudit, getAuditById, getUserAudits } from '../services/audit.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function handleRunAudit(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body as { url: string };
    const userId = req.user!.id;

    const audit = await runAudit(userId, url);
    sendSuccess(res, audit, 201, 'Audit completed successfully');
  } catch (err) {
    const error = err as Error & { code?: string; status?: number };
    logError(error, { handler: 'handleRunAudit', url: req.body.url });

    const statusCode = error.status || 500;
    const message = error.message || 'Audit failed — please try again';
    sendError(res, message, statusCode, error.code || 'AUDIT_ERROR');
  }
}

export async function handleGetAudit(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const audit = await getAuditById(id, userId);
    if (!audit) {
      sendError(res, 'Audit not found', 404, 'NOT_FOUND');
      return;
    }

    sendSuccess(res, audit);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetAudit' });
    sendError(res, 'Failed to fetch audit', 500);
  }
}

export async function handleListAudits(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const audits = await getUserAudits(userId, limit, offset);
    sendSuccess(res, { audits, limit, offset });
  } catch (err) {
    logError(err as Error, { handler: 'handleListAudits' });
    sendError(res, 'Failed to fetch audits', 500);
  }
}
