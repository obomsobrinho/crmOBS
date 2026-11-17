import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";

// Moldura da lista da central no clique (passo 5 de docs/plano-dados-e-estado.md): a
// página lê a primeira página no servidor (D16), e até ela chegar o clique mostra o
// título, a busca com o filtro e o corpo da lista sem dados. O detalhe tem a dele
// (`[id]/loading.tsx`).
export default function Loading() {
  return <MolduraDeCarregamento titulo="Clientes" controles={2} corpo="lista" />;
}
