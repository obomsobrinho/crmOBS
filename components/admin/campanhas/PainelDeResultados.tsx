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
  respostasPorEspera,
  resultadoDaCampanha,
  textoDoDiaDeEnvio,
  textoDoTempo,
  type DiaDeEnvio,
  type EnvioParaResultado,
} from "@/lib/prospeccao";
import { FaixaDeNumeros, type CelulaDaFaixa } from "./faixa";
import {
  CabecalhoDoGrafico,
  DestaqueDoGrafico,
  GraficoDeEnviosPorDia,
  GraficoDeTaxaDeitado,
  GraficoDeTaxaEmColunas,
  barrasDeTaxa,
} from "./graficos";

// O PAINEL DE RESULTADOS, em dois modos, os dois cabendo acima da tabela numa
// tela de 1440x900 (dono, 29/10/2026):
// - `resumo` (aba Campanhas, todas ou uma, no período): a faixa, "Envios por
//   dia" e, ao lado, melhor dia e melhor horário em colunas baixas;
// - `campanha` (o detalhe, desde o início): a faixa com o progresso e o desfecho
//   e as três comparações (mensagem, dia, horário) numa linha baixa. "Envios por
//   dia" não entra aqui: dentro de uma campanha todo dia sai a mesma cota.
// Tudo sai de `resultadoDaCampanha` (lib/prospeccao.ts).

