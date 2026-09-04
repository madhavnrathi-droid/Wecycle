'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchContact } from './liveData';
import type { Profile } from './api/types';
import { getDemoSession, clearDemoSession, onDemoSessionChange, type DemoSession, initialsOf } from './demoAuth';
import { identify as analyticsIdentify, resetIdentity as analyticsReset, track, EVT } from './analytics';
import { clearBlockCache } from './moderation';

/* Admin allow-list — hard-coded by request. Anyone signed in with one of these
   emails gets isAdmin=true and can edit or delete any post regardless of
   ownership, plus the organiser view of any event.

   This list decides what the UI OFFERS. It decides nothing about what the
   server permits: `public.wecycle_admin_emails()` in Supabase is the roster
   that is_wecycle_admin() reads, and that is what the RLS policies on
   listings, requests, events, lost_found_reports and comments actually
   enforce. The two must be kept in step — this copy exists only so the app
   can hide controls that would fail server-side anyway, and a name added here
   alone gets buttons that error rather than powers.

   Server-side the roster is one function; it used to be three copies of the
   same literal list. */
export const ADMIN_EMAILS: ReadonlyArray<string> = [
  'wecycle.page@gmail.com',
  'madhav.n.rathi@gmail.com',
  'madhav.smiblr2024@learner.manipal.edu',   /* Madhav Rathi */
  'vidhi.smiblr2025@learner.manipal.edu',    /* Vidhi Nirzar Shah */
  'kshama.smiblr2024@learner.manipal.edu',   /* kshama */
] as const;
/** Back-compat: callers that only need a single canonical address. */
export const ADMIN_EMAIL = ADMIN_EMAILS[0];
export function isAdminEmail(email?: string | null): boolean {
  const e = (email ?? '').trim().toLowerCase();
  return e !== '' && ADMIN_EMAILS.includes(e);
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /** True when the active session is a local-only demo session (not a real Supabase user). */
  isDemo: boolean;
  /** True when the signed-in user is the wecycle admin account. */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
  isDemo: false,
  isAdmin: false,
});

/* Synthesize a `User`-shaped object from a demo session. */
function demoToUser(d: DemoSession): User {
  return {
    id: d.userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: d.email,
    phone: d.phone,
    app_metadata: { provider: 'demo' },
    user_metadata: { full_name: d.name, initials: initialsOf(d.name) },
    created_at: d.signedInAt,
    updated_at: d.signedInAt,
    /* the remaining fields are nullable / unused by our UI */
  } as unknown as User;
}

function demoToProfile(d: DemoSession): Profile {
  return {
    id: d.userId,
    username: d.email ? d.email.split('@')[0] : null,
    full_name: d.name,
    avatar_url: null,
    avatar_color: d.avatarColor,
    initials: initialsOf(d.name),
    bio: null,
    role: 'Member',
    phone: d.phone ?? null,
    community_id: null,
    badges: [],
    impact_score: 0,
    items_shared_count: 0,
    items_received_count: 0,
    repairs_helped_count: 0,
    co2_saved_kg: 0,
    money_saved: 0,
    is_online: true,
    last_active_at: d.signedInAt,
    joined_at: d.signedInAt,
    updated_at: d.signedInAt,
    college_id: d.collegeId ?? null,
    graduating_year: d.graduatingYear ?? null,
    course: d.course ?? null,
    department: d.department ?? null,
    residence: d.residence ?? null,
  } as unknown as Profile;
}

/* ── Loading the profile of an account that was created a moment ago ────────
 *
 * signUp() hands back a session the instant the auth.users row is written, and
 * onAuthStateChange fires immediately — so the very first select of the
 * profiles row is a race it can lose. The row is created by the
 * handle_new_auth_user trigger, and supabase-js may still be presenting the
 * previous (anon) token when the request goes out, either of which returns
 * nothing.
 *
 * One miss used to be PERMANENT. The failure path logged and returned without
 * ever calling setProfile, so `profile` stayed null for the rest of the
 * session: the member landed on an Account screen with every field blank and
 * typed their name, college and phone in again — reported as "on sign up my
 * details didn't appear on my profile, I had to re-enter it". The data was
 * never lost; checked in production, every signup has its name and college on
 * both the metadata and the profile row. It just was not read back.
 *
 * So: retry, briefly and with backoff. Five attempts over about four seconds
 * covers the race without hammering a genuinely missing row. */
