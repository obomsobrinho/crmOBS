"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleHelp, RefreshCw, WifiOff } from "lucide-react";

// O app diz quando o WhatsApp caiu.
//
// Antes disto, uma instância derrubada (celular sem bateria, sessão encerrada
// no aparelho, Evolution reiniciada) aparecia no produto como SILÊNCIO: o
// painel mostrava zero sem explicar, o inbox parava de receber e ninguém sabia
// se era o sistema ou o cliente que não escrevia. Este aviso mora no mesmo lugar
// e com o mesmo peso do `BillingBanner`, em toda página do app, enquanto o
// estado da instância for diferente de `open`.
//
// ⚠️ A CHECAGEM É NO BROWSER, DEPOIS DO CARREGAMENTO, E NUNCA NO SERVER
// COMPONENT. O layout já paga `getMyClient()` em toda navegação, e trocar de
// conversa custa ~0,9s quase todo em viagem de rede em série (achado A1). Uma
// chamada à Evolution a mais no servidor, por página, faria a tela inteira
// esperar pela API de terceiro. Aqui a primeira leitura sai logo depois de
// montar, e as seguintes a cada `INTERVALO_MS`, mais uma ao voltar o foco (o
// mesmo motivo do refetch do realtime: a máquina dormiu, o socket morreu, e o
// que estava na tela envelheceu sem aviso).
//
// `estadoForcado` existe para o preview de design e para o teste: com ele o
// componente NÃO consulta nada. O layout nunca passa essa prop.

export type EstadoWhatsApp = "open" | "close" | "connecting" | "unknown";

/** Um minuto: queda de WhatsApp é medida em minutos, não em segundos. */
export const INTERVALO_MS = 60_000;

/** A Evolution devolve `open`, `close` e `connecting`; qualquer outra coisa é `unknown`. */
export function normalizarEstado(valor: unknown): EstadoWhatsApp {
  return valor === "open" || valor === "close" || valor === "connecting"
    ? valor
    : "unknown";
}

export default function WhatsAppBanner({
  clientId,
  estadoForcado,
}: {
  clientId: string;
  /** Só preview e teste. Com ele, nenhuma requisição é feita. */
  estadoForcado?: EstadoWhatsApp;
}) {
  // `null` = ainda não sabemos. Nada é renderizado até a primeira resposta,
  // para a tela não piscar um aviso que a próxima leitura desmente.
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(
    estadoForcado ?? null
  );

  useEffect(() => {
    if (estadoForcado) return;
    let ativo = true;

    async function consultar() {
      try {
        const res = await fetch(`/api/clients/${clientId}/whatsapp-status`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { state?: unknown };
        if (ativo) setEstado(normalizarEstado(data.state));
      } catch {
        if (ativo) setEstado("unknown");
      }
    }

    void consultar();
    const timer = setInterval(consultar, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [clientId, estadoForcado]);

  if (estado === null || estado === "open") return null;

  if (estado === "close") {
    return (
      <div
        role="status"
        data-slot="whatsapp-banner"
        data-estado="close"
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-danger-line bg-danger-surface px-4 py-2.5 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:py-2"
      >
        <WifiOff size={16} className="shrink-0 text-danger-ink" aria-hidden />
        <p className="min-w-0 flex-1 text-apoio text-danger-ink">
          <span className="font-semibold">WhatsApp desconectado.</span>{" "}
          As mensagens não estão chegando e o agente não responde até reconectar.
        </p>
        <Link
          href="/connect"
          className="shrink-0 text-legenda font-medium text-danger-ink underline transition-opacity hover:opacity-80"
        >
          Reconectar
        </Link>
      </div>
    );
  }

  if (estado === "connecting") {
    return (
      <div
        role="status"
        data-slot="whatsapp-banner"
        data-estado="connecting"
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-warn-line bg-warn-surface px-4 py-2.5 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:py-2"
      >
        <RefreshCw size={16} className="shrink-0 text-warn-ink" aria-hidden />
        <p className="min-w-0 flex-1 text-apoio text-warn-ink">
          <span className="font-semibold">WhatsApp reconectando.</span>{" "}
          Esperando o aparelho responder. Se demorar, abra a conexão.
        </p>
        <Link
          href="/connect"
          className="shrink-0 text-legenda font-medium text-warn-ink underline transition-opacity hover:opacity-80"
        >
          Ver conexão
        </Link>
      </div>
    );
  }

  // `unknown`: a Evolution não respondeu ou respondeu algo que não conhecemos.
  // Neutro de propósito: não sabemos se caiu, e pintar de vermelho seria afirmar.
  return (
    <div
      role="status"
      data-slot="whatsapp-banner"
      data-estado="unknown"
      className="flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-raised px-4 py-2.5 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:py-2"
    >
      <CircleHelp size={16} className="shrink-0 text-ink-3" aria-hidden />
      <p className="min-w-0 flex-1 text-apoio text-ink-2">
        <span className="font-semibold text-ink">
          Não foi possível verificar a conexão do WhatsApp.
        </span>{" "}
        Se as mensagens pararem de chegar, confira a conexão.
      </p>
      <Link
        href="/connect"
        className="shrink-0 text-legenda font-medium text-ink-2 underline transition-opacity hover:opacity-80"
      >
        Ver conexão
      </Link>
    </div>
  );
}
