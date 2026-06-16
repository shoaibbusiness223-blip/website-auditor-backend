import { Response } from 'express';
import { ApiResponse } from '../types';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, message?: string): void {
  const body: ApiResponse<T> = { success: true, data, ...(message && { message }) };
  res.status(statusCode).json(body);
}

export function sendError(res: Response, error: string, statusCode = 400, code?: string): void {
  const body: ApiResponse<never> = { success: false, error, ...(code && { code }) };
  res.status(statusCode).json(body);
}
