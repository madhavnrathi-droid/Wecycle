-- Migration 20260517132841 · 17_alert_matching_trigger
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 17 · match new listings to active alerts
-- ═══════════════════════════════════════════════════════

-- Allow notifications.entity_type to be NULL (alert notifications
-- don't always reference a feed entity). Already nullable per schema —
-- this is just a safety check.

-- Use the listing's text + title to do a simple containment match against
-- alert titles. For a richer match, plug in pg_trgm or vector similarity.

create or replace function match_listing_to_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  -- Only run for active listings
  if new.status <> 'active' then return new; end if;

  for a in
    select *
    from alerts
    where status = 'active'
      and expires_at > now()
      and user_id <> new.user_id
      and (community_id is null or community_id = new.community_id)
      and (category_id is null or category_id = new.category_id)
      and (condition is null or condition = new.condition)
      -- price check: only relevant when listing is "sell"; "free", "borrow", "swap" always pass
      and (
        max_price is null
        or new.listing_type <> 'sell'
        or coalesce(new.price, 0) <= max_price
      )
      -- location proximity: substring match (improve with PostGIS later)
      and (
        location_pref is null
        or new.location ilike '%' || location_pref || '%'
      )
      -- fuzzy title match: any of the alert title's tokens appear in listing text
      and (
        new.title ilike '%' || a.title || '%'
        or new.description ilike '%' || a.title || '%'
        or to_tsvector('english', coalesce(new.title,'') || ' ' || coalesce(new.description,''))
             @@ websearch_to_tsquery('english', a.title)
      )
  loop
    -- bump match count; keep alert active so more matches can follow
    update alerts
       set match_count = match_count + 1,
           last_matched_at = now()
     where id = a.id;

    -- in-app notification
    insert into notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    values (
      a.user_id,
      new.user_id,
      'alert_match',
      'listing',
      new.id,
      'Match for "' || a.title || '"',
      new.title
    );

    -- push job (only if user picked email or phone)
    if a.notify is not null then
      insert into push_queue (user_id, channel, payload)
      values (
        a.user_id,
        a.notify,
        jsonb_build_object(
          'kind',            'alert_match',
          'alert_id',        a.id,
          'alert_title',     a.title,
          'listing_id',      new.id,
          'listing_title',   new.title,
          'listing_user_id', new.user_id,
          'community_id',    new.community_id
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.match_listing_to_alerts() from anon, authenticated, public;

create trigger trg_listing_match_alerts
  after insert on listings
  for each row execute function match_listing_to_alerts();
