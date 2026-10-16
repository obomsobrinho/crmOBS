import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Medidor horizontal (13/10/2026, revisão do P1 item 6): a barra fina com uma
 * parte cheia. Era copiada no painel ("Por que ela te chamou") e no uso de IA
 * do admin.
 *
 * A TRILHA é `line-strong`, e não `bloco`: `bloco` é a superfície de um cartão `secao`
 * (e quase o `raised` no claro), então a trilha sumia e só a parte cheia aparecia
 * (achado do dono, 15/10/2026: "quero a trilha visível", em TODAS as barras). `line-strong` é
 * visível nas duas superfícies e nos dois temas; por isso o `neutro` (que era
 * `line-strong`) agora é `ink-3`.
 *
 * `tom` pinta a parte cheia: `marca` (o padrão, quantidade), `neutro` (sem
 * classificação), e `aviso`/`perigo`, que são ESTADO (perto do limite, no
 * limite), nunca enfeite. `valor` é a porcentagem (0 a 100, cortada nas
 * pontas). Com `rotulo`, é um `meter` acessível; sem ele, é decorativo
 * (`aria-hidden`), porque o número já está escrito ao lado.
 *
 * A barra de META COM RITMO (bolinha do ideal e trecho listrado) é outra peça:
 * `components/ui/medidor-de-meta.tsx`.
 */
const cheioVariants = cva("block h-full rounded-full", {
  variants: {
    tom: {
      marca: "bg-brand",
      neutro: "bg-ink-3",
      aviso: "bg-warn",
      perigo: "bg-danger",
    },
  },
  defaultVariants: { tom: "marca" },
});

const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

function Medidor({
  className,
  valor,
  tom,
  rotulo,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof cheioVariants> & {
    valor: number;
    rotulo?: string;
  }) {
  const largura = clamp(valor);
  const acessivel = rotulo
    ? {
        role: "meter" as const,
        "aria-label": rotulo,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(largura),
      }
    : { "aria-hidden": true };

  return (
    <span
      {...props}
      {...acessivel}
      data-slot="medidor"
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-line-strong", className)}
    >
      <span data-medidor-cheio="" className={cheioVariants({ tom })} style={{ width: `${largura}%` }} />
    </span>
  );
}

export { Medidor };
