import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Campo de uma linha com ícone à esquerda e, se precisar, uma ação à direita
 * (o olho da senha). Ao contrário do `CampoBusca`, a moldura continua sendo a do
 * próprio `Input`: é ele quem recebe `id`, rótulo e foco, então um `<label
 * htmlFor>` funciona igual a um campo sem ícone.
 *
 * ⚠️ A ação fica sobre o campo, então o texto reserva espaço com `pr-10`.
 */
function CampoComIcone({
  icone: Icone,
  acao,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  icone: LucideIcon;
  acao?: React.ReactNode;
}) {
  return (
    <div data-slot="campo-com-icone" className="relative">
      <Icone
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
      <Input {...props} className={cn("pl-9", acao ? "pr-10" : undefined, className)} />
      {acao && <span className="absolute inset-y-0 right-1 flex items-center">{acao}</span>}
    </div>
  );
}

export { CampoComIcone };
