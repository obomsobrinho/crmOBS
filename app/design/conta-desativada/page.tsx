import ContaDesativada from "@/components/ContaDesativada";

// Preview da tela da conta desativada (dev-only, liberado pelo proxy). Sem sessão:
// a mesma peça da página de verdade, com um nome falso.
export default function DesignContaDesativadaPage() {
  return <ContaDesativada empresa="Barbearia do Zé" />;
}
