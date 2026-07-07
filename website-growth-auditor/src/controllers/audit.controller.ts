import { Request, Response } from 'express';
import { runAudit, getAuditById, getUserAudits } from '../services/audit.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { getAdminClient } from '../db/supabase';
import { PLAN_LIMITS, UserPlan } from '../middleware/planEnforcement';

export async function handleRunAudit(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body as { url: string };
    const userId = req.user!.id;
    const plan = (req.userPlan || 'free') as UserPlan;

    const audit = await runAudit(userId, url);

    // Increment monthly audit count
    const db = getAdminClient();

const { error } = await db.rpc('increment_monthly_audit_count', {
  uid: userId,
});

if (error) {
  console.warn('Failed to increment monthly audit count:', error.message);
}

    // Gate action plan for free users — strip it from response
    if (audit.report_json && !PLAN_LIMITS[plan].hasActionPlan) {
      audit.report_json = {
        ...audit.report_json,
        action_plan: [], // empty — frontend shows upgrade prompt
      };
    }

    sendSuccess(res, { ...audit, plan_limits: PLAN_LIMITS[plan] }, 201);
  } catch (err) {
    const error = err as Error & { code?: string; status?: number };
    logError(error, { handler: 'handleRunAudit', url: req.body.url });
    sendError(res, error.message || 'Audit failed', error.status || 500, error.code || 'AUDIT_ERROR');
  }
}

export async function handleGetAudit(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const plan = (req.userPlan || 'free') as UserPlan;

    const audit = await getAuditById(id, userId);
    if (!audit) {
      sendError(res, 'Audit not found', 404, 'NOT_FOUND');
      return;
    }

    // Gate action plan for free users
    if (audit.report_json && !PLAN_LIMITS[plan].hasActionPlan) {
      audit.report_json = { ...audit.report_json, action_plan: [] };
    }

    sendSuccess(res, { ...audit, plan_limits: PLAN_LIMITS[plan] });
  } catch (err) {
    logError(err as Error, { handler: 'handleGetAudit' });
    sendError(res, 'Failed to fetch audit', 500);
  }
}

export async function handleListAudits(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const plan = (req.userPlan || 'free') as UserPlan;
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
    const offset = parseInt(req.query.offset as string || '0', 10);

    // Free users only see last 3 audits
    const effectiveLimit = PLAN_LIMITS[plan].hasHistory ? limit : 3;
    const audits = await getUserAudits(userId, effectiveLimit, offset);

    sendSuccess(res, {
      audits,
      limit: effectiveLimit,
      offset,
      plan_limits: PLAN_LIMITS[plan],
    });
  } catch (err) {
    logError(err as Error, { handler: 'handleListAudits' });
    sendError(res, 'Failed to fetch audits', 500);
  }
}