"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";
import { Selo, NumeroAnimado, CartaoEmBreve } from "@/components/painel/pecas";
import { calcularDelta, deltaDuracao } from "@/lib/delta";
import {
  formatDuration,
  type Barra,
  type DashboardMetrics,
} from "@/lib/metrics";
import {
  ORDEM_PERIODOS,
  PERIODOS,
  PERIODO_PADRAO,
  type PeriodoKey,
} from "@/lib/periodo";

// "A operação": quatro cartões numa linha, com o seletor de período DENTRO do
// bloco.
//
// ⚠️ O SELETOR É DO BLOCO, NÃO DA TELA. Antes ele era global, ficava no
// cabeçalho de "A IA está dando conta?" e governava também o gráfico lá embaixo,
// e a manchete precisava de um aviso escrito dizendo que não seguia o seletor.
// Aviso de texto explicando o comportamento de um controle é sintoma: o controle
// estava no lugar errado. Agora cada bloco manda no próprio período e o aviso
// deixou de ser necessário.
//
// POR QUE OS QUATRO PERÍODOS CHEGAM PRONTOS: a página já lê o acumulado uma vez
// para a manchete, e recortar quatro janelas em memória custa quase nada. Buscar
// por clique daria quatro idas ao banco e a tela piscando a cada troca.

export interface JanelaCalculada {
  key: PeriodoKey;
  metrics: DashboardMetrics;
  /** Mesmos números do período anterior. `null` = sem base para comparar. */
  anterior: DashboardMetrics | null;
  barras: Barra[];
}

