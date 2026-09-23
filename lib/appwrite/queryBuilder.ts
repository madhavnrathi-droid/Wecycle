'use client';

/* ── A PostgREST-shaped query builder over Appwrite TablesDB ───────────────
 *
 * Implements the chain the app already writes:
 *
 *     supabase.from('listings').select('*').eq('status','active')
 *             .order('posted_at', { ascending: false }).limit(20)
 *
 * and resolves to Supabase's `{ data, error }` so no call site has to change.
 *
 * ── WHERE THE TWO MODELS GENUINELY DIVERGE ─────────────────────────────────
 *
 * WRITES ADDRESS ROWS, NOT SETS. PostgREST can say "update every row matching
 * this filter" in one statement. Appwrite updates one row by id. So an update
 * or delete whose filter is anything other than the id has to become: list the
 * matching ids, then act on each. That is done honestly below rather than
 * hidden — it costs an extra round trip and it is not atomic, and a caller
 * relying on all-or-nothing across many rows would be relying on something
 * this cannot provide. Nothing in Wecycle does: every update in the app is
 * either keyed by id or scoped to one user's own row.
 *
 * NO EMBEDDED SELECTS. `select('*, listing:listings(*)')` is PostgREST joining
 * for you. Appwrite has no equivalent, so the four places that use it get a
 * second batched query and the rows stitched together here — one extra
 * request, not one per row.
 *
 * COUNTS ARE FREE, AGGREGATES ARE NOT. Appwrite returns `total` on every list,
 * so `count` works. SUM and GROUP BY have no equivalent and nothing here
 * pretends otherwise.
 */

import { Query, ID } from 'appwrite';
import { tables, toRow, toRows, toPayload, fillServerDefaults, APPWRITE_DB, type AnyRow } from './client';

export interface Result<T> { data: T | null; error: { message: string; code?: string } | null; }

/* Postgres calls it `id`; Appwrite calls it `$id`. Every filter goes through
   here, so a query that forgets the translation cannot be written. */
const col = (c: string): string => (c === 'id' ? '$id' : c);

const asError = (e: unknown): { message: string; code?: string } => {
  const any = e as { message?: string; code?: number | string; type?: string };
  return {
    message: any?.message ?? 'Request failed',
    code: any?.type ?? (any?.code != null ? String(any.code) : undefined),
  };
};

type Embed = { key: string; table: string; fk: string };

/** `select('*, listing:listings(*)')` -> the embeds, and the plain columns. */
function parseSelect(sel: string): { embeds: Embed[] } {
  const embeds: Embed[] = [];
  const re = /(?:([a-z_]+):)?([a-z_]+)\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sel))) {
    const key = m[1] ?? m[2];
    const table = m[2];
    /* listing:listings(*) means "the row in `listings` whose id is my
       listing_id". Singularising the table is how PostgREST infers it too. */
    embeds.push({ key, table, fk: `${table.replace(/ies$/, 'y').replace(/s$/, '')}_id` });
  }
  return { embeds };
}

export class AppwriteQuery<T = AnyRow> implements PromiseLike<Result<T[]>> {
  private filters: string[] = [];
  private orders: string[] = [];
  private _limit?: number;
  private _offset?: number;
  private embeds: Embed[] = [];
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: AnyRow[] = [];
  private wantCount = false;
  /** Only an id filter lets a write skip the "list first" round trip. */
  private idFilter: string | string[] | null = null;
  private otherFilters = 0;

  constructor(private table: string) {}

  /* ── shaping ── */
  select(sel = '*', opts?: { count?: 'exact' | 'planned' | 'estimated' }): this {
    if (this.mode === 'select') this.mode = 'select';
    if (opts?.count) this.wantCount = true;
    if (sel.includes('(')) this.embeds = parseSelect(sel).embeds;
    return this;
  }

