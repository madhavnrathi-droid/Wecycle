/**
 * Deleting posts and comments — by their author, or by an admin.
 *
 * ── WHY THIS IS ON THE SERVER ──────────────────────────────────────────────
 *
 * Every row is deletable only by the member who wrote it — the right rule,
 * and the reason an admin pressing Delete on someone else's post got a refusal
 * from Appwrite and an "you may not own this" error in the app. An admin's
 * authority cannot live in a browser (a browser deciding it is an admin is not
 * a check), so moderation deletes come here, where the caller is identified by
 * JWT and checked against the admin list before the server key is used.
 *
 * Authors come here too, for the second reason: Postgres cascaded a post's
 * comments, likes, saves, RSVPs and notifications away with it. Appwrite has
 * no cascade, and an author cannot delete rows other members own (someone
 * else's save of their listing), so a browser-side delete left all of that
 * behind, pointing at a post that no longer exists.
 *
 * Photos are deleted with the post: they are stored readable-by-link, so a
 * post removed for being objectionable would otherwise leave its images up.
 */

import { aw, DB, q, rowsOf, json, type Args, type Row } from './appwrite';
import { isAdminAccount } from './rooms';

const T = (table: string) => `/tablesdb/${DB}/tables/${table}/rows`;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(v);

/** Each kind of post: its table, who owns it, and the name comments,
 *  reactions and notifications use for it. */
const POSTS = {
  listing:   { table: 'listings',           owner: 'user_id',      entity: 'listing',    report: 'listing' },
  request:   { table: 'requests',           owner: 'user_id',      entity: 'request',    report: 'request' },
  lostfound: { table: 'lost_found_reports', owner: 'user_id',      entity: 'lost_found', report: 'lostfound' },
  event:     { table: 'events',             owner: 'organizer_id', entity: 'event',      report: 'event' },
} as const;
type PostKind = keyof typeof POSTS;

/** Rows hanging off a post that only made sense while it existed. */
const CHILDREN: Record<PostKind, Array<[table: string, column: string]>> = {
  listing:   [['saves', 'listing_id'], ['listing_responses', 'listing_id']],
  request:   [['request_offers', 'request_id']],
  lostfound: [],
  event:     [['event_rsvps', 'event_id'], ['event_saves', 'event_id'],
              ['event_form_responses', 'event_id'], ['event_forms', 'event_id']],
};

/** Delete every row matching the filters, a page at a time. */
async function deleteWhere(table: string, ...filters: unknown[]): Promise<number> {
  let n = 0;
  for (let guard = 0; guard < 50; guard++) {
    const page = rowsOf(await aw('GET', T(table) + q(...filters, { method: 'limit', values: [100] })));
    if (!page.length) break;
    const results = await Promise.all(page.map(r => aw('DELETE', `${T(table)}/${r.$id}`)));
    n += results.filter(r => r.ok).length;
    /* Nothing deletable on this page: stop rather than re-read it forever. */
    if (!results.some(r => r.ok) || page.length < 100) break;
  }
  return n;
}

const eq = (attribute: string, value: string) => ({ method: 'equal', attribute, values: [value] });

/** Appwrite file URLs this app stores: /storage/buckets/<bucket>/files/<id>/view */
async function deleteMedia(row: Row): Promise<void> {
  const urls = [
    ...((row.photo_urls as string[] | null) ?? []),
    ...((row.video_urls as string[] | null) ?? []),
    ...(typeof row.cover_url === 'string' ? [row.cover_url] : []),
  ];
  await Promise.all(urls.map(u => {
    const m = /\/storage\/buckets\/([^/]+)\/files\/([^/?]+)/.exec(String(u));
    return m ? aw('DELETE', `/storage/buckets/${m[1]}/files/${m[2]}`) : null;
  }));
}

async function callerIsAdmin(uid: string): Promise<boolean> {
  const [user, profile] = await Promise.all([
    aw('GET', `/users/${uid}`),
    aw('GET', `${T('profiles')}/${uid}`),
  ]);
  return isAdminAccount(String(user.json?.email ?? ''), profile.ok ? profile.json : null);
}

