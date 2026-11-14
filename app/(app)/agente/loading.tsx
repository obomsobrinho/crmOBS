import { Sparkles } from "lucide-react";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura do Agente no clique (passo 0 de docs/plano-dados-e-estado.md).
export default function Loading() {
  return <MolduraDeCarregamento icone={Sparkles} titulo="Agente de IA" cabecalho="solto" apoio corpo="formulario" />;
}
