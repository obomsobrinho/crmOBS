-- Um registro por pedido de ajuda da IA (handoff), para a conversa mostrar o
-- cartão na linha do tempo e o histórico ("resolvido pela IA com a sua
-- orientação às 14:41"). conversations.handoff_at continua sendo o sinal de
-- "Precisa de você"; esta tabela é o HISTÓRICO. Escrita só por service_role
-- (o /api/agent abre e fecha pela orientação; o Resolvido fecha).
create table public.handoffs (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  phone text not null,
  opened_at timestamptz not null default now(),
  summary text,
  instruction text,
  closed_at timestamptz,
  closed_how text check (closed_how in ('ia', 'resolvido')),
  closed_by uuid
);

create index handoffs_conversa on public.handoffs (client_id, phone, opened_at desc);
-- No máximo UM aberto por conversa.
create unique index handoffs_um_aberto on public.handoffs (client_id, phone) where closed_at is null;

alter table public.handoffs enable row level security;

create policy handoffs_leitura_do_tenant on public.handoffs
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()));

revoke all on public.handoffs from anon, authenticated;
grant select on public.handoffs to authenticated;

-- Realtime: o cartão muda sozinho quando a IA fecha o handoff. FULL porque há
-- UPDATE, e sem a linha inteira a RLS do realtime descarta o evento.
alter table public.handoffs replica identity full;
alter publication supabase_realtime add table public.handoffs;

-- Os handoffs abertos hoje ganham o seu registro, com o último pedido da IA.
insert into public.handoffs (client_id, phone, opened_at, summary)
select c.client_id, c.phone, c.handoff_at,
  (select q.summary from public.conversation_qualifications q
    where q.client_id = c.client_id and q.phone = c.phone
    order by q.created_at desc limit 1)
from public.conversations c
where c.handoff_at is not null;
