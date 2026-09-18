/**
 * The SQL Server connection, and the one safe way to use it.
 *
 * ── THE PROBLEM THIS FILE EXISTS TO SOLVE ───────────────────────────────────
 *
 * Every ownership rule in the database reads app.current_user_id(), which reads
 * SESSION_CONTEXT — a value that lives on the CONNECTION. That replaced
 * Postgres's auth.uid(), which lived on the JWT and travelled with the query.
 *
 * Connections are pooled. Session context survives being returned to the pool.
 * So a request that fails to set it does not get an error and does not get
 * NULL — it inherits whoever used that connection last, and runs as them.
 *
 * Worse, node-mssql's pool.request() takes a connection per request. Setting
 * the context in one call and querying in the next can land on two different
 * connections, and then the query runs with whatever context the second one
 * happened to be carrying. It works in development, where the pool holds one
 * connection and everything lines up.
 *
 * So: withUser() below opens a TRANSACTION, which pins exactly one connection
 * for its whole body, sets the context on that connection first, and hands you
 * a Request bound to it. It is the only exported way to reach the database.
 * There is no getPool() and no raw query helper, on purpose — the unsafe
 * version of this is one line shorter and impossible to spot in review.
 */

import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;
let connecting: Promise<sql.ConnectionPool> | null = null;

function connectionString(): string {
  const cs = process.env.MSSQL_URL;
  if (!cs) {
    throw new Error(
      'MSSQL_URL is not set. Expected something like:\n' +
      '  Server=host,1433;Database=Wecycle;User Id=wecycle_api;Password=…;Encrypt=true',
    );
  }
  return cs;
}

/** Lazily opened, and shared. The `connecting` guard stops a cold start with
 *  several requests in flight from opening several pools. */
async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (connecting) return connecting;

  connecting = (async () => {
    const p = new sql.ConnectionPool(connectionString());
    p.on('error', (e: unknown) => { console.error('[mssql] pool error', e); });
    await p.connect();
    pool = p;
    connecting = null;
    return p;
  })();

  return connecting;
}

export type Db = sql.Request;

/**
 * Run `fn` as `userId`, or signed out when it is null.
 *
 *   const rows = await withUser(session?.userId ?? null, async (db) => {
 *     const r = await db.input('id', sql.UniqueIdentifier, listingId)
 *                       .query('SELECT * FROM app.listings WHERE id = @id');
 *     return r.recordset;
 *   });
 *
 * Pass null explicitly for anonymous requests. Do not skip the call because a
 * query "doesn't need" the user — the point is that the context is set to the
 * right thing on every single checkout, including to NULL.
 *
 * The body runs in a transaction, so a handler that writes twice either writes
 * both or neither. It commits on return and rolls back if anything throws.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const tx = new sql.Transaction(p);
  await tx.begin();

  try {
    const setCtx = new sql.Request(tx);
    setCtx.input('uid', sql.UniqueIdentifier, userId);
    await setCtx.query(
      "EXEC sys.sp_set_session_context @key = N'user_id', @value = @uid;",
    );

    const result = await fn(new sql.Request(tx));
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch { /* already rolled back by XACT_ABORT */ }
    throw err;
  }
}

/** Convenience for handlers with no signed-in member. Same guarantees. */
export function asAnonymous<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withUser(null, fn);
}

/**
 * The database raises these with THROW; they are expected outcomes, not bugs,
 * and the API should turn them into 401/403/400 rather than 500.
 * Numbers are assigned in wecycle-sqlserver.sql — keep both in step.
 */
export const DbError = {
  NOT_AUTHENTICATED: 50001,   // no session context
  NOT_ADMIN:         50002,   // app.usp_admin_set_suspension
  INVALID_RECIPIENT: 50003,   // app.usp_get_or_create_conversation
  SIGCHI_SIGNIN:     50004,   // app.usp_claim_sigchi_offer, signed out
  SIGCHI_THROTTLED:  50005,   // too many wrong guesses
  BLOCKED_WORDING:   50010,   // the moderation word list
  SUSPENDED:         50011,   // a suspended member tried to post
  EMAIL_NOT_ALLOWED: 50012,   // the Manipal gate
} as const;

export function dbErrorNumber(e: unknown): number | null {
  const n = (e as { number?: unknown })?.number;
  return typeof n === 'number' ? n : null;
}

export { sql };
