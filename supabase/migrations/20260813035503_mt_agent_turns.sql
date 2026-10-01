-- Fase 4/5: registro de um turno do agente. Uma linha por mensagem que a IA
-- processou, com o diagnóstico que o /api/agent JÁ calcula e hoje descarta.
--
-- Para que serve: (1) custo real por conversa, que é o número menos verificado da
-- tabela de preços; (2) saber se a base de conhecimento está sendo usada de fato;
-- (3) quantas vezes o guardrail conteve a IA. Sem isso, preço e qualidade são
-- palpite.
--
-- NÃO guarda o conteúdo das mensagens (isso é `chat_messages`): só o "como foi o
-- turno". Assim a tabela fica pequena e não duplica conversa.
--
-- Escrita: só service_role (o próprio /api/agent). Leitura: membros do tenant,
-- porque o painel lê por RLS com a sessão do usuário.

create table if not exists public.agent_turns (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  phone text not null,
  created_at timestamptz not null default now(),

  -- Bancada de teste (playground) em vez de atendimento real. O custo é real
  -- (gastou token), mas as métricas de qualidade da operação devem excluir.
  dry_run boolean not null default false,

  -- O que a IA decidiu: none | agendar | pausar.
  action text not null,
  -- Quantas mensagens ela devolveu. 0 = turno silencioso.
  messages_sent integer not null default 0,
  -- Por que ficou em silêncio, quando ficou: nao_publicado | assinatura.
  silenced text,

  -- Base de conhecimento (RAG).
  rag_searched boolean not null default false,
  rag_matches integer not null default 0,
  rag_top_similarity real,

  -- Guardrail (checagem da resposta antes de enviar).
  guardrail_blocked boolean not null default false,
  guardrail_reason text,

  -- Custo e desempenho.
  latency_ms integer not null,
  model text,
  input_tokens integer,
  output_tokens integer
);

-- O painel filtra por tenant e período; o custo é agregado por mês.
create index if not exists agent_turns_client_created_idx
  on public.agent_turns (client_id, created_at desc);

alter table public.agent_turns enable row level security;

create policy "tenant read agent_turns"
  on public.agent_turns for select to authenticated
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()
    )
  );

-- Sem policy de escrita: o browser não grava turno. E anon não vê nada.
revoke all on public.agent_turns from anon;
revoke insert, update, delete, truncate on public.agent_turns from authenticated;

comment on table public.agent_turns is
  'Um turno do agente por linha (diagnóstico + consumo). Escrita só por service_role no /api/agent; leitura por membro do tenant (RLS). Não guarda conteúdo de mensagem.';
comment on column public.agent_turns.dry_run is
  'true = bancada de teste (playground). O custo é real, mas métricas de operação devem filtrar isto fora.';
comment on column public.agent_turns.silenced is
  'Por que o turno não respondeu nada: nao_publicado (agente não publicado) ou assinatura (conta bloqueada). null = turno normal.';
