/**
 * Alerts API — hybrid backend.
 *
 *   • Real users (regular Supabase session) → reads/writes the `alerts`
 *     table over RLS. Realtime updates via postgres_changes.
 *   • Demo users (lib/demoAuth session)     → localStorage fallback so
 *     the dev/preview flow keeps working without a real auth.users row.
 *
 * Caller decides which path by passing `mode`:
 *   listAlerts({ userId, mode: 'supabase' })
 *   createAlert({ ..., mode: 'demo' })
 *
 * The expiry/matching/inbox-fanout cron + triggers live server-side
 * (migrations 17–19) so they only fire for the Supabase path.
 */

import { supabase } from './supabase';
import type { Database } from './database.types';

/* ── public types ─────────────────────────────────────────── */

export type NotifyChannel = Database['public']['Enums']['notify_channel'];
export type AlertStatus   = Database['public']['Enums']['alert_status'];
export type AlertCondition = 'any' | 'like_new' | 'good' | 'fair';

export type StorageMode = 'supabase' | 'demo';

export interface WecycleAlert {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  condition?: AlertCondition;
  maxPrice?: number;
  locationPref?: string;
  notify: NotifyChannel;
  durationHours: number;
  createdAt: string;
  expiresAt: string;
  status: AlertStatus;
  matchCount: number;
}

export interface CreateAlertInput {
  userId: string;
  title: string;
  description: string;
  category: string;
  condition?: AlertCondition;
  maxPrice?: number;
  locationPref?: string;
  notify: NotifyChannel;
  durationHours: number;
}

/* ── shared constants ─────────────────────────────────────── */

export const DURATION_OPTIONS = [
  { hours: 2,   label: '2 hours' },
  { hours: 6,   label: '6 hours' },
  { hours: 24,  label: '1 day' },
  { hours: 72,  label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 240, label: '10 days' },
];

export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_HOURS = 240;

/* ── row mappers (db row ↔ app shape) ─────────────────────── */

type AlertRow = Database['public']['Tables']['alerts']['Row'];

function rowToAlert(r: AlertRow): WecycleAlert {
  return {
    id:            r.id,
    userId:        r.user_id,
    title:         r.title,
    description:   r.description,
    category:      r.category_id ?? '',
    condition:    (r.condition ?? undefined) as AlertCondition | undefined,
    maxPrice:      r.max_price ?? undefined,
    locationPref:  r.location_pref ?? undefined,
    notify:        r.notify,
    durationHours: r.duration_hours,
    createdAt:     r.created_at,
    expiresAt:     r.expires_at,
    status:        r.status,
    matchCount:    r.match_count,
  };
}

function alertToInsert(a: CreateAlertInput, createdAt: Date, expiresAt: Date) {
  /* category id is stored lowercase in `categories.id` */
  const categoryId = a.category ? a.category.toLowerCase() : null;
  return {
    user_id:        a.userId,
    title:          a.title.trim(),
    description:    a.description.trim(),
    category_id:    categoryId,
    condition:      a.condition && a.condition !== 'any' ? a.condition : null,
    max_price:      a.maxPrice ?? null,
    location_pref:  a.locationPref?.trim() || null,
    notify:         a.notify,
    duration_hours: a.durationHours,
    created_at:     createdAt.toISOString(),
    expires_at:     expiresAt.toISOString(),
  };
}

/* ════════════════════════════════════════════════════════════
   SUPABASE BACKEND
   ════════════════════════════════════════════════════════════ */

async function supabaseList(userId: string): Promise<WecycleAlert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAlert);
}

