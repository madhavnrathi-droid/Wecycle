'use client';

/* Web Push client.
 *
 * Flow: ensure the service worker is registered → ask for Notification
 * permission (only on an explicit user gesture) → subscribe via PushManager
 * with our VAPID public key → persist the subscription to Supabase so the
 * push-fanout Edge Function can reach this device.
 *
 * Degrades gracefully everywhere: unsupported browsers, denied permission, no
 * VAPID key, or missing DB tables all resolve to a calm "not enabled" state
 * rather than throwing.
 */

import { supabase, hasSupabaseEnv } from './supabase';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Is this device currently subscribed? (cheap, local check) */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration())
      ?? (await navigator.serviceWorker.register('/sw.js'));
  } catch {
    return null;
  }
}

/** Persist a PushSubscription to the DB via the SECURITY DEFINER upsert RPC. */
async function persist(sub: PushSubscription): Promise<void> {
  if (!hasSupabaseEnv) return;
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  // RPC isn't in the generated types yet → cast (mirrors liveData patterns).
  await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<unknown>)('upsert_push_subscription', {
    _endpoint: sub.endpoint,
    _p256dh: keys.p256dh ?? '',
    _auth: keys.auth ?? '',
    _user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
}

/**
 * Turn on push for this device. Must be called from a user gesture (the
 * browser only shows the permission prompt then). Returns the resulting state.
 */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const reg = await ensureRegistration();
    if (!reg) return 'error';
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });

    await persist(sub);
    return 'enabled';
  } catch {
    return 'error';
  }
}

/** Turn off push for this device (unsubscribe + drop the DB row). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    if (hasSupabaseEnv) {
      await supabase.from('push_subscriptions' as never).delete().eq('endpoint' as never, endpoint as never);
    }
  } catch {
    /* swallow */
  }
}
