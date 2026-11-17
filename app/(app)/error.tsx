"use client"; // fronteira de erro do Next: precisa ser componente do navegador

import { useEffect } from "react";
import { cardVariants } from "@/components/ui/card";
import { ErroDoBloco } from "@/components/ui/erro-do-bloco";
import { cn } from "@/lib/utils";

/**
 * Uma tela que quebrou ao desenhar (docs/plano-dados-e-estado.md, 2.9): o cartão
 * da página com a frase e "Tentar de novo", e o menu do app continua no lugar
 * (esta fronteira fica abaixo do layout do `(app)`). Nunca a tela em branco.
 */
export default function Erro({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("tela quebrou:", error);
  }, [error]);
  return (
    <div className={cn(cardVariants({ variant: "pagina" }), "flex min-h-0 flex-1 flex-col items-center justify-center")}>
      <ErroDoBloco frase="Esta tela não abriu. Tente de novo; se continuar, recarregue a página." aoTentar={unstable_retry} />
    </div>
  );
}
