'use client';

/* ── The Supabase client, assembled out of Appwrite parts ──────────────────
 *
 * What `getSupabase()` returns once the backend is Appwrite. Every call site
 * keeps its existing shape: `.from(...).select(...)`, `.rpc(...)`,
 * `.auth.getUser()`, `.storage.from(...)`, `.channel(...)`.
 *
 * Two things here are not simple pass-throughs and are worth knowing about.
 */

import { appwriteClient, APPWRITE_DB, tables, toRows, type AnyRow } from './client';
import { AppwriteQuery } from './queryBuilder';
import { authAdapter } from './authAdapter';
import { storageAdapter } from './storageAdapter';
import { rpc } from './rpc';
import { Query } from 'appwrite';

/* ── leaderboard_view ──────────────────────────────────────────────────────
 *
 * A Postgres view that ranked profiles with RANK() OVER (PARTITION BY
 * community ORDER BY impact_score DESC). Appwrite has no views and no window
 * functions, so the ordering is done by the database and the rank is assigned
 * here.
 *
 * That is only honest at this size. It reads every profile in the community to
 * number them, which is fine for 99 and would not be for 99,000 — at that
 * point the rank wants to be a column maintained on write, not computed on
 * read. Written down because the query that replaces it will look like it
 * always worked. */
class LeaderboardQuery implements PromiseLike<{ data: AnyRow[] | null; error: { message: string } | null }> {
  private communityId?: string;
  private _limit = 20;

  eq(c: string, v: unknown): this {
    if (c === 'community_id' && typeof v === 'string') this.communityId = v;
    return this;
  }
  select(): this { return this; }
  order(): this { return this; }
  limit(n: number): this { this._limit = n; return this; }

  then<R1, R2 = never>(
    onfulfilled?: ((v: { data: AnyRow[] | null; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run() {
    try {
      const q = [Query.orderDesc('impact_score'), Query.limit(Math.max(this._limit, 100))];
      if (this.communityId) q.unshift(Query.equal('community_id', [this.communityId]));
      const res = await tables().listRows({ databaseId: APPWRITE_DB, tableId: 'profiles', queries: q });
      const rows = toRows<AnyRow>(res.rows as AnyRow[]).map((r, i) => ({
        ...r,
        user_id: r.id,
        community_rank: i + 1,
      }));
      return { data: rows.slice(0, this._limit), error: null };
    } catch (e) {
      return { data: null, error: { message: (e as { message?: string })?.message ?? 'Leaderboard failed' } };
    }
  }
}

/* ── Realtime ──────────────────────────────────────────────────────────────
 *
 * Supabase filters server-side (`filter: 'user_id=eq.<id>'`). Appwrite
 * subscribes to a whole table and delivers every row event on it, so the
 * filter is applied here on arrival.
 *
 * The consequence is worth stating: a subscriber to their own notifications
 * receives, and discards, events for everyone else's. That is not a leak —
 * Appwrite only delivers rows the subscriber may read, and per-row permissions
 * make a notification readable only by its owner — but it is why this is a
 * filter and not a subscription parameter. */
interface ChannelHandler { event: string; table: string; filter?: string; cb: (payload: { new: AnyRow; old: AnyRow }) => void; }

function matchesFilter(row: AnyRow, filter?: string): boolean {
  if (!filter) return true;
  const m = /^([a-z_]+)=eq\.(.*)$/.exec(filter);
  if (!m) return true;
  return String(row[m[1]] ?? '') === m[2];
}

class Channel {
  private handlers: ChannelHandler[] = [];
  private unsubs: Array<() => void> = [];
  constructor(public name: string) {}

  on(_type: string, cfg: { event: string; table: string; filter?: string }, cb: ChannelHandler['cb']): this {
    this.handlers.push({ event: cfg.event, table: cfg.table, filter: cfg.filter, cb });
    return this;
  }

  subscribe(): this {
    for (const h of this.handlers) {
      const chan = `databases.${APPWRITE_DB}.tables.${h.table}.rows`;
      try {
        const off = appwriteClient().subscribe(chan, (msg: { events?: string[]; payload?: AnyRow }) => {
          const events = msg.events ?? [];
          const isCreate = events.some(e => e.endsWith('.create'));
          const isUpdate = events.some(e => e.endsWith('.update'));
          const isDelete = events.some(e => e.endsWith('.delete'));
          if (h.event === 'INSERT' && !isCreate) return;
          if (h.event === 'UPDATE' && !isUpdate) return;
          if (h.event === 'DELETE' && !isDelete) return;
          const row = (msg.payload ?? {}) as AnyRow;
          if (!matchesFilter(row, h.filter)) return;
          const shaped = { ...row, id: row.$id } as AnyRow;
          h.cb({ new: shaped, old: shaped });
        });
        this.unsubs.push(off);
      } catch { /* realtime unavailable — the app polls anyway */ }
    }
    return this;
  }

  unsubscribe(): void {
    for (const off of this.unsubs) { try { off(); } catch { /* already closed */ } }
    this.unsubs = [];
  }
}

export function createAppwriteBackedClient() {
  return {
    auth: authAdapter,
    from: (table: string) =>
      (table === 'leaderboard_view' ? new LeaderboardQuery() : new AppwriteQuery(table)) as never,
    rpc,
    storage: storageAdapter,
    channel: (name: string) => new Channel(name),
    removeChannel: (c: { unsubscribe?: () => void }) => { c?.unsubscribe?.(); },
  };
}
