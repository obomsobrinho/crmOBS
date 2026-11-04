-- Mídias do agente (04/11/2026, pedido do dono): a IA pode mandar um vídeo ou uma imagem que a empresa
-- cadastrou (ex.: "como funciona o Atenda" quando o lead pergunta como funciona). Uma linha por mídia,
-- por empresa. Quem decide é o modelo, pela DESCRIÇÃO escrita por quem cadastrou (o que a mídia mostra)
-- e por QUANDO ENVIAR; o arquivo nunca é lido. O arquivo fica no bucket privado whatsapp-media, em
-- {client_id}/biblioteca/. Regra e validação: lib/midias.ts. Leitura pelo tenant (RLS), escrita só por
-- service_role (sem tela na v1: o dono cadastra por SQL ou pela central, depois).
create table public.agent_midias (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id),
  -- A chave que o modelo devolve no campo `midia` (minúsculas, dígitos e _).
  chave text not null check (chave ~ '^[a-z0-9_]{1,40}$'),
  tipo text not null check (tipo in ('video', 'image')),
  -- Caminho no bucket whatsapp-media; precisa começar por {client_id}/biblioteca/.
  path text not null,
  mime text not null,
  nome_arquivo text not null default '',
  -- O que a mídia mostra, em poucas frases (o modelo decide por aqui, nunca pelo arquivo).
  descricao text not null check (btrim(descricao) <> '' and char_length(descricao) <= 600),
  -- Em que situação mandar (ex.: "quando a pessoa pergunta como funciona ou quer ver").
  quando_enviar text not null check (btrim(quando_enviar) <> '' and char_length(quando_enviar) <= 300),
  -- Legenda opcional que vai junto no WhatsApp.
  legenda text not null default '' check (char_length(legenda) <= 300),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, chave),
  check (path like client_id::text || '/biblioteca/%')
);
comment on table public.agent_midias is
  'Mídias que o agente pode enviar (vídeo/imagem), por tenant. O modelo escolhe pela descricao e quando_enviar; no máximo uma vez por conversa (lib/midias.ts). Arquivo no bucket whatsapp-media em {client_id}/biblioteca/. Escrita só por service_role.';

alter table public.agent_midias enable row level security;

create policy "tenant read agent_midias"
  on public.agent_midias
  for select to authenticated
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())
    )
  );

revoke all on public.agent_midias from anon;
revoke insert, update, delete on public.agent_midias from authenticated;
grant select on public.agent_midias to authenticated;
grant all on public.agent_midias to service_role;
