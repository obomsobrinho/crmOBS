"use client";

import { useRef, useState } from "react";
import { Send, RotateCcw, Sparkles, FlaskConical } from "lucide-react";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";

// Bancada de teste do agente (dono-only). Fala direto com o cérebro REAL via
// /api/playground (dryRun): nada é enviado no WhatsApp, nada é gravado, o card
// NÃO é movido de verdade (só mostra o estágio que moveria). Painel esquerdo =
// Conversa; painel direito = Diagnóstico do turno (handoff / classificação /
// resumo). Botão resetar limpa tudo e começa do zero.

export interface PlaygroundTurn {
  role: "user" | "assistant";
  content: string;
  diag?: TurnDiagnostics;
}

interface ApiResult {
  output: { messages: string[]; action: string; summary: string; preferencia_horario: string };
  diagnostics: TurnDiagnostics;
}

export default function Playground({
  stageNames,
  initialTurns = [],
  initialStage = null,
}: {
  // key -> nome do estágio, para rotular o "estágio que moveria".
  stageNames: Record<string, string>;
  // Só para o /design: começa com uma conversa de exemplo.
  initialTurns?: PlaygroundTurn[];
  initialStage?: string | null;
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
      }),
    });
    const data = (await res.json()) as ApiResult & { error?: string };
    if (!res.ok) throw new Error(data.error || "falha ao falar com o agente");
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

  function reset() {
    setTurns([]);
    setInput("");
    setCoachDraft("");
    setError(null);
    setSimStage(null);
    setSimStageSource(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical size={20} className="text-accent" />
            <h1 className="font-display text-xl font-bold">Playground</h1>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Converse com a IA como se fosse um cliente. Nada é enviado no WhatsApp
            e nada é gravado.
          </p>
        </div>
        <button
          onClick={reset}
          disabled={turns.length === 0 && !simStage}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink disabled:opacity-50"
        >
          <RotateCcw size={14} />
          Resetar
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* ESQUERDA: Conversa */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-surface">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-dim">
                Mande a primeira mensagem para testar o atendimento da IA.
              </div>
            ) : (
              turns.map((t, i) => {
                // Handoff silencioso: a IA não envia nada, só abre o handoff.
                if (t.role === "assistant" && !t.content.trim()) {
                  return (
                    <div key={i} className="flex justify-center">
                      <div className="rounded-full bg-[var(--warn-bg)] px-3 py-1 text-[12px] text-warn">
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
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                        t.role === "user"
                          ? "bg-accent text-white"
                          : "bg-panel text-ink"
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
              <textarea
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
                className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send size={16} />
              </button>
            </div>
            {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
          </div>
        </div>

        {/* DIREITA: Diagnóstico do turno. Handoff + Classificação lado a lado
            (mesma altura), Resumo full width embaixo. */}
        <div className="flex w-[620px] shrink-0 flex-col gap-3 overflow-y-auto xl:w-[720px]">
          <div className="grid grid-cols-2 items-stretch gap-3">
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
          </div>
          <SummaryPanel diag={lastDiag} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
        {title}
      </div>
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
          <div className="rounded-lg bg-[var(--warn-bg)] px-3 py-2.5">
            <div className="text-[12.5px] font-medium text-warn">
              {diag!.guardrail.blocked
                ? "O guardrail segurou a resposta"
                : "A IA abriu handoff"}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-ink">
              {diag!.guardrail.blocked
                ? diag!.guardrail.reason
                : diag!.summary || actionLabel(diag!.action)}
            </p>
            {diag!.guardrail.blocked && diag!.guardrail.draft && (
              <p className="mt-1.5 text-[12px] italic leading-snug text-ink-muted">
                Ia dizer: {diag!.guardrail.draft}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-panel px-3 py-2.5 text-[13px] text-ink-muted">
            {diag
              ? "Nenhum handoff neste turno. A IA seguiu sozinha."
              : "Nenhum handoff aberto. Quando a IA precisar de um humano, aparece aqui pra você orientar ou assumir."}
          </div>
        )}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
            <Sparkles size={12} className="text-ia" />
            Orientar a IA
          </div>
          <textarea
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
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none transition-colors focus:border-line-strong disabled:opacity-50"
          />
          <button
            onClick={onCoach}
            disabled={!open || !coachDraft.trim() || sending || !canCoach}
            className="btn-primary mt-2 w-full rounded-lg px-3 py-2 text-[13px] font-medium transition disabled:opacity-50"
          >
            {sending ? "..." : "Orientar e responder"}
          </button>
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
      <div className="space-y-3 text-[13px]">
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
          <div className="text-[11px] uppercase tracking-wide text-ink-dim">
            Base de conhecimento
          </div>
          {!diag ? (
            <div className="text-[13px] text-ink-muted">aguardando o 1º turno</div>
          ) : !diag.ragSearched ? (
            <div className="text-[13px] text-ink-muted">
              Sem base cadastrada neste tenant.
            </div>
          ) : diag.ragMatches.length === 0 ? (
            <div className="text-[13px] text-ink-muted">
              Buscou, nada relevante voltou.
            </div>
          ) : (
            <ul className="mt-1 space-y-1">
              {diag.ragMatches.map((m, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-2 rounded-lg bg-panel px-2.5 py-1.5"
                  title={m.preview}
                >
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-ia">
                    {(m.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="line-clamp-1 text-[12px] leading-snug text-ink-muted">
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
      <div className="space-y-3 text-[13px]">
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
      <div className="text-[11px] uppercase tracking-wide text-ink-dim">{label}</div>
      <div className="text-[13px] font-medium text-ink">{value}</div>
    </div>
  );
}
