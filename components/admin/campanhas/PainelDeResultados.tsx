"use client";

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Selo } from "@/components/painel/pecas";
import { calcularDelta } from "@/lib/delta";
import { numeroBR, pct } from "@/lib/format";
import {
  AMOSTRA_MINIMA_PROVISORIA,
  DIAS_DA_SEMANA,
  indiceDaMelhorTaxa,
  resultadoDaCampanha,
  textoDoDiaDeEnvio,
  textoDoTempo,
  type DiaDeEnvio,
  type EnvioParaResultado,
} from "@/lib/prospeccao";
import { FaixaDeNumeros } from "./faixa";
import {
  CabecalhoDoGrafico,
  DestaqueDoGrafico,
  GraficoDeEnviosPorDia,
  GraficoDeTaxaDeitado,
  GraficoDeTaxaEmColunas,
  barrasDeTaxa,
} from "./graficos";

// O PAINEL DE RESULTADOS: no topo da aba Campanhas (todas, ou a escolhida, no
// período) e no detalhe de uma campanha (desde o início). A faixa de números e
// as comparações que decidem a próxima campanha: qual mensagem, qual dia da
// semana e qual horário fazem mais gente responder. "Envios por dia" só no
// geral: dentro de uma campanha todo dia sai a mesma cota (dono, 29/10/2026).
// Tudo sai de `resultadoDaCampanha` (lib/prospeccao.ts).