/** Reports about something an admin removed are, by that act, dealt with. */
async function closeReports(targetType: string, targetId: string, adminId: string): Promise<void> {
  const open = rowsOf(await aw('GET', T('content_reports') + q(
    eq('target_id', targetId), eq('target_type', targetType), { method: 'limit', values: [100] })));
  const now = new Date().toISOString();
  await Promise.all(open.filter(r => r.status === 'open' || r.status === 'reviewing').map(r =>
    aw('PATCH', `${T('content_reports')}/${r.$id}`, {
      data: { status: 'actioned', reviewed_by: adminId, reviewed_at: now },
    })));
}

/* ── delete_post { kind, id } ─────────────────────────────────────────────── */
export async function deletePost(uid: string, args: Args) {
  const kind = String(args.kind ?? '') as PostKind;
  const spec = POSTS[kind];
  const id = args.id;
  if (!spec || !isId(id)) return json({ message: 'Unknown post', code: 'invalid' }, 400);

  const found = await aw('GET', `${T(spec.table)}/${id}`);
  /* Already gone — a double tap, or another admin got there first. The
     outcome the caller wanted is true, so say so. */
  if (found.status === 404) return json({ data: { deleted: false, already: true } });
  if (!found.ok || !found.json) return json({ message: 'Could not load the post', code: 'server' }, 502);
  const row = found.json;

  const isAuthor = row[spec.owner] === uid;
  const admin = !isAuthor && await callerIsAdmin(uid);
  if (!isAuthor && !admin) {
    return json({ message: 'Only the person who posted this, or an admin, can delete it.', code: 'forbidden' }, 403);
  }

  /* The post first, so it leaves every feed at once even if a clean-up below
     is slow; then everything that pointed at it. */
  const del = await aw('DELETE', `${T(spec.table)}/${id}`);
  if (!del.ok && del.status !== 404) {
    return json({ message: 'Could not delete the post. Try again.', code: 'server' }, 502);
  }

  await Promise.all([
    deleteWhere('comments', eq('entity_type', spec.entity), eq('entity_id', id)),
    deleteWhere('reactions', eq('entity_type', spec.entity), eq('entity_id', id)),
    deleteWhere('notifications', eq('entity_type', spec.entity), eq('entity_id', id)),
    ...CHILDREN[kind].map(([table, column]) => deleteWhere(table, eq(column, id))),
    deleteMedia(row),
    admin ? closeReports(spec.report, id, uid) : Promise.resolve(),
  ]);

  return json({ data: { deleted: true, by: admin ? 'admin' : 'author' } });
}

/* ── delete_comment { id } ────────────────────────────────────────────────── */
export async function deleteComment(uid: string, args: Args) {
  const id = args.id;
  if (!isId(id)) return json({ message: 'Unknown comment', code: 'invalid' }, 400);

  const found = await aw('GET', `${T('comments')}/${id}`);
  if (found.status === 404) return json({ data: { deleted: false, already: true } });
  if (!found.ok || !found.json) return json({ message: 'Could not load the comment', code: 'server' }, 502);
  const comment = found.json;

  const isAuthor = comment.user_id === uid;
  const admin = !isAuthor && await callerIsAdmin(uid);
  if (!isAuthor && !admin) {
    return json({ message: 'Only the person who wrote this, or an admin, can delete it.', code: 'forbidden' }, 403);
  }

  /* Replies go with the comment, as the ON DELETE CASCADE used to do. */
  await deleteWhere('comments', eq('parent_comment_id', id));
  const del = await aw('DELETE', `${T('comments')}/${id}`);
  if (!del.ok && del.status !== 404) {
    return json({ message: 'Could not delete the comment. Try again.', code: 'server' }, 502);
  }

  /* A reply leaves its parent one reply lighter. */
  const parent = comment.parent_comment_id;
  if (isId(parent)) {
    await aw('PATCH', `${T('comments')}/${parent}/reply_count/decrement`, { value: 1, min: 0 });
  }
  if (admin) await closeReports('comment', id, uid);

  return json({ data: { deleted: true, by: admin ? 'admin' : 'author' } });
}
