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
  **Beta:** `account_type` (`interno`/`beta`/`pago`, CHECK no banco, **nullable e sem default**;
  `mt_clients_account_type`, 28/08/2026). ⚠️ **IDENTIFICA, NÃO AUTORIZA:** `accessState` continua
  decidindo acesso só por `subscription_status` e `trial_ends_at`, e misturar as duas coisas é como
  um cliente pagante acaba trancado fora. `null` = não classificado, de propósito: chutar um default
  para quem entrou pelo `/cadastro` inventaria um fato. Marcar é manual (`update clients set
  account_type = 'beta'`), porque com 5 a 10 testadores uma tela de administração custa mais do que
  resolve. É a coluna que as consultas de `docs/instrumentacao-beta.md` filtram.
  - ⚠️ **REGRA REVISTA EM 17/09/2026: o n8n NÃO lê a persona, e não lê desde o cutover.** Ele manda
    só `client_id`, telefone, instância e mensagem; quem busca no Supabase é o nosso `processTurn`.
    O comentário antigo no código dizia o contrário e induziu ao erro.
    **A persona é MONTADA NA LEITURA**, a cada turno, por `personaDoTenant` (`lib/agent-turn.ts`),
    que chama **`compilePersona` (`lib/agent-prompt.ts`)**: `buildPersona(agent_config)` no guiado,
    `buildAdvancedPersona(persona)` no avançado (que tira o rabo antigo e cola o de hoje, então é
    idempotente).
    ⚠️ **`compilePersona` é o despacho "modo -> persona" e existe UMA vez**: os TRÊS caminhos
    (o `PUT` de agent-config, o `POST` do playground e o `processTurn`) chamam ela. Era código
    copiado à mão nos três, e como salvar e ler têm que produzir o MESMO texto, cópia divergindo
    significa o agente atendendo com algo que o Salvar nunca produziria. O limite `LIMITS.persona`
    mora dentro dela pelo mesmo motivo. **Nada de HTTP ali dentro**: ela devolve o motivo
    (`campos`/`vazio`/`longo`) e cada rota traduz para o seu 400.
    ⚠️ **`diagnostics.personaOrigem` diz DE ONDE veio o prompt** (`montada`, `montada_longa`,
    `salva`, `fallback`, `override`, `nenhuma`). Existe porque as quedas são silenciosas de
    propósito, e **`salva` em produção é ALARME**: significa que a montagem falhou e o tenant voltou
    a servir o texto congelado do último Salvar, que é o problema que a montagem na leitura veio
    resolver. Sem esse campo, essa regressão seria invisível. ⚠️ Ele NÃO é gravado em `agent_turns`
    (a tabela tem colunas fixas e isso exigiria migração): hoje aparece na bancada e na resposta ao
    n8n. **Motivo:** o texto era grudado e gravado no
    Salvar, então melhoria na base só chegava em quem salvasse de novo, e a OBS ficou dias com a
    regra de anti-manipulação antiga depois de a nova existir no código.
    `clients.persona` continua gravada no Salvar e em `agent_publications`: virou REGISTRO e a QUEDA
    (se a montagem falhar, o pior caso é o comportamento antigo, nunca um agente mudo).
    ⚠️ **O preço, e ele é real:** mudança na base entra em produção para TODOS na mensagem seguinte,
    sem revisão. O portão combinado com o dono é `npm run test:e2e:ia` verde antes de subir deploy
    que mexa na base. O cache de prompt não sofre: a string sai idêntica enquanto configuração e base
    não mudarem, e a ordem do prefixo continua a de `lib/agent.ts`.
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
    NUNCA é limpo.** São separados porque zerar `agent_published_at` ao desligar jogaria a conta
    inteira de volta no assistente de `/montagem`, só porque alguém desligou a IA por uma hora. É
    também o sinal que separa MONTAGEM de EDIÇÃO. O `processTurn` emudece se qualquer um dos dois
    barrar. **Vocabulário: "Agente ativo" e "Desativado", nunca "pausado"** (pausada é a IA de UMA
    conversa quando um humano assume; usar a mesma palavra nos dois lugares faz a pessoa olhar o
    inbox sem saber qual dos dois parou). Config do agente é editada em `/agente` e, na primeira vez,
    em `/montagem` (**só dono** nas duas: a página redireciona atendente e o `PUT` responde 403);
    write só por service_role (RLS de `clients` não dá UPDATE a `authenticated`).
- **`dados_cliente`** = os **CONTATOS/LEADS**: quem manda mensagem no WhatsApp *daquele* tenant
  (ex.: um lead da OBM). "O cliente do seu cliente". PK `bigint`. Único por `(client_id, telefone)`.
  Editável pelo CRM (grant de coluna, browser direto): `atendimento_ia`, `display_name` (nome que
  o CRM mostra, precede `nomewpp`) e `custom_fields` (jsonb). O n8n segue dono de `nomewpp`.
- **Tabelas próprias do CRM** (browser faz CRUD via RLS por tenant, não passam pelo n8n): `tags`
  + `conversation_tags` (rótulos por conversa), `conversation_notes` (notas internas, nunca vão
  ao WhatsApp; `author_user_id` = `auth.uid()`), `quick_replies` (mensagens prontas por tenant).
  **`feedback`** (relatos do beta; `mt_feedback`, 28/08/2026) é a exceção da lista: é a única que o
  browser **só escreve**. Tem `client_id`, `user_id` (default `auth.uid()`), `message`, `path` (a
  rota onde a pessoa estava, metade do valor do relato) e `user_agent`. ⚠️ **Sem policy de SELECT E
  sem grant de SELECT** para `authenticated`: nem o próprio autor relê pelo browser. Quem lê é o dono,
  por SQL (`docs/instrumentacao-beta.md`), e não existe tela de leitura de propósito, porque uma
  página interna para um leitor e dez linhas é só mais uma superfície para manter. A UI é um item no
  menu do avatar (`components/NavRail.tsx` -> `components/FeedbackDialog.tsx`), nunca um botão
  flutuante. **A confirmação não promete resposta** ("Recebido, obrigado."): é uma pessoa só atendendo
  dez empresas. ⚠️ **Ninguém é avisado quando um relato chega**, e isso é limitação assumida:
  notificar exigiria mexer no n8n, que é produção.
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
  ⚠️ **`createClient()` (server) e `getMyClient()` são MEMOIZADOS POR REQUEST com `React.cache`**
  (11/09/2026, C5 do plano da demo): layout e página chamam os dois na mesma navegação e antes cada
  chamada eram viagens novas ao Supabase. O escopo é o request (nada atravessa usuários). Consequência
  para quem escreve rota: dentro de um mesmo request, mudar algo em `clients` e chamar `getMyClient()`
  de novo devolve o valor ANTIGO; ler o que acabou de gravar exige consulta própria. Dentro do
  `getMyClient`, `clients` e `user_clients` saem em paralelo e o papel é escolhido em memória pelo
  `client_id`. Medido: troca de conversa caiu de ~656 para ~445 ms de TTFB no dev (35 a 40%, não a
  metade; o resto é `getUser` duas vezes em série, proxy e `getMyClient`).
