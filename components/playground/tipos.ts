import type { TurnDiagnostics } from "@/lib/agent-diagnostics";
import type { AgentConfig } from "@/lib/agent-prompt";
import type { Handoff } from "../HandoffCard";

export interface PlaygroundTurn {
  /**
   * `marco` = linha que atravessa a conversa (pedido fechado ou "o time
   * assumiu"); não vai ao agente. `time` = resposta do time pela caixa de
   * escrita, como no atendimento.
   */
  role: "user" | "assistant" | "marco" | "time";
  /** O que vai no histórico do agente. No áudio, é a transcrição. */
  content: string;
  diag?: TurnDiagnostics;
  /**
   * Resposta do agente em BALÕES separados, como chega no WhatsApp (o n8n manda
   * cada item de `messages` como uma mensagem). Revelados um de cada vez, com o
   * "digitando" entre eles. `content` continua sendo a junção, porque o
   * histórico que o agente lê trata o turno como um bloco só.
   */
  partes?: string[];
  /** Mensagem de voz gravada na bancada. */
  audio?: { url: string; segundos: number; transcrevendo?: boolean };
  /** Só em `marco`: o pedido de ajuda que fechou. */
  pedido?: Handoff;
  /** Só em `marco` sem pedido: o texto do selo ("O time assumiu a conversa"). */
  rotulo?: string;
}

/**
 * Configuração que a pessoa está EDITANDO no formulário, enviada em cada turno.
 * Sem ela a bancada testa a configuração salva (comportamento antigo).
 *
 * Vai CRUA, e não compilada: quem monta a persona é o servidor, que recola o
 * rabo invariante da base. Persona final vinda do browser poderia chegar sem o
 * contrato de saída, e aí o teste mentiria sobre o agente real.
 */
export type ConfiguracaoEmEdicao =
  | { mode: "guiado"; config: AgentConfig }
  | { mode: "avancado"; persona: string; handoffNotice: string };

export interface ApiResult {
  output: {
    messages: string[];
    action: string;
    summary: string;
    preferencia_horario: string;
    pedido_novo?: boolean;
  };
  diagnostics: TurnDiagnostics;
}
