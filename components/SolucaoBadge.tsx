import { Bot, CheckCheck, UserRound, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { rotuloDaSolucao, type Solucao } from "@/lib/solucoes";

// A SOLUÇÃO DO PEDIDO (08/10/2026, lib/solucoes.ts): selo com ícone, igual na
// linha da lista e no detalhe. O rótulo vem do módulo; aqui só o ícone de cada
// chave. Sem solução gravada, não desenha nada (nunca inventar um desfecho).
const ICONE: Record<Solucao, LucideIcon> = {
  orientou_ia: Bot,
  time_resolveu: CheckCheck,
  time_assumiu: UserRound,
};

export default function SolucaoBadge({ solucao }: { solucao: Solucao | null }) {
  if (!solucao) return null;
  const Icone = ICONE[solucao];
  return (
    <Badge variant="solucao" data-solucao={solucao}>
      <Icone size={12} aria-hidden />
      {rotuloDaSolucao(solucao)}
    </Badge>
  );
}
