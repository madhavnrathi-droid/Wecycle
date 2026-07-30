-- Migration 20260524141239 · add_expires_at_to_requests
-- Exported from the live project's applied-migration history.
-- Add expires_at to requests so the new "post duration" slider (24h–7d)
-- can self-purge stale posts. Default = posted_at + 7 days for any row
-- that doesn't get one set explicitly, so legacy rows still expire cleanly.
alter table public.requests
  add column if not exists expires_at timestamptz;

update public.requests
   set expires_at = posted_at + interval '7 days'
 where expires_at is null;

-- Index for the fetch-active filter (`expires_at > now()`).
create index if not exists requests_expires_at_idx
  on public.requests (expires_at);
