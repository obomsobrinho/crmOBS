alter table public.clients
  add column if not exists agent_config jsonb,
  add column if not exists prompt_mode text not null default 'guiado',
  add column if not exists agent_config_updated_at timestamptz;

-- tenants existentes têm persona artesanal → não podem ser sobrescritos pelo guiado
update public.clients set prompt_mode = 'avancado' where persona is not null;

alter table public.clients
  add constraint clients_prompt_mode_check check (prompt_mode in ('guiado','avancado'));

comment on column public.clients.agent_config is
  'Respostas do construtor guiado (AgentConfig v1, lib/agent-prompt.ts). null = nunca configurado pela UI.';
comment on column public.clients.prompt_mode is
  'guiado = persona compilada de agent_config; avancado = persona escrita à mão. n8n lê SEMPRE persona.';
