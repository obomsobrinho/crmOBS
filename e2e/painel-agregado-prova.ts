import { expect } from "@playwright/test";
import type { LinhaRef, QualRef } from "./painel-agregado-referencia";
import { NUMERO_AVISOS } from "./painel-agregado-referencia";
import {
  barrasDasSeries,
  diasDoMes,
  metricsDaJanela,
  resumoDeValorAgregado,
  type AgregadoDoPainel,
  type JanelasDoPainel,
} from "../lib/painel-agregado";
import { barras, computeMetrics, primeirasMensagens, type JanelaMsg } from "../lib/metrics";
import { naJanela } from "../lib/periodo";
import { barrasDeHora, barrasDeHoraDoCubo } from "../lib/painel";
import { semNumeroDeAvisos } from "../lib/avisos";
import { mesFechado, resumoDeValor } from "../lib/valor";
import type { BusinessHours } from "../lib/agent-prompt";

/**
 * A PROVA "os números continuam idênticos" (R-04): o painel calculado das
 * AGREGAÇÕES (`agregado`, venha ele do banco ou da referência) tem que ser igual
 * ao painel calculado das LINHAS pelas funções antigas (resumoDeValor,
 * computeMetrics, barras, barrasDeHora), janela a janela: as de operação e de
 * movimento (atual e anterior), o mês fechado e o acumulado, as cinco larguras
 * de barras e o gráfico de hora (com a soma de "fora" fechando com a manchete).
 *
 * `msgs` e `quals` são TODAS as linhas do tenant, que o chamador leu inteiras.
 */
export function provarIgualdade(o: {
  agregado: AgregadoDoPainel;
  msgs: LinhaRef[];
  quals: QualRef[];
  plano: JanelasDoPainel;
  agora: number;
  hours: BusinessHours | null;
}) {
  const { agregado, plano, agora, hours } = o;
  const mes = mesFechado(new Date(agora));
  const inicioMs = Date.parse(mes.inicioISO);
  const fimMs = Date.parse(mes.fimISO);

  const todas = semNumeroDeAvisos<LinhaRef>(
    o.msgs.filter((m) => Date.parse(m.created_at) < agora),
    NUMERO_AVISOS,
    (m) => m.phone
  );
  const todasQuals = semNumeroDeAvisos(o.quals, NUMERO_AVISOS, (q) => q.phone);
  const primeiras = primeirasMensagens(todas as JanelaMsg[]);
  const recorte = (de: number, ate: number) => ({
    msgs: todas.filter((m) => naJanela(Date.parse(m.created_at), de, ate)),
    quals: todasQuals.filter((q) => naJanela(Date.parse(q.created_at), de, ate)),
  });

  plano.lista.forEach((j, i) => {
    const r = recorte(j.de, j.ate);
    const velhas = computeMetrics({ ...r, primeiras, de: j.de, ate: j.ate } as Parameters<typeof computeMetrics>[0]);
    expect(metricsDaJanela(agregado.janela(i + 1)), `janela ${i + 1}`).toEqual(velhas);
  });

  for (const dias of [1, 7, 14, 15, 30]) {
    const antigas = barras(recorte(agora - dias * 864e5, agora).msgs as JanelaMsg[], dias, agora);
    expect(barrasDasSeries(agregado.series, dias, agora), `barras ${dias}`).toEqual(antigas);
  }

  const noMes = recorte(inicioMs, fimMs);
  const resumoMes = resumoDeValorAgregado({
    janela: agregado.janela(plano.mes!),
    series: agregado.series,
    hours,
    mes: diasDoMes(mes.ano, mes.mes),
  });
  expect(resumoMes, "valor do mês fechado").toEqual(
    resumoDeValor({ msgs: noMes.msgs, quals: noMes.quals, hours })
  );
  const resumoTudo = resumoDeValorAgregado({
    janela: agregado.janela(0),
    series: agregado.series,
    hours,
    mes: null,
  });
  expect(resumoTudo, "valor acumulado").toEqual(
    resumoDeValor({ msgs: todas, quals: todasQuals, hours })
  );

  for (const [cubo, doPeriodo, resumo] of [
    [agregado.series.cubo_mes, noMes.msgs, resumoMes],
    [agregado.series.cubo, todas, resumoTudo],
  ] as const) {
    const novas = barrasDeHoraDoCubo(cubo, hours);
    expect(novas, "gráfico de hora").toEqual(barrasDeHora({ msgs: doPeriodo, hours }));
    if (resumo.atendidasForaDoHorario !== null) {
      expect(novas.reduce((s, c) => s + c.fora, 0), "soma do gráfico = manchete").toBe(
        resumo.atendidasForaDoHorario
      );
    }
  }

  // A massa não é decorativa: tem que haver número de verdade para comparar.
  expect(agregado.janela(0).conversas).toBeGreaterThan(10);
  expect(agregado.janela(0).dif_n).toBeGreaterThan(5);
  expect(resumoTudo.atendidasEmFimDeSemanaOuFeriado).toBeGreaterThan(0);
  expect(resumoTudo.pico).not.toBeNull();
}
