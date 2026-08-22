"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Seletor de um valor.
 *
 * Os três `<select>` que ele substitui eram nativos. O nativo aceita estilo no
 * gatilho e ignora quase tudo na LISTA aberta, que o sistema operacional
 * desenha: no pipeline, abrir o filtro de estágio mostrava uma lista branca do
 * Windows por cima do tema escuro. Aqui a lista é a mesma superfície flutuante
 * do menu suspenso, e por isso os dois compartilham borda, raio e sombra.
 *
 * A escala de tamanho é a de controle da casa (`field` 40, `control` 32), a
 * mesma do `Button` e do `Input`, porque um seletor mora em linha com os dois.
 *
 * ⚠️ Diferença conhecida e aceita: o nativo abre o seletor do sistema no
 * celular (a roda de rolagem do iOS, a lista do Android). Este abre a mesma
 * lista do desktop. O CRM é desktop primeiro (coluna de navegação fixa, painel
 * de 296px, quadro Kanban horizontal), então a troca vale o que custa.
 *
 * Só as peças que os três consumidores usam estão aqui. `Group`, `Label`,
 * `Separator` e os botões de rolagem do arquivo do shadcn saíram: sem
 * consumidor, e código morto na base é o que a faz envelhecer mal.
 */
function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

const gatilhoVariants = cva(
  // `[&>span]:truncate`: o Value do Radix é um span, e sem isto um nome de
  // atendente comprido estica o gatilho e empurra o resto do cabeçalho.
  "flex shrink-0 items-center justify-between gap-2 rounded-lg border border-line bg-[var(--input-bg)] text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-ink-3 [&>span]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        /** 40px. Em linha com um campo de digitar. */
        field: "h-[var(--h-field)] px-3 text-apoio",
        /** 32px. Filtro numa barra de ferramentas. */
        control: "h-[var(--h-control)] px-3 text-legenda",
      },
    },
    defaultVariants: { size: "control" },
  },
);

function SelectTrigger({
  className,
  size,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> &
  VariantProps<typeof gatilhoVariants>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(gatilhoVariants({ size, className }))}
      {...props}
      data-slot="select-trigger"
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={15} className="text-ink-faint" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "anim-flutuante relative z-50 min-w-[8rem] overflow-hidden rounded-xl border border-line bg-conteudo shadow-[var(--panel-shadow)]",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        {/* A altura disponível é uma variável que o Radix escreve no Content.
            Ela vale aqui porque custom property herda, e é no Viewport que ela
            precisa estar: quem rola é ele, não o Content. */}
        <SelectPrimitive.Viewport
          className={cn(
            "max-h-(--radix-select-content-available-height) overflow-y-auto p-1",
            position === "popper" &&
              "w-full min-w-(--radix-select-trigger-width)",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // Mesmo desenho do DropdownMenuItem, com espaço à esquerda para a marca
        // do escolhido. `cursor-pointer` porque o Item do Radix é um div com
        // role, e não um <button>, então escapa da regra global de cursor.
        "relative flex h-8 cursor-pointer items-center rounded-lg pr-2 pl-7 text-legenda text-ink-2 transition-colors outline-hidden select-none",
        "hover:bg-[var(--active-bg)] focus:bg-[var(--active-bg)]",
        "data-[state=checked]:text-ink",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={13} className="text-brand-ink" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  gatilhoVariants,
};
