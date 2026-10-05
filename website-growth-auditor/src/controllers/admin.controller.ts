import { Request, Response } from 'express';
import {
  getAdminStats,
  getUsersList,
  getRecentAudits,
  getUserDetail,
  getTopAuditedUrls,
  getSignupSources,
} from '../services/admin.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export async function handleGetStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getAdminStats();
    sendSuccess(res, stats);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetStats' });
    sendError(res, 'Failed to load stats', 500);
  }
}

export async function handleGetUsers(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const search = (req.query.search as string) || '';
    const result = await getUsersList(page, search);
    sendSuccess(res, result);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetUsers' });
    sendError(res, 'Failed to load users', 500);
  }
}

export async function handleGetAudits(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const audits = await getRecentAudits(limit);
    sendSuccess(res, audits);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetAudits' });
    sendError(res, 'Failed to load audits', 500);
  }
}

export async function handleGetUserDetail(req: Request, res: Response): Promise<void> {
  try {
    const detail = await getUserDetail(req.params.id);
    sendSuccess(res, detail);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetUserDetail' });
    sendError(res, 'Failed to load user detail', 500);
  }
}

export async function handleGetTopUrls(_req: Request, res: Response): Promise<void> {
  try {
    const urls = await getTopAuditedUrls(20);
    sendSuccess(res, urls);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetTopUrls' });
    sendError(res, 'Failed to load top URLs', 500);
  }
}

export async function handleGetSignupSources(_req: Request, res: Response): Promise<void> {
  try {
    const sources = await getSignupSources();
    sendSuccess(res, sources);
  } catch (err) {
    logError(err as Error, { handler: 'handleGetSignupSources' });
    sendError(res, 'Failed to load signup sources', 500);
  }
}