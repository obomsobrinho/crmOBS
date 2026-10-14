import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Campo de busca com lupa (13/10/2026, revisão do P1 item 6).
 *
 * Era a MESMA moldura copiada em cinco telas (lista de conversas, Contatos,
 * Pedidos, filtros do Pipeline e Empresas do admin): moldura no degrau de
 * controle, lupa em tinta fraca, o `Input` sem moldura própria (`limpo`) e a
 * borda da marca no foco. Agora é uma peça só.
 *
 * - `className` vai na MOLDURA (largura, ordem no celular, esconder);
 * - `classeDoCampo` vai no `Input` (largura do texto);
 * - `aoLimpar` + `mostrarLimpar` põem o "x" de limpar no fim (quem chama decide
 *   quando ele aparece, por exemplo só depois do debounce).
 */
function CampoBusca({
  className,
  classeDoCampo,
  valor,
  aoMudar,
  placeholder,
  rotulo,
  aoLimpar,
  mostrarLimpar = false,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  classeDoCampo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  /** Nome acessível do campo (`aria-label`). */
  rotulo: string;
  aoLimpar?: () => void;
  mostrarLimpar?: boolean;
}) {
  return (
    <div
      {...props}
      data-slot="campo-busca"
      className={cn(
        "flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-2.5 transition-colors focus-within:border-brand-line",
        className,
      )}
    >
      <Search size={15} className="shrink-0 text-ink-faint" />
      <Input
        variant="limpo"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className={cn("text-apoio", classeDoCampo)}
      />
      {aoLimpar && mostrarLimpar && (
        <Button
          variant="ghost"
          size="none"
          onClick={aoLimpar}
          aria-label="Limpar busca"
          className="rounded-sm text-ink-3"
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

export { CampoBusca };
