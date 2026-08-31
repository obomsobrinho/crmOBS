import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Chip.
 *
 * As não lidas eram DUAS pílulas incompatíveis: gradiente da marca na lista de
 * conversas, tinta cheia na coluna de navegação. Agora são uma só, no par
 * fill/on da marca. O gradiente saiu porque o próprio design system fecha o
 * escopo dele em "superfície decorativa a partir de 28px", e esta pílula tem
 * 18px, além de ser ESTADO (quantas conversas esperam), não decoração.
 */
/**
 * O `display` mora na VARIANTE, não na base. Três destes chips são span inline
 * hoje (contador, separador de dia e não lidas do rail) e três são flex: impor
 * `inline-flex` a todos mudaria a caixa de metade deles.
 */
const badgeVariants = cva(
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Chip com moldura: atendente e estado da IA no cabeçalho. */
        contorno:
          "flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-bloco px-2.5 text-legenda text-ink-2",
        /** Convite a preencher: ninguém assumiu a conversa ainda. */
        tracejado:
          "flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-legenda text-ink-3",
        /** Contador discreto ao lado de um rótulo. */
        contagem:
          "rounded-md bg-[var(--chip-bg)] px-1.5 py-0.5 text-legenda tabular-nums text-[var(--chip-fg)]",
        /** Não lidas. Uma só, para a lista de conversas e para o rail. */
        "nao-lidas":
          "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-legenda font-semibold tabular-nums text-primary-foreground",
        /** Separador de dia no meio da conversa. */
        dia: "rounded-full bg-bloco px-3 py-1 text-legenda font-semibold tracking-wide uppercase text-ink-2",
        /** Tag do contato. */
        tag: "flex items-center gap-1.5 rounded-full border border-line py-0.5 text-legenda",
        /**
         * Variação de um indicador (cartão `Stat`). O TOM vem de `lib/delta.ts`,
         * que sabe a direção certa de cada número: no tempo de resposta menos é
         * melhor, e sem essa regra o selo ficaria verde num atendimento que
         * piorou.
         *
         * Verde e vermelho aqui são ESTADO ("a conta melhorou / piorou"), o que é
         * uso legítimo. Mas cor de estado só significa algo se não estiver em
         * tudo: por isso o padrão é `delta-neutro` e o selo é OPCIONAL no cartão.
         * A referência que inspirou isto tem selo colorido em 100% dos cartões, e
         * é assim que verde deixa de ser estado e vira enfeite.
         *
         * `-ink` sobre `-surface`, nunca `-fill` como tinta.
         */
        "delta-bom":
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-human-line bg-human-surface px-2 py-0.5 text-legenda font-semibold tabular-nums text-human-ink",
        "delta-ruim":
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-danger-line bg-danger-surface px-2 py-0.5 text-legenda font-semibold tabular-nums text-danger-ink",
        "delta-neutro":
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-line-soft bg-bloco px-2 py-0.5 text-legenda font-semibold tabular-nums text-ink-2",
      },
    },
    defaultVariants: { variant: "contorno" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
