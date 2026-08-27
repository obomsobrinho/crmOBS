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

## Próxima rodada (decidido em 26/08/2026)

Ordem travada. **Cobrança e checkout saem do caminho crítico**: o lançamento será um **beta
gratuito** com conhecidos do dono (empresários, clínicas), custeado por ele, para validar uso e
achar bug antes de vender. Consequência: Asaas e Vercel Pro voltam a ser gatilho do primeiro
pagante, não pré-requisito.

1. **Fechar o MVP do beta.** Bloqueador real e pequeno: o gate de assinatura expulsa o testador
   quando o trial vence. A saída já existe no código, porque **`trialing` com `trial_ends_at` nulo
   não bloqueia** de propósito; falta só uma forma de marcar um tenant como beta. Junto: um canal de
   feedback, e deixar explícito ao testador que publicar é o que solta a IA no cliente real dele.
   ⚠️ São negócios reais com clientes reais: se a IA errar, o prejuízo de imagem é do testador.
2. **Agenda** (ver abaixo). É o próximo desenvolvimento.
3. **Redesenho geral no Claude Design** (seção própria mais abaixo): tapa no visual como um todo,
   conferir aderência ao padrão e **acertar o tema claro**, que é o que mais destoa hoje. Primeira
   impressão importa porque o beta é com conhecidos, e o painel já foi aprovado como "ainda não
   está bom".
4. **Bateria de testes de segurança da IA** (novo, ver abaixo).

### Agenda (promovida a próximo passo, saiu do "não construir")

Decisão do dono em 26/08: agenda é importante e vale para clínica, que é o perfil dos testadores.

**Regra que continua valendo: NÃO construir agenda própria completa. Integrar Google Calendar.**
Disponibilidade, bloqueio, duração, reagendamento e fuso são o item de maior custo operacional do
roadmap inteiro, e o Calendar já resolve.

Base que já existe e deve ser aproveitada: o `action: "agendar"` captura dia e período, avisa o
grupo e passa para humano. A agenda transforma isso em marcação real.

O trabalho de verdade tem três partes, em ordem de risco:
- **Conexão** por tenant (OAuth do Google, um calendário por conta).
- **A IA consultar horário livre e marcar.** Isso exige dar ferramenta ao agente (function calling
  em `/api/agent`), que hoje não tem. É a mudança arquitetural da fase, não a tela.
- **Confirmação e lembrete.** ⚠️ **Ponto que precisa de decisão antes de codar:** lembrete de
  consulta é mensagem ATIVA, normalmente fora da janela de 24h. Sobre conexão QR isso é exatamente o
  cenário de banimento que o projeto decidiu não correr. Ou o lembrete fica de fora, ou fica preso à
  API Oficial, ou é disparado pelo humano. Não decidir isso é escolher por acidente.

### Ordem confirmada do MVP do beta (26/08, revisada para 6 passos)

1. **Dashboard.** Não é só implementar: envolve **pesquisa de métricas** (quais dados de fato
   importam), **desenho** (como mostrar) e **gráfico**. É a manchete do beta e a tela onde o
   empresário julga o produto, então tem que ser a melhor tela do sistema.
2. **Steps do agente.** Mesmo tratamento: pesquisa e desenho antes de implementar.
3. **Os 4 furos**: marcar tenant de beta, canal de feedback, instrumentação do beta, testes mínimos
   de segurança da IA.
4. **Design e mobile no Claude Design** (redesenho geral, tema claro, celular).
5. **Aplicar o design escolhido.**
6. **Testes** (incluindo a bateria completa de segurança da IA).

Estrutura antes de estética, de propósito: os passos 1 e 2 definem a estrutura das telas, os passos
4 e 5 são o polimento. Inverter significaria redesenhar duas vezes.

⚠️ **Pesquisa e desenho separados da implementação nos passos 1 e 2.** Foi decisão explícita do dono:
essas duas telas não devem ser "corretas e sem graça". Cada uma tem um ponto de parada para
aprovação do desenho antes de virar código.

**Acesso do testador: decidido o caminho simples, sem cupom.** A marcação já existe de graça, porque
`trialing` com `trial_ends_at` **nulo** não bloqueia (comportamento intencional do gate) e o cadastro
normal sempre grava uma data. Logo **`trial_ends_at IS NULL` já identifica o testador beta**, sem
migração, sem campo e sem UI. Com 5 a 10 testadores, marcar à mão é trivial. O campo de cupom
(`referral_code`) continua no roadmap, mas o propósito real dele é atribuição para pagar comissão de
filiado, e no beta gratuito não há comissão a pagar.

### Steps do agente: desenho de referência (26/08)

Padrão aprovado pelo dono (referência visual: assistente de onboarding tipo Plain/Kastamer).
Coluna esquerda com a trilha vertical (ícone, título, descrição; concluído com check e linha cheia,
futuro apagado com linha tracejada). Coluna direita com "PASSO N DE 4", título grande, um parágrafo
que explica **por que** o passo importa, os campos, e rodapé com Voltar e Salvar e continuar.

**Os 4 passos** (a mesma ordem em que o dono pensa o problema):
1. **Quem atende** (nome do agente, empresa, tom)
2. **O que ele sabe** (o que a empresa faz, horário, detalhes, base de conhecimento)
3. **O que ele pode fazer** (objetivos, regras, quando chamar humano)
4. **Testar e publicar** (bancada de teste e a chave)

> Estes títulos já tinham sido recusados como **âncora no topo** da tela antiga. Como **passo** eles
> funcionam, porque descrevem a sequência natural de configurar um atendente.

**O bloco "Guidance"** da referência (3 cartões pequenos com ícone, uma linha e "saiba como") é o que
entrega "simples mas com opções para explorar": caminho principal curto, aprofundamento opcional.

**Três decisões de desenho que precisam ser respeitadas:**
- **Assistente na primeira vez, edição livre depois.** Wizard é ótimo na primeira configuração e
  insuportável na quinta. A trilha da esquerda tem que ser navegável (clicar direto no passo).
