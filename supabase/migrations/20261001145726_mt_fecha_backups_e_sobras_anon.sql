-- Backups de persona: so o service_role le. Estavam sem RLS e o de 20/08 dava
-- SELECT ao anon (a chave publica do site), ou seja, legivel pela API por qualquer um.
alter table public._persona_backup_20260820 enable row level security;
alter table public._persona_backup_20260822 enable row level security;
revoke all on public._persona_backup_20260820 from anon, authenticated;
revoke all on public._persona_backup_20260822 from anon, authenticated;

-- anon nunca le nem escreve nada (CLAUDE.md, Isolamento). A RLS ja barrava,
-- mas os grants sobraram.
revoke all on public.chat_messages from anon;
revoke all on public.pipeline_stages from anon;
revoke all on public.dados_cliente from anon;
