import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio (02/10/2026): o que uma lista, uma coluna ou um painel mostra
 * quando não há nada.
 *
 * Eram cinco jeitos para o mesmo papel: o `Vazio` da lista de Clientes (ícone,
 * título em `text-cartao`, texto), o de Pedidos (o mesmo, com o título em
 * `text-corpo font-semibold`), a coluna sem conversa do Pipeline, o parágrafo
 * solto da lista de Conversas e da base de conhecimento. Cada cópia repetia o
 * `textWrap: "pretty"` na mão. Agora é uma peça só.
 *
 * `tamanho`:
 * - `painel`: o vazio de uma lista inteira. Ícone de 28px, título e texto;
 * - `detalhe`: o vazio da coluna de DETALHE ("escolha um item na lista"). Ícone
 *   e uma frase, centralizados na altura toda;
 * - `compacto`: uma frase de apoio, sem ícone, para dentro de uma coluna ou de
 *   uma lista curta.
 *
 * O ícone é `ink-faint` DE PROPÓSITO: é ícone, e a regra de cor diz que
 * `ink-faint` só vale para ícone e divisor, nunca para texto.
 */
const vazioVariants = cva("flex flex-col items-center text-center", {
  variants: {
    tamanho: {
      painel: "justify-center gap-2 px-6 py-16",
      detalhe: "flex-1 justify-center gap-2 p-6",
      compacto: "p-4 text-apoio text-ink-3",
    },
  },
  defaultVariants: { tamanho: "painel" },
});

function EstadoVazio({
  className,
  tamanho,
  icone: Icone,
  titulo,
  texto,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof vazioVariants> & {
    icone?: LucideIcon;
    titulo?: string;
    texto: React.ReactNode;
  }) {
  const compacto = tamanho === "compacto";
  return (
    <div
      data-slot="estado-vazio"
      className={cn(vazioVariants({ tamanho }), className)}
      {...props}
    >
      {Icone && <Icone size={28} className="text-ink-faint" aria-hidden />}
      {titulo && <p className="text-cartao text-ink">{titulo}</p>}
      {compacto ? (
        texto
      ) : (
        <p
          className={cn(
            "text-apoio text-ink-2",
            tamanho === "detalhe" ? "max-w-[260px]" : "max-w-[360px]",
          )}
          style={{ textWrap: "pretty" }}
        >
          {texto}
        </p>
      )}
      {children}
    </div>
  );
}

export { EstadoVazio, vazioVariants };
