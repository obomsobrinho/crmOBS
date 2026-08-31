"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Painel lateral (drawer). Entra pela direita por cima do conteúdo, com o fundo
 * escurecido.
 *
 * É o mesmo primitivo do `dialog` (Radix Dialog), e não um componente novo do
 * zero: prender o foco, fechar no Escape, devolver o foco a quem abriu e
 * esconder o resto da página do leitor de tela é trabalho já resolvido ali. O
 * que muda aqui é geometria e animação, então o arquivo é fino de propósito.
 *
 * Por que não reusar o `DialogContent` com className: o `conteudoVariants` dele
 * embute `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` e
 * `.anim-flutuante`. Sobrescrever isso por className seria brigar com o
 * `translate` do centramento, que é justamente a armadilha documentada no
 * globals.css (no Tailwind v4 `translate` é propriedade separada do `transform`
 * e as duas somam). Painel encostado na borda é outra geometria, outro arquivo.
 *
 * Uma peça do arquivo do shadcn não está aqui, e a ausência é a decisão: o botão
 * de fechar embutido no conteúdo. Quem precisa põe um `SheetClose` onde a
 * composição pedir, igual ao `dialog`.
 */
function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

/**
 * `data-slot` DEPOIS do spread: um gatilho de fora (um Tooltip envolvendo este
 * botão, por exemplo) clona props para cá, e sem isso ele sobrescreveria o slot
 * deste componente.
 */
function SheetTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} data-slot="sheet-trigger" />;
}

/**
 * A largura é a única geometria que varia entre os painéis, então ela é
 * VARIANTE e não className na tela: o painel do prompt e o da bancada usariam a
 * mesma sopa de classe com um número trocado, e sopa repetida é variante.
 */
const conteudoVariants = cva(
  "anim-lateral fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-raised shadow-[var(--panel-shadow)]",
  {
    variants: {
      tamanho: {
        /** Leitura: 520px é onde um prompt de ~9 KB não vira coluna de 40 caracteres. */
        padrao: "sm:max-w-[520px]",
        /**
         * Trabalho: a bancada de teste tem conversa E diagnóstico lado a lado, e
         * em 520px as duas colunas ficariam estreitas demais para as duas
         * servirem. Em tela pequena os dois valores caem para a largura toda.
         */
        largo: "sm:max-w-[1040px]",
      },
    },
    defaultVariants: { tamanho: "padrao" },
  },
);

function SheetContent({
  className,
  tamanho,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof conteudoVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="anim-fundo fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(conteudoVariants({ tamanho, className }))}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-titulo", className)}
      {...props}
    />
  );
}

/**
 * O Radix avisa no console quando o conteúdo não tem descrição acessível. É o
 * texto que o leitor de tela lê depois do título para dizer o que o painel quer.
 * A posição na marcação é livre, porque a ligação é por `aria-describedby`.
 */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-apoio text-ink-2", className)}
      {...props}
    />
  );
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} data-slot="sheet-close" />;
}

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
};
