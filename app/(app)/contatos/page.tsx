import { UsersRound } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estado-vazio";

// Nenhum contato aberto. No celular esta coluna some (a lista é a tela).
export default function ContatosPage() {
  return (
    <EstadoVazio
      data-clientes-vazio
      tamanho="detalhe"
      icone={UsersRound}
      texto="Escolha um contato na lista para ver e completar o cadastro."
    />
  );
}
