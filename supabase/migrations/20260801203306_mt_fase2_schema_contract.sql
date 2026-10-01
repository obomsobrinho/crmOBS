-- Fase 2 - contrato de schema (Bloco 0). Consumido pelos blocos seguintes.
-- (a) qualificacao da IA por conversa  (b) base de conhecimento + pgvector
-- (c) buckets de Storage (conhecimento e midia do WhatsApp).
-- Leitura pelo CRM = role authenticated com RLS por tenant. Escrita = service_role
-- (n8n e route handlers do CRM, que embeddam server-side). anon nao acessa nada.

-- pgvector no schema extensions (boa pratica Supabase; evita extension_in_public).
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- (a) Qualificacao da IA por conversa. Append-only: o n8n insere a cada burst
--     relevante (action/summary/preferencia_horario). Ligada a conversa pelo
--     par (client_id, phone), o mesmo vinculo logico (sem FK) que ja liga
--     chat_messages a conversations. A linha mais recente por (client_id, phone)
--     enriquece a lista "Precisa de voce" e a propria conversa.
-- ---------------------------------------------------------------------------
create table public.conversation_qualifications (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id),
  phone text not null,
  action text not null default 'none'
    check (action in ('none','agendar','pausar')),
  summary text,
  preferencia_horario text,
  created_at timestamptz not null default now()
);
comment on table public.conversation_qualifications is
  'Qualificacao produzida pela IA (n8n) por conversa: action/summary/preferencia_horario. Append-only; a mais recente por (client_id, phone) enriquece a lista Precisa de voce. Escrita por service_role.';

create index conversation_qualifications_latest_idx
  on public.conversation_qualifications (client_id, phone, created_at desc);

alter table public.conversation_qualifications enable row level security;

create policy "tenant read qualifications"
  on public.conversation_qualifications
  for select to authenticated
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()
    )
  );

revoke all on public.conversation_qualifications from anon;
revoke insert, update, delete on public.conversation_qualifications from authenticated;

-- ---------------------------------------------------------------------------
-- (b) Base de conhecimento (RAG). Um documento por arquivo enviado; o original
--     fica no bucket "knowledge". O texto extraido vira chunks com embedding.
--     Upload/extracao/embedding rodam num route handler do CRM (service_role,
--     OPENAI_API_KEY server-only). O n8n so LE (retrieval) via a funcao abaixo.
-- ---------------------------------------------------------------------------
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  title text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  embedding_model text not null default 'text-embedding-3-small',
  status text not null default 'processing'
    check (status in ('processing','ready','error')),
  error text,
  chunk_count integer not null default 0,
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.knowledge_documents is
  'Um arquivo da base de conhecimento por tenant. Original no bucket knowledge; texto extraido em knowledge_chunks. status = processing|ready|error. Escrita por route handler service_role.';

create index knowledge_documents_client_idx
  on public.knowledge_documents (client_id, created_at desc);

alter table public.knowledge_documents enable row level security;

create policy "tenant read knowledge_documents"
  on public.knowledge_documents
  for select to authenticated
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()
    )
  );

revoke all on public.knowledge_documents from anon;
revoke insert, update, delete on public.knowledge_documents from authenticated;

create table public.knowledge_chunks (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536),
  token_count integer,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
comment on table public.knowledge_chunks is
  'Trechos (chunks) dos documentos com embedding (text-embedding-3-small, 1536 dims). Retrieval por match_knowledge_chunks. client_id denormalizado para filtro/RLS por tenant. Escrita por service_role.';

create index knowledge_chunks_client_idx on public.knowledge_chunks (client_id);
create index knowledge_chunks_document_idx on public.knowledge_chunks (document_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

create policy "tenant read knowledge_chunks"
  on public.knowledge_chunks
  for select to authenticated
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()
    )
  );

revoke all on public.knowledge_chunks from anon;
revoke insert, update, delete on public.knowledge_chunks from authenticated;

-- Retrieval por similaridade de cosseno. SECURITY INVOKER: para authenticated a
-- RLS de knowledge_chunks ja limita ao proprio tenant (nao ha como vazar outro
-- tenant passando p_client_id alheio); o n8n chama com service_role e passa o
-- client_id resolvido. Retorna no maximo 20.
create or replace function public.match_knowledge_chunks(
  p_client_id uuid,
  p_query_embedding extensions.vector,
  p_match_count integer default 5
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    kc.id,
    kc.document_id,
    kc.content,
    1 - (kc.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.client_id = p_client_id
  order by kc.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_match_count, 1), 20)
$$;
comment on function public.match_knowledge_chunks is
  'Retrieval por cosseno nos chunks de um tenant. SECURITY INVOKER: RLS limita authenticated ao proprio tenant; service_role passa p_client_id.';

revoke all on function public.match_knowledge_chunks(uuid, extensions.vector, integer) from public, anon;
grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (c) Buckets de Storage (privados). Convencao de caminho: {client_id}/... para
--     a RLS isolar por tenant pela primeira pasta. Leitura (download/signed URL)
--     por authenticated do tenant; escrita/remocao por service_role (route
--     handler / n8n). "knowledge" = originais da base; "whatsapp-media" = midia
--     recebida/enviada no WhatsApp (media da Fase 1, que entra na Fase 2).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false),
       ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

create policy "knowledge tenant read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] in (
      select uc.client_id::text from public.user_clients uc where uc.user_id = auth.uid()
    )
  );

create policy "whatsapp-media tenant read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select uc.client_id::text from public.user_clients uc where uc.user_id = auth.uid()
    )
  );
