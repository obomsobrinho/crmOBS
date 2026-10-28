// Diagnóstico de um turno do agente. Preenchido pelo /api/agent (via
// lib/agent-turn) e consumido pelo playground (bancada de teste). Módulo puro
// (sem server-only): pode ser importado num client component para tipar a
// resposta. É aditivo ao contrato do n8n (que só lê `output`).

// Um trecho recuperado da base de conhecimento (RAG), com sua similaridade.
export interface RagMatchDiag {
  similarity: number; // 0 a 1 (1 = mais parecido)
  preview: string; // começo do trecho, truncado para exibir
}

// Resultado do guardrail (checagem da resposta pronta antes de enviar).
export interface GuardrailDiag {
  blocked: boolean; // true = a resposta foi reprovada e degradada com segurança
  reason: string | null; // motivo curto (pt-BR) quando blocked
  draft: string | null; // a resposta original retida (só para exibir no teste)
}

/**
 * De onde veio o prompt que o modelo recebeu. `montada` é o caminho normal desde
 * 17/09/2026 (base de hoje + configuração do tenant, montadas na leitura).
 * ⚠️ `salva` em produção é ALARME, não informação: significa que a montagem
 * falhou e o tenant voltou a servir o texto congelado do último Salvar, que é
 * exatamente o problema que a montagem na leitura veio resolver.
 * `montada_longa` passou do `LIMITS.persona` que o Salvar recusaria, e
 * `nenhuma` é o turno silenciado, que não chega a montar prompt nenhum.
 */
export type PersonaOrigem =
  | "nenhuma"
  | "montada"
  | "montada_longa"
  | "salva"
  | "fallback"
  | "override";

export interface TurnDiagnostics {
  personaOrigem: PersonaOrigem;
  latencyMs: number; // tempo do turno (retrieval + modelo + guardrail)
  action: string; // espelha output.action
  summary: string; // espelha output.summary
  preferenciaHorario: string; // espelha output.preferencia_horario
  /** Motivo do pedido de ajuda (lib/motivos.ts); null fora de pausar. */
  motivo?: string | null;
  ragSearched: boolean; // havia base e a pergunta foi embedada
  ragMatches: RagMatchDiag[]; // trechos recuperados, com similaridade
  stageWouldMove: string | null; // estágio (key) que a IA moveria; null = não move
  guardrail: GuardrailDiag;
  handoffOpened: boolean; // o turno abriu handoff (pausar/agendar ou guardrail)
  // O turno pôs um pedido NA FILA (29/09/2026). É a MESMA regra do atendimento
  // (`entraNaFila` em lib/agent-turn.ts, com a rede de segurança), calculada
  // também no dryRun para a bancada mostrar o pedido como ele apareceria.
  pedidoNaFila?: boolean;
  // true = o turno reescreveu o resumo de um pedido EM ABERTO (08/10/2026,
  // `atualizacaoDoPedido`, lib/fila-de-pedidos.ts; no dryRun, só diria).
  // Ausente = nada a atualizar. Nunca gera aviso.
  pedidoAtualizado?: boolean;
  // true = o agente não está publicado, então o turno foi silenciado sem chamar
  // o modelo (a mensagem do cliente continua sendo gravada pelo n8n).
  notPublished?: boolean;
  // true = a assinatura do tenant não está em dia: mesmo silêncio, mesmo motivo
  // (nada de token gasto), e a conversa continua entrando no inbox.
  subscriptionBlocked?: boolean;
  // true = a mensagem veio do NÚMERO DE AVISOS do time (clients.notify_group_jid):
  // silêncio, porque ali fala o time, não um cliente (lib/avisos.ts).
  numeroDeAvisos?: boolean;
  // true = a empresa atingiu o teto de tokens de IA do mês (lib/custo-ia.ts):
  // silêncio antes do modelo, como a chave desligada, também na bancada.
  limiteIa?: boolean;
  // true = a conta foi DESATIVADA pelo dono do produto (central "Clientes"):
  // silêncio antes de tudo, também na bancada.
  contaDesativada?: boolean;
  // true = o turno abriu pedido de ajuda e o aviso ao time foi AGENDADO (sai
  // depois da resposta, por `after`). Se a mensagem saiu mesmo, só o log diz.
  avisoAgendado?: boolean;
  // AGENDA PRÓPRIA (28/10/2026, lib/agenda.ts): quantos horários o turno
  // ofereceu, o que o código decidiu com a saída do modelo e o resultado. No
  // dryRun só diz o que marcaria. Ausente = agenda desligada nesta conversa.
  agenda?: {
    /** Quantos horários o código ofereceu neste turno (consulta). */
    ofertas?: number;
    decisao: "nada" | "consultar" | "marcar" | "remarcar" | "cancelar" | "confirmar" | "escalar" | "indisponivel" | "invalido";
    /** "quinta, 30/10, às 10h30 (Avaliação)" quando marcou (ou marcaria). */
    marcado?: string;
    /** O horário não valia mais (conflito) ou o banco falhou: a resposta foi trocada. */
    falhou?: "conflito" | "erro";
  };
}
