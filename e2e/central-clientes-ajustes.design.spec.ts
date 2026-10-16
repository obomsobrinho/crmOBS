import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { idFalso } from "../app/design/clientes/dados";
import {
  barrasComRitmo,
  descricaoDaSelecao,
  ehMesIso,
  leituraDoHistorico,
  mesesDoJson,
  mesesDoSeletor,
  nomeDoMes,
  ritmoDaBarra,
  tamanhoDoCentroDoDonut,
  trechosDoRitmo,
  usoBruto,
  usoDeTodoOPeriodo,
  usoDoIntervalo,
  usoDoMes,
  usoDoPeriodo,
  type BarraDeUso,
} from "../lib/admin-cliente";
import {
  DERIVACAO_DO_LIMITE,
  LIMITE_PADRAO_TOKENS,
  LIMITE_POR_PLANO,
  fracaoDoMesSP,
  limiteDaEmpresa,
  limiteDerivadoDoPlano,
  origemDoLimite,
  posicaoNoRitmo,
  ritmoDoMes,
  rotuloDaOrigemDoLimite,
  textoDoRitmo,
  tokensCurto,
} from "../lib/custo-ia";
import { cambioDaResposta, custoCurto, dataParaOlinda, notaDoCambio, urlDaPtax } from "../lib/cambio";
import { PLANS } from "../lib/billing";
import { calcularDelta } from "../lib/delta";
import {
  diasEntre,
  ehDiaIso,
  instantesDaJanela,
  janelaAnterior,
  janelaDeTudo,
  janelaDoChip,
  janelaDoIntervalo,
  janelaDoMesCivil,
  picosDeHistorico,
  picosDoJson,
  resumoDePicos,
  textoDaFaixa,
} from "../lib/picos";
import { somarDias } from "../lib/fuso";
import { linhasDaAssinatura, textoSemAssinatura } from "../lib/admin-conta";
import { chavesDoDiaCivil } from "../lib/metrics";
import { diaIsoSP, FUSO } from "../lib/fuso";

// AJUSTES DO DONO NA CENTRAL (15/10/2026, sobre as entregas 1 e 2): o Dia de hoje desde as
// 00h, colunas acima do ritmo, mapa de pico em faixas, financeiro que só mostra o que vale para
// a situação, filtro por ícone, seletor de meses passados e de todo o período, medidor com
// trilha, balão sempre por cima, rolagem só no cartão e o que não pode voltar. Preview com
// dados FALSOS; o banco é o auth.spec e a conta pura está aqui embaixo.

const ID = idFalso;
const detalhe = (n: number, aba: string) => `/design/clientes/detalhe?cliente=${ID(n)}&aba=${aba}`;
const uso = (page: Page) => page.locator('[data-slot="central-aba-uso"]');

const AGORA = Date.parse("2026-10-14T18:00:00Z"); // 15h em São Paulo, quarta

const colunasDoDia = () =>
  (Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(new Date())) % 24) + 1;

function barra(chave: string, usados: number): BarraDeUso {
  return {
    chave,
    eixo: chave,
    rotulo: chave,
    turnos: 1,
    tokens: { entrada: usados, cache: 0, saida: 0 },
    usados,
    custoUsd: null,
  };
}

