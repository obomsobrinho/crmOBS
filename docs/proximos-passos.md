# Próximos passos de desenvolvimento

Roadmap de produto. Análise de mercado completa em [estrategia-2026-07.md](estrategia-2026-07.md).

Última revisão: 06/08/2026.

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
- [ ] Limpar resíduo hardcoded do nó `Rotas` no n8n (número pessoal, `TreinoIA1212:`).
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
> mesmo de hoje). **App pronto e verificado; cutover do n8n pendente** de: `OPENAI_API_KEY`, uma
> URL pública do app e confirmação. Memória: reconstruída de `chat_messages` (client_id + phone).

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
      injeta trechos no system). **Sem n8n** (o retrieval mudou de lado com o cérebro). Falta testar
      ponta a ponta com `OPENAI_API_KEY`.
- [x] Controle de alucinação (a IA só responde do conteúdo cadastrado, admite quando não sabe).
      Seção invariante FONTES E HONESTIDADE em buildPersona.
- [x] Presets de prompt por segmento (lib/agent-presets.ts, seletor no /agente).
- [ ] Notificar o dono no WhatsApp quando qualifica um lead. ⚠️ toca o n8n.

> Playground (testar o agente dentro do CRM) foi **descartado** por decisão do usuário: o
> agente real já funciona e serve de teste; a tela seria superfície a mais sem ganho no fluxo dele.

**Fase 3 — CRM**
- [ ] Pipeline Kanban com estágios configuráveis (`conversations.stage`).
- [ ] A IA move o card sozinha (usa a qualificação da Fase 2).
- [ ] Dashboard mínimo (4 números).

**Fase 4 — Comercializável**
- [ ] Cadastro self-service, recuperação de senha.
- [ ] Cobrança por assento (Asaas ou Stripe).
- [ ] Onboarding guiado + aviso de risco de conexão.
- [ ] Deploy, domínio, trocar o nome.

**Fase 5 — Expansão (só depois de ter cliente)**
- [ ] Multicanal (Instagram, Messenger).
- [ ] API Oficial como opção.

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
