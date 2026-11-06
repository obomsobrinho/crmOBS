import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Campo de uma linha com uma ação à direita (o olho da senha). Ao contrário do
 * `CampoBusca`, a moldura continua sendo a do próprio `Input`: é ele quem recebe
 * `id`, rótulo e foco, então um `<label htmlFor>` funciona igual a um campo comum.
 *
 * ⚠️ A ação fica sobre o campo, então o texto reserva espaço com `pr-10` (`pr-12` no celular, onde o alvo de toque é 44px).
 */
function CampoComAcao({
  acao,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { acao: React.ReactNode }) {
  return (
    <div data-slot="campo-com-acao" className="relative">
      <Input {...props} className={cn("pr-10 max-md:pr-12", className)} />
      <span className="absolute inset-y-0 right-1 flex items-center">{acao}</span>
    </div>
  );
}

export { CampoComAcao };
