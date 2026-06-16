import { getAnonClient } from '../db/supabase';
import { AuthUser } from '../types';

export async function signUp(email: string, password: string, fullName?: string): Promise<{ user: AuthUser; session: object }> {
  const supabase = getAnonClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) throw new Error(error.message);
  if (!data.user || !data.session) throw new Error('Signup failed — please try again');

  return {
    user: { id: data.user.id, email: data.user.email!, created_at: data.user.created_at },
    session: data.session,
  };
}

export async function signIn(email: string, password: string): Promise<{ user: AuthUser; session: object }> {
  const supabase = getAnonClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw new Error(error.message);
  if (!data.user || !data.session) throw new Error('Login failed');

  return {
    user: { id: data.user.id, email: data.user.email!, created_at: data.user.created_at },
    session: data.session,
  };
}

export async function signOut(token: string): Promise<void> {
  const supabase = getAnonClient();
  await supabase.auth.admin.signOut(token).catch(() => {
    // Best-effort signout
  });
}
