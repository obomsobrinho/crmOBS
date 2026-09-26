"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Pause, Play, Sparkles, Trash2 } from "lucide-react";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";
import type { AgentConfig } from "@/lib/agent-prompt";
import { Button } from "@/components/ui/button";
import {
  AreaRolavel,
  DISSOLVER_BALAO,
} from "@/components/ui/dissolver-rolagem";
import { Textarea } from "@/components/ui/textarea";
import FundoRede from "./FundoRede";
import { cn } from "@/lib/utils";

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
}

/** Pausa entre um balão e o próximo, pelo tamanho do texto: nem instantâneo
 *  (lê como formulário), nem lento a ponto de parecer travado. */
function pausaDigitando(texto: string): number {
  return Math.min(1800, Math.max(700, texto.length * 22));
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Teto da gravação. Dois minutos de opus ficam longe do limite de corpo. */
const GRAVACAO_MAX_S = 120;

// As mesmas peles do balão da tela de Conversas (`PELE` em Thread.tsx): o
// cliente é o balão recebido, o agente é o da IA.
const PELE_CLIENTE =
  "border-line-soft bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)] shadow-[var(--bubble-shadow)]";
const PELE_IA = "border-brand-line bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]";

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
  diagnostico = true,
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
  /**
   * `false` na montagem (26/09/2026, pedido do dono): lá a bancada mora DENTRO
   * do passo, e quem monta a conta pela primeira vez quer ver o agente
   * responder, não RAG, estágio e orientação. Sem o diagnóstico sobra só a
   * conversa, que cabe na coluna de 672px do assistente. No `/agente` ele
   * continua, porque ali quem testa está ajustando.
   */
  diagnostico?: boolean;
}) {
  const [turns, setTurns] = useState<PlaygroundTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [coachDraft, setCoachDraft] = useState("");
  const [sending, setSending] = useState(false);
  // "Digitando…": o agente está pensando ou ainda vai mandar outro balão.
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abaCel, setAbaCel] = useState<"conversa" | "diagnostico">("conversa");
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

  /**
   * Pede a resposta ao agente e a revela como no WhatsApp: "digitando" enquanto
   * o modelo pensa, e cada item de `messages` num balão próprio, com uma pausa
   * de digitação entre eles. Lança se o agente falhar, para quem chamou desfazer
   * a mensagem do cliente.
   */
  async function responder(
    message: string,
    history: { role: string; content: string }[]
  ) {
    setPensando(true);
    scrollDown();
    let res: ApiResult;
    try {
      res = await callApi({ message, history });
    } finally {
      setPensando(false);
    }
    const { output, diagnostics } = res;
    const content = output.messages.join("\n");
    const partes = output.messages.filter((m) => m.trim());
    applyStage(diagnostics);
    setTurns((prev) => [
      ...prev,
      { role: "assistant", content, diag: diagnostics, partes: partes.slice(0, 1) },
    ]);
    scrollDown();
    for (let i = 1; i < partes.length; i++) {
      setPensando(true);
      scrollDown();
      await esperar(pausaDigitando(partes[i]));
      setPensando(false);
      setTurns((prev) => {
        const ultimo = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...ultimo, partes: partes.slice(0, i + 1) }];
      });
      scrollDown();
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
      await responder(text, history);
    } catch (e) {
      // Desfaz a mensagem otimista e devolve o texto para o campo.
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
      setError(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setSending(false);
    }
  }

  // ── ÁUDIO (26/09/2026, pedido do dono) ──
  // Grava no navegador, transcreve no servidor e manda o TEXTO ao agente, que é
  // exatamente o que o n8n faz com áudio do WhatsApp (nó "Whisper"). A
  // transcrição aparece embaixo do balão: é o que o agente "ouviu", e sem isso
  // uma resposta estranha pareceria defeito do agente quando foi do áudio.
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const descartarRef = useRef(false);
  const segundosRef = useRef(0);

  function soltarMicrofone() {
    if (relogioRef.current) clearInterval(relogioRef.current);
    relogioRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Fechar o painel no meio de uma gravação não pode deixar o microfone aceso.
  useEffect(() => () => soltarMicrofone(), []);

  async function iniciarGravacao() {
    if (sending || gravando) return;
    setError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Este navegador não grava áudio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Sem permissão para usar o microfone.");
      return;
    }
    // Chrome grava webm, Safari grava mp4; a OpenAI aceita os dois.
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (m) => MediaRecorder.isTypeSupported(m)
    );
    const gravador = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    streamRef.current = stream;
    gravadorRef.current = gravador;
    pedacosRef.current = [];
    descartarRef.current = false;
    segundosRef.current = 0;
    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };
    gravador.onstop = () => {
      soltarMicrofone();
      setGravando(false);
      if (descartarRef.current) return;
      const tipo = gravador.mimeType || mime || "audio/webm";
      const blob = new Blob(pedacosRef.current, { type: tipo });
      void enviarAudio(blob, Math.max(1, segundosRef.current));
    };
    gravador.start();
    setSegundos(0);
    setGravando(true);
    relogioRef.current = setInterval(() => {
      segundosRef.current += 1;
      setSegundos(segundosRef.current);
      if (segundosRef.current >= GRAVACAO_MAX_S) gravador.stop();
    }, 1000);
  }

  function pararGravacao(enviar: boolean) {
    descartarRef.current = !enviar;
    if (gravadorRef.current?.state === "recording") gravadorRef.current.stop();
  }

  async function enviarAudio(blob: Blob, duracao: number) {
    setSending(true);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    const url = URL.createObjectURL(blob);
    setTurns((prev) => [
      ...prev,
      { role: "user", content: "", audio: { url, segundos: duracao, transcrevendo: true } },
    ]);
    scrollDown();
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `audio.${ext}`);
      const res = await fetch("/api/playground/transcrever", { method: "POST", body: form });
      const data = (await res.json()) as { texto?: string; error?: string };
      if (!res.ok || !data.texto) {
        throw new Error(data.error ?? "não foi possível transcrever o áudio");
      }
      const texto = data.texto;
      setTurns((prev) => {
        const ultimo = prev[prev.length - 1];
        return [
          ...prev.slice(0, -1),
          { ...ultimo, content: texto, audio: { url, segundos: duracao } },
        ];
      });
      await responder(texto, history);
    } catch (e) {
      setTurns((prev) => prev.slice(0, -1));
      URL.revokeObjectURL(url);
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
      {/* CELULAR (plano do mobile, fase 4): conversa e diagnóstico não cabem
          lado a lado nem empilhados (a conversa ficaria com dois dedos de
          altura), então viram duas ABAS. No desktop continuam lado a lado. */}
      <div
        role="tablist"
        aria-label="Bancada"
        className={cn(
          "mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-lg border border-line bg-[var(--chip-bg)] p-1 md:hidden",
          !diagnostico && "hidden"
        )}
      >
        {([
          ["conversa", "Conversa"],
          ["diagnostico", "Diagnóstico"],
        ] as const).map(([k, rotulo]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={abaCel === k}
            onClick={() => setAbaCel(k)}
            className={cn(
              "h-10 rounded-md text-apoio font-semibold transition-colors",
              abaCel === k
                ? "bg-[var(--chip-ativo-bg)] text-[var(--chip-ativo-fg)]"
                : "text-ink-2"
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {/* O botão Resetar ficava aqui, numa linha própria acima da conversa, e era
          ele que abria o vão grande embaixo do cabeçalho do painel. Subiu para o
          cabeçalho do `AgentTestDrawer`, que reseta remontando este componente
          por `key`: remontar já devolve turnos, entrada, orientação e estágio
          simulado ao estado inicial, o que dispensa expor a função para fora. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* ESQUERDA: Conversa. `bg-msg` é a superfície de área de mensagens, a
            mesma da tela de atendimento: aqui também é onde os balões moram. */}
        {/* ⚠️ VESTIDA COMO A TELA DE CONVERSAS (26/09/2026, pedido do dono): o
            mesmo fundo de rede, as mesmas peles de balão (`PELE` do Thread) e a
            mesma moldura da caixa de escrita. A bancada é onde a pessoa vê o
            agente pela primeira vez, e ela tem que parecer a conversa de verdade
            que vem depois, não um formulário. Sem modo de nota nem orientação:
            aqui não existe handoff para orientar. */}
        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-msg",
            diagnostico && abaCel !== "conversa" && "max-md:hidden"
          )}
        >
          <FundoRede />
          {/* A bancada tem os mesmos baloes da conversa, entao o mesmo degrau. */}
          <AreaRolavel
            ref={scrollRef}
            tamanho={DISSOLVER_BALAO}
            className="relative flex-1 space-y-3 p-4"
          >
            {turns.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-apoio text-ink-3">
                Mande uma mensagem ou um áudio, como um cliente faria.
              </div>
            ) : (
              turns.map((t, i) => {
                // Handoff silencioso: a IA não envia nada, só abre o handoff.
                if (t.role === "assistant" && !t.content.trim()) {
                  return (
                    <div key={i} className="flex justify-center">
                      <div className="rounded-full bg-warn-surface px-3 py-1 text-legenda text-warn-ink">
                        {diagnostico
                          ? "A IA abriu handoff e não respondeu. Oriente ao lado ou assuma a conversa."
                          : "A IA passou esta conversa para você."}
                      </div>
                    </div>
                  );
                }
                if (t.audio) {
                  return (
                    <div key={i} className="msg-in flex flex-col items-end gap-1">
                      <BalaoAudio url={t.audio.url} segundos={t.audio.segundos} />
                      {/* O que o agente "ouviu". Sem isso uma resposta torta
                          pareceria defeito dele quando o erro foi do áudio. */}
                      <p
                        data-slot="transcricao"
                        className="max-w-[80%] text-right text-legenda text-ink-3"
                      >
                        {t.audio.transcrevendo
                          ? "Transcrevendo o áudio…"
                          : `Transcrição: “${t.content}”`}
                      </p>
                    </div>
                  );
                }
                // Um balão por mensagem, como chega no WhatsApp. Turno antigo
                // (ou vindo do coach) sem `partes` cai no texto inteiro.
                const baloes =
                  t.role === "assistant" && t.partes ? t.partes : [t.content];
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-1.5",
                      t.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    {baloes.map((texto, j) => (
                      // As peles do Thread: quem testa é o CLIENTE (balão
                      // recebido, branco com relevo) e o agente é a IA (roxo
                      // claro). O canto recortado aponta para quem falou.
                      <div
                        key={j}
                        className={cn(
                          "msg-in max-w-[80%] whitespace-pre-wrap break-words border px-3 py-2 text-corpo",
                          t.role === "user"
                            ? cn("rounded-[16px_4px_16px_16px]", PELE_CLIENTE)
                            : cn("rounded-[4px_16px_16px_16px]", PELE_IA)
                        )}
                      >
                        {texto}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
            {pensando && (
              <div className="flex justify-start">
                <div
                  data-slot="digitando"
                  role="status"
                  aria-label="Digitando"
                  className={cn(
                    "digitando msg-in flex items-center gap-1 rounded-[4px_16px_16px_16px] border px-3.5 py-3",
                    PELE_IA
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  <span className="size-1.5 rounded-full bg-current" />
                  <span className="size-1.5 rounded-full bg-current" />
                </div>
              </div>
            )}
          </AreaRolavel>
          {/* A caixa de escrita no molde da tela de Conversas (`MessageComposer`):
              moldura de 16px com relevo sobre o fundo da conversa, campo limpo
              que cresce com o texto e o botão redondo à direita. Aqui não há os
              modos de nota e orientação, só o de responder, então a moldura é
              da cor da marca e não muda. */}
          <div className="relative shrink-0 px-3 pb-3 pt-2">
            <div className="rounded-[16px] border border-brand-line bg-raised shadow-[var(--panel-shadow)]">
              {gravando ? (
                // Gravando: o campo dá lugar à barra do WhatsApp, com o tempo
                // correndo, descartar à esquerda e enviar à direita.
                <div data-slot="gravando" className="flex items-center gap-2 p-2">
                  <Button
                    variant="ghost"
                    size="none"
                    onClick={() => pararGravacao(false)}
                    className="size-9 justify-center rounded-full text-ink-2 max-md:size-10"
                    aria-label="Descartar áudio"
                  >
                    <Trash2 size={16} />
                  </Button>
                  <span className="gravando size-2.5 rounded-full bg-danger" aria-hidden />
                  <span className="flex-1 text-corpo tabular-nums text-ink-2">
                    Gravando {mmss(segundos)}
                  </span>
                  <Button
                    size="none"
                    onClick={() => pararGravacao(true)}
                    className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                    aria-label="Enviar áudio"
                  >
                    <ArrowUp size={18} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2 p-2">
                  <Textarea
                    variant="limpo"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    aria-label="Mensagem de teste"
                    placeholder="Escreva uma mensagem"
                    className="max-h-[132px] min-h-9 min-w-0 flex-1 px-2 py-2 text-corpo [field-sizing:content]"
                  />
                  {/* Como no WhatsApp: campo vazio mostra o microfone, com texto
                      vira enviar. */}
                  {input.trim() ? (
                    <Button
                      size="none"
                      onClick={sendMessage}
                      disabled={sending}
                      className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                      aria-label="Enviar"
                    >
                      <ArrowUp size={18} />
                    </Button>
                  ) : (
                    <Button
                      size="none"
                      onClick={() => void iniciarGravacao()}
                      disabled={sending}
                      className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                      aria-label="Gravar áudio"
                    >
                      <Mic size={17} />
                    </Button>
                  )}
                </div>
              )}
            </div>
            {error && (
              <p className="mt-1.5 px-1 text-legenda text-danger-ink">{error}</p>
            )}
          </div>
        </div>

        {/* DIREITA: Diagnóstico do turno, em coluna única. Eram duas colunas
            quando isto era tela cheia; dentro do painel lateral a largura é
            menor, e dois painéis lado a lado viravam duas colunas estreitas. */}
        {diagnostico && (
        <AreaRolavel
          className={cn(
            "flex shrink-0 flex-col gap-3 lg:w-[380px] max-md:min-h-0 max-md:flex-1",
            abaCel !== "diagnostico" && "max-md:hidden"
          )}
        >
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
        </AreaRolavel>
        )}
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
          <div className="rounded-lg bg-raised px-3 py-2.5 text-apoio text-ink-2">
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
            carregando={sending && coachDraft.trim() !== ""}
            disabled={!open || !coachDraft.trim() || sending || !canCoach}
            className="mt-2 w-full justify-center"
          >
            {sending && coachDraft.trim() ? "Orientando…" : "Orientar e responder"}
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
                  className="flex items-baseline gap-2 rounded-lg bg-raised px-2.5 py-1.5"
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

/** Balão de mensagem de voz, do lado de quem mandou. Toca o próprio áudio. */
function BalaoAudio({ url, segundos }: { url: string; segundos: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  return (
    <div
      data-slot="balao-audio"
      className={cn(
        "flex items-center gap-2.5 rounded-[16px_4px_16px_16px] border py-2 pr-3.5 pl-2",
        PELE_CLIENTE
      )}
    >
      <button
        type="button"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-label={tocando ? "Pausar áudio" : "Ouvir áudio"}
      >
        {tocando ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <Mic size={14} aria-hidden />
      <span className="text-apoio tabular-nums">{mmss(segundos)}</span>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
        className="hidden"
      />
    </div>
  );
}
