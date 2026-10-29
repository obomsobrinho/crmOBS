"use client";

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import IndicadorComparado from "@/components/admin/IndicadorComparado";
import { Indicador } from "@/components/admin/pecas";
import { calcularDelta } from "@/lib/delta";
import { numeroBR, plural } from "@/lib/format";
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
import {
  CabecalhoDoGrafico,
  DestaqueDoGrafico,
  GraficoDeEnviosPorDia,
  GraficoDeTaxaDeitado,
  GraficoDeTaxaEmColunas,
  barrasDeTaxa,
} from "./graficos";

// O PAINEL DE RESULTADOS: o mesmo bloco no topo da aba Campanhas (todas, ou a
// escolhida, no período) e no detalhe de uma campanha (desde o início). Cinco
// números, os envios por dia e as três comparações que decidem a próxima
// campanha: qual mensagem, qual dia da semana e qual horário fazem mais gente
// responder. Tudo sai de `resultadoDaCampanha` (lib/prospeccao.ts).

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
  serie: DiaDeEnvio[];
  quantasVariantes: number;
  /** Os textos, quando é UMA campanha (no geral, "Variante 1" é a posição em cada campanha). */
  variantes: string[];
  /** "últimos 30 dias" ou "desde o início". */
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
    serie.map((d) => ({ chave: d.dia, rotulo: textoDoDiaDeEnvio(d.dia), valor: d[k] }));
  const comparar = (atual: number, anterior: number | undefined, direcao: "neutra" | "maior-melhor") =>
    antes ? { delta: calcularDelta({ atual, anterior: anterior ?? null, direcao, semBase: "sem envios antes" }), contra } : null;
  const pouco = r.enviados < AMOSTRA_MINIMA_PROVISORIA;
  const respostaMaisComum = [...r.porHoraDaResposta].sort((a, b) => b.respostas - a.respostas)[0];

  return (
    <div className="flex flex-col gap-4" data-slot="resultados">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-slot="resultado-numeros">
        <IndicadorComparado
          variant="elevado"
          rotulo="Enviadas"
          valor={numeroBR(r.enviados)}
          frase={r.falharam > 0 ? `${numeroBR(r.falharam)} ${plural(r.falharam, "falhou", "falharam")}` : "Nenhuma falhou"}
          legenda={legenda}
          comparacao={comparar(r.enviados, antes?.enviados, "neutra")}
          serie={{ pontos: pontos("enviados"), nome: "Enviadas", formatar: numeroBR }}
          data-indicador="enviadas"
        />
        <IndicadorComparado
          variant="elevado"
          rotulo="Responderam"
          valor={numeroBR(r.responderam)}
          frase="Caíram em Conversas e a IA seguiu"
          legenda={legenda}
          comparacao={comparar(r.responderam, antes?.responderam, "maior-melhor")}
          serie={{ pontos: pontos("responderam"), nome: "Responderam", formatar: numeroBR }}
          data-indicador="responderam"
        />
        <Indicador
          variant="elevado"
          rotulo="Taxa de resposta"
          valor={r.taxa === null ? "Sem dados" : `${r.taxa}%`}
          frase={r.taxa === null ? "Sem envios ainda" : `${numeroBR(r.responderam)} de ${numeroBR(r.enviados)} enviadas`}
          legenda={legenda}
          data-indicador="taxa"
        />
        <Indicador
          variant="elevado"
          rotulo="Tempo até responder"
          valor={r.minutosAteResponder === null ? "Sem dados" : textoDoTempo(r.minutosAteResponder)}
          frase={
            respostaMaisComum ? `Metade responde até aí. Mais respostas às ${respostaMaisComum.hora}h` : "Ninguém respondeu ainda"
          }
          legenda={legenda}
          data-indicador="tempo"
        />
        <Indicador
          variant="elevado"
          rotulo="Pediram para parar"
          valor={numeroBR(r.pararam)}
          frase="Fora de toda lista futura"
          legenda={legenda}
          classeDoValor={r.pararam > 0 ? "text-warn-ink" : undefined}
          className="col-span-2 md:col-span-1"
          data-indicador="pararam"
        />
      </div>

      {pouco && r.enviados > 0 && (
        <p className="text-legenda text-ink-3" data-slot="resultado-amostra">
          Ainda pouco para comparar mensagem, dia e horário com segurança ({numeroBR(r.enviados)} de{" "}
          {AMOSTRA_MINIMA_PROVISORIA} envios). A 10 por dia, leva algumas semanas.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card variant="conteudo" className="p-6 xl:col-span-2" data-bloco="resultado-dias">
          <GraficoDeEnviosPorDia serie={serie} legenda={legenda.charAt(0).toLowerCase() + legenda.slice(1)} />
        </Card>
        <Card variant="conteudo" className="flex flex-col p-6" data-bloco="resultado-variantes">
          <CabecalhoDoGrafico
            titulo="Melhor mensagem"
            frase="A taxa de resposta de cada variante. Elas se revezam na ordem da fila."
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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="conteudo" className="p-6" data-bloco="resultado-semana">
          <CabecalhoDoGrafico
            titulo="Melhor dia da semana"
            frase="A taxa de resposta pelo dia em que a mensagem saiu."
            destaque={
              melhorDia !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-dia"
                  valor={DIAS_DA_SEMANA[melhorDia].longo.replace(/^./, (c) => c.toUpperCase())}
                  frase={`${r.porDiaDaSemana[melhorDia].taxa}% responderam`}
                />
              )
            }
          />
          <GraficoDeTaxaEmColunas nome="Taxa de resposta por dia da semana" barras={barrasDia} />
        </Card>
        <Card variant="conteudo" className="p-6" data-bloco="resultado-horas">
          <CabecalhoDoGrafico
            titulo="Melhor horário de envio"
            frase="Os envios se espalham das 8h às 18h de propósito, para cada hora ter a sua taxa."
            destaque={
              melhorHora !== null && (
                <DestaqueDoGrafico
                  slot="resultado-melhor-hora"
                  valor={`${r.porHoraDoEnvio[melhorHora].hora}h às ${r.porHoraDoEnvio[melhorHora].hora + 1}h`}
                  frase={`${r.porHoraDoEnvio[melhorHora].taxa}% responderam`}
                />
              )
            }
          />
          <GraficoDeTaxaEmColunas nome="Taxa de resposta por horário de envio" barras={barrasHora} />
        </Card>
      </div>
    </div>
  );
}

export default memo(PainelDeResultados);
