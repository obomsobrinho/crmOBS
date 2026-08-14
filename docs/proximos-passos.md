# Próximos passos de desenvolvimento

Roadmap de produto. Análise de mercado completa em [estrategia-2026-07.md](estrategia-2026-07.md).

Última revisão: 12/08/2026 (revisado contra o estado real: n8n, git e app em produção).

## Direção travada

- **Produto horizontal.** Atende qualquer segmento (advogado, médico, psicólogo, clínica,
  pizzaria, loja). Não é vertical.
- **Meta:** cobrir a base que os concorrentes cobrem E ser melhor em dois eixos:
  1. **Execução e confiança** (estável, simples, suporte que responde, IA que não inventa).
  2. **Profundidade de IA** (base de conhecimento com upload, controle de alucinação, playground).
- **Concorrentes de referência:** ZapResponder e HelenaCRM. Benchmark técnico de IA: NextFlow.
- **Pricing:** por usuário (assento), não plano único. Multi-login é table stake E alavanca de
  receita.
- **Conexão:** segue no QR por ora. Migrar para API Oficial é decisão futura (quase todo
  concorrente sério é só oficial).
- **Stack: Next.js (não migrar para Vite).** O app é server-heavy: precisa de servidor para os
  segredos (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `N8N_LOOKUP_SECRET`), para o `/api/agent`
  que o n8n chama, para os demais route handlers (RAG, team, clients) e para o gate de auth + RLS
  por cookie (SSR). Vite é SPA client-only e exigiria um backend separado só pra isso (mais partes,
  não menos). A lentidão percebida no dev era compile sob demanda (some em produção) + render
  dinâmico, mitigada com `loading.tsx`; não é motivo de troca de stack. Reavaliar só se o produto
  virar uma SPA pura com backend próprio à parte (não é o caso).

## Matriz de paridade (resumo)

À frente (só nós): handoff detectado quando o dono responde no celular, import do histórico,
agrupamento de mensagens.

Atrás (todos têm): multi-login, atribuição, tags, notas internas, respostas rápidas, filas,
pipeline, base de conhecimento por upload, follow-up, campanhas, relatórios, mídia na UI,
cadastro e cobrança self-service.

Lacunas de quase todos (nossa chance): controle de alucinação, playground de teste, e a régua de
estabilidade e suporte.

## Ordem de desenvolvimento

**Dívidas de arquitetura primeiro** (fundação, senão refaz depois):
- [x] Tabela `conversations` (não-lidas, atribuição, ordenação, base do pipeline) + trigger.
- [x] Colunas `sender_user_id`, `media_url`, `media_type` em `chat_messages`.
- [x] `user_clients.role`.
- [ ] Parar de gravar resposta da IA como `"msg1 | msg2"` numa linha só. ⚠️ toca o n8n.
      NOTA (06/08): baixa prioridade. O envio usa o array (`Prep messages`/`Split messages`),
      então o `" | "` só existe no armazenamento; a exibição só quebraria se uma mensagem
      contivesse literalmente " | ". Fix correto (uma linha por mensagem) é invasivo no fluxo
      quente; revisar junto com o modelo de dados na Fase 3.
      REAVALIADO na Fase 3 (07/08): mantido adiado. Resolver de verdade exige que o nó de
      gravação do n8n (fluxo quente, produção) passe a inserir N linhas em vez de 1, ou mover a
      gravação de `chat_messages` do n8n para `/api/agent` (que hoje NÃO grava: o n8n salva
      depois de chamar o cérebro). Os dois são invasivos no fluxo quente e não são baratos.
      Como a exibição (Thread, sidebar e o card do pipeline) e a reconstrução de histórico em
      `/api/agent` já tratam o `" | "`, nada está quebrado. Revisitar se/quando o cutover
      consolidar a gravação de mensagens dentro do app.
- [x] Limpar resíduo hardcoded do nó `Rotas` no n8n (removidas as regras do número pessoal
      553173374875 e do prefixo `TreinoIA1212:`; sobrou só a "Rota normal").
- [x] Destino de notificação pela UI (notify_group_jid configurável no /agente, dono-only).

