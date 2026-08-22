"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import LogoutButton from "./LogoutButton";
import ConnectionRiskNotice from "./ConnectionRiskNotice";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Phase = "idle" | "loading" | "waiting" | "importing" | "connected" | "error";

export default function ConnectWhatsApp({
  clientId,
  clientName,
  hasInstance,
}: {
  clientId: string;
  clientName: string;
  hasInstance: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const onConnected = useCallback(async () => {
    if (doneRef.current) return; // roda uma vez só
    doneRef.current = true;
    stopPolling();
    // Importa a base existente (contatos + histórico) antes de entrar no inbox.
    setPhase("importing");
    try {
      await fetch(`/api/clients/${clientId}/import`, { method: "POST" });
    } catch {
      // se falhar, segue mesmo assim — o inbox só ficará sem o histórico antigo
    }
    setPhase("connected");
    setTimeout(() => {
      router.replace("/inbox");
      router.refresh();
    }, 1000);
  }, [router, stopPolling, clientId]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/whatsapp-status`);
        const data = (await res.json()) as { state?: string };
        if (data.state === "open") onConnected();
      } catch {
        // silencioso; próxima tentativa segue
      }
    }, 3000);
  }, [clientId, onConnected, stopPolling]);

  const connect = useCallback(async () => {
    setError(null);
    setPhase("loading");
    setQr(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/connect-whatsapp`, {
        method: "POST",
      });
      const data = (await res.json()) as { qr?: string | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao iniciar a conexão.");
        setPhase("error");
        return;
      }
      setQr(data.qr ?? null);
      setPhase("waiting");
      startPolling();
    } catch {
      setError("Não foi possível contatar o servidor.");
      setPhase("error");
    }
  }, [clientId, startPolling]);

  // Se já existe instância, começa checando se ela já está conectada.
  useEffect(() => {
    if (hasInstance) startPolling();
    return () => stopPolling();
  }, [hasInstance, startPolling, stopPolling]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-4 lg:flex-row lg:items-start lg:justify-center lg:py-10">
      <div className={cn(cardVariants(), "w-full max-w-md space-y-5 p-6 text-center")}>
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-titulo">Conectar WhatsApp</h1>
            <p className="text-apoio text-ink-2">{clientName}</p>
          </div>
          <LogoutButton />
        </div>

        {phase === "connected" || phase === "importing" ? (
          <div className="space-y-2 py-8">
            <div className="text-3xl">{phase === "importing" ? "⏳" : "✅"}</div>
            <p className="font-medium text-human-ink">
              {phase === "importing"
                ? "Conectado! Importando sua base…"
                : "Tudo pronto!"}
            </p>
            <p className="text-apoio text-ink-2">
              {phase === "importing"
                ? "Trazendo contatos e conversas do WhatsApp…"
                : "Redirecionando…"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-apoio text-ink-2">
              Abra o WhatsApp no celular do cliente, em Aparelhos conectados,
              e escaneie o QR code abaixo.
            </p>

            <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-line-strong bg-bloco p-4">
              {qr ? (
                <Image
                  src={qr}
                  alt="QR code do WhatsApp"
                  width={256}
                  height={256}
                  unoptimized
                  className="h-64 w-64 rounded-lg"
                />
              ) : phase === "loading" ? (
                <span className="text-apoio text-ink-3">Gerando QR…</span>
              ) : (
                <span className="text-apoio text-ink-3">
                  {hasInstance
                    ? "Aguardando conexão ou gere um novo QR."
                    : "Clique em Conectar para gerar o QR."}
                </span>
              )}
            </div>

            {phase === "waiting" && (
              <p className="text-legenda text-ink-3">
                Aguardando você escanear… a tela avança sozinha ao conectar.
              </p>
            )}

            {error && <p className="text-apoio text-danger-ink">{error}</p>}

            <Button
              size="field"
              onClick={connect}
              disabled={phase === "loading"}
              className="w-full justify-center"
            >
              {phase === "loading"
                ? "Gerando…"
                : qr
                ? "Gerar novo QR"
                : "Conectar WhatsApp"}
            </Button>
          </>
        )}
      </div>

      {/* Transparência sobre o QR: só faz sentido antes de conectar. Depois de
          conectado a tela está de saída (redireciona), então sai da frente. */}
      {phase !== "connected" && phase !== "importing" && <ConnectionRiskNotice />}
    </div>
  );
}