- ⚠️ **"Salvar e continuar" colide com "salvar já é publicar".** O n8n lê `clients.persona` ao vivo,
  então gravar a cada passo empurraria persona meio configurada para um agente que já atende. Para
  tenant novo é inofensivo (a IA só fala depois de publicar, via `agent_published_at`). Para quem
  edita agente ATIVO, é perigoso. Ou o wizard acumula e grava só no fim, ou o botão muda de
  comportamento quando o agente já está publicado.
- **No celular a coluna dupla não cabe:** a trilha vira um "Passo N de 4" compacto no topo com o
  título do passo. Decidir no desenho, não na implementação.

### Dashboard: promovido a primeira tela (26/08)

Decisão do dono: **o painel passa a ser o primeiro item do menu**, antes de Conversas. Razão: é a
tela que prova valor, é o que ele mostra ao cliente, e é onde o empresário julga o produto depois que
a novidade passa.

> Refinamento sugerido, a confirmar: a primeira tela pode depender do **papel**. Quem trabalha na
> operação (atendente) abre em Conversas; o dono abre no Painel. Os papéis já existem em
> `user_clients.role`, então o custo é baixo.

**As quatro perguntas que o painel tem que responder** (é assim que ele deve ser organizado, não por
tipo de gráfico):
1. **A IA está dando conta?** Conversas resolvidas 100% pela IA sem humano, quantas precisaram de
   você e por quê, tempo de primeira resposta.
2. **O que isso me deu?** (o que retém) Mensagens respondidas fora do horário, em fim de semana e
   feriado; primeira resposta abaixo de 1 minuto; acumulado desde o início. Já calculado em
   `lib/valor.ts`.
3. **O que preciso fazer agora?** Fila do "precisa de você", leads qualificados aguardando,
   oportunidades paradas.
4. **Está crescendo?** Série de 30 dias, horário e dia de pico.

**Sacadas do painel, em ordem de impacto:**
- **A manchete tem que ser métrica de DEPENDÊNCIA, não de volume.** "347 conversas" o dono acha
  normal, porque acha que também faria. "213 respondidas fora do horário" ele não consegue replicar
  sem a ferramenta. A manchete é sempre o que ele não consegue fazer sozinho.
- **Antes e depois, usando o histórico importado.** ⚠️ **Esta é a melhor sacada da lista e é
  exclusiva nossa:** no onboarding importamos o histórico do WhatsApp do cliente, então temos como
  ele atendia ANTES da IA. Tempo de primeira resposta antes contra depois é um número devastador, e
  **nenhum concorrente consegue mostrar isso**, porque nenhum importa histórico.
- **O que a IA não soube responder.** Lista das perguntas que viraram handoff por falta de
  informação, virando sugestão do que adicionar na base de conhecimento. Transforma o painel de
  espelho em ferramenta de melhoria, e aumenta o uso da base, que é o que trava o cliente no produto.
- **Traduzir para horas ou dinheiro.** "213 mensagens fora do horário" vira "equivalente a X horas de
  secretária". É o que faz o preço parecer barato. Com conta transparente e conservadora: número
  inventado aqui destrói a régua de confiança, que é o nosso eixo.
- **Todo número precisa de comparação e de período.** Já resolvido no componente (`Stat` com rótulo,
  número, frase que interpreta e legenda de período) e em `lib/delta.ts`. Aplicar em tudo, sem
  exceção: cartão sem período mente sobre o próprio número.

### Cadastro do contato, além do WhatsApp (novo, 26/08, não perder)

Hoje `dados_cliente` guarda o que o WhatsApp entrega (telefone, nome) mais `display_name` e
`custom_fields`. Falta o cadastro de verdade: **CPF, data de nascimento, e-mail** e afins, que são o
que permite o resto depois (aniversário, documento, histórico do paciente, integração).

Decisões do dono já dadas:
- **Não forçar.** Nada de bloquear atendimento por falta de cadastro.
- **Sinalizar:** um aviso discreto ao lado do atendimento quando o contato está incompleto.
- **Futuro:** o próprio agente pode coletar esses dados na conversa, naturalmente. É o caminho, mas
  não é o primeiro passo.

⚠️ Dado pessoal sensível (CPF, data de nascimento) muda o peso da LGPD sobre o produto: passa a
exigir base legal, finalidade declarada e cuidado com retenção. Decidir de propósito antes de
coletar, não depois.

### Lembrete e mensagem ativa: decisão do dono (26/08)

**Decisão: MANTER lembrete de consulta e mensagens do tipo aniversário.** O dono pesou o risco de
banimento contra o custo de ficar abaixo dos CRMs de clínica, que fazem isso, e escolheu construir.
Registrado como decisão consciente, não como descuido: o risco documentado no projeto continua real.

**Mitigações que tornam isso sustentável, e que devem entrar junto com a feature:**
- **Separar os dois casos, porque o risco é MUITO diferente.** Lembrete para quem marcou e conversou
  ontem é o caso de menor risco possível de mensagem ativa: baixo volume, mensagem esperada, alta
  taxa de resposta, conteúdo personalizado. Disparo de aniversário para a base inteira é o de maior
  risco. Tratar os dois como "mensagem ativa" e aplicar limites diferentes.
- **Só para contato com conversa recente.** Nunca para número frio ou lista importada.
- **Ritmo humano:** teto por dia, intervalo aleatório entre envios, nunca rajada.
- **Saída fácil** ("responda SAIR"), que derruba denúncia, o gatilho de banimento que mais pesa.
- **Construir agnóstico de canal.** O lembrete é o argumento mais forte para migrar para a API
  Oficial (template de utilidade é legal e custa cerca de R$ 0,035). Se nascer amarrado ao QR, a
  migração depois custa o dobro.

### Bateria de testes de segurança da IA (novo, 26/08)