**Fase 1 — Inbox de equipe (cobre base + habilita pricing por assento)**
- [x] Multi-login: convite de usuário, papel (dono/atendente). Tela /equipe, convite
      por Auth admin invite, RPC tenant_members.
- [x] Atribuição de conversa e "quem atendeu" (conversations.assigned_user_id).
- [x] Tags, notas internas, respostas rápidas (tabelas próprias do CRM, RLS por tenant).
- [x] Não-lidas e contadores (filtro no inbox + badge no rail).
- [x] Edição de contato + campos personalizados (dados_cliente.display_name + custom_fields).
- [x] Mídia: render pronto (media_url/media_type). Receber/enviar + Storage feito na Fase 2.
- [x] Busca dentro das mensagens (busca no conteúdo de chat_messages, com trecho na lista).

**Fase 2 — IA competitiva (eixo de superioridade)**

> **Decisão de arquitetura da IA (travada, não reabrir):** o cérebro do agente sai do n8n e passa
> para um endpoint nosso, `POST /api/agent` (stateless por turno; o estado mora em `chat_messages`
> + `conversations`). O n8n vira só o cano (recebe da Evolution, transcreve, faz o debounce e
> envia). O nó `Atendente` (langchain) + `OpenAI Chat Model` + `Postgres Chat Memory` +
> `Output estruturado` viram um HTTP Request para `/api/agent`. Contrato de saída inalterado
> (`{ output: { messages, action, summary, preferencia_horario } }`). Modelo: `gpt-5.4-mini` (o
> mesmo de hoje). **Cutover APLICADO e ativo** (12/08): o nó `Atendente` do workflow "OBS
> Atendimento" é um HTTP Request para `https://crm-obs.vercel.app/api/agent`. Depende de
> `OPENAI_API_KEY` no ambiente do app (Vercel); sem ela o `/api/agent` responde 501. Memória:
> reconstruída de `chat_messages` (client_id + phone).

> Lote de mudanças no n8n desta fase (fazer coordenado, `validateOnly` + confirmação por mudança):
> qualificação, base de conhecimento e **mídia (receber/enviar + Storage)**, que veio da Fase 1.

- [x] Mídia de verdade: receber (n8n sobe o base64 via `/api/inbound-media` -> Storage e grava
      `media_url`/`media_type` nos dois caminhos de salvamento) e enviar pelo composer (upload ->
      Storage -> webhook -> Evolution sendMedia por tipo). Render na UI decide o lado por
      `message_type='manual'`. Documento/vídeo reconhecidos no nó `Dados`.
- [x] Persistir a qualificação (`summary`, `action`, `preferencia_horario`) e expor na lista
      "Precisa de você". Gravada por `/api/agent` (não pelo n8n) em `conversation_qualifications`;
      lida no card "Resumo da IA" da conversa e no motivo da lista.
- [x] Base de conhecimento por upload (PDF, DOC, planilha) com RAG. CRM: `/conhecimento` (dono),
      upload -> extrai (unpdf/mammoth/exceljs) -> chunk -> embed (text-embedding-3-small) ->
      `knowledge_chunks`, original no bucket `knowledge`. Retrieval em `/api/agent` (match_knowledge_chunks
      injeta trechos no system). **Sem n8n** (o retrieval mudou de lado com o cérebro). Verificado
      ponta a ponta.
- [x] Controle de alucinação (a IA só responde do conteúdo cadastrado, admite quando não sabe).
      Seção invariante FONTES E HONESTIDADE em buildPersona.
- [x] Presets de prompt por segmento (lib/agent-presets.ts, seletor no /agente).
- [~] Notificar o dono no WhatsApp quando qualifica um lead: **REMOVIDO do roadmap** (decisão do
      usuário, 12/08). O dono acompanha a evolução no `/painel` (semanal/quinzenal), não quer um ping
      por lead. A qualificação já cai na lista "Precisa de você" no CRM, que é o canal de alerta.

