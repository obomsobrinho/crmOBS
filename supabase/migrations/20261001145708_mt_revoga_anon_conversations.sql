-- anon nunca le nada (CLAUDE.md, Isolamento). A RLS ja barrava as linhas,
-- mas o grant de tabela sobrou em conversations.
revoke all on public.conversations from anon;
