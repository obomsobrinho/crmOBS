-- O browser so escreve dados_cliente por UPDATE em colunas liberadas; criar contato
-- vai por rota service_role. INSERT, DELETE e TRUNCATE para authenticated eram
-- sobra do grant padrao do Supabase (30/09/2026).
revoke insert, delete, truncate on public.dados_cliente from authenticated;
revoke insert, delete, truncate on public.dados_cliente from anon;
