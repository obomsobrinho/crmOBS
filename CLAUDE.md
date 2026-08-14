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
  `prompt_mode` (`guiado`/`avancado`), `agent_config_updated_at`. **Fase 4 (assinatura):**
  `subscription_status` (`trialing`/`active`/`past_due`/`canceled`, CHECK no banco),
  `trial_ends_at`, `grace_until` (carência em atraso), `billing_provider` (`asaas`/`stripe`),
  `billing_customer_id` + `billing_subscription_id` (únicos parciais, o webhook acha o tenant
  por eles), `billing_seats`, `billing_updated_at`.
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
  `assigned_user_id` na atribuição, `status`, `stage`/`stage_source` no pipeline,
  `pending_instruction` do handoff coach). Convite/remoção
  de membro NÃO é write direto: vai por route handler `service_role`. Gestão de `pipeline_stages`
  (criar/renomear/reordenar/arquivar) é write direto do browser MAS **só dono** (RLS checa
  `role='dono'`); mover card (update de `conversations.stage`) é liberado a qualquer membro.

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
- **Fase 3 (pipeline):** `pipeline_stages` (funil por tenant: `key` slug estável, `name`,
  `position`, `is_canonical`, `is_default`, `archived`, `color`; RLS leitura por membro, CRUD só
  dono). `conversations.stage` referencia `(client_id, key)` por FK; `conversations.stage_source`
  (`human`/`ia`) marca quem moveu (a IA nunca sobrescreve `human`). A IA move o card em
  `/api/agent` via `nextIaStage` (`lib/pipeline.ts`): só avança estágio canônico, no-op seguro.
  Dashboard (`/painel`) calcula 4 números (`lib/metrics.ts`) por RLS, janela de 7 dias.
- **Fase 3.5 (fechamento da IA):** a orquestração do turno saiu de `/api/agent` para
  `processTurn` (`lib/agent-turn.ts`, server-only), reaproveitada pela bancada de teste. Modo
  `dryRun` (não persiste nada) e um bloco de diagnóstico do turno (`lib/agent-diagnostics.ts`,
  puro): RAG usado + similaridade, estágio que moveria, latência, guardrail. **Guardrail**
  (`lib/guardrail.ts`, puro): checa a resposta pronta antes de sair e bloqueia preço/link/telefone
  fora das fontes (persona + RAG + orientação do operador) e promessa forte; se reprova, degrada
  para `pausar`. **Handoff coach:** `conversations.pending_instruction` (grant de coluna, browser
  direto) guarda a orientação do operador; `/api/agent` consome no próximo turno e limpa (a IA
  retoma sozinha). **Handoff silencioso (regra geral):** em `action=pausar` o `/api/agent` devolve
  `messages` vazio (a IA não responde, só abre o handoff) e **pausa a IA ele mesmo**
  (`dados_cliente.atendimento_ia='pause'`), porque com messages vazio o n8n não chega no nó que
  pausaria. **Playground** (`/playground`, dono-only)
  fala com o cérebro REAL via `POST /api/playground` (sessão do dono, força `dryRun`), sem WhatsApp.
- **Fase 4 (assinatura e gate):** a regra de acesso mora em `lib/billing.ts` (**módulo puro**, zero
  imports, igual `lib/agent-prompt.ts`, então servidor e browser usam a MESMA função):
  `accessState({subscription_status, trial_ends_at, grace_until})` devolve `{blocked, reason,
  trialDaysLeft, warn, message}`. `getMyClient()` já traz `access` pronto (as colunas vêm no mesmo
  select). **Conta bloqueada entra em MODO LEITURA** (decisão do dono do produto), não é expulsa: as
  mensagens seguem chegando e ela acompanha as conversas, como um WhatsApp Web aberto, mas não
  trabalha. **Gate server-side em 4 pontos**, nunca esconder botão no client:
  (1) `requireActiveTenant()` (`lib/auth.ts`) manda para `/assinatura` nas páginas pagas
  (`/pipeline`, `/painel`, `/agente`, `/conhecimento`, `/playground`, `/equipe`); fica em CADA
  página, e não no layout, porque layout de Server Component não conhece a rota atual. `/inbox`,
  `/perfil` e `/assinatura` seguem abertos (`/assinatura` fora do route group `(app)`);
  (2) `processTurn` devolve **turno silencioso** (`silentTurn`: 200, `messages` vazio,
  `diagnostics.subscriptionBlocked`) **antes** do modelo e do RAG, então a IA emudece, não gasta
  token, e o n8n **segue gravando** a mensagem do cliente em vez de estourar erro;
  (3) `POST /api/send` devolve **402**; (4) UI: a prop `readOnly` tira a caixa de texto do
  `MessageComposer` e trava a chave da IA (o `toggleIa` do `ConversationView` também guarda, porque o
  callback é compartilhado com o painel lateral). **Bloqueia:** trial vencido, `past_due` fora da
  carência, `canceled`. **Não bloqueia de propósito:** status desconhecido (o CHECK do banco já
  garante o conjunto, e derrubar quem paga é pior) e `trialing` sem `trial_ends_at`.
  `signup_attempts` (freio de abuso do cadastro público): RLS ligada sem policy + `revoke`, só
  service_role. Escrita das colunas de assinatura: **só service_role** (webhook do gateway).
