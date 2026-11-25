import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura da Agenda no clique (passo 0 de docs/plano-dados-e-estado.md).
export default function Loading() {
  return <MolduraDeCarregamento titulo="Agenda" controles={2} corpo="semana" />;
}
