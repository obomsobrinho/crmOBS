"use client";

import { useEffect, useRef, useState } from "react";
import { GRAVACAO_MAX_S } from "./apoio";

/**
 * A gravação de voz no navegador (MediaRecorder): o relógio, o microfone e o
 * descartar/enviar. Quem transcreve e manda ao agente é `aoGravar`.
 */
export function useGravadorDeAudio({
  ocupado,
  setError,
  aoGravar: enviarAudio,
}: {
  /** Já tem um turno em andamento: não começa outra gravação. */
  ocupado: boolean;
  setError: (msg: string | null) => void;
  aoGravar: (blob: Blob, duracao: number) => Promise<void>;
}) {
  const sending = ocupado;
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

  return { gravando, segundos, iniciarGravacao, pararGravacao };
}