const PROFILE_LOAD_ATTEMPTS = 5;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  /* Bumped on every fresh load and on reset, so in-flight retries can tell
     whether they are still the current request. */
  const loadGenRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const loadRealProfile = async (uid: string, attempt = 0, gen?: number) => {
    /* Generation guard: a sign-out, or a different user signing in, bumps the
       counter so any retry still in flight abandons instead of writing a stale
       profile over the new one. */
    const myGen = gen ?? ++loadGenRef.current;
    /* email/phone are column-locked at the DB; select every other column
       explicitly (a bare `*` would hit the revoked columns and 400), then
       hydrate the OWN row's contact via the get_contact RPC so the rest of the
       app keeps reading profile.email / profile.phone unchanged. */
    const cols =
      'id, username, full_name, avatar_url, avatar_color, initials, bio, role, ' +
      'community_id, badges, impact_score, items_shared_count, items_received_count, ' +
      'repairs_helped_count, co2_saved_kg, money_saved, is_online, last_active_at, ' +
      'joined_at, updated_at, college_id, college, graduating_year, course, department, residence, ' +
      'contact_email_enabled, contact_whatsapp_enabled, show_online_status, allow_dms, ' +
      'show_phone_on_profile, hide_listings_from_search, notification_prefs, theme, ' +
      'larger_text, hide_prices_on_feed';
    /* Run the profile select and the contact RPC in parallel — they're
       independent, so there's no reason to await one before the other. */
    const [{ data, error }, contact] = await Promise.all([
      supabase.from('profiles').select(cols).eq('id', uid).single(),
      fetchContact(uid),
    ]);
    /* A failed profile load used to return in silence, which is indistinguishable
       from a signed-in user who simply has no name: the greeting quietly falls
       back to the email local-part and every profile-driven preference reverts
       to its default. Say so, or the next person to hit this has nothing to go on. */
    if (loadGenRef.current !== myGen) return;   /* superseded while awaiting */

    if (!data) {
      if (attempt + 1 < PROFILE_LOAD_ATTEMPTS) {
        const delay = 250 * 2 ** attempt;      /* 250ms → 2s, ~3.75s total */
        setTimeout(() => {
          if (loadGenRef.current !== myGen) return;
          void loadRealProfile(uid, attempt + 1, myGen);
        }, delay);
        return;
      }
      /* Out of attempts. Say so — a silent failure here is indistinguishable
         from a signed-in member who simply has no name, and every
         profile-driven preference quietly reverts to its default. */
      // eslint-disable-next-line no-console
      console.error('[wecycle] profile load failed for', uid, 'after',
        PROFILE_LOAD_ATTEMPTS, 'attempts', error);
      return;
    }
    setProfile({
      ...(data as unknown as Record<string, unknown>),
      email: contact.email ?? null,
      phone: contact.phone ?? null,
    } as unknown as Profile);
  };

  const refreshProfile = async () => {
    if (isDemo) return; // demo profile derives from localStorage
    if (user) await loadRealProfile(user.id);
  };

  const applyDemoSession = (d: DemoSession) => {
    setIsDemo(true);
    setUser(demoToUser(d));
    setProfile(demoToProfile(d));
    setSession(null);
  };

  const reset = () => {
    loadGenRef.current++;   /* abandon any profile retry still pending */
    setIsDemo(false);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const signOut = async () => {
    track(EVT.sign_out, { is_demo: isDemo });
    analyticsReset();
    /* Per-account in-memory caches must not leak into the next session on
       this device (e.g. a different user signing in would inherit the
       previous user's block list until a refetch). */
    clearBlockCache();
    if (isDemo) {
      clearDemoSession();
      reset();
      return;
    }
    await supabase.auth.signOut();
  };

  /* Initial load + Supabase listener */
  useEffect(() => {
    let mounted = true;

    /* Demo session takes priority */
    const demo = getDemoSession();
    if (demo) {
      applyDemoSession(demo);
      setLoading(false);
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        /* Safe to call directly: this is the getSession() promise, not the
           onAuthStateChange callback, so no auth lock is held. */
        if (data.session?.user) void loadRealProfile(data.session.user.id);
        setLoading(false);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      /* Only react to real Supabase changes when we're not in demo mode */
      if (getDemoSession()) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        /* Deferred out of the callback ON PURPOSE, not for tidiness.
         *
         * supabase-js holds its auth lock for the duration of this callback,
         * and calling another supabase method from inside it can block on that
         * lock or go out carrying the previous token. Supabase's own guidance
         * is to never await other client calls here. This was called inline —
         * which is the likeliest reason the first profile read after signUp
         * came back empty, and why a brand-new member saw an Account screen
         * with every field blank and retyped details that were already saved.
         *
         * A zero timeout is enough: it lets the auth event finish and the lock
         * release before the query is issued. */
        const uid = newSession.user.id;
        setTimeout(() => { void loadRealProfile(uid); }, 0);
      } else {
        setProfile(null);
      }
    });

    /* React to demo session changes (sign in / sign out) */
    const unsub = onDemoSessionChange(() => {
      const d = getDemoSession();
      if (d) {
        applyDemoSession(d);
      } else {
        reset();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = !isDemo && isAdminEmail(user?.email);

  /* Identify the current user into every analytics destination whenever
   * auth state stabilises. Fires once per (uid + adminness + demoness)
   * change — re-running on profile reloads is cheap and idempotent. */
  useEffect(() => {
    if (!user) return;
    analyticsIdentify({
      userId: user.id,
      displayName: profile?.full_name ?? (user.email ? user.email.split('@')[0] : undefined),
      email: user.email ?? undefined,
      isAdmin,
      isDemo,
    });
  }, [user, profile?.full_name, isAdmin, isDemo]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile, signOut, isDemo, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
