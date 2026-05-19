import { supabase } from '../supabase';
import type { EventRow, Insert, Update } from './types';

export async function listEvents(communityId?: string) {
  let q = supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(id, username, full_name, initials, avatar_color)
    `)
    .eq('status', 'published')
    .order('starts_at', { ascending: true });

  if (communityId) q = q.eq('community_id', communityId);
  return q;
}

export async function getEvent(id: string) {
  return supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!events_organizer_id_fkey(*),
      rsvps:event_rsvps(user_id, status, user:profiles(id, username, full_name, initials, avatar_color))
    `)
    .eq('id', id)
    .single();
}

export async function createEvent(input: Insert<'events'>) {
  return supabase.from('events').insert(input).select().single();
}

export async function updateEvent(id: string, patch: Update<'events'>) {
  return supabase.from('events').update(patch).eq('id', id).select().single();
}

export async function toggleRsvp(eventId: string): Promise<{ status: 'going' | 'cancelled' }> {
  const { data, error } = await supabase.rpc('rpc_toggle_rsvp', { _event_id: eventId });
  if (error) throw error;
  return { status: (data ?? 'cancelled') as 'going' | 'cancelled' };
}

export async function myRsvps(userId: string) {
  return supabase
    .from('event_rsvps')
    .select('*, event:events(*)')
    .eq('user_id', userId);
}

export type { EventRow };
