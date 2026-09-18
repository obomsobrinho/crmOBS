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
  ragSearched: boolean; // havia base e a pergunta foi embedada
  ragMatches: RagMatchDiag[]; // trechos recuperados, com similaridade
  stageWouldMove: string | null; // estágio (key) que a IA moveria; null = não move
  guardrail: GuardrailDiag;
  handoffOpened: boolean; // o turno abriu handoff (pausar/agendar ou guardrail)
  // true = o agente não está publicado, então o turno foi silenciado sem chamar
  // o modelo (a mensagem do cliente continua sendo gravada pelo n8n).
  notPublished?: boolean;
  // true = a assinatura do tenant não está em dia: mesmo silêncio, mesmo motivo
  // (nada de token gasto), e a conversa continua entrando no inbox.
  subscriptionBlocked?: boolean;
}
