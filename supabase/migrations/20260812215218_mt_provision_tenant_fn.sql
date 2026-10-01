-- Fase 4, cadastro self-service: cria o tenant de um usuário novo.
--
-- Existe como FUNÇÃO (e não como 3 inserts na rota) por um motivo só: atomicidade
-- de verdade. `clients` + `user_clients` + funil inicial entram na mesma
-- transação, então nunca sobra tenant sem dono nem funil pela metade se algo
-- falhar no meio.
--
-- IDEMPOTENTE: se o usuário já tem vínculo, devolve o tenant existente sem criar
-- nada. Isso é o que permite a rota de cadastro ser reexecutada com segurança.
--
-- security definer porque insere em tabelas que `authenticated` não pode escrever;
-- mesmo assim só service_role pode CHAMAR (revoke + grant abaixo), então não é
-- caminho de escalada para o browser.

create or replace function public.provision_tenant(
  p_user_id uuid,
  p_company_name text,
  p_trial_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_existing uuid;
begin
  select client_id into v_existing
    from public.user_clients
   where user_id = p_user_id
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- name é NOT NULL: nome vazio estoura aqui e a transação inteira volta atrás.
  insert into public.clients (name, subscription_status, trial_ends_at, billing_updated_at)
  values (nullif(btrim(p_company_name), ''), 'trialing', p_trial_ends_at, now())
  returning id into v_client_id;

  insert into public.user_clients (user_id, client_id, role)
  values (p_user_id, v_client_id, 'dono');

  -- Funil inicial, igual ao dos tenants existentes (mt_pipeline_stages). Os três
  -- primeiros são canônicos: é neles que a IA move o card.
  insert into public.pipeline_stages
    (client_id, key, name, position, is_canonical, is_default, color)
  values
    (v_client_id, 'novo', 'Novo', 0, true, true, 'blue'),
    (v_client_id, 'qualificado', 'Qualificado', 1, true, false, 'violet'),
    (v_client_id, 'aguardando_humano', 'Aguardando atendimento', 2, true, false, 'amber'),
    (v_client_id, 'fechado', 'Fechado', 3, false, false, 'green');

  return v_client_id;
end;
$$;

revoke all on function public.provision_tenant(uuid, text, timestamptz) from public;
revoke all on function public.provision_tenant(uuid, text, timestamptz) from anon;
revoke all on function public.provision_tenant(uuid, text, timestamptz) from authenticated;
grant execute on function public.provision_tenant(uuid, text, timestamptz) to service_role;

comment on function public.provision_tenant(uuid, text, timestamptz) is
  'Cadastro self-service: cria clients + user_clients (dono) + funil inicial numa transação. Idempotente por user_id. Só service_role executa (app/api/signup).';
