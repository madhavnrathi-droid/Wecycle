'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './api/types';
import { getDemoSession, clearDemoSession, onDemoSessionChange, type DemoSession, initialsOf } from './demoAuth';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /** True when the active session is a local-only demo session (not a real Supabase user). */
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
  isDemo: false,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  const loadRealProfile = async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (data) setProfile(data);
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
    setIsDemo(false);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const signOut = async () => {
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
        if (data.session?.user) loadRealProfile(data.session.user.id);
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
        loadRealProfile(newSession.user.id);
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

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile, signOut, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
