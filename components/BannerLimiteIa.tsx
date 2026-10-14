import { CircleSlash } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { TEXTO_LIMITE_ATINGIDO, TEXTO_LIMITE_ATINGIDO_DETALHE } from "@/lib/custo-ia";

// FAIXA DO TETO DE IA (P1 item 6, docs/plano-custo-ia.md). Aparece em toda
// página do app, para o dono e para os atendentes, enquanto a IA da empresa está
// parada no limite do mês. Quem decide é `estadoDoConsumo` (lib/custo-ia.ts), a
// mesma regra que silencia o turno: a faixa nunca diz uma coisa e o WhatsApp
// faz outra. Some sozinha quando o mês vira ou o limite é aumentado (na
// navegação seguinte).
export default function BannerLimiteIa() {
  return (
    <Aviso tom="danger" forma="faixa" data-limite-ia="" role="status">
      <CircleSlash size={16} className="shrink-0 text-danger-ink" />
      <p className="min-w-0 flex-1 text-apoio text-danger-ink">
        <span className="font-semibold">{TEXTO_LIMITE_ATINGIDO}.</span>{" "}
        <span className="text-ink-2">{TEXTO_LIMITE_ATINGIDO_DETALHE}</span>
      </p>
    </Aviso>
  );
}