- **Fase 4 (planos):** a tabela de preços mora em `lib/billing.ts` (`PLANS`: Essencial R$ 197 /
  Profissional R$ 347 / Avançado R$ 597), e `clients.billing_plan` guarda só QUAL plano (CHECK no
  banco). **`null` = nenhum plano escolhido (teste ou conta interna) e aí NÃO existe limite:**
  `planFor` devolve `null` de propósito, porque chutar um plano plausível criaria um limite que
  ninguém contratou (o primeiro sintoma seria a OBM levando 409 num convite legítimo).
  **O DONO NÃO CONTA como atendente:** `billableSeats(total)` = `total - 1`, e é `- 1` em vez de
  "descontar quem tem papel dono" porque senão convidar um segundo dono daria atendente de graça.
  **Só o limite de atendentes é
  APLICADO** (`seatState` + 409 no `POST /api/team/invite`, contando `user_clients` por service_role
  porque a policy só mostra a própria linha ao browser); e como atendente extra é VENDIDO como
  adicional (R$ 67 até o 3º, R$ 47 do 4º), esse 409 é parede **temporária**: enquanto não existe
  checkout, cobrar o adicional é manual e liberar antes de cobrar seria assento de graça.
  `funnels`, `conversations` e `features` estão em `PLANS` como definição comercial e **não são
  aplicados**: funil > 1 não existe (`pipeline_stages` é um funil por tenant), conversa exige medição
  (Fase 5), relatório por atendente não existe e a atribuição ainda não é travada por plano.
  `numbers` é 1 em todos os planos porque múltiplos números está em não construir. Ver
  `docs/proximos-passos.md`. Descer de plano **não remove ninguém**: quem passa do incluído vira
  adicional e a tela avisa.
- **Fase 4 (medição do agente):** `agent_turns` guarda **uma linha por turno** que o `/api/agent`
  processou, com o diagnóstico que ele já calculava e descartava: `action`, `messages_sent`,
  `silenced` (`nao_publicado`/`assinatura`), RAG (`rag_searched`, `rag_matches`,
  `rag_top_similarity`), guardrail, `latency_ms`, `model`, `input_tokens`, `output_tokens` e
  `dry_run` (playground: o token foi gasto, mas métrica de operação deve filtrar fora). **Não guarda
  conteúdo de mensagem** (isso é `chat_messages`). `runAgent` passou a devolver
  `{output, usage, model}` para isso. A escrita é `logTurn` em `lib/agent-turn.ts`, **best-effort e
  nunca lança**: medição não pode virar erro de atendimento. Leitura por membro do tenant (RLS),
  escrita só service_role. Serve a três perguntas que hoje são chute: custo real por conversa, se a
  base de conhecimento está sendo usada, e quantas vezes o guardrail conteve a IA.
  ⚠️ O **limite de conversas do plano NÃO sai daqui**: conversa é janela de 24h contada em
  `chat_messages` (inclui manual), `agent_turns` é só o que a IA processou.
