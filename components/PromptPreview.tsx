import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * O texto do prompt, na caixa de leitura (02/10/2026). Eram duas cópias da
 * mesma sopa de classe (a gaveta do prompt e a base do modo guiado). 12px é o
 * piso da interface, e o prompt não abre exceção.
 *
 * `tom="apagado"` é para o trecho que a pessoa NÃO edita (a base do sistema);
 * `rolavel` limita a altura e rola: quem usa passa `ref`, `style` e `onScroll`
 * do `useDissolverRolagem`, que desenha a máscara das bordas.
 */
export function PromptPreview({
  tom = "normal",
  rolavel = false,
  className,
  ...props
}: React.ComponentProps<"pre"> & {
  tom?: "normal" | "apagado";
  rolavel?: boolean;
}) {
  return (
    <pre
      data-slot="prompt-preview"
      className={cn(
        "rounded-xl border border-line bg-[var(--input-bg)] p-3.5 font-sans text-legenda leading-[19px] break-words whitespace-pre-wrap",
        tom === "apagado" ? "text-ink-3" : "text-ink-2",
        // eslint-disable-next-line no-restricted-syntax -- a máscara de rolagem vem do hook do chamador (ref, style e onScroll)
        rolavel && "max-h-64 overflow-y-auto",
        className,
      )}
      {...props}
    />
  );
}
