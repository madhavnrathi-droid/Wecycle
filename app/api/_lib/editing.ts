/**
 * Editing a post — by its author, or by an admin.
 *
 * ── WHY THIS IS ON THE SERVER ──────────────────────────────────────────────
 *
 * A post is updatable only by the member who wrote it, so an admin who opened
 * the editor on someone else's listing could type a new title, watch the
 * status line say "Couldn't save", and get nowhere — Appwrite refused the
 * write. Renaming a listing posted on a seller's behalf was the case that
 * surfaced it. Same shape, and the same answer, as deleting (deletion.ts): an
 * admin's authority cannot live in a browser, so the browser asks here, the
 * caller is identified by JWT and checked, and only then is the server key
 * used.
 *
 * The browser still writes its OWN posts directly. It comes here only when
 * Appwrite refuses (lib/appwrite/queryBuilder.ts), so an author's ordinary
 * edit costs nothing extra.
 *
 * ── WHAT AN EDIT MAY TOUCH ─────────────────────────────────────────────────
 *
 * The columns the app's editors write — fields, repost, photos, sold/reopen,
 * hide — and nothing else. Not the owner column, not the room, not the
 * counters: an admin correcting a title must not be able to move a post into
 * another member's name or another campus. A column outside the list fails
 * the whole request, out loud, rather than being dropped: a write that
 * quietly saved half of what it was given is the failure this file replaces.
 */

import { aw, DB, json, type Args } from './appwrite';
import { callerIsAdmin } from './deletion';

const T = (table: string) => `/tablesdb/${DB}/tables/${table}/rows`;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(v);

const COMMON = ['title', 'description', 'status', 'posted_at', 'updated_at', 'photo_urls', 'video_urls'];

const EDITABLE: Record<string, { owner: string; columns: ReadonlySet<string> }> = {
  listings: {
    owner: 'user_id',
    columns: new Set([...COMMON, 'category_id', 'condition', 'location', 'listing_type', 'price',
      'comp', 'opp_role', 'price_band', 'rate_period', 'price_max']),
  },
  requests: {
    owner: 'user_id',
    columns: new Set([...COMMON, 'category_id', 'urgency', 'need_by_date']),
  },
  lost_found_reports: {
    owner: 'user_id',
    columns: new Set([...COMMON, 'last_seen', 'reward']),
  },
  events: {
    owner: 'organizer_id',
    columns: new Set([...COMMON, 'event_type', 'location', 'max_attendees',
      'starts_at', 'ends_at', 'time_unspecified']),
  },
};

/* ── update_post { table, id, data } ──────────────────────────────────────── */
export async function updatePost(uid: string, args: Args) {
  const table = String(args.table ?? '');
  const spec = EDITABLE[table];
  const id = args.id;
  if (!spec || !isId(id)) return json({ message: 'Unknown post', code: 'invalid' }, 400);

  const data = args.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ message: 'Nothing to change', code: 'invalid' }, 400);
  }
  const patch = data as Record<string, unknown>;
  const refused = Object.keys(patch).filter(k => !spec.columns.has(k));
  if (refused.length) {
    return json({ message: `This can't change ${refused.join(', ')}.`, code: 'invalid' }, 400);
  }
  if (!Object.keys(patch).length) return json({ message: 'Nothing to change', code: 'invalid' }, 400);

  const found = await aw('GET', `${T(table)}/${id}`);
  if (found.status === 404) return json({ message: 'That post no longer exists.', code: 'not_found' }, 404);
  if (!found.ok || !found.json) return json({ message: 'Could not load the post', code: 'server' }, 502);

  const isAuthor = found.json[spec.owner] === uid;
  const admin = !isAuthor && await callerIsAdmin(uid);
  if (!isAuthor && !admin) {
    return json({ message: 'Only the person who posted this, or an admin, can change it.', code: 'forbidden' }, 403);
  }

  const r = await aw('PATCH', `${T(table)}/${id}`, { data: patch });
  if (!r.ok || !r.json) {
    /* Appwrite's own message names the field (a bad enum value, a title over
       200 characters), which is what the editor's status line should show. */
    return json(
      { message: String(r.json?.message ?? 'Could not save. Try again.'), code: String(r.json?.type ?? r.status) },
      r.status >= 400 && r.status < 500 ? 400 : 502,
    );
  }
  return json({ data: r.json });
}
