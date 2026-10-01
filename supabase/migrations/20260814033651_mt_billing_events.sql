-- Fase 4, cobrança: eventos recebidos do webhook do Asaas.
--
-- Existe por idempotência, que a própria documentação do Asaas recomenda: o
-- gateway reenvia evento em caso de falha, e sem uma chave única o mesmo
-- "pagamento confirmado" poderia ser aplicado duas vezes. `asaas_event_id` é
-- UNIQUE: o insert duplicado falha e a rota responde 200 sem reprocessar.
--
-- Guarda o payload inteiro para auditoria (é o único registro de por que a
-- assinatura de alguém mudou de estado) e por quê: se um dia um cliente
-- reclamar de bloqueio indevido, a resposta está aqui.
--
-- Tabela interna: RLS ligada SEM policy + revoke, então só service_role.

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  asaas_event_id text not null unique,
  event text not null,
  -- Tenant que o evento afetou. Fica nulo quando não deu para resolver (evento
  -- de um cliente que não é nosso, ou do sandbox), e isso é informação: mostra
  -- que a rota recebeu algo que não sabia casar.
  client_id uuid references public.clients(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_client_created_idx
  on public.billing_events (client_id, created_at desc);

create index if not exists billing_events_created_idx
  on public.billing_events (created_at desc);

alter table public.billing_events enable row level security;

revoke all on public.billing_events from anon;
revoke all on public.billing_events from authenticated;

comment on table public.billing_events is
  'Eventos do webhook do Asaas. asaas_event_id é UNIQUE (idempotência: reenvio do gateway não reprocessa). Só service_role. Guarda o payload para auditoria de mudança de estado de assinatura.';
comment on column public.billing_events.client_id is
  'Tenant afetado. null = não foi possível casar o evento com um tenant (cliente de outra conta, ou teste).';
comment on column public.billing_events.processed_at is
  'Quando a regra de negócio foi aplicada. null com error preenchido = chegou mas falhou ao aplicar.';
