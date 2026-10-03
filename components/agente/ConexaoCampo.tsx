"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AcoesConexao, { type AcaoConexao } from "@/components/AcoesConexao";
import { normalizarEstado, type EstadoWhatsApp } from "@/components/WhatsAppBanner";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ROTULOS: Record<EstadoWhatsApp | "verificando", string> = {
  open: "Conectado",
  close: "Desconectado",
  connecting: "Reconectando",
  unknown: "Não foi possível verificar",
  verificando: "Verificando…",
};

// A CONEXÃO DO WHATSAPP NA TELA DO AGENTE (03/10/2026): onde o dono olha para
// saber em que número o agente atende, e de onde desconecta ou troca. O estado
// vem do BROWSER (`whatsapp-status`), nunca de um Server Component (mesmo motivo
// do `WhatsAppBanner`: a Evolution é API de terceiro e a página não espera por
// ela). `estadoForcado` é só preview e teste. Sem instância (nunca conectou) o
// bloco não aparece: quem conecta pela primeira vez usa a montagem.
export default function ConexaoCampo({
  clientId,
  temInstancia,
  estadoForcado,
}: {
  clientId: string;
  temInstancia: boolean;
  /** Só preview e teste. Com ele, nenhuma requisição é feita. */
  estadoForcado?: EstadoWhatsApp;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(estadoForcado ?? null);

  useEffect(() => {
    if (estadoForcado || !temInstancia) return;
    let ativo = true;
    fetch(`/api/clients/${clientId}/whatsapp-status`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ state?: unknown }>)
      .then((d) => ativo && setEstado(normalizarEstado(d.state)))
      .catch(() => ativo && setEstado("unknown"));
    return () => {
      ativo = false;
    };
  }, [clientId, temInstancia, estadoForcado]);

  if (!temInstancia) return null;

  function aoFeito(acao: AcaoConexao) {
    // Trocar segue para o fluxo de QR ou código de /connect. Desconectar fica
    // aqui, mas o interruptor do agente (lido no servidor) mudou de estado:
    // recarrega a tela para ele não mentir.
    if (acao === "trocar") router.push("/connect");
    else if (estadoForcado) setEstado("close");
    else window.location.reload();
  }

  const aberto = estado === "open";
  return (
    <div
      data-slot="conexao-agente"
      data-estado={estado ?? "verificando"}
      className={cn(
        cardVariants(),
        "flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      )}
    >
      <div className="min-w-0">
        <p className="text-rotulo uppercase text-ink-3">WhatsApp</p>
        <p className="text-corpo font-medium text-ink">
          {ROTULOS[estado ?? "verificando"]}
        </p>
      </div>
      {aberto ? (
        <AcoesConexao clientId={clientId} onFeito={aoFeito} preview={!!estadoForcado} />
      ) : (
        estado !== null && (
          <Link
            href="/connect"
            className="text-legenda font-medium text-ink-2 underline transition-opacity hover:opacity-80"
          >
            {estado === "close" ? "Conectar" : "Ver conexão"}
          </Link>
        )
      )}
    </div>
  );
}
