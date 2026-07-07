import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../db/supabase';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Plan limits — must match public.plan_limits table
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free:   { auditsPerMonth: 3,   hasPdfExport: false, hasActionPlan: false, hasHistory: false, hasApiAccess: false },
  pro:    { auditsPerMonth: 50,  hasPdfExport: true,  hasActionPlan: true,  hasHistory: true,  hasApiAccess: false },
  agency: { auditsPerMonth: 999, hasPdfExport: true,  hasActionPlan: true,  hasHistory: true,  hasApiAccess: true  },
} as const;

export type UserPlan = keyof typeof PLAN_LIMITS;

// ── Middleware: check if user can run another audit this month ────────────────
export async function checkAuditLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const db = getAdminClient();

    // Get user plan + reset monthly count if month changed
    const { data: countData, error: countError } = await db
      .rpc('get_or_reset_audit_count', { uid: userId });

    if (countError) {
      logger.error('Failed to get audit count', { error: countError.message, userId });
      sendError(res, 'Failed to check audit limit', 500);
      return;
    }

    const { data: userRow } = await db
      .from('users')
      .select('plan, plan_expires_at')
      .eq('id', userId)
      .single();

    const plan = (userRow?.plan || 'free') as UserPlan;

    // Check if paid plan has expired → downgrade to free
    let effectivePlan = plan;
    if (plan !== 'free' && userRow?.plan_expires_at) {
      if (new Date(userRow.plan_expires_at) < new Date()) {
        effectivePlan = 'free';
        // Downgrade in DB
        await db.from('users').update({ plan: 'free' }).eq('id', userId);
        logger.info('Plan expired — downgraded to free', { userId });
      }
    }

    const limits = PLAN_LIMITS[effectivePlan];
    const currentCount = countData as number ?? 0;

    if (currentCount >= limits.auditsPerMonth) {
      sendError(
        res,
        `You've used all ${limits.auditsPerMonth} audits for this month on the ${effectivePlan} plan. ` +
        (effectivePlan === 'free' ? 'Upgrade to Pro for 50 audits/month.' : 'Upgrade to Agency for unlimited audits.'),
        403,
        'AUDIT_LIMIT_REACHED'
      );
      return;
    }

    // Attach plan info to request for downstream use
    req.userPlan = effectivePlan;
    req.planLimits = limits;
    next();
  } catch (err) {
    logger.error('checkAuditLimit error', { error: (err as Error).message });
    sendError(res, 'Failed to check audit limit', 500);
  }
}

// ── Middleware: increment audit count after successful audit ──────────────────
export async function incrementAuditCount(userId: string): Promise<void> {
    const db = getAdminClient();
  
    const { error } = await db.rpc('increment_monthly_audit_count', {
      uid: userId,
    });
  
    if (error) {
      throw error;
    }
  }

// ── Middleware: check if user has access to a specific feature ────────────────
export function requireFeature(feature: 'hasPdfExport' | 'hasActionPlan' | 'hasHistory' | 'hasApiAccess') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const db = getAdminClient();

      const { data: userRow } = await db
        .from('users')
        .select('plan')
        .eq('id', userId)
        .single();

      const plan = (userRow?.plan || 'free') as UserPlan;
      const limits = PLAN_LIMITS[plan];

      if (!limits[feature]) {
        const featureNames: Record<string, string> = {
          hasPdfExport:  'PDF export',
          hasActionPlan: 'Action plan',
          hasHistory:    'Audit history',
          hasApiAccess:  'API access',
        };
        sendError(
          res,
          `${featureNames[feature]} is not available on the ${plan} plan. Please upgrade to Pro.`,
          403,
          'FEATURE_GATED'
        );
        return;
      }

      next();
    } catch (err) {
      sendError(res, 'Failed to check feature access', 500);
    }
  };
}

// ── Type augmentation ─────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      userPlan?: UserPlan;
      planLimits?: typeof PLAN_LIMITS[UserPlan];
    }
  }
}