import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";
import { Esqueleto } from "@/components/ui/esqueleto";

// Moldura de Campanhas no clique (passo 0 de docs/plano-dados-e-estado.md). A tela
// não tem título de página: em cima ficam as abas (Campanhas, Leads) e o botão de
// criar, e embaixo o cartão da lista. Também cobre as rotas filhas sem moldura própria.
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Esqueleto forma="pilula" className="h-9 w-52" />
        <Esqueleto forma="pilula" className="ml-auto h-9 w-40" />
      </div>
      <MolduraDeCarregamento controles={1} corpo="lista" />
    </div>
  );
}
