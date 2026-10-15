-- Central "Clientes" do dono, revisao da entrega 1 (docs/plano-central-clientes.md,
-- "Delivery 1 revision"): o grafico de Uso de IA ganhou o periodo "Dia", que sai
-- POR HORA. Aditivo e so service_role: admin_cliente_uso (migration
-- 20261014215549) nao e tocada, e o codigo ja implantado segue chamando a de
-- sempre.
--
-- admin_cliente_uso_horas: o uso de IA de UMA empresa por hora civil de
-- America/Sao_Paulo (turnos e tokens), numa janela limitada. A condicao de turno
-- e a mesma de admin_cliente_uso e do logTurn (turno que chamou o modelo, bancada
-- incluida), para as horas somarem o mesmo que os dias. Le agent_turns pelo
-- indice (client_id, created_at).
--   [[data, hora, turnos, entrada, cache, saida], ...]   so horas com turno
-- A janela nunca passa de 48 horas, qualquer que seja o p_ate recebido.

create or replace function public.admin_cliente_uso_horas(
  p_client uuid,
  p_de timestamptz,
  p_ate timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(d, hr, n, i, c, o) order by d, hr), '[]'::jsonb)
  from (
    select (t.created_at at time zone 'America/Sao_Paulo')::date as d,
           extract(hour from (t.created_at at time zone 'America/Sao_Paulo'))::int as hr,
           count(*)::int as n,
           sum(coalesce(t.input_tokens, 0))::bigint as i,
           sum(coalesce(t.cached_input_tokens, 0))::bigint as c,
           sum(coalesce(t.output_tokens, 0))::bigint as o
    from public.agent_turns t
    where t.client_id = p_client
      and t.created_at >= p_de
      and t.created_at < least(p_ate, p_de + interval '48 hours')
      and (t.input_tokens is not null or t.output_tokens is not null)
    group by 1, 2
  ) x;
$$;
revoke execute on function public.admin_cliente_uso_horas(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_cliente_uso_horas(uuid, timestamptz, timestamptz) to service_role;