O dono pediu teste a fundo do risco de a IA falar besteira com o cliente final do testador. Hoje a
defesa existe em três camadas (seção FONTES E HONESTIDADE no `buildPersona`, `lib/guardrail.ts` antes
de enviar, e o handoff), mas **não existe teste que prove que elas seguram**. O que falta é um
conjunto de conversas-armadilha rodando contra o cérebro real em `dryRun`: preço que não está na
base, promessa de prazo, pedido de conselho médico ou jurídico, tentativa de trocar as instruções,
pergunta fora do escopo, e insistência depois de a IA já ter dito que não sabe. Critério de aceite é
o guardrail bloquear ou a IA passar para humano, nunca inventar.

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
- [x] **Grants de `conversations`, nível 1** (22/08/2026, `mt_conversations_column_grants`). A
      pendência era: `authenticated` tinha UPDATE em nível de TABELA e a policy só checava o tenant,
      então qualquer membro, inclusive atendente, escrevia qualquer coluna pelo browser. **Não era
      vazamento entre tenants** (a RLS segura, e `chat_messages` está de fato protegida porque tem o
      grant mas **não tem policy de UPDATE**): era falta de separação DENTRO do tenant.
      Agora o UPDATE é por coluna, só nas 8 que o browser escreve (`unread_count`,
      `assigned_user_id`, `stage`, `stage_source`, `stage_changed_at`, `pending_instruction*`).
      **`handoff_at` saiu da lista**, e era o que mais importava: limpar ele escondia a conversa do
      filtro "Precisa de você", e ele já era escrito só por rota service_role. `status` saiu porque
      ninguém escreve. Provado por impersonação de `authenticated`: `unread_count` passa,
      `handoff_at` responde `42501 permission denied`, e arrastar card, atribuir e coach seguem
      funcionando.
      ⚠️ **Nível 2 segue pendente e NÃO sai com grant:** separar dono de atendente por coluna é
      impossível assim, porque os dois são o mesmo papel de banco (`authenticated`). `stage_source` e
      `pending_instruction` continuam abertos a qualquer membro, e o segundo entra no system prompt
      como orientação confiável do time. Resolver exige trigger ou mover o write para rota
      service_role.
- [ ] Parar de gravar resposta da IA como `"msg1 | msg2"` numa linha só. ⚠️ toca o n8n.
      **Reavaliado em 22/08/2026 e MANTIDO adiado**, com número: são **14 de 116 respostas (12%)**
      guardadas com `" | "`. Nada quebrado, porque Thread, sidebar, card do pipeline e a
      reconstrução de histórico já desfazem. O dono autorizou "aplicar tudo" na mesma conversa, mas
      este item foi deixado de fora de propósito: mexer nele exige o nó de gravação do n8n em
      produção, e a regra da casa é nunca tocar workflow ao vivo sem autorização explícita e
      separada. Revisitar junto com trazer a gravação de mensagens para dentro do app.
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
      retoma sozinha). No inbox, orientar é a aba "Orientar" da caixa de escrita
      (`components/MessageComposer.tsx`), que grava e reativa a IA; enquanto a orientação não foi
      consumida, ela aparece colada no topo da própria caixa, com a opção de cancelar.
      ⚠️ O "handoff silencioso" que esta fase introduziu (em `action=pausar`, `messages` vazio mais
      a IA se pausando) foi **revertido em 20/08/2026**: ver "Handoff sem pausa" abaixo.
- [x] **Playground / bancada de teste** (`/playground`, dono-only). Dois painéis: Conversa (fala com
      a IA sem WhatsApp, sem pausar IA) + Diagnóstico (Classificação | Handoff lado a lado, Resumo
      full width embaixo). Bate no cérebro **real** via `POST /api/playground` (sessão do dono, força
      `dryRun` em `processTurn`): não grava, não move card de verdade (só mostra o estágio que
      moveria). Painel mostra RAG + similaridade, action/summary/preferencia, guardrail, latência;
      coach embutido (exercita o item acima); botão resetar. Sem mock. e2e em `/design/playground`.
- [x] **Resumo fiel + limpeza do turno de handoff** (`buildPersona`, regra geral do guiado): o
      summary descreve só o que a pessoa pediu, nunca o que a IA ofereceu. Loja Teste recompilada;
      OBM (avançado) intacta.
- [x] **Handoff sem pausa** (20/08/2026, revisão da regra acima). Motivada por uma conversa real:
      a pessoa pediu horário, a IA abriu o handoff **em silêncio**, ela perguntou "tem alguma vaga
      pra hoje?" 26 segundos depois e, com a IA pausada, esse pedido novo foi **gravado mas nunca
      classificado**. Ficou 6h36 sem resposta. Investigando, apareceu o defeito maior: a pausa é
      porta de mão única, e **46 dos 47 contatos da OBM estavam com a IA desligada para sempre**.
      Decisão do dono do produto: **handoff nunca pausa a IA**; pausa só quando um humano assume ou
      alguém desliga na chave. O que foi feito:
      - `conversations.handoff_at` (`timestamptz`, migration `mt_conversations_handoff_at`, sem
        backfill): "a IA pediu ajuda e o time não respondeu". Guarda o **primeiro** handoff em
        aberto, porque é ele que dá a espera real; o resumo do **último** pedido continua vindo de
        `conversation_qualifications` (uma linha por turno). Escrita só service_role: abre no
        `/api/agent`, fecha no `POST /api/send` (envio manual = alguém respondeu).
      - `processTurn` parou de zerar `messages` e parou de gravar `atendimento_ia='pause'`.
      - Filtro "Precisa de você" saiu de "IA pausada" para `handoff_at != null && !pausada`, com o
        tempo de espera na linha ("6h · quer horário para hoje"). O âmbar da linha passou a seguir
        o handoff, não a pausa, e virou `text-warn-ink` (era `text-warn`, fill como tinta).
      - Aviso ao contato **configurável**: `agent_config.handoffNotice` é a **base** da frase, e o
        prompt manda adaptar ao pedido ("vou verificar se tem horário pra hoje"). Base, e não frase
        pronta, porque frase pronta se repetiria a cada handoff, que foi exatamente o que produção
        mostrou (dois handoffs em 26s com a mesma promessa). Campo em `/agente`, seção Regras.
      - `buildPersona` ganhou as regras "pausar não encerra a conversa", "não repita o aviso quando
        já avisou" e "pausar não é desculpa pra não atender".
      - **No n8n:** com `messages` não vazio, o `Loop envio` termina e o `Action` volta a ser
        alcançado, então `Pausa IA (handoff)` dispararia de novo. Os dois nós de pausa da IA
        (`Pausa IA (handoff)` e `Pausa IA (agendado)`) precisam ficar **desativados**;
        `Pausar IA (Franck digitou)` continua ativo, porque é o "um humano assumiu".
      - ⚠️ **Personas já compiladas não mudam sozinhas:** tenant em `guiado` só recebe as regras
        novas ao salvar em `/agente`. As duas foram atualizadas em 20/08/2026: Loja Teste
        recompilada pelo formulário (8532 para 9326 chars) e a OBM, que está em `avancado`, recebeu
        uma seção nova `### QUANDO PASSAR PRO TIME` inserida logo antes do `### OUTPUT`, para o
        contrato continuar sendo o último bloco (9721 para 10494 chars, autorizado pelo dono do
        produto). Prova de não-regressão: removendo exatamente o bloco novo, o md5 da OBM volta a
        ser o original `a17c50af…`. Backup em `public._persona_backup_20260820` (tabela descartável,
        `drop` quando o comportamento estiver conferido em produção).
      - **Teste local no cérebro real** (bancada em `dryRun`, tenant Loja Teste): "quero falar com
        uma pessoa do time" devolveu mensagem mais `action=pausar` (antes vinha `messages: []`); e o
        caso que originou o item, histórico com "horário pra sexta de manhã" mais a IA já tendo
        avisado que ia verificar, seguido de "tem alguma vaga pra hoje?", devolveu **"Vou verificar
        se tem horário pra hoje e já te confirmo por aqui."** com `action=pausar` e summary "Pessoa
        quer saber se tem horário disponível hoje": segundo handoff, refletindo o último pedido.

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

