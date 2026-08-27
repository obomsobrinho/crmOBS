"use client";

import { useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";
import type { AgentConfig } from "@/lib/agent-prompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Bancada de teste do agente (dono-only). Fala direto com o cérebro REAL via
// /api/playground (dryRun): nada é enviado no WhatsApp, nada é gravado, o card
// NÃO é movido de verdade (só mostra o estágio que moveria). Painel esquerdo =
// Conversa; painel direito = Diagnóstico do turno (handoff / classificação /
// resumo). Botão resetar limpa tudo e começa do zero.
//
// Mora dentro do painel lateral do `/agente` (`AgentTestDrawer`), e não em tela
// própria: configurar e testar são a mesma atividade, e o ciclo real é editar,
// testar, voltar, editar. Por isso este componente não desenha título nem
// descrição: quem faz isso é o cabeçalho do painel.

export interface PlaygroundTurn {
  role: "user" | "assistant";
  content: string;
  diag?: TurnDiagnostics;
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

interface ApiResult {
  output: { messages: string[]; action: string; summary: string; preferencia_horario: string };
  diagnostics: TurnDiagnostics;
}

export default function Playground({
  stageNames,
  initialTurns = [],
  initialStage = null,
  configuracao = null,
}: {
  // key -> nome do estágio, para rotular o "estágio que moveria".
  stageNames: Record<string, string>;
  // Só para o /design: começa com uma conversa de exemplo.
  initialTurns?: PlaygroundTurn[];
  initialStage?: string | null;
  /**
   * Configuração em edição. Lida na hora de cada turno (e não copiada para o
   * estado), então uma alteração no formulário vale no turno seguinte sem
   * precisar fechar e reabrir o painel.
   */
  configuracao?: ConfiguracaoEmEdicao | null;
}) {
  const [turns, setTurns] = useState<PlaygroundTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [coachDraft, setCoachDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simStage, setSimStage] = useState<string | null>(initialStage);
  const [simStageSource, setSimStageSource] = useState<string | null>(
    initialStage ? "ia" : null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastUserIndex = (() => {
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "user") return i;
    return -1;
  })();
  const lastDiag =
    turns.length > 0 && turns[turns.length - 1].role === "assistant"
      ? turns[turns.length - 1].diag ?? null
      : null;

  const scrollDown = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  async function callApi(payload: {
    message: string;
    history: { role: string; content: string }[];
    instruction?: string | null;
  }): Promise<ApiResult> {
    const res = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        currentStage: simStage,
        stageSource: simStageSource,
        // Espalhado por último e só quando existe: sem configuração em edição o
        // corpo fica idêntico ao de antes e o servidor usa a persona salva.
        ...(configuracao ?? {}),
      }),
    });
    const data = (await res.json()) as ApiResult & {
      error?: string;
      fields?: Record<string, string>;
    };
    if (!res.ok) {
      // Config incompleta volta com os campos que faltam. Dizer "configuração
      // incompleta" e parar aí obrigaria a pessoa a caçar o campo na mão.
      const faltando = data.fields ? Object.values(data.fields).join(", ") : "";
      throw new Error(
        faltando
          ? `${data.error || "configuração incompleta"}: ${faltando}`
          : data.error || "falha ao falar com o agente"
      );
    }
    return data;
  }

  function applyStage(diag: TurnDiagnostics) {
    if (diag.stageWouldMove) {
      setSimStage(diag.stageWouldMove);
      setSimStageSource("ia");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    scrollDown();
    try {
      const { output, diagnostics } = await callApi({ message: text, history });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: output.messages.join("\n"), diag: diagnostics },
      ]);
      applyStage(diagnostics);
      scrollDown();
    } catch (e) {
      // Desfaz a mensagem otimista e devolve o texto para o campo.
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
      setError(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setSending(false);
    }
  }

  // Orienta a IA (handoff coach) e reexecuta a última pergunta do cliente com a
  // orientação, para ver a IA retomar sozinha, tudo dentro do playground.
  async function coach() {
    const instruction = coachDraft.trim();
    if (!instruction || sending || lastUserIndex < 0) return;
    setError(null);
    setSending(true);
    const lastUserMsg = turns[lastUserIndex].content;
    const history = turns
      .slice(0, lastUserIndex)
      .map((t) => ({ role: t.role, content: t.content }));
    try {
      const { output, diagnostics } = await callApi({
        message: lastUserMsg,
        history,
        instruction,
      });
      setTurns((prev) => [
        ...prev.slice(0, lastUserIndex + 1),
        { role: "assistant", content: output.messages.join("\n"), diag: diagnostics },
      ]);
      setCoachDraft("");
      applyStage(diagnostics);
      scrollDown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* O botão Resetar ficava aqui, numa linha própria acima da conversa, e era
          ele que abria o vão grande embaixo do cabeçalho do painel. Subiu para o
          cabeçalho do `AgentTestDrawer`, que reseta remontando este componente
          por `key`: remontar já devolve turnos, entrada, orientação e estágio
          simulado ao estado inicial, o que dispensa expor a função para fora. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* ESQUERDA: Conversa. `bg-msg` é a superfície de área de mensagens, a
            mesma da tela de atendimento: aqui também é onde os balões moram. */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-msg">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-apoio text-ink-3">
                Mande a primeira mensagem para testar o atendimento da IA.
              </div>
            ) : (
              turns.map((t, i) => {
                // Handoff silencioso: a IA não envia nada, só abre o handoff.
                if (t.role === "assistant" && !t.content.trim()) {
                  return (
                    <div key={i} className="flex justify-center">
                      <div className="rounded-full bg-warn-surface px-3 py-1 text-legenda text-warn-ink">
                        A IA abriu handoff e não respondeu. Oriente ao lado ou
                        assuma a conversa.
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* Par fill/on da marca, e não `bg-accent text-white`: o
                        branco fixo era o único balão do produto que não se
                        adaptava por tema. */}
                    <div
                      className={`max-w-[80%] rounded-xl px-3.5 py-2 text-apoio leading-snug whitespace-pre-wrap ${
                        t.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-conteudo text-ink"
                      }`}
                    >
                      {t.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-line p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={2}
                placeholder="Escreva como um cliente escreveria..."
                className="min-h-0 flex-1 resize-none"
              />
              <Button
                size="none"
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="h-10 w-10 justify-center rounded-lg"
                aria-label="Enviar"
              >
                <Send size={16} />
              </Button>
            </div>
            {error && (
              <p className="mt-1.5 text-legenda text-danger-ink">{error}</p>
            )}
          </div>
        </div>

        {/* DIREITA: Diagnóstico do turno, em coluna única. Eram duas colunas
            quando isto era tela cheia; dentro do painel lateral a largura é
            menor, e dois painéis lado a lado viravam duas colunas estreitas. */}
        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto lg:w-[380px]">
          <ClassificationPanel
            diag={lastDiag}
            simStage={simStage}
            stageNames={stageNames}
          />
          <HandoffPanel
            diag={lastDiag}
            canCoach={lastUserIndex >= 0}
            coachDraft={coachDraft}
            setCoachDraft={setCoachDraft}
            onCoach={coach}
            sending={sending}
          />
          <SummaryPanel diag={lastDiag} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bloco p-4">
      <div className="mb-2.5 text-rotulo uppercase text-ink-3">{title}</div>
      {children}
    </div>
  );
}

function actionLabel(action: string): string {
  if (action === "agendar") return "Marcar conversa com o time";
  if (action === "pausar") return "Pediu uma pessoa do time";
  return "Segue a conversa";
}

function HandoffPanel({
  diag,
  canCoach,
  coachDraft,
  setCoachDraft,
  onCoach,
  sending,
}: {
  diag: TurnDiagnostics | null;
  canCoach: boolean;
  coachDraft: string;
  setCoachDraft: (v: string) => void;
  onCoach: () => void;
  sending: boolean;
}) {
  const open = !!diag?.handoffOpened;
  return (
    <Panel title="Handoff">
      <div className="space-y-2.5">
        {open ? (
          <div className="rounded-lg bg-warn-surface px-3 py-2.5">
            <div className="text-legenda font-semibold text-warn-ink">
              {diag!.guardrail.blocked
                ? "O guardrail segurou a resposta"
                : "A IA abriu handoff"}
            </div>
            <p className="mt-1 text-apoio leading-snug text-ink">
              {diag!.guardrail.blocked
                ? diag!.guardrail.reason
                : diag!.summary || actionLabel(diag!.action)}
            </p>
            {diag!.guardrail.blocked && diag!.guardrail.draft && (
              <p className="mt-1.5 text-legenda leading-snug italic text-ink-2">
                Ia dizer: {diag!.guardrail.draft}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-conteudo px-3 py-2.5 text-apoio text-ink-2">
            {diag
              ? "Nenhum handoff neste turno. A IA seguiu sozinha."
              : "Nenhum handoff aberto. Quando a IA precisar de um humano, aparece aqui pra você orientar ou assumir."}
          </div>
        )}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-legenda text-ink-2">
            <Sparkles size={12} className="text-human-ink" />
            Orientar a IA
          </div>
          <Textarea
            value={coachDraft}
            onChange={(e) => setCoachDraft(e.target.value)}
            rows={3}
            maxLength={800}
            disabled={!open}
            placeholder={
              open
                ? "Ex.: diga que sim, pode vir agora, e peça o nome."
                : "Fica disponível quando a IA abrir um handoff."
            }
            className="resize-none"
          />
          <Button
            size="primary"
            onClick={onCoach}
            disabled={!open || !coachDraft.trim() || sending || !canCoach}
            className="mt-2 w-full justify-center"
          >
            {sending ? "..." : "Orientar e responder"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function ClassificationPanel({
  diag,
  simStage,
  stageNames,
}: {
  diag: TurnDiagnostics | null;
  simStage: string | null;
  stageNames: Record<string, string>;
}) {
  const P = "aguardando";
  const stageLabel = (key: string | null) =>
    key ? stageNames[key] ?? key : null;
  return (
    <Panel title="Classificação">
      <div className="space-y-3 text-apoio">
        <Field label="Ação" value={diag ? actionLabel(diag.action) : P} />
        <Field
          label="Guardrail"
          value={
            !diag
              ? P
              : diag.guardrail.blocked
                ? `Segurou: ${diag.guardrail.reason}`
                : "Passou sem bloqueio"
          }
        />
        <Field
          label="Estágio que moveria"
          value={diag ? stageLabel(diag.stageWouldMove) ?? "não move o card" : P}
        />
        <Field
          label="Estágio atual (simulado)"
          value={stageLabel(simStage) ?? "inicial"}
        />
        <div>
          <div className="text-rotulo uppercase text-ink-3">
            Base de conhecimento
          </div>
          {!diag ? (
            <div className="text-apoio text-ink-2">aguardando o 1º turno</div>
          ) : !diag.ragSearched ? (
            <div className="text-apoio text-ink-2">
              Sem base cadastrada neste tenant.
            </div>
          ) : diag.ragMatches.length === 0 ? (
            <div className="text-apoio text-ink-2">
              Buscou, nada relevante voltou.
            </div>
          ) : (
            <ul className="mt-1 space-y-1">
              {diag.ragMatches.map((m, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-2 rounded-lg bg-conteudo px-2.5 py-1.5"
                  title={m.preview}
                >
                  <span className="shrink-0 text-legenda font-semibold tabular-nums text-human-ink">
                    {(m.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="line-clamp-1 text-legenda leading-snug text-ink-2">
                    {m.preview}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function SummaryPanel({ diag }: { diag: TurnDiagnostics | null }) {
  return (
    <Panel title="Resumo">
      <div className="space-y-3 text-apoio">
        <Field
          label="Resumo do caso"
          value={diag ? diag.summary || "sem resumo" : "aguardando"}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field
            label="Preferência de horário"
            value={
              !diag ? "aguardando" : diag.preferenciaHorario || "não informado"
            }
          />
          <Field
            label="Latência"
            value={
              !diag
                ? "aguardando"
                : diag.latencyMs < 1000
                  ? `${diag.latencyMs} ms`
                  : `${(diag.latencyMs / 1000).toFixed(1)} s`
            }
          />
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-rotulo uppercase text-ink-3">{label}</div>
      <div className="text-apoio font-medium text-ink">{value}</div>
    </div>
  );
}