function PainelDeResultados({
  envios,
  anteriores,
  contra,
  serie,
  quantasVariantes,
  variantes,
  legenda,
}: {
  /** Os envios da janela (ou da campanha inteira). */
  envios: EnvioParaResultado[];
  /** Os da janela anterior igual, para os selos; null no detalhe de uma campanha. */
  anteriores: EnvioParaResultado[] | null;
  /** Contra o que se compara ("os 30 dias anteriores"). */
  contra: string;
  /** Os envios por dia; null esconde o gráfico (o detalhe de uma campanha). */
  serie: DiaDeEnvio[] | null;
  quantasVariantes: number;
  /** Os textos, quando é UMA campanha (no geral, "Variante 1" é a posição em cada campanha). */
  variantes: string[];
  /** "últimos 30 dias" ou "desde o início da campanha". */
  legenda: string;
}) {
  const r = useMemo(() => resultadoDaCampanha(envios, quantasVariantes), [envios, quantasVariantes]);
  const antes = useMemo(() => (anteriores ? resultadoDaCampanha(anteriores, quantasVariantes) : null), [anteriores, quantasVariantes]);

  const melhorVariante = indiceDaMelhorTaxa(r.porVariante);
  const melhorDia = indiceDaMelhorTaxa(r.porDiaDaSemana);
  const melhorHora = indiceDaMelhorTaxa(r.porHoraDoEnvio);

  const barrasVariante = barrasDeTaxa(r.porVariante, melhorVariante, (i) => ({
    chave: `v${i + 1}`,
    eixo: `Variante ${i + 1}`,
    rotulo: variantes[i] ? `Variante ${i + 1}: ${variantes[i].slice(0, 60)}…` : `Variante ${i + 1}`,
  }));
  const barrasDia = barrasDeTaxa(r.porDiaDaSemana, melhorDia, (i) => ({
    chave: String(DIAS_DA_SEMANA[i].dow),
    eixo: DIAS_DA_SEMANA[i].curto,
    rotulo: DIAS_DA_SEMANA[i].longo,
  }));
  const barrasHora = barrasDeTaxa(r.porHoraDoEnvio, melhorHora, (i) => ({
    chave: String(r.porHoraDoEnvio[i].hora),
    eixo: `${r.porHoraDoEnvio[i].hora}h`,
    rotulo: `Enviadas das ${r.porHoraDoEnvio[i].hora}h às ${r.porHoraDoEnvio[i].hora + 1}h`,
  }));

  const pontos = (k: "enviados" | "responderam") =>
    serie?.map((d) => ({ chave: d.dia, rotulo: textoDoDiaDeEnvio(d.dia), valor: d[k] })) ?? [];
  const selo = (atual: number, anterior: number | undefined, direcao: "neutra" | "maior-melhor") =>
    antes ? (
      <Selo delta={calcularDelta({ atual, anterior: anterior ?? null, direcao, semBase: "sem base" })} contra={contra} />
    ) : undefined;
  const pouco = r.enviados > 0 && r.enviados < AMOSTRA_MINIMA_PROVISORIA;

  const cartaoDaVariante = (
    <Card variant="conteudo" className="flex flex-col p-5 lg:col-span-2 xl:col-span-1" data-bloco="resultado-variantes">
      <CabecalhoDoGrafico
        titulo="Melhor mensagem"
        destaque={
          melhorVariante !== null && (
            <DestaqueDoGrafico
              slot="resultado-melhor-variante"
              valor={`Variante ${melhorVariante + 1}`}
              frase={`${r.porVariante[melhorVariante].taxa}% responderam`}
            />
          )
        }
      />
      <GraficoDeTaxaDeitado nome="Taxa de resposta por variante" barras={barrasVariante} />
      {variantes.length > 0 && (
        <details className="mt-auto pt-4 text-apoio text-ink-2">
          <summary className="cursor-pointer text-legenda text-ink-3">Ver os textos</summary>
          <ol className="mt-2 flex flex-col gap-2">
            {variantes.map((t, i) => (
              <li key={i}>
                <span className="font-semibold text-ink">{i + 1}.</span> {t}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-4" data-slot="resultados">
      <FaixaDeNumeros
        celulas={[
          {
            chave: "enviadas",
            rotulo: "Enviadas",
            valor: numeroBR(r.enviados),
            frase: r.falharam > 0 ? `${numeroBR(r.falharam)} falharam, ${legenda}` : legenda,
            selo: selo(r.enviados, antes?.enviados, "neutra"),
            serie: serie && { pontos: pontos("enviados"), nome: "Enviadas", formatar: numeroBR },
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            complemento: r.taxa === null ? undefined : `${r.taxa}%`,
            frase: "das mensagens enviadas",
            selo: selo(r.responderam, antes?.responderam, "maior-melhor"),
            serie: serie && { pontos: pontos("responderam"), nome: "Responderam", formatar: numeroBR },
          },
          {
            chave: "tempo",
            rotulo: "Tempo até responder",
            valor: r.minutosAteResponder === null ? "Sem dados" : textoDoTempo(r.minutosAteResponder),
            frase: "metade responde até aí",
          },
          {
            chave: "pararam",
            rotulo: "Pediram para parar",
            valor: numeroBR(r.pararam),
            complemento: r.responderam > 0 ? `${pct(r.pararam, r.responderam)}%` : undefined,
            frase: "das respostas",
            classeDoValor: r.pararam > 0 ? "text-warn-ink" : undefined,
          },
        ]}
      />

      {pouco && (
        <p className="text-legenda text-ink-3" data-slot="resultado-amostra">
          Amostra pequena para comparar: {numeroBR(r.enviados)} de {AMOSTRA_MINIMA_PROVISORIA} envios.
        </p>
      )}

      {serie ? (
        // O RESUMO (todas as campanhas): só o que vale somado. Envios por dia e, ao lado, quando o lead
        // responde mais, em colunas baixas. A melhor MENSAGEM fica no detalhe: cada campanha tem os seus textos.
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="conteudo" className="p-5 lg:col-span-2" data-bloco="resultado-dias">
            <GraficoDeEnviosPorDia serie={serie} className="h-44" />
          </Card>
          <Card variant="conteudo" className="flex flex-col gap-4 p-5" data-bloco="resultado-quando">
            <div data-bloco="resultado-semana">
              <CabecalhoDoGrafico
                titulo="Melhor dia"
                destaque={melhorDia !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-dia"
                  valor={DIAS_DA_SEMANA[melhorDia].longo.replace(/^./, (c) => c.toUpperCase())}
                  frase={`${r.porDiaDaSemana[melhorDia].taxa}% responderam`}
                />
              )}
              />
              <GraficoDeTaxaEmColunas compacto nome="Taxa de resposta por dia da semana" barras={barrasDia} />
            </div>
            <div className="border-t border-line-soft pt-4" data-bloco="resultado-horas">
              <CabecalhoDoGrafico
                titulo="Melhor horário"
                destaque={melhorHora !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-hora"
                  valor={`${r.porHoraDoEnvio[melhorHora].hora}h às ${r.porHoraDoEnvio[melhorHora].hora + 1}h`}
                  frase={`${r.porHoraDoEnvio[melhorHora].taxa}% responderam`}
                />
              )}
              />
              <GraficoDeTaxaEmColunas compacto nome="Taxa de resposta por horário de envio" barras={barrasHora} />
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {cartaoDaVariante}
          <Card variant="conteudo" className="p-5" data-bloco="resultado-semana">
            <CabecalhoDoGrafico
              titulo="Melhor dia da semana"
              destaque={melhorDia !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-dia"
                  valor={DIAS_DA_SEMANA[melhorDia].longo.replace(/^./, (c) => c.toUpperCase())}
                  frase={`${r.porDiaDaSemana[melhorDia].taxa}% responderam`}
                />
              )}
            />
            <GraficoDeTaxaEmColunas nome="Taxa de resposta por dia da semana" barras={barrasDia} />
          </Card>
          <Card variant="conteudo" className="p-5" data-bloco="resultado-horas">
            <CabecalhoDoGrafico
              titulo="Melhor horário de envio"
              destaque={melhorHora !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-hora"
                  valor={`${r.porHoraDoEnvio[melhorHora].hora}h às ${r.porHoraDoEnvio[melhorHora].hora + 1}h`}
                  frase={`${r.porHoraDoEnvio[melhorHora].taxa}% responderam`}
                />
              )}
            />
            <GraficoDeTaxaEmColunas nome="Taxa de resposta por horário de envio" barras={barrasHora} />
          </Card>
        </div>
      )}
    </div>
  );
}

export default memo(PainelDeResultados);