- [x] **Estrutura base do agente e consolidação da tela** (22/08/2026). Nasceu de uma pergunta do
      dono: se o handoff é regra geral, por que ela foi aplicada num prompt em vez do gerador?
      **Pesquisa que embasou a decisão** (documentação oficial, verificada em 21/08/2026): a
      HelenaCRM, a mais avançada do conjunto de pares, expõe **campo de texto livre**
      ("Personalidade do Agente", exemplo oficial dela: `"Você é um agente de atendimento da
      empresa Teste. Seu nome é John. Seja sempre cordial e prestativo."`) mais 8 habilidades
      tipadas; o Octadesk (R$ 2.499) **não tem prompt livre**, só campos fechados (tom em 6 opções,
      estilo em 3, palavras a evitar, máximo de mensagens por resposta); a SleekFlow tem "Your
      playbook" (livre) e **"Optimized playbook"**, que a plataforma compila em seções fixas; e o
      Intercom Fin não dá prompt, dá **até 100 regras de 2.500 caracteres** com o núcleo travado. A
      Decagon vende a categoria: "o time escreve em linguagem simples e a plataforma **compila** em
      lógica estruturada". Conclusão: **quanto mais maduro o produto, menos prompt livre**, e o
      `buildPersona` já estava à frente do conjunto de pares nesse eixo.
      Decisões travadas:
      - **Três camadas, não duas.** Base que abre (identidade, contexto, tom, fontes), depois o
        conteúdo do cliente cercado por `--- início/fim ---`, depois **base que fecha**
        (precedência, quando chamar humano, anti-manipulação, OUTPUT). O contrato é o ÚLTIMO bloco,
        porque recência protege ele do que o cliente escrever sem querer.
      - **Base é molde e regra; cliente é valor.** Nome e horário são dado do cliente, não texto da
        base. Base com horário escrito dentro seria uma base por cliente.
      - **Precedência declarada:** o cliente manda no jeito de atender (tratamento, apelido, tom, o
        que pode falar); a base manda no contrato. Sem declarar, o modelo decide na hora.
      - **Modo avançado = liberdade com rabo colado** (opção C): edita o que quiser, e a base sempre
        reanexa as seções finais. Sem isso, tenant em avançado nunca mais recebe melhoria da base,
        que foi exatamente o que aconteceu com a OBM no handoff. Implementado com `buildBaseTail`,
        `stripBaseTail` e `buildAdvancedPersona` (`lib/agent-prompt.ts`): a textarea guarda só a
        parte editável, o rabo aparece num bloco somente leitura abaixo, e a tela **avisa** quando o
        texto guardado tinha seções que agora são fixas, em vez de apagar em silêncio.
        ✅ **A persona da OBM foi recompilada em 22/08/2026**, autorizada pelo dono. 10.494 para
        11.452 chars, `md5 0efa85000852f92b75140562127b3544`, versão registrada em
        `agent_publications` com `published_by` nulo (foi migração, não alguém clicando em Salvar), e
        backup em `public._persona_backup_20260822`.
        **O que foi movido ANTES de recompilar**, porque o strip levaria embora: o parágrafo
        "IMPORTANTE: os exemplos acima..." (morava dentro do `### OUTPUT` dela e é o que impede o
        modelo de responder em texto solto imitando os exemplos) e a calibragem do summary
        ("segmento, dor identificada e contexto relevante"). Os dois foram para o fim do
        `### EXEMPLOS`, posição em que o "acima" do parágrafo continua verdadeiro. O parágrafo foi
        **extraído do texto dela por índice, nunca redigitado**: retipar 300 caracteres com acento é
        convite a estragar justamente o que se quer preservar.
        **O que ela perdeu de propósito:** o nome no `ANTI-MANIPULAÇÃO` (o rabo da base fica genérico
        sem `agent_config`) e o "com o time" no aviso de handoff. Injetar os nomes à mão produziria
        uma persona que a rota não sabe reproduzir, e no próximo save pela UI eles sumiriam sozinhos;
        consistência com a rota vale mais que a frase. O `### IDENTIDADE` dela já estabelece quem é o
        Tony, então o modelo não perdeu o nome. **Ganhou** os 3 gatilhos fixos de escalada que não
        tinha (pediu humano, falta informação, reclamação séria).
        **Fumaça com o cérebro real**, rodando o texto dela por `personaOverride` na Loja Teste para
        não escrever no tenant do cliente: apresenta como "Tony, da OBS", devolve 2 mensagens no
        array (o parágrafo IMPORTANTE fazendo o trabalho), recusa dar preço e oferece a call, e o
        guardrail passou nos dois turnos.
      - **Sem rascunho.** Salvar JÁ É publicar (o n8n lê `clients.persona` ao vivo), então não
        existe botão Publicar separado: cada Salvar é uma versão. Rascunho só faria sentido se
        `/agente` e `/playground` compartilhassem estado, e aí a resposta é fundir as telas.
      - **Versões em log append-only** (`agent_publications`: config, **persona compilada**,
        `prompt_mode`, quem e quando). Não é fonte de verdade: quem está no ar segue em `clients`.
        Escolhido em vez de tabela autoritativa porque dá o benefício (voltar atrás, e saber o que o
        agente dizia numa data) sem o custo (resolver "qual linha está ativa", RLS nova no caminho
        de produção). **Restaurar não grava:** carrega a versão no formulário e a pessoa salva.
      - **`agent_enabled` separado de `agent_published_at`.** A primeira ativação nunca é limpa,
        senão desligar a IA por uma hora faria a barra de onboarding voltar em toda página pedindo
        para publicar. Vocabulário: **"Agente ativo" e "Desativado"**, nunca "pausado" (pausada é a
        IA de UMA conversa quando um humano assume).
      - **Tela: 4 cartões viraram 1.** Publicar virou chave no cabeçalho, notificação do grupo virou
        campo dentro de Objetivos (só com "Agendar" marcado), horário virou seção nos dois modos,
        Salvar desceu para o rodapé, e o prompt gerado saiu da coluna fixa para um **drawer**
        (`components/ui/sheet.tsx`, 16º da camada base). Uma rolagem só na tela. Apagados:
        `AgentPublishCard`, `NotifyTargetCard`, `AgentBusinessHours`, `AgentPromptPreview`.
