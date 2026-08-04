# CRM WhatsApp — Multi-tenant

CRM sobre a stack **n8n + Evolution + Supabase** que você já roda. Cada **cliente (tenant)** faz
login e enxerga só as próprias conversas; ao onboardar, o CRM cria a instância da Evolution e
mostra o QR; e o **agente de IA responde cada cliente com a persona e o número dele**, com opção
de a empresa **pausar o agente** numa conversa e responder manualmente.

O app **não fala direto com a Evolution no dia a dia** — quem recebe/envia mensagens e grava no
banco é o **n8n**. O CRM só: autentica, lê o Supabase (com RLS por tenant), dispara o envio
manual via webhook do n8n e, no onboarding, chama a Evolution para criar a instância + QR.

## Como funciona o isolamento

- **`clients`** — um tenant: `id`, `name`, `evolution_instance` (nome único da instância na
  Evolution), `persona` (system prompt do agente), `notify_group_jid` (grupo de lead, opcional),
  `agent_config`/`prompt_mode` (construtor guiado do prompt, ver "Agente" abaixo).
- **`user_clients`** — vínculo `auth.users` ↔ `clients` (suporta 1+ usuários por cliente).
- **`chat_messages`** e **`dados_cliente`** ganharam a coluna **`client_id`**. A RLS libera cada
  linha só para quem tem o `client_id` correspondente em `user_clients`. `dados_cliente` agora é
  único por **(client_id, telefone)** (dois clientes podem ter o mesmo número de cliente final).
- O **CRM** lê com a **sessão do usuário** (RLS aplica o filtro). O **n8n** escreve com a
  **service_role** (ignora RLS) e carimba o `client_id` que resolve pelo `instance` do payload.

## Variáveis de ambiente (`.env.local`)

Públicas (vão pro browser):

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |

Server-only (**NUNCA** prefixar com `NEXT_PUBLIC`):

| Variável | Descrição |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (onboarding + lookup por instância) |
| `EVOLUTION_API_URL` | base da Evolution, ex.: `https://evo.seu-dominio.com.br` |
| `EVOLUTION_API_KEY` | apikey **global** da Evolution (`AUTHENTICATION_API_KEY`) |
| `N8N_BOT_WEBHOOK_URL` | webhook fixo do bot (nó `Webhook EVO`), ex.: `.../webhook/agente_obm` |
| `N8N_SEND_WEBHOOK_URL` | webhook do fluxo de **envio manual** |
| `N8N_LOOKUP_SECRET` | segredo do `GET /api/clients/by-instance/[instanceName]` |

Veja `.env.example`.

## Instalar e rodar

```bash
npm install
```

```bash
npm run dev
```

Login em `/login`. Sem sessão, o `proxy.ts` (o antigo "middleware", renomeado no Next 16) manda
para `/login`. Depois de logar, `/` decide o destino: **sem instância conectada → `/connect`**
(tela do QR); **com instância → `/inbox`**.

## Endpoints

- `POST /api/clients/[id]/connect-whatsapp` — cria a instância na Evolution (com webhook
  apontando pro bot) e devolve o **QR** (base64). Salva o `evolution_instance` no cliente.
- `GET /api/clients/[id]/whatsapp-status` — estado da conexão (`open`/`connecting`/`close`),
  usado no polling da tela de QR.
- `GET /api/clients/by-instance/[instanceName]` — usado pelo n8n para descobrir o tenant
  (protegido pelo header `x-lookup-secret`). *No setup atual o n8n resolve o tenant direto no
  Supabase (o CRM roda em localhost); este endpoint fica pronto para quando o CRM for publicado.*
- `POST /api/send` — envio manual; encaminha `{ phone, text, instance, client_id }` para o
  `N8N_SEND_WEBHOOK_URL`. O app **não grava** no banco (quem grava é o n8n).

## Migrations (aplicadas via Supabase; SQL de referência)

```sql
-- Tenants + vínculo com usuários
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  evolution_instance text unique,
  persona text,               -- system prompt lido pelo n8n (compilado no modo guiado)
  notify_group_jid text,
  agent_config jsonb,         -- respostas do construtor guiado (lib/agent-prompt.ts)
  prompt_mode text not null default 'guiado' check (prompt_mode in ('guiado','avancado')),
  agent_config_updated_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.user_clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- client_id nas tabelas do bot
alter table public.chat_messages add column if not exists client_id uuid references public.clients(id);
alter table public.dados_cliente add column if not exists client_id uuid references public.clients(id);
alter table public.dados_cliente drop constraint if exists dados_cliente_telefone_key;
alter table public.dados_cliente add constraint dados_cliente_client_telefone_key unique (client_id, telefone);

-- RLS por tenant (authenticated). anon perde o acesso; n8n usa service_role e ignora RLS.
alter table public.clients enable row level security;
alter table public.user_clients enable row level security;
create policy "user reads own memberships" on public.user_clients
  for select to authenticated using (user_id = auth.uid());
create policy "user reads own clients" on public.clients
  for select to authenticated
  using (id in (select client_id from public.user_clients where user_id = auth.uid()));
create policy "tenant read chat_messages" on public.chat_messages
  for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()));
create policy "tenant read dados_cliente" on public.dados_cliente
  for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()));
-- update do CRM restrito à coluna atendimento_ia (pausar/religar a IA)
revoke update on public.dados_cliente from authenticated;
grant update (atendimento_ia) on public.dados_cliente to authenticated;
create policy "tenant toggle atendimento_ia" on public.dados_cliente
  for update to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()))
  with check (client_id in (select client_id from public.user_clients where user_id = auth.uid()));

-- Realtime (já publicado): chat_messages e dados_cliente + replica identity full
```

