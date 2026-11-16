-- Plano Free (dono, 14/11/2026): o job de 5 min chamava a rota do cron 288 vezes por dia mesmo sem
-- nada a fazer. Agora so chama quando ha trabalho. A condicao repete o que a rota faz
-- (features/campanhas/server/cron.ts, manter os dois iguais):
--   1. campanha rodando (envio) ou agendada (ativacao);
--   2. envio em observacao: enviado ou respondido nos ultimos 14 dias (OBSERVACAO_DIAS), para
--      registrar a resposta e o pedido para parar;
--   3. busca ainda buscando (a rota confere a busca presa na fonte);
--   4. a janela da limpeza diaria, 03h00 a 03h04 de Sao Paulo (ehHoraDaLimpeza).

select cron.alter_job(
  (select jobid from cron.job where jobname = 'prospeccao_tick_5m'),
  command := $job$
  select net.http_get(
    url := u.decrypted_secret,
    headers := jsonb_build_object('Authorization', 'Bearer ' || b.decrypted_secret),
    timeout_milliseconds := 60000
  )
  from vault.decrypted_secrets u, vault.decrypted_secrets b
  where u.name = 'prospeccao_cron_url' and b.name = 'prospeccao_cron_bearer'
    and (
      exists (select 1 from public.prospeccao_campanhas where status in ('rodando', 'agendada'))
      or exists (
        select 1 from public.prospeccao_campanha_leads
        where enviado_em >= now() - interval '14 days' and status in ('enviado', 'respondeu')
      )
      or exists (select 1 from public.prospeccao_buscas where status = 'buscando')
      or (
        extract(hour from now() at time zone 'America/Sao_Paulo') = 3
        and extract(minute from now() at time zone 'America/Sao_Paulo') < 5
      )
    );
  $job$
);
