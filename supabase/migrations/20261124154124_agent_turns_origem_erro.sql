-- A falha da leitura da origem de campanha passa a ficar registrada no turno (24/11/2026).
-- De 07 a 23/11/2026 `origemDaCampanha` falhou em todo turno de toda empresa (embed ambiguo
-- no PostgREST) e o erro so foi ao console: a trava de robo nunca rodou e ninguem viu por 16
-- dias. Com a coluna, uma consulta em `agent_turns` mostra a falha no mesmo dia.
-- Guarda so a mensagem do erro (nunca dado do contato nem conteudo da conversa, como o resto
-- da tabela). null = a leitura funcionou ou nao houve leitura (turno silenciado antes dela).
-- Sem grant novo: a tabela e escrita so pelo service_role (`registrarTurno`, lib/agent-turn.ts).
-- docs/adr/2026-11-24-campaign-origin-embed-and-first-reply-window.md

alter table public.agent_turns add column if not exists origem_erro text;

comment on column public.agent_turns.origem_erro is
  'Mensagem do erro da leitura da origem de campanha (origemDaCampanha) neste turno; null = sem falha.';