- **`nomewpp = "Você"`:** a Evolution devolve `pushName = "Você"` em mensagens ENVIADAS. Isso NÃO
  é nome de contato. Sempre resolver nome via `lib/inbox.ts` (`cleanName` / `rowsToInbox` /
  `bestName`): melhor nome não-"Você" da conversa, senão o telefone.
- **Realtime cai, e a tela precisa saber (31/08/2026).** Sintoma que abriu o assunto: bolinha de
  4 não lidas acesa com o banco **já em zero**. O contador do servidor estava certo o tempo todo
  (o gatilho `sync_conversation` só incrementa com `user_message` não nula e tipo diferente de
  `imported`, então responder nunca sobe o número); o que faltava era a lista perceber que o
  WebSocket tinha morrido. Duas regras saem disso, e valem para qualquer tela que assine realtime:
  (1) **`.subscribe()` nunca sem callback** — `CHANNEL_ERROR` e `TIMED_OUT` passavam em silêncio.
  `SUBSCRIBED` chega de novo a cada reassinatura automática, e é aí que se re-busca, porque entre
  a queda e a volta ninguém recebeu evento. ⚠️ **A primeira assinatura é pulada de propósito**: os
  dados acabaram de vir do servidor, e re-buscar ali seriam três consultas jogadas fora em toda
  abertura do inbox (existe e2e que falha se o carregamento passar a re-buscar).
  (2) **Refetch ao voltar o foco** (`visibilitychange` + `focus`), que cobre o socket derrubado
  pelo sistema operacional enquanto a máquina dormia, cuja detecção demora.
  ⚠️ **Assinar tabela fora da publicação é handler morto e silencioso:**
  `conversation_qualifications` era escutada pela `ContactSidebar` e **não estava** em
  `supabase_realtime` (`mt_realtime_conversation_qualifications` corrigiu). A `REPLICA IDENTITY`
  dela fica no default (PK), e não `FULL` como as outras três, porque a tabela é append-only e só
  o INSERT interessa; se um dia houver update ou delete, aí precisa de `FULL`, senão a RLS do
  realtime não consegue avaliar a linha antiga e o evento é descartado.
  ⚠️ **Teste de coisa AUSENTE conta requisição, não pixel.** O e2e que existia para "marcar como
  lida" só conferia que saiu um PATCH com status < 400: navegava por URL, nunca clicava na lista
  e nunca olhava a bolinha, então não pegava nada disso.
- **A lista de conversas abre em HOJE (19/09/2026, decisão do dono).** Seletor de três posições na
  linha do título (`Hoje` / `7 dias` / `Tudo`, `data-slot="inbox-periodo"`), com os chips de estado
  seguindo iguais. Motivo: a lista dele abria com 48 conversas.
  ⚠️ **QUEM ESPERA POR VOCÊ NUNCA SOME PELO FILTRO DE TEMPO.** Conversa com `handoff_at` aberto
  aparece mesmo em "Hoje", senão o recorte esconde exatamente o que o produto existe para não deixar
  esquecer. É uma linha só (`needsYou(it) ||`) na base da lista, em `components/ContactSidebar.tsx`.
  A janela é ROLANTE em **dia civil de America/Sao_Paulo** (`dentroDaJanela`/`diaSP`, `lib/inbox.ts`):
  "hoje" é o dia de hoje e não as últimas 24h (às 9h, 24 horas trariam metade de ontem). As
  **contagens dos chips saem da janela**, não do total, e a **busca ignora a janela** (procurar
  alguém e não achar por causa da data é a busca mentindo).
  ⚠️ **Consequência para teste com login:** o tenant de teste é o número parado do dono, então num
  dia sem mensagem nova "Hoje" fica vazio. Teste que precise da lista escolhe "Tudo" antes
  (`resolver.auth.spec.ts` e `realtime.serial.spec.ts` já fazem).
- **O app diz quando o WhatsApp caiu (11/09/2026, C3 do plano da demo).** `components/WhatsAppBanner.tsx`
  fica no `(app)/layout.tsx` logo abaixo do `BillingBanner`, mesmo lugar e peso, e aparece enquanto o
  estado da instância for diferente de `open` (`close` vermelho, `connecting` âmbar, `unknown` neutro,
  os três com link para `/connect`). ⚠️ **A checagem é no BROWSER, depois do carregamento, a cada 60s e
  ao voltar o foco, e nunca no Server Component:** o layout roda em toda navegação e uma chamada à
  Evolution por página faria a tela esperar por API de terceiro (achado A1). Fonte:
  `GET /api/clients/[id]/whatsapp-status`. `estadoForcado` é só para o preview `/design/conexao` e
  para o teste; o layout nunca passa. O e2e com login intercepta a rota com `page.route` para forçar
  `close`, porque queda real não dá para provocar na Loja Teste.
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
  Dashboard (`/painel`): refeito em 27/08/2026, ver o bloco próprio logo abaixo.
- **Painel refeito (27/08/2026, passo 1 do MVP do beta).** Pesquisa, decisões e lista de
  instrumentação em `docs/proximos-passos.md`. O que precisa estar na cabeça antes de tocar nele:
  - ⚠️ **`imported` NÃO é resposta da IA.** A regra de quem respondeu mora em **`lib/mensagem.ts`**
    (módulo puro), e vale para `lib/valor.ts` e `lib/metrics.ts`. Antes as duas diziam
    "`message_type <> 'manual'`", e `imported` passava, então as respostas que o DONO digitou à mão
    no WhatsApp antes de a IA existir contavam como trabalho da IA: na OBM eram 84 das 94 linhas, e a
    tela dizia "46 de 47 conversas sem intervenção do time" quando eram 2. **Decisão: o painel conta
    só o que aconteceu depois que a IA entrou**; o importado segue no inbox, fora dos números.
  - **`lib/periodo.ts`** (módulo puro) tem as quatro janelas (dia/semana/quinzena/mês), rolantes e
    não de calendário. O período anterior é a janela igual anterior, **menos "dia"**, que compara com
    o MESMO dia da semana anterior (segunda contra domingo daria selo alarmante sem significado).
    `agoraMs()` existe só para embrulhar o relógio: `Date.now()` no corpo de Server Component é erro
    de `react-hooks/purity`.
  - **Os 4 períodos são calculados no SERVIDOR numa passada só** e o browser apenas troca qual
    mostra. ⚠️ **A manchete NÃO segue seletor nenhum**: ela é mês fechado mais acumulado, e a frase
    mais forte da tela não pode encolher com um clique. `ValorResumo` tem a prop `parte`
    (`tudo`/`manchete`/`resto`) para a página intercalar outros blocos entre as duas metades.
  - ⚠️ **RODADA 3 DO DESENHO, APLICADA EM 29/08/2026.** A estrutura mudou; ver o bloco "Painel,
    rodada 3" logo abaixo. `components/PainelOperacao.tsx`, `components/DashboardCards.tsx` e
    `components/DashboardBarras.tsx` **não existem mais**.
  - ⚠️ **Gráfico: `items-end` na linha das colunas QUEBRA as barras.** A coluna precisa de `h-full`
    (o `justify-end` dela é quem encosta a barra no chão). Com `items-end` a coluna fica com a altura
    do conteúdo, e a barra, que tem altura em porcentagem, resolve para ZERO. Foi assim que o gráfico
    de 14 dias renderizou invisível em produção com o e2e passando, porque o teste contava colunas e
    nunca mediu uma barra. Hoje existe teste de altura.
  - **Sem biblioteca de gráfico, e a razão é COR**, não bundle: verde, âmbar e vermelho são estado
    aqui, então existe UMA cor categórica (a marca) mais o cinza. Duas séries é o teto da paleta.
  - **"Preferiu confirmar"** (`conversation_qualifications` com `action='pausar'`) é a contenção
    virando prova: é a única forma observável de "a IA não inventa". Direção **neutra**, nunca verde
    nem vermelho. ⚠️ **Nunca rotular como "o que a IA não soube responder"**: `pausar` também dispara
    nos gatilhos fixos de escalada, que são política, e o rótulo acusaria a IA de uma falha que ela
    não cometeu. O rótulo é "o que a IA passou para você".
  - **A resposta do agente aparece VERBATIM e nunca escolhida a dedo.** Curar as boas e ser
    descoberto custa a confiança inteira. ⚠️ A REGRA de escolha mudou na rodada 3 (ver abaixo).
  - ⚠️ **"Antes e depois" com o histórico importado está BLOQUEADO POR DADO, não adiado.** Sondagem
    na Evolution em 27/08: `findMessages` devolve `total: 1` por conversa com e sem paginação, e o
    store da instância inteira da OBM tem 171 mensagens. Paginar a importação não resolve. Só falta
    medir um link NOVO (sync inicial completo) antes de descartar de vez.
