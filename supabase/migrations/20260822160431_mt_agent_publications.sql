-- Log de publicações do agente, e o liga-desliga separado da publicação.
--
-- POR QUE DUAS COISAS NUMA MIGRATION: as duas nascem da mesma decisão de
-- produto. Antes, `agent_published_at` fazia dois papéis ao mesmo tempo: "já foi
-- ao ar alguma vez" e "a IA responde agora". Isso quebrava ao desligar: zerar a
-- coluna fazia `onboardingState().complete` virar false e a barra de onboarding
-- reaparecia em TODAS as páginas pedindo "Publicar o agente", só porque alguém
-- desligou a IA por uma hora.
--
-- Agora:
--   agent_published_at  = primeira ativação, NUNCA é limpo (onboarding usa isso)
--   agent_enabled       = a IA responde ou não (o switch da tela do agente)
-- O processTurn emudece se qualquer um dos dois barrar.
alter table public.clients
  add column if not exists agent_enabled boolean not null default true;

comment on column public.clients.agent_enabled is
  'Liga-desliga do agente (switch "Agente ativo" em /agente). Separado de agent_published_at, que marca a PRIMEIRA ativação e nunca e limpo, porque o onboarding usa ele para saber que o trilho acabou. A IA so responde com os dois verdadeiros. Escrita so service_role (PUT /api/clients/[id]/publish).';

-- Registro de cada versão publicada do agente.
--
-- APPEND-ONLY E NUNCA LIDO PARA ATENDER: quem está no ar continua sendo
-- clients.agent_config + clients.persona, exatamente como antes. Esta tabela é
-- só registro. Isso é de propósito: fazer a tabela ser a fonte de verdade
-- obrigaria a saber "qual linha está ativa", com todos os problemas que vêm
-- disso (duas linhas ativas, RLS nova no caminho de produção, o processTurn
-- tendo que resolver versão). Restaurar uma versão é publicar de novo a config
-- antiga, pelo mesmo PUT /agent-config que já existe.
--
-- Guarda a PERSONA COMPILADA, e não só a config, porque é ela que responde a
-- pergunta que hoje é impossível: "o cliente reclamou de uma resposta na terça,
-- o que exatamente o agente estava dizendo na terça?". Cruzando com agent_turns
-- fecha o diagnóstico.
create table if not exists public.agent_publications (
  id bigserial primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  config jsonb,
  persona text not null,
  prompt_mode text not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);

comment on table public.agent_publications is
  'Historico append-only das versoes publicadas do agente. NAO e lida para atender: o que esta no ar e clients.persona. Serve para restaurar uma versao anterior e para auditar o que o agente dizia numa data.';

create index if not exists agent_publications_client_idx
  on public.agent_publications (client_id, published_at desc);

alter table public.agent_publications enable row level security;

-- Leitura por membro do tenant (a tela do agente lista as versoes pelo browser).
create policy "tenant read agent_publications"
  on public.agent_publications for select
  to authenticated
  using (
    client_id in (
      select client_id from public.user_clients where user_id = auth.uid()
    )
  );

-- Escrita so service_role: quem grava e o PUT /agent-config. Sem policy de
-- insert/update/delete para authenticated, e sem grant.
revoke insert, update, delete on public.agent_publications from authenticated;
revoke all on public.agent_publications from anon;
