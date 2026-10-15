-- Central "Clientes", entrega 2: a conferencia do catalogo ANTES dos efeitos de
-- fora (Asaas, Storage, Evolution) no "Apagar de vez". admin_apagar_cliente ja
-- aborta com uma tabela com client_id fora da lista, mas so depois de a rotina
-- ter cancelado a assinatura e removido os arquivos; esta funcao deixa a rotina
-- (lib/admin.ts, apagarCliente) parar antes de tocar em qualquer coisa.
-- Aditiva, so leitura do catalogo, so service_role.
-- Porque: docs/adr/2026-10-15-two-step-company-deletion.md.

create or replace function public.admin_tabelas_fora_da_purga(p_tabelas text[])
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(t.relname::text order by t.relname), '{}'::text[])
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relkind = 'r'
     and not t.relispartition
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
     )
     and not (t.relname::text = any (coalesce(p_tabelas, '{}'::text[])));
$$;
revoke execute on function public.admin_tabelas_fora_da_purga(text[]) from public, anon, authenticated;
grant execute on function public.admin_tabelas_fora_da_purga(text[]) to service_role;
