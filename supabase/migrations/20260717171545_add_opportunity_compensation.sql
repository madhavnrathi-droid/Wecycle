-- Migration 20260717171545 · add_opportunity_compensation
-- Exported from the live project's applied-migration history.
alter table public.listings add column if not exists comp text;
alter table public.listings add column if not exists price_band text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_comp_check') then
    alter table public.listings add constraint listings_comp_check
      check (comp is null or comp in ('volunteer','free','paid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listings_price_band_check') then
    alter table public.listings add constraint listings_price_band_check
      check (price_band is null or price_band in ('under_200','200_500','500_1000','over_1000'));
  end if;
end $$;
