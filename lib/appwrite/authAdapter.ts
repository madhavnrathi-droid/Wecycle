'use client';

/* ── Supabase's auth API, answered by Appwrite Accounts ────────────────────
 *
 * The app reads very little off the auth user — `user.id` and `user.email`,
 * and `session.user` — so the shape below is deliberately the real surface in
 * use rather than a reproduction of Supabase's whole user object. Inventing
 * fields nobody reads would be inventing a contract nobody checks.
 *
 * ── PASSWORDS CARRY OVER ───────────────────────────────────────────────────
 *
 * The 99 accounts were imported through Appwrite's POST /users/bcrypt with
 * their original Supabase hashes and their original UUIDs. So signing in uses
 * the password the member already has, and `user.id` is the same string every
 * foreign key in every table already points at. Nobody resets anything and
 * nothing has to be re-keyed.
 *
 * ── onAuthStateChange ──────────────────────────────────────────────────────
 *
 * Appwrite has no event stream for this, so it is emulated: listeners are kept
 * here and fired on the transitions this adapter itself performs. That covers
 * sign-in, sign-out and password change, which is every transition the app can
 * cause. It does NOT cover a session expiring server-side while the tab sits
 * open — Supabase would have reported that and this cannot. The app's own
 * reaction to a failed read is to treat the user as signed out, so the visible
 * behaviour is the same one step later.
 *
 * Like Supabase, the callback fires once immediately with the current state,
 * because AuthContext relies on that for its first render.
 */

import { ID, AppwriteException } from 'appwrite';
import { account } from './client';

export interface AuthUser { id: string; email: string | null; }
export interface AuthSession { user: AuthUser; }
interface AuthResult<T> { data: T; error: { message: string; code?: string; status?: number } | null; }

type Event = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED';
type Listener = (event: Event, session: AuthSession | null) => void;

const listeners = new Set<Listener>();
let current: AuthSession | null = null;

function emit(event: Event, session: AuthSession | null): void {
  current = session;
  for (const l of [...listeners]) {
    /* One listener throwing must not stop the others, and must not take down
       the sign-in that triggered it. */
    try { l(event, session); } catch { /* a subscriber's problem, not ours */ }
  }
}

const err = (e: unknown) => {
  const a = e as AppwriteException;
  return { message: a?.message ?? 'Authentication failed', code: a?.type, status: a?.code };
};

/** Appwrite's account object, as the app expects Supabase's user. */
const toUser = (a: { $id: string; email?: string }): AuthUser => ({
  id: a.$id,
  email: a.email || null,
});

async function currentUser(): Promise<AuthUser | null> {
  try {
    return toUser(await account().get());
  } catch {
    /* No session is the ordinary case for a signed-out visitor, not an error
       worth surfacing — Supabase returns { user: null } here too. */
    return null;
  }
}

export const authAdapter = {
  async getUser(): Promise<AuthResult<{ user: AuthUser | null }>> {
    const user = await currentUser();
    return { data: { user }, error: null };
  },

  async getSession(): Promise<AuthResult<{ session: AuthSession | null }>> {
    const user = await currentUser();
    const session = user ? { user } : null;
    current = session;
    return { data: { session }, error: null };
  },

  async signInWithPassword(
    { email, password }: { email: string; password: string },
  ): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    try {
      /* A stale session makes createEmailPasswordSession fail with "session
         already active" rather than signing the new person in — which reads to
         the user as a wrong password. */
      try { await account().deleteSession({ sessionId: 'current' }); } catch { /* none to clear */ }
      await account().createEmailPasswordSession({ email, password });
      const user = await currentUser();
      const session = user ? { user } : null;
      emit('SIGNED_IN', session);
      return { data: { user, session }, error: null };
    } catch (e) {
      return { data: { user: null, session: null }, error: err(e) };
    }
  },

  async signUp(
    { email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } },
  ): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    try {
      const name = (options?.data?.full_name as string | undefined) ?? undefined;
      await account().create({ userId: ID.unique(), email, password, name });
      await account().createEmailPasswordSession({ email, password });
      const user = await currentUser();
      const session = user ? { user } : null;
      emit('SIGNED_IN', session);
      return { data: { user, session }, error: null };
    } catch (e) {
      return { data: { user: null, session: null }, error: err(e) };
    }
  },

  async signOut(): Promise<{ error: { message: string } | null }> {
    try {
      await account().deleteSession({ sessionId: 'current' });
      emit('SIGNED_OUT', null);
      return { error: null };
    } catch (e) {
      /* Already signed out is the outcome the caller wanted. */
      emit('SIGNED_OUT', null);
      const a = e as AppwriteException;
      return a?.code === 401 ? { error: null } : { error: err(e) };
    }
  },

  async updateUser(
    attrs: { password?: string; email?: string; data?: Record<string, unknown> },
  ): Promise<AuthResult<{ user: AuthUser | null }>> {
    try {
      if (attrs.password) await account().updatePassword({ password: attrs.password });
      const user = await currentUser();
      emit('USER_UPDATED', user ? { user } : null);
      return { data: { user }, error: null };
    } catch (e) {
      return { data: { user: null }, error: err(e) };
    }
  },

  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    /* Supabase fires once on subscribe and AuthContext depends on it for the
       first render, so resolve the real state and deliver it. */
    void (async () => {
      const user = await currentUser();
      current = user ? { user } : null;
      try { cb('INITIAL_SESSION', current); } catch { /* subscriber's problem */ }
    })();
    return { data: { subscription: { unsubscribe: () => { listeners.delete(cb); } } } };
  },

  /* Supabase refreshes tokens on a timer and exposes these so a backgrounded
     native app can stop it. Appwrite's session is a cookie the server ages, so
     there is no timer to start or stop and these are honestly no-ops. */
  startAutoRefresh: async () => {},
  stopAutoRefresh: async () => {},
};

export const currentSession = (): AuthSession | null => current;
