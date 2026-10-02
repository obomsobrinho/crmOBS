import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Caixa de aviso (02/10/2026).
 *
 * Eram 27 cópias em 18 arquivos do mesmo `rounded-lg border border-warn-line
 * bg-warn-surface px-3 py-2 text-apoio text-warn-ink` e do gêmeo vermelho, cada
 * uma com ícone, respiro e raio que já tinham começado a divergir. Agora é uma
 * peça só.
 *
 * `tom` é ESTADO, nunca decoração: `warn` (âmbar) para "atenção, falta algo" e
 * `danger` (vermelho) para "deu errado". Sempre o par `surface`/`line` de
 * fundo e moldura com a tinta `ink` por cima, nunca `fill` como texto.
 *
 * `forma`:
 * - `caixa`: a padrão, com moldura (aviso dentro de formulário e de cartão);
 * - `plana`: a mesma sem moldura (aviso dentro de uma página de uma coluna só);
 * - `faixa`: o banner largo do topo da tela, que no celular vira faixa de
 *   ponta a ponta (sem raio e sem as bordas laterais e de cima).
 *
 * `icone` põe o ícone à esquerda, alinhado ao topo da primeira linha, e embrulha
 * o texto num `span`. Sem `icone`, os filhos entram como vieram. Para a caixa
 * que precisa de outro alinhamento, passe o ícone como filho e o `className`.
 */
const avisoVariants = cva("text-apoio", {
  variants: {
    tom: {
      warn: "border-warn-line bg-warn-surface text-warn-ink",
      danger: "border-danger-line bg-danger-surface text-danger-ink",
      /** Não sabemos se é problema: pintar de vermelho seria afirmar. */
      neutro: "border-line bg-raised text-ink-2",
    },
    forma: {
      caixa: "rounded-lg border px-3 py-2",
      plana: "rounded-lg px-3 py-2",
      faixa:
        "flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:py-2",
    },
  },
  defaultVariants: { tom: "warn", forma: "caixa" },
});

type IconeDoAviso = React.ComponentType<{ size?: number; className?: string }>;

function Aviso({
  className,
  tom,
  forma,
  icone: Icone,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof avisoVariants> & {
    asChild?: boolean;
    icone?: IconeDoAviso;
  }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="aviso"
      data-tom={tom ?? "warn"}
      className={cn(
        avisoVariants({ tom, forma }),
        Icone && "flex items-start gap-2",
        className,
      )}
      {...props}
    >
      {Icone ? (
        <>
          <Icone size={15} className="mt-0.5 shrink-0" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Aviso, avisoVariants };