> Playground: descartado aqui na Fase 2, depois reaberto. Agora está na **Fase 3.5 (fechamento de
> IA), antes da Fase 4** (ver bloco). O motivo do drop original (a IA era rasa) caiu quando a IA
> ganhou RAG, qualificação, guardrails e o card automático.

**Fase 3 — CRM**
- [x] Pipeline Kanban com estágios configuráveis. Tabela `pipeline_stages` por tenant (RLS:
      leitura por membro, CRUD só dono). `conversations.stage` referencia `(client_id, key)` por
      FK; mover card = update direto do browser (grant existente), marcando `stage_source='human'`.
      Board em `/pipeline` (colunas = estágios, cards = conversas, drag HTML5 nativo, filtro por
      atendente/estágio). Seed do funil: novo/qualificado/aguardando_humano (canônicos) + fechado.
- [x] A IA move o card sozinha (em `/api/agent`, não no n8n): `nextIaStage` avança para o estágio
      canônico conforme a `action` (agendar/pausar -> aguardando_humano). Só avança, nunca
      sobrescreve `stage_source='human'`, no-op sem pipeline. Só tem efeito ao vivo pós-cutover.
- [x] Dashboard mínimo (`/painel`): 4 números dos últimos 7 dias (conversas na semana, atendidas
      sem intervenção humana, leads qualificados, tempo de 1a resposta). Leitura por RLS, sem BI.

**Fase 3.5 — Fechamento da IA (antes da Fase 4)**

O **cutover** do `/api/agent` já está **aplicado e ativo** (o n8n chama a rota em produção). O
playground virou a bancada de QA de tudo que a Fase 2/3 construiu. Os dois primeiros itens vieram
promovidos de "Candidatos novos".

- [x] **Guardrail de validação antes de enviar** (`lib/guardrail.ts`, módulo puro). Checagem
      independente da resposta pronta: bloqueia preço/link/telefone fora das fontes (persona + RAG +
      orientação do operador) e promessa forte; se reprova, degrada para `pausar` (handoff), nunca
      quebra. Regras + fontes; segundo modelo fica pra depois. Roda dentro de `processTurn`
      (`lib/agent-turn.ts`). Teste unitário 16/16.
- [x] **Handoff "coach" (copiloto).** `conversations.pending_instruction` (grant de coluna, browser
      direto) guarda a orientação do operador; `/api/agent` consome no próximo turno e limpa (a IA
      retoma sozinha). No inbox, o card "Orientar a IA" (`components/AiCoach.tsx`) aparece no handoff
      aberto e reativa a IA. **Regra geral nova: handoff silencioso**, em `action=pausar` o
      `/api/agent` devolve `messages` vazio (a IA não responde, só abre o handoff) e **pausa a IA
      ele mesmo** (com messages vazio o n8n não alcança o nó que pausaria). Nós do n8n aguentam
      array vazio; nenhuma mudança no n8n foi necessária.
- [x] **Playground / bancada de teste** (`/playground`, dono-only). Dois painéis: Conversa (fala com
      a IA sem WhatsApp, sem pausar IA) + Diagnóstico (Classificação | Handoff lado a lado, Resumo
      full width embaixo). Bate no cérebro **real** via `POST /api/playground` (sessão do dono, força
      `dryRun` em `processTurn`): não grava, não move card de verdade (só mostra o estágio que
      moveria). Painel mostra RAG + similaridade, action/summary/preferencia, guardrail, latência;
      coach embutido (exercita o item acima); botão resetar. Sem mock. e2e em `/design/playground`.
- [x] **Resumo fiel + limpeza do turno de handoff** (`buildPersona`, regra geral do guiado): o
      summary descreve só o que a pessoa pediu, nunca o que a IA ofereceu. Loja Teste recompilada;
      OBM (avançado) intacta.

**Fase 4 — Comercializável**

Pré-requisitos já resolvidos: o app **está no ar** (Vercel, `crm-obs.vercel.app`) e o cutover está
ativo, então "deploy" não é mais bloqueio. O que falta é transformar o sistema em **produto que
alguém consegue assinar sozinho**. Hoje criar um tenant ainda exige SQL na mão (INSERT em `clients`,
criar o usuário no painel do Supabase, INSERT em `user_clients`).

