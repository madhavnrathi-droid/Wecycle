/**
 * Convenience re-exports + utility types.
 */
import type { Database } from '../database.types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

export type Profile      = Tables<'profiles'>;
export type Community    = Tables<'communities'>;
export type Listing      = Tables<'listings'>;
export type RequestRow   = Tables<'requests'>;
export type EventRow     = Tables<'events'>;
export type LostFoundRow = Tables<'lost_found_reports'>;
export type Category     = Tables<'categories'>;
export type Notification = Tables<'notifications'>;
export type CommentRow   = Tables<'comments'>;
export type InventoryItem = Tables<'inventory_items'>;
