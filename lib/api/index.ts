/**
 * Wecycle data-access API — typed wrappers around Supabase.
 *
 * Usage:
 *   import { listings, events } from '@/lib/api';
 *   const { data, error } = await listings.listListings({ communityId });
 */

export * as auth from './auth';
export * as listings from './listings';
export * as requests from './requests';
export * as events from './events';
export * as lostFound from './lostFound';
export * as feed from './feed';
export * as impact from './impact';
export * as inventory from './inventory';
export * as notifications from './notifications';
export * as storage from './storage';
export * as communities from './communities';
export * from './types';
