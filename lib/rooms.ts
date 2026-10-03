/* ── Rooms: one campus, one marketplace ──────────────────────────────────────
 *
 * Wecycle started as one campus. It now hosts several, and each is a ROOM: its
 * own listings, requests, events, lost & found, people and messages, invisible
 * to every other room. A member belongs to exactly one room, decided when they
 * sign up — by their email's university, and for a multi-campus university by
 * the campus they choose.
 *
 *   Manipal (MAHE)    the original room. PUBLIC: signed-out visitors can
 *                     browse it, which is how the website sells the app.
 *   NMIMS Mumbai      PRIVATE: only signed-in NMIMS Mumbai members.
 *   NMIMS Bengaluru   PRIVATE: only signed-in NMIMS Bengaluru members.
 *
 * A room is a row in `communities`; every post carries its room in
 * `community_id`. The wall is built twice over:
 *
 *   1. In the database. A private room has an Appwrite user LABEL, set only by
 *      the server, and everything a member of that room writes is readable by
 *      `label:<room>` instead of `any`. A member of another room — or nobody
 *      at all — cannot read it, whatever they send to the API.
 *   2. In the app. Every read of a post filters to the room on screen
 *      (lib/appwrite/queryBuilder.ts), so a room never shows another's posts
 *      even to someone whose permissions would allow it (an admin).
 *
 * This file has no browser or server dependencies so the API routes and the
 * screens share one definition of what a room is.
 */

export type University = 'MAHE' | 'NMIMS';

export interface Room {
  /** The `communities` row id — what posts and profiles store. */
  id: string;
  key: 'mahe' | 'nmims-mumbai' | 'nmims-bengaluru';
  university: University;
  /** Full name, for headings: "NMIMS Mumbai". */
  name: string;
  /** For tight spaces and sentences: "Manipal", "NMIMS Mumbai". */
  shortName: string;
  /** Campus within the university, when it has more than one. */
  campus: string | null;
  /** The Appwrite user label that admits someone to a private room. Labels
   *  must be alphanumeric. null = public room. */
  label: string | null;
}

export const MAHE_ROOM: Room = {
  id: 'a4640775-4946-49b2-a5d8-2f35e57e0b1a', // the original 'wecycle-global' community
  key: 'mahe',
  university: 'MAHE',
  name: 'Manipal (MAHE)',
  shortName: 'Manipal',
  campus: null,
  label: null,
};

export const NMIMS_MUMBAI: Room = {
  id: '4f034552-454f-401f-b877-51f6398c7cf2',
  key: 'nmims-mumbai',
  university: 'NMIMS',
  name: 'NMIMS Mumbai',
  shortName: 'NMIMS Mumbai',
  campus: 'Mumbai',
  label: 'nmimsmumbai',
};

export const NMIMS_BENGALURU: Room = {
  id: '9f7ef4bb-238f-40e6-a649-a7c0e0b4016c',
  key: 'nmims-bengaluru',
  university: 'NMIMS',
  name: 'NMIMS Bengaluru',
  shortName: 'NMIMS Bengaluru',
  campus: 'Bengaluru',
  label: 'nmimsbengaluru',
};

export const ROOMS: readonly Room[] = [MAHE_ROOM, NMIMS_MUMBAI, NMIMS_BENGALURU];

/** The rooms someone from this university can choose between at sign-up. */
export const CAMPUS_ROOMS: Record<University, readonly Room[]> = {
  MAHE: [MAHE_ROOM],
  NMIMS: [NMIMS_MUMBAI, NMIMS_BENGALURU],
};

/** Every label that admits to some private room. */
export const ROOM_LABELS: readonly string[] = ROOMS.map(r => r.label).filter((l): l is string => !!l);

/** A room by its community id. Anything unknown — including null, which older
 *  rows may hold — is the original Manipal room. */
export function roomById(id: string | null | undefined): Room {
  return ROOMS.find(r => r.id === id) ?? MAHE_ROOM;
}

export function roomByKey(key: string | null | undefined): Room | null {
  return ROOMS.find(r => r.key === key) ?? null;
}

export const isPrivateRoom = (room: Room): boolean => room.label !== null;

/* ── Which university an address belongs to ─────────────────────────────────
 *
 * NMIMS uses one set of domains for every campus — students on nmims.in,
 * faculty on nmims.edu (confirmed by NMIMS) — so the domain says "NMIMS" and
 * the member says which campus.
 *
 * Same rule as the Manipal gate (lib/emailDomain.ts): the domain IS one of
 * these roots or ends with "." + one. A "contains nmims" test would accept
 * nmims.in.attacker.net. */
export const NMIMS_ROOT_DOMAINS: readonly string[] = ['nmims.in', 'nmims.edu'];

export const NMIMS_STUDENT_DOMAIN = 'nmims.in';
export const NMIMS_FACULTY_DOMAIN = 'nmims.edu';

const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

export function isNmimsEmail(email: string): boolean {
  const domain = String(email ?? '').trim().toLowerCase().split('@')[1] ?? '';
  if (!domain || !HOSTNAME.test(domain)) return false;
  return NMIMS_ROOT_DOMAINS.some(root => domain === root || domain.endsWith(`.${root}`));
}

/* ── The room on screen ─────────────────────────────────────────────────────
 *
 * Module state rather than React context because the reads that must respect
 * it live in the data layer (the query builder), far from any component.
 *
 * Remembered on the device so the first fetch after a cold start already uses
 * the right room. Without that, an NMIMS member's app would load the Manipal
 * feed for the half-second before their profile arrived — the one thing
 * "separate rooms" must never do. */
const STORAGE_KEY = 'wecycle.room.v1';

let active: Room = MAHE_ROOM;
let hydrated = false;
const listeners = new Set<(room: Room) => void>();

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) active = roomById(stored);
  } catch { /* private mode: Manipal until the profile says otherwise */ }
}

export function getActiveRoom(): Room {
  hydrate();
  return active;
}

/** Switch the room on screen. Returns true when it changed. */
export function setActiveRoom(id: string | null | undefined): boolean {
  hydrate();
  const next = roomById(id);
  if (typeof window !== 'undefined') {
    try {
      if (next.id === MAHE_ROOM.id) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next.id);
    } catch { /* best effort */ }
  }
  if (next.id === active.id) return false;
  active = next;
  listeners.forEach(l => l(next));
  return true;
}

export function onRoomChange(cb: (room: Room) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The read role for a row written in the active room: everyone for the
 *  public room, the room's label for a private one. */
export function roomReadRole(room: Room = getActiveRoom()): string {
  return room.label ? `label:${room.label}` : 'any';
}
