/**
 * Rooms, on the server — who belongs where, and the labels that enforce it.
 *
 * A private room (NMIMS Mumbai, NMIMS Bengaluru) is walled by an Appwrite user
 * LABEL: rows its members write are readable by `label:<room>`, and only the
 * server can give a person a label — a member cannot add one to themselves
 * (verified: the account API has no such call, and a client cannot grant a
 * role it does not hold). So this file is the only door into a private room.
 *
 * Who gets which labels:
 *   - a member of a private room: that room's label
 *   - an admin: every private room's label, so moderation can reach reported
 *     posts anywhere. Admins still SEE one room at a time — the app filters to
 *     the room on screen, and admins get a switcher (Drawer).
 *   - everyone else: none
 *
 * Labels not belonging to rooms are left alone.
 */

import { aw, DB, type Row } from './appwrite';
import { ADMIN_EMAILS } from '../../../lib/adminEmails';
import {
  MAHE_ROOM, ROOM_LABELS, ROOMS, roomById, roomByKey, isNmimsEmail, type Room,
} from '../../../lib/rooms';

export const isAdminAccount = (email: string, profile?: Row | null): boolean =>
  ADMIN_EMAILS.includes(email.trim().toLowerCase())
  || ['admin', 'owner'].includes(String(profile?.role ?? ''));

/** The room a NEW member joins. Manipal by default; an NMIMS address must
 *  name a campus — in the request, or in the account prefs the sign-up form
 *  wrote first (so a profile created later by the app's self-heal still lands
 *  in the right room). null = an NMIMS member who has not chosen. */
export async function roomForNewMember(uid: string, email: string, campus: unknown): Promise<Room | null> {
  if (!isNmimsEmail(email)) return MAHE_ROOM;
  let room = roomByKey(typeof campus === 'string' ? campus : null);
  if (!room || room.university !== 'NMIMS') {
    const prefs = await aw('GET', `/users/${uid}/prefs`);
    room = roomByKey(String(prefs.json?.campus ?? ''));
  }
  return room && room.university === 'NMIMS' ? room : null;
}

/** Make the account's room labels match its room (and admin standing).
 *  Returns the rooms this account may view. */
export async function syncRoomLabels(uid: string, user: Row, profile: Row | null): Promise<Room[]> {
  const email = String(user.email ?? '');
  const admin = isAdminAccount(email, profile);
  const own = roomById(profile?.community_id as string | undefined);

  const wanted = new Set<string>(admin ? ROOM_LABELS : own.label ? [own.label] : []);
  const current = Array.isArray(user.labels) ? (user.labels as string[]) : [];
  const next = [...current.filter(l => !ROOM_LABELS.includes(l)), ...wanted];

  const same = next.length === current.length && next.every(l => current.includes(l));
  if (!same) await aw('PUT', `/users/${uid}/labels`, { labels: next });

  return admin ? [...ROOMS] : [own];
}

/** Read permissions for a row that belongs to a room. */
export const roomReadPerm = (room: Room): string =>
  room.label ? `read("label:${room.label}")` : 'read("any")';

/** The room a profile row is in, by id, for checks that need it. */
export async function roomOfMember(uid: string): Promise<Room> {
  const r = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${encodeURIComponent(uid)}`);
  return roomById(r.ok ? (r.json?.community_id as string | undefined) : undefined);
}
