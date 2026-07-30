-- Migration 20260520100155 · fix_match_listing_to_alerts_self_ref
-- Exported from the live project's applied-migration history.
-- BUG: the FOR loop variable `a` was referenced (a.title) inside the SELECT
-- that populates it, which Postgres rejects with
-- "record \"a\" is not assigned yet" — blocking every listing insert.
-- FIX: alias the alerts table as `alr` inside the query so the title match
-- reads from the table row, not the not-yet-assigned loop record.
CREATE OR REPLACE FUNCTION public.match_listing_to_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
begin
  -- Only run for active listings
  if new.status <> 'active' then return new; end if;

  for a in
    select alr.*
    from alerts alr
    where alr.status = 'active'
      and alr.expires_at > now()
      and alr.user_id <> new.user_id
      and (alr.community_id is null or alr.community_id = new.community_id)
      and (alr.category_id is null or alr.category_id = new.category_id)
      and (alr.condition is null or alr.condition = new.condition)
      and (
        alr.max_price is null
        or new.listing_type <> 'sell'
        or coalesce(new.price, 0) <= alr.max_price
      )
      and (
        alr.location_pref is null
        or new.location ilike '%' || alr.location_pref || '%'
      )
      and (
        new.title ilike '%' || alr.title || '%'
        or new.description ilike '%' || alr.title || '%'
        or to_tsvector('english', coalesce(new.title,'') || ' ' || coalesce(new.description,''))
             @@ websearch_to_tsquery('english', alr.title)
      )
  loop
    update alerts
       set match_count = match_count + 1,
           last_matched_at = now()
     where id = a.id;

    insert into notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    values (
      a.user_id, new.user_id, 'alert_match', 'listing', new.id,
      'Match for "' || a.title || '"', new.title
    );

    if a.notify is not null then
      insert into push_queue (user_id, channel, payload)
      values (
        a.user_id, a.notify,
        jsonb_build_object(
          'kind', 'alert_match', 'alert_id', a.id, 'alert_title', a.title,
          'listing_id', new.id, 'listing_title', new.title,
          'listing_user_id', new.user_id, 'community_id', new.community_id
        )
      );
    end if;
  end loop;

  return new;
end;
$function$;
