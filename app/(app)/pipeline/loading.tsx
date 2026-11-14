import { KanbanSquare } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura do Pipeline no clique (passo 0 de docs/plano-dados-e-estado.md).
export default function Loading() {
  return <MolduraDeCarregamento icone={KanbanSquare} titulo="Pipeline" barra="alta" controles={3} corpo="colunas" />;
}