- [x] **Fundir `/agente` e `/playground`** (22/08/2026). A pendência era: configurar e testar são a
      mesma atividade e estavam em duas telas, o fluxo real é editar, testar, voltar, editar, e isso
      exigia SALVAR entre cada volta. Como salvar já é publicar (o n8n lê `clients.persona` ao vivo),
      testar significava mexer no agente que está atendendo cliente de verdade.
      **Decisão: painel lateral dentro do `/agente`** (`components/AgentTestDrawer.tsx`, sobre o
      `sheet` da camada base), e **não** as duas colunas que estavam previstas aqui. O motivo é que
      as duas colunas refariam o layout aprovado em 22/08, e o painel entrega o mesmo ciclo curto
      sem tocar em nada dele: a consequência que estava "aceita" acabou não sendo necessária.
      O `sheet` ganhou variante de largura (`tamanho: padrao | largo`, 520 e 1040px) em vez de
      className na tela, porque era a mesma sopa de classe com um número trocado.
      **O que faz o teste valer:** o corpo do `POST /api/playground` passou a levar a configuração
      CRUA em edição (`mode` mais `config` ou `persona`), e `processTurn` ganhou `personaOverride`,
      honrado **só em `dryRun`** (a guarda mora no módulo, não na rota: persona vinda de fora nunca
      pode atender no WhatsApp, mesmo que alguém erre a rota depois). Quem compila é o servidor,
      sempre, então o rabo invariante da base é recolado e o teste não pode rodar sem contrato de
      saída. Config incompleta volta 400 com os campos que faltam, o que também atende à preocupação
      levantada na época ("não quero testar algo que não está completo").
      **A tela própria `/playground` foi removida**, junto do item do menu; ficaram o endpoint
      `/api/playground` e o preview `/design/playground` (que agora abre o painel). A rota antiga
      responde **404**: ela era dono-only e só existia no menu, então não há link externo para
      quebrar, e um redirect seria um arquivo cujo único trabalho é pedir desculpa. Se incomodar,
      é uma linha.
      **Provado com login** (`e2e/agente.auth.spec.ts`, cérebro real): trocar o nome do agente no
      campo e mandar mensagem faz a IA responder com o nome NOVO, e a vigilância de rede confirma
      zero `PUT` de `agent-config`. Depois disso, no banco: `md5(persona)` da Loja Teste igual,
      `chat_messages` igual (25), `agent_publications` igual (2), `conversation_qualifications` igual
      (2), e a única linha nova em `agent_turns` marcada `dry_run`.

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
- [x] **Dados de valor percebido (retenção e venda): "não posso ficar sem isso".** FEITO em
      19/08/2026. Motor em `lib/valor.ts` (módulo puro: os 7 números mais as frases prontas em
      pt-BR), superfície em `components/ValorResumo.tsx`, ligado no `/painel` acima dos 4 números de
      operação (que ganharam a seção "Operação, últimos 7 dias"). Janela do resumo é **mês fechado**:
      mês pela metade dá número que parece pequeno e vende contra a gente.
      **Antídoto do cancelamento** entregue: o acumulado desde o início aparece no passo de cancelar
      (`BillingCheckout`), antes do campo de motivo. Preview em `/design/valor` (com e sem horário) e
      `/design/cancelamento`; testes em `e2e/valor.design.spec.ts`, um deles falhando se aparecer
      travessão. Conferido contra o banco: em julho de 2026 o painel mostrou os mesmos números que o
      SQL na mesma janela.