- [x] **Estado de assinatura e gate** (base da cobrança): colunas de assinatura em `clients`
      (`subscription_status`, `trial_ends_at`, `grace_until`, ids do gateway), regra única em
      `lib/billing.ts` (módulo puro) e **gate server-side em 4 pontos**. **Decisão: conta bloqueada
      entra em modo leitura**, não é expulsa. Ela continua vendo as conversas e as mensagens seguem
      chegando (como um WhatsApp Web aberto), mas a IA emudece (turno silencioso no `processTurn`,
      sem gastar token e sem estourar erro no n8n, então a mensagem do cliente é gravada), o envio
      pelo sistema para (402 no `/api/send`, a caixa de texto sai da tela) e as páginas pagas fecham
      (`requireActiveTenant()` em cada uma). Quando pagar, está tudo lá. Carência em `past_due` para
      não bloquear no primeiro dia de atraso de Pix ou boleto.
- [x] **Cadastro self-service:** `/cadastro` público, `POST /api/signup` com freio de abuso por IP
      (`signup_attempts`), e o tenant criado por `provision_tenant` (`clients` + `user_clients`
      dono + funil inicial **numa transação**, idempotente, com rollback do usuário se falhar). A
      senha NUNCA passa pelo nosso servidor: a pessoa recebe link e escolhe a senha em
      `/definir-senha`, o que também torna a confirmação de e-mail obrigatória por construção.
- [x] **Recuperação e troca de senha:** `/recuperar-senha` (resposta igual para qualquer e-mail,
      para não virar verificador de contas) e troca em `/perfil` conferindo a senha atual antes.
- [x] **Onboarding guiado** dentro do produto: `lib/onboarding.ts` (puro) com os 4 passos
      (conectar, configurar, testar, publicar), barra de progresso em toda página do app até
      publicar, e **publicar virou interruptor real** (`agent_published_at`): sem publicar, o
      `/api/agent` fica em silêncio (200 com `messages` vazio, sem chamar o modelo) e a mensagem do
      cliente continua sendo gravada para um humano responder. Isso fecha um risco que só aparecia
      no self-service: tenant novo conectava o WhatsApp e a IA já falava com cliente real.
- [x] **Aviso de risco de conexão** no `/connect`: QR não é API Oficial, risco de bloqueio existe e
      não temos como impedir nem reverter, número dedicado ao atendimento, o que aumenta o risco, e
      a cláusula de contingência (nada se perde no CRM, reconecta outro número, avisar clientes, e
      a API Oficial como caminho com custo por mensagem). Um teste e2e trava os argumentos proibidos.
