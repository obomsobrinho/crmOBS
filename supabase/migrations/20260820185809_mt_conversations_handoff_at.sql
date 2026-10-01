-- Handoff em aberto por conversa.
--
-- Antes desta coluna, "handoff aberto" era representado por
-- dados_cliente.atendimento_ia='pause': a IA se pausava sozinha ao passar a
-- conversa para um humano. Isso tinha dois defeitos graves em producao:
-- (1) a pausa e porta de mao unica (alguem precisa reativar na mao), e por isso
--     46 dos 47 contatos da OBM estavam com a IA desligada permanentemente;
-- (2) com a IA pausada, a mensagem seguinte do cliente era gravada mas nunca
--     classificada, entao um pedido novo logo depois do handoff se perdia.
--
-- Agora handoff e pausa sao coisas separadas: handoff_at marca "a IA pediu ajuda
-- e ninguem do time respondeu ainda", e a pausa volta a significar so o que
-- deveria significar (um humano assumiu, ou alguem desligou a IA na mao).
--
-- Guarda o PRIMEIRO handoff em aberto, nao o ultimo: e isso que da a espera real
-- ("esperando ha 6h"). O resumo do ultimo pedido continua vindo de
-- conversation_qualifications, que ja grava uma linha por turno.
--
-- Sem backfill de proposito: as conversas hoje pausadas sao herança do
-- comportamento antigo (quase todas de junho de 2025) e marcar handoff nelas
-- encheria a fila de trabalho que ninguem vai fazer.
alter table public.conversations
  add column if not exists handoff_at timestamptz;

comment on column public.conversations.handoff_at is
  'Quando a IA abriu o handoff (action pausar/agendar) e o time ainda nao respondeu. Guarda o PRIMEIRO handoff em aberto, para medir a espera real. Limpo no envio manual (/api/send). Escrita so service_role.';

-- Leitura pelo browser (a lista do inbox filtra por ela). Escrita NAO: quem
-- abre o handoff e o /api/agent e quem limpa e o /api/send, os dois por
-- service_role. O grant de UPDATE em conversations e por coluna, entao nao
-- incluir handoff_at aqui ja e o bloqueio.
grant select (handoff_at) on public.conversations to authenticated;

create index if not exists conversations_handoff_idx
  on public.conversations (client_id, handoff_at)
  where handoff_at is not null;
