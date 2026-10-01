-- F8 / R-14 e R-52 (auditoria 2026-10-01, PERF-04, DATA-07, PERF-10): abrir uma
-- conversa fazia DUAS consultas so para a ficha (um count exato e a primeira
-- mensagem) e relia os membros do time a cada abertura.
--
-- 1) chat_resumo_conversa: o total de mensagens e a data da primeira, de UMA
--    conversa, numa ida so. security invoker: a RLS do tenant vale (como nas
--    consultas de antes, que tambem filtravam so por `phone`; o tenant nao vem
--    por parametro para a pagina nao ter de esperar por getMyClient). Devolve
--    sempre UMA linha (total 0 e primeira NULL quando nao ha mensagem).
--
-- 2) tenant_members_do_cliente: os membros de um tenant dado o id dele, para a
--    leitura em cache por tenant (unstable_cache + tag, lib/team-servidor.ts).
--    `tenant_members()` depende de auth.uid(), entao nao pode rodar dentro de um
--    cache compartilhado; esta recebe o tenant (que vem de getMyClient, nunca de
--    entrada do usuario) e so o service_role executa. Mesma ordem e mesmas
--    colunas de tenant_members().
--
-- Idempotente: create or replace.

create or replace function public.chat_resumo_conversa(p_phone text)
returns table (total bigint, primeira timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint, min(m.created_at)
  from public.chat_messages m
  where m.phone = p_phone;
$$;

revoke all on function public.chat_resumo_conversa(text) from public, anon;
grant execute on function public.chat_resumo_conversa(text) to authenticated;

comment on function public.chat_resumo_conversa(text) is
  'Total de mensagens e data da primeira de uma conversa (ficha do contato). Uma linha sempre. security invoker (RLS do tenant).';

create or replace function public.tenant_members_do_cliente(p_client uuid)
returns table (user_id uuid, email text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select uc.user_id, u.email::text, uc.role
  from public.user_clients uc
  join auth.users u on u.id = uc.user_id
  where uc.client_id = p_client
  order by (uc.role = 'dono') desc, u.email;
$$;

revoke all on function public.tenant_members_do_cliente(uuid) from public, anon, authenticated;
grant execute on function public.tenant_members_do_cliente(uuid) to service_role;

comment on function public.tenant_members_do_cliente(uuid) is
  'Membros (user_id, email, role) de um tenant dado o id. So service_role: alimenta o cache por tenant do servidor (lib/team-servidor.ts). O CRM no browser usa tenant_members().';
