-- Agenda propria, 28/10/2026 (docs/plano-agenda.md, docs/adr/2026-10-28-own-agenda-slots-in-prompt.md).
-- Decisao do dono: a fonte de verdade e a nossa agenda, nao o Google. Minima: um agenda por
-- tenant, servicos com duracao, bloqueios e agendamentos. A conta de horario livre mora em
-- lib/agenda.ts; aqui so o que o banco precisa garantir.
--
-- NAO APLICADA. Escrita numa madrugada sem o dono; aplicar so com o OK dele (supabase/README.md).
--
-- Escrita: so rotas do servidor e o cerebro (service_role). Leitura: membros do tenant, por RLS.
-- Dois agendamentos confirmados do mesmo tenant nunca se sobrepoem: exclusion constraint com
-- btree_gist (o codigo tambem confere, mas a garantia e do banco, inclusive entre duas conversas
-- marcando no mesmo segundo).

create extension if not exists btree_gist with schema extensions;

-- Configuracao (null = agenda nunca configurada, desligada). Normalizada por
-- normalizarConfigDaAgenda (lib/agenda.ts). Escrita so pela rota do dono (service_role).
-- Campos: ativa, antecedenciaMin, intervaloMin, inicio, lembrete e horario (dias e horarios
-- PROPRIOS da agenda, no formato do horario de atendimento; null = copia do de atendimento).
alter table public.clients add column if not exists agenda_config jsonb;

create table public.agenda_servicos (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  duracao_min integer not null check (duracao_min between 5 and 480),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index agenda_servicos_do_tenant on public.agenda_servicos (client_id, ordem, id);

create table public.agenda_bloqueios (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text check (motivo is null or char_length(motivo) <= 120),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_bloqueios_periodo check (fim > inicio)
);
create index agenda_bloqueios_do_tenant on public.agenda_bloqueios (client_id, fim);

create table public.agendamentos (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Liga ao contato por dados_cliente.telefone no mesmo tenant (sem FK, como chat_messages).
  phone text not null,
  nome text,
  servico_id bigint references public.agenda_servicos(id) on delete set null,
  servico_nome text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado')),
  origem text not null check (origem in ('ia', 'time')),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por text check (cancelado_por in ('cliente', 'time')),
  remarcado_de bigint references public.agendamentos(id) on delete set null,
  -- "Do que se trata": o resumo da conversa quando a IA marca, ou a nota do time.
  resumo text check (resumo is null or char_length(resumo) <= 500),
  -- Lembrete automatico (lib/agenda.ts, janelaDoLembrete): quando saiu. A execucao diaria das 9h
  -- reivindica (null para agora) antes de enviar, entao rodar duas vezes nao manda dois.
  lembrete_enviado_em timestamptz,
  -- A Evolution recusou o envio: alerta na central e nova tentativa na execucao seguinte.
  lembrete_falhou_em timestamptz,
  -- O contato confirmou presenca na conversa depois do lembrete (a IA devolve agenda.acao
  -- "confirmar"; o codigo grava). Remarcar cria outra linha, sem confirmacao.
  confirmado_em timestamptz,
  constraint agendamentos_periodo check (fim > inicio),
  -- Cancelamento coerente: a data existe exatamente quando esta cancelado.
  constraint agendamentos_cancelamento_coerente check (
    (status = 'cancelado') = (cancelado_em is not null)
  ),
  constraint agendamentos_sem_sobreposicao exclude using gist (
    client_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status = 'confirmado')
);
-- Lista da tela (dia/semana, keyset por inicio, id) e os futuros de um contato no turno.
create index agendamentos_do_tenant on public.agendamentos (client_id, inicio, id);
create index agendamentos_do_contato on public.agendamentos (client_id, phone, inicio)
  where status = 'confirmado';
-- A execucao diaria do lembrete (9h, /api/agenda/lembretes): por empresa, os confirmados ainda
-- sem lembrete de uma janela de dias, pela hora de inicio.
create index agendamentos_lembrete_pendente on public.agendamentos (client_id, inicio)
  where status = 'confirmado' and lembrete_enviado_em is null;

-- Coluna "Agendado" do funil: existe so com a agenda ligada (decisao do dono, 28/10/2026).
-- Ligar: desarquiva a etapa ou cria logo depois de "Aguardando atendimento", empurrando as
-- seguintes uma posicao. Desligar: as conversas nela voltam para a coluna anterior e ela e
-- arquivada (decisao do dono, 28/10/2026). Canonica: a IA move para ela ao marcar.
create or replace function public.agenda_etapa_do_funil(p_client uuid, p_ativa boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pos integer;
begin
  if not p_ativa then
    -- Quem esta em "Agendado" volta para a coluna anterior (a etapa ativa logo antes dela,
    -- normalmente "Aguardando atendimento"); sem anterior, para a etapa padrao.
    update public.conversations c
      set stage = coalesce(
            (select s.key from public.pipeline_stages s
              where s.client_id = p_client and not s.archived and s.key <> 'agendado'
                and s.position < (select position from public.pipeline_stages
                                   where client_id = p_client and key = 'agendado')
              order by s.position desc limit 1),
            (select s.key from public.pipeline_stages s where s.client_id = p_client and s.is_default)
          ),
          stage_changed_at = now()
      where c.client_id = p_client and c.stage = 'agendado';
    update public.pipeline_stages set archived = true
      where client_id = p_client and key = 'agendado' and not archived;
    return;
  end if;
  if exists (select 1 from public.pipeline_stages where client_id = p_client and key = 'agendado') then
    update public.pipeline_stages set archived = false where client_id = p_client and key = 'agendado';
    return;
  end if;
  select coalesce(
    (select position + 1 from public.pipeline_stages where client_id = p_client and key = 'aguardando_humano'),
    (select coalesce(max(position), -1) + 1 from public.pipeline_stages where client_id = p_client)
  ) into v_pos;
  update public.pipeline_stages set position = position + 1
    where client_id = p_client and position >= v_pos;
  insert into public.pipeline_stages (client_id, key, name, position, is_canonical, is_default, color)
    values (p_client, 'agendado', 'Agendado', v_pos, true, false, 'cyan');
end;
$$;
revoke execute on function public.agenda_etapa_do_funil(uuid, boolean) from public, anon, authenticated;
grant execute on function public.agenda_etapa_do_funil(uuid, boolean) to service_role;

alter table public.agenda_servicos enable row level security;
alter table public.agenda_bloqueios enable row level security;
alter table public.agendamentos enable row level security;

create policy agenda_servicos_leitura_do_tenant on public.agenda_servicos
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));
create policy agenda_bloqueios_leitura_do_tenant on public.agenda_bloqueios
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));
create policy agendamentos_leitura_do_tenant on public.agendamentos
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));

