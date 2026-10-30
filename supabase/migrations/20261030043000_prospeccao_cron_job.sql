-- Campanhas v2: o tick de 5 em 5 minutos da prospeccao (D3, docs/plano-campanhas.md secao 5.2). A Vercel
-- Hobby so roda cron uma vez por dia, entao o pg_cron do Supabase chama GET /api/prospeccao/cron com o
-- CRON_SECRET como "Authorization: Bearer". Precisa das extensoes pg_cron e pg_net.
--
-- Os dois segredos moram no Vault e sao lidos A CADA EXECUCAO (nunca copiados para o texto do job, que
-- fica visivel em cron.job). Antes de aplicar, o dono cria no Vault (Dashboard, Project Settings, Vault):
--   prospeccao_cron_url    = a URL completa da rota, no dominio de producao, terminando em /api/prospeccao/cron
--   prospeccao_cron_bearer = o MESMO valor do CRON_SECRET da Vercel
-- Sem os segredos o job roda e nao chama nada (o where abaixo). Para desligar:
--   select cron.unschedule('prospeccao_tick_5m');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'prospeccao_tick_5m';

select cron.schedule(
  'prospeccao_tick_5m',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := u.decrypted_secret,
    headers := jsonb_build_object('Authorization', 'Bearer ' || b.decrypted_secret),
    timeout_milliseconds := 60000
  )
  from vault.decrypted_secrets u, vault.decrypted_secrets b
  where u.name = 'prospeccao_cron_url' and b.name = 'prospeccao_cron_bearer';
  $job$
);