- [x] **Valor percebido virou MANCHETE do painel** (22/08/2026). O cálculo não mudou uma linha; o que
      mudou é hierarquia. Seis blocos do mesmo tamanho não têm manchete, e sem manchete a pessoa não
      lê nenhum: agora a frase mais forte (a ordem já vinha de `frasesDeValor`) ocupa a largura
      inteira em superfície da marca, com a frase em `text-titulo`, e o resto desce para a grade.
      **O acumulado desde o início subiu para o painel**, como segunda linha da manchete: "213 no
      mês" convence, mas "1.876 desde o início" é o que trava a mão de quem ia cancelar, e ele estava
      só no passo de cancelamento, ou seja, chegava tarde. Duas decisões de apresentação:
      (1) **mês fechado vazio cai no acumulado** em vez de mostrar "ainda sem movimento", porque
      conta nova é exatamente quando o cliente mais duvida da ferramenta; nesse caso o rótulo do
      período muda para "desde o início" junto, senão o título mentiria;
      (2) `recebidas` aparece como contexto no cabeçalho (já vinha no resumo, não é métrica nova).
      Custo de página inalterado: o mês fechado passou a ser **recortado do acumulado em memória**
      em vez de virar duas consultas próprias, então continuam 4 consultas. O recorte compara por
      `Date.parse` e não por string, porque o banco devolve `+00:00` e `mesFechado` gera `Z`, e
      comparar isso como texto erra na linha da fronteira.
      **Decisões tomadas na implementação:**
      - Classificação em `America/Sao_Paulo` via `Intl`, não em UTC: em UTC a mensagem da noite
        cairia no dia seguinte e estragaria justamente o número mais forte.
      - **Só resposta da IA conta** em "fora do horário" e "fim de semana". Resposta manual fica de
        fora porque foi alguém do time trabalhando de madrugada, e somar as duas inflaria a frase.
        No dado real de 90 dias isso era 31 da IA contra 7 de humano.
      - **Feriados nacionais calculados no módulo** (fixos mais os móveis derivados da Páscoa). Sem
        serviço externo e sem tabela. Municipal e estadual ficaram fora: exigiria cadastro por
        tenant, e chutar o município transformaria dia útil em feriado dentro da frase.
      - **Sem horário configurado, a frase é OMITIDA**, com aviso na tela e link para configurar.
        Frase com número zero também não entra: não convence e ocupa espaço.
      - **Horário de atendimento salvável sozinho** (`mode: "horario"` no `PUT` de `agent-config`
        mais `components/AgentBusinessHours.tsx`, que aparece só no modo avançado). Sem isso a OBM
        nunca teria horário, porque a persona dela é escrita à mão e passar pelo formulário guiado a
        substituiria. Faz merge no `agent_config` e não toca `persona` nem `prompt_mode` (provado: o
        md5 da persona ficou inalterado depois de salvar).
      **Pendente deste item:** a entrega recorrente do resumo (mensal, no WhatsApp ou no e-mail do
      dono), que exige escolher canal e um agendador. E o acumulado do cancelamento é calculado na
      hora com teto de 20 mil linhas; quando o teto doer, o caminho é tabela de agregado mensal.
      Descrição original do item, preservada: o mesmo motor de
      medição do item acima, virado para fora, para o cliente. Ataca o maior risco de churn deste
      produto: **o valor dele é invisível**, porque a IA responde dentro do WhatsApp e o dono vê tudo
      no celular dele de qualquer jeito; um painel que ele não abre não sustenta mensalidade.
      A ideia é transformar operação em evidência de dependência, no formato de frase pronta:
      > "A clínica atendeu **213 mensagens fora do horário comercial** em outubro."

      Números candidatos, todos deriváveis do que já gravamos (`chat_messages`, `conversations`,
      `conversation_qualifications`, `agent_turns`):
      - mensagens respondidas **fora do horário comercial** e **em fim de semana e feriado** (o mais
        forte: é o trabalho que humano nenhum teria feito);
      - conversas atendidas **sem nenhuma intervenção humana** (quanto a IA carregou sozinha);
      - **leads qualificados** e pedidos de agendamento captados no período;
      - **tempo de primeira resposta** hoje contra o começo (antes e depois);
      - **primeira resposta em menos de 1 minuto**, quantas vezes;
      - horário e dia de pico (mostra quando ele estaria perdendo cliente sem a ferramenta).

      Usos: (a) **retenção**, entrega recorrente do resumo (mensal, no WhatsApp ou no e-mail do dono,
      já que ele não abre o painel); (b) **venda**, o mesmo número vira prova social e material de
      caso, com autorização; (c) **antídoto do cancelamento**, mostrar o acumulado na hora em que ele
      pensa em sair.
      **Cuidados:** nunca inventar nem inflar número (o cliente confere no WhatsApp dele, e a régua de
      confiança é o nosso eixo); precisa do horário comercial configurado por tenant para "fora do
      horário" significar algo; e no primeiro mês o número é fraco, então o valor cresce com histórico.
- [ ] Multicanal (Instagram, Messenger).
- [ ] API Oficial como opção.

## Redesenho geral no Claude Design (decidido em 26/08/2026)

**Próximo passo depois da rodada de UI atual.** Decisão do dono do produto: quando os ajustes de
tela em andamento fecharem (detalhes de inbox e pipeline, painel, steps do agente), passar um
**redesenho geral no Claude Design** para melhorar tudo de uma vez, em vez de seguir tela a tela.
O painel de 26/08 foi aprovado como "ainda não está bom", ou seja, ele entra nesse redesenho junto
com o resto.

Por que fica para o fim, e não agora: a rodada atual está descobrindo as REGRAS que o redesenho vai
precisar respeitar, e cada uma nasceu de um defeito medido, não de gosto. As que já saíram:

- **Hierarquia de numeral em três degraus** (32 / 24 / 18), via `--text-numero` e
  `components/ui/stat.tsx`. O painel tinha dez números e todos do mesmo tamanho.
- **Cartão de indicador com quatro peças**: rótulo, número, uma frase que INTERPRETA e uma legenda
  com o PERÍODO. A legenda é obrigatória no componente, porque cartão sem período mente sobre o
  próprio número.
- **`Stat variant="elevado"`**, para o padrão "página sobre canvas com cartões flutuando", que é o
  único jeito de o cartão ficar acima do fundo no tema claro (`--s-bloco` claro é igual ao
  `--canvas`).
- **Selo de variação com direção declarada** (`lib/delta.ts`): base pequena em valor absoluto,
  direção invertida no tempo de resposta, e supressão do selo quando a janela é incompleta.
- **Reset não pode vencer utilitário**: regra sem `@layer` ganha de `@layer utilities` por mais
  específica que a outra seja.

O candidato natural a virar padrão do design system é o `Stat`: ele já está na base, e a mesma sopa
de classe que ele substitui (`rounded-xl border border-line bg-bloco p-N`) ainda está escrita à mão
em cerca de nove outros lugares. Migrar esses consumidores é o primeiro item do redesenho.

⚠️ O `/design` (preview sem login) é onde esse redesenho se valida sem tocar em dado real, e é onde
os testes e2e sem login batem. Preview que não renderiza a tela inteira não serve: o
`/design/painel` mostrava só metade e foi corrigido em 26/08.

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

## Economia unitária e canal de venda (21/08/2026)

Decidido em conversa. A tabela de preços em si está na Fase 4 e não muda.

### Custo real por conversa

Medido no código (`HISTORY_ROWS` 10, `p_match_count` 5, `CHUNK_SIZE` 1000) e confirmado pela
primeira leitura de `agent_turns` (3.499 tokens de entrada, 93 de saída num turno real).

