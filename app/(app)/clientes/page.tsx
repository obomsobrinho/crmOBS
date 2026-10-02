import { UsersRound } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estado-vazio";

// Nenhum cliente aberto. No celular esta coluna some (a lista é a tela).
export default function ClientesPage() {
  return (
    <EstadoVazio
      data-clientes-vazio
      tamanho="detalhe"
      icone={UsersRound}
      texto="Escolha um cliente na lista para ver e completar o cadastro."
    />
  );
}