## n8n (o que o multi-tenant exige)

O bot **"OBS Atendimento"** foi ajustado para operar por tenant:

1. `Dados` extrai `instance = {{ $json.body.instance }}` (a Evolution manda o nome da instância).
2. Nó **`Resolve tenant`** (Supabase) busca o cliente por `evolution_instance = instance` →
   expõe `id` (client_id), `persona`, `notify_group_jid`.
3. `client_id` é carimbado em `Get Lead` (filtro), `Cria Lead`, `Salva chat_messages`,
   `Salva cliente (pausa)` e nos nós de pausa/reativação.
4. `Atendente` usa `systemMessage = {{ $('Resolve tenant').first().json.persona }}`.
5. `Evolution send`/`Notifica grupo` usam `instanceName = {{ $('Dados').item.json.instance }}`
   e a credencial **"Evo Global"** (apikey global → autoriza qualquer instância).
6. A memória da IA é indexada por `client_id:telefone` (isolada por tenant).

O fluxo **"CRM Envio Manual"** também roteia por `instance`/`client_id` recebidos do CRM.

## Onboardar um novo cliente (e testar)

1. **Criar o tenant** (SQL ou painel):
   ```sql
   insert into public.clients (name) values ('Nome do Cliente');
   ```
   A `persona` pode ficar vazia: ao conectar o WhatsApp o CRM grava uma **persona-fallback**
   (o agente só encaminha pro time) e o próprio cliente configura o prompt em `/agente`.
2. **Criar o login** em Supabase → Authentication → Users → *Add user* (email + senha,
   *Auto Confirm*).
3. **Vincular** usuário ↔ cliente:
   ```sql
   insert into public.user_clients (user_id, client_id)
   values ('<auth.users.id>', '<clients.id>');
   ```
4. **Conectar o WhatsApp:** logar com esse usuário → cai em `/connect` → **Conectar WhatsApp** →
   escanear o QR com o número do cliente. Ao conectar (`state = open`), a **base existente é
   importada automaticamente** (contatos + histórico da Evolution → `dados_cliente`/`chat_messages`
   com o `client_id` do tenant) e então vai pro `/inbox`. A importação é idempotente
   (`clients.imported_at`) e também roda como rede de segurança na 1ª entrada no inbox.
5. **Testar:** enviar uma mensagem de outro número para o WhatsApp do cliente → o agente responde
   com a **persona daquele cliente**, pela **instância dele**, e a conversa aparece **só** no CRM
   desse login. Para assumir: no header da conversa, **pausar a IA** e responder manualmente.

## Configurar o agente (`/agente`)

Cada tenant configura o prompt do agente na tela **`/agente`**, em dois modos:

- **Guiado** (padrão) — formulário com os dados que toda empresa tem (nome, o que faz, endereço,
  horário, formas de pagamento, nome/tom/objetivos do agente, regras, detalhes livres). O CRM
  **compila** tudo num prompt padronizado (`buildPersona` em `lib/agent-prompt.ts`) e grava em
  `clients.persona`. As respostas ficam em `clients.agent_config` (jsonb) para edição futura.
- **Avançado** — texto livre integral (a persona artesanal da OBM está aqui). Trocar de modo é
  reversível; ir do avançado para o guiado pede confirmação antes de substituir o texto manual.

Como o n8n lê `clients.persona` ao vivo (`Atendente.systemMessage`), salvar **não exige deploy**:
vale já na próxima mensagem. O write é `PUT /api/clients/[id]/agent-config` (service_role).
⚠️ "marcar conversa com o time" (objetivo `agendar`) exige `notify_group_jid` — a tela avisa
quando falta.

## Follow-ups conhecidos (fora do escopo desta fase)

- **Deploy** do CRM (hoje só `localhost`). Depois de publicado, o n8n pode usar o endpoint
  `by-instance` em vez de consultar o Supabase direto.
- **Criar tenant pela UI** (hoje ainda por SQL); exemplos few-shot no construtor do agente.
- Renderização de áudio/imagem no CRM; notificações/não-lidas.