test.describe("Ajustes da central: contas puras (lib)", () => {
  test("o Dia é hoje desde as 00h até a hora atual, em São Paulo, e não uma janela rolante", () => {
    const agora = chavesDoDiaCivil(AGORA).map((c) => c.chave);
    expect(agora).toHaveLength(16);
    expect(agora[0]).toBe("2026-10-14T00");
    expect(agora[15]).toBe("2026-10-14T15");
    // 00h10 em São Paulo (03h10 UTC): uma coluna só. 23h59: as 24.
    expect(chavesDoDiaCivil(Date.parse("2026-10-15T03:10:00Z")).map((c) => c.chave)).toEqual(["2026-10-15T00"]);
    expect(chavesDoDiaCivil(Date.parse("2026-10-16T02:59:00Z"))).toHaveLength(24);
  });

  test("a coluna acima do ritmo é separada da que não passa, e só passa quem fica estritamente acima", () => {
    // Por mês o ritmo é o próprio limite: `barrasComRitmo` com o limite 100 compara cada coluna com 100.
    const r = barrasComRitmo([barra("a", 50), barra("b", 100), barra("c", 150)], 100, "mes");
    expect(r.map((b) => b.passou)).toEqual([false, false, true]);
    expect(r.map((b) => [b.abaixo, b.acima])).toEqual([
      [50, 0],
      [100, 0],
      [0, 150],
    ]);
    expect(r[2].excessoPct).toBe(50);
    // Sem ritmo (zero), nada é "acima": nunca divide por zero.
    expect(barrasComRitmo([barra("a", 5)], 0, "mes")[0].passou).toBe(false);
  });

  test("por mês, o ritmo é o próprio limite do mês", () => {
    expect(ritmoDaBarra(10_000_000, "2026-10", "mes")).toBe(10_000_000);
  });

  test("o ritmo é dos dias do mês de CADA coluna: um período que atravessa dois meses tem um trecho por mês", () => {
    // O Mês (30 dias com hoje) em 14/10 vai de 15/09 a 14/10: setembro tem 30 dias, outubro 31.
    const mes = usoDoPeriodo(usoBruto({ dias: [["2026-09-20", 5, 3_000_000, 0, 10]] }, []), "mes", AGORA, null);
    const r = barrasComRitmo(mes.barras, 6_000_000, mes.unidade);
    expect(r[0].chave).toBe("2026-09-15");
    expect(r[0].ritmo).toBeCloseTo(6_000_000 / 30, 6);
    expect(r[r.length - 1].chave).toBe("2026-10-14");
    expect(r[r.length - 1].ritmo).toBeCloseTo(6_000_000 / 31, 6);
    const trechos = trechosDoRitmo(r);
    expect(trechos).toHaveLength(2);
    expect(trechos[0]).toMatchObject({ de: "15/09", ate: "30/09" });
    expect(trechos[1]).toMatchObject({ de: "01/10", ate: "14/10" });
    // Dentro de um mês só, um trecho só; por hora é o ritmo do mês dividido por 24.
    expect(trechosDoRitmo(barrasComRitmo(usoDoMes([], "2026-09", AGORA, null).barras, 3_000_000, "dia"))).toHaveLength(1);
    expect(ritmoDaBarra(3_100_000, "2026-12-24T09", "hora")).toBeCloseTo(3_100_000 / 31 / 24, 6);
  });

  test("onde o uso está contra o ritmo é UMA regra (posicaoNoRitmo), a mesma da barra e da frase", () => {
    const p = posicaoNoRitmo(2_000_000, 10_000_000, AGORA);
    expect(p.idealPct).toBeCloseTo(fracaoDoMesSP(AGORA) * 100, 10);
    expect(p.estado).toBe(2_000_000 <= 10_000_000 * fracaoDoMesSP(AGORA) ? "abaixo" : "acima");
    // Sem uso: abaixo (menos ou igual é bom), mesmo sem frase de ritmo.
    expect(posicaoNoRitmo(0, 10_000_000, AGORA).estado).toBe("abaixo");
    expect(ritmoDoMes(0, 10_000_000, AGORA)).toBeNull();
    // A frase só usa a mesma posição.
    expect(ritmoDoMes(9_000_000, 10_000_000, AGORA)?.estado).toBe(posicaoNoRitmo(9_000_000, 10_000_000, AGORA).estado);
  });

  test("a seleção do período tem UMA descrição (legenda, chave, rótulo e consulta da rota)", () => {
    expect(descricaoDaSelecao({ tipo: "periodo", periodo: "semana" })).toMatchObject({ chave: "periodo:semana", rotulo: null, consulta: null });
    expect(descricaoDaSelecao({ tipo: "mes", mes: "2026-09" })).toEqual({
      chave: "2026-09",
      legenda: "em setembro de 2026",
      rotulo: "setembro de 2026",
      consulta: "mes=2026-09",
    });
    expect(descricaoDaSelecao({ tipo: "tudo" })).toMatchObject({ rotulo: "Todo o período", consulta: "tudo=1" });
    expect(descricaoDaSelecao({ tipo: "intervalo", de: "2026-12-22", ate: "2026-12-28" })).toMatchObject({
      legenda: "de 22/12 a 28/12",
      rotulo: "22/12 a 28/12",
      consulta: "de=2026-12-22&ate=2026-12-28",
    });
  });

  test("o que ler de cada seleção histórica é uma regra pura (servidor e preview leem pelas mesmas janelas)", () => {
    const hoje = "2026-10-14";
    // Um mês passado lê o mês inteiro e o mês anterior; os picos vão até o fim do mês.
    const mes = leituraDoHistorico({ tipo: "mes", mes: "2026-09" }, hoje, null);
    expect(mes.dias).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(mes.anteriores).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(mes.meses).toBeNull();
    // Todo o período lê meses (só com uso) e nenhum dia.
    expect(leituraDoHistorico({ tipo: "tudo" }, hoje, "2026-03-09")).toMatchObject({
      janela: { de: "2026-03-09", ate: hoje },
      dias: null,
      anteriores: null,
      meses: { de: "2026-03-09", ate: hoje },
    });
    expect(leituraDoHistorico({ tipo: "tudo" }, hoje, null).meses).toBeNull();
    // Um intervalo curto lê dias e o intervalo anterior; um longo, só meses.
    expect(leituraDoHistorico({ tipo: "intervalo", de: "2026-10-08", ate: "2026-10-14" }, hoje, null)).toMatchObject({
      dias: { de: "2026-10-08", ate: "2026-10-14" },
      anteriores: { de: "2026-10-01", ate: "2026-10-07" },
      meses: null,
    });
    const longo = leituraDoHistorico({ tipo: "intervalo", de: "2026-01-10", ate: "2026-04-20" }, hoje, null);
    expect(longo.dias).toBeNull();
    expect(longo.anteriores).toBeNull();
    expect(longo.meses).toEqual({ de: "2026-01-10", ate: "2026-04-20" });
    expect(() => leituraDoHistorico({ tipo: "intervalo", de: "2026-10-20", ate: "2026-10-10" }, hoje, null)).toThrow();
  });

  test("os meses do seletor vão do atual até o da primeira atividade, nunca antes", () => {
    expect(mesesDoSeletor("2026-08-20", AGORA)).toEqual(["2026-10", "2026-09", "2026-08"]);
    // Sem atividade (ou data torta ou no futuro): só o mês atual.
    expect(mesesDoSeletor(null, AGORA)).toEqual(["2026-10"]);
    expect(mesesDoSeletor("lixo", AGORA)).toEqual(["2026-10"]);
    expect(mesesDoSeletor("2027-01-05", AGORA)).toEqual(["2026-10"]);
    // Vira o ano.
    const virada = mesesDoSeletor("2025-11-30", AGORA);
    expect(virada).toHaveLength(12);
    expect(virada.slice(-3)).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(nomeDoMes("2026-09")).toBe("setembro de 2026");
    expect(ehMesIso("2026-09")).toBe(true);
    expect(ehMesIso("2026-13")).toBe(false);
    expect(ehMesIso("2026-9")).toBe(false);
    expect(ehMesIso("setembro")).toBe(false);
  });

  test("um mês passado tem uma coluna por dia (buraco incluído); o atual vai só até hoje", () => {
    const dias = [
      { dia: "2026-09-03", turnos: 2, tokens: { entrada: 1_000, cache: 0, saida: 10 } },
      { dia: "2026-09-30", turnos: 1, tokens: { entrada: 500, cache: 0, saida: 5 } },
    ];
    const set = usoDoMes(dias, "2026-09", AGORA, "gpt-5.4-mini");
    expect(set.barras).toHaveLength(30);
    expect(set.unidade).toBe("dia");
    expect(set.periodo).toBeNull();
    expect(set.legenda).toBe("em setembro de 2026");
    expect(set.total.turnos).toBe(3);
    expect(set.total.usados).toBe(1_000 + 10 + 500 + 5);
    expect(set.maior?.chave).toBe("2026-09-03");
    expect(set.barras[2]).toMatchObject({ chave: "2026-09-03", eixo: "03/09", rotulo: "quinta, 03/09" });
    // O ritmo desse mês usa os 30 dias dele (setembro), não os 31 do mês do relógio.
    expect(ritmoDaBarra(3_000_000, set.barras[0].chave, set.unidade)).toBeCloseTo(100_000, 6);
    // Outubro, no dia 14: 14 colunas (do dia 1 até hoje).
    expect(usoDoMes([], "2026-10", AGORA, null).barras).toHaveLength(14);
  });

  test("todo o período tem uma coluna por mês, do primeiro ao atual, mês vazio incluído", () => {
    const meses = mesesDoJson([
      ["2026-08", 4, 100, 0, 1],
      ["2026-10", 6, 300, 0, 3],
      ["lixo", 1, 1, 1, 1],
    ]);
    expect(meses).toHaveLength(2);
    const r = usoDeTodoOPeriodo(meses, "2026-08-11", AGORA, null);
    expect(r.unidade).toBe("mes");
    expect(r.barras.map((b) => b.chave)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(r.barras[1].usados).toBe(0);
    expect(r.barras[0]).toMatchObject({ eixo: "ago/26", rotulo: "agosto de 2026" });
    expect(r.total.turnos).toBe(10);
    expect(r.legenda).toBe("desde agosto de 2026");
    // Sem atividade nenhuma: só o mês atual, vazio.
    expect(usoDeTodoOPeriodo([], null, AGORA, null).barras).toHaveLength(1);
  });

  // --- Horários de pico (lib/picos.ts, pura) ---------------------------------------------------------

  /** O histórico falso: 3 semanas de turnos por hora, com a segunda-feira às 16h como o horário mais cheio. */
  function historico(): { dia: string; horas: number[] }[] {
    const lista: { dia: string; horas: number[] }[] = [];
    for (let dia = "2026-09-21"; dia <= "2026-10-14"; dia = somarDias(dia, 1)) {
      const horas = Array.from({ length: 24 }, () => 0);
      const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
      if (dow !== 0) {
        horas[10] = 2;
        horas[14] = 3;
        if (dow === 1) horas[16] = 9;
        if (dia === "2026-10-12") horas[16] = 40; // o dia de pico
      }
      lista.push({ dia, horas });
    }
    return lista;
  }
  const HOJE = "2026-10-14";

  test("as janelas: chips, mês civil, tudo, intervalo (cortado em hoje) e a anterior de mesmo tamanho", () => {
    expect(janelaDoChip("dia", HOJE)).toEqual({ de: "2026-10-14", ate: "2026-10-14" });
    expect(janelaDoChip("semana", HOJE)).toEqual({ de: "2026-10-08", ate: "2026-10-14" });
    expect(janelaDoChip("mes", HOJE)).toEqual({ de: "2026-09-15", ate: "2026-10-14" });
    expect(janelaDoMesCivil("2026-09", HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(janelaDoMesCivil("2026-10", HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-14" });
    expect(janelaDeTudo("2026-08-03", HOJE)).toEqual({ de: "2026-08-03", ate: "2026-10-14" });
    expect(janelaDeTudo(null, HOJE)).toEqual({ de: "2026-10-14", ate: "2026-10-14" });
    // O intervalo do dono: a semana do Natal e dezembro inteiro (cortados em hoje se passam dele).
    expect(janelaDoIntervalo("2025-12-22", "2025-12-28", HOJE)).toEqual({ de: "2025-12-22", ate: "2025-12-28" });
    expect(janelaDoIntervalo("2026-10-01", "2026-12-31", HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-14" });
    expect(janelaDoIntervalo("2026-10-20", "2026-10-25", HOJE)).toBeNull(); // começa depois de hoje
    expect(janelaDoIntervalo("2026-10-10", "2026-10-01", HOJE)).toBeNull(); // invertido
    expect(janelaDoIntervalo("2026-02-30", "2026-03-01", HOJE)).toBeNull(); // data que não existe
    expect(janelaDoIntervalo("2000-01-01", "2026-10-14", HOJE)).toBeNull(); // passa dos 1830 dias
    expect(janelaDoIntervalo("lixo", null, HOJE)).toBeNull();
    expect(ehDiaIso("2026-10-14")).toBe(true);
    expect(ehDiaIso("2026-13-01")).toBe(false);
    expect(diasEntre("2026-10-08", "2026-10-14")).toBe(7);
    expect(janelaAnterior({ de: "2026-10-08", ate: "2026-10-14" })).toEqual({ de: "2026-10-01", ate: "2026-10-07" });
    // Os instantes que vão ao banco: meia-noite de São Paulo (UTC-3) até a meia-noite do dia seguinte.
    expect(instantesDaJanela({ de: "2026-10-08", ate: "2026-10-14" })).toEqual({
      de: "2026-10-08T03:00:00.000Z",
      ate: "2026-10-15T03:00:00.000Z",
    });
  });

  test("o resumo dos picos: horário (dia da semana e faixa de 3h), dia de pico (data), média e as duas séries", () => {
    const hist = historico();
    const semana = janelaDoChip("semana", HOJE); // 08/10 (quinta) a 14/10 (quarta)
    const r = resumoDePicos(picosDeHistorico(hist, semana), semana, { hoje: HOJE, primeira: "2026-09-21" });
    // O horário de pico é a faixa mais cheia SOMANDO todos os dias, a mesma coluna de "Por horário do dia".
    // 12/10 (segunda) tem 40 turnos às 16h: a faixa das 15h às 18h soma 40 na janela.
    expect(r.horarioDePico).toEqual({ faixa: 5, n: 40, texto: "15h às 18h" });
    const destacada = r.porFaixa.find((b) => b.pico)!;
    expect(r.horarioDePico).toMatchObject({ faixa: Number(destacada.chave), n: destacada.n, texto: destacada.rotulo });
    // O dia de pico é a DATA, com o dia da semana.
    expect(r.diaDePico).toMatchObject({ dia: "2026-10-12", n: 2 + 3 + 40 });
    expect(r.diaDePico?.texto).toBe("segunda, 12/10");
    // Média por dia = total / os 7 dias da janela.
    expect(r.dias).toBe(7);
    expect(r.media).toBeCloseTo(r.total / 7, 10);
    // Até 15 dias: UMA coluna por DATA.
    expect(r.porDia.modo).toBe("data");
    expect(r.porDia.barras.map((b) => b.chave)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(r.porDia.barras.filter((b) => b.pico).map((b) => b.chave)).toEqual(["2026-10-12"]);
    expect(r.porDia.barras[3].n).toBe(0); // 11/10 é domingo: buraco, não coluna que some
    // Por horário: 8 faixas, só a do pico é "pico", e a soma das faixas é o total.
    expect(r.porFaixa).toHaveLength(8);
    expect(r.porFaixa.reduce((s, b) => s + b.n, 0)).toBe(r.total);
    expect(r.porFaixa.filter((b) => b.pico)).toHaveLength(1);
    expect(r.porFaixa.find((b) => b.pico)?.rotulo).toBe("15h às 18h");
    // As duas séries empilhadas fecham: uma é sempre zero.
    for (const b of [...r.porDia.barras, ...r.porFaixa]) expect(b.demais + b.destaque).toBe(b.n);
    expect(textoDaFaixa(7)).toBe("21h às 00h");
  });

  test("acima de 15 dias o 'Por dia' soma por dia da semana (segunda a domingo); o dia de pico continua sendo uma data", () => {
    const hist = historico();
    const mes = janelaDoChip("mes", HOJE);
    const r = resumoDePicos(picosDeHistorico(hist, mes), mes, { hoje: HOJE, primeira: "2026-09-21" });
    expect(r.porDia.modo).toBe("semana");
    expect(r.porDia.barras.map((b) => b.eixo)).toEqual(["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]);
    expect(r.porDia.barras[6].n).toBe(0); // domingo sem turno
    expect(r.porDia.barras.reduce((s, b) => s + b.n, 0)).toBe(r.total);
    expect(r.porDia.barras.find((b) => b.pico)?.rotulo).toBe("segunda");
    expect(r.diaDePico?.dia).toBe("2026-10-12");
    // A janela nunca começa antes do primeiro turno: de 15/09 a 14/10 com a primeira em 21/09 são 24 dias.
    expect(r.dias).toBe(24);
    // Sem nenhum turno: tudo vazio, nunca um número inventado.
    const vazio = resumoDePicos({ dias: [], cubo: [] }, mes, { hoje: HOJE, primeira: null });
    expect(vazio.horarioDePico).toBeNull();
    expect(vazio.diaDePico).toBeNull();
    expect(vazio.total).toBe(0);
    expect(vazio.media).toBe(0);
    expect(resumoDePicos({ dias: [], cubo: [] }, { de: "2026-10-20", ate: "2026-10-25" }, { hoje: HOJE, primeira: null }).media).toBeNull();
  });

  test("o formato do banco vira dados; formato torto vira vazio, nunca erro", () => {
    expect(
      picosDoJson({ dias: [["2026-10-12", 5], ["x", 1], ["2026-10-13", "y"]], cubo: [[1, 16, 5], [9, 3, 1], [2, 25, 1]] })
    ).toEqual({ dias: [["2026-10-12", 5]], cubo: [[1, 16, 5]] });
    expect(picosDoJson(null)).toEqual({ dias: [], cubo: [] });
    expect(picosDoJson("lixo")).toEqual({ dias: [], cubo: [] });
  });

  // --- Limite por plano, câmbio e variação -------------------------------------------------------------

  test("o limite de IA por plano: 13, 33 e 100 mi; sem plano 10 mi; o personalizado sempre vence", () => {
    expect(LIMITE_POR_PLANO).toEqual({ essencial: 13_000_000, profissional: 33_000_000, avancado: 100_000_000 });
    expect(LIMITE_PADRAO_TOKENS).toBe(10_000_000);
    expect(limiteDaEmpresa(null, "essencial")).toBe(13_000_000);
    expect(limiteDaEmpresa(undefined, "profissional")).toBe(33_000_000);
    expect(limiteDaEmpresa(null, "avancado")).toBe(100_000_000);
    expect(limiteDaEmpresa(null, null)).toBe(10_000_000);
    expect(limiteDaEmpresa(null, "plano-inventado")).toBe(10_000_000); // nunca um plano chutado
    expect(limiteDaEmpresa(5_000_000, "avancado")).toBe(5_000_000); // o personalizado vence o plano
    expect(limiteDaEmpresa(0, "avancado")).toBe(100_000_000); // zero não é limite
    expect(origemDoLimite(5_000_000, "avancado")).toBe("personalizado");
    expect(origemDoLimite(null, "avancado")).toBe("plano");
    expect(origemDoLimite(null, null)).toBe("padrao");
    expect(rotuloDaOrigemDoLimite(null, "avancado")).toBe("Plano Avançado");
    expect(rotuloDaOrigemDoLimite(1, "avancado")).toBe("Limite personalizado");
    expect(rotuloDaOrigemDoLimite(null, null)).toBe("Sem plano");
  });

  test("a derivação do limite (conversas do plano x 6 turnos x 4.400 tokens x 1,25 de margem) bate com os números aprovados", () => {
    expect(DERIVACAO_DO_LIMITE).toEqual({ turnosPorConversa: 6, tokensPorTurno: 4_400, margem: 1.25 });
    for (const k of ["essencial", "profissional", "avancado"] as const) {
      const derivado = limiteDerivadoDoPlano(PLANS[k].conversations);
      // O número aprovado é o derivado arredondado para o redondo mais próximo: no máximo 1,5% de diferença.
      expect(Math.abs(LIMITE_POR_PLANO[k] - derivado) / derivado, k).toBeLessThan(0.016);
    }
    expect(limiteDerivadoDoPlano(400)).toBe(13_200_000);
    expect(limiteDerivadoDoPlano(1000)).toBe(33_000_000);
    expect(limiteDerivadoDoPlano(3000)).toBe(99_000_000);
  });

  test("o gasto ideal até hoje é a fração do mês de São Paulo que já passou", () => {
    expect(fracaoDoMesSP(Date.parse("2026-10-01T03:00:00Z"))).toBe(0); // meia-noite do dia 1 em SP
    expect(fracaoDoMesSP(Date.parse("2026-10-16T15:30:00Z"))).toBeCloseTo((15 + 12.5 / 24) / 31, 6);
    expect(fracaoDoMesSP(Date.parse("2026-11-01T02:59:00Z"))).toBeGreaterThan(0.99); // 31/10 23h59 ainda é outubro
    expect(fracaoDoMesSP(Date.parse("2026-02-15T15:00:00Z"))).toBeCloseTo((14 + 12 / 24) / 28, 6);
  });

  test("a cotação PTAX do Banco Central: a URL do serviço Olinda, a leitura da resposta e a conversão em reais", () => {
    expect(dataParaOlinda("2026-10-15")).toBe("10-15-2026");
    const url = urlDaPtax(Date.parse("2026-10-16T15:00:00Z"));
    expect(url).toContain("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(");
    expect(url).toContain("@dataInicial='10-06-2026'");
    expect(url).toContain("@dataFinalCotacao='10-16-2026'");
    expect(url).toContain("$orderby=dataHoraCotacao%20desc"); // o Olinda recusa o + no lugar do espaço
    expect(url).toContain("$top=1");
    // A resposta documentada (cotacaoVenda e dataHoraCotacao) vira a cotação; qualquer outra coisa é null.
    expect(cambioDaResposta({ value: [{ cotacaoVenda: 5.0521, dataHoraCotacao: "2026-10-15 13:05:33.305854" }] })).toEqual({
      taxa: 5.0521,
      data: "2026-10-15",
    });
    expect(cambioDaResposta({ value: [] })).toBeNull();
    expect(cambioDaResposta({ value: [{ cotacaoVenda: 0, dataHoraCotacao: "2026-10-15 13:05" }] })).toBeNull();
    expect(cambioDaResposta({ value: [{ cotacaoVenda: "x", dataHoraCotacao: "2026-10-15" }] })).toBeNull();
    expect(cambioDaResposta(null)).toBeNull();
    expect(cambioDaResposta("lixo")).toBeNull();
    // Em reais com a cotação; em dólar, dito, sem ela; sem preço do modelo é null nas duas.
    const cambio = { taxa: 5, data: "2026-10-15" };
    expect(custoCurto(1, cambio)?.replace(/\s/g, " ")).toBe("R$ 5,00");
    expect(custoCurto(1, null)?.replace(/\s/g, " ")).toBe("US$ 1,00");
    expect(custoCurto(0.0001, cambio)?.replace(/\s/g, " ")).toBe("menos de R$ 0,01");
    expect(custoCurto(null, cambio)).toBeNull();
    expect(notaDoCambio(cambio)).toContain("PTAX de venda do Banco Central de 15/10/2026: R$ 5,0000 por US$ 1");
    expect(notaDoCambio(null)).toContain("indisponível");
    expect(/[\u2013\u2014]/.test(notaDoCambio(cambio) + notaDoCambio(null))).toBe(false);
  });

  test("a variação contra o período anterior: a direção certa de cada número, e sem base não vira porcentagem", () => {
    // Custo e tokens: subir é RUIM (menor é melhor); descer é bom.
    expect(calcularDelta({ atual: 120, anterior: 100, direcao: "menor-melhor" })).toMatchObject({ tom: "ruim", subiu: true, texto: "+20%" });
    expect(calcularDelta({ atual: 80, anterior: 100, direcao: "menor-melhor" })).toMatchObject({ tom: "bom", subiu: false, texto: "-20%" });
    // Volume (turnos): sem direção boa ou ruim.
    expect(calcularDelta({ atual: 120, anterior: 100, direcao: "neutra" })).toMatchObject({ tom: "neutro" });
    // Sem base: uma frase, nunca "+100%".
    expect(calcularDelta({ atual: 120, anterior: 0, direcao: "menor-melhor", semBase: "sem uso antes" })).toEqual({ tipo: "sem-base", texto: "sem uso antes" });
    expect(calcularDelta({ atual: 120, anterior: null, direcao: "menor-melhor" }).tipo).toBe("sem-base");
  });

  test("o período anterior de cada chip: o Dia contra ontem até a mesma hora, os outros contra os N dias antes", () => {
    const bruto = usoBruto(
      {
        dias: [
          ["2026-10-12", 4, 4_000, 0, 0], // dentro dos 7 dias de agora (08/10 a 14/10)
          ["2026-10-05", 2, 2_000, 0, 0], // dentro dos 7 dias anteriores (01/10 a 07/10)
          ["2026-09-20", 9, 9_000, 0, 0], // longe demais para a semana
        ],
      },
      [
        ["2026-10-14", 10, 1, 100, 0, 0], // hoje 10h
        ["2026-10-13", 10, 3, 300, 0, 0], // ontem 10h, até a mesma hora (15h)
        ["2026-10-13", 18, 8, 800, 0, 0], // ontem 18h: depois da hora de agora, fica de fora
      ]
    );
    const semana = usoDoPeriodo(bruto, "semana", AGORA, null);
    expect(semana.anterior).toMatchObject({ turnos: 2, usados: 2_000 });
    expect(semana.rotuloAnterior).toBe("os 7 dias anteriores");
    const dia = usoDoPeriodo(bruto, "dia", AGORA, null);
    expect(dia.anterior).toMatchObject({ turnos: 3, usados: 300 });
    expect(dia.rotuloAnterior).toBe("ontem, até a mesma hora");
    // Sem dados anteriores o total é zero (a variação então diz "sem base", nunca inventa).
    expect(usoDoPeriodo(usoBruto(null, null), "mes", AGORA, null).anterior?.turnos).toBe(0);
  });

  test("um intervalo escolhido: uma coluna por dia até 62 dias, uma por mês acima, e a base é o intervalo anterior", () => {
    const janela = { de: "2025-12-22", ate: "2025-12-28" };
    const dias = [{ dia: "2025-12-24", turnos: 7, tokens: { entrada: 700, cache: 0, saida: 7 } }];
    const natal = usoDoIntervalo({
      janela,
      dias,
      meses: [],
      diasAnteriores: [{ dia: "2025-12-16", turnos: 5, tokens: { entrada: 500, cache: 0, saida: 5 } }],
      agora: AGORA,
      modelo: null,
    });
    expect(natal.unidade).toBe("dia");
    expect(natal.barras).toHaveLength(7);
    expect(natal.legenda).toBe("de 22/12/2025 a 28/12/2025");
    expect(natal.maior?.chave).toBe("2025-12-24");
    expect(natal.maior?.rotulo).toBe("quarta, 24/12");
    expect(natal.anterior?.turnos).toBe(5);
    // O pace usa os 31 dias de dezembro (o mês do fim do intervalo).
    expect(ritmoDaBarra(3_100_000, natal.barras[0].chave, natal.unidade)).toBeCloseTo(100_000, 6);
    const longo = usoDoIntervalo({
      janela: { de: "2026-01-10", ate: "2026-04-20" },
      dias: [],
      meses: [{ mes: "2026-02", turnos: 3, tokens: { entrada: 30, cache: 0, saida: 3 } }],
      diasAnteriores: null,
      agora: AGORA,
      modelo: null,
    });
    expect(longo.unidade).toBe("mes");
    expect(longo.barras.map((b) => b.chave)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(longo.anterior).toBeNull();
  });

  test("as datas do Financeiro saem da situação: teste só em teste, carência só com pagamento atrasado", () => {
    const base = { trial_ends_at: "2026-10-20T12:00:00Z", grace_until: "2026-10-18T12:00:00Z", vitalicio_desde: null, bloqueado_em: null };
    const chaves = (kind: Parameters<typeof linhasDaAssinatura>[1], extra = {}) =>
      linhasDaAssinatura({ ...base, ...extra }, kind).map((l) => l.chave);
    expect(chaves("em_teste")).toEqual(["teste"]);
    expect(chaves("teste_encerrado")).toEqual(["teste"]);
    expect(chaves("carencia")).toEqual(["carencia"]);
    expect(chaves("atrasado_bloqueado")).toEqual(["carencia"]);
    expect(chaves("ativo")).toEqual([]);
    expect(chaves("cancelado")).toEqual([]);
    // Vitalício: o teste que ficou gravado por baixo não aparece; a marca do vitalício sim.
    expect(chaves("vitalicio", { vitalicio_desde: "2026-10-01T00:00:00Z" })).toEqual(["vitalicio"]);
    // Bloqueio manual aparece com a data, e convive com a marca do vitalício.
    expect(chaves("bloqueado", { vitalicio_desde: "2026-10-01T00:00:00Z", bloqueado_em: "2026-10-12T00:00:00Z" })).toEqual([
      "vitalicio",
      "bloqueado",
    ]);
    // Os rótulos dizem de qual prazo é cada data.
    expect(linhasDaAssinatura(base, "em_teste")[0].rotulo).toBe("O teste termina em");
    expect(linhasDaAssinatura(base, "teste_encerrado")[0].rotulo).toBe("O teste terminou em");
    expect(linhasDaAssinatura(base, "carencia")[0].rotulo).toBe("Carência do pagamento até");
    expect(linhasDaAssinatura({ ...base, grace_until: null }, "carencia")[0].vazio).toBe("Sem data");
    // Sem provedor: uma linha só, nunca "Nenhum" e "Não tem".
    expect(textoSemAssinatura({ vitalicio_desde: "2026-10-01T00:00:00Z" })).toBe("Sem cobrança: conta vitalícia.");
    expect(textoSemAssinatura({ vitalicio_desde: null })).toBe("Sem assinatura no Asaas.");
  });

  test("o dia de hoje do relógio de quem roda é o mesmo que o preview usa", () => {
    expect(diaIsoSP(Date.now())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

test.describe("Ajustes da central: Uso de IA", () => {
  test("o Dia começa na 00h de hoje e termina na hora atual", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    await aba.getByRole("tab", { name: "Dia", exact: true }).click();
    const linhas = aba.locator('[data-tabela="central-uso"] tbody tr');
    await expect(linhas).toHaveCount(colunasDoDia());
    expect(await linhas.first().getAttribute("data-chave")).toMatch(/T00$/);
    const hoje = diaIsoSP(Date.now());
    expect(await linhas.first().getAttribute("data-chave")).toBe(`${hoje}T00`);
    await expect(aba.locator('[data-slot="central-uso-legenda"]')).toContainText("hoje, desde as 00h");
    // O eixo abre em 00h.
    await expect(aba.locator('[data-slot="central-grafico"] .recharts-cartesian-axis-tick-value', { hasText: /^00h$/ })).toHaveCount(1);
  });

  test("a coluna acima do ritmo muda de cor, e a legenda, o balão e a tabela dizem 'acima do ritmo'", async ({ page }) => {
    // Dra Maria Jullia: limite gravado de 5 mi, ritmo de uns 161 mil por dia: vários dias passam dele.
    await page.goto(detalhe(3, "uso"));
    const aba = uso(page);
    await aba.getByRole("tab", { name: "Mês", exact: true }).click();
    await expect(aba.locator('[data-tabela="central-uso"] tbody tr')).toHaveCount(30);
    const acima = aba.locator('[data-tabela="central-uso"] tbody tr[data-acima="sim"]');
    expect(await acima.count()).toBeGreaterThan(0);
    expect(await aba.locator('[data-tabela="central-uso"] tbody tr[data-acima="nao"]').count()).toBeGreaterThan(0);
    await expect(aba.locator('[data-slot="chart-legenda"] [data-serie="acima"]')).toContainText("Acima do ritmo");

    // O gráfico desenha as colunas (a leitura da tabela sai antes do desenho do Recharts).
    await expect(aba.locator('path.recharts-rectangle[fill="var(--color-acima)"]').first()).toBeAttached();
    await expect(aba.locator('path.recharts-rectangle[fill="var(--color-abaixo)"]').first()).toBeAttached();

    // A cor é a de estado (âmbar, `--chart-acima`), diferente da marca das outras colunas.
    const cores = await page.evaluate(() => {
      const probe = (v: string) => {
        const el = document.createElement("span");
        el.style.background = `var(${v})`;
        document.body.appendChild(el);
        const c = getComputedStyle(el).backgroundColor;
        el.remove();
        return c;
      };
      const acima = document.querySelector('[data-slot="central-grafico"] path.recharts-rectangle[fill="var(--color-acima)"]');
      const abaixo = document.querySelector('[data-slot="central-grafico"] path.recharts-rectangle[fill="var(--color-abaixo)"]');
      return {
        acima: acima ? getComputedStyle(acima).fill : null,
        abaixo: abaixo ? getComputedStyle(abaixo).fill : null,
        aviso: probe("--warn-fill"),
        marca: probe("--brand-fill"),
      };
    });
    expect(cores.acima).toBe(cores.aviso);
    expect(cores.abaixo).toBe(cores.marca);
    expect(cores.acima).not.toBe(cores.abaixo);

    // O balão de uma coluna que passou diz quanto passou.
    const grafico = aba.locator('[data-slot="central-grafico"] [data-slot="chart"]');
    await grafico.scrollIntoViewIfNeeded();
    await aba.locator('path.recharts-rectangle[fill="var(--color-acima)"]').first().hover({ force: true });
    const balao = page.locator('[data-slot="chart-tooltip"]');
    await expect(balao).toBeVisible();
    await expect(balao.locator('[data-linha="acima"]')).toContainText(/\+\d+%/);
    await expect(balao).toContainText("Acima do ritmo");
  });

  test("o seletor ao lado dos chips traz Este mês, Mês passado, os outros meses e Todo o período", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    const gatilho = aba.locator('[data-slot="central-uso-historico"]');
    await expect(gatilho).toBeEnabled();
    await expect(gatilho).toHaveAttribute("aria-pressed", "false");
    await gatilho.click();
    const itens = page.getByRole("menuitem");
    // O preview tem 100 dias de uso: o mês atual e os três anteriores, mais "Todo o período".
    await expect(itens).toHaveCount(6);
    await expect(itens.first()).toContainText("Este mês");
    await expect(itens.nth(1)).toContainText("Mês passado");
    await expect(itens.nth(4)).toHaveText("Todo o período");
    await expect(itens.last()).toContainText("Período personalizado");

    // Mês passado: uma coluna por dia do mês, o total é a soma das colunas, nenhum chip aceso.
    await itens.nth(1).click();
    const legenda = aba.locator('[data-slot="central-uso-legenda"]');
    await expect(legenda).toContainText("em ");
    await expect(gatilho).toHaveAttribute("aria-pressed", "true");
    for (const nome of ["Dia", "Semana", "Quinzena", "Mês"]) {
      await expect(aba.getByRole("tab", { name: nome, exact: true })).toHaveAttribute("aria-selected", "false");
    }
    const grafico = aba.locator('[data-slot="central-grafico"]');
    await expect(grafico).toHaveAttribute("data-unidade", "dia");
    const linhas = aba.locator('[data-tabela="central-uso"] tbody tr');
    const n = await linhas.count();
    expect([28, 29, 30, 31]).toContain(n);
    const usados = await linhas.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-usados"))));
    expect(usados.reduce((s, x) => s + x, 0)).toBe(Number(await aba.locator('[data-bloco="uso-tokens"]').getAttribute("data-usados")));
    await expect(aba.locator('[data-bloco="uso-maior"]')).toContainText("Dia de maior uso");
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toContainText("em ");

    // Todo o período: uma coluna por mês, e a linha é o limite do mês.
    await gatilho.click();
    await page.getByRole("menuitem", { name: "Todo o período" }).click();
    await expect(grafico).toHaveAttribute("data-unidade", "mes");
    await expect(linhas).toHaveCount(4);
    await expect(grafico.locator('[data-slot="chart-legenda"] [data-serie="ritmo"]')).toContainText("Limite do mês: 13 mi");
    await expect(aba.locator('[data-bloco="uso-maior"]')).toContainText("Mês de maior uso");
    await expect(grafico).toContainText("limite de hoje");

    // Um chip volta ao período e apaga a marca do seletor.
    await aba.getByRole("tab", { name: "Quinzena", exact: true }).click();
    await expect(gatilho).toHaveAttribute("aria-pressed", "false");
    await expect(grafico).toHaveAttribute("data-unidade", "dia");
    await expect(linhas).toHaveCount(15);
  });

  test("quem nunca teve uso só tem o mês atual e Todo o período, sem inventar meses", async ({ page }) => {
    await page.goto(`${detalhe(6, "uso")}&vazio=1`);
    const aba = uso(page);
    await aba.locator('[data-slot="central-uso-historico"]').click();
    await expect(page.getByRole("menuitem")).toHaveCount(3); // o mês atual, todo o período e o personalizado
    await page.getByRole("menuitem", { name: "Todo o período" }).click();
    await expect(aba.locator('[data-slot="central-grafico-vazio"]')).toBeVisible();
  });
});

/** O dia de São Paulo `n` dias de hoje (negativo = antes). */
const dia = (n: number) => somarDias(diaIsoSP(Date.now()), n);
const ddmm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

test.describe("Rodada de 16/10: horários de pico (variação A), seguindo o filtro de período", () => {
  test("três números em cima e dois gráficos de colunas, com a coluna do pico na marca e as outras em cinza", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const picos = page.locator('[data-bloco="central-picos"]');
    await expect(picos.locator('[data-bloco="picos-tile-horario"]')).toBeVisible();
    await expect(picos.locator('[data-bloco="picos-tile-dia"]')).toBeVisible();
    await expect(picos.locator('[data-bloco="picos-tile-media"]')).toBeVisible();

    // Horário de pico: o dia da semana e a faixa de 3 horas, com os turnos.
    await expect(picos.locator('[data-slot="picos-horario-valor"]')).toHaveText(/^\d{2}h às \d{2}h$/);
    await expect(picos.locator('[data-bloco="picos-tile-horario"]')).toContainText(/\d+ turnos?/);
    // Dia de pico: a DATA REAL, com o dia da semana.
    await expect(picos.locator('[data-slot="picos-dia-valor"]')).toHaveText(
      /^(domingo|segunda|terça|quarta|quinta|sexta|sábado), \d{2}\/\d{2}$/
    );

    // Semana (o padrão): "Por dia" tem UMA coluna por data; "Por horário do dia" tem as 8 faixas de 3 horas.
    const porDia = picos.locator('[data-tabela="picos-dia"] tbody tr');
    const porFaixa = picos.locator('[data-tabela="picos-faixa"] tbody tr');
    await expect(porDia).toHaveCount(7);
    await expect(porFaixa).toHaveCount(8);
    const datas = await porDia.evaluateAll((els) => els.map((e) => e.getAttribute("data-chave")));
    expect(datas).toEqual([-6, -5, -4, -3, -2, -1, 0].map(dia));

    // Os cartões dizem o MESMO que as colunas destacadas (nunca uma conta diferente do gráfico ao lado).
    const destaque = async (l: typeof porFaixa) => ({
      rotulo: await l.evaluateAll((els) => els.find((e) => e.getAttribute("data-pico") === "sim")!.querySelector("td")!.textContent),
      n: await l.evaluateAll((els) => Number(els.find((e) => e.getAttribute("data-pico") === "sim")!.getAttribute("data-n"))),
      chave: await l.evaluateAll((els) => els.find((e) => e.getAttribute("data-pico") === "sim")!.getAttribute("data-chave")),
    });
    const faixaDestacada = await destaque(porFaixa);
    await expect(picos.locator('[data-slot="picos-horario-valor"]')).toHaveText(faixaDestacada.rotulo!);
    await expect(picos.locator('[data-bloco="picos-tile-horario"]')).toContainText(`${faixaDestacada.n.toLocaleString("pt-BR")} turno`);
    const diaDestacado = await destaque(porDia);
    await expect(picos.locator('[data-slot="picos-dia-valor"]')).toHaveText(
      new RegExp(`^[^,]+, ${diaDestacado.chave!.slice(8)}/${diaDestacado.chave!.slice(5, 7)}$`)
    );
    await expect(picos.locator('[data-bloco="picos-tile-dia"]')).toContainText(`${diaDestacado.n.toLocaleString("pt-BR")} turno`);

    // Uma única coluna de pico em cada gráfico, e a soma das colunas é o mesmo total.
    for (const linhas of [porDia, porFaixa]) {
      expect(await linhas.evaluateAll((els) => els.filter((e) => e.getAttribute("data-pico") === "sim").length)).toBe(1);
    }
    const soma = async (l: typeof porDia) => (await l.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n"))))).reduce((s, n) => s + n, 0);
    expect(await soma(porDia)).toBe(await soma(porFaixa));
    // A média por dia é o total dividido pelos 7 dias.
    const media = Number((await picos.locator('[data-slot="picos-media-valor"]').innerText()).replace(",", "."));
    expect(Math.abs(media - (await soma(porDia)) / 7)).toBeLessThan(0.06);

    // Cores: o pico é a marca; as demais são o cinza claro (outra cor, nunca a da marca).
    const cores = await page.evaluate(() => {
      const f = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).fill : null;
      };
      return {
        pico: f('[data-bloco="picos-dia"] path.recharts-rectangle[fill="var(--color-destaque)"]'),
        demais: f('[data-bloco="picos-dia"] path.recharts-rectangle[fill="var(--color-demais)"]'),
      };
    });
    expect(cores.pico).not.toBeNull();
    expect(cores.demais).not.toBeNull();
    expect(cores.pico).not.toBe(cores.demais);

    // A legenda diz o que é cada cor (identidade nunca só pela cor).
    await expect(picos.locator('[data-bloco="picos-dia"] [data-slot="chart-legenda"]')).toContainText("Pico");
    await expect(picos.locator('[data-bloco="picos-dia"] [data-slot="chart-legenda"]')).toContainText("Demais");
  });

  test("o balão de uma coluna diz o dia ou a faixa e os turnos", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const grafico = page.locator('[data-bloco="picos-faixa"] [data-slot="chart"]');
    await grafico.scrollIntoViewIfNeeded();
    await expect(grafico.locator(".recharts-bar-rectangle").first()).toBeAttached();
    const pico = page.locator('[data-bloco="picos-faixa"] path.recharts-rectangle[fill="var(--color-destaque)"]').first();
    await expect(pico).toBeAttached();
    await expect.poll(async () => (await pico.boundingBox())?.height ?? 0).toBeGreaterThan(10);
    await pico.hover({ force: true });
    const balao = page.locator('[data-bloco="picos-faixa"] [data-slot="chart-tooltip"]');
    await expect(balao).toBeVisible();
    await expect(balao).toContainText(/\d{2}h às \d{2}h/);
    await expect(balao.locator('[data-linha="turnos"]')).toContainText(/\d/);
    await expect(balao.locator('[data-linha="pico"]')).toContainText("Pico");
  });

  test("os chips mandam nos picos: o Dia tem uma data, a Quinzena tem 15 colunas, o Mês soma por dia da semana", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    const porDia = aba.locator('[data-tabela="picos-dia"] tbody tr');
    await aba.getByRole("tab", { name: "Dia", exact: true }).click();
    await expect(porDia).toHaveCount(1);
    expect(await porDia.first().getAttribute("data-chave")).toBe(dia(0));
    await aba.getByRole("tab", { name: "Quinzena", exact: true }).click();
    await expect(porDia).toHaveCount(15);
    await expect(aba.locator('[data-bloco="picos-dia"]')).toContainText("Cada coluna é uma data do período");
    // Mês: mais de 15 dias, então cada coluna é um dia da semana, de segunda a domingo.
    await aba.getByRole("tab", { name: "Mês", exact: true }).click();
    await expect(porDia).toHaveCount(7);
    await expect(aba.locator('[data-bloco="picos-dia"]')).toContainText("soma os turnos de um dia da semana");
    await expect(aba.locator('[data-tabela="picos-dia"] tbody tr td:first-child')).toHaveText([
      "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo",
    ]);
    // O dia de pico continua sendo uma data.
    await expect(aba.locator('[data-slot="picos-dia-valor"]')).toHaveText(/, \d{2}\/\d{2}$/);
  });

  test("um mês passado e todo o período também mandam nos picos", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    await aba.locator('[data-slot="central-uso-historico"]').click();
    await page.getByRole("menuitem").nth(1).click(); // Mês passado
    await expect(aba.locator('[data-slot="central-grafico"]')).toHaveAttribute("data-unidade", "dia");
    await expect(aba.locator('[data-tabela="picos-dia"] tbody tr')).toHaveCount(7); // um mês inteiro soma por dia da semana
    await expect(aba.locator('[data-tabela="picos-faixa"] tbody tr')).toHaveCount(8);
    const total = Number(await aba.locator('[data-bloco="uso-turnos"]').getAttribute("data-turnos"));
    const faixas = await aba.locator('[data-tabela="picos-faixa"] tbody tr').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n"))));
    expect(faixas.reduce((s, n) => s + n, 0)).toBe(total); // os picos e o uso são o mesmo mês
    await aba.locator('[data-slot="central-uso-historico"]').click();
    await page.getByRole("menuitem", { name: "Todo o período" }).click();
    await expect(aba.locator('[data-tabela="picos-faixa"] tbody tr')).toHaveCount(8);
    const totalTudo = Number(await aba.locator('[data-bloco="uso-turnos"]').getAttribute("data-turnos"));
    const faixasTudo = await aba.locator('[data-tabela="picos-faixa"] tbody tr').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n"))));
    expect(faixasTudo.reduce((s, n) => s + n, 0)).toBe(totalTudo);
  });

  test("o período personalizado: duas datas, validação, e tudo (números, gráfico e picos) segue o intervalo", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    const gatilho = aba.locator('[data-slot="central-uso-historico"]');
    await gatilho.click();
    await page.getByRole("menuitem", { name: /Período personalizado/ }).click();
    const caixa = page.locator('[data-slot="central-uso-intervalo"]');
    await expect(caixa).toBeVisible();

    // Datas invertidas: o aviso aparece e a caixa fica aberta.
    await caixa.locator('[data-campo="intervalo-de"]').fill(dia(-5));
    await caixa.locator('[data-campo="intervalo-ate"]').fill(dia(-9));
    await caixa.locator('[data-slot="central-uso-intervalo-aplicar"]').click();
    await expect(caixa.locator('[data-slot="central-uso-intervalo-erro"]')).toContainText("Escolha duas datas válidas");
    await expect(caixa).toBeVisible();

    // Cinco dias: de 9 a 5 dias atrás.
    await caixa.locator('[data-campo="intervalo-de"]').fill(dia(-9));
    await caixa.locator('[data-campo="intervalo-ate"]').fill(dia(-5));
    await caixa.locator('[data-slot="central-uso-intervalo-aplicar"]').click();
    await expect(caixa).toHaveCount(0);

    await expect(gatilho).toHaveAttribute("aria-pressed", "true");
    await expect(gatilho).toContainText(`${ddmm(dia(-9))} a ${ddmm(dia(-5))}`);
    for (const nome of ["Dia", "Semana", "Quinzena", "Mês"]) {
      await expect(aba.getByRole("tab", { name: nome, exact: true })).toHaveAttribute("aria-selected", "false");
    }
    const legenda = `de ${ddmm(dia(-9))}/${dia(-9).slice(0, 4)} a ${ddmm(dia(-5))}/${dia(-5).slice(0, 4)}`;
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toContainText(legenda);
    // O uso: uma coluna por dia do intervalo; os picos: uma coluna por data do mesmo intervalo.
    const linhas = aba.locator('[data-tabela="central-uso"] tbody tr');
    await expect(linhas).toHaveCount(5);
    const datas = await aba.locator('[data-tabela="picos-dia"] tbody tr').evaluateAll((els) => els.map((e) => e.getAttribute("data-chave")));
    expect(datas).toEqual([-9, -8, -7, -6, -5].map(dia));
    // Os turnos do uso e dos picos são os mesmos do intervalo.
    const turnos = await linhas.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-turnos"))));
    const dosPicos = await aba.locator('[data-tabela="picos-dia"] tbody tr').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n"))));
    expect(dosPicos).toEqual(turnos);
    // Variação: o intervalo anterior de mesmo tamanho é a base.
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toContainText("5 dias anteriores");

    // Um chip volta ao período.
    await aba.getByRole("tab", { name: "Semana", exact: true }).click();
    await expect(gatilho).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Rodada de 16/10: medidor com gasto ideal, modelo, reais, variação e cartões", () => {
  test("a barra de meta: 'X de Y tokens (Plano ...), R$ ... estimado' no canto, uso sólido, bolinha no ritmo ideal, trecho listrado e a frase do ritmo", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const card = page.locator('[data-bloco="central-uso"]');
    const rotulo = card.locator('[data-slot="central-tokens"]');
    await expect(rotulo).toHaveText(/de 13 mi tokens \(Plano Essencial\), R\$\s[\d.,]+ estimado$/);
    // O rótulo está no canto de cima, à direita, na mesma faixa do título.
    const titulo = (await card.locator("h2").boundingBox())!;
    const canto = (await rotulo.boundingBox())!;
    const cartao = (await card.boundingBox())!;
    expect(canto.y).toBeLessThan(titulo.y + titulo.height + 8);
    expect(cartao.x + cartao.width - (canto.x + canto.width)).toBeLessThan(40);
    // O medidor: uma trilha só, o preenchimento sólido, a bolinha e nada da barra âmbar nem da legenda antiga.
    const m = card.locator('[data-slot="medidor-de-meta"]');
    await expect(m).toHaveCount(1);
    await expect(m.locator("[data-medidor-cheio]")).toHaveCount(1);
    await expect(m.locator("[data-medidor-marcador]")).toHaveCount(1);
    await expect(card.locator("[data-medidor-ideal]")).toHaveCount(0);
    await expect(card.locator('[data-slot="central-legenda-medidor"]')).toHaveCount(0);
    // A bolinha fica no gasto ideal de hoje (limite x fração do mês de São Paulo).
    const caixa = (await m.boundingBox())!;
    const bola = (await m.locator("[data-medidor-marcador]").boundingBox())!;
    const pos = ((bola.x + bola.width / 2 - caixa.x) / caixa.width) * 100;
    expect(Math.abs(pos - fracaoDoMesSP(Date.now()) * 100)).toBeLessThan(1.5);
    // O trecho listrado liga o uso à bolinha (diagonal), e a cor segue o ritmo.
    const trecho = m.locator("[data-medidor-trecho]");
    await expect(trecho).toHaveCount(1);
    expect(await trecho.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("repeating-linear-gradient");
    const usadoPct = Number(await m.getAttribute("aria-valuenow"));
    const idealPct = Number(await m.getAttribute("data-ideal-pct"));
    const esperado = usadoPct <= idealPct ? "bom" : "ruim";
    await expect(m).toHaveAttribute("data-estado", esperado);
    const cheio = await m.locator("[data-medidor-cheio]").evaluate((e) => getComputedStyle(e).backgroundColor);
    const trilha = await m.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(cheio).not.toBe(trilha);
    // A frase do ritmo, em palavras, sob a barra.
    const frase = card.locator('[data-slot="central-ritmo-frase"]');
    await expect(frase).toHaveText(
      esperado === "bom"
        ? /^Abaixo do ritmo: no ritmo atual termina o mês em \d+% do limite$/
        : /^Acima do ritmo: (no ritmo atual passa do limite por volta de \d{2}\/\d{2}|o limite do mês já foi atingido)$/
    );
    // O texto antigo saiu.
    const texto = await card.innerText();
    expect(texto).not.toContain("Gasto do cliente");
    expect(texto).not.toContain("Gasto ideal do plano até hoje");
    expect(texto).not.toContain("Limite padrão do sistema");
    expect(texto).not.toContain("Custo estimado do mês");
    expect(texto).not.toContain("use a aba Ações");
    await expect(page.locator('[data-slot="central-limite-custo"]')).toHaveCount(0);
  });

  test("a barra de meta fica vermelha acima do ritmo e verde no ou abaixo dele, claro e escuro, e a porcentagem continua no cartão", async ({ page }) => {
    for (const tema of ["light", "dark"] as const) {
      await page.context().addCookies([{ name: "theme", value: tema, url: "http://localhost" }]);
      await page.goto(detalhe(2, "uso")); // 85% de 10 mi: acima do ritmo em qualquer dia antes do fim do mês
      const m = page.locator('[data-bloco="central-uso"] [data-slot="medidor-de-meta"]');
      await expect(m).toHaveAttribute("data-estado", "ruim");
      const cor = await m.locator("[data-medidor-cheio]").evaluate((e) => getComputedStyle(e).backgroundColor);
      const [r, g, b] = cor.match(/\d+(\.\d+)?/g)!.map(Number);
      expect(r).toBeGreaterThan(g + 40);
      expect(r).toBeGreaterThan(b + 40);
      await expect(page.locator('[data-bloco="central-uso"] [data-slot="central-ritmo-frase"]')).toHaveAttribute("data-ritmo", "acima");
      await expect(page.locator('[data-bloco="central-uso"] [data-slot="central-percentual"]')).toContainText("85%");
      await page.goto(detalhe(1, "uso")); // 18% de 13 mi
      const m1 = page.locator('[data-bloco="central-uso"] [data-slot="medidor-de-meta"]');
      const usado = Number(await m1.getAttribute("aria-valuenow"));
      const ideal = Number(await m1.getAttribute("data-ideal-pct"));
      await expect(m1).toHaveAttribute("data-estado", usado <= ideal ? "bom" : "ruim");
    }
    await page.context().addCookies([{ name: "theme", value: "light", url: "http://localhost" }]);
  });

  test("a Visão geral tem a mesma barra, com o rótulo no canto do cartão e o modelo de IA do cliente", async ({ page }) => {
    await page.goto(detalhe(1, "visao"));
    const tile = page.locator('[data-bloco="visao-consumo"]');
    await expect(tile.locator('[data-slot="central-tokens"]')).toContainText("(Plano Essencial)");
    await expect(tile.locator('[data-slot="central-tokens"]')).toContainText("estimado");
    await expect(tile.locator("[data-medidor-ideal]")).toHaveCount(0);
    await expect(tile.locator('[data-slot="central-legenda-medidor"]')).toHaveCount(0);
    await expect(tile.locator("[data-medidor-marcador]")).toHaveCount(1);
    await expect(tile.locator('[data-slot="central-ritmo-frase"]')).toContainText("ritmo");
    await expect(tile.locator('[data-slot="visao-modelo"]')).toContainText("gpt-5.4-mini, o modelo do último turno do cliente");
    // Cliente sem turno nenhum: o modelo é o do sistema, e a tela diz por quê.
    await page.goto(`${detalhe(6, "visao")}&vazio=1`);
    await expect(page.locator('[data-slot="visao-modelo"]')).toContainText("o modelo atual do sistema (o cliente ainda não teve turno)");
  });

  test("sem uso no mês a barra não inventa frase de ritmo", async ({ page }) => {
    await page.goto(`${detalhe(5, "uso")}`); // OBM do preview: nunca teve turno
    const card = page.locator('[data-bloco="central-uso"]');
    await expect(card.locator('[data-slot="central-ritmo-frase"]')).toHaveCount(0);
    await expect(card.locator("[data-medidor-marcador]")).toHaveCount(1);
  });

  test("o número no centro do donut cabe no furo mesmo com 15,1 mi, 128,6 mi e 1,2 bi", async ({ page }) => {
    for (const escala of [1, 15, 128, 1200]) {
      await page.goto(`${detalhe(1, "uso")}&escala=${escala}`);
      const bloco = uso(page).locator('[data-bloco="uso-tokens-por-tipo"]');
      const centro = bloco.locator('[data-slot="uso-donut-centro"]');
      await expect(centro).toBeVisible();
      const c = (await centro.boundingBox())!;
      const grafico = (await bloco.locator(".recharts-wrapper").boundingBox())!;
      // O furo tem 64% do raio: a largura do texto cabe com folga e o texto fica dentro do círculo.
      const raio = Math.min(grafico.width, grafico.height) / 2;
      expect(c.width).toBeLessThan(raio * 0.64 * 2 - 8);
      const dx = c.x + c.width / 2 - (grafico.x + grafico.width / 2);
      expect(Math.abs(dx)).toBeLessThan(3);
      expect(await centro.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await page.goto(`${detalhe(1, "uso")}&escala=15`);
    await expect(uso(page).locator('[data-slot="uso-donut-centro"]')).toHaveText(/^\d+,\d mi$/);
    await page.goto(`${detalhe(1, "uso")}&escala=1200`);
    await expect(uso(page).locator('[data-slot="uso-donut-centro"]')).toHaveText(/ bi$/);
    expect(tamanhoDoCentroDoDonut("1,2 bi")).toBeGreaterThan(tamanhoDoCentroDoDonut("128,6 mi"));
    expect(tamanhoDoCentroDoDonut("128,6 mi")).toBeGreaterThanOrEqual(16);
  });

  test("ritmoDoMes e textoDoRitmo: abaixo e acima, projeção do mesmo contador, nada sem dado", () => {
    const meio = Date.UTC(2026, 9, 16, 15); // 16/10/2026 12h em São Paulo
    const f = fracaoDoMesSP(meio);
    const limite = 100_000_000;
    // Abaixo do ritmo: gastou metade do ideal.
    const abaixo = ritmoDoMes(limite * f * 0.5, limite, meio)!;
    expect(abaixo.estado).toBe("abaixo");
    expect(abaixo.projetadoPct).toBeCloseTo(50, 5);
    expect(abaixo.esgotaEm).toBeNull();
    expect(textoDoRitmo(abaixo)).toBe("Abaixo do ritmo: no ritmo atual termina o mês em 50% do limite");
    // No ritmo exato: abaixo (menos ou igual é bom) e termina em 100%.
    expect(ritmoDoMes(limite * f, limite, meio)!.estado).toBe("abaixo");
    // Acima: uma vez e meia o ideal esgota o limite aos 2/3 do mês (dia 21).
    const acima = ritmoDoMes(limite * f * 1.5, limite, meio)!;
    expect(acima.estado).toBe("acima");
    expect(acima.projetadoPct).toBeCloseTo(150, 5);
    expect(acima.esgotado).toBe(false);
    expect(acima.esgotaEm).toBe("2026-10-21");
    expect(textoDoRitmo(acima)).toBe("Acima do ritmo: no ritmo atual passa do limite por volta de 21/10");
    // Limite já atingido.
    expect(textoDoRitmo(ritmoDoMes(limite * 1.2, limite, meio)!)).toBe("Acima do ritmo: o limite do mês já foi atingido");
    // Sem dado de verdade: nada. Sem uso, sem limite, ou menos de um dia inteiro do mês.
    expect(ritmoDoMes(0, limite, meio)).toBeNull();
    expect(ritmoDoMes(5, 0, meio)).toBeNull();
    expect(ritmoDoMes(5, limite, Date.UTC(2026, 9, 1, 3, 30))).toBeNull();
    // O formato curto ganhou o bilhão.
    expect(tokensCurto(1_234_000_000)).toBe("1,2 bi");
    expect(tokensCurto(15_100_000)).toBe("15,1 mi");
  });

  test("o modelo e a cotação do dólar aparecem na aba Uso de IA, e sem cotação os custos ficam em dólar, ditos", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const modelo = page.locator('[data-slot="central-modelo"]');
    await expect(modelo).toContainText("Modelo de IA: gpt-5.4-mini, o modelo do último turno do cliente");
    await expect(modelo).toContainText("Custos em reais pela PTAX de venda do Banco Central");
    await expect(modelo).toContainText("R$ 5,0521 por US$ 1");
    await expect(uso(page).locator('[data-bloco="uso-custo"]')).toContainText("R$");

    await page.goto(`${detalhe(1, "uso")}&semcambio=1`);
    await expect(page.locator('[data-slot="central-modelo"]')).toContainText("Cotação do dólar indisponível agora: os custos aparecem em US$.");
    await expect(uso(page).locator('[data-bloco="uso-custo"]')).toContainText("US$");
    expect(await uso(page).locator('[data-bloco="uso-custo"]').innerText()).not.toContain("R$");
  });

  test("a cotação não segura a página: abre em US$ (buscando) e troca para reais quando chega; a falha fica em US$", async ({ page }) => {
    // O servidor entrega a PROMESSA da cotação: a página chega (waitUntil "commit": o fluxo só fecha quando a promessa resolve)
    // com os custos em US$, e troca para reais quando ela chega.
    await page.goto(`${detalhe(1, "visao")}&cambio=atraso`, { waitUntil: "commit" });
    const rotulo = page.locator('[data-bloco="visao-consumo"] [data-slot="central-tokens"]');
    await expect(rotulo).toContainText("estimado");
    expect(await rotulo.innerText()).toContain("US$");
    expect(await rotulo.innerText()).not.toContain("R$");
    await expect(rotulo).toContainText("R$", { timeout: 15_000 });
    expect(await rotulo.innerText()).not.toContain("US$");

    // A lista faz o mesmo no texto do topo ("buscando") e na linha de cada cliente.
    await page.goto("/design/clientes?cambio=atraso", { waitUntil: "commit" });
    const topo = page.locator("section[aria-label='Clientes'] > div").first();
    await expect(topo).toContainText("buscando a cotação do dólar");
    await expect(page.locator('[data-slot="central-custo"]').first()).toContainText("US$");
    await expect(topo).toContainText("em reais pela PTAX do Banco Central", { timeout: 15_000 });
    await expect(page.locator('[data-slot="central-custo"]').first()).toContainText("R$");

    // Sem cotação (a fonte falhou): a nota diz que está indisponível e os custos ficam em US$, nunca uma taxa inventada.
    await page.goto(`${detalhe(1, "uso")}&cambio=falha`);
    await expect(page.locator('[data-slot="central-modelo"]')).toContainText("Cotação do dólar indisponível agora", { timeout: 15_000 });
    expect(await uso(page).locator('[data-bloco="uso-custo"]').innerText()).not.toContain("R$");
  });

  test("a variação contra o período anterior: custo e tokens subindo são vermelhos, turnos não têm cor, e a seta é o que o número fez", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const aba = uso(page);
    const selo = (bloco: string) => aba.locator(`[data-bloco="${bloco}"] [data-variacao]`);
    for (const bloco of ["uso-tokens", "uso-custo"]) {
      const v = selo(bloco);
      await expect(v).toBeVisible();
      const sentido = await v.getAttribute("data-sentido");
      const tom = await v.getAttribute("data-variacao");
      if (sentido === "subiu") expect(tom, bloco).toBe("ruim"); // gastar mais não é boa notícia
      if (sentido === "desceu") expect(tom, bloco).toBe("bom");
      await expect(v).toHaveAttribute("title", /Contra os 7 dias anteriores/);
    }
    expect(await selo("uso-turnos").getAttribute("data-variacao")).toBe("neutro"); // volume não tem lado bom
    // O quarto cartão (o maior uso) não tem variação; os três primeiros têm o mini gráfico de tendência.
    await expect(aba.locator('[data-bloco="uso-maior"] [data-variacao]')).toHaveCount(0);
    await expect(aba.locator('[data-bloco="uso-tokens"] [data-slot="sparkline"]')).toBeVisible();
    await expect(aba.locator('[data-bloco="uso-turnos"] [data-slot="sparkline"]')).toBeVisible();
    await expect(aba.locator('[data-bloco="uso-custo"] [data-slot="sparkline"]')).toBeVisible();
    // A legenda do cartão diz contra o quê.
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toContainText("comparado com os 7 dias anteriores");
    await aba.getByRole("tab", { name: "Dia", exact: true }).click();
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toContainText("ontem, até a mesma hora");
  });

  test("o mini gráfico de tendência tem balão com o rótulo do ponto e o valor", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const mini = uso(page).locator('[data-bloco="uso-tokens"] [data-slot="sparkline"]');
    await expect(mini.locator(".recharts-area")).toBeAttached();
    const caixa = (await mini.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    const balao = page.locator('[data-bloco="uso-tokens"] [data-slot="chart-tooltip"]');
    await expect(balao).toBeVisible();
    await expect(balao).toContainText(/\d{2}\/\d{2}/);
    await expect(balao).toContainText("Tokens");
  });

  test("de onde vêm os tokens: a rosca de partes de um todo, com o valor de cada parte na legenda", async ({ page }) => {
    await page.goto(detalhe(1, "uso"));
    const bloco = uso(page).locator('[data-bloco="uso-tokens-por-tipo"]');
    await expect(bloco.locator(".recharts-sector").first()).toBeAttached();
    const partes = bloco.locator('[data-tabela="uso-tokens-por-tipo"] tbody tr');
    await expect(partes).toHaveCount(3);
    const ns = await partes.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n"))));
    // Entrada nova + entrada em cache + saída = os tokens do período (o que conta para o limite).
    expect(ns.reduce((s, n) => s + n, 0)).toBe(Number(await uso(page).locator('[data-bloco="uso-tokens"]').getAttribute("data-usados")));
    await expect(bloco.locator('[data-slot="chart-legenda"] li')).toHaveCount(3);
    await expect(bloco.locator('[data-slot="chart-legenda"]')).toContainText(/\(\d+%\)/);
  });

  test("Atendimento: variação das respostas (sem lado bom) e do primeiro atendimento (menor é melhor)", async ({ page }) => {
    await page.goto(detalhe(1, "atendimento"));
    const aba = page.locator('[data-slot="central-aba-atendimento"]');
    await expect(aba.locator('[data-bloco="atendimento-respostas"] [data-variacao]')).toHaveAttribute("data-variacao", "neutro");
    await expect(aba.locator('[data-bloco="atendimento-respostas"] [data-slot="sparkline"]')).toBeVisible();
    const tempo = aba.locator('[data-bloco="atendimento-tempo"] [data-variacao]');
    await expect(tempo).toHaveAttribute("data-sentido", "desceu");
    await expect(tempo).toHaveAttribute("data-variacao", "bom"); // ficou mais rápido: seta para baixo, verde
    await expect(aba.locator('[data-bloco="atendimento-tempo"]')).toContainText("comparado com os 7 dias anteriores");
    // O volume de conversas fica sem variação (a definição dessa métrica está com o dono).
    await expect(aba.locator('[data-bloco="atendimento-conversas"] [data-variacao]')).toHaveCount(0);
    await expect(aba.locator('[data-bloco="atendimento-ia"] [data-variacao]')).toHaveCount(0);
    await aba.getByRole("tab", { name: "Dia", exact: true }).click();
    await expect(aba.locator('[data-bloco="atendimento-respostas"]')).toContainText("o mesmo dia da semana passada");
  });

  test("a Financeiro tem os quatro cartões de número: situação, plano, atendentes contra o plano e cobrança", async ({ page }) => {
    await page.goto(detalhe(7, "financeiro")); // Estúdio Aurora: plano Profissional, no Asaas
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba.locator('[data-bloco="financeiro-resumo"] [data-slot="stat"]')).toHaveCount(4);
    await expect(aba.locator('[data-slot="financeiro-situacao"]')).toContainText("Atrasado");
    await expect(aba.locator('[data-slot="financeiro-plano"]')).toHaveText("Profissional");
    await expect(aba.locator('[data-bloco="financeiro-tile-plano"]')).toContainText("R$ 347 por mês");
    await expect(aba.locator('[data-bloco="financeiro-tile-atendentes"] [data-slot="medidor"]')).toBeVisible();
    await expect(aba.locator('[data-bloco="financeiro-tile-atendentes"]')).toContainText("de 3");
    await expect(aba.locator('[data-slot="financeiro-tile-cobranca-valor"]')).toHaveText("Asaas");
  });
});

test.describe("Ajustes da central: Financeiro e Ações", () => {
  test("em teste: só o fim do teste, e sem provedor há UMA linha (nada de 'Nenhum' e 'Não tem')", async ({ page }) => {
    await page.goto(detalhe(2, "financeiro")); // Clínica Sorriso, em teste
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba.locator('[data-slot="financeiro-teste"]')).toBeVisible();
    await expect(aba.locator('[data-slot="financeiro-carencia"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-vitalicio"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-bloqueado"]')).toHaveCount(0);
    await expect(aba.getByText("O teste termina em")).toBeVisible();
    await expect(aba.locator('[data-bloco="financeiro-gateway"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-sem-assinatura"]')).toHaveText("Sem assinatura no Asaas.");
    const texto = await aba.innerText();
    expect(texto).not.toContain("Nenhum");
    expect(texto).not.toContain("Não tem");
    expect(texto).not.toContain("Carência");
  });

  test("pagamento atrasado: só a carência, e o bloco do provedor aparece porque há provedor", async ({ page }) => {
    await page.goto(detalhe(7, "financeiro")); // Estúdio Aurora
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba.locator('[data-slot="financeiro-carencia"]')).toBeVisible();
    await expect(aba.getByText("Carência do pagamento até")).toBeVisible();
    await expect(aba.locator('[data-slot="financeiro-teste"]')).toHaveCount(0);
    await expect(aba.locator('[data-bloco="financeiro-gateway"]')).toBeVisible();
    await expect(aba.locator('[data-slot="financeiro-provedor"]')).toHaveText("Asaas");
  });

  test("vitalício: sem prazo de teste e sem provedor, a linha diz 'Sem cobrança: conta vitalícia.'", async ({ page }) => {
    await page.goto(detalhe(18, "financeiro")); // Ateliê Lumière
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba.locator('[data-slot="financeiro-vitalicio"]')).toBeVisible();
    await expect(aba.locator('[data-slot="financeiro-teste"]')).toHaveCount(0);
    await expect(aba.locator('[data-bloco="financeiro-gateway"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-sem-assinatura"]')).toHaveText("Sem cobrança: conta vitalícia.");
  });

  test("o 'Editar limite' mora na aba Ações, com o limite de agora, e abre a mesma caixa", async ({ page }) => {
    await page.goto(detalhe(1, "acoes"));
    const aba = page.locator('[data-slot="central-aba-acoes"]');
    await expect(aba.locator('[data-bloco="acoes-limite"]')).toBeVisible();
    // Plano Essencial sem limite gravado: vale o do plano (13 mi).
    await expect(aba.locator('[data-slot="acoes-limite-atual"]')).toContainText("13.000.000 tokens (Plano Essencial)");
    // O padrão do plano da empresa (que limpa o limite personalizado), o valor dos OUTROS planos e o valor livre.
    const opcoes = aba.locator('[data-slot="acoes-limite-opcoes"]');
    await expect(opcoes.locator("button")).toHaveText(["Padrão do plano, 13 mi", "Profissional, 33 mi", "Avançado, 100 mi", "Valor personalizado"]);
    await expect(opcoes.locator('[data-limite-plano="padrao"]')).toHaveAttribute("aria-pressed", "true");
    // O valor de outro plano NÃO grava: abre a caixa do valor personalizado já preenchida com o número dele.
    await opcoes.locator('[data-limite-valor="avancado"]').click();
    const caixa = page.locator('[data-slot="admin-limite-dialogo"]');
    await expect(caixa).toBeVisible();
    await expect(caixa.locator('[data-campo="limite"]')).toHaveValue("100");
    await expect(aba.locator('[data-slot="acoes-limite-atual"]')).toContainText("13.000.000 tokens (Plano Essencial)");
    // Salvar grava um limite personalizado (no preview valida e não grava): a empresa deixa de seguir o plano.
    await caixa.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(aba.locator('[data-slot="acoes-limite-atual"]')).toContainText("100.000.000 tokens (Limite personalizado)");
    await expect(opcoes.locator('[data-limite-plano="padrao"]')).toHaveAttribute("aria-pressed", "false");
    // O padrão volta ao do plano.
    await opcoes.locator('[data-limite-plano="padrao"]').click();
    await expect(aba.locator('[data-slot="acoes-limite-atual"]')).toContainText("13.000.000 tokens (Plano Essencial)");
    await expect(opcoes.locator('[data-limite-plano="padrao"]')).toHaveAttribute("aria-pressed", "true");
    // O valor personalizado abre a caixa de sempre.
    await aba.locator('[data-slot="central-editar-limite"]').click();
    await expect(page.locator('[data-slot="admin-limite-dialogo"]')).toBeVisible();
    await expect(page.locator('[data-slot="admin-limite-dialogo"] [data-campo="limite"]')).toHaveAttribute("placeholder", /Vazio = do plano \(13 mi\)/);
  });

  test("sem plano o padrão é 10 mi e o botão do padrão diz isso", async ({ page }) => {
    await page.goto(detalhe(2, "acoes")); // Clínica Sorriso, sem plano
    const opcoes = page.locator('[data-slot="acoes-limite-opcoes"]');
    await expect(opcoes.locator('[data-limite-plano="padrao"]')).toHaveText("Sem plano, 10 mi");
    // Sem plano, os três planos são valores personalizados à escolha.
    await expect(opcoes.locator("[data-limite-valor]")).toHaveText(["Essencial, 13 mi", "Profissional, 33 mi", "Avançado, 100 mi"]);
    await expect(page.locator('[data-slot="acoes-limite-atual"]')).toContainText("10.000.000 tokens (Sem plano)");
  });

  test("depois de uma ação não aparece 'Feito. A ação ficou registrada.'; só o aviso do preview", async ({ page }) => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "components/admin/DetalheCliente.tsx"), "utf8");
    expect(fonte).not.toContain("A ação ficou registrada");
    await page.goto(detalhe(1, "financeiro"));
    await page.locator('[data-slot="financeiro-bloqueio-botao"]').click();
    await page.locator('[data-slot="dialogo-bloqueio"]').getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(page.locator('[data-slot="central-recado"]')).toHaveText("Preview: nada foi gravado.");
    expect(await page.locator("body").innerText()).not.toContain("ficou registrada");
  });
});

test.describe("Ajustes da central: cabeçalho, Visão geral e peças", () => {
  test("o cabeçalho tem o nome, o selo da situação e o alerta: sem a linha de Conta e Plano e sem 'nunca cobrado' ao lado do Vitalício", async ({ page }) => {
    await page.goto(detalhe(18, "visao")); // vitalício, sem plano
    const cab = page.locator('[data-slot="central-detalhe"]');
    await expect(cab.locator('[data-slot="admin-situacao"]').first()).toHaveText("Vitalício");
    await expect(cab.locator('[data-slot="central-detalhe-situacao"]')).toHaveCount(0);
    await expect(cab.locator('[data-slot="central-detalhe-conta"]')).toHaveCount(0);
    await expect(cab.locator('[data-slot="central-detalhe-tipo"]')).toHaveCount(0);
    await expect(cab.locator('[data-slot="central-detalhe-plano"]')).toHaveCount(0);
    const topo = await cab.locator("div.border-b").first().innerText();
    expect(topo).not.toContain("nunca cobrado");
    expect(topo).not.toMatch(/Conta\s+(interno|beta|pago|Sem tipo)/);
    // O plano continua visível no cartão de Plano da Visão geral.
    await expect(page.locator('[data-slot="visao-plano"]')).toHaveText("Sem plano");
    // Os outros detalhes da situação continuam ao lado do selo (carência, dias restantes).
    await page.goto(detalhe(2, "visao")); // em teste
    await expect(page.locator('[data-slot="central-detalhe"] [data-slot="central-detalhe-situacao"]')).toContainText("restantes");
  });

  test("o tipo da conta (interno, beta, pago) não aparece em nenhuma tela da central", async ({ page }) => {
    const proibido = /tipo de conta|conta do tipo|sem tipo|\bConta\s+(interno|beta|pago)\b/i;
    for (const aba of ["visao", "uso", "atendimento", "financeiro", "acoes"]) {
      await page.goto(detalhe(1, aba));
      await expect(page.locator('[data-slot="central-detalhe"]')).toBeVisible();
      expect(await page.locator("body").innerText()).not.toMatch(proibido);
    }
    await expect(page.locator('[data-slot="visao-tipo"]')).toHaveCount(0);
    await page.goto("/design/clientes");
    await expect(page.locator('[data-slot="central-cliente"]').first()).toBeVisible();
    const lista = await page.locator("body").innerText();
    expect(lista).not.toMatch(proibido);
    expect(lista).not.toMatch(/\b(interno|beta)\b/i);
    // A linha do plano da lista diz só o plano.
    const ze = page.locator('[data-slot="central-cliente"]').filter({ hasText: "Barbearia do Zé" });
    await expect(ze).toContainText("Plano Essencial");
    await expect(ze).not.toContainText("beta");
    // O código da tela também não lê a coluna.
    for (const arq of ["components/admin/pecas.tsx", "components/admin/AbaVisaoGeral.tsx", "components/admin/DetalheCliente.tsx", "components/admin/ListaCentral.tsx", "lib/admin-empresas.ts", "app/design/clientes/dados.ts"]) {
      expect(fs.readFileSync(path.join(process.cwd(), arq), "utf8")).not.toContain("account_type");
    }
  });

  test("a Visão geral abre pelo que importa: situação, plano, IA no mês, WhatsApp, última atividade e alertas, e o resto embaixo", async ({ page }) => {
    await page.goto(detalhe(1, "visao"));
    const resumo = page.locator('[data-bloco="visao-resumo"]');
    await expect(resumo.locator('[data-slot="stat"]')).toHaveCount(6);
    const ordem = await resumo.locator('[data-slot="stat"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-bloco")));
    expect(ordem).toEqual(["visao-situacao", "visao-plano", "visao-consumo", "visao-whatsapp", "visao-atividade", "visao-alertas"]);
    await expect(page.locator('[data-slot="visao-situacao"]')).toHaveText("Ativo");
    await expect(page.locator('[data-slot="visao-plano"]')).toHaveText("Essencial");
    await expect(page.locator('[data-bloco="visao-consumo"] [data-slot="central-percentual"]')).toContainText("%");
    await expect(page.locator('[data-bloco="visao-consumo"] [data-slot="central-tokens"]')).toContainText("tokens");
    await expect(page.locator('[data-bloco="visao-consumo"] [data-slot="medidor-de-meta"]')).toBeVisible();

    // Hierarquia: o número do resumo é bem maior que o texto dos detalhes de baixo.
    const grande = await page.locator('[data-slot="visao-plano"]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const pequeno = await page.locator('[data-slot="visao-nome"]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(grande).toBeGreaterThanOrEqual(pequeno * 2);
    // Os detalhes ficam abaixo do resumo.
    const yResumo = (await resumo.boundingBox())!;
    const yDetalhe = (await page.locator('[data-bloco="visao-cliente"]').boundingBox())!;
    expect(yDetalhe.y).toBeGreaterThan(yResumo.y + yResumo.height - 1);
  });

  test("o medidor tem trilha visível sobre o cartão, nos dois temas", async ({ page }) => {
    for (const tema of ["light", "dark"] as const) {
      await page.context().addCookies([{ name: "theme", value: tema, url: "http://localhost" }]);
      await page.goto(detalhe(1, "uso"));
      const medidor = uso(page).locator('[data-bloco="central-uso"] [data-slot="medidor-de-meta"]');
      await expect(medidor).toBeVisible();
      const cores = await medidor.evaluate((el) => {
        const pai = el.closest('[data-bloco="central-uso"]')!;
        return { trilha: getComputedStyle(el).backgroundColor, cartao: getComputedStyle(pai).backgroundColor };
      });
      expect(cores.trilha, tema).not.toBe(cores.cartao);
      expect(cores.trilha, tema).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("o balão da rosca fica acima do número do meio", async ({ page }) => {
    await page.goto(detalhe(1, "atendimento"));
    const rosca = page.locator('[data-bloco="atendimento-solucoes"] [data-slot="chart"]');
    await rosca.scrollIntoViewIfNeeded();
    await expect(rosca.locator(".recharts-sector").first()).toBeAttached();
    const b = (await rosca.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 14);
    await expect(page.locator('[data-slot="chart-tooltip"]')).toBeVisible();
    const z = await page.locator(".recharts-tooltip-wrapper").first().evaluate((e) => getComputedStyle(e).zIndex);
    expect(Number(z)).toBeGreaterThanOrEqual(50);
  });

  test("o botão Clientes do detalhe só ocupa o próprio conteúdo", async ({ page }) => {
    await page.goto(detalhe(1, "visao"));
    const voltar = page.locator('[data-slot="central-detalhe"]').getByRole("link", { name: "Clientes", exact: true });
    const caixa = (await voltar.boundingBox())!;
    expect(caixa.width).toBeLessThan(140);
  });
});

test.describe("Ajustes da central: lista, rolagem e navegação", () => {
  test("a lista usa o filtro por ícone ao lado da busca e a linha é um link", async ({ page }) => {
    await page.goto("/design/clientes");
    const filtro = page.locator('[data-slot="central-filtro"]');
    const campo = page.getByLabel("Buscar clientes");
    const f = (await filtro.boundingBox())!;
    const c = (await campo.boundingBox())!;
    // Na mesma linha da busca, à direita dela.
    expect(Math.abs(f.y + f.height / 2 - (c.y + c.height / 2))).toBeLessThan(12);
    expect(f.x).toBeGreaterThan(c.x + c.width - 2);
    await expect(page.locator('[data-slot="central-cliente"]').first()).toHaveAttribute("href", /\/design\/clientes\/detalhe/);
  });

  test("numa janela baixa só o cartão rola: a página nunca ganha barra de rolagem", async ({ page }) => {
    for (const altura of [560, 640, 720]) {
      await page.setViewportSize({ width: 1366, height: altura });
      await page.goto("/design/clientes");
      await expect(page.locator('[data-slot="central-cliente"]').first()).toBeVisible();
      const medidas = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight,
        janela: window.innerHeight,
      }));
      expect(medidas.doc, `altura ${altura}`).toBe(medidas.janela);
    }
    // O trilho rola os itens por dentro (o cabeçalho de marca e o rodapé ficam fixos).
    await expect(page.locator('[data-slot="rail-itens"]')).toBeVisible();
  });

  // Achado do dono (15/10/2026, janela de uns 1360x775): uma faixa preta vazia abaixo do cartão e uma
  // barra de rolagem da PÁGINA além da do cartão. Causa: a tabela de texto dos gráficos (`sr-only`, que é
  // `position: absolute`) tinha a página como bloco de contenção e esticava o documento até mais de
  // 1000px. O cartão precisa terminar no fundo da janela (menos o respiro da casca) e a página nunca rola.
  for (const [largura, altura] of [
    [1360, 775],
    [1440, 900],
  ] as const) {
    test(`em ${largura}x${altura} a página não rola e o cartão vai até o fundo, na lista e em todas as abas do detalhe`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      const medir = async (cartao: string) => {
        const m = await page.evaluate((sel) => {
          const c = document.querySelector(sel)!.getBoundingClientRect();
          return { doc: document.documentElement.scrollHeight, janela: window.innerHeight, fundo: c.bottom };
        }, cartao);
        expect(m.doc, "o documento não rola").toBeLessThanOrEqual(m.janela);
        // O respiro da casca é 12px (`md:p-3`): o cartão acaba ali, sem faixa vazia embaixo.
        expect(Math.abs(m.fundo - (m.janela - 12)), "o cartão chega ao fundo").toBeLessThanOrEqual(1);
      };

      await page.goto("/design/clientes");
      await expect(page.locator('[data-slot="central-cliente"]').first()).toBeVisible();
      await medir('section[aria-label="Clientes"]');

      // Cliente com uso: as abas com gráfico trazem as tabelas de texto que esticavam a página.
      await page.goto(detalhe(1, "visao"));
      for (const aba of ["visao", "uso", "atendimento", "financeiro", "acoes"]) {
        await page.locator(`[data-slot="central-aba-${aba}-gatilho"]`).click();
        await expect(page.locator(`[data-slot="central-aba-${aba}"]`)).toBeVisible();
        await page.waitForTimeout(400);
        await medir('[data-slot="central-detalhe"]');
      }
      expect(await page.locator('[data-slot="chart-tabela"]').count()).toBeGreaterThan(0);
      // Nenhuma tabela de texto escapa da área que rola: o ancestral posicionado dela está DENTRO do detalhe.
      const fora = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="chart-tabela"]')].filter(
          (t) => !t.closest('[data-slot="central-detalhe"]') || (t.parentElement!.offsetParent as HTMLElement | null)?.tagName === "BODY",
        ).length,
      );
      expect(fora).toBe(0);
    });
  }

  test("o detalhe tem esqueleto próprio de carregamento (aparece na hora do clique, e vira prefetch em produção)", () => {
    const esqueleto = path.join(process.cwd(), "app/(app)/clientes/[id]/loading.tsx");
    expect(fs.existsSync(esqueleto)).toBe(true);
    expect(fs.readFileSync(esqueleto, "utf8")).toContain("central-detalhe-carregando");
  });

  test("trocar de aba não refaz as leituras: Uso de IA e Atendimento leem uma vez, adiantado, e a troca é só estado", async ({ page }) => {
    await page.goto(detalhe(1, "visao"));
    // Em segundo plano o detalhe já tem os pedaços de CÓDIGO das abas pesadas, e os DADOS saem quando o dono aponta para o
    // gatilho (o clique do Playwright passa o mouse e aperta): abrir a aba mostra o gráfico na hora.
    await page.waitForTimeout(500);
    const t0 = Date.now();
    await page.getByRole("tab", { name: "Uso de IA" }).click();
    await expect(uso(page).locator('[data-slot="central-grafico"]')).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(2500);
    // Voltar e ir de novo não monta nada de novo: o gráfico é o mesmo elemento.
    const marca = await uso(page).locator('[data-slot="central-grafico"]').evaluate((e) => {
      (e as HTMLElement & { __marca?: number }).__marca = 42;
      return 42;
    });
    await page.getByRole("tab", { name: "Visão geral" }).click();
    await page.getByRole("tab", { name: "Uso de IA" }).click();
    const depois = await uso(page).locator('[data-slot="central-grafico"]').evaluate((e) => (e as HTMLElement & { __marca?: number }).__marca);
    expect(depois).toBe(marca);
  });
});
