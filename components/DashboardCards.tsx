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

// Os números da operação, em linguagem de dono (não é BI). Componente puro de
// apresentação: a página calcula por RLS e passa; o /design passa mock.
//
// Cada cartão tem QUATRO peças, e as duas últimas são as que faltavam: rótulo,
// número, uma frase que INTERPRETA o número, e uma legenda com o PERÍODO. O
// período no cartão não é enfeite: sem ele a tela mostrava "Leads qualificados 9"
// (7 dias) ao lado de "19 leads qualificados em julho" (mês), e o dono lia
// contradição.
//
// "Conversas na semana" deixou de ser cartão próprio: não é número sobre o qual
// ele aja, é o denominador da autonomia, e desceu para a legenda do primeiro
// cartão, onde trabalha mais ("31 de 42 conversas").

/** Selo de variação, ou a frase de "sem base". Nunca um número inventado. */
function Selo({ delta }: { delta: Delta }) {
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
  esperando,
}: {
  metrics: DashboardMetrics;
  /**
   * Os mesmos números dos 7 dias ANTERIORES, para a variação. `null` quando não
   * há período anterior medido, e aí nenhum cartão mostra selo.
   */
  anterior: DashboardMetrics | null;
  /** Conversas com handoff em aberto AGORA. `null` = não medido. */
  esperando: number | null;
}) {
  const { conversasSemana, semIntervencao, leadsQualificados, primeiraRespostaMs } =
    metrics;
  const pct =
    conversasSemana > 0 ? Math.round((semIntervencao / conversasSemana) * 100) : 0;

  const primeiraSemana = "primeira semana medida";

  const deltaAutonomia = calcularDelta({
    atual: semIntervencao,
    anterior: anterior?.semIntervencao ?? null,
    direcao: "maior-melhor",
    semBase: primeiraSemana,
  });
  const deltaLeads = calcularDelta({
    atual: leadsQualificados,
    anterior: anterior?.leadsQualificados ?? null,
    direcao: "maior-melhor",
    semBase: primeiraSemana,
  });
  const deltaResposta = deltaDuracao({
    atualMs: primeiraRespostaMs,
    anteriorMs: anterior?.primeiraRespostaMs ?? null,
    semBase: primeiraSemana,
  });

  const temEspera = esperando != null && esperando > 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Atendidas sem você</StatRotulo>
          <Selo delta={deltaAutonomia} />
        </StatTopo>
        <StatValor>{semIntervencao}</StatValor>
        <StatFrase>
          {conversasSemana > 0
            ? `A IA resolveu ${pct}% sozinha`
            : "A IA resolveu sozinha"}
        </StatFrase>
        <StatLegenda>
          {conversasSemana > 0
            ? `${semIntervencao} de ${conversasSemana} conversas, últimos 7 dias`
            : "últimos 7 dias"}
        </StatLegenda>
      </Stat>

      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Leads qualificados</StatRotulo>
          <Selo delta={deltaLeads} />
        </StatTopo>
        <StatValor>{leadsQualificados}</StatValor>
        <StatFrase>A IA identificou e resumiu para você</StatFrase>
        <StatLegenda>últimos 7 dias</StatLegenda>
      </Stat>

      <Stat variant="elevado">
        <StatTopo>
          <StatRotulo>Tempo de 1a resposta</StatRotulo>
          <Selo delta={deltaResposta} />
        </StatTopo>
        <StatValor>{formatDuration(primeiraRespostaMs)}</StatValor>
        {/* Diz que é mediana e que é só da IA. O número mudou de significado em
            26/08, e um cartão que o dono lê como "velocidade do agente" precisa
            declarar que não está somando humano. */}
        <StatFrase>Mediana, contando só as respostas da IA</StatFrase>
        <StatLegenda>últimos 7 dias</StatLegenda>
      </Stat>

      {/* O único número ACIONÁVEL do painel, e é por isso que ele existe:
          transforma relatório em tarefa. Sem selo de propósito, porque é foto de
          AGORA e não período, e comparar "agora" com "agora da semana passada"
          não significa nada. */}
      <Stat variant={temEspera ? "marca" : "elevado"}>
        <StatTopo>
          <StatRotulo>Esperando você</StatRotulo>
        </StatTopo>
        <StatValor className={temEspera ? "text-brand-ink" : ""}>
          {esperando ?? "sem dados"}
        </StatValor>
        <StatFrase>
          {esperando == null
            ? "Não foi possível medir agora"
            : esperando === 0
              ? "Nada pendente do seu lado"
              : "A IA abriu e ninguém respondeu ainda"}
        </StatFrase>
        <StatLegenda>agora</StatLegenda>
      </Stat>
    </div>
  );
}
