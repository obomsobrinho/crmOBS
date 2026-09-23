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
  enquadramento = "pagina",
  onConectado,
}: {
  clientId: string;
  clientName: string;
  hasInstance: boolean;
  /**
   * `pagina` = a tela `/connect` inteira (moldura de tela cheia, título próprio,
   * botão de sair). `passo` = embutido como passo 1 do assistente de montagem,
   * onde a moldura, o título e o sair já existem em volta.
   *
   * ⚠️ São duas MOLDURAS do mesmo componente, e não dois componentes: o QR, o
   * polling e a importação são justamente a parte que não pode existir duas
   * vezes.
   */
  enquadramento?: "pagina" | "passo";
  /**
   * Chamado quando a conexão fecha e a importação termina. Quando existe, ele
   * SUBSTITUI o redirecionamento para o inbox: dentro do assistente, sair da
   * rota no meio da montagem perderia o rascunho e o passo.
   */
  onConectado?: () => void;
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
      // Dentro do assistente quem decide o que vem depois é o assistente: ele
      // avança para o passo 2 sem trocar de rota, senão o rascunho da montagem
      // e o passo atual iriam junto com a navegação.
      if (onConectado) {
        onConectado();
        return;
      }
      router.replace("/inbox");
      router.refresh();
    }, 1000);
  }, [router, stopPolling, clientId, onConectado]);

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

  const passo = enquadramento === "passo";

  return (
    <div
      className={
        passo
          ? // Dentro do assistente a moldura, o fundo e a rolagem são de fora.
            // Empilhado e não lado a lado: a coluna do assistente tem 672px, e
            // duas colunas ali deixariam o QR com menos de 300px.
            "flex flex-col gap-4"
          : "flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-4 lg:flex-row lg:items-start lg:justify-center lg:py-10"
      }
    >
      <div
        className={cn(
          cardVariants(),
          "space-y-5 p-6 text-center",
          passo ? "w-full" : "w-full max-w-md"
        )}
      >
        {/* Título e sair só na tela própria: no assistente os dois já existem no
            cabeçalho, e repetir daria duas saídas e dois títulos na mesma tela. */}
        {!passo && (
          <div className="flex items-center justify-between">
            <div className="text-left">
              <h1 className="text-titulo">Conectar WhatsApp</h1>
              <p className="text-apoio text-ink-2">{clientName}</p>
            </div>
            <LogoutButton />
          </div>
        )}

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
                : passo
                  ? "Vamos para o próximo passo…"
                  : "Redirecionando…"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-apoio text-ink-2">
              Abra o WhatsApp no celular do cliente, em Aparelhos conectados,
              e escaneie o QR code abaixo.
            </p>

            {/* ⚠️ No celular a pessoa não consegue ler o QR na própria tela, e
                este projeto NÃO tem conexão por código de telefone. Dizer isso é
                a única saída honesta; inventar um pareamento que não existe
                seria pior. */}
            {/* Cartão da marca, e ANTES do código (desenho do mobile, 23/09/2026):
                era uma linha cinza de 12px, e quem está no celular precisa ler
                isto antes de gastar tempo tentando escanear a própria tela. */}
            <div
              data-slot="aviso-celular"
              className="rounded-xl border border-brand-line bg-brand-surface px-4 py-3 text-left md:hidden"
            >
              <p className="text-apoio font-semibold text-brand-ink">
                Está neste celular?
              </p>
              <p className="mt-0.5 text-apoio text-ink-2">
                O código precisa ser lido por outro aparelho. Abra esta tela no
                computador ou em outro aparelho e escaneie com o celular do
                WhatsApp.
              </p>
            </div>

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
          conectado a tela está de saída, então sai da frente.
          O aviso tem `max-w-md` próprio, que serve à coluna estreita da tela
          própria; no assistente ele acompanha a largura do passo. */}
      {phase !== "connected" && phase !== "importing" && (
        <div className={passo ? "w-full [&>div]:max-w-none" : "contents"}>
          <ConnectionRiskNotice />
        </div>
      )}
    </div>
  );
}
