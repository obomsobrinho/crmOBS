@AGENTS.md

# CRM WhatsApp — guia do projeto

CRM **multi-tenant** que fica por cima de uma stack existente de **n8n + Evolution API +
Supabase**. Vários clientes (empresas) usam o mesmo sistema, cada um vê só o que é seu, e um
agente de IA atende no WhatsApp de cada um. Detalhes de setup/onboarding no `README.md`.

## Quem faz o quê (fluxo)
- **Evolution API** = conexão com o WhatsApp (uma *instância* por cliente).
- **n8n** = cérebro. Recebe o webhook da Evolution, roda o agente de IA e **grava no Supabase**
  (com `service_role`, ignorando RLS). O CRM **não** fala com a Evolution no dia a dia (só no
  onboarding, pra criar a instância e mostrar o QR).
- **CRM (este repo, Next.js)** = interface. **Lê** o Supabase com a **sessão do usuário** (RLS por
  tenant) e, pra enviar manualmente, dispara um webhook do n8n. Nunca escreve direto nas tabelas
  de conversa.

## Glossário do schema (IMPORTANTE — "cliente" é ambíguo)
- **`clients`** = o **TENANT**: a empresa que USA o CRM (ex.: OBM, Loja Teste). É "o cliente do
  CRM". PK `uuid`. Tem `evolution_instance` (única), `persona` (prompt do agente),
  `notify_group_jid`, `imported_at`, `agent_config` (jsonb do construtor guiado),
  `prompt_mode` (`guiado`/`avancado`), `agent_config_updated_at`.
  - **REGRA:** o n8n lê SÓ `persona` (ao vivo, a cada msg). No modo `guiado`, `persona` é a
    **saída compilada** de `agent_config` por `buildPersona` (`lib/agent-prompt.ts`); no
    `avancado`, é texto escrito à mão. Config do agente é editada em `/agente` (**só dono**: a
    página redireciona atendente e o `PUT` responde 403); write só por service_role (RLS de
    `clients` não dá UPDATE a `authenticated`).
- **`dados_cliente`** = os **CONTATOS/LEADS**: quem manda mensagem no WhatsApp *daquele* tenant
  (ex.: um lead da OBM). "O cliente do seu cliente". PK `bigint`. Único por `(client_id, telefone)`.
  Editável pelo CRM (grant de coluna, browser direto): `atendimento_ia`, `display_name` (nome que
  o CRM mostra, precede `nomewpp`) e `custom_fields` (jsonb). O n8n segue dono de `nomewpp`.
- **Tabelas próprias do CRM** (browser faz CRUD via RLS por tenant, não passam pelo n8n): `tags`
  + `conversation_tags` (rótulos por conversa), `conversation_notes` (notas internas, nunca vão
  ao WhatsApp; `author_user_id` = `auth.uid()`), `quick_replies` (mensagens prontas por tenant).
- **`chat_messages`** = as **MENSAGENS**. Uma linha pode ter `user_message` (recebida) e/ou
  `bot_message` (enviada). PK `bigint`.
- **`user_clients`** = vínculo N:N entre `auth.users` (login) e `clients` (tenant). Tem
  `role` (`dono`/`atendente`). O CRM só enxerga a PRÓPRIA linha (policy `user_id = auth.uid()`);
  para listar colegas do tenant e nomear o atendente de cada conversa usa a função SECURITY
  DEFINER `public.tenant_members()` (retorna `user_id`, `email`, `role`; resolve `auth.users`).
  Convidar/remover membro vai por `service_role` em `app/api/team/*` (dono-only; convite via
  `auth.admin.inviteUserByEmail`, o convidado define a senha em `/auth/confirm` -> `/definir-senha`).
- `client_id` (em `chat_messages` e `dados_cliente`) aponta SEMPRE pro **tenant** (`clients`),
  nunca pro contato. É `NOT NULL`.
- Mensagem ↔ contato: ligados por `chat_messages.phone = dados_cliente.telefone` dentro do mesmo
  `client_id` (vínculo lógico, **sem FK**).

## Isolamento (multi-tenancy)
- Padrão "pool": tabelas compartilhadas + `client_id` + **RLS**. Cada login só lê linhas do(s)
  seu(s) tenant(s) via `client_id in (select client_id from user_clients where user_id = auth.uid())`.
- CRM = role **`authenticated`** (RLS aplicada). n8n = **`service_role`** (bypassa RLS). **`anon`
  não tem acesso** a nada.
