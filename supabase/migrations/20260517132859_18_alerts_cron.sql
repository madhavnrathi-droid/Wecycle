-- Migration 20260517132859 · 18_alerts_cron
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 18 · pg_cron — expire alerts + purge after 2 days
-- ═══════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- ── Mark expired and create inbox notifications ──────
create or replace function mark_expired_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  expired record;
  cnt int := 0;
begin
  for expired in
    update alerts
       set status = 'expired'
     where status = 'active'
       and expires_at <= now()
    returning *
  loop
    cnt := cnt + 1;
    insert into notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    values (
      expired.user_id,
      null,
      'alert_expired',
      'alert',
      expired.id,
      'Alert auto-deleted',
      'Your alert "' || expired.title || '" expired after ' || expired.duration_hours || ' hours.'
    );
  end loop;
  return cnt;
end;
$$;
revoke execute on function public.mark_expired_alerts() from anon, authenticated, public;

-- ── Hard-delete alerts that have been expired for 2+ days ──
create or replace function purge_old_expired_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  delete from alerts
   where status = 'expired'
     and expires_at < now() - interval '2 days';
  get diagnostics cnt = row_count;
  return cnt;
end;
$$;
revoke execute on function public.purge_old_expired_alerts() from anon, authenticated, public;

-- ── pg_cron schedules ────────────────────────────────
-- Mark expired alerts every 5 minutes
select cron.schedule(
  'mark-expired-alerts',
  '*/5 * * * *',
  $$ select mark_expired_alerts(); $$
);
-- Purge old expired alerts once an hour
select cron.schedule(
  'purge-old-expired-alerts',
  '0 * * * *',
  $$ select purge_old_expired_alerts(); $$
);
