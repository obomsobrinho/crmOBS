-- R-11 / R-36 (auditoria 2026-10-01): privilegios padrao do schema public.
--
-- ESTADO MEDIDO (pg_default_acl, somente leitura, 2026-10-01): para os donos
-- postgres e supabase_admin, tabelas novas em public nascem com
-- arwdDxtm para anon, authenticated e service_role; sequences com rwU; funcoes
-- com X. Ou seja, a proxima tabela ou funcao fica legivel por anon assim que
-- alguem esquecer o RLS ou o revoke (foi assim que _persona_backup_* vazou, e
-- ha quatro migrations de limpeza depois do fato).
--
-- O QUE ESTA MIGRATION FAZ (conservadora, so o que a auditoria provou):
--   1. anon deixa de receber qualquer privilegio padrao em tabelas, sequences e
--      funcoes de public (anon nunca le nem escreve nada: CLAUDE.md, Isolamento).
--   2. authenticated deixa de receber TRUNCATE padrao em tabelas novas. TRUNCATE
--      ignora RLS e o browser nunca o usa.
--   3. Nas tabelas que JA existem, tira TRUNCATE de authenticated e tira
--      INSERT/UPDATE/DELETE de chat_messages e user_clients (o browser so le essas
--      duas: quem escreve e service_role. Conferido no codigo: nenhum
--      .insert/.update/.delete do browser toca nelas).
--
-- O QUE FICA DE FORA DE PROPOSITO:
--   - SELECT/INSERT/UPDATE/DELETE de authenticated nas demais tabelas: o RLS
--     espera esses grants e cada tabela nova deve pedi-los explicitamente.
--   - REFERENCES/TRIGGER de authenticated: a auditoria nao provou dano.
--   - Execucao de funcoes por PUBLIC: revogar o default global de PUBLIC afetaria
--     todos os schemas. A regra continua a do repo: toda funcao nova faz
--     `revoke execute ... from anon, public` e `grant execute ... to <quem usa>`.
--   - public.sem_acento fica executavel (funcao pura, usada por funcoes invoker).
--
-- NADA aqui muda comportamento do app: nenhuma rota ou tela usa os privilegios
-- removidos. Rollback: os mesmos grants de volta (ver a lista no fim).

-- 1 e 2: defaults de objetos futuros criados pelo role que aplica migrations.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke truncate on tables from authenticated;

-- Mesmo para supabase_admin (objetos criados pelo painel do Supabase). Pode nao
-- ser permitido a quem aplica a migration: nesse caso so avisa e segue.
do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke all on tables from anon;
  alter default privileges for role supabase_admin in schema public
    revoke all on sequences from anon;
  alter default privileges for role supabase_admin in schema public
    revoke all on functions from anon;
  alter default privileges for role supabase_admin in schema public
    revoke truncate on tables from authenticated;
exception when insufficient_privilege then
  raise notice 'sem permissao para alterar defaults de supabase_admin; aplicar pelo painel se necessario';
end $$;

-- 3: tabelas que ja existem.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate on public.%I from authenticated', t.relname);
  end loop;
end $$;

revoke insert, update, delete on public.chat_messages from authenticated;
revoke insert, update, delete on public.user_clients from authenticated;

-- Rollback (so se algo quebrar, nao esperado):
--   grant truncate on <tabela> to authenticated;
--   grant insert, update, delete on public.chat_messages, public.user_clients to authenticated;
--   alter default privileges for role postgres in schema public grant all on tables to anon;
