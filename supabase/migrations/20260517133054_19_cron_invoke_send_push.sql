-- Migration 20260517133054 · 19_cron_invoke_send_push
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 19 · schedule the send-push edge function
-- ═══════════════════════════════════════════════════════
-- Drains the push_queue every minute by calling the
-- `send-push` edge function.
--
-- Requires Vault secrets:
--   SUPABASE_FUNCTIONS_URL    e.g. https://oxqnwqaumrqdiwrlvfel.supabase.co/functions/v1
--   SEND_PUSH_INTERNAL_SECRET (shared secret matching the edge function's INTERNAL_SECRET env)
--
-- You can store these in the Supabase dashboard under
--   Project Settings → Vault → Add secret.
-- ═══════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function invoke_send_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url       text;
  shared_secret  text;
begin
  -- Read from Vault. If either is missing, no-op silently so the cron
  -- doesn't blow up before keys are configured.
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

-- Drain the queue every minute
select cron.schedule(
  'invoke-send-push',
  '* * * * *',
  $$ select invoke_send_push(); $$
);
