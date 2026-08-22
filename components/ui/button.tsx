import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Botão da casa.
 *
 * O vocabulário das variantes é o MESMO dos tokens do globals.css (brand, send,
 * warn, danger) e o dos tamanhos é o mesmo da escala de controle (field 40,
 * primary 36, control 32, chrome 28), de propósito: dois dicionários para uma
 * coisa só é como se perde um design system.
 *
 * Sete coisas saíram do arquivo original do shadcn, e cada uma mudaria pixel:
 *
 * 1. `[&_svg:not([class*='size-'])]:size-4`. O `size-4` é CSS e vence o atributo
 *    `width` do lucide, então ele engordaria para 16px todo ícone nosso de 13,
 *    14 e 15px. Só `[&_svg]:shrink-0` continua, que é o que já fazíamos à mão.
 * 2. `outline-none` e o anel de foco. O foco já é global no globals.css:
 *    contorno de 2px em --brand-ink, com opt-out para campo. O anel do shadcn
 *    empilharia um segundo indicador em cima do nosso.
 * 3. `transition-all` virou `transition-colors`, que é o que a tela usa.
 * 4. `bg-accent` virou `var(--active-bg)`: no shadcn `accent` é superfície de
 *    hover, aqui `accent` é a cor da marca e está em uso como TEXTO em outras
 *    telas. Ver a nota da ponte no globals.css.
 * 5. `rounded-md` (8px) virou `rounded-lg` (12px), o degrau de botão da casa.
 * 6. `disabled:pointer-events-none` virou `disabled:cursor-not-allowed`, senão
 *    o botão desabilitado perde o cursor de "não pode" que ele tem hoje.
 * 7. As variantes `dark:` sumiram: nossos tokens já viram sozinhos por tema.
 *
 * `justify-center` fica só nos tamanhos de ícone. Nenhum botão de texto da tela
 * tem essa declaração hoje, e adicioná-la mexeria em quem tem espaço sobrando.
 */
const buttonVariants = cva(
  // A base tem só o que vale para TODO botão. Raio, respiro entre ícone e
  // rótulo e peso da fonte moram no `size`, porque são geometria: assim
  // `size="none"` significa mesmo "sem geometria", e o botão de ícone nu (o X
  // que aparece no hover da linha) não herda um raio de 12px que ele nunca teve.
  //
  // `flex`, e não o `inline-flex` do shadcn: os botões da tela usam `flex` hoje,
  // sem exceção, e trocar o display muda a caixa de quem mora em linha.
  "flex shrink-0 items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Ação principal. É o antigo `.btn-primary`. */
        brand: "bg-primary text-primary-foreground hover:brightness-[1.08]",
        /** Enviar mensagem: a única ação verde do produto. Antigo `.btn-send`. */
        send: "bg-[var(--send-fill)] text-[var(--send-on)] hover:brightness-[1.08]",
        /** Nota interna. O âmbar aqui é estado, não decoração. */
        warn: "bg-[var(--warn-fill)] text-[var(--warn-on)] hover:brightness-110",
        /** Ação destrutiva com fundo cheio. */
        danger: "bg-destructive text-[var(--danger-on)] hover:brightness-[1.08]",
        /** Ação secundária com moldura. */
        outline: "border border-line text-ink hover:bg-[var(--active-bg)]",
        /**
         * Sem moldura, com realce de fundo no hover. É o ghost da ÁREA DE
         * CONTEÚDO (conversa, painel do contato).
         */
        ghost: "text-ink-2 hover:bg-[var(--active-bg)] hover:text-ink",
        /**
         * O mesmo, na COLUNA DE NAVEGAÇÃO, que tem superfície própria e por
         * isso um realce próprio (--rail-hover). São duas regiões diferentes do
         * produto, não duas opiniões sobre a mesma coisa.
         */
        rail: "text-ink-2 hover:bg-[var(--rail-hover)] hover:text-ink",
        /** Ação de texto na cor da marca (`ink`, nunca `fill`, que é fundo). */
        "brand-ghost": "text-brand-ink hover:bg-[var(--active-bg)]",
        /**
         * Ação destrutiva discreta: nasce apagada e só se assume no hover.
         * O realce usa o par `surface`/`ink` do vermelho, nunca `fill`: no tema
         * escuro `--danger-fill` como TEXTO dá 3,2:1 sobre a superfície de
         * conteúdo, enquanto `--danger-ink` dá 9,0:1.
         */
        "danger-ghost":
          "text-ink-3 hover:bg-danger-surface hover:text-danger-ink",
      },
      size: {
        /** 40px. Mesmo degrau do campo de digitar. */
        field: "h-[var(--h-field)] gap-2 rounded-lg px-3 text-apoio font-semibold",
        /** 36px. Ação principal de um bloco. */
        primary:
          "h-[var(--h-primary)] gap-2 rounded-lg px-3 text-apoio font-semibold",
        /** 32px. Ação secundária, aba, enviar, chip de filtro. */
        control:
          "h-[var(--h-control)] gap-2 rounded-lg px-2.5 text-legenda font-semibold",
        /** 28px. Moldura. */
        chrome:
          "h-[var(--h-chrome)] gap-2 rounded-lg px-2 text-legenda font-semibold",
        /** 32px quadrado. */
        "icon-control":
          "h-[var(--h-control)] w-[var(--h-control)] justify-center rounded-lg",
        /** 28px quadrado: clipe, painel, tema. */
        "icon-chrome":
          "h-[var(--h-chrome)] w-[var(--h-chrome)] justify-center rounded-lg",
        /** Nada. Para quem tem geometria própria, como o ícone nu de remover. */
        none: "",
      },
    },
    defaultVariants: {
      variant: "brand",
      size: "control",
    },
  },
);

function Button({
  className,
  variant = "brand",
  size = "control",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
