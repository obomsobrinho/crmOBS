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
  `notify_group_jid`, `imported_at`, `agent_config` (jsonb do construtor guiado; dentro dele,
  `hours` é lido também por `lib/valor.ts` e `handoffNotice` é a base do aviso de handoff),
  `prompt_mode` (`guiado`/`avancado`), `agent_config_updated_at`. **Fase 4 (assinatura):**
  `subscription_status` (`trialing`/`active`/`past_due`/`canceled`, CHECK no banco),
  `trial_ends_at`, `grace_until` (carência em atraso), `billing_provider` (`asaas`/`stripe`),
  `billing_customer_id` + `billing_subscription_id` (únicos parciais, o webhook acha o tenant
  por eles), `billing_seats`, `billing_updated_at`.
  - **REGRA:** o n8n lê SÓ `persona` (ao vivo, a cada msg). No modo `guiado`, `persona` é a
    **saída compilada** de `agent_config` por `buildPersona` (`lib/agent-prompt.ts`); no
    `avancado`, é texto escrito à mão.
  - **ESTRUTURA BASE DO PROMPT (decisão de 22/08/2026, contexto em `docs/proximos-passos.md`):
    TRÊS CAMADAS, e a ordem é a defesa.** (1) base que abre (identidade, contexto, tom, fontes e
    honestidade), (2) conteúdo do cliente cercado por `--- início/fim ---`, (3) **base que fecha**
    (precedência, quando chamar humano, anti-manipulação, `### OUTPUT`). O contrato é o ÚLTIMO bloco
    porque recência o protege do que o cliente escrever sem querer. Duas regras saem disso:
    **base é molde e regra, cliente é valor** (nome e horário são dado do cliente, nunca texto da
    base, senão existe uma base por cliente), e **precedência declarada** (o cliente manda no jeito
    de atender: tratamento, apelido, tom; a base manda no contrato).
  - **O rabo da base é UMA função, usada pelos DOIS modos:** `buildBaseTail()` em
    `lib/agent-prompt.ts` produz `PRECEDÊNCIA` + `QUANDO CHAMAR UM HUMANO` + `ANTI-MANIPULAÇÃO` +
    `### OUTPUT`, e `buildPersona` termina chamando ela. **`agentName`/`companyName` são OPCIONAIS
    ali de propósito:** tenant em modo avançado pode não ter `agent_config` (a OBM não tem), e um
    rabo que dependesse de dado do tenant não seria invariante; sem os nomes o texto fica genérico.
  - **Modo avançado = liberdade com rabo colado.** O tenant escreve o que quiser e o servidor
    **sempre recola** o rabo: `buildAdvancedPersona` roda `stripBaseTail` (que remove do texto dele
    qualquer seção da base, para não duplicar) e concatena `buildBaseTail`. A rota devolve `removed`
    e a tela **AVISA** o que vai sair, em vez de apagar em silêncio. Sem isso, quem está no avançado
    nunca mais recebe melhoria da base, que foi exatamente o que aconteceu na regra de handoff e
    obrigou a colar as regras à mão na persona da OBM.
    ✅ **A persona da OBM FOI recompilada** (22/08/2026, autorizada pelo dono): 10.494 -> 11.452
    chars, `md5 0efa85000852f92b75140562127b3544`, com a versão registrada em `agent_publications`
    (`published_by` nulo, porque foi migração e não alguém clicando em Salvar). Backup em
    `public._persona_backup_20260822`.
    **Duas coisas dela foram MOVIDAS antes de recompilar, senão morreriam no strip:** o parágrafo
    "IMPORTANTE: os exemplos acima..." (morava dentro do `### OUTPUT` dela e é o que impede o modelo
    de responder em texto solto imitando os exemplos) e a calibragem do summary ("segmento, dor
    identificada e contexto relevante"). Os dois foram para o fim do `### EXEMPLOS`, onde o "acima"
    do parágrafo continua verdadeiro. Ela **perdeu de propósito** o nome no `ANTI-MANIPULAÇÃO`
    (o rabo da base fica genérico sem `agent_config`) e o "com o time" no aviso de handoff: injetar
    os nomes à mão produziria uma persona que a rota não sabe reproduzir, e no próximo save pela UI
    eles sumiriam. O `### IDENTIDADE` dela já diz quem é o Tony, então o modelo não perdeu o nome.
    Ganhou os 3 gatilhos fixos de escalada que não tinha. Fumaça com o cérebro real (rodando o texto
    dela por `personaOverride` na Loja Teste, para não escrever na OBM): apresenta como "Tony, da
    OBS", devolve 2 mensagens no array, recusa dar preço e oferece a call, guardrail passou.
  - **SALVAR JÁ É PUBLICAR**, porque o n8n lê `persona` ao vivo. Logo **não existe rascunho nem
    botão Publicar**: cada save do `PUT /agent-config` grava uma linha em **`agent_publications`**
    (log append-only: `config`, **`persona` compilada**, `prompt_mode`, `published_by`,
    `published_at`). Esse log **não é fonte de verdade** (quem atende segue em `clients`), é
    registro: serve para restaurar uma versão e para responder "o que o agente estava dizendo na
    terça?", cruzando com `agent_turns`. **Restaurar não grava:** carrega a versão no formulário e a
    pessoa salva. Leitura por membro do tenant (RLS), escrita só service_role.
  - **`agent_enabled` (boolean) é o liga-desliga; `agent_published_at` é a PRIMEIRA ativação e
    NUNCA é limpo.** São separados porque zerar `agent_published_at` ao desligar fazia
    `onboardingState().complete` virar false e a barra de onboarding reaparecer em toda página
    pedindo "Publicar o agente", só porque alguém desligou a IA por uma hora. O `processTurn`
    emudece se qualquer um dos dois barrar. **Vocabulário: "Agente ativo" e "Desativado", nunca
    "pausado"** (pausada é a IA de UMA conversa quando um humano assume; usar a mesma palavra nos
    dois lugares faz a pessoa olhar o inbox sem saber qual dos dois parou). Config do agente é editada em `/agente` (**só dono**: a
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
  `pending_instruction` do handoff coach). ✅ **"colunas liberadas" agora é BANCO, não convenção**
  (22/08/2026, `mt_conversations_column_grants`): o grant de UPDATE saiu do nível de tabela e virou
  grant por COLUNA, só nas 8 que o browser escreve (`unread_count`, `assigned_user_id`, `stage`,
  `stage_source`, `stage_changed_at` e os três `pending_instruction*`). Antes a policy só checava o
  tenant, e qualquer membro podia escrever qualquer coluna pelo browser. **`handoff_at` ficou de fora
  de propósito** (abre no `/api/agent`, fecha no `/api/send`, os dois service_role): limpar ele pelo
  browser escondia a conversa do filtro "Precisa de você". `status` também ficou fora, porque ninguém
  escreve. Provado por impersonação: `update unread_count` como `authenticated` passa, `update
  handoff_at` responde `42501 permission denied`.
  ⚠️ **O que grant NÃO resolve:** separar dono de atendente por coluna, porque os dois são o MESMO
  papel de banco (`authenticated`). Então `stage_source` e `pending_instruction` seguem abertos a
  qualquer membro do tenant, e `pending_instruction` entra no system prompt como orientação confiável
  do time. Apertar isso exige trigger ou mover o write para rota service_role: **decisão pendente do
  dono do produto**. Convite/remoção
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
  para `pausar`. **Handoff coach:** `conversations.pending_instruction` (browser
  direto) guarda a orientação do operador; `/api/agent` consome no próximo turno e limpa (a IA
  retoma sozinha). **Handoff (regra geral, revista em 20/08/2026): HANDOFF NÃO PAUSA E NÃO
  EMUDECE A IA.** A versão anterior fazia as duas coisas (em `action=pausar` zerava `messages` e
  gravava `atendimento_ia='pause'`) e produção mostrou os dois defeitos juntos: a IA abria o
  handoff em silêncio, a pessoa mandava outro pedido 26s depois e, com a IA pausada, esse pedido
  era gravado mas **nunca classificado**; e como a pausa é porta de mão única, **46 dos 47
  contatos da OBM estavam com a IA desligada para sempre**. Agora: a IA responde uma frase
  dizendo **o que** vai verificar (texto base em `agent_config.handoffNotice`, regra no prompt),
  marca `conversations.handoff_at` e **segue atendendo**; cada mensagem nova gera handoff novo com
  o resumo do **último** pedido (`conversation_qualifications` já grava uma linha por turno).
  `handoff_at` guarda o **primeiro** handoff em aberto (é ele que dá a espera real, "esperando há
  6h"), é limpo pelo envio manual (`POST /api/send`, service_role) e é o que alimenta o filtro
  "Precisa de você". **Pausa volta a significar só o que deveria:** um humano assumiu (nó
  `Pausar IA (Franck digitou)` do n8n) ou alguém desligou na chave. **Bancada de teste** (painel
  lateral dentro de `/agente`, dono-only) fala com o cérebro REAL via `POST /api/playground`
  (sessão do dono, força `dryRun`), sem WhatsApp.
- **Bancada de teste dentro do `/agente` (22/08/2026):** `components/AgentTestDrawer.tsx` abre o
  `Playground` num `sheet` (`tamanho="largo"`). **Ela testa a configuração EM EDIÇÃO, não a salva**,
  e é isso que resolve o problema: salvar já é publicar, então antes disso testar significava mexer
  no agente que está atendendo cliente de verdade. O corpo do `POST /api/playground` leva a
  configuração **crua** (`mode` mais `config` ou `persona`) e **quem compila é o servidor**
  (`validateConfig` + `buildPersona`, ou `buildAdvancedPersona` no avançado), então o rabo invariante
  da base é sempre recolado: persona final vinda do browser poderia chegar sem `### OUTPUT` e o teste
  mentiria. `processTurn` recebe `personaOverride` e **só honra em `dryRun`** (a guarda mora no
  módulo, e não na rota, porque persona vinda de fora nunca pode atender no WhatsApp). Config
  incompleta volta **400** com os campos que faltam. **Foi painel e não duas colunas** de propósito:
  duas colunas refariam o layout de `/agente` aprovado em 22/08. ⚠️ A tela `/playground` **não existe
  mais** (responde 404) e saiu do menu; ficaram o endpoint e o preview `/design/playground`.
- **Fase 4 (assinatura e gate):** a regra de acesso mora em `lib/billing.ts` (**módulo puro**, zero
  imports, igual `lib/agent-prompt.ts`, então servidor e browser usam a MESMA função):
  `accessState({subscription_status, trial_ends_at, grace_until})` devolve `{blocked, reason,
  trialDaysLeft, warn, message}`. `getMyClient()` já traz `access` pronto (as colunas vêm no mesmo
  select). **Conta bloqueada entra em MODO LEITURA** (decisão do dono do produto), não é expulsa: as
  mensagens seguem chegando e ela acompanha as conversas, como um WhatsApp Web aberto, mas não
  trabalha. **Gate server-side em 4 pontos**, nunca esconder botão no client:
  (1) `requireActiveTenant()` (`lib/auth.ts`) manda para `/assinatura` nas páginas pagas
  (`/pipeline`, `/painel`, `/agente`, `/conhecimento`, `/equipe`); fica em CADA
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
  `rag_top_similarity`), guardrail, `latency_ms`, `model`, `input_tokens`, `output_tokens`,
  `cached_input_tokens` e
  `dry_run` (playground: o token foi gasto, mas métrica de operação deve filtrar fora). **Não guarda
  conteúdo de mensagem** (isso é `chat_messages`). `runAgent` passou a devolver
  `{output, usage, model}` para isso. A escrita é `logTurn` em `lib/agent-turn.ts`, **best-effort e
  nunca lança**: medição não pode virar erro de atendimento. Leitura por membro do tenant (RLS),
  escrita só service_role. Serve a três perguntas que hoje são chute: custo real por conversa, se a
  base de conhecimento está sendo usada, e quantas vezes o guardrail conteve a IA.
  ⚠️ O **limite de conversas do plano NÃO sai daqui**: conversa é janela de 24h contada em
  `chat_messages` (inclui manual), `agent_turns` é só o que a IA processou.
- **Fase 4 (cache de prompt medido):** `cached_input_tokens` responde a pergunta que decide a
  margem do plano Avançado (40% sem cache, 55% com). Sai de
  `usage.prompt_tokens_details.cached_tokens`; `null` = o modelo não informou, `0` = o prefixo não
  bateu e **o primeiro turno de uma conversa é sempre 0**. Medição real na Loja Teste: turno 1 com
  0 de 3.787, turno 2 com **2.304 de 3.870 (59,5%)**. O que faz o cache pegar é a ORDEM que
  `lib/agent.ts` já monta (persona, RAG, AGORA, orientação do operador): só a persona é prefixo
  estável, então **não reordenar isso** sem refazer a conta. O limiar mora em `lib/agent-prompt.ts`
  como par de constantes: `CACHE_MIN_TOKENS` (1.024, o piso documentado para GPT-5.6+) e
  `CACHE_SAFE_TOKENS` (2.048), e **o aviso do `/agente` usa o de cima de propósito**, porque
  `gpt-5.4-mini` cai na faixa "anterior ao 5.6", onde a própria OpenAI diz que o mínimo vai de
  1.024 a 2.048 e o cache é inconsistente pouco acima de 1.024. Prometer economia que não vem é
  pior que avisar de um risco que não se concretizou. Na prática o guiado nunca dispara o aviso
  (o esqueleto vazio já dá ~2.146 tokens); quem dispara é modo avançado com prompt curto.
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
- **Valor percebido (`lib/valor.ts`, módulo puro):** transforma operação em frase de dependência
  ("213 mensagens respondidas fora do horário em julho"). Ataca o churn: o valor do produto é
  invisível porque a IA responde dentro do WhatsApp. Mora no `/painel` (mês **fechado** com o
  **acumulado desde o início** junto) e no passo de cancelar do `BillingCheckout` (acumulado).
  **É a MANCHETE do painel:** a frase mais forte (`frasesDeValor` já devolve em ordem de força) ocupa
  a largura inteira em superfície da marca, com o acumulado como segunda linha, e o resto vai para a
  grade. Mês fechado vazio **cai no acumulado** em vez de mostrar tela vazia (conta nova é quando o
  cliente mais duvida do produto), e nesse caso o rótulo do período vira "desde o início" junto,
  senão o título mentiria. `ValorResumo` **não calcula nada**: duas opiniões sobre o mesmo número é o
  começo de um número inventado. No `/painel` o mês é **recortado do acumulado em memória** (por
  `Date.parse`, nunca comparando ISO como string: o banco devolve `+00:00` e `mesFechado` gera `Z`),
  para não pedir as mesmas linhas duas vezes. Quatro regras que não se negociam:
  (1) **nunca inventar nem inflar**, porque o cliente confere no WhatsApp dele; sem horário
  configurado a frase é **omitida**, e frase com zero não entra;
  (2) **só resposta da IA conta** em "fora do horário" e "fim de semana" (`message_type='manual'` é
  humano trabalhando de madrugada, e somar inflaria a frase);
  (3) classificação em **America/Sao_Paulo** via `Intl`, nunca em UTC (em UTC a mensagem da noite
  vira do dia seguinte);
  (4) **feriado só nacional**, calculado no módulo (fixos + móveis da Páscoa); municipal exigiria
  cadastro por tenant, e chutar transformaria dia útil em feriado dentro da frase.
  O horário sai de `agent_config -> hours`, e o `PUT` de `agent-config` aceita `mode: "horario"` para
  salvá-lo **sozinho** (merge, sem tocar `persona` nem `prompt_mode`): tenant em modo avançado tem
  persona escrita à mão e o formulário guiado a substituiria.
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
     (**nunca** texto, só ícone e divisor). Os nomes `text-ink-muted` e `text-ink-dim` **não existem mais**: eram aliases e foram removidos em 17/08/2026.
  3. **Seis papéis tipográficos** com entrelinha travada: `text-display`, `text-titulo`,
     `text-corpo`, `text-apoio`, `text-legenda`, `text-rotulo`. Nada abaixo de 12px na interface.
  4. **O azul `--brand-grad-end` (#4464d4)** existe só porque a logo termina nele. Escopo fechado:
     gradiente de marca, símbolo e superfície decorativa a partir de 28px. Não pinta texto, ícone
     nem estado.
  ⚠️ Os aliases de @theme (`--color-accent`, `--color-ia`, `--color-ink-muted`, `--color-ink-dim`)
  e as classes `.btn-primary`, `.glass`, `.panel` e `--radius-2xl` **FORAM REMOVIDOS** em
  17/08/2026, quando o último consumidor migrou. Sobram só `--surface` (4 usos) e `--panel`
  (1 uso), os dois na tela de atendimento: a migração deles está escrita e **aguardando decisão do
  dono do produto**, porque mexe em 4 pixels de uma tela já aprovada. Avatar usa `avatarPair()` (`lib/inbox.ts`),
  que devolve par de fundo tingido + tinta via `--av-N-bg`/`--av-N-fg`, nunca branco sobre cor cheia.
- **Camada base shadcn/ui (`components/ui/`, 16 arquivos):** `button`, `input`, `textarea`,
  `badge`, `avatar`, `separator`, `card`, `scroll-area`, `dropdown-menu`, `switch`, `tabs`,
  `tooltip`, `dialog`, `sheet`, `select`, `checkbox`. O `sheet` (painel lateral, drawer) entrou em
  22/08/2026 e é arquivo separado do `dialog` de propósito: o `conteudoVariants` do dialog embute
  `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`, e sobrescrever isso por className brigaria
  com o `translate` do centramento (a armadilha do Tailwind v4 documentada abaixo). Animação
  própria: `.anim-lateral` no `globals.css`, que PODE mexer em `translate` porque o painel encosta
  em `right-0` e não usa translate para se posicionar. A largura do `sheet` é **variante**
  (`tamanho: padrao` 520px para leitura, `largo` 1040px para a bancada de teste), e não className na
  tela: eram dois usos da mesma sopa de classe com um número trocado. Sobre **Radix** (pacote unificado `radix-ui`), com
  `cva` e `cn` (`lib/utils.ts`). **São DUAS camadas:** `components/ui/` é a BASE, ajustada UMA vez
  para encarnar o sistema; `components/` é PRODUTO e consome a base. **Toda a UI já passou por ela**
  (concluído em 17/08/2026). Antes de escrever `className` numa tela, procurar a variante na base:
  se a mesma sopa de classe aparecer duas vezes, ela virou variante.
  Sete regras da base, cada uma paga com bug:
  1. **Geometria mora no `size`** do cva, não na base: raio, `gap` e peso da fonte. Assim
     `size="none"` significa mesmo "sem geometria".
  2. **Nunca `[&_svg]:size-4`**: `size-4` é CSS e vence o atributo `width` do lucide, engordando
     todo ícone de 13, 14 e 15px.
  3. **Nunca anel de foco no componente**: o foco é global no `globals.css`.
  4. **`data-slot` DEPOIS do spread**, senão um gatilho de fora (ex.: `TooltipTrigger`) sobrescreve.
  5. **Não depender do `data-state` de um ancestral** (`TooltipTrigger` sobrescreve o do filho):
     passar estado por prop, como `SwitchTrack`/`SwitchThumb` fazem.
  6. **`tailwind-merge` conhece a escala tipográfica** via `extendTailwindMerge` em
     `lib/utils.ts`. Sem isso ele trata `text-corpo` como COR e descarta `text-ink-2` em silêncio.
  7. **Root do Radix não renderiza elemento:** `DropdownMenuTrigger asChild` em volta de
     `<Tooltip>` clona props no nada. Os dois gatilhos precisam se encadear ao MESMO elemento.
  ⚠️ **Animação é CSS da casa**, não `tw-animate-css` nem Motion: `.anim-flutuante`, `.anim-fundo`
  e `.msg-in` no `globals.css`, com `prefers-reduced-motion`. O Radix espera o `animationend` para
  desmontar, então a saída funciona sem `forceMount`. **O Tailwind v4 emite `-translate-x-1/2` como
  a propriedade `translate`, separada do `transform`:** keyframe que repita o translate SOMA em vez
  de substituir (o modal andou 256px na primeira tentativa).
  ⚠️ Para `<form>` ou `<section>` que É o cartão, usar `cn(cardVariants(), ...)` em vez de
  `Card asChild`: evita um nó extra na árvore só para envolver.

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
  **O interruptor do agente são DUAS colunas** (ver a regra no glossário de `clients`):
  `agent_published_at` nulo **ou** `agent_enabled` false e o `processTurn` devolve **200 com
  `messages` vazio** (e NÃO erro) antes de chamar o modelo, então a IA fica muda, não gasta token e
  **a mensagem do cliente continua sendo gravada** pelo n8n para um humano responder. Vale só fora
  do `dryRun` (senão o passo "testar" seria impossível). `PUT /api/clients/[id]/publish` recebe
  `{ enabled: boolean }`, é dono-only, e os 3 passos anteriores são exigidos **só na primeira
  ativação** (409 com o que falta): quem já testou não testa de novo para religar. Aviso de risco do QR em
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
- **Handoff sem pausa (20/08/2026):** agora `action=pausar` devolve mensagem (a IA avisa o que vai
  verificar e segue atendendo). Isso tem uma consequência no n8n que é fácil de esquecer: **com
  `messages` não vazio, o `Loop envio` termina e o `Action` passa a ser alcançado**, então o nó
  `Pausa IA (handoff)` volta a disparar. Ou seja, tirar a pausa do lado do app **não basta**: os
  dois nós `Pausa IA (handoff)` e `Pausa IA (agendado)` estão **desativados desde 20/08/2026**
  (`disableNode`, que no n8n é pass-through, então `Notifica grupo` -> `Pausa IA (agendado)`
  continua notificando o grupo). O nó que PERMANECE ativo é `Pausar IA (Franck digitou)`: é ele
  que representa "um humano assumiu", o único caso em que a IA deve calar. Reverter é `enableNode`
  nos dois.
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
  `/conhecimento` (base de conhecimento/RAG, dono-only), `/equipe` (membros do time), `/perfil`, `/assinatura` (estado da conta, destino do
  gate de assinatura; fora do route group `(app)`), `/definir-senha` (convidado escolhe a senha),
  `/auth/confirm` (verifica o link do e-mail).
  Endpoints em `app/api/clients/[id]/...` (connect-whatsapp,
  whatsapp-status, import, **agent-config** `PUT`, **notify-target** `PUT` dono-only,
  **publish** `PUT` dono-only (`{ enabled }`, liga e desliga o agente),
  **knowledge** `DELETE` + **knowledge/upload-url** + **knowledge/process** dono-only, upload
  direto ao Storage por URL assinada + processamento à parte, compatível com o limite de corpo da
  Vercel), `app/api/agent` (cérebro, `processTurn`, protegido por `x-lookup-secret`),
  `app/api/playground` (bancada, dono-only por sessão, reusa `processTurn` em `dryRun`; aceita a
  configuração CRUA em edição e COMPILA no servidor),
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
- **Âncoras de posicionamento** são **ZapResponder** (piso de preço) e **HelenaCRM** (teto), não
  Kommo/RD Station/Blip/Zenvia. ⚠️ Isso NÃO quer dizer que o campo tenha dois concorrentes: a lista
  completa de pares está em `estrategia-2026-07.md` (faixa de R$ 87 a R$ 1.000, com Nexloo, Zappy,
  SocialHub, AtendeNex, Convecta AI, Umbler Talk, WiiChat, Sellflux, GPT Maker, BotConversa e
  outros). Nunca responder "os concorrentes são ZapResponder e Helena" sem abrir essa lista.
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
  e a bancada de teste (dono-only, `dryRun` no cérebro real via `lib/agent-turn.ts`; virou painel
  lateral dentro do `/agente` em 22/08/2026).
  ⚠️ O "handoff silencioso" desta fase foi **revertido em 20/08/2026** (ver a regra de handoff
  acima): ele emudecia e pausava a IA, e os dois efeitos se mostraram errados em produção.
- **Migração de UI para a camada base (17/08/2026):** as 15 telas do sistema saíram de classe
  solta para `components/ui/`. 51 arquivos tocados. Verificação: `npm run build` limpo, eslint em
  **0 erros** (os 2 de `set-state-in-effect` foram resolvidos com ajuste em tempo de render), e a
  tela de atendimento provada **idêntica** por retrato numérico (425 elementos no escuro, 417 no
  claro, zero diferenças de estilo). Um defeito de contraste foi corrigido em **7 lugares**:
  `--danger-fill` usado como TEXTO dava ~3,2:1 no escuro, e virou o par `danger-surface`/
  `danger-ink` (9,0:1).
- Testes e2e (Playwright, `e2e/`): **40 sem login** nas telas `/design` (inclui
  `/design/playground`, que agora abre o painel de teste) e **7 com login** (`e2e/*.auth.spec.ts`),
  estes últimos batendo no **cérebro real** em `dryRun`. Ainda **sem** cenário e2e para `/pipeline`.
