import { HandHelping } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Moldura de Pedidos no clique (passo 0 de docs/plano-dados-e-estado.md): a coluna
// estreita da lista e, no computador, o lugar do detalhe ao lado (como a página).
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 md:gap-3">
      <MolduraDeCarregamento
        icone={HandHelping}
        titulo="Pedidos de ajuda"
        controles={1}
        controlesAbaixo
        corpo="lista"
        className="max-md:flex-1 md:w-[340px] md:flex-none md:shrink-0 xl:w-[380px]"
      />
      <div aria-hidden className={cn(cardVariants({ variant: "pagina" }), "min-w-0 flex-1 max-md:hidden")} />
    </div>
  );
}
