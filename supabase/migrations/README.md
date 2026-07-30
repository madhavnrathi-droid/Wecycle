# Migrations

The complete schema for the Wecycle database. Apply in filename order on a fresh
Supabase project (`supabase db push`, or paste into the SQL editor in order) and
you get the full production schema: tables, enums, RLS policies, triggers,
storage buckets, views, RPCs, and cron jobs.

Three provenances, all current as of 2026-07-30:

1. **`20260512090042_…` → `20260727034456_…`** — the applied-migration history,
   exported verbatim from the live project's `supabase_migrations.schema_migrations`.
2. **`20260609_messaging.sql`, `20260609_push_and_saved_searches.sql`** — DDL that
   was applied out-of-band (SQL editor), so it never entered the migration
   history. These files are the authored source for `conversations`, `messages`,
   `saved_searches`, and `push_subscriptions`.
3. **`20260730000000_baseline_moderation_tables.sql`** — `content_reports` and
   `user_blocks` were also created out-of-band with no surviving file; this one
   is reconstructed from the live catalog and is a no-op on the live project.

When adding schema, prefer real migrations (dashboard → Database → Migrations,
or `supabase migration new`) so the history stays the single source of truth —
the out-of-band files above are the exception, not the pattern.

A few migrations reference optional infrastructure (Vault secrets for the push
pipeline, pg_cron schedules); they no-op gracefully until those are configured.
See [docs/backend.md](../../docs/backend.md).
