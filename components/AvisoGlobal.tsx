"use client";

import { useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { assinarAvisoGlobal, fecharAvisoGlobal, lerAvisoGlobal } from "@/lib/query/aviso-global";

/** Some sozinho depois disto (a pessoa ainda pode fechar antes). */
const TEMPO_DO_AVISO_MS = 8_000;

/**
 * A faixa da escrita recusada quando a tela que a fez já foi trocada
 * (docs/plano-dados-e-estado.md, 2.6). Mora no layout do app, uma só.
 */
export default function AvisoGlobal() {
  const frase = useSyncExternalStore(assinarAvisoGlobal, lerAvisoGlobal, () => null);
  useEffect(() => {
    if (!frase) return;
    const t = setTimeout(fecharAvisoGlobal, TEMPO_DO_AVISO_MS);
    return () => clearTimeout(t);
  }, [frase]);
  if (!frase) return null;
  return (
    <div role="alert" data-slot="aviso-global" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <Aviso tom="danger" className="flex w-full max-w-md items-start gap-2 shadow-lg">
        <span className="flex-1">{frase}</span>
        <Button variant="ghost" size="icon-control" aria-label="Fechar aviso" onClick={fecharAvisoGlobal}>
          <X aria-hidden />
        </Button>
      </Aviso>
    </div>
  );
}