- [ ] **Cobrança.** Decidido: **gateway Asaas** (brasileiro, cobre Pix e boleto), **teste de 7 dias
      sem cartão**, e **3 planos empacotados** (não é base + usuário adicional avulso). Tabela de
      preços fechada (13/08/2026):

      | Plano | R$/mês | Atendentes¹ | Números | Funis | Conversas/mês | Atribuição | Relatório por atendente | Suporte prioritário |
      |---|---|---|---|---|---|---|---|---|
      | Essencial | 197 | 1 | 1 | 1 | 400 | não | não | não |
      | Profissional | 347 | 3 | 1 | 3 | 1.000 | sim | sim | não |
      | Avançado | 597 | 6 | 1 | ilimitados | 3.000 | sim | sim | sim |

      ¹ **O dono não conta como atendente.** Em todos os planos: inbox com tags, notas e mídia,
      painel de métricas, agente de IA incluso, base de conhecimento ilimitada, bancada de teste e
      handoff com orientação.

      **Adicionais, fora dos planos:** atendente extra até o 3º R$ 67/mês, do 4º em diante R$ 47/mês,
      conversa excedente R$ 0,25, anual com 2 meses grátis e sem fidelidade.

      A tabela mora em `lib/billing.ts` (`PLANS` + as constantes de adicional), e
      `clients.billing_plan` guarda só qual plano é. **Coerência do excedente conferida:** a 1.000
      conversas o Essencial com excedente dá exatamente R$ 347, o preço do Profissional, e acima disso
      subir de plano passa a ser mais barato. Comprar atendente extra no Essencial também é pior que
      subir para o Profissional (R$ 331 contra R$ 347, com menos recurso), o que empurra para o plano.

      **O que a lista promete e o sistema ainda NÃO cumpre:**
      - **Atendentes:** aplicado (`billableSeats` + `seatState` + 409 no `POST /api/team/invite`).
        Como atendente extra é vendido, o 409 é parede **temporária**: enquanto não existe checkout,
        cobrar o adicional é manual, e liberar antes de cobrar seria assento de graça.
      - **Funis > 1:** não existe. Hoje é um funil por tenant (`pipeline_stages` por `client_id`,
        sem tabela de funis).
      - **Conversas por mês e excedente:** não existe medição de consumo (Fase 5), nem a decisão do
        que acontece ao estourar (bloquear, cobrar ou só avisar).
      - **Relatório por atendente:** não existe. O `/painel` mostra o total da conta.
      - **Atribuição travada por plano:** a atribuição existe (Fase 1) mas não é gateada; hoje o
        Essencial teria acesso a ela.

      **Decisões fechadas em 13/08/2026, item por item:**
      - **Conversa = janela de 24h** (padrão que a Meta usa na API Oficial e que os concorrentes
        espelham). Limites mantidos em 400/1.000/3.000 e excedente em R$ 0,25, para revisar com dado
        real em 30 dias. **Nunca parar de responder ao estourar:** avisa em 80%, avisa em 100% e
        cobra o excedente. Punir o cliente porque o mês vendeu bem castiga o consumidor final.
      - **Atribuição e transferência NÃO é travada por plano** (fica em todos). O degrau já é a
        contagem de atendentes: uma clínica com 3 secretárias tem que comprar o Profissional de todo
        jeito. Travar só pioraria o plano de entrada, num produto que se vende como inbox de equipe.
      - **Relatório por atendente: descartado.** É feature de operação com gestor e vendedores, que a
        pesquisa diz não ser o comprador daqui. O dono quer saber se a IA dá conta, não ranquear a
        secretária. No lugar entra um **painel geral** melhor.
      - **Funil múltiplo: descartado.** Na lista de planos virou só "Kanban incluso" em todos. Era o
        item mais caro (`conversations` é única por `(client_id, phone)`, então uma conversa cabe em
        um estágio só: vários funis exigiriam tabela de ligação, mudança de FK, conceito de funil
        principal para a IA e mexer num componente de 777 linhas), no pedaço do produto que a
        pesquisa aponta como o mais superestimado para esse comprador.
      - **Cobrança mensal no lançamento**, anual (2 meses grátis) depois.
      - **Cancelamento self-service**, com botão e pergunta de motivo.
      **Bloqueado aguardando:** conta e chaves do Asaas (sandbox primeiro). Falta o checkout, o
      webhook que escreve o estado, a troca de plano, o cancelamento e a cobrança dos adicionais.
- [x] **Medição do agente ligada** (`agent_turns`): uma linha por turno com RAG, guardrail, latência,
      modelo e tokens, mais `dry_run` e `silenced`. O `/api/agent` já calculava tudo isso e jogava
      fora. Ligado ANTES de publicar preço de propósito: **a coluna "Custo IA" da tabela é o número
      menos verificado dela**, e dado só acumula pra frente. Primeira medição real: **3.499 tokens de
      entrada e 93 de saída num turno**, 4,4s, com a persona da Loja Teste (8.532 caracteres). Ou
      seja, a estimativa de ~4 mil tokens por mensagem se confirmou; falta uma semana de tráfego real
      para fechar o custo por conversa.
- [ ] **Painel geral** (aprovado, escopo do primeiro corte): placar da IA (resolvidas sozinha,
      passadas para humano, qualificadas), fila do "precisa de você agora", série de 30 dias e
      consumo do mês contra o limite do plano. Depende de `agent_turns` acumular histórico para os
      números de qualidade; os de volume já dão para calcular do histórico existente.
