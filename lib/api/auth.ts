import { supabase } from '../supabase';

/* ── Auth API ── */

export async function signUp(email: string, password: string, fullName?: string) {
  const initials = (fullName ?? email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || 'W';

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        initials,
      },
    },
  });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithOAuth(provider: 'google' | 'github' | 'apple') {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthStateChange(cb: (event: string, session: import('@supabase/supabase-js').Session | null) => void) {
  return supabase.auth.onAuthStateChange(cb);
}

export async function updateProfile(patch: Partial<{
  username: string;
  full_name: string;
  bio: string;
  role: string;
  phone: string;
  avatar_url: string;
  avatar_color: string;
  initials: string;
  community_id: string;
}>) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');
  return supabase.from('profiles').update(patch).eq('id', user.id).select().single();
}
