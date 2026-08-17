"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Avatar de iniciais.
 *
 * A tela de atendimento tem SETE tamanhos de avatar, e eles não são uma escala
 * inventada: cada um responde a um contexto (painel do contato, cabeçalho da
 * conversa, item da lista, menu, balão, item de menu, selo sobreposto).
 *
 * A INICIAL, porém, é uma só: `text-legenda` (12px) em todos. Antes havia
 * 8px, 10px e `text-xs` espalhados, e os dois primeiros violavam a regra de
 * nada abaixo de 12px. Numa bolha de 16px, a altura de caixa alta de uma fonte
 * de 12px é cerca de 8,5px, então cabe com folga: o que se perdeu foi a
 * variação sem motivo, não a legibilidade.
 *
 * A cor NÃO mora aqui: vem de `avatarPair()` (lib/inbox.ts) como `style` de
 * quem usa, porque é derivada do e-mail ou do telefone. Por isso o Fallback é
 * transparente e herda a tinta, em vez do `bg-muted text-muted-foreground` do
 * shadcn, que taparia a cor de quem chama.
 *
 * `relative`, `overflow-hidden` e `select-none` do arquivo original NÃO estão
 * aqui: nenhum avatar da tela os tem hoje, e para iniciais os três não fazem
 * nada. ⚠️ Quem for usar `AvatarImage` precisa acrescentar `overflow-hidden`,
 * que é o que recorta a foto no círculo.
 *
 * COMO USAR: para iniciais, passe o texto como filho direto de `<Avatar>`, e
 * não dentro de `<AvatarFallback>`. Fallback existe para o caso de a imagem
 * falhar, e sem imagem ele só acrescentaria um segundo elemento por avatar (são
 * sete na tela) sem nada para fazer. `AvatarImage` e `AvatarFallback` seguem
 * exportados para quando houver foto de contato.
 */
const avatarVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full font-semibold",
  {
    variants: {
      size: {
        /** 44px: painel do contato. */
        xl: "h-11 w-11 text-apoio",
        /** 40px: cabeçalho da conversa. */
        lg: "h-10 w-10 text-legenda",
        /** 36px: item da lista de conversas. */
        md: "h-9 w-9 text-legenda",
        /** 32px: gatilho do menu de perfil. */
        sm: "h-8 w-8 text-legenda",
        /** 28px: autor do balão. */
        xs: "h-7 w-7 text-legenda",
        /** 20px: dentro de chip e de item de menu. */
        "2xs": "h-5 w-5 text-legenda",
        /** 16px: selo de atendente sobre outro avatar. */
        "3xs": "h-4 w-4 text-legenda font-bold",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function Avatar({
  className,
  size,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size, className }))}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

/** Transparente de propósito: a cor vem do `style` do Root. */
function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, avatarVariants };
