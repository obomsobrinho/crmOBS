import NovidadesModal from "@/components/NovidadesModal";
import { notaAtual } from "@/lib/novidades";

// Preview das Novidades (dev-only, liberado pelo proxy). Sem sessão: a nota
// atual aberta, para o dono ler o texto; fechar não grava nada. No app de
// verdade, em desenvolvimento, `?novidades=ver` faz o mesmo sobre qualquer tela.
// `?atendente=1`: como o atendente vê (sem o botão de uma ação só do dono).
export default async function DesignNovidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ atendente?: string }>;
}) {
  const { atendente } = await searchParams;
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6 text-apoio text-ink-3">
      Preview das Novidades. Recarregue a página para ver de novo.
      <NovidadesModal nota={notaAtual()} simular dono={atendente !== "1"} />
    </div>
  );
}
