"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Janela modal.
 *
 * Substitui os dois modais à mão do PipelineBoard e do TeamManager, que tinham
 * o mesmo desenho: `fixed inset-0` com preto a 50%, `onClick` no fundo para
 * fechar e `stopPropagation` no painel para o clique de dentro não fechar
 * junto. Os dois escreviam `role="dialog" aria-modal="true"` na mão, sem nada
 * por trás: nenhum prendia o foco, nenhum fechava no Escape, nenhum devolvia o
 * foco a quem abriu e nenhum escondia o resto da página do leitor de tela.
 *
 * Duas peças do arquivo do shadcn não estão aqui, e a ausência é a decisão:
 *
 * - `DialogTrigger`. Os dois consumidores abrem por estado (`managing`,
 *   `toRemove`), não por clique num gatilho. Peça sem consumidor é o que faz
 *   uma camada base envelhecer mal; entra quando aparecer o primeiro.
 * - O botão de fechar embutido no `DialogContent`. Um dos dois modais tem X no
 *   cabeçalho e o outro não tem, então quem precisa põe um `DialogClose` onde
 *   a composição dele pede.
 *
 * O resto do que mudou:
 *
 * - A animação de entrada e saída é CSS da casa (`.anim-flutuante` e
 *   `.anim-fundo` no globals.css), sem `tw-animate-css`. ⚠️ O keyframe mexe só
 *   em opacidade e escala, e NÃO repete o `translate` do centramento: no
 *   Tailwind v4 o translate é propriedade separada do `transform`, então
 *   repetir somaria e deslocaria o modal. Ver a nota no globals.css.
 * - `bg-background` virou `bg-conteudo`. Um modal é superfície de conteúdo
 *   flutuante, a mesma família do menu suspenso, e no tema escuro ela é mais
 *   clara que o fundo, não mais escura.
 * - Nenhuma classe de foco: o foco é global no globals.css.
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

const conteudoVariants = cva(
  // `w-[calc(100%-2rem)]` e não `w-full`: o modal antigo ganhava a folga das
  // bordas de um `p-4` no fundo escuro. Aqui o fundo não empurra ninguém (o
  // painel se centra por translate), então a folga precisa virar largura.
  "anim-flutuante fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-conteudo shadow-[var(--panel-shadow)]",
  {
    variants: {
      tamanho: {
        /** Uma pergunta e dois botões. */
        confirmacao: "max-w-sm p-5",
        /** Cabeçalho fixo, corpo que rola, até 85% da altura da janela. */
        gestao: "flex max-h-[85vh] max-w-lg flex-col overflow-hidden",
      },
    },
    defaultVariants: { tamanho: "confirmacao" },
  },
);

function DialogContent({
  className,
  tamanho,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof conteudoVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="anim-fundo fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(conteudoVariants({ tamanho, className }))}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-display text-titulo", className)}
      {...props}
    />
  );
}

/**
 * O Radix avisa no console quando o conteúdo não tem descrição acessível. Não é
 * decoração: é o texto que o leitor de tela lê depois do título para dizer o
 * que a janela quer. A POSIÇÃO na marcação é livre, porque a ligação é por
 * `aria-describedby`, então ele pode ficar no fim do modal se for lá que cabe.
 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-apoio text-ink-2", className)}
      {...props}
    />
  );
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  conteudoVariants,
};
