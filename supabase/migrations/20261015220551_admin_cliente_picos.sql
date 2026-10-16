-- Central "Clientes" do dono, rodada de 16/10/2026 (docs/plano-central-clientes.md): os
-- "Horarios de pico" ganharam um filtro de periodo (chips, mes, todo o periodo e um intervalo
-- de datas escolhido), entao a aba precisa de turnos por DIA e por (dia da semana x hora)
-- de uma janela qualquer. Aditivo e so service_role: nenhuma funcao existente muda.
--
-- admin_cliente_picos: para cada janela [p_de[i], p_ate[i]) devolve um objeto
--   {"dias": [[AAAA-MM-DD, turnos], ...], "cubo": [[dia_da_semana, hora, turnos], ...]}
-- (0 = domingo; so dias e horas com turno), em America/Sao_Paulo. Mesma condicao de turno de
-- admin_cliente_uso e do logTurn (turno que chamou o modelo, bancada incluida). Sempre agregado
-- no banco, nunca linhas para contar, lendo agent_turns pelo indice (client_id, created_at).
-- Limites dentro da funcao, qualquer que seja o parametro: no maximo 8 janelas; cada janela
-- comeca no primeiro turno da empresa (nunca antes dele) e nao passa de 1830 dias.

create or replace function public.admin_cliente_picos(
  p_client uuid,
  p_de timestamptz[],
  p_ate timestamptz[]
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_saida jsonb := '[]'::jsonb;
  v_primeiro timestamptz;
  v_de timestamptz;
  v_ate timestamptz;
  v_i int;
  v_n int := least(coalesce(array_length(p_de, 1), 0), coalesce(array_length(p_ate, 1), 0), 8);
begin
  select min(t.created_at) into v_primeiro from public.agent_turns t where t.client_id = p_client;
  for v_i in 1 .. v_n loop
    v_de := greatest(p_de[v_i], coalesce(v_primeiro, p_de[v_i]));
    v_ate := least(p_ate[v_i], v_de + interval '1830 days');
    v_saida := v_saida || jsonb_build_array((
      with g as (
        select (t.created_at at time zone 'America/Sao_Paulo') as l
        from public.agent_turns t
        where t.client_id = p_client
          and t.created_at >= v_de
          and t.created_at < v_ate
          and (t.input_tokens is not null or t.output_tokens is not null)
      )
      select jsonb_build_object(
        'dias', coalesce((
          select jsonb_agg(jsonb_build_array(d, n) order by d)
          from (select l::date as d, count(*)::int as n from g group by 1) x
        ), '[]'::jsonb),
        'cubo', coalesce((
          select jsonb_agg(jsonb_build_array(dw, hr, n) order by dw, hr)
          from (
            select extract(dow from l)::int as dw, extract(hour from l)::int as hr, count(*)::int as n
            from g group by 1, 2
          ) y
        ), '[]'::jsonb)
      )
    ));
  end loop;
  return v_saida;
end;
$$;
revoke execute on function public.admin_cliente_picos(uuid, timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.admin_cliente_picos(uuid, timestamptz[], timestamptz[]) to service_role;
