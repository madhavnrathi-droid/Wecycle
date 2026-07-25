// Supabase Edge Function: push-fanout
// ----------------------------------------------------------------------------
// Fans out Web Push notifications. Invoked two ways:
//   1) Database Webhook on INSERT into `requests` / `listings`  → saved-search
//      alerts: notify everyone whose keyword matches the new post.
//   2) Database Webhook on INSERT into `messages`               → notify the
//      other participant of the conversation.
//
// Uses the service role (auto-injected) to read across users, and the VAPID
// keypair stored as function secrets. Deploy:
//   supabase functions deploy push-fanout --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:hello@wecycle.app
// ----------------------------------------------------------------------------

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@wecycle.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const APP_URL = Deno.env.get('APP_URL') ?? 'https://wecycle.page';

interface WebhookBody {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
}

interface Target {
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
}

async function send(t: Target) {
  const sub = { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } };
  const payload = JSON.stringify({ title: t.title, body: t.body, url: t.url, tag: t.tag });
  try {
    await webpush.sendNotification(sub, payload);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410 → subscription is dead; prune it so we stop trying.
    if (status === 404 || status === 410) {
      await admin.from('push_subscriptions').delete().eq('endpoint', t.endpoint);
    }
  }
}

Deno.serve(async (req) => {
  let body: WebhookBody;
  try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const rec = body.record;
  if (body.type !== 'INSERT' || !rec) return new Response('ignored', { status: 200 });

  const targets: Target[] = [];

  if (body.table === 'requests' || body.table === 'listings') {
    const scope = body.table === 'requests' ? 'requests' : 'listings';
    const title = String(rec.title ?? 'Wecycle');
    const text = `${rec.title ?? ''} ${rec.description ?? ''}`.trim();
    const excludeUser = String(rec.user_id ?? '');
    const { data, error } = await admin.rpc('subscribers_for_text', {
      _text: text, _scope: scope, _exclude_user: excludeUser,
    });
    if (error) return new Response(error.message, { status: 500 });
    for (const r of data ?? []) {
      targets.push({
        endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth,
        title: scope === 'requests' ? 'New request matches your alert' : 'New listing matches your alert',
        body: title,
        url: `${APP_URL}/?focus=${scope}`,
        tag: `alert-${rec.id}`,
      });
    }
  } else if (body.table === 'messages') {
    const convoId = String(rec.conversation_id ?? '');
    const senderId = String(rec.sender_id ?? '');
    const { data: convo } = await admin
      .from('conversations').select('user_a, user_b').eq('id', convoId).single();
    if (!convo) return new Response('no convo', { status: 200 });
    const recipient = convo.user_a === senderId ? convo.user_b : convo.user_a;
    const [{ data: sender }, { data: subs }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', senderId).single(),
      admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', recipient),
    ]);
    const name = (sender?.full_name as string) || 'Someone';
    for (const s of subs ?? []) {
      targets.push({
        endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth,
        title: `${name} messaged you`,
        body: String(rec.body ?? '').slice(0, 140),
        url: `${APP_URL}/?focus=messages&c=${convoId}`,
        tag: `msg-${convoId}`,
      });
    }
  } else {
    return new Response('ignored table', { status: 200 });
  }

  await Promise.allSettled(targets.map(send));
  return new Response(JSON.stringify({ sent: targets.length }), {
    headers: { 'content-type': 'application/json' },
  });
});