- **Painel, rodada 3 do desenho (aplicada em 29/08/2026, passo 5 do MVP do beta).** Arranjo, blocos
  e animação vêm das pranchas aprovadas; mapa do que ficou de fora em `docs/proximos-passos.md`.
  - **Arranjo:** coluna principal mais trilha de 380px. Coluna: manchete (com o gráfico de hora
    DENTRO), operação em 4 cartões, movimento. Trilha: assuntos e a frase real do agente. A fila
    subiu para o cabeçalho. Medido em 1920: coluna 1268px, trilha 380px, cartão 305px, e a operação
    fecha em 594px, dentro dos 1080 sem rolar.
  - ⚠️ **CADA BLOCO MANDA NO PRÓPRIO PERÍODO. Não existe mais seletor global.** A operação tem os 4
    períodos, o movimento tem 14 e 30 dias, e a manchete não segue nenhum. O antigo aviso escrito
    "não segue o seletor" SUMIU e não pode voltar: ele era o sintoma de o controle estar no lugar
    errado, e existe e2e que falha se o texto reaparecer.
  - ⚠️ **O GRÁFICO DE HORA CONTA RESPOSTA DA IA, NÃO MENSAGEM RECEBIDA**, e essa é a decisão que
    sustenta a tela. A soma das partes ROXAS é EXATAMENTE o número da manchete, porque `barrasDeHora`
    (`lib/painel.ts`) conta as mesmas linhas que `atendidasForaDoHorario` conta, classificadas por
    `dentroDoHorario`. Contar chegadas daria outro conjunto (uma mensagem que chegou às 23h e o time
    respondeu no dia seguinte entra num e não no outro) e a igualdade quebraria. Por isso o rótulo é
    "em que horas a IA respondeu" e não "quando as mensagens chegaram": o desenho trazia o rótulo de
    chegada, e mantê-lo seria mentir sobre o que a barra mede. **Existe teste da igualdade nas duas
    suítes**, e ele passou contra dado real (Loja Teste, 1 = 1).
    Dentro ou fora considera o DIA DA SEMANA: 14h de domingo é fora. **Sem manchete de "fora do
    horário" o gráfico é omitido**, porque não teria com o que fechar.
  - **Dois limiares nomeados em `lib/painel.ts`**, os dois vindos de fora do produto:
    `ESPERA_AVISO_MS` (2h, veio da ferramenta de desenho) decide quando a fila passa de neutra a
    âmbar; `VERBATIM_MIN_CHARS` (120, **escolhido por mim, não pelo dono**) é o piso de tamanho da
    frase de reserva do verbatim.
  - **Verbatim: a regra mudou.** Era "a mais recente da IA" e caía em "Perfeito, até amanhã!" metade
    das vezes. Agora é a mais recente de uma conversa que a IA atendeu SOZINHA, com reserva na mais
    recente acima de `VERBATIM_MIN_CHARS`. Continua objetiva e aplicada sempre.
    ⚠️ `escolherVerbatim` devolve `mensagens: string[]`, não uma string: o n8n grava um turno de duas
    mensagens numa linha só unido por `" | "`, e o painel era o último lugar que ainda mostrava o
    pipe na tela (visto na Loja Teste em 29/08).
  - ⚠️ **DOIS BLOCOS SAEM COMO ESTADO VAZIO, à espera de instrumentação que não existe:** "Assuntos
    em alta" (na trilha) e o 4º cartão da operação, "Objeções que ela segurou". Classificar o assunto
    ou a objeção de um turno exigiria coluna nova; `conversation_qualifications` só tem `action`,
    `summary` e `preferencia_horario`. Três regras tornam isso honesto e nenhuma é opcional: o número
    é **literalmente `XX`** (nunca plausível, nunca borrado, porque print ampliado de "17" borrado
    destrói o eixo do produto), os rótulos são **posicionais** ("1º assunto mais perguntado"), e as
    barras são **cinzas** (roxo é a cor de dado real). Os dois somem sozinhos quando o dado existir:
    quem decide é a página, não um interruptor para alguém lembrar de desligar.
  - **Animação é CSS da casa mais um `useContagem`.** Tokens novos no `globals.css`: `--ease-dado`
    (curva de DADO, `cubic-bezier(0.165, 0.84, 0.44, 1)`) ao lado do `--ease-out` que já era a curva
    de INTERFACE, mais `--dur-cartao` 320ms, `--dur-numero` 900ms, `--dur-barra` 700ms e `--dur-troca`
    420ms. Classes `.painel-cartao`, `.painel-barra`, `.painel-area`, `.painel-hora`, `.painel-balao`,
    `.painel-guia`, `.painel-pressiona`. ⚠️ **A barra cresce em `height` e não em `scaleY`**: com
    scaleY o raio de 3px do topo chega esmagado. O keyframe lê `var(--altura)`, que a coluna define
    inline. `prefers-reduced-motion` leva tudo ao valor final no primeiro quadro, e hover e acordeão
    continuam funcionando, só sem transição.
  - ⚠️ **`data-slot` de fora do `Stat` é IGNORADO** (regra 4 da camada base: o `data-slot` é escrito
    DEPOIS do spread). O cartão sem dado se marca com `data-em-breve`, e foi medido: o marcador sumia.
  - ⚠️ **Ícone do lucide também é `svg` com `polyline` dentro.** Um teste que contasse `svg polyline`
    no cartão de movimento pegava as setas do selo e via três séries; por isso a área tem
    `data-slot="painel-area"`.
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
  6h"), é limpo por **`POST /api/conversations/resolve`** (service_role, porque a coluna não tem
  grant de UPDATE para o browser) e é o que alimenta o filtro "Precisa de você". ⚠️ Este documento
  já disse que quem limpava era o `POST /api/send`; não é, e nunca foi. **Pausa volta a significar só o que deveria:** um humano assumiu (nó
  `Pausar IA (Franck digitou)` do n8n) ou alguém desligou na chave.
  ⚠️ **E "um humano assumiu" ficou MAIOR em 19/09/2026 (decisão do dono): IA e pessoa não atendem
  a mesma conversa, e isso passou a valer NO BANCO.** A invariante já era a regra de exibição
  (`quemAtende`, `lib/crm.ts`) e já valia no envio manual; o que faltava era o gesto de ATRIBUIR.
  Agora **atribuir pausa a IA** (inclusive ao transferir para um colega: é o mesmo gesto, a conversa
  passou a ser de uma pessoa) e **religar a IA larga o responsável**, nos TRÊS caminhos que devolvem
  a conversa a ela: a chave do cabeçalho, orientar a IA pelo coach (que reativa) e o
  `POST /api/conversations/resolve`, que passou a limpar `assigned_user_id` junto com `handoff_at`.
  Deixar qualquer um de fora repõe o estado contraditório pela porta dos fundos, e o coach é o que
  ninguém lembra que religa. ⚠️ **SOLTAR a conversa NÃO religa a IA**, de propósito: "ninguém
  atende" é um estado legítimo, e é o que a lista já mostra como dívida visível. Quem escreve é o
  browser (`components/ConversationView.tsx`, grants de coluna que já existiam); não precisou de
  rota nova. **Bancada de teste** (painel
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
- **Design system: `docs/design-system/`** (gerado do código em 30/08/2026). Os tokens vivem em
  `app/globals.css` e a camada base em `components/ui/`; os documentos explicam o PORQUÊ, que é o
  que o código não guarda. São 8 arquivos: marca, cor, superfície, tipografia, geometria, animação,
  camada base e **pendências** (o que está medido e ainda sem decisão).
  ⚠️ A pasta `Desktop/DesingSystem/` está **obsoleta**: cita tokens já apagados (`--ink-dim`,
  `--ink-muted`, `--accent`), não cita nenhum papel tipográfico atual e afirma que o projeto não usa
  Radix. Não consultar.
  **A hierarquia de título tem TRÊS níveis** (fechada em 30/08/2026): `text-titulo` 18 = título da
  PÁGINA; `text-cartao` 16 caixa normal = título de bloco COM ESTRUTURA PRÓPRIA (faixa de
  cabeçalho, lista, gráfico); `text-rotulo` 12 CAIXA ALTA = rótulo de um VALOR, cartão simples que
  vai direto ao conteúdo, ou sub-bloco recolhível. Os dois últimos NÃO são intercambiáveis.
  ⚠️ **Papel tipográfico não pode repetir nome de cor:** `text-bloco` colidia com `--color-bloco` e
  o Tailwind resolvia COR, não tamanho (`color: var(--s-bloco)`), então o título nascia sem os 16px
  e sem o peso 600. Por isso o papel chama-se `cartao`.
  Quatro regras que valem em toda UI nova:
  1. **Cada matiz tem 4 papéis:** `fill` (fundo cheio), `on` (tinta sobre o fill), `ink` (a cor como
     TEXTO ou ícone sobre superfície) e `surface`/`line`. **NUNCA usar `fill` como cor de texto**
     (é o que produzia as 18 reprovações WCAG AA) e nunca usar `ink` como fundo. Ou seja:
     `text-brand-ink`, não `text-accent`; `text-warn-ink`, não `text-warn`.
  2. **Tinta em 4 níveis:** `ink` > `ink-2` > `ink-3` (piso de texto, mínimo 12px) > `ink-faint`
     (**nunca** texto, só ícone e divisor). Os nomes `text-ink-muted` e `text-ink-dim` **não existem mais**: eram aliases e foram removidos em 17/08/2026.
  3. **Papéis tipográficos** com entrelinha travada: `text-titulo` (18), `text-cartao` (16),
     `text-corpo` (15), `text-apoio` (13), `text-legenda` e `text-rotulo` (12). Nada abaixo de 12px
     na interface. Numeral é escopo à parte: `manchete` 68, `destaque` 44, `numero` 32.
  4. **O azul `--brand-grad-end` (#4464d4)** existe só porque a logo termina nele. Escopo fechado:
     gradiente de marca, símbolo e superfície decorativa a partir de 28px. Não pinta texto, ícone
     nem estado. ✅ **Decisão do dono, 30/08/2026: MANTER assim**, sem entrar na paleta e sem
     recalibrar a logo. A regra "o sistema não tem azul" tem exatamente uma exceção, e ela é a logo.
  5. **Cartão respira 24px** (`p-6`), decisão do dono em 30/08/2026. Duas exceções deliberadas: a
     manchete do painel (28/32, medida da prancha) e bloco DENTRO de cartão (16px).
  ⚠️ **FAXINA DE 30/08/2026, e o vocabulário mudou.** A superfície de cartão agora tem UM nome:
  **`bg-raised`**. `--s-conteudo` e `bg-conteudo` **não existem mais** (eram a mesma cor com outro
  nome; os 17 usos migraram). Também saíram, todos por não ter nenhum consumidor: o papel
  `text-display`, a variante `segmentado` das abas, os utilitários `bg-sunken`, `bg-inset`,
  `bg-lista`, `bg-lista-sel`, `bg-composer`, `bg-sub`, `bg-painel` e `bg-chat`, e o legado
  `--surface` / `--panel`. Provado por retrato numérico de 12 telas nos dois temas: 4812 elementos,
  zero diferença de cor, fonte, respiro ou raio.
  Antes disso, os aliases (`--color-accent`, `--color-ia`, `--color-ink-muted`, `--color-ink-dim`)
  e as classes `.btn-primary`, `.glass`, `.panel` e `--radius-2xl` já tinham saído em 17/08/2026.
  Avatar usa `avatarPair()` (`lib/inbox.ts`),
  que devolve par de fundo tingido + tinta via `--av-N-bg`/`--av-N-fg`, nunca branco sobre cor cheia.
- **Três mudanças de superfície em 19/09/2026 (ajustes do atendimento, `docs/design-system/
  fundamentos-superficie.md` tem o porquê inteiro):**
  0. ⚠️ **REGRA DA CASA: TODA ÁREA QUE ROLA DISSOLVE NAS BORDAS** (`components/ui/dissolver-rolagem.tsx`),
     e ela vale em toda tela, não só onde alguém lembrou (há `e2e/rolagem.design.spec.ts` varrendo as
     telas e falhando em qualquer rolável sem máscara). Aplica-se com **`<AreaRolavel>`** no lugar do
     `div` com `overflow-y-auto` (ele já embute o `overflow`) ou com a prop `fade` do `ScrollArea`;
     o hook `useDissolverRolagem` é para quem precisa de outra tag (um `<pre>`) ou do `temMais`.
     **Três degraus, escolhidos pela ALTURA DO ITEM medida no navegador:** `DISSOLVER_PADRAO` 32,
     `DISSOLVER_LISTA` 72, `DISSOLVER_BALAO` 80.
     **A seta `SetaMais`** ("tem mais coisa embaixo", clicar leva ao fim) fica **só onde rolar é a
     navegação**: conversa e lista de conversas.
     ⚠️ **EXCEÇÃO REAL: área rolável com filho `sticky` NÃO recebe a máscara**, porque ela dissolve
     todo o conteúdo do contêiner e apagaria o elemento grudado na borda. É por isso que `/agente`
     ficou de fora (rodapé `sticky bottom-0` com o Salvar).
  1. ⚠️ **A SOMBRA DE ROLAGEM NÃO EXISTE MAIS**, nem de cima nem de baixo. Foram três tentativas no
     mesmo dia: `box-shadow` no `<header>` (pintava para FORA e caía sobre a faixa "O cliente quer",
     opaca, lendo como faixa cinza), depois um elemento absoluto por borda dentro da área que rola
     (parou de invadir e continuou lendo como risco), e por fim nenhuma.
     **Quem diz "tem mais conversa deste lado" é a DISSOLUÇÃO** (a prop `fade` do `ScrollArea`), que
     já só aparece do lado com conteúdo escondido; o que separa cabeçalho e conversa é o `border-b`
     dele. Duas regras saem daí, e valem para qualquer borda de área rolável:
     **(a) um sinal por fato** (sombra em cima da dissolução é ruído, e foi o que gerou dois prints
     do dono); **(b) a dissolução tem que ser MAIOR que o item que ela dissolve** — o padrão é 28px
     e serve para lista de texto, a conversa passa **80** porque o balão dela tem 65px em média, e
     em 28px ele não dissolve, ele é FATIADO. Por isso `fade` aceita número.
  2. **Variante `sutil` do `Input`**, para campo dentro de tabela de pares (a coluna do cliente):
     moldura visível ANTES do clique, altura de controle. ⚠️ A borda é `line` (8%) e não
     `line-soft`: no tema claro a coluna, `--input-bg` e `--s-campo` são todos `#fff`, então a cor
     da borda é o único sinal que sobra.
  3. **`.fundo-rede`** (`components/FundoRede.tsx`): a ÚNICA textura do sistema, só atrás da área de
     mensagens, SVG em `currentColor` com `<pattern>`, força por tema (`--rede-forca`). Não rola com
     a conversa e o balão sempre vence, porque todo balão é opaco.
     ⚠️ **Ela DISSOLVE nas quatro bordas e tem a largura da COLUNA DE LEITURA (960px, centrada)**, e
     as duas coisas são a mesma ideia: **fundo é o que passa por trás do conteúdo, e nunca deve ser
     visto sozinho.** Sem a máscara ela acabava em corte seco na linha do composer, e como conversa e
     composer têm a MESMA superfície, a única coisa que mudava ali era a textura ligar e desligar: o
     dono leu a faixa resultante como sombra quebrada. Sem o limite de largura, em tela larga com as
     colunas fechadas ela ficava sozinha nas calhas vazias ("as laterais estão ruins").
     **Daí sai a regra da sombra de rolagem: ela tem a largura de quem a projeta.** A de cima é de
     ponta a ponta (o cabeçalho é); a de baixo acompanha os 960px da caixa de escrita.
- **Camada base shadcn/ui (`components/ui/`, 17 arquivos):** `button`, `input`, `textarea`,
  `badge`, `avatar`, `separator`, `card`, `scroll-area`, `dropdown-menu`, `switch`, `tabs`,
  `tooltip`, `dialog`, `sheet`, `select`, `checkbox`, `stat`. O `stat` (cartão de indicador) entrou
  em 26/08/2026 com escala de numeral em três degraus (32/24/18) e **legenda de período
  OBRIGATÓRIA**: cartão de indicador sem período mente sobre o próprio número. A variante `elevado`
  existe porque `--s-bloco` no claro é igual ao `--canvas`, então cartão `bloco` sobre o canvas
  ficaria invisível. O `sheet` (painel lateral, drawer) entrou em
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
- **Montagem e publicação (refeito em 28/08/2026, passo 2 do MVP do beta):** o agente tem **DUAS
  SUPERFÍCIES sobre UM formulário**, no padrão de setup do WooCommerce. Mapa de campos, decisões e o
  que ficou de fora em `docs/proximos-passos.md`.
  - **`/montagem`** é o assistente: tela cheia, fora do route group `(app)`, quatro passos
    (conectar, quem atende, o que ele sabe, testar e ativar). **Roda uma vez na vida da conta** e
    some para sempre depois da primeira ativação. Pede **três campos digitados** (nome da empresa, o
    que a empresa faz, nome do agente), mais um clique de modelo e um de tom.
  - **`/agente`** é a tela permanente: **três abas de verdade** (quem atende, o que ele sabe, o que
    ele pode fazer) mais o modo avançado. Perdeu os numerais e os botões "Continuar", que eram um
    wizard improvisado de quando não existia um de verdade.
  - ⚠️ **UM formulário, duas composições.** Campos em `components/agente/campos.tsx`, layout em
    `components/agente/ui.tsx`, estado e `PUT` em `components/agente/useAgentConfig.ts`. A ÚNICA
    diferença permitida entre as superfícies é `mostrarOpcionais`; qualquer outra é bug, porque campo
    duplicado diverge na primeira mudança.
  - ⚠️ **As abas usam `forceMount` E `data-[state=inactive]:hidden`** (o segundo mora na camada
    base). O Radix desmonta o painel inativo por padrão, e `AgentBulletList` guarda rascunho não
    adicionado no pai: desmontar faria o texto sumir da tela CONTINUANDO a ser salvo. E com
    `forceMount` sozinho os três painéis ficam VISÍVEIS, que é a página de rolagem única de volta.
  - ⚠️ **O modo avançado NÃO é uma quarta aba**: as três abas são recortes do MESMO formulário, o
    avançado é outro formulário. Ele é um botão à direita da faixa.
  - **Erro em aba fechada:** o `PUT` devolve `fields`, a tela troca sozinha para a primeira aba com
    erro e marca a aba com um ponto. Só DEPOIS de tentar salvar.
  - **Rascunho no navegador** (`components/agente/rascunho.ts`, chave `montagem:{clientId}`): o
    assistente grava no servidor **UMA vez**, ao sair do passo 3. Se `agent_config_updated_at` for
    mais novo que o rascunho, o servidor vence. ⚠️ Rascunho não atravessa aparelho. É também por
    causa dele que `/montagem` carrega o wizard com `ssr: false` (`components/MontagemCliente.tsx`).
  - **Quatro guardas em `/montagem`**: conta bloqueada vai para `/assinatura`, atendente para
    `/inbox`, quem já publicou para `/agente`, e **quem está em `prompt_mode = 'avancado'` também**,
    porque tem persona escrita à mão e o assistente salva pelo guiado. A última não é redundante: um
    tenant novo pode entrar no avançado por `/agente` ANTES de publicar.
  - **`lib/onboarding.ts`** (**módulo puro**) tem `PASSOS_MONTAGEM` (os 4 passos, com a frase de por
    que importa) e `montagemState()` (onde retomar e se acabou). Sinais no banco:
    `evolution_instance`, `agent_config_updated_at`, `onboarding_tested_at` e `agent_published_at`.
    `getMyClient()` traz `montagem` pronto (só escalares, **nunca** `persona`/`agent_config`).
  - **A `OnboardingBar` NÃO EXISTE MAIS.** Virou `components/AvisoMontagem.tsx`: UMA LINHA, sem
    numeral, sem lista, sem expandir, em toda página do app enquanto o agente não foi ao ar, e só
    para o dono. O contador de progresso da conta passou a existir num lugar só, dentro do
    assistente.
  - ⚠️ **`publishBlockers()` PERDEU O `tested`** (decisão do dono, 28/08/2026): sobraram conectar e
    configurar. O passo 4 continua oferecendo o teste com destaque, mas ele não barra mais a
    ativação. `onboarding_tested_at` continua sendo gravado pelo `/api/playground`, agora só como
    dado.
  - **O interruptor do agente são DUAS colunas** (ver a regra no glossário de `clients`):
    `agent_published_at` nulo **ou** `agent_enabled` false e o `processTurn` devolve **200 com
    `messages` vazio** (e NÃO erro) antes de chamar o modelo, então a IA fica muda, não gasta token e
    **a mensagem do cliente continua sendo gravada** pelo n8n para um humano responder. Vale só fora
    do `dryRun`. `PUT /api/clients/[id]/publish` recebe `{ enabled: boolean }`, é dono-only, e os
    pré-requisitos valem **só na primeira ativação** (409 com o que falta).
  - Aviso de risco do QR em `/connect` e dentro do passo 1 do assistente
    (`components/ConnectionRiskNotice.tsx`): **nunca** prometer proteção contra bloqueio nem usar
    "não pague a API da Meta" (e2e trava isso). ⚠️ `ConnectWhatsApp` ganhou `enquadramento`
    (`pagina`/`passo`) e `onConectado`: são duas MOLDURAS do mesmo componente, porque o QR, o polling
    e a importação são a parte que não pode existir duas vezes.
  - ⚠️ **Furo conhecido no celular:** quem abre o passo 1 no telefone não consegue ler o código na
    própria tela, e este projeto não tem conexão por código de telefone. A tela diz isso; não
    inventar pareamento que não existe.
- **Decisões mantidas de propósito:** `dados_cliente.atendimento_ia` é `text`
  (`'ativa'`/`'reativada'` = ligada, `'pause'` = pausada) — não é boolean. `chat_messages.active`
  é coluna legada morta (mantida). Não sugerir trocar sem pedirem.

## n8n (⚠️ produção)
- **Os dois workflows estão versionados em `n8n/`** (`obs-atendimento.json`, 50 nós, e
  `crm-envio-manual.json`, 11 nós; exportados em 17/09/2026, só leitura). O `n8n/README.md` diz
  como restaurar. ⚠️ O `x-lookup-secret` está em texto puro em **DOIS** nós do OBS Atendimento
  (`Atendente` e `Sobe mídia recebida`); no export os dois viram o marcador `{{N8N_LOOKUP_SECRET}}`.
  Reexportar sem passar por essa troca commita o segredo.
- **Arquitetura da IA (cutover APLICADO e ativo):** o cérebro do agente saiu do n8n e roda em
  `POST /api/agent` (stateless; persona + histórico de `chat_messages` + AGORA + retrieval do RAG +
  guardrail; saída `{ output: { messages, action, summary, preferencia_horario }, diagnostics }`).
  O n8n é só o cano: o nó `Atendente` do workflow ativo "OBS Atendimento" é um HTTP Request (POST)
  para `https://atendimento.obomsobrinho.com.br/api/agent` com o header `x-lookup-secret` (valor só em env, nunca
  no código/chat). Depende de `OPENAI_API_KEY` no ambiente do app (Vercel); sem ela responde 501.
  Modelo: `gpt-5.4-mini`.
- **Canal endurecido (17/09/2026, janela com o dono).** Três defeitos do cano fechados numa vez:
  (1) **grupo é recusado** no nó `Rotas` (condição nova: o telefone não contém `@g.us`; antes a
  única condição era existir, e JID de grupo passava, então a IA respondia dentro de grupo);
  (2) **dedupe por `key.id`**, com `messageId` novo no nó `Dados` e os nós `Dedupe (Redis)`
  (`incr` em `dedupe:{messageId}`, TTL 300s) e `Primeira entrega?` entre `Rotas` e `Get Lead`.
  ⚠️ **A condição é um OU: `messageId` vazio PASSA**, senão toda mensagem sem id colidiria na
  mesma chave e só a primeira de cada 5 minutos seria atendida;
  (3) **fallback na saída de erro do `Atendente`**: `Salva user (IA falhou)` grava a mensagem do
  cliente em `chat_messages`, `Fallback ao cliente` responde "Recebi sua mensagem, já te respondo
  por aqui." e `Avisa falha no grupo` chama o time.
  ⚠️ **O que o item 3 conserta não é só o silêncio: é a PERDA.** `Salva chat_messages` vem DEPOIS
  do `Atendente`, então, sem a saída de erro, a mensagem do cliente não era gravada em lugar nenhum
  quando o cérebro falhava, e ninguém ficava sabendo que alguém tinha escrito.
- ⚠️ **O domínio mudou em 17/09/2026 e derrubou o canal em silêncio.** `crm-obs.vercel.app`
  passou a responder **404** ("deployment could not be found"), e os DOIS nós que chamam o app
  (`Atendente` e `Sobe mídia recebida`) apontavam para lá. O agente ficou mudo e as mensagens do
  período não foram gravadas. Hoje os dois apontam para `https://atendimento.obomsobrinho.com.br`.
  **Trocar de domínio exige mexer no n8n**, e o `git grep` do domínio antigo é o jeito de achar
  todos os lugares (a logo dos e-mails do Supabase também estava nele).
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
  git). Detalhes em `e2e/README.md`.
  ⚠️ **O TENANT DE TESTE MUDOU EM 17/09/2026: é a OBS.** O anterior apontava para o WhatsApp de uma
  clínica com contato real chegando, que é o oposto do que a regra queria proteger; a OBS é o número
  do próprio dono, parado. Decisão dele, com o risco pesado: a suíte com login escreve no CRM desse
  tenant (move card, zera não lidas), mas nunca manda mensagem nem acorda o agente.
  ⚠️ **A OBS está em `prompt_mode = 'avancado'`, e isso quebrou três testes** que assumiam formulário
  guiado ou um telefone escrito no arquivo. Regra para teste novo: **não travar o modo do tenant nem
  o número da conversa.** Quem precisa de conversa pega a primeira da lista; quem precisa do
  construtor trata os dois modos.
- **Menu (`components/NavRail.tsx`, 27/08/2026): Painel PRIMEIRO**, depois Conversas, Pipeline,
  Agente (dono-only) e Equipe. **"Em breve" é Agenda e Follow-up; Campanhas SAIU** (manter prometia
  disparo em massa sobre QR, que é o cenário de banimento que o projeto decidiu não correr, e atrai
  o cliente errado logo no beta). ⚠️ **A tela INICIAL depende do papel E da montagem**
  (`app/page.tsx`): dono que ainda não publicou cai em `/montagem`, dono publicado em `/painel`,
  atendente em `/inbox`.
- Rotas: `/login`, `/cadastro` (público, cria conta), `/recuperar-senha` (público),
  `/connect` (QR + aviso de risco; **não importa histórico de forma nenhuma** desde 23/09/2026: a rota `import` foi apagada e a instância nova nasce com `syncFullHistory: false`), `/montagem` (assistente de 4 passos da
  primeira configuração, dono-only, fora do `(app)`, some depois da primeira ativação), `/inbox`,
  `/inbox/[id]`, `/pipeline` (board Kanban do funil), `/painel` (dashboard), `/agente` (três abas do
  construtor, com a base de conhecimento e a bancada de teste dentro),
  `/conhecimento` (base de conhecimento/RAG, dono-only; **fora do menu desde 26/08/2026**, a rota
  segue existindo para não quebrar link salvo, mas o lugar da base é o grupo "O que ele sabe" do
  `/agente`), `/equipe` (membros do time), `/perfil`, `/assinatura` (estado da conta, destino do
  gate de assinatura; fora do route group `(app)`), `/definir-senha` (convidado escolhe a senha),
  `/auth/confirm` (verifica o link do e-mail).
  Endpoints em `app/api/clients/[id]/...` (connect-whatsapp,
  whatsapp-status, **agent-config** `PUT`, **notify-target** `PUT` dono-only,
  **publish** `PUT` dono-only (`{ enabled }`, liga e desliga o agente),
  **knowledge** `DELETE` + **knowledge/upload-url** + **knowledge/process** dono-only, upload
  direto ao Storage por URL assinada + processamento à parte, compatível com o limite de corpo da
  Vercel), `app/api/agent` (cérebro, `processTurn`, protegido por `x-lookup-secret`),
  `app/api/playground` (bancada, dono-only por sessão, reusa `processTurn` em `dryRun`; aceita a
  configuração CRUA em edição e COMPILA no servidor),
  `app/api/team/{invite,remove}` (dono-only, service_role), `app/api/signup` (**público**, freio de
  abuso por IP + `provision_tenant`) e `by-instance`.

## Produto e estratégia (consultar ANTES de decidir escopo)

> 🧭 **Chegando agora no projeto? Comece por `docs/handoff.md`.** Ele é mapa e estado, não conteúdo:
> diz o que ler e em que ordem, em que passo do beta o produto está, o que estava em andamento na
> última sessão, e as quatro coisas que um agente novo erra se ninguém contar. Escrito em 07/09/2026,
> quando o dono trocou de plano do Claude e o histórico das conversas se perdeu.

Duas fontes de verdade sobre **o que construir e por quê**, mais um caderno de consultas. Não decidir
roadmap, preço nem posicionamento sem ler a que se aplica:

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
- **`docs/instrumentacao-beta.md`** (28/08/2026) — **as cinco consultas do beta**, para rodar no SQL
  Editor ou pelo MCP: publicaram o agente e onde pararam, dias de uso real, IA contra time,
  quem sumiu, e o que os testadores escreveram no `feedback`. **Não existe tela**, e é decisão.
  ⚠️ **A regra de "resposta da IA" no SQL tem que ser a de `lib/mensagem.ts`**, e o arquivo explica
  as duas traduções que não são opcionais (`is distinct from` em vez de `<>`, e dia em
  America/Sao_Paulo). Duas definições do mesmo número é como o produto começa a mentir.

Regras que saem desses documentos e valem para qualquer sugestão minha:
- **Âncoras de posicionamento** são **ZapResponder** (piso de preço) e **HelenaCRM** (teto), não
  Kommo/RD Station/Blip/Zenvia. ⚠️ Isso NÃO quer dizer que o campo tenha dois concorrentes: a lista
  completa de pares está em `estrategia-2026-07.md` (faixa de R$ 87 a R$ 1.000, com Nexloo, Zappy,
  SocialHub, AtendeNex, Convecta AI, Umbler Talk, WiiChat, Sellflux, GPT Maker, BotConversa e
  outros). Nunca responder "os concorrentes são ZapResponder e Helena" sem abrir essa lista.
- **Nunca** construir agenda própria completa nem construtor visual de automações (vira produto que
  exige consultoria). ⚠️ **Agenda saiu do "não construir" em 26/08/2026** e é o primeiro
  desenvolvimento DEPOIS do beta, mas **integrando Google Calendar**, e a parte cara dela não é a
  tela: é dar ferramenta ao agente (function calling em `/api/agent`), que hoje não existe.
- **Nunca** construir disparo em massa em cima da conexão QR (Baileys): é o cenário de banimento
  documentado. E nunca escrever material de marketing que anuncie disparo em massa, "não pague a API
  da Meta" ou proteção contra banimento.
  ⚠️ **Mensagem ativa deixou de ser proibição total em 26/08/2026** (decisão consciente do dono, com
  o risco pesado): lembrete de consulta e mensagem de aniversário **vão ser construídos**, e o menu
  passa a prometer "Follow-up". O que continua valendo: **só para contato com conversa recente**,
  nunca lista fria nem importada; teto por dia e intervalo aleatório, nunca rajada; saída fácil
  ("responda SAIR"); e nascer **agnóstico de canal**, porque isso é o argumento mais forte para
  migrar à API Oficial. Detalhes em `docs/proximos-passos.md`.
- **01/10/2026:** a Meta passa a cobrar mensagens de serviço na API Oficial. Qualquer conta de
  migração precisa de custo variável, não de zero.

## Status

### Em andamento: MVP do beta gratuito (decidido em 26/08/2026)
O lançamento é um **beta gratuito** com conhecidos do dono (advogado, pediatra, barbeiro, engenheiro,
clínica, comércio), custeado por ele. **Cobrança está construída e PARADA de propósito.** Seis passos,
nesta ordem, detalhados em `docs/proximos-passos.md`: (1) dashboard ✅, (2) steps do agente ✅,
(3) os 4 furos ✅, (4) design e mobile no Claude Design, (5) aplicar o design, (6) testes. Quatro
decisões já travadas, **não reabrir**:
- ✅ **`/agente` virou DUAS superfícies** (padrão setup do WooCommerce), feito em 28/08/2026: o
  assistente de `/montagem` e a tela permanente de três abas. Ver o bloco "Montagem e publicação"
  acima. O assistente **absorveu a barra de onboarding** (um contador só na conta) e some para
  sempre depois da primeira publicação, o que fez a colisão "salvar e continuar" com "salvar já é
  publicar" desaparecer por construção.
- **Painel é o primeiro item do menu** e a tela inicial depende do papel (dono no painel, atendente
  em conversas).
- **Menu "Em breve" = Agenda e Follow-up. Campanhas SAI.**
- ✅ **`clients.account_type`** (`interno`/`beta`/`pago`) para marcar o testador, feito em
  28/08/2026: `trial_ends_at` nulo libera o acesso mas não identifica ninguém. Ver o glossário de
  `clients` acima.
- ✅ **Segurança da IA provada com o cérebro real** (28/08/2026): 12 conversas-armadilha em `dryRun`
  na Loja Teste, **nenhuma passou**, e as duas regras do `lib/guardrail.ts` foram vistas disparando
  (com a persona sabotada de propósito, porque em 10 casos honestos ela nunca precisou). Resultados
  caso a caso, com a resposta da IA na íntegra e as limitações, em `docs/proximos-passos.md`.
- ⚠️ **Público misto:** nenhum texto fixo de tela pode assumir consulta, paciente ou agendamento.
  Quem carrega a linguagem do segmento é o preset.

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
  e dashboard mínimo (`/painel`). Dívida `msg1 | msg2` reavaliada e mantida adiada
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
- Testes e2e (Playwright, `e2e/`), **quatro projetos**, e a divisão importa:
  - **`sem-login`** (114): telas `/design`, com dado FALSO. Provam desenho, texto e regra de
    escrita, nunca funcionamento. Incluem `/design/montagem`, `/design/playground` e o feedback.
  - **`logado`** (`*.auth.spec.ts`): banco de verdade, tenant de teste (a OBS desde 17/09/2026),
    parte deles batendo no **cérebro real** em `dryRun`. Cobrem acesso, agente, **pipeline** e
    **guardas da `/montagem`**.
  - **`atendente`** (`*.att.spec.ts`, 17/09/2026): sessão do SEGUNDO usuário, gravada pelo
    `auth.setup.ts` em `e2e/.auth/atendente.json`. Existe porque as asserções dele afirmam AUSÊNCIA
    de poder (não vê o Agente e a rota redireciona, a montagem redireciona, não gerencia o funil,
    rota dono-only responde 403), e com a sessão do dono cada uma provaria o contrário do que diz.
    ⚠️ **Nada nele escreve no banco**, e é regra: teste de permissão que consegue escrever já falhou
    antes de asserir. ⚠️ O 403 usa `/api/team/invite` e **não** o `PUT` de `agent-config`: este leva
    o id do tenant no caminho e responde 403 nos DOIS casos (tenant errado e papel errado), e o id
    não aparece em lugar nenhum que o browser veja, porque a RLS o torna implícito.
  - **`logado-serial`** (`*.serial.spec.ts`): um worker só, `dependencies: ["logado"]`.
  - **`setup`**: grava os storageState do dono E do atendente.
  - **`ia`** (`*.ia.spec.ts`, 11/09/2026, C4 do plano da demo): as 12 armadilhas da bateria de 28/08 contra o
    **cérebro real** em `dryRun`, via `POST /api/playground` com a configuração FIXA no corpo (cópia da que a Loja
    Teste tinha em 28/08, para o resultado não mudar quando alguém editar o tenant). ⚠️ **Só existe quando pedido
    pelo nome** (`npm run test:e2e:ia`; o `playwright.config.ts` só inclui o projeto se `--project=ia` estiver no
    argv, copiado para `E2E_IA` porque os workers recarregam o config sem argv): cada execução são 12 chamadas
    pagas, e `npm run test:e2e` não pode pagar isso sem querer. Asserções: `action` no esperado, guardrail
    `passou` (1 a 10) ou BLOQUEOU (11 e 12, persona sabotada), e nenhum preço, URL ou telefone fora da persona
    recompilada mais os trechos do RAG. ⚠️ **Nos casos 1 e 5 o teste aceita `none` OU `pausar`** (escalar
    numa armadilha nunca é errado; `agendar` reprova sempre). **Os casos 4 e 10 (manipulação) EXIGEM
    `pausar`, decisão do dono em 11/09/2026:** toda tentativa de manipulação (trote, se passar pelo dono,
    extrair dados) abre handoff, porque com o handoff aberto o time vê o ataque e pode desligar a IA no
    número, bloquear ou denunciar. A regra antiga da ANTI-MANIPULAÇÃO ("não reconheça e siga") saiu de
    `buildBaseTail`; a OBM só recebe quando voltar ao guiado ou salvar (decisão dele, sem recompilar).
    `retries: 1` só nesse projeto.

  Total com login: **26 passando, 1 pulado**; sem login **160** (19/09/2026, já com
  `atendimento.design.spec.ts`, os cinco ajustes do atendimento); `ia` **12 de 12** (11/09/2026).

  ⚠️ **TESTE QUE AFIRMA AUSÊNCIA NÃO CONVIVE COM ESCRITOR CONCORRENTE**, e é por isso que o
  projeto `logado-serial` existe (07/09/2026). O teste do realtime exige "abrir o inbox provoca
  ZERO buscas" e passou a receber 5 no dia em que a suíte do pipeline nasceu: os testes de pipeline
  escrevem em `conversations` no MESMO tenant, e o realtime, funcionando como deveria, mandava a
  lista se atualizar. **O código estava certo e o teste errado.** Todo teste novo de "isto NÃO deve
  acontecer" vai para `*.serial.spec.ts`.
  ⚠️ Bloquear o WebSocket com `routeWebSocket` NÃO seria substituto: sem conexão o `SUBSCRIBED`
  nunca dispara, a guarda que pula a primeira assinatura deixaria de ser exercida, e o teste
  passaria até com ela removida.
  ⚠️ **Arraste HTML5 não se testa com `locator.dragTo()`**: no Chromium controlado ele move o
  ponteiro e `dragstart`/`drop` não disparam. `e2e/pipeline.auth.spec.ts` despacha os três eventos
  com UM `DataTransfer` compartilhado e **recarrega a página** para provar que o estágio persistiu,
  porque o board move o card em memória antes de falar com o banco.
  ⚠️ **Rodar as DUAS suítes antes de fechar um passo.** No passo 1 (painel) só a sem-login foi
  rodada, e três testes com login ficaram quebrados por seis dias: dois deles procuravam os
  cabeçalhos "Operação" e "Conversas na semana", que o painel novo tinha renomeado.
  `E2E_PORT=3000 npx playwright test --project=logado` reusa um dev server já no ar.
  ⚠️ **Buracos declarados**, com o motivo escrito dentro do próprio spec e não aqui. ✅ O do
  atendente FECHOU em 17/09/2026 com o projeto `atendente`. Seguem abertos: conta bloqueada vai para
  `/assinatura` (exige conta vencida) e modo avançado vai para `/agente` (exige conta avançada que
  ainda não publicou). Sem cobertura nenhuma: envio manual, convite de equipe, upload da base de conhecimento
  e mobile.