- **Fase 4 (cobrança, Asaas):** `lib/asaas.ts` (**server-only**) é o cliente da API; qualquer
  `ASAAS_ENV` diferente de `producao` cai no **sandbox** de propósito. ⚠️ **A chave começa com `$`,
  e o Next expande `$` como referência a outra variável:** no `.env.local` ela precisa de contrabarra
  (`\$aact_...`), senão chega VAZIA sem erro nenhum; na Vercel vai crua. `POST /api/billing/subscribe`
  (dono-only) cria cliente + assinatura e devolve a `invoiceUrl` (página do Asaas onde a pessoa
  escolhe Pix, boleto ou cartão); **não** marca a conta como `active`, porque assinar não é pagar.
  Troca de plano faz `PUT` no valor da assinatura existente (criar outra cobraria duas vezes).
  `DELETE` na mesma rota cancela e grava o motivo. `POST /api/billing/webhook` é **público**,
  autenticado pelo header `asaas-access-token` (`ASAAS_WEBHOOK_TOKEN`) e **idempotente pelo id do
  evento** (`billing_events.asaas_event_id` UNIQUE; reenvio bate na constraint e sai por 200). Acha o
  tenant por 3 caminhos: `billing_subscription_id` → `billing_customer_id` → `externalReference`.
  Mapa de eventos: `PAYMENT_CONFIRMED`/`RECEIVED` → `active`; `PAYMENT_OVERDUE` → `past_due` +
  carência; `PAYMENT_REFUNDED` → `past_due` sem carência; **`PAYMENT_DELETED` NÃO muda estado**
  (acontece em limpeza administrativa e ao cancelar; bloquear por faxina nossa seria tiro no pé).
  A tela `/assinatura` é **caixa, não vitrine**: a página de vendas mora no site; aqui só três linhas
  de plano, CPF/CNPJ (exigência do gateway, o documento **não** é gravado no nosso banco), pagamento
  e cancelamento. `?plano=` pré-seleciona a linha para o link vindo do site.
- **Marca:** nome, inicial e tagline ficam em `lib/brand.ts`, e o selo em `components/BrandMark.tsx`
  (usado em login, cadastro, recuperar senha, definir senha, assinatura e nav rail). Trocar de marca
  é editar esse arquivo mais `--accent` e `.brand-grad` no `globals.css`. **Verde, âmbar e vermelho
  são cores de ESTADO** (IA ativa, aviso, bloqueio): não usar como cor de acento da marca.
  O CRM é **subproduto da OBS** (O Bom Sobrinho): herda família tipográfica (Manrope + Space
  Grotesk) e o roxo; pode ter marca-filha própria, desde que derivada do bloco com "OBS" em espaço
  negativo. O nome do produto ainda não existe, então **nada de nome fixo em componente**.