function PainelDeResultados({
  modo,
  envios,
  anteriores,
  contra,
  serie,
  quantasVariantes,
  variantes,
  legenda,
}: {
  modo: "resumo" | "campanha";
  /** Os envios da janela (ou da campanha inteira, na fila também). */
  envios: EnvioParaResultado[];
  /** Os da janela anterior igual, para os selos; null no detalhe de uma campanha. */
  anteriores: EnvioParaResultado[] | null;
  /** Contra o que se compara ("os 30 dias anteriores"). */
  contra: string;
  /** Os envios por dia (o gráfico do resumo e os mini gráficos da faixa). */
  serie: DiaDeEnvio[];
  quantasVariantes: number;
  /** Os textos, quando é UMA campanha (no geral, "Variante 1" é a posição em cada campanha). */
  variantes: string[];
  /** "últimos 30 dias" ou "desde o início". */
  legenda: string;
}) {
  const r = useMemo(() => resultadoDaCampanha(envios, quantasVariantes), [envios, quantasVariantes]);
  const antes = useMemo(() => (anteriores ? resultadoDaCampanha(anteriores, quantasVariantes) : null), [anteriores, quantasVariantes]);
  const espera = useMemo(() => respostasPorEspera(envios), [envios]);

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

  const pontos = (k: "enviados" | "responderam") => serie.map((d) => ({ chave: d.dia, rotulo: textoDoDiaDeEnvio(d.dia), valor: d[k] }));
  const selo = (atual: number, anterior: number | undefined, direcao: "neutra" | "maior-melhor") =>
    antes ? <Selo delta={calcularDelta({ atual, anterior: anterior ?? null, direcao, semBase: "sem base" })} contra={contra} /> : undefined;
  const pouco = r.enviados > 0 && r.enviados < AMOSTRA_MINIMA_PROVISORIA;

  const tempo: CelulaDaFaixa = {
    chave: "tempo",
    rotulo: "Tempo até responder",
    valor: r.minutosAteResponder === null ? "Sem dados" : textoDoTempo(r.minutosAteResponder),
    frase: "mediana",
    desenho: { tipo: "colunas", nome: "Respostas", pontos: espera.map((f) => ({ chave: f.chave, rotulo: f.rotulo, valor: f.n })) },
  };

  const celulas: CelulaDaFaixa[] =
    modo === "resumo"
      ? [
          {
            chave: "enviadas",
            rotulo: "Enviadas",
            valor: numeroBR(r.enviados),
            frase: r.falharam > 0 ? `${numeroBR(r.falharam)} falharam, ${legenda}` : legenda,
            selo: selo(r.enviados, antes?.enviados, "neutra"),
            desenho: { tipo: "colunas", nome: "Enviadas", pontos: pontos("enviados"), destaque: "ultima" },
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            complemento: r.taxa === null ? undefined : `${r.taxa}%`,
            frase: "das enviadas",
            selo: selo(r.responderam, antes?.responderam, "maior-melhor"),
            desenho: { tipo: "area", nome: "Responderam", pontos: pontos("responderam") },
          },
          tempo,
          {
            chave: "pararam",
            rotulo: "Pediram para parar",
            valor: numeroBR(r.pararam),
            frase: "parte das respostas",
            classeDoValor: r.pararam > 0 ? "text-warn-ink" : undefined,
            desenho: { tipo: "anel", valor: pct(r.pararam, r.responderam) },
          },
        ]
      : [
          {
            chave: "enviadas",
            rotulo: "Progresso",
            valor: numeroBR(r.enviados + r.falharam),
            complemento: `de ${numeroBR(r.total)}`,
            frase: r.naFila > 0 ? `${numeroBR(r.naFila)} na fila` : "todos já receberam",
            desenho: { tipo: "anel", valor: pct(r.enviados + r.falharam, r.total) },
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            complemento: r.taxa === null ? undefined : `${r.taxa}%`,
            frase: "das enviadas",
            desenho: { tipo: "colunas", nome: "Responderam", pontos: pontos("responderam"), destaque: "maior" },
          },
          tempo,
          {
            chave: "desfecho",
            rotulo: "Desfecho",
            valor: numeroBR(r.pararam),
            complemento: "pediram para parar",
            frase: "",
            classeDoValor: r.pararam > 0 ? "text-warn-ink" : undefined,
            desenho: {
              tipo: "partes",
              partes: [
                { chave: "respondeu", rotulo: "Responderam", n: r.responderam - r.pararam, cor: "var(--chart-1)" },
                { chave: "parou", rotulo: "Pararam", n: r.pararam, cor: "var(--chart-acima)" },
                { chave: "silencio", rotulo: "Sem resposta", n: r.enviados - r.responderam, cor: "var(--chart-barra-neutra)" },
                ...(r.falharam > 0 ? [{ chave: "falhou", rotulo: "Falharam", n: r.falharam, cor: "var(--danger-fill)" }] : []),
              ],
            },
          },
        ];

  const destaqueDoDia = melhorDia !== null && (
    <DestaqueDoGrafico
      slot="resultado-melhor-dia"
      valor={DIAS_DA_SEMANA[melhorDia].longo.replace(/^./, (c) => c.toUpperCase())}
      frase={`${r.porDiaDaSemana[melhorDia].taxa}% responderam`}
    />
  );
  const destaqueDaHora = melhorHora !== null && (
    <DestaqueDoGrafico
      slot="resultado-melhor-hora"
      valor={`${r.porHoraDoEnvio[melhorHora].hora}h às ${r.porHoraDoEnvio[melhorHora].hora + 1}h`}
      frase={`${r.porHoraDoEnvio[melhorHora].taxa}% responderam`}
    />
  );

  return (
    <div className="flex flex-col gap-4" data-slot="resultados" data-modo={modo}>
      <FaixaDeNumeros celulas={celulas} />

      {pouco && (
        <p className="-my-1 text-legenda text-ink-3" data-slot="resultado-amostra">
          Amostra pequena para comparar: {numeroBR(r.enviados)} de {AMOSTRA_MINIMA_PROVISORIA} envios.
        </p>
      )}

      {modo === "resumo" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="conteudo" className="p-5 lg:col-span-2" data-bloco="resultado-dias">
            <GraficoDeEnviosPorDia serie={serie} className="h-44" />
          </Card>
          <Card variant="conteudo" className="flex flex-col gap-4 p-5" data-bloco="resultado-quando">
            <div data-bloco="resultado-semana">
              <CabecalhoDoGrafico titulo="Melhor dia" destaque={destaqueDoDia} />
              <GraficoDeTaxaEmColunas compacto nome="Taxa de resposta por dia da semana" barras={barrasDia} />
            </div>
            <div className="border-t border-line-soft pt-4" data-bloco="resultado-horas">
              <CabecalhoDoGrafico titulo="Melhor horário" destaque={destaqueDaHora} />
              <GraficoDeTaxaEmColunas compacto nome="Taxa de resposta por horário de envio" barras={barrasHora} />
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="conteudo" className="flex flex-col p-5" data-bloco="resultado-variantes">
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
            <GraficoDeTaxaDeitado nome="Taxa de resposta por variante" barras={barrasVariante} className="h-32" />
            {variantes.length > 0 && (
              <details className="mt-auto pt-2 text-apoio text-ink-2">
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
          <Card variant="conteudo" className="p-5" data-bloco="resultado-semana">
            <CabecalhoDoGrafico titulo="Melhor dia da semana" destaque={destaqueDoDia} />
            <GraficoDeTaxaEmColunas nome="Taxa de resposta por dia da semana" barras={barrasDia} className="h-36" />
          </Card>
          <Card variant="conteudo" className="p-5" data-bloco="resultado-horas">
            <CabecalhoDoGrafico titulo="Melhor horário de envio" destaque={destaqueDaHora} />
            <GraficoDeTaxaEmColunas nome="Taxa de resposta por horário de envio" barras={barrasHora} className="h-36" />
          </Card>
        </div>
      )}
    </div>
  );
}

export default memo(PainelDeResultados);
