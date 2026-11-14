import * as React from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Erro de um bloco de dados (docs/plano-dados-e-estado.md, 2.9 e 7.1): a frase do
 * motivo e "Tentar de novo". Nunca a tela em branco. O vermelho é só estado
 * (`fundamentos-cor.md`): a frase usa a tinta `danger-ink`, o botão é neutro.
 *
 * `aoTentar` costuma ser o `refetch` da consulta; `tentando` liga o `carregando`
 * do botão enquanto ela roda.
 */
function ErroDoBloco({
  frase,
  aoTentar,
  tentando = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { frase: string; aoTentar?: () => void; tentando?: boolean }) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 p-6 text-center", className)}
      {...props}
      data-slot="erro-do-bloco"
    >
      <p className="text-apoio text-danger-ink" style={{ textWrap: "pretty" }}>
        {frase}
      </p>
      {aoTentar && (
        <Button variant="outline" size="control" onClick={aoTentar} carregando={tentando}>
          <RotateCw aria-hidden />
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

export { ErroDoBloco };
