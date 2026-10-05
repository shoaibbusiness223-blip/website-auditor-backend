import { getAdminClient } from '../db/supabase';

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  return days;
}

function groupByDay(rows: { created_at: string }[], days: string[]): { day: string; count: number }[] {
  const counts: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (day in counts) counts[day] += 1;
  }
  return days.map((day) => ({ day, count: counts[day] }));
}

export async function getAdminStats() {
  const db = getAdminClient();
  const days = lastNDays(30);
  const since = `${days[0]}T00:00:00.000Z`;

  const [{ count: totalUsers }, { count: totalAudits }, { data: recentSignups }, { data: recentAudits }, { data: activeUserRows }] =
    await Promise.all([
      db.from('users').select('id', { count: 'exact', head: true }),
      db.from('audits').select('id', { count: 'exact', head: true }),
      db.from('users').select('created_at').gte('created_at', since),
      db.from('audits').select('created_at').gte('created_at', since),
      db.from('audits').select('user_id').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

  const activeUsersLast7Days = new Set((activeUserRows || []).map((r) => r.user_id)).size;

  return {
    totalUsers: totalUsers || 0,
    totalAudits: totalAudits || 0,
    activeUsersLast7Days,
    signupsPerDay: groupByDay(recentSignups || [], days),
    auditsPerDay: groupByDay(recentAudits || [], days),
  };
}

export async function getUsersList(page: number, search: string) {
  const db = getAdminClient();
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db
    .from('users')
    .select('id, email, full_name, plan, audit_count, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search.trim()) {
    query = query.ilike('email', `%${search.trim()}%`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { users: data || [], total: count || 0, page, pageSize };
}

export async function getRecentAudits(limit: number) {
  const db = getAdminClient();
  const { data, error } = await db
    .from('audits')
    .select('id, website_url, status, overall_score, created_at, users(email)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getUserDetail(userId: string) {
  const db = getAdminClient();

  const [{ data: profile }, { data: audits }, { data: events }] = await Promise.all([
    db.from('users').select('*').eq('id', userId).single(),
    db.from('audits')
      .select('id, website_url, status, overall_score, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    db.from('activity_events')
      .select('event_type, metadata, ip_address, user_agent, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return { profile, audits: audits || [], events: events || [] };
}

export async function getTopAuditedUrls(limit: number) {
  const db = getAdminClient();
  const { data } = await db
    .from('audits')
    .select('website_url')
    .order('created_at', { ascending: false })
    .limit(500);

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.website_url] = (counts[row.website_url] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url, count]) => ({ url, count }));
}

export async function getSignupSources() {
  const db = getAdminClient();
  const { data } = await db.from('users').select('signup_source');

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const source = row.signup_source || 'direct';
    counts[source] = (counts[source] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
}