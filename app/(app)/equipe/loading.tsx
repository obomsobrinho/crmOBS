import { Users } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura da Equipe no clique (passo 0 de docs/plano-dados-e-estado.md).
export default function Loading() {
  return <MolduraDeCarregamento icone={Users} titulo="Equipe" cabecalho="solto" apoio corpo="lista" />;
}
