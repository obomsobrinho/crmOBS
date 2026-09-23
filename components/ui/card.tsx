import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Cartão de seção. Substituiu a classe `.cartao`, que foi removida do
 * globals.css quando o último uso saiu: mesma superfície, mesma borda de 1px,
 * mesma sombra, mesmo raio.
 *
 * O atendimento tem TRÊS cartões (o menu, a lista de conversas e a conversa com
 * os detalhes do contato) e dentro de um cartão a separação é linha de 1px,
 * nunca outro cartão. Por isso aqui não existe CardHeader nem CardFooter: eles
 * empilhariam moldura dentro de moldura, que é o que a regra proíbe.
 */
const cardVariants = cva("border border-line shadow-[var(--panel-shadow)]", {
  variants: {
    variant: {
      /** Lista, conversa e painel: as três dividem a mesma superfície. */
      conteudo: "rounded-xl bg-raised",
      /** A coluna de navegação, que tem superfície própria. */
      menu: "rounded-xl bg-menu",
      /**
       * O cartão que É a tela (Equipe, Perfil, Agente, a lista de conversas, a
       * entrada). No CELULAR ele perde a moldura (plano do mobile, 23/09/2026):
       * a tela já encosta nas bordas do aparelho, e uma borda com raio a 0px
       * da borda física só desenha um contorno sem função.
       */
      pagina:
        "rounded-xl bg-raised max-md:rounded-none max-md:border-0 max-md:shadow-none",
    },
  },
  defaultVariants: { variant: "conteudo" },
});

/**
 * `asChild` existe porque a lista de conversas é um `<aside>` e a conversa é um
 * `<main>`: cartão é aparência, não elemento, e trocar a marcação semântica por
 * uma `<div>` seria perder informação de estrutura para ganhar estilo.
 */
function Card({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="card"
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Card, cardVariants };
