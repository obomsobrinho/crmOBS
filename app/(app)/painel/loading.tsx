import { LayoutDashboard } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura do Painel no clique (passo 0 de docs/plano-dados-e-estado.md). Sem
// cartão em volta, como a página.
export default function Loading() {
  return <MolduraDeCarregamento icone={LayoutDashboard} titulo="Painel" cabecalho="solto" apoio cartao={false} corpo="grade" />;
}
