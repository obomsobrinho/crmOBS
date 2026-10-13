-- trocar_regras_salvas: o prompt gravado (clients.persona) pode ser nulo. A rota
-- manda '' nesse caso, e a comparacao trata nulo como ''.
-- Porque: docs/adr/2026-10-13-orientation-saved-as-agent-rule.md.

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
       and coalesce(persona, '') = coalesce(p_persona_antes, '')
    returning 1
  )
  select exists (select 1 from feito);
$$;
revoke execute on function public.trocar_regras_salvas(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.trocar_regras_salvas(uuid, jsonb, jsonb, text, text) to service_role;
