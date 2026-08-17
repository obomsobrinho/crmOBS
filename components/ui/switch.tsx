"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Chave de duas posições, em três peças.
 *
 * Por que não é o Switch de uma peça do shadcn: a chave da IA não é só o
 * trilho, é uma PÍLULA que contém o rótulo ("IA ligada") mais o trilho, e a
 * pílula inteira é o alvo de clique e de foco. Se o Root fosse só o trilho,
 * a alternativa seria um <label> em volta, e aí o anel de foco passaria a
 * cercar o trilho de 16x28px em vez da pílula, que é uma mudança visível.
 *
 * Com Root, Track e Thumb separados, o DOM fica idêntico ao de hoje
 * (button[role=switch] > texto + span do trilho > span do polegar) e o Radix
 * ainda entrega `aria-checked`, teclado e o `data-state` que pinta tudo.
 *
 * O Track lê o estado do Root pelo grupo `switch`, porque ele é um span comum.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group/switch disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
      // DEPOIS do spread de propósito: quando a chave é envolvida por um
      // `TooltipTrigger asChild`, o Tooltip injeta o `data-slot` dele por cima.
      // O marcador é a identidade do componente e é por ele que teste e
      // depuração o encontram, então ele não pode ser sobrescrito por quem
      // envolve.
      data-slot="switch"
    />
  );
}

/**
 * O trilho. 16x28px com borda de 1px, como a chave da IA sempre teve.
 *
 * O estado chega por PROP e vira um `data-state` próprio, em vez de o trilho
 * ler o do Root pelo grupo. Motivo achado na prática: envolver a chave num
 * `TooltipTrigger asChild` faz o Tooltip escrever o `data-state` dele
 * (`closed`/`delayed-open`) por cima do do Switch, e aí o trilho não casa com
 * `checked` nem com `unchecked` e fica sem cor nenhuma. Depender de atributo
 * de ancestral quebra sempre que alguém envolve o componente em outra coisa.
 */
function SwitchTrack({
  className,
  checked,
  ...props
}: React.ComponentProps<"span"> & { checked: boolean }) {
  return (
    <span
      data-slot="switch-track"
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "relative flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
        "data-[state=unchecked]:border-line-strong data-[state=unchecked]:bg-campo",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    />
  );
}

/**
 * O polegar. Os deslocamentos são 1px e 13px em vez de uma conta com
 * `calc(100%-2px)`: são os valores que a chave usa hoje, e a conta do shadcn
 * daria 12px, movendo o polegar um pixel a menos.
 */
function SwitchThumb({
  className,
  checked,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Thumb> & { checked: boolean }) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "pointer-events-none block h-3 w-3 rounded-full transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "data-[state=unchecked]:translate-x-[1px] data-[state=unchecked]:bg-[var(--ink-3)]",
        "data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-white",
        className,
      )}
      {...props}
    />
  );
}

export { Switch, SwitchTrack, SwitchThumb };
