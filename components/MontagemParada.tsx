"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Copy, Monitor, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// O PASSO 4 NO CELULAR (23/10/2026, dono): uma PARADA, e não um aviso no meio da
// tela. Sem o código de pareamento (docs/adr/2026-10-17-pairing-code-off-qr-only.md)
// o QR precisa aparecer numa tela e ser lido pelo celular da empresa, e quem
// abriu a montagem no próprio celular da empresa não tem como fazer isso aqui.
//
// O que já foi feito está no servidor (o agente é salvo ao sair do passo 2), e no
// computador `/montagem` abre direto neste passo (`montagemState`).
//
// ⚠️ O QR continua a um toque: quem tem o WhatsApp da empresa em OUTRO aparelho
// lê daqui mesmo.
//
// Só é desenhada no celular, e `useCelular` é falso no servidor: por isso ler
// `window` aqui no render é seguro.

export default function MontagemParada({
  clientId,
  hasInstance,
  onMostrarQr,
  onConectado,
}: {
  clientId: string;
  hasInstance: boolean;
  onMostrarQr: () => void;
  /** A conta já estava conectada (o QR foi lido antes): segue para ativar. */
  onConectado: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/montagem`;
  const podeCompartilhar = typeof navigator.share === "function";

  // Quem já conectou em outro momento não precisa parar: uma leitura do estado
  // real, como o `ConnectWhatsApp` faria ao abrir.
  useEffect(() => {
    if (!hasInstance) return;
    let vivo = true;
    fetch(`/api/clients/${clientId}/whatsapp-status`)
      .then((r) => r.json() as Promise<{ state?: string }>)
      .then((d) => {
        if (vivo && d.state === "open") onConectado();
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clientId, hasInstance, onConectado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function compartilhar() {
    try {
      await navigator.share({ title: "Continuar a montagem", url: link });
    } catch {
      // Cancelar o compartilhamento também cai aqui: nada a fazer.
    }
  }

  return (
    <div
      data-slot="montagem-parada-computador"
      className={cn(cardVariants(), "space-y-4 p-6")}
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-surface text-brand-ink">
        <Monitor size={20} aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-cartao text-ink">Continue no computador</h2>
        <p className="mt-1 text-apoio text-ink-2">
          O QR code precisa aparecer numa tela para o celular da empresa ler, e
          o celular não lê o que está na própria tela.
        </p>
      </div>
      <p className="text-apoio text-ink-2">
        O que você fez até aqui está salvo. Entre na sua conta pelo computador e
        a montagem continua deste passo.
      </p>

      <p
        data-slot="parada-link"
        className="break-all rounded-lg border border-line bg-bloco px-3 py-2 text-apoio text-ink"
      >
        {link.replace(/^https?:\/\//, "")}
      </p>

      <div className="flex flex-col gap-2">
        {podeCompartilhar && (
          <Button size="primary" className="justify-center" onClick={() => void compartilhar()}>
            <Share2 size={15} />
            Compartilhar o link
          </Button>
        )}
        <Button
          variant={podeCompartilhar ? "outline" : "brand"}
          size="primary"
          className="justify-center"
          onClick={() => void copiar()}
        >
          <Copy size={15} />
          {copiado ? "Link copiado" : "Copiar o link"}
        </Button>
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-legenda text-ink-3">
          O WhatsApp da empresa está em outro aparelho?
        </p>
        <Button
          variant="link"
          size="link"
          data-slot="parada-mostrar-qr"
          onClick={onMostrarQr}
        >
          Mostrar o QR aqui
          <ChevronRight size={15} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
