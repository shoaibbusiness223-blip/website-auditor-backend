import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// ─── Admin client (service role — only use server-side, never expose to frontend)
let _adminClient: SupabaseClient | null = null;
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}

// ─── Anon client (for validating user JWTs)
let _anonClient: SupabaseClient | null = null;
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return _anonClient;
}
