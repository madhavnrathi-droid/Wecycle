import { supabase } from '../supabase';
import type { Notification } from './types';

export async function listNotifications(limit = 30) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };
  return supabase
    .from('notifications')
    .select(`
      *,
      actor:profiles!notifications_actor_id_fkey(id, username, full_name, initials, avatar_color)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function countUnread(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  return count ?? 0;
}

export async function markRead(ids?: string[]) {
  const { data, error } = await supabase.rpc('rpc_mark_notifications_read', ids ? { _ids: ids } : {});
  if (error) throw error;
  return data ?? 0;
}

/** Subscribe to live notifications via Realtime. Returns unsubscribe fn. */
export function subscribeToNotifications(userId: string, onNew: (n: Notification) => void) {
  const channel = supabase
    .channel(`notif:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      payload => onNew(payload.new as Notification),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export type { Notification };
