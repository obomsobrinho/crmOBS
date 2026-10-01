-- RLS: auth.uid() avaliado UMA vez por consulta, e nao por linha (lint
-- auth_rls_initplan do Supabase). A regra e IDENTICA: so troca auth.uid() por
-- (select auth.uid()), que o Postgres calcula como initplan.
do $$
declare
  p record;
  usando text;
  checando text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  loop
    usando := replace(p.qual, 'auth.uid()', '( SELECT auth.uid() AS uid)');
    checando := replace(p.with_check, 'auth.uid()', '( SELECT auth.uid() AS uid)');
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if usando is not null then sql := sql || format(' using (%s)', usando); end if;
    if checando is not null then sql := sql || format(' with check (%s)', checando); end if;
    execute sql;
  end loop;
end $$;
