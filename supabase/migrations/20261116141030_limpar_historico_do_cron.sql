-- Plano Free (dono, 14/11/2026): o historico do pg_cron (`cron.job_run_details`) cresce uma linha
-- por execucao e nunca era limpo (4.279 linhas, 2,2 MB desde 30/10, insert de 150 ms e update de
-- 122 ms por tick no Nano). Um job diario as 03h15 de Sao Paulo (06h15 UTC) apaga o que passou de
-- 7 dias; o historico recente continua para diagnostico.

select cron.schedule(
  'limpar_historico_do_cron',
  '15 6 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
