-- Canal de feedback do beta: o testador escreve, o dono lê por SQL.
--
-- Decisão do dono do produto: formulário que grava no banco (um botão de
-- WhatsApp foi recomendado e recusado). Segue a forma das outras tabelas
-- próprias do CRM (conversation_notes, quick_replies): id identity, client_id
-- uuid not null, autor com default auth.uid(), created_at now().
create table public.feedback (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Default auth.uid() como em conversation_notes.author_user_id: o browser não
  -- manda o autor, quem carimba é o banco. ON DELETE SET NULL porque apagar o
  -- usuário não pode apagar o que ele disse.
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  message text not null,
  -- Em que tela a pessoa estava. É metade do valor do relato: "não consigo
  -- responder" dito no /inbox e dito no /agente são dois problemas diferentes.
  path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index feedback_client_created_idx on public.feedback (client_id, created_at desc);

alter table public.feedback enable row level security;

-- INSERT para qualquer membro do tenant, com o predicado padrão do projeto.
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
  );

-- ⚠️ SEM POLICY DE SELECT, E ISSO É A DECISÃO. Ninguém lê feedback pelo
-- browser: quem lê é o dono, por SQL (docs/instrumentacao-beta.md). Uma tela de
-- leitura para um único usuário e dez linhas seria só mais uma tela para o passo
-- de redesenho repintar.
--
-- Os grants acompanham a policy em vez de confiar só nela: sem SELECT no grant,
-- nem um erro futuro de policy expõe o que um testador escreveu sobre o outro.
revoke all on public.feedback from anon;
revoke all on public.feedback from authenticated;
grant insert on public.feedback to authenticated;

comment on table public.feedback is
  'Relatos do beta. INSERT por membro do tenant (RLS); leitura so por service_role/SQL, ver docs/instrumentacao-beta.md.';