revoke all on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos from anon, authenticated;
grant select on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos to authenticated;
grant all on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos to service_role;

-- A tela atualiza UMA linha por evento (useCanalTenant). Sem isto o handler fica mudo.
alter table public.agendamentos replica identity full;
alter publication supabase_realtime add table public.agendamentos;

-- Lembrete que nao saiu (Evolution recusou): alerta para o dono do produto na central "Clientes",
-- o mesmo padrao do icone de pedidos abertos (admin_pedidos_abertos). Para os clientes de UMA
-- pagina da lista (no maximo 50 ids): quantos horarios FUTUROS tem lembrete com falha e ainda nao
-- enviado, e a falha mais antiga. A execucao seguinte tenta de novo enquanto o horario nao passou.
create index agendamentos_lembrete_com_falha on public.agendamentos (client_id, inicio)
  where lembrete_falhou_em is not null and lembrete_enviado_em is null;

create or replace function public.admin_lembretes_com_falha(
  p_clients uuid[]
) returns table (client_id uuid, falhas integer, mais_antiga timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.client_id, count(*)::integer, min(a.lembrete_falhou_em)
  from public.agendamentos a
  where a.client_id = any (p_clients[1:50])
    and a.lembrete_falhou_em is not null
    and a.lembrete_enviado_em is null
    and a.status = 'confirmado'
    and a.inicio > now()
  group by a.client_id;
$$;
revoke execute on function public.admin_lembretes_com_falha(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_lembretes_com_falha(uuid[]) to service_role;