- Writes diretos do CRM (browser, RLS aplicada): `dados_cliente.atendimento_ia` (pausar/religar
  a IA) e `conversations` nas colunas liberadas (`unread_count` no mark-as-read,
  `assigned_user_id` na atribuição, `status`, `stage`). Convite/remoção de membro NÃO é write
  direto: vai por route handler `service_role`.

## Convenções / pegadinhas
- **Escrita (texto visível ao usuário + prompts gerados): NUNCA usar travessão `—` nem `–`.**
  Vale para UI, `buildPersona`, mensagens de erro, docs e qualquer texto em português. Usar
  vírgula, ponto, dois-pontos ou parênteses no lugar.
- **Next 16:** middleware virou **`proxy.ts`** (raiz, exporta `proxy`). Params de rota são
  Promise (`await ctx.params`). SEMPRE consultar `node_modules/next/dist/docs/` antes de codar.
- **Supabase clients:** `lib/supabase/client.ts` (browser, sessão em cookie, singleton),
  `lib/supabase/server.ts` (Server Components/route handlers), `lib/supabase/service.ts`
  (service_role — **só no servidor, nunca no browser**). `lib/auth.ts` → `getMyClient()`.
- **`nomewpp = "Você"`:** a Evolution devolve `pushName = "Você"` em mensagens ENVIADAS. Isso NÃO
  é nome de contato. Sempre resolver nome via `lib/inbox.ts` (`cleanName` / `rowsToInbox` /
  `bestName`): melhor nome não-"Você" da conversa, senão o telefone.
- **Env server-only** (nunca `NEXT_PUBLIC`): `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY` (apikey GLOBAL da Evolution), `N8N_BOT_WEBHOOK_URL`, `N8N_SEND_WEBHOOK_URL`,
  `N8N_LOOKUP_SECRET`, `OPENAI_API_KEY` (cérebro do agente + embeddings do RAG),
  `OPENAI_AGENT_MODEL` (opcional, padrão `gpt-5.4-mini`). Nunca colar segredos no chat nem commitar.
- **Fase 2 (tabelas novas):** `conversation_qualifications` (qualificação da IA por
  `(client_id, phone)`: `action`/`summary`/`preferencia_horario`; gravada por `/api/agent`, lida
  no CRM), `knowledge_documents` + `knowledge_chunks` (base de conhecimento/RAG, pgvector
  `vector(1536)`, `match_knowledge_chunks`) e buckets de Storage `knowledge` e `whatsapp-media`.
  Todas: leitura por `authenticated` (RLS por tenant), escrita por `service_role`.
- **Decisões mantidas de propósito:** `dados_cliente.atendimento_ia` é `text`
  (`'ativa'`/`'reativada'` = ligada, `'pause'` = pausada) — não é boolean. `chat_messages.active`
  é coluna legada morta (mantida). Não sugerir trocar sem pedirem.

## n8n (⚠️ produção)
- **Mudança de arquitetura da IA (construída, cutover pendente):** o cérebro do agente sai do n8n
  e vai para `POST /api/agent` (stateless; persona + histórico de `chat_messages` + AGORA +
  retrieval do RAG, saída `{ output: { messages, action, summary, preferencia_horario } }`). O n8n
  vira só o cano. O diff (trocar `Atendente`+`OpenAI Chat Model`+`Postgres Chat Memory`+`Output
  estruturado` por um HTTP Request chamado "Atendente") já foi validado (`validateOnly`), **NÃO
  aplicado**: depende de `OPENAI_API_KEY`, URL pública do app e confirmação. Enquanto não aplicado,
  o bot roda como abaixo. Modelo atual do nó: `gpt-5.4-mini`.
- Bot **"OBS Atendimento"**: resolve o tenant pelo `instance` do payload (nó `Resolve tenant` →
  Supabase), carimba `client_id`, usa a `persona`/instância/memória do tenant. Memória isolada por
  `client_id:telefone`.
- **Data/hora injetada:** o nó `Atendente` anexa ao fim do `systemMessage` um bloco `### AGORA`
  com a data/hora atual (America/Sao_Paulo, pt-BR) via `$now`. Logo o agente **sabe** a data/hora;
  `buildPersona` referencia essa "seção AGORA" (não dizer mais que o agente não sabe a data).
- **"CRM Envio Manual"**: envio manual do CRM, roteado por `instance`/`client_id`.
- **REGRA:** nunca modificar/ativar workflows n8n ao vivo sem confirmação explícita do usuário.
  Usar `validateOnly` antes de aplicar.

