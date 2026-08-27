import { TrendingUp, TrendingDown } from "lucide-react";
import { formatDuration, type DashboardMetrics } from "@/lib/metrics";
import { calcularDelta, deltaDuracao, type Delta } from "@/lib/delta";
import { Badge } from "@/components/ui/badge";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";

// Os três números que respondem "a IA está dando conta?", em linguagem de dono
// (não é BI). Componente puro de apresentação: quem calcula é a página, por RLS.
//
// Cada cartão tem QUATRO peças: rótulo, número, uma frase que INTERPRETA o
// número, e uma legenda com o PERÍODO. O período no cartão não é enfeite: sem
// ele a tela mostrava "Leads qualificados 9" (7 dias) ao lado de "19 leads
// qualificados em julho" (mês), e o dono lia contradição.

/** Selo de variação, ou a frase de "sem base". Nunca um número inventado. */
export function Selo({ delta }: { delta: Delta }) {
  if (delta.tipo === "sem-base") {
    return <span className="text-legenda text-ink-3">{delta.texto}</span>;
  }
  const variant =
    delta.tom === "bom"
      ? "delta-bom"
      : delta.tom === "ruim"
        ? "delta-ruim"
        : "delta-neutro";
  const Seta = delta.subiu ? TrendingUp : TrendingDown;
  return (
    <Badge variant={variant}>
      {delta.texto !== "igual" && <Seta size={12} aria-hidden />}
      {delta.texto}
    </Badge>
  );
}

export default function DashboardCards({
  metrics,
  anterior,
  legenda,
  semBase,
}: {
  metrics: DashboardMetrics;
  /**
   * Os mesmos números do período ANTERIOR, para a variação. `null` quando não há
   * período anterior medido, e aí nenhum cartão mostra selo.
   */
  anterior: DashboardMetrics | null;
  /** Período do cartão, ex.: "últimos 7 dias". */
  legenda: string;
  /** Frase de "sem base", ex.: "primeira semana medida". */
  semBase: string;
}) {
  const {
    conversas,
    semIntervencao,
    primeiraRespostaMs,
    amostraMediana,
    preferiuConfirmar,
    respostasIa,
  } = metrics;

  const pct = conversas > 0 ? Math.round((semIntervencao / conversas) * 100) : 0;

  const deltaAutonomia = calcularDelta({
    atual: semIntervencao,
    anterior: anterior?.semIntervencao ?? null,
    direcao: "maior-melhor",
    semBase,
  });
  const deltaResposta = deltaDuracao({
    atualMs: primeiraRespostaMs,
    anteriorMs: anterior?.primeiraRespostaMs ?? null,
    semBase,
  });
  // Direção NEUTRA de propósito. Menos escalada pode ser a base ficando melhor,
  // e mais escalada pode ser só mais demanda. Pintar de verde ou vermelho
  // ensinaria o dono a torcer pelo número errado.
  const deltaConfirmar = calcularDelta({
    atual: preferiuConfirmar,
    anterior: anterior?.preferiuConfirmar ?? null,
    direcao: "neutra",
    semBase,
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Atendidas sem você</StatRotulo>
          <Selo delta={deltaAutonomia} />
        </StatTopo>
        <StatValor>{semIntervencao}</StatValor>
        <StatFrase>
          A conversa seguiu sem ninguém do time precisar entrar
        </StatFrase>
        <StatLegenda>
          {conversas > 0
            ? `${semIntervencao} de ${conversas} conversas (${pct}%), ${legenda}`
            : legenda}
        </StatLegenda>
      </Stat>

      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Tempo de 1a resposta</StatRotulo>
          <Selo delta={deltaResposta} />
        </StatTopo>
        <StatValor>{formatDuration(primeiraRespostaMs)}</StatValor>
        <StatFrase>Mediana, contando só as respostas da IA</StatFrase>
        {/* O tamanho da amostra vai na legenda: mediana de 3 atendimentos e
            mediana de 138 não são o mesmo número, e o cartão precisa dizer qual
            dos dois ele é. */}
        <StatLegenda>
          {amostraMediana > 0
            ? `${amostraMediana} ${
                amostraMediana === 1
                  ? "atendimento medido"
                  : "atendimentos medidos"
              }, ${legenda}`
            : legenda}
        </StatLegenda>
      </Stat>

      {/* A contenção vira PROVA, não falha. É a única forma OBSERVÁVEL de "a IA
          não inventa": uma promessa de não alucinar é impossível de verificar;
          uma contagem de vezes em que ela se conteve, não.
          Em zero a frase VIRA a leitura positiva em vez de o cartão sumir: zero
          escalada num período com movimento é notícia boa, e esconder o cartão
          faria o número reaparecer do nada na semana seguinte. */}
      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Preferiu confirmar</StatRotulo>
          <Selo delta={deltaConfirmar} />
        </StatTopo>
        <StatValor>{preferiuConfirmar}</StatValor>
        <StatFrase>
          {preferiuConfirmar === 0
            ? "Ela não precisou te passar nada no período"
            : "Vezes em que ela passou para você em vez de chutar"}
        </StatFrase>
        <StatLegenda>
          {respostasIa > 0
            ? `${preferiuConfirmar} de ${respostasIa} respostas, ${legenda}`
            : legenda}
        </StatLegenda>
      </Stat>
    </div>
  );
}