- **Design system (tokens em `app/globals.css`):** fonte da verdade é o projeto **"OBS CRM"** no
  Claude Design. Quatro regras que valem em toda UI nova:
  1. **Cada matiz tem 4 papéis:** `fill` (fundo cheio), `on` (tinta sobre o fill), `ink` (a cor como
     TEXTO ou ícone sobre superfície) e `surface`/`line`. **NUNCA usar `fill` como cor de texto**
     (é o que produzia as 18 reprovações WCAG AA) e nunca usar `ink` como fundo. Ou seja:
     `text-brand-ink`, não `text-accent`; `text-warn-ink`, não `text-warn`.
  2. **Tinta em 4 níveis:** `ink` > `ink-2` > `ink-3` (piso de texto, mínimo 12px) > `ink-faint`
     (**nunca** texto, só ícone e divisor). `--ink-muted` e `--ink-dim` são aliases de `ink-2`/`ink-3`.
  3. **Seis papéis tipográficos** com entrelinha travada: `text-display`, `text-titulo`,
     `text-corpo`, `text-apoio`, `text-legenda`, `text-rotulo`. Nada abaixo de 12px na interface.
  4. **O azul `--brand-grad-end` (#4464d4)** existe só porque a logo termina nele. Escopo fechado:
     gradiente de marca, símbolo e superfície decorativa a partir de 28px. Não pinta texto, ícone
     nem estado.
  ⚠️ Os aliases legados (`--accent`, `--ia`, `--danger`, `--canvas`) seguem nos **valores antigos de
  propósito**: componentes ainda os usam como cor de texto, e trocá-los pelos `fill` novos pioraria
  o contraste. Migram junto com o redesenho das telas. Avatar usa `avatarPair()` (`lib/inbox.ts`),
  que devolve par de fundo tingido + tinta via `--av-N-bg`/`--av-N-fg`, nunca branco sobre cor cheia.
- **Fase 4 (cadastro self-service):** `/cadastro` (público) manda `{companyName, email}` para
  `POST /api/signup`. **O formulário NÃO pede senha de propósito:** a senha nunca passa pelo nosso
  servidor. A rota usa `auth.admin.inviteUserByEmail` (mesmo caminho provado do convite de equipe),
  a pessoa abre o link, cai em `/auth/confirm` e escolhe a senha em `/definir-senha`, e daí em
  `/connect`. Confirmação de e-mail fica obrigatória por construção. O tenant é criado pela função
  `public.provision_tenant(user_id, company_name, trial_ends_at)` (**security definer**, só
  service_role executa): `clients` + `user_clients` (dono) + funil inicial **numa transação**, e é
  **idempotente** por `user_id`. Se ela falhar depois do usuário criado, a rota **apaga o usuário**
  (nunca sobra conta sem tenant nem tenant sem dono). Freio de abuso: 5 tentativas por hora e 20 por
  dia por IP, contadas em `signup_attempts` (serverless não tem memória compartilhada); tentativa
  que falha também conta. `/recuperar-senha` e a troca de senha em `/perfil` falam com o Supabase
  Auth **direto do browser** (a troca confere a senha atual antes, porque `updateUser` não pede).
  ⚠️ Cadastro e convite dependem de SMTP configurado no projeto Supabase.
- **Fase 4 (onboarding e publicação):** `lib/onboarding.ts` (**módulo puro**) define os 4 passos
  (conectar, configurar, testar, publicar), `onboardingState()` calcula progresso e libera um passo
  só quando o anterior está feito, e `publishBlockers()` é a MESMA regra usada pela UI e pela rota
  (sem duas opiniões). Sinais no banco: `evolution_instance`, `agent_config_updated_at`,
  `onboarding_tested_at` (marcado por `/api/playground` no primeiro teste) e `agent_published_at`.
  `getMyClient()` traz `onboarding` pronto (só escalares, **nunca** `persona`/`agent_config`).
  `components/OnboardingBar.tsx` aparece em toda página do app enquanto não publicado.
  **`agent_published_at` é o interruptor do agente:** com ele nulo, `processTurn` devolve **200 com
  `messages` vazio** (e NÃO erro) antes de chamar o modelo, então a IA fica muda, não gasta token e
  **a mensagem do cliente continua sendo gravada** pelo n8n para um humano responder. Vale só fora
  do `dryRun` (senão o passo "testar" seria impossível). Publicar exige os 3 passos anteriores
  (`PUT /api/clients/[id]/publish`, dono-only, 409 com o que falta). Aviso de risco do QR em
  `/connect` (`components/ConnectionRiskNotice.tsx`): **nunca** prometer proteção contra bloqueio
  nem usar "não pague a API da Meta" (e2e trava isso).
- **Decisões mantidas de propósito:** `dados_cliente.atendimento_ia` é `text`
  (`'ativa'`/`'reativada'` = ligada, `'pause'` = pausada) — não é boolean. `chat_messages.active`
  é coluna legada morta (mantida). Não sugerir trocar sem pedirem.

## n8n (⚠️ produção)
- **Arquitetura da IA (cutover APLICADO e ativo):** o cérebro do agente saiu do n8n e roda em
  `POST /api/agent` (stateless; persona + histórico de `chat_messages` + AGORA + retrieval do RAG +
  guardrail; saída `{ output: { messages, action, summary, preferencia_horario }, diagnostics }`).
  O n8n é só o cano: o nó `Atendente` do workflow ativo "OBS Atendimento" é um HTTP Request (POST)
  para `https://crm-obs.vercel.app/api/agent` com o header `x-lookup-secret` (valor só em env, nunca
  no código/chat). Depende de `OPENAI_API_KEY` no ambiente do app (Vercel); sem ela responde 501.
  Modelo: `gpt-5.4-mini`.
- Bot **"OBS Atendimento"**: resolve o tenant pelo `instance` do payload (nó `Resolve tenant` →
  Supabase), carimba `client_id`, usa a `persona`/instância/memória do tenant. Memória isolada por
  `client_id:telefone`.
- **Data/hora injetada:** o nó `Atendente` anexa ao fim do `systemMessage` um bloco `### AGORA`
  com a data/hora atual (America/Sao_Paulo, pt-BR) via `$now`. Logo o agente **sabe** a data/hora;
  `buildPersona` referencia essa "seção AGORA" (não dizer mais que o agente não sabe a data).
- **"CRM Envio Manual"**: envio manual do CRM, roteado por `instance`/`client_id`.
- **Handoff silencioso (Fase 3.5):** em `action=pausar` o `/api/agent` devolve `messages: []` (a IA
  não responde, só abre o handoff). Os nós do n8n aguentam array vazio (`Salva chat_messages` usa
  `messages.join(' | ')` que vira `''`; `Split messages` gera 0 itens; nada é enviado). PORÉM o
  ramo que pausa a IA (`Action` -> `Pausa IA (handoff)`) fica no fim do `Loop envio`, que não roda
  com 0 itens. Por isso **o próprio `/api/agent` pausa a IA** (`dados_cliente.atendimento_ia='pause'`)
  no handoff, sem depender do n8n. O `agendar` continua não vazio: o n8n manda o recap, notifica o
  grupo e pausa (`Pausa IA (agendado)`). **Nenhuma mudança no n8n foi necessária.**
- **REGRA:** nunca modificar/ativar workflows n8n ao vivo sem confirmação explícita do usuário.
  Usar `validateOnly` antes de aplicar.

## Rodar
- Dev: `npm run dev` (porta 3001 via `.claude/launch.json`). Build/checagem de tipos: `npm run build`.
- Testes e2e (Playwright, pasta `e2e/`): `npm run test:e2e -- --project=sem-login` (telas `/design`,
  sem login) e `npm run test:e2e:login` (fluxos com login; credenciais em `.env.e2e.local`, fora do
  git). Detalhes em `e2e/README.md`. Escritas de teste só no tenant da Loja Teste; nunca na OBM.
- Rotas: `/login`, `/cadastro` (público, cria conta), `/recuperar-senha` (público),
  `/connect` (QR + aviso de risco + import automático), `/inbox`, `/inbox/[id]`, `/pipeline`
  (board Kanban do funil), `/painel` (dashboard, 4 números), `/agente` (construtor do prompt),
  `/conhecimento` (base de conhecimento/RAG, dono-only), `/playground` (bancada de teste do agente,
  dono-only), `/equipe` (membros do time), `/perfil`, `/assinatura` (estado da conta, destino do
  gate de assinatura; fora do route group `(app)`), `/definir-senha` (convidado escolhe a senha),
  `/auth/confirm` (verifica o link do e-mail).
  Endpoints em `app/api/clients/[id]/...` (connect-whatsapp,
  whatsapp-status, import, **agent-config** `PUT`, **notify-target** `PUT` dono-only,
  **publish** `PUT` dono-only (interruptor do agente),
  **knowledge** `DELETE` + **knowledge/upload-url** + **knowledge/process** dono-only, upload
  direto ao Storage por URL assinada + processamento à parte, compatível com o limite de corpo da
  Vercel), `app/api/agent` (cérebro, `processTurn`, protegido por `x-lookup-secret`),
  `app/api/playground` (bancada, dono-only por sessão, reusa `processTurn` em `dryRun`),
  `app/api/team/{invite,remove}` (dono-only, service_role), `app/api/signup` (**público**, freio de
  abuso por IP + `provision_tenant`) e `by-instance`.

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
**Fases 1, 2, 3 e 3.5 concluídas e verificadas** (detalhes e checkboxes em `docs/proximos-passos.md`).
- **Fase 1** (inbox de equipe): multi-login (`/equipe`), atribuição, não-lidas, tags, notas,
  respostas rápidas, edição de contato, render de mídia, busca no conteúdo, agente restrito ao dono.
  ⚠️ O convite depende de SMTP + template "Invite user" no projeto Supabase.
- **Fase 2** (IA competitiva): cérebro em `POST /api/agent` (n8n = cano; ver estado do cutover na
  seção n8n), qualificação persistida (`conversation_qualifications`), base de conhecimento/RAG
  (`/conhecimento`), controle de alucinação, presets por segmento, e **mídia receber/enviar** de
  verdade (Storage + n8n). RAG verificado ponta a ponta. **B-6** (notificar o dono no WhatsApp por
  lead) foi **removido do roadmap** por decisão: o dono acompanha a evolução no `/painel` (semanal).
- **Fase 3** (CRM): pipeline Kanban (`/pipeline`, `pipeline_stages` por tenant, drag move o card,
  gestão dono-only), a IA move o card em `/api/agent` (`nextIaStage`, só avança, respeita o humano),
  e dashboard mínimo (`/painel`, 4 números). Dívida `msg1 | msg2` reavaliada e mantida adiada
  (fluxo quente; ver `docs/proximos-passos.md`).
- **Fase 3.5** (fechamento da IA): guardrail de validação antes de enviar (`lib/guardrail.ts`),
  handoff coach (`conversations.pending_instruction`, a IA retoma sozinha no próximo turno),
  handoff silencioso (`pausar` -> `messages` vazio + o `/api/agent` pausa a IA sozinho, sem mudar o
  n8n), e a bancada de teste `/playground` (dono-only, `dryRun` no cérebro real via
  `lib/agent-turn.ts`).
- Testes e2e (Playwright, `e2e/`) cobrem as telas `/design` (inclui `/design/playground`) e o login
  do dono; ainda **sem** cenário e2e para `/pipeline` e `/painel` (só `/design` + tsc/eslint).