async function supabaseCreate(input: CreateAlertInput): Promise<WecycleAlert> {
  const created  = new Date();
  const expires  = new Date(created.getTime() + input.durationHours * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('alerts')
    .insert(alertToInsert(input, created, expires))
    .select()
    .single();
  if (error) throw error;
  return rowToAlert(data);
}

async function supabaseUpdate(id: string, patch: Partial<CreateAlertInput>): Promise<WecycleAlert | null> {
  /* If durationHours changed, recompute expires_at from the original created_at. */
  let expires_at: string | undefined;
  if (patch.durationHours) {
    const { data: existing } = await supabase
      .from('alerts')
      .select('created_at')
      .eq('id', id)
      .single();
    if (existing?.created_at) {
      expires_at = new Date(
        new Date(existing.created_at).getTime() + patch.durationHours * 60 * 60 * 1000,
      ).toISOString();
    }
  }

  const updatePayload: Partial<AlertRow> = {};
  if (patch.title)        updatePayload.title = patch.title.trim();
  if (patch.description)  updatePayload.description = patch.description.trim();
  if (patch.category)     updatePayload.category_id = patch.category.toLowerCase();
  if (patch.condition !== undefined) {
    updatePayload.condition = patch.condition === 'any' ? null : patch.condition;
  }
  if (patch.maxPrice !== undefined)    updatePayload.max_price = patch.maxPrice ?? null;
  if (patch.locationPref !== undefined) updatePayload.location_pref = patch.locationPref?.trim() || null;
  if (patch.notify)        updatePayload.notify = patch.notify;
  if (patch.durationHours) updatePayload.duration_hours = patch.durationHours;
  if (expires_at)          updatePayload.expires_at = expires_at;

  const { data, error } = await supabase
    .from('alerts')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data ? rowToAlert(data) : null;
}

async function supabaseDelete(id: string): Promise<void> {
  const { error } = await supabase.from('alerts').delete().eq('id', id);
  if (error) throw error;
}

function supabaseSubscribe(userId: string, cb: () => void): () => void {
  const channel = supabase
    .channel(`alerts:${userId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `user_id=eq.${userId}` },
        () => cb(),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/* ════════════════════════════════════════════════════════════
   DEMO BACKEND (localStorage)
   ════════════════════════════════════════════════════════════ */

const DEMO_KEY = 'wecycle.alerts.v1';
const DEMO_EVENT = 'wecycle-alerts-change';

function demoUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function demoReadAll(): WecycleAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) as WecycleAlert[] : [];
  } catch {
    return [];
  }
}

function demoWriteAll(rows: WecycleAlert[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(DEMO_EVENT));
}

function demoList(userId: string): WecycleAlert[] {
  const now = Date.now();
  const rows = demoReadAll().map(a => {
    if (a.userId !== userId) return a;
    if (a.status === 'active' && new Date(a.expiresAt).getTime() < now) {
      return { ...a, status: 'expired' as AlertStatus };
    }
    return a;
  });
  /* Auto-delete after 2 days expired (mirrors the cron job) */
  const cleaned = rows.filter(a => {
    if (a.status !== 'expired') return true;
    return now - new Date(a.expiresAt).getTime() < 2 * 24 * 60 * 60 * 1000;
  });
  if (cleaned.length !== rows.length) demoWriteAll(cleaned);
  return cleaned.filter(a => a.userId === userId);
}

function demoCreate(input: CreateAlertInput): WecycleAlert {
  const now = new Date();
  const expires = new Date(now.getTime() + input.durationHours * 60 * 60 * 1000);
  const alert: WecycleAlert = {
    id: demoUuid(),
    userId: input.userId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    condition: input.condition,
    maxPrice: input.maxPrice,
    locationPref: input.locationPref?.trim() || undefined,
    notify: input.notify,
    durationHours: input.durationHours,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    status: 'active',
    matchCount: 0,
  };
  const rows = demoReadAll();
  rows.unshift(alert);
  demoWriteAll(rows);
  return alert;
}

function demoUpdate(id: string, patch: Partial<CreateAlertInput>): WecycleAlert | null {
  const rows = demoReadAll();
  const idx = rows.findIndex(a => a.id === id);
  if (idx < 0) return null;
  const merged: WecycleAlert = { ...rows[idx], ...patch } as WecycleAlert;
  if (patch.durationHours && patch.durationHours !== rows[idx].durationHours) {
    merged.expiresAt = new Date(
      new Date(rows[idx].createdAt).getTime() + patch.durationHours * 60 * 60 * 1000,
    ).toISOString();
  }
  rows[idx] = merged;
  demoWriteAll(rows);
  return merged;
}

function demoDelete(id: string) {
  demoWriteAll(demoReadAll().filter(a => a.id !== id));
}

function demoSubscribe(_userId: string, cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => cb();
  window.addEventListener(DEMO_EVENT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(DEMO_EVENT, h);
    window.removeEventListener('storage', h);
  };
}

/* ════════════════════════════════════════════════════════════
   PUBLIC API — routes to the right backend
   ════════════════════════════════════════════════════════════ */

export async function listAlerts(userId: string, mode: StorageMode): Promise<WecycleAlert[]> {
  return mode === 'supabase' ? supabaseList(userId) : demoList(userId);
}

export async function createAlert(input: CreateAlertInput, mode: StorageMode): Promise<WecycleAlert> {
  return mode === 'supabase' ? supabaseCreate(input) : demoCreate(input);
}

export async function updateAlert(
  id: string, patch: Partial<CreateAlertInput>, mode: StorageMode,
): Promise<WecycleAlert | null> {
  return mode === 'supabase' ? supabaseUpdate(id, patch) : demoUpdate(id, patch);
}

export async function deleteAlert(id: string, mode: StorageMode): Promise<void> {
  return mode === 'supabase' ? supabaseDelete(id) : demoDelete(id);
}

export function subscribeAlerts(userId: string, mode: StorageMode, cb: () => void): () => void {
  return mode === 'supabase' ? supabaseSubscribe(userId, cb) : demoSubscribe(userId, cb);
}

/* ── format helper ───────────────────────────────────────── */

export function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins  = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem  = hours % 24;
    return rem === 0 ? `${days}d left` : `${days}d ${rem}h left`;
  }
  if (hours >= 1) return mins === 0 ? `${hours}h left` : `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
}