| | Sem cache | Com cache de prompt |
|---|---|---|
| Turno | R$ 0,019 | R$ 0,013 (o 1º turno da conversa é sempre miss) |
| Conversa de 6 turnos | **R$ 0,114** | **R$ 0,084** |
| Custo de IA no Essencial (400) | R$ 46 | R$ 34 |
| Custo de IA no Avançado (3.000) | R$ 342 (margem 40%) | R$ 252 (margem 55%) |

Preços usados: `gpt-5.4-mini` a US$ 0,75/M de entrada, US$ 4,50/M de saída e **US$ 0,075/M de
entrada em cache**; `text-embedding-3-small` a US$ 0,02/M (irrelevante no total). Dólar a R$ 5,16.

**O cache de prompt deixou de ser otimização e virou pré-requisito comercial:** sem ele o Avançado
com 3.000 conversas fica em 40% de margem, e ele é o único plano onde o teto é o caso provável.
Boa notícia: `lib/agent.ts:124-134` já monta o system na ordem certa (persona, depois RAG, depois
AGORA, depois orientação do operador), então a persona é prefixo estável e o cache funciona sem
reordenar nada. Duas alavancas extras, se precisar: cair de 5 para 3 chunks de
RAG quando a similaridade é baixa, e `HISTORY_ROWS` de 10 para 6.

- [x] **Medir o cache de prompt** (22/08/2026). `agent_turns.cached_input_tokens` guarda
      `usage.prompt_tokens_details.cached_tokens`; `null` = o modelo não informou, `0` = miss, e o
      primeiro turno de uma conversa é sempre miss. **Primeira medição real** (Loja Teste, dois
      turnos seguidos no cérebro real em `dryRun`): turno 1 com **0 de 3.787** tokens de entrada,
      turno 2 com **2.304 de 3.870, ou 59,5%**. A hipótese da tabela acima se confirmou: o cache
      pega, e pega em cima da persona, que é o único prefixo estável. A partir daqui a coluna "Com
      cache" deixa de ser projeção e passa a ser conferível por consulta.
      O `/agente` avisa quando a persona compilada fica abaixo de `CACHE_SAFE_TOKENS` (2.048, em
      `lib/agent-prompt.ts`). **Por que 2.048 e não os ~1.100 anotados aqui antes:** a documentação
      oficial diz 1.024 para GPT-5.6+ mas de 1.024 a 2.048 para modelos anteriores, e o nosso
      (`gpt-5.4-mini`) é anterior; ela ainda avisa que o cache é inconsistente pouco acima de 1.024.
      O aviso usa o teto da faixa porque prometer economia que não vem é pior que avisar de um risco
      que não se concretizou. Na prática o modo guiado nunca dispara (o esqueleto vazio já dá ~2.146
      tokens); quem dispara é modo avançado com prompt curto.

**A base de conhecimento não escala custo.** O retrieval é fixo em 5 chunks, então 500 páginas
custam por turno o mesmo que 5. Indexar um PDF de 50 páginas sai abaixo de R$ 0,01. Por isso a
lista de planos oferece base ilimitada em todos: é generosidade de graça.

**Teto duro por turno:** no pior caso (persona de 12.000 chars e histórico cheio) o turno custa
R$ 0,065. Nenhum tenant consegue explodir a conta além disso.

### Custo fixo e break-even

| Item | Mensal |
|---|---|
| VPS KVM 2 (US$ 24,49, Easypanel + Evolution + n8n) | R$ 126 |
| Supabase Pro (US$ 25) | R$ 129 |
| Vercel Pro (US$ 20) | R$ 103 |
| Domínio (R$ 49/ano) | R$ 4 |
| **Total** | **R$ 362** |

Margem do Essencial no cartão: R$ 197 menos R$ 6,38 de Asaas e R$ 34 de IA = **R$ 157 (80%)**.
**Break-even em 3 clientes** (4 com comissão de canal ligada).

**Três decisões de infra:**
- **Supabase Pro é gatilho, não cronograma: sobe no dia em que o primeiro cliente pagar.** O plano
  Free **não tem backup automático** e pausa o projeto após 1 semana de inatividade. Guardar
  conversa de cliente pagante sem backup é o risco real, não o limite de 500 MB (que os embeddings
  do RAG, 6 KB por chunk, comem rápido de qualquer jeito).
- **Não self-hospedar o Supabase na VPS.** Concentraria banco, auth e conexão do WhatsApp no mesmo
  ponto de falha, disputaria RAM com as instâncias Baileys, e transformaria o dono em DBA. A
  economia seria R$ 129/mês, menos que a margem de um cliente.
- ⚠️ **O plano Hobby da Vercel proíbe uso comercial.** Rodar SaaS pago nele é violação de termos.
  Vercel Pro no mesmo gatilho do Supabase.

### Taxas do Asaas (verificadas 12/08/2026)

Pix e boleto R$ 0,99 nos 3 primeiros meses e **R$ 1,99** depois. Cartão 1,99% + R$ 0,49, virando
**2,99% + R$ 0,49** após 3 meses. Sem mensalidade. Há uma linha de "1,99% em assinaturas" que
**precisa ser confirmada no contrato** antes de fechar o número.

**Não dar desconto para Pix.** Sobre R$ 197 a diferença entre Pix e cartão é de R$ 4,39, e 5% de
desconto custaria R$ 9,85. Se for incentivar, o teto é 2%.

### Estratégia de venda

**Sem taxa de implantação e sem fidelidade, por decisão do dono.** O produto foi construído para
autonomia (cadastro, conexão, configuração e uso sem alguém pegando na mão) e a venda acompanha:
prático, direto, cancelamento tranquilo. Consequência aceita: **tudo passa a depender de retenção.**

**Anual sem parecer contrato.** Nunca usar "contrato" nem "fidelidade": chamar de plano anual.
Oferecer **no fim do teste de 7 dias**, não na entrada, porque é o momento de maior valor
percebido. Duas opções apenas (mensal e anual), desconto sempre em meses ("2 meses grátis"), nunca
em porcentagem. **Anual parcelado no cartão com antecipação no Asaas** resolve o conflito de caixa:
o cliente paga mensal, o dono recebe quase tudo agora (conferir a taxa de antecipação).

