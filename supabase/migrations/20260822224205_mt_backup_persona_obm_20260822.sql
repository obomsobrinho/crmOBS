-- Retrato da persona antes da recompilacao da OBM. Tabela de backup, nao faz
-- parte do modelo: existe para provar nao-regressao e para voltar atras.
create table if not exists public._persona_backup_20260822 as
select id, name, persona, prompt_mode, now() as tirado_em
from public.clients;

revoke all on public._persona_backup_20260822 from anon, authenticated;
