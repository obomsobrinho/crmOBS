-- Central "Clientes" do dono, ajustes de 15/10/2026 (docs/plano-central-clientes.md):
-- o grafico de Uso de IA ganhou "Todo o periodo", com UMA coluna por mes civil de
-- America/Sao_Paulo. Aditivo e so service_role: admin_cliente_uso e
-- admin_cliente_uso_horas nao sao tocadas, e o codigo ja implantado segue chamando
-- as de sempre. Um mes passado SEM mudanca de SQL: o navegador pede admin_cliente_uso
-- com a janela daquele mes.
--
-- admin_cliente_uso_meses: o uso de IA de UMA empresa por mes civil (turnos e
-- tokens), numa janela limitada. A condicao de turno e a mesma de admin_cliente_uso
-- e do logTurn (turno que chamou o modelo, bancada incluida), para os meses somarem
-- o mesmo que os dias. Le agent_turns pelo indice (client_id, created_at), a partir
-- do primeiro turno da empresa (quem chama passa p_de = o mes da primeira atividade).
--   [[AAAA-MM, turnos, entrada, cache, saida], ...]   so meses com turno
-- A janela nunca passa de 60 meses, qualquer que seja o p_ate recebido.

create or replace function public.admin_cliente_uso_meses(
  p_client uuid,
  p_de timestamptz,
  p_ate timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(m, n, i, c, o) order by m), '[]'::jsonb)
  from (
    select to_char(t.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as m,
           count(*)::int as n,
           sum(coalesce(t.input_tokens, 0))::bigint as i,
           sum(coalesce(t.cached_input_tokens, 0))::bigint as c,
           sum(coalesce(t.output_tokens, 0))::bigint as o
    from public.agent_turns t
    where t.client_id = p_client
      and t.created_at >= p_de
      and t.created_at < least(p_ate, p_de + interval '60 months')
      and (t.input_tokens is not null or t.output_tokens is not null)
    group by 1
  ) x;
$$;
revoke execute on function public.admin_cliente_uso_meses(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_cliente_uso_meses(uuid, timestamptz, timestamptz) to service_role;
