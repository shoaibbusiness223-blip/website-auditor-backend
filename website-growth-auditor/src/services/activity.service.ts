import { Request } from 'express';
import { getAdminClient } from '../db/supabase';

export type EventType = 'signup' | 'login' | 'logout';

function getIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || null;
}

export async function logEvent(
  req: Request,
  eventType: EventType,
  userId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
    const db = getAdminClient();
    // Logging failures should never break the actual login/signup/logout —
    // this is a side-effect, not something to bubble an error up for.
    try {
      await db.from('activity_events').insert({
        user_id: userId,
        event_type: eventType,
        metadata: metadata || null,
        ip_address: getIp(req),
        user_agent: req.headers['user-agent'] || null,
      });
    } catch {
      // Intentionally swallowed — see comment above
    }
  }