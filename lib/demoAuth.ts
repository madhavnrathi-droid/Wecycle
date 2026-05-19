/**
 * Demo auth — short-circuits Supabase OTP verification.
 *
 * In production we'd:
 *   - configure SMTP / SMS providers in Supabase
 *   - let `supabase.auth.verifyOtp` validate real codes
 *
 * For development / demo we accept any 6-digit code, persist the user
 * identity in localStorage, and synthesize a session that the rest of
 * the app reads via `useAuth()`.
 *
 * Remove this file (and the calls into it) once real OTP is wired.
 */

const KEY = 'wecycle.demoSession.v1';
const EVENT = 'wecycle-auth-change';

export type Residence = 'day_scholar' | 'hosteler';

export interface DemoSession {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  collegeId: string;
  avatarColor: string;
  signedInAt: string;
  /* optional profile fields */
  graduatingYear?: number;
  course?: string;
  department?: string;
  residence?: Residence;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pickColor(name: string): string {
  const palette = ['#6C63FF', '#FF6B80', '#3DD6F5', '#A8DD00', '#FF9A40', '#C084FC', '#22C55E'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

export function createDemoSession(input: {
  name: string;
  email?: string;
  phone?: string;
  collegeId: string;
}): DemoSession {
  const session: DemoSession = {
    userId: uuid(),
    name: input.name.trim(),
    email: input.email?.trim(),
    phone: input.phone?.trim(),
    collegeId: input.collegeId.trim(),
    avatarColor: pickColor(input.name),
    signedInAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(EVENT));
  }
  return session;
}

export function updateDemoSession(patch: Partial<DemoSession>): DemoSession | null {
  const current = getDemoSession();
  if (!current) return null;
  const next: DemoSession = { ...current, ...patch };
  if (patch.name) next.avatarColor = pickColor(patch.name);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  }
  return next;
}

export function clearDemoSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onDemoSessionChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── department options ──────────────────────────────── */
export const DEPARTMENTS = [
  { id: 'mit',   label: 'MIT',   description: 'Manipal Institute of Technology' },
  { id: 'smi',   label: 'SMI',   description: 'School of Information Sciences' },
  { id: 'dlhs',  label: 'DLHS',  description: 'Dept. of Lifestyle & Health Sciences' },
  { id: 'mirm',  label: 'MIRM',  description: 'Manipal Institute of Regenerative Medicine' },
  { id: 'tapmi', label: 'TAPMI', description: 'T. A. Pai Management Institute' },
  { id: 'mls',   label: 'MLS',   description: 'Manipal Life Sciences' },
  { id: 'doc',   label: 'DOC',   description: 'Department of Commerce' },
];
