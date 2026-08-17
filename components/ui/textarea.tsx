import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Campo de várias linhas. Mesmas regras do Input: o foco é global (globals.css)
 * e não se declara aqui.
 *
 * `field-sizing-content` e `min-h-16` saíram da variante limpa: o editor da
 * conversa controla a própria altura por `rows` e o composer decide o resto.
 */
const textareaVariants = cva(
  "w-full placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        caixa:
          "min-h-16 rounded-lg border border-line bg-[var(--input-bg)] px-3 py-2 text-apoio transition-colors",
        /** O editor do composer: a moldura é da "casa" em volta, não dele. */
        limpo: "resize-none bg-transparent",
      },
    },
    defaultVariants: { variant: "caixa" },
  },
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
