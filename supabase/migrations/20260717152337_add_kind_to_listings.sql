-- Migration 20260717152337 · add_kind_to_listings
-- Exported from the live project's applied-migration history.
-- "Opportunity" (service) posts are listings with kind='opportunity'; physical
-- items stay kind='item'. Reuses the whole listings subsystem (detail, comments,
-- saves, edit/delete, metrics) rather than a separate table. Existing rows
-- backfill to 'item' via the default. condition stays NOT NULL (opportunities
-- store a hidden default); price is already nullable (free or a rate).
alter table public.listings add column if not exists kind text not null default 'item';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_kind_check') then
    alter table public.listings
      add constraint listings_kind_check check (kind in ('item', 'opportunity'));
  end if;
end $$;