## Rodar
- Dev: `npm run dev` (porta 3001 via `.claude/launch.json`). Build/checagem de tipos: `npm run build`.
- Testes e2e (Playwright, pasta `e2e/`): `npm run test:e2e -- --project=sem-login` (telas `/design`,
  sem login) e `npm run test:e2e:login` (fluxos com login; credenciais em `.env.e2e.local`, fora do
  git). Detalhes em `e2e/README.md`. Escritas de teste só no tenant da Loja Teste; nunca na OBM.
- Rotas: `/login`, `/connect` (QR + import automático), `/inbox`, `/inbox/[id]`, `/agente`
  (construtor do prompt), `/conhecimento` (base de conhecimento/RAG, dono-only), `/equipe`
  (membros do time), `/perfil`, `/definir-senha` (convidado escolhe a senha), `/auth/confirm`
  (verifica o link do e-mail). Endpoints em `app/api/clients/[id]/...` (connect-whatsapp,
  whatsapp-status, import, **agent-config** `PUT`, **notify-target** `PUT` dono-only,
  **knowledge** `DELETE` + **knowledge/upload-url** + **knowledge/process** dono-only, upload
  direto ao Storage por URL assinada + processamento à parte, compatível com o limite de corpo da
  Vercel), `app/api/agent` (cérebro, protegido por `x-lookup-secret`),
  `app/api/team/{invite,remove}` (dono-only, service_role) e `by-instance`.

## Produto e estratégia (consultar ANTES de decidir escopo)
Duas fontes de verdade sobre **o que construir e por quê**. Não decidir roadmap, preço nem
posicionamento sem ler a que se aplica:

- **`docs/proximos-passos.md`** — **FONTE DE VERDADE das decisões de produto e roadmap**: direção
  travada (horizontal, eixo execução/confiança + profundidade de IA, pricing por usuário), matriz
  de paridade contra ZapResponder e HelenaCRM, dívidas de arquitetura, e as fases 1 a 5 na ordem.
  **Ler sempre que o pedido for "qual o próximo passo", "o que falta desenvolver" ou envolver
  priorizar/escopar trabalho novo.** Decisão: **construir até ter paridade antes de publicar e
  vender**; não sugerir deploy, cadastro self-service nem venda antes da Fase 4.
- **`docs/estrategia-2026-07.md`** — **base de PESQUISA e evidência** (mercado BR, concorrentes,
  regras e custos do WhatsApp, fontes citadas). **Ler quando a pergunta for sobre concorrente,
  preço de mercado, risco de banimento, API Oficial vs QR, ou dados de mercado.** ⚠️ As conclusões
  prescritivas antigas dele (vertical em clínicas, vender já, plano único, "não é CRM") estão
  **superadas**; o banner no topo do arquivo lista o que vale. Em conflito, `proximos-passos.md` manda.

Regras que saem desses documentos e valem para qualquer sugestão minha:
- Concorrentes de referência são **ZapResponder** e **HelenaCRM**, não Kommo/RD Station/Blip/Zenvia.
- **Nunca** construir agenda própria completa (usar Google Calendar) nem construtor visual de
  automações (vira produto que exige consultoria).
- **Nunca** construir disparo em massa ou follow-up ativo em cima da conexão QR (Baileys): é o
  cenário de banimento documentado. E nunca escrever material de marketing que anuncie disparo em
  massa, "não pague a API da Meta" ou proteção contra banimento.
- **01/10/2026:** a Meta passa a cobrar mensagens de serviço na API Oficial. Qualquer conta de
  migração precisa de custo variável, não de zero.

## Status
Backend + multi-tenant + onboarding (QR) + import + frontend/layout + construtor guiado do
agente (`/agente`): prontos e verificados. **Fase 1 Bloco A** (inbox de equipe): multi-login
(`/equipe`, convite + papel + remover), atribuição de conversa (assumir/transferir/quem atende) e
não-lidas (filtro + badge no rail). ⚠️ O convite depende de SMTP + template "Invite user"
configurados no projeto Supabase (o código manda `redirectTo` para `/auth/confirm`). **Fase 1
Bloco B**: tags + notas internas + respostas rápidas (no painel de contexto da conversa e no
composer), edição de contato (nome de exibição + campos personalizados), **render** de mídia
(imagem/áudio/vídeo/documento a partir de `chat_messages.media_url`), **busca no conteúdo das
mensagens** e **acesso do agente restrito ao dono**. Testes e2e (Playwright, `e2e/`) cobrindo as
telas `/design` e o login do dono. **Nada commitado ainda** (tudo como mudança local). O único item
que faltava na Fase 1, **receber/enviar mídia de verdade** (Storage + n8n), foi **movido para a
Fase 2** para entrar no mesmo lote de mudanças do n8n. Detalhes em `docs/proximos-passos.md`.
