-- P1 item 5, revisao do arquiteto: as regras salvas pelo time saem de
-- agent_config.regrasSalvas para uma coluna propria. So a rota agent-rules
-- (service_role) escreve, por troca condicional (trocar_regras_salvas), para
-- dois saves ao mesmo tempo nunca perderem uma regra.
-- Porque: docs/adr/2026-10-13-orientation-saved-as-agent-rule.md.

alter table public.clients
  add column if not exists regras_salvas jsonb not null default '[]'::jsonb;
alter table public.clients drop constraint if exists clients_regras_salvas_array;
alter table public.clients
  add constraint clients_regras_salvas_array check (jsonb_typeof(regras_salvas) = 'array');
comment on column public.clients.regras_salvas is
  'Regras salvas pelo time a partir de orientacoes (array de textos). Escrita so por service_role via trocar_regras_salvas.';

-- Leitura pela sessao do dono segue o SELECT de tabela de clients (RLS do tenant);
-- nenhuma escrita do navegador (clients nao tem UPDATE para authenticated).
revoke all (regras_salvas) on public.clients from anon;

-- Backfill: quem ja tinha a chave no agent_config passa para a coluna.
update public.clients
   set regras_salvas = case
         when jsonb_typeof(agent_config -> 'regrasSalvas') = 'array' then agent_config -> 'regrasSalvas'
         else '[]'::jsonb
       end,
       agent_config = agent_config - 'regrasSalvas'
 where agent_config ? 'regrasSalvas';

-- Troca condicional: so grava se a lista e o prompt gravado ainda sao os que a
-- rota leu. Devolve false quando outro save chegou antes (a rota rele e tenta de novo).
create or replace function public.trocar_regras_salvas(
  p_client uuid,
  p_antes jsonb,
  p_depois jsonb,
  p_persona_antes text,
  p_persona text
) returns boolean
language sql
security invoker
set search_path = public
as $$
  with feito as (
    update public.clients
       set regras_salvas = p_depois,
           persona = p_persona
     where id = p_client
       and regras_salvas = p_antes
       and persona is not distinct from p_persona_antes
    returning 1
  )
  select exists (select 1 from feito);
$$;
revoke execute on function public.trocar_regras_salvas(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.trocar_regras_salvas(uuid, jsonb, jsonb, text, text) to service_role;
