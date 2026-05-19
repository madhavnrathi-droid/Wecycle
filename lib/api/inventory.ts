import { supabase } from '../supabase';
import type { Insert, InventoryItem, Update } from './types';

export async function listInventory(communityId: string) {
  return supabase
    .from('inventory_items')
    .select(`
      *,
      owner:profiles!inventory_items_owner_id_fkey(id, username, full_name, initials, avatar_color),
      borrower:profiles!inventory_items_borrowed_by_fkey(id, username, full_name, initials, avatar_color)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });
}

export async function createInventoryItem(input: Insert<'inventory_items'>) {
  return supabase.from('inventory_items').insert(input).select().single();
}

export async function updateInventoryItem(id: string, patch: Update<'inventory_items'>) {
  return supabase.from('inventory_items').update(patch).eq('id', id).select().single();
}

export async function borrowItem(id: string, dueDate?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return updateInventoryItem(id, {
    status: 'borrowed',
    borrowed_by: user.id,
    borrow_started_at: new Date().toISOString(),
    due_date: dueDate,
  });
}

export async function returnItem(id: string) {
  return updateInventoryItem(id, {
    status: 'available',
    borrowed_by: null,
    borrow_started_at: null,
    due_date: null,
  });
}

export type { InventoryItem };
