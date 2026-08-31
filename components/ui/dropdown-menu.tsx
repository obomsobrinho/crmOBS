"use client";

import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Menu suspenso.
 *
 * Substitui as três implementações à mão da tela de atendimento, que tinham
 * DOIS jeitos diferentes de fechar (onBlur com contains(relatedTarget) em duas,
 * listener no document na terceira), três sombras distintas, e nenhuma delas
 * com navegação por seta, prisão de foco ou portal. Duas viviam dentro de
 * contêiner com `overflow-hidden` e se posicionavam por número mágico
 * (`top-8`, `top-[88px]`), então não conseguiam escapar do cartão.
 *
 * Só as peças que a tela usa estão aqui. Sub, Checkbox, Radio e Shortcut foram
 * removidos do arquivo gerado: nenhum consumidor, e código morto numa camada
 * base é o que faz ela envelhecer mal.
 *
 * O que mudou em relação ao arquivo do shadcn, além do visual da casa:
 *
 * - `cursor-default` virou `cursor-pointer`. O Item do Radix é um div com
 *   `role="menuitem"`, e não um <button>, então ele escapa da regra de cursor
 *   do globals.css (linha 618). Sem esta troca, a mãozinha vira seta.
 * - `focus:` ganhou `hover:` do lado. O Radix move o foco do DOM para o item ao
 *   passar o mouse, então `focus:` já cobriria os dois casos, mas declarar os
 *   dois deixa a cor idêntica em qualquer ordem de evento.
 * - Saíram `[&_svg:not([class*='size-'])]:size-4` (engordaria nossos ícones de
 *   13 e 14px) e as classes de animação do pacote:
 *   a entrada e a saída são `.anim-flutuante`, CSS escrito na casa.
 */
function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "anim-flutuante z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-[var(--panel-shadow)]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "perigo";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-legenda text-ink-2 transition-colors outline-hidden select-none",
        "hover:bg-[var(--active-bg)] focus:bg-[var(--active-bg)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // `danger-ink`, e não `danger`: `--danger-fill` como TEXTO dá 3,2:1
        // sobre a superfície de conteúdo no tema escuro, e o par certo da
        // regra 1 é `surface` de fundo com `ink` de tinta (9,0:1).
        "data-[variant=perigo]:hover:bg-danger-surface data-[variant=perigo]:hover:text-danger-ink",
        "data-[variant=perigo]:focus:bg-danger-surface data-[variant=perigo]:focus:text-danger-ink",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-rotulo text-ink-3", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
