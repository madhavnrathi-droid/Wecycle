'use client';

import { Query } from 'appwrite';
import { getActiveRoom } from '../rooms';

/* ── Rooms ───────────────────────────────────────────────────────────────────
 *
 * The four kinds of post belong to a room (lib/rooms.ts), and the query
 * builder (queryBuilder.ts) is the one place every read of them passes
 * through — so that is where a room is enforced in the app. Reads get `community_id = <room on screen>`; inserts get
 * the room stamped on, whatever the caller sent.
 *
 * Profiles belong to a room too, but are often fetched BY ID across the app —
 * your own, a post's author — so they are only scoped when the query is a
 * search or a list, never when it names the rows it wants. */
export const ROOM_TABLES: ReadonlySet<string> = new Set(['listings', 'requests', 'events', 'lost_found_reports']);

export function roomFilterFor(table: string, namesIds: boolean): string | null {
  if (ROOM_TABLES.has(table) || (table === 'profiles' && !namesIds)) {
    return Query.equal('community_id', [getActiveRoom().id]);
  }
  return null;
}
