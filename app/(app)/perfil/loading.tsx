import { User } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura do Perfil no clique (passo 0 de docs/plano-dados-e-estado.md).
export default function Loading() {
  return <MolduraDeCarregamento icone={User} titulo="Perfil" cabecalho="solto" apoio corpo="formulario" />;
}