export default function PainelOperacaoBloco({
  janelas,
}: {
  janelas: Record<PeriodoKey, JanelaCalculada>;
}) {
  const [periodo, setPeriodo] = React.useState<PeriodoKey>(PERIODO_PADRAO);
  const p = PERIODOS[periodo];
  const j = janelas[periodo];
  const m = j.metrics;

  const pct =
    m.conversas > 0 ? Math.round((m.semIntervencao / m.conversas) * 100) : 0;

  const deltaAutonomia = calcularDelta({
    atual: m.semIntervencao,
    anterior: j.anterior?.semIntervencao ?? null,
    direcao: "maior-melhor",
    semBase: p.semBase,
  });
  const deltaResposta = deltaDuracao({
    atualMs: m.primeiraRespostaMs,
    anteriorMs: j.anterior?.primeiraRespostaMs ?? null,
    semBase: p.semBase,
  });
  // Direção NEUTRA de propósito. Menos escalada pode ser a base ficando melhor,
  // e mais escalada pode ser só mais demanda. Verde ou vermelho aqui ensinaria o
  // dono a torcer pelo número errado.
  const deltaConfirmar = calcularDelta({
    atual: m.preferiuConfirmar,
    anterior: j.anterior?.preferiuConfirmar ?? null,
    direcao: "neutra",
    semBase: p.semBase,
  });

  return (
    <section data-slot="painel-operacao" className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          {/* Título de BLOCO em Space Grotesk, como na prancha, e não rótulo em
              caixa alta na tinta 3. Caixa alta é para RÓTULO de indicador,
              dentro do cartão; o cabeçalho de um bloco da página é título. */}
          <h2 className="font-display text-cartao text-ink">A operação</h2>
          {/* O escopo do bloco inteiro, dito uma vez. Os cartões repetem o
              período na legenda de cada um, porque cartão sem período mente
              sobre o próprio número, mas quem lê o bloco precisa saber CONTRA O
              QUE os selos comparam, e isso só cabe aqui. */}
          <p className="mt-0.5 text-legenda text-ink-3">
            {p.legenda[0].toUpperCase() + p.legenda.slice(1)}, comparados com o
            período anterior
          </p>
        </div>
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
          <TabsList variant="painel" aria-label="Período">
            {ORDEM_PERIODOS.map((k) => (
              <TabsTrigger key={k} value={k} variant="painel">
                {PERIODOS[k].aba}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Quatro numa linha a partir de 1280. Abaixo disso vira duas, e nunca
          uma coluna só: quatro cartões empilhados empurrariam o movimento para
          fora da primeira tela, que é regra fechada do desenho. */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat variant="elevado" className="painel-cartao">
          <StatTopo tamanho="operacao">
            <StatRotulo>Atendidas sem você</StatRotulo>
            <Selo delta={deltaAutonomia} />
          </StatTopo>
          <StatValor>
            <NumeroAnimado valor={m.semIntervencao} />
          </StatValor>
          <StatFrase>
            A conversa seguiu sem ninguém do time precisar entrar
          </StatFrase>
          <StatLegenda>
            {m.conversas > 0
              ? `${m.semIntervencao} de ${m.conversas} conversas (${pct}%), ${p.legenda}`
              : p.legenda}
          </StatLegenda>
        </Stat>

        <Stat
          variant="elevado"
          className="painel-cartao"
          style={{ "--passo": 1 } as React.CSSProperties}
        >
          <StatTopo tamanho="operacao">
            <StatRotulo>Tempo de 1a resposta</StatRotulo>
            <Selo delta={deltaResposta} />
          </StatTopo>
          <StatValor>
            {m.primeiraRespostaMs === null ? (
              formatDuration(null)
            ) : (
              <NumeroAnimado
                valor={m.primeiraRespostaMs}
                formatar={formatDuration}
              />
            )}
          </StatValor>
          <StatFrase>Mediana, contando só as respostas da IA</StatFrase>
          {/* O tamanho da amostra vai na legenda: mediana de 3 atendimentos e
              mediana de 138 não são o mesmo número, e o cartão precisa dizer
              qual dos dois ele é. */}
          <StatLegenda>
            {m.amostraMediana > 0
              ? `${m.amostraMediana} ${
                  m.amostraMediana === 1
                    ? "atendimento medido"
                    : "atendimentos medidos"
                }, ${p.legenda}`
              : p.legenda}
          </StatLegenda>
        </Stat>

        {/* ⚠️ SEM DADO AINDA. Classificar "questionou preço ou prazo" exige uma
            instrumentação que não existe: `conversation_qualifications` guarda
            action, summary e preferência de horário, e nada mais. O cartão
            existe com `XX` para o dono ver o que vem, e a frase fica inteira
            porque é ela que diz o que vai ser medido. Quando a coluna existir,
            este cartão vira um `Stat` normal e o `CartaoEmBreve` some daqui. */}
        <CartaoEmBreve
          rotulo="Objeções que ela segurou"
          frase="Questionou preço ou prazo e a conversa seguiu sem humano"
          legenda={p.legenda}
        />

        <Stat
          variant="elevado"
          className="painel-cartao"
          style={{ "--passo": 3 } as React.CSSProperties}
        >
          <StatTopo tamanho="operacao">
            <StatRotulo>Preferiu confirmar</StatRotulo>
            <Selo delta={deltaConfirmar} />
          </StatTopo>
          <StatValor>
            <NumeroAnimado valor={m.preferiuConfirmar} />
          </StatValor>
          {/* Em zero a frase VIRA a leitura positiva em vez de o cartão sumir:
              zero escalada num período com movimento é notícia boa, e esconder o
              cartão faria o número reaparecer do nada na semana seguinte. */}
          <StatFrase>
            {m.preferiuConfirmar === 0
              ? "Ela não precisou te passar nada no período"
              : "Vezes em que ela passou para você em vez de chutar"}
          </StatFrase>
          <StatLegenda>
            {m.respostasIa > 0
              ? `${m.preferiuConfirmar} de ${m.respostasIa} respostas, ${p.legenda}`
              : p.legenda}
          </StatLegenda>
        </Stat>
      </div>
    </section>
  );
}
