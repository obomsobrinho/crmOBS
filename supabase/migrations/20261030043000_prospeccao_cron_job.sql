-- Campanhas v2: pg_cron tick every 5 minutes (D3). Requires extensions pg_cron and pg_net.
-- Owner must create Vault secrets (Dashboard > Project Settings > Vault):
--   prospeccao_cron_url  = full URL, e.g. https://atendimento.obomsobrinho.com.br/api/prospeccao/cron
--   prospeccao_cron_bearer = same value as CRON_SECRET in Vercel
-- This migration only schedules the job when both secrets exist.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_url text;
  v_bearer text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'prospeccao_cron_url' limit 1;
  select decrypted_secret into v_bearer from vault.decrypted_secrets where name = 'prospeccao_cron_bearer' limit 1;
  if v_url is null or v_bearer is null then
    raise notice 'prospeccao cron job skipped: create vault secrets prospeccao_cron_url and prospeccao_cron_bearer';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'prospeccao_tick_5m';
  perform cron.schedule(
    'prospeccao_tick_5m',
    '*/5 * * * *',
    format(
      $cmd$select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || %L)
      );$cmd$,
      v_url,
      v_bearer
    )
  );
end;
$$;
