-- Limpa as marcas dos avisos de IA do mes que um teto novo deixou para tras. Aditiva e
-- compativel com o codigo implantado: nada que ele chama muda; so o codigo novo a chama.
-- Porque: o teto agora segue o PLANO (LIMITE_POR_PLANO, lib/custo-ia.ts), entao trocar o
-- plano (admin_mudar_conta mudar_plano, /api/billing/subscribe) muda o teto sem passar por
-- admin_mudar_limite_ia, que era o unico lugar que limpava as marcas. Os limiares chegam
-- calculados pelo app (limiaresDaEmpresa, lib/custo-ia.ts: a MESMA regra de
-- admin_mudar_limite_ia): a marca de um nivel cujo limiar ficou acima do uso do mes e
-- limpa, para o aviso voltar a sair se o uso cruzar de novo. Devolve quantas linhas mudou.
-- Ver docs/adr/2026-10-16-central-picos-plan-caps-ptax-and-cards.md.

create or replace function public.limpar_marcas_consumo_ia(
  p_client uuid,
  p_mes date,
  p_limiar_aviso bigint,
  p_limiar_parado bigint
) returns integer
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.consumo_ia_mensal m
       set aviso_80_em = case when m.tokens_entrada + m.tokens_saida < p_limiar_aviso then null else m.aviso_80_em end,
           aviso_100_em = case when m.tokens_entrada + m.tokens_saida < p_limiar_parado then null else m.aviso_100_em end
     where m.client_id = p_client
       and m.mes = p_mes
       and (
         (m.aviso_80_em is not null and m.tokens_entrada + m.tokens_saida < p_limiar_aviso)
         or (m.aviso_100_em is not null and m.tokens_entrada + m.tokens_saida < p_limiar_parado)
       )
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.limpar_marcas_consumo_ia(uuid, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.limpar_marcas_consumo_ia(uuid, date, bigint, bigint) to service_role;
