"use client";

import { useState } from "react";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";
import type { Handoff } from "../HandoffCard";
import { esperar, historico, pausaDigitando } from "./apoio";
import type { ApiResult, ConfiguracaoEmEdicao, PlaygroundTurn } from "./tipos";
import { useColadoNoFim } from "./useColadoNoFim";
import { useGravadorDeAudio } from "./useGravadorDeAudio";

/**
 * A conversa de teste: os turnos, a chamada ao cérebro em `dryRun`, a revelação
 * balão a balão, os pedidos de ajuda da bancada, o áudio e o estágio simulado.
 * Quem desenha é o `Playground`.
 */
export function useConversaDeTeste({
  initialTurns,
  initialPedidos,
  initialStage,
  configuracao,
}: {
  initialTurns: PlaygroundTurn[];
  initialPedidos: Handoff[];
  initialStage: string | null;
  configuracao: ConfiguracaoEmEdicao | null;
}) {
  const [turns, setTurns] = useState<PlaygroundTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  // PEDIDOS DE AJUDA NA CONVERSA DE TESTE (29/09/2026, pedido do dono: "gap de
  // primeira impressão"). Quando a IA pede ajuda, o pedido aparece aqui como no
  // atendimento de verdade, e a pessoa orienta e vê a IA responder. Fila do mais
  // antigo para o mais novo, igual à caixa de escrita da tela de Conversas.
  const [pedidos, setPedidos] = useState<Handoff[]>(initialPedidos);
  const fila = pedidos.filter((p) => !p.closedAt);
  const pedidoAtual = fila[0] ?? null;
  // Respondeu como time: a IA pausa, como no atendimento (quem responde assume).
  const [iaPausada, setIaPausada] = useState(false);
  const [sending, setSending] = useState(false);
  // "Digitando…": o agente está pensando ou ainda vai mandar outro balão.
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simStage, setSimStage] = useState<string | null>(initialStage);
  const [simStageSource, setSimStageSource] = useState<string | null>(
    initialStage ? "ia" : null
  );
  const { scrollRef, scrollDown } = useColadoNoFim();

  const lastDiag = (() => {
    for (let i = turns.length - 1; i >= 0; i--)
      if (turns[i].role === "assistant") return turns[i].diag ?? null;
    return null;
  })();

  async function callApi(payload: {
    message: string;
    history: { role: string; content: string }[];
    retomada?: { instruction: string } | null;
    pedidosAbertos?: string[];
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
    history: { role: string; content: string }[],
    retomada: { instruction: string } | null = null,
    abertos: Handoff[] = fila
  ) {
    setPensando(true);
    scrollDown();
    let res: ApiResult;
    try {
      res = await callApi({
        message,
        history,
        retomada,
        pedidosAbertos: abertos.map((p) => p.summary ?? "").filter(Boolean),
      });
    } finally {
      setPensando(false);
    }
    const { output, diagnostics } = res;
    // O servidor decide pela MESMA regra do atendimento (`pedidoNaFila`).
    if (diagnostics.pedidoNaFila) {
      setPedidos((prev) => [
        ...prev,
        {
          id: Date.now(),
          openedAt: new Date().toISOString(),
          summary: output.summary || diagnostics.summary || null,
          instruction: null,
          closedAt: null,
          closedHow: null,
        },
      ]);
    }
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
    const history = historico(turns);
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    scrollDown();
    // IA pausada (o time assumiu): a mensagem chega e ninguém responde por ela.
    if (iaPausada) return;
    setSending(true);
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


  async function enviarAudio(blob: Blob, duracao: number) {
    setSending(true);
    const history = historico(turns);
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

  // Fecha o pedido da vez: vira a linha de histórico na conversa, no ponto em
  // que fechou, como no atendimento.
  function fecharPedido(p: Handoff, como: "ia" | "resolvido", instrucao: string | null) {
    const fechado: Handoff = {
      ...p,
      instruction: instrucao,
      closedAt: new Date().toISOString(),
      closedHow: como,
    };
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? fechado : x)));
    setTurns((prev) => [...prev, { role: "marco", content: "", pedido: fechado }]);
    scrollDown();
  }

  // ORIENTAR (o mesmo gesto da tela de Conversas): o pedido fecha e a IA
  // responde NA HORA, sem mensagem nova do cliente (turno de retomada).
  async function orientarPedido(texto: string) {
    if (!texto.trim() || sending || !pedidoAtual) return;
    setError(null);
    setSending(true);
    const history = historico(turns);
    const restantes = fila.slice(1);
    fecharPedido(pedidoAtual, "ia", texto.trim());
    try {
      await responder("", history, { instruction: texto.trim() }, restantes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setSending(false);
    }
  }

  // RESPONDER COMO TIME (o modo Responder da caixa): o pedido fecha como
  // "resolvido pelo time", o time assume e a IA pausa, como no atendimento.
  function responderComoTime(texto: string) {
    const t = texto.trim();
    if (!t) return;
    if (pedidoAtual) fecharPedido(pedidoAtual, "resolvido", null);
    setTurns((prev) => [
      ...prev,
      ...(iaPausada ? [] : [{ role: "marco" as const, content: "", rotulo: "O time assumiu a conversa" }]),
      { role: "time", content: t },
    ]);
    setIaPausada(true);
    scrollDown();
  }

  const { gravando, segundos, iniciarGravacao, pararGravacao } = useGravadorDeAudio({
    ocupado: sending,
    setError,
    aoGravar: enviarAudio,
  });

  return {
    turns,
    input,
    setInput,
    fila,
    pedidoAtual,
    iaPausada,
    setIaPausada,
    sending,
    pensando,
    error,
    simStage,
    lastDiag,
    scrollRef,
    sendMessage,
    gravando,
    segundos,
    iniciarGravacao,
    pararGravacao,
    fecharPedido,
    orientarPedido,
    responderComoTime,
  };
}
