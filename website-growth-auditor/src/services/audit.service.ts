import { getAdminClient } from '../db/supabase';
import { scrapeWebsite } from './scraper.service';
import { analyzeWithGemini } from './gemini.service';
import { validateAndSanitizeUrl } from '../utils/ssrfGuard';
import { AuditRow } from '../types';
import { logger, logAudit } from '../utils/logger';

export async function runAudit(userId: string, rawUrl: string): Promise<AuditRow> {
  const db = getAdminClient();

  // ── 1. SSRF Guard ─────────────────────────────────────────────────────────
  const guard = await validateAndSanitizeUrl(rawUrl);
  if (!guard.safe) {
    throw new Object({ message: guard.reason, code: 'INVALID_URL', status: 400 });
  }
  const url = guard.url.toString();

  // ── 2. Create audit record (status: pending) ───────────────────────────────
  const { data: audit, error: insertError } = await db
    .from('audits')
    .insert({ user_id: userId, website_url: url, status: 'pending' })
    .select()
    .single();

  if (insertError || !audit) {
    throw new Error('Failed to create audit record');
  }

  const auditId: string = audit.id;
  logAudit('audit_started', { auditId, userId, url });

  try {
    // ── 3. Mark processing ──────────────────────────────────────────────────
    await db.from('audits').update({ status: 'processing' }).eq('id', auditId);

    // ── 4. Scrape website ───────────────────────────────────────────────────
    logger.info(`Scraping ${url}`, { auditId });
    const scraped = await scrapeWebsite(url);

    // ── 5. AI Analysis ──────────────────────────────────────────────────────
    logger.info('Running AI analysis', { auditId });
    const report = await analyzeWithGemini(scraped);

    // ── 6. Save completed report ────────────────────────────────────────────
    const { data: completed, error: updateError } = await db
      .from('audits')
      .update({
        status: 'completed',
        seo_score: report.seo_score,
        conversion_score: report.conversion_score,
        trust_score: report.trust_score,
        copywriting_score: report.copywriting_score,
        overall_score: report.overall_score,
        report_json: report,
        scraped_data: scraped,
      })
      .eq('id', auditId)
      .select()
      .single();

    if (updateError || !completed) {
      throw new Error('Failed to save audit report');
    }

    // ── 7. Increment user audit count ────────────────────────────────────────
    await db.rpc('increment_audit_count', { uid: userId }).catch(() => {
      // Non-critical — don't fail the audit over this
      logger.warn('Failed to increment audit count', { userId });
    });

    logAudit('audit_completed', { auditId, overall_score: report.overall_score });
    return completed as AuditRow;

  } catch (err) {
    // ── Mark failed ──────────────────────────────────────────────────────────
    const message = err instanceof Error ? err.message : 'Unknown error';
    await db.from('audits').update({
      status: 'failed',
      error_message: message,
    }).eq('id', auditId);

    logAudit('audit_failed', { auditId, error: message });
    throw err;
  }
}

export async function getAuditById(auditId: string, userId: string): Promise<AuditRow | null> {
  const db = getAdminClient();
  const { data, error } = await db
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .eq('user_id', userId) // RLS enforcement at service level too
    .single();

  if (error) return null;
  return data as AuditRow;
}

export async function getUserAudits(userId: string, limit = 10, offset = 0): Promise<AuditRow[]> {
  const db = getAdminClient();
  const { data, error } = await db
    .from('audits')
    .select('id, website_url, status, seo_score, conversion_score, trust_score, copywriting_score, overall_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];
  return data as AuditRow[];
}