**Canal por filiado, com cupom.** Pessoas com autoridade sobre a decisão (contador, representante
que visita o comércio, agência de tráfego local), não com audiência. Regras:
- **Desconto é de aquisição, comissão é de canal.** Desconto vale UMA vez (1º mês); comissão é
  recorrente. Dar os dois de forma recorrente derruba a margem de 80% para 44%.
- **Comissão recorrente enquanto o cliente ficar.** 20% deixa R$ 118 por cliente (60%), 25% deixa
  R$ 108 (55%), 30% deixa R$ 98 (50%). Referência de mercado já registrada neste repo: RD Station
  paga 20% por 12 meses e ChatGuru até 20% de MRR, então 25% é prêmio consciente.
- **Pagar a partir do 2º mês pago**, não do cadastro.
- **O filiado vende, nós atendemos.** Programa de afiliado morre quando o parceiro vira suporte.
- **Não construir painel de afiliado.** Recrutar 5 pessoas e tocar em planilha e Pix. Painel só
  quando houver 15 parceiros ativos.
- Falta no produto: **campo de cupom no `/cadastro`** e **coluna de origem em `clients`**
  (`referral_code`), senão não há como resolver disputa de atribuição.

**Revenda (empresa de TI que põe margem por cima) é OUTRO negócio, e fica para depois.** No filiado
o cliente é nosso; na revenda o cliente é do parceiro e sai junto com ele. Revenda exige decidir
dono da conta, suporte de primeiro nível e preço mínimo, e hoje não existe marca branca nem gestão
de subconta. Decidir de propósito, não por acidente.

**Isca de prospecção: auditoria de atendimento.** Mandar 3 mensagens (manhã, tarde, noite) no
WhatsApp de 20 comércios da cidade, anotar se respondeu e em quanto tempo, e entregar a folha sem
vender nada. Derruba a objeção "eu já atendo bem" com o dado do próprio dono, não exige aparecer em
vídeo e não exige time comercial. ⚠️ **Contato manual e individual. Nunca virar disparo em massa: a
conexão é QR e volume automatizado ali é o cenário de banimento.**

**Prova social sem o dono aparecer:** número público onde qualquer um conversa com um agente (o
produto é a demo), print de conversa real com o horário visível, número extraído do painel,
depoimento em **áudio** de WhatsApp (o ICP não grava vídeo mas manda áudio o dia inteiro), e estudo
de caso de uma página que o parceiro possa encaminhar.

**Comunicação vertical, produto horizontal.** Uma página por segmento (clínica, salão, ótica), com
o mesmo produto, mesmo preço e mesmo agente atrás. Custa horas e é a maior alavanca de conversão
disponível. Não divide o roadmap.

**Não fazer agora:** anúncio pago (ticket de R$ 197 sem funil nem time para converter), SEO
nacional (12 meses e concorrente com time de conteúdo), plano gratuito (custo variável de IA sem
receita), licença vitalícia ou AppSumo (mata a recorrência e o custo de IA fica para sempre),
mercado internacional (produto amarrado a WhatsApp BR e Asaas).

### Retenção: o resumo mensal é estrutural, não enfeite

Sem taxa de entrada e sem fidelidade, a única coisa que segura o cliente é ele **ver** o valor. E o
valor deste produto é invisível por natureza: o dono vê a IA respondendo no celular dele e acha
normal, porque ninguém conta o que não deu trabalho.

O cálculo já existe em `lib/valor.ts` e aparece no `/painel` e no passo de cancelar. **Falta o
canal:** uma mensagem no WhatsApp do dono, uma vez por mês, com a frase pronta ("em outubro seu
atendimento respondeu 213 mensagens fora do horário, 47 delas depois das 22h").

⚠️ Isso **não é** o B-6 removido do roadmap. Aquele era notificação por lead, que vira ruído. Este
é um resumo por mês, que vira fatura justificada. O mesmo número é a melhor peça de prova social
que existe para vender.

### ⚠️ Correções de rumo desta conversa

Recomendações dadas em 21/08 que colidem com decisões já fechadas em 13/08 e que **não valem**:
funil múltiplo (descartado), relatório por atendente (descartado), atribuição travada por plano
(não é travada) e cobrar taxa de implantação (o dono decidiu não cobrar).

E uma correção de produto para material de venda: **não existe agenda.** O `action: "agendar"`
captura dia e período, avisa um grupo e passa para humano. Sem calendário, sem slot, sem
confirmação. Prometer "agenda" para clínica e salão é a promessa mais perigosa possível aqui.

## Não construir (nenhuma fase por ora)

- **Disparo em massa e campanha ativa sobre QR** (queima o número). ⚠️ Campanhas foram avaliadas em
  26/08 e ficam FORA: o dono quer o recurso para ele, mas não para a base, exatamente por causa do
  bloqueio. Só volta com API Oficial, onde é legal e paga.
- **Construtor visual de automação** (vira produto de consultoria). Avaliado em 26/08 contra o que o
  mercado faz (BotConversa, Atendente.AI, Meets, Ubli e NextFlow todos têm) e **recusado**, por três
  motivos: as reclamações de mercado são justamente sobre isso (Blip descrito como "emaranhado de
  setas", Kommo exigindo agência para configurar automação); contradiz o diferencial, porque fluxo é
  o paradigma pré-IA e oferecer os dois admite que a IA não dá conta; e não há gente para sustentar
  produto que exige consultoria.
  **O que fica no lugar, como futuro:** automações **prontas e descritivas**, que o dono liga numa
  chave e preenche 2 ou 3 campos. É o modelo do Intercom Fin (regras em texto, núcleo travado) e o
  que a Decagon vende como categoria. Entra no menu como "Em breve" para não se perder, sem data.
- Múltiplos números por conta. White label. Gestão de equipe complexa.

> ⚠️ **Agenda saiu desta lista em 26/08** e virou o próximo passo. Ver "Próxima rodada" no topo.

## Métricas de progresso

1. Linhas ❌ da matriz fechadas.
2. Dívidas de arquitetura pagas.
3. Agente da OBS operando sem intervenção por semana.
4. Tempo do zero até um tenant novo atender (alvo Fase 4: menos de 5 min sozinho).