- [ ] **Marca e design system.** Domínio decidido: subdomínio de **obomsobrinho.com.br** (o domínio
      que já é do dono). ⚠️ `crm.obomsobrinho.com.br` colide com a própria decisão de não anunciar a
      categoria CRM: preferir `app.`, `atende.` ou o nome do produto como subdomínio.
      **Bloqueado aguardando o nome novo.** O design system atual já é coerente (tokens em
      `app/globals.css`, tema claro/escuro por cookie, `glass`/`panel`/`surface`, Space Grotesk +
      Manrope, verde/âmbar/vermelho só para estado): a troca de marca é paleta de acento, logo e
      nome, não redesenho.

**Fase 5 — Expansão (só depois de ter cliente)**
- [ ] **Controle de consumo de IA por tenant (instrumentação para decidir o pricing).** Não é
      feature de cliente, é medição nossa para responder uma pergunta de negócio: **cobrar com a IA
      embutida no plano ou a IA à parte** (créditos/add-on)?
      Medir, por tenant e por período: tokens de entrada e saída por turno e por modelo; embeddings
      (indexação do RAG + query de cada turno); minutos de transcrição de áudio; custo estimado em
      BRL; e os derivados que decidem: **custo por conversa**, **custo por tenant/mês** e os
      outliers (qual tenant consome desproporcional).
      Decisões que isso alimenta: (a) IA embutida (custo diluído, preço simples, risco de tenant
      pesado furar a margem) vs IA à parte (previsível pra nós, mais atrito de venda, e é o que o
      mercado faz com créditos, ver Nexloo/Zaia/Atendente.AI); (b) teto/alerta por tenant; (c) o
      candidato de roteamento de modelo por dificuldade (nota abaixo) deixa de ser palpite e passa a
      ter dado.
      **Nota de sequência:** a *medição* é barata (registrar o uso que a chamada já devolve) e só
      gera valor com histórico acumulado; a *análise e a decisão* é que são desta fase. Se quiser
      dado pronto quando for decidir o pricing na Fase 4, vale ligar só o registro antes.
- [ ] Multicanal (Instagram, Messenger).
- [ ] API Oficial como opção.

## Candidatos novos (dos vídeos do DeskcommCRM, 09/08/2026)

Ideias extraídas do CRM open-source do Rafael Melgaço (github.com/melgarafael/DeskcommCRM),
arquitetura quase gêmea da nossa. Nenhuma reabre decisão travada.

- ✅ **Promovidos para a Fase 3.5:** Handoff "coach" (copiloto) e Guardrail de validação antes de
  enviar. Ver o bloco Fase 3.5 acima.
- **Roteamento de modelo por dificuldade (relacionado ao ponto do modelo mini).** Ainda candidato,
  não priorizado. Ver nota abaixo.

> **Nota sobre o modelo (`gpt-5.4-mini` faz resposta + classificação):** para suporte de PME
> segura bem, mas o elo fraco em tenant com base grande e exigente é a qualidade da resposta.
> Alternativa preferida NÃO é subir tudo para um modelo grande (estoura custo e latência nos ~90%
> de turnos fáceis): é (a) o guardrail acima como rede de segurança, e (b) roteamento em camadas,
> manter o mini como padrão e escalar para um modelo maior só quando o turno é difícil (RAG
> retornou trechos e a pergunta é complexa, conversa longa/quente, ou baixa confiança). O
> `OPENAI_AGENT_MODEL` já permite trocar o modelo global; a evolução é override por tenant (vira
> alavanca de plano, já que cobramos por assento) + heurística de escalonamento.

## Não construir (nenhuma fase por ora)

- **Agenda / Google Calendar** (decisão do usuário: não cobrir agora).
- Disparo em massa e follow-up ativo sobre QR (queima o número).
- Construtor visual de automação (vira produto de consultoria).
- Múltiplos números por conta. White label. Gestão de equipe complexa.

## Métricas de progresso

1. Linhas ❌ da matriz fechadas.
2. Dívidas de arquitetura pagas.
3. Agente da OBS operando sem intervenção por semana.
4. Tempo do zero até um tenant novo atender (alvo Fase 4: menos de 5 min sozinho).