  /* ── filters ── */
  private push(q: string, isId: boolean, value?: string | string[]): this {
    this.filters.push(q);
    if (isId && value !== undefined) this.idFilter = value;
    else this.otherFilters++;
    return this;
  }
  eq(c: string, v: unknown): this {
    return this.push(Query.equal(col(c), [v as never]), c === 'id', v as string);
  }
  neq(c: string, v: unknown): this { return this.push(Query.notEqual(col(c), v as never), false); }
  in(c: string, v: unknown[]): this {
    return this.push(Query.equal(col(c), v as never[]), c === 'id', v as string[]);
  }
  gt(c: string, v: unknown): this { return this.push(Query.greaterThan(col(c), v as never), false); }
  gte(c: string, v: unknown): this { return this.push(Query.greaterThanEqual(col(c), v as never), false); }
  lt(c: string, v: unknown): this { return this.push(Query.lessThan(col(c), v as never), false); }
  lte(c: string, v: unknown): this { return this.push(Query.lessThanEqual(col(c), v as never), false); }
  is(c: string, v: null | boolean): this {
    return this.push(v === null ? Query.isNull(col(c)) : Query.equal(col(c), [v as never]), false);
  }
  /** `%term%` is a contains; anything else is treated as one too — Appwrite has
   *  no anchored case-insensitive match, and `search` needs a full-text index
   *  the migrated schema does not declare. */
  ilike(c: string, pattern: string): this {
    return this.push(Query.contains(col(c), [pattern.replace(/%/g, '') as never]), false);
  }
  contains(c: string, v: unknown): this {
    return this.push(Query.contains(col(c), (Array.isArray(v) ? v : [v]) as never[]), false);
  }
  textSearch(c: string, q: string): this {
    return this.push(Query.search(col(c), q.replace(/[:*&|!]/g, ' ').trim()), false);
  }
  match(obj: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  /** PostgREST's `or('a.eq.1,b.eq.2')`. */
  or(expr: string): this {
    const parts = expr.split(',').map(s => s.trim()).filter(Boolean);
    const qs: string[] = [];
    for (const p of parts) {
      const m = /^([a-z_]+)\.([a-z]+)\.(.*)$/i.exec(p);
      if (!m) continue;
      const [, c, op, raw] = m;
      const v: unknown = raw === 'null' ? null : raw;
      if (op === 'eq') qs.push(Query.equal(col(c), [v as never]));
      else if (op === 'neq') qs.push(Query.notEqual(col(c), v as never));
      else if (op === 'is' && v === null) qs.push(Query.isNull(col(c)));
      else if (op === 'gt') qs.push(Query.greaterThan(col(c), v as never));
      else if (op === 'lt') qs.push(Query.lessThan(col(c), v as never));
    }
    if (qs.length) { this.filters.push(Query.or(qs)); this.otherFilters++; }
    return this;
  }

  /* ── ordering + paging ── */
  order(c: string, opts?: { ascending?: boolean }): this {
    this.orders.push(opts?.ascending === false ? Query.orderDesc(col(c)) : Query.orderAsc(col(c)));
    return this;
  }
  limit(n: number): this { this._limit = n; return this; }
  range(from: number, to: number): this { this._offset = from; this._limit = to - from + 1; return this; }

  /* ── writes ── */
  insert(rows: AnyRow | AnyRow[]): this {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(data: AnyRow): this { this.mode = 'update'; this.payload = [data]; return this; }
  upsert(rows: AnyRow | AnyRow[]): this {
    this.mode = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete(): this { this.mode = 'delete'; return this; }

  /* ── terminators ── */
  async single(): Promise<Result<T>> {
    const r = await this.run();
    if (r.error) return { data: null, error: r.error };
    const rows = r.data ?? [];
    if (rows.length !== 1) {
      return { data: null, error: { message: rows.length ? 'more than one row returned' : 'no rows returned', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }
  async maybeSingle(): Promise<Result<T>> {
    const r = await this.run();
    if (r.error) return { data: null, error: r.error };
    return { data: (r.data ?? [])[0] ?? null, error: null };
  }
  then<R1 = Result<T[]>, R2 = never>(
    onfulfilled?: ((v: Result<T[]>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  /* ── execution ── */
  private queries(): string[] {
    const q = [...this.filters, ...this.orders];
    if (this._limit != null) q.push(Query.limit(this._limit));
    if (this._offset != null) q.push(Query.offset(this._offset));
    return q;
  }

  private async listIds(): Promise<string[]> {
    if (typeof this.idFilter === 'string' && this.otherFilters === 0) return [this.idFilter];
    if (Array.isArray(this.idFilter) && this.otherFilters === 0) return this.idFilter;
    const res = await tables().listRows({
      databaseId: APPWRITE_DB, tableId: this.table,
      queries: [...this.filters, Query.limit(100)],
    });
    return (res.rows as AnyRow[]).map(r => String(r.$id));
  }

  private async run(): Promise<Result<T[]> & { count?: number }> {
    try {
      switch (this.mode) {
        case 'insert':
        case 'upsert': {
          const out: AnyRow[] = [];
          for (const row of this.payload) {
            const { rowId, data } = toPayload(row);
            fillServerDefaults(this.table, data);
            const r = this.mode === 'upsert' && rowId
              ? await tables().upsertRow({ databaseId: APPWRITE_DB, tableId: this.table, rowId, data })
              : await tables().createRow({
                  databaseId: APPWRITE_DB, tableId: this.table,
                  rowId: rowId ?? ID.unique(), data,
                });
            out.push(r as AnyRow);
          }
          return { data: toRows<T>(out), error: null };
        }
        case 'update': {
          const { data } = toPayload(this.payload[0] ?? {});
          const ids = await this.listIds();
          const out: AnyRow[] = [];
          for (const rowId of ids) {
            out.push(await tables().updateRow({
              databaseId: APPWRITE_DB, tableId: this.table, rowId, data,
            }) as AnyRow);
          }
          return { data: toRows<T>(out), error: null };
        }
        case 'delete': {
          const ids = await this.listIds();
          for (const rowId of ids) {
            await tables().deleteRow({ databaseId: APPWRITE_DB, tableId: this.table, rowId });
          }
          return { data: [] as T[], error: null };
        }
        default: {
          const res = await tables().listRows({
            databaseId: APPWRITE_DB, tableId: this.table, queries: this.queries(),
          });
          let rows = toRows<AnyRow>(res.rows as AnyRow[]);
          if (this.embeds.length) rows = await this.stitch(rows);
          return { data: rows as T[], error: null, count: res.total };
        }
      }
    } catch (e) {
      return { data: null, error: asError(e) };
    }
  }

  /** One batched query per embedded table, not one per row. */
  private async stitch(rows: AnyRow[]): Promise<AnyRow[]> {
    for (const em of this.embeds) {
      const ids = [...new Set(rows.map(r => r[em.fk]).filter((v): v is string => typeof v === 'string'))];
      if (!ids.length) { for (const r of rows) r[em.key] = null; continue; }
      const res = await tables().listRows({
        databaseId: APPWRITE_DB, tableId: em.table,
        queries: [Query.equal('$id', ids), Query.limit(ids.length)],
      });
      const byId = new Map(toRows<AnyRow>(res.rows as AnyRow[]).map(r => [String(r.id), r]));
      for (const r of rows) r[em.key] = byId.get(String(r[em.fk])) ?? null;
    }
    return rows;
  }
}

export const from = <T = AnyRow>(table: string): AppwriteQuery<T> => new AppwriteQuery<T>(table);
export { toRow };
