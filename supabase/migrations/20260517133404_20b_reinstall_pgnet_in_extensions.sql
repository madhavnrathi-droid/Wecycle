-- Migration 20260517133404 · 20b_reinstall_pgnet_in_extensions
-- Exported from the live project's applied-migration history.

-- pg_net doesn't support SET SCHEMA. Drop + reinstall into `extensions` schema.
drop extension if exists pg_net cascade;
create extension if not exists pg_net schema extensions;

-- Re-create the cron invoker (the function was dropped by cascade).
create or replace function invoke_send_push()
returns void
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  base_url       text;
  shared_secret  text;
begin
  begin
    select decrypted_secret into base_url
      from vault.decrypted_secrets where name = 'SUPABASE_FUNCTIONS_URL' limit 1;
  exception when others then
    base_url := null;
  end;
  begin
    select decrypted_secret into shared_secret
      from vault.decrypted_secrets where name = 'SEND_PUSH_INTERNAL_SECRET' limit 1;
  exception when others then
    shared_secret := null;
  end;

  if base_url is null or shared_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', shared_secret
    ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.invoke_send_push() from anon, authenticated, public;

-- Re-schedule (the previous schedule was dropped with the dependent function).
select cron.unschedule('invoke-send-push') where exists (
  select 1 from cron.job where jobname = 'invoke-send-push'
);
select cron.schedule(
  'invoke-send-push',
  '* * * * *',
  $$ select invoke_send_push(); $$
);
