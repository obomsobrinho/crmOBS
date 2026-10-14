-- P1 item 6, revisao do arquiteto: avisos de uso de IA dentro do contador do mes e
-- a troca do teto com o registro numa transacao so.
-- Porque: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md.
--
-- 1. As marcas dos avisos (80% e 100%) viram colunas de consumo_ia_mensal
--    (aviso_80_em, aviso_100_em). A leitura pela chave que o turno ja faz diz se ha
--    aviso pendente, entao nenhuma escrita acontece por mensagem depois do aviso.
--    Reivindicar = update condicional (so quem acha a marca nula manda); liberar =
--    voltar a marca para nula quando o envio falhou, para o proximo turno real
--    tentar de novo. consumo_ia_avisos e marcar_aviso_consumo saem.
-- 2. somar_consumo_ia devolve tambem as marcas (o turno decide o aviso sem outra
--    leitura).
-- 3. admin_mudar_limite_ia: trava a linha da empresa, grava o teto, registra em
--    admin_acoes (antes e depois) e limpa as marcas do mes que o teto novo deixou
--    para tras, tudo na mesma transacao. Os limiares chegam do app
--    (lib/custo-ia.ts e a unica fonte da regra de 80% e 100%).

alter table public.consumo_ia_mensal add column if not exists aviso_80_em timestamptz;
alter table public.consumo_ia_mensal add column if not exists aviso_100_em timestamptz;
comment on column public.consumo_ia_mensal.aviso_80_em is
  'Quando o aviso de 80% do mes foi reivindicado (null = ainda nao, ou liberado porque o envio falhou ou o teto subiu).';
comment on column public.consumo_ia_mensal.aviso_100_em is
  'Quando o aviso de 100% do mes foi reivindicado (null = ainda nao, ou liberado porque o envio falhou ou o teto subiu).';

drop function if exists public.marcar_aviso_consumo(uuid, date, text);
drop table if exists public.consumo_ia_avisos;

drop function if exists public.somar_consumo_ia(uuid, date, bigint, bigint, bigint);
create function public.somar_consumo_ia(
  p_client uuid,
  p_mes date,
  p_entrada bigint,
  p_cache bigint,
  p_saida bigint
) returns table (
  tokens_entrada bigint,
  tokens_cache bigint,
  tokens_saida bigint,
  aviso_80_em timestamptz,
  aviso_100_em timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  insert into public.consumo_ia_mensal as c (client_id, mes, tokens_entrada, tokens_cache, tokens_saida)
  values (
    p_client,
    p_mes,
    greatest(coalesce(p_entrada, 0), 0),
    greatest(coalesce(p_cache, 0), 0),
    greatest(coalesce(p_saida, 0), 0)
  )
  on conflict (client_id, mes) do update
     set tokens_entrada = c.tokens_entrada + excluded.tokens_entrada,
         tokens_cache = c.tokens_cache + excluded.tokens_cache,
         tokens_saida = c.tokens_saida + excluded.tokens_saida,
         atualizado_em = now()
  returning c.tokens_entrada, c.tokens_cache, c.tokens_saida, c.aviso_80_em, c.aviso_100_em;
$$;
revoke execute on function public.somar_consumo_ia(uuid, date, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.somar_consumo_ia(uuid, date, bigint, bigint, bigint) to service_role;

-- true so para quem achou a marca nula (e a gravou agora).
create or replace function public.reivindicar_aviso_consumo(
  p_client uuid,
  p_mes date,
  p_nivel text
) returns boolean
language sql
security invoker
set search_path = ''
as $$
  with feito as (
    update public.consumo_ia_mensal
       set aviso_80_em = case when p_nivel = 'aviso' then now() else aviso_80_em end,
           aviso_100_em = case when p_nivel = 'parado' then now() else aviso_100_em end
     where client_id = p_client
       and mes = p_mes
       and ((p_nivel = 'aviso' and aviso_80_em is null)
         or (p_nivel = 'parado' and aviso_100_em is null))
    returning 1
  )
  select exists (select 1 from feito);
$$;
revoke execute on function public.reivindicar_aviso_consumo(uuid, date, text) from public, anon, authenticated;
grant execute on function public.reivindicar_aviso_consumo(uuid, date, text) to service_role;

-- O envio falhou: a marca volta a nula e o proximo turno real tenta de novo.
create or replace function public.liberar_aviso_consumo(
  p_client uuid,
  p_mes date,
  p_nivel text
) returns void
language sql
security invoker
set search_path = ''
as $$
  update public.consumo_ia_mensal
     set aviso_80_em = case when p_nivel = 'aviso' then null else aviso_80_em end,
         aviso_100_em = case when p_nivel = 'parado' then null else aviso_100_em end
   where client_id = p_client
     and mes = p_mes;
$$;
revoke execute on function public.liberar_aviso_consumo(uuid, date, text) from public, anon, authenticated;
grant execute on function public.liberar_aviso_consumo(uuid, date, text) to service_role;

-- Troca do teto pelo admin. Sem linha da empresa, nao devolve nada (a rota responde
-- 404). p_limiar_aviso e p_limiar_parado sao os limiares do teto NOVO, calculados
-- pelo app; a marca de um nivel cujo limiar ficou acima do uso do mes e limpa,
-- para o aviso voltar a sair se o uso cruzar de novo.
create or replace function public.admin_mudar_limite_ia(
  p_quem uuid,
  p_client uuid,
  p_limite bigint,
  p_mes date,
  p_limiar_aviso bigint,
  p_limiar_parado bigint
) returns table (antes bigint, depois bigint)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_antes bigint;
begin
  select c.ia_limite_tokens into v_antes
    from public.clients c
   where c.id = p_client
   for update;
  if not found then
    return;
  end if;

  update public.clients set ia_limite_tokens = p_limite where id = p_client;

  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (
    p_quem,
    'limite_ia',
    p_client::text,
    jsonb_build_object('ia_limite_tokens', v_antes),
    jsonb_build_object('ia_limite_tokens', p_limite)
  );

  update public.consumo_ia_mensal m
     set aviso_80_em = case when m.tokens_entrada + m.tokens_saida < p_limiar_aviso then null else m.aviso_80_em end,
         aviso_100_em = case when m.tokens_entrada + m.tokens_saida < p_limiar_parado then null else m.aviso_100_em end
   where m.client_id = p_client
     and m.mes = p_mes;

  return query select v_antes, p_limite;
end;
$$;
revoke execute on function public.admin_mudar_limite_ia(uuid, uuid, bigint, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_mudar_limite_ia(uuid, uuid, bigint, date, bigint, bigint) to service_role;
