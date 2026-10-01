-- Lista os membros (login + papel) do(s) tenant(s) do usuário logado, resolvendo
-- o e-mail em auth.users. Necessária porque `authenticated` só enxerga a própria
-- linha em user_clients (policy user_id = auth.uid()) e não pode ler auth.users.
-- SECURITY DEFINER: roda como owner (bypassa RLS), mas filtra pelo tenant do
-- caller via auth.uid(), então só devolve colegas do mesmo tenant.
create or replace function public.tenant_members()
returns table (user_id uuid, email text, role text)
language sql
security definer
set search_path = ''
as $$
  select uc.user_id, u.email::text, uc.role
  from public.user_clients uc
  join auth.users u on u.id = uc.user_id
  where uc.client_id in (
    select self.client_id
    from public.user_clients self
    where self.user_id = auth.uid()
  )
  order by (uc.role = 'dono') desc, u.email;
$$;

revoke all on function public.tenant_members() from public, anon;
grant execute on function public.tenant_members() to authenticated;

comment on function public.tenant_members() is
  'Membros (user_id, email, role) do tenant do usuário logado. Usada pela UI de Equipe e para resolver o atendente de cada conversa.';
