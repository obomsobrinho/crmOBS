import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  DIAS_SEM_ATIVIDADE,
  FILTROS_DE_SITUACAO,
  alertasDaConta,
  diasSemAtividade,
  ehFiltroDeSituacao,
  estadoDoWhatsApp,
  nomeDoPlano,
  situacaoDaConta,
  type EntradaDeAlertas,
} from "../lib/admin-alertas";
import {
  atendimentoDe,
  atendimentoPorPeriodo,
  atuaisEAnteriores,
  diasDoJson,
  ehAbaDoCliente,
  fatiasDasSolucoes,
  marcasDoEixo,
  quebrarRotulo,
  horasDoJson,
  janelasDoAtendimento,
  movimentoDoPeriodo,
  planoDoAtendimento,
  ritmoDaBarra,
  usoBruto,
  usoDoPeriodo,
  usoParaTela,
} from "../lib/admin-cliente";
import { barrasDasSeries, SERIES_VAZIAS } from "../lib/painel-agregado";
import { ehPeriodo, ORDEM_PERIODOS, unidadeDoPeriodo } from "../lib/periodo";
import { chavesDoDiaCivil, chavesDoEsqueleto } from "../lib/metrics";
import { pct } from "../lib/format";
import { diasDoMes, somarDias } from "../lib/fuso";
import { montagemState, montagemTerminada } from "../lib/onboarding";
import { normalizarEstado } from "../lib/whatsapp-estado";
import { janelaFalsa } from "../app/design/clientes/dados";
import { contagemPorSolucao } from "../lib/solucoes";
import { estadoDaIa, estadoDoConsumo, mesSP } from "../lib/custo-ia";
import { accessState } from "../lib/billing";

// A CENTRAL "CLIENTES" DO DONO, regras puras e a trava por rota (P1 item 6;
// docs/plano-central-clientes.md, entrega 1). Sem banco e sem tela: a situação e
// os alertas, as contas das abas "Uso de IA" e "Atendimento" e a prova de que
// TODA página e rota da central chama a mesma guarda.

const H = 3_600_000;
const D = 24 * H;
// Quarta, 14/10/2026, 15:00 em São Paulo.
const AGORA = Date.parse("2026-10-14T18:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const conta = (status: string, extra: { trial?: number | null; grace?: number | null } = {}) => ({
  subscription_status: status,
  trial_ends_at: extra.trial == null ? null : iso(AGORA + extra.trial),
  grace_until: extra.grace == null ? null : iso(AGORA + extra.grace),
  vitalicio_desde: null as string | null,
  bloqueado_em: null as string | null,
  desativada_em: null as string | null,
});

/** O estado da IA que a lista e o detalhe calculam e entregam prontos aos alertas. */
const ia = (consumo: "normal" | "aviso" | "parado", o: { publicada?: boolean; ligada?: boolean } = {}) =>
  estadoDaIa({ publicada: o.publicada ?? true, ligada: o.ligada ?? true, consumo });

function entrada(extra: Partial<EntradaDeAlertas> = {}): EntradaDeAlertas {
  return {
    conta: conta("active"),
    estado: ia("normal"),
    publicada: true,
    temInstancia: true,
    ultimaAtividade: iso(AGORA - 2 * H),
    criadaEm: iso(AGORA - 60 * D),
    agora: AGORA,
    ...extra,
  };
}

test.describe("Situação (lib/admin-alertas.ts, sobre accessState)", () => {
  test("ativo, em teste com dias, teste encerrado, atrasado, cancelado e desconhecido", () => {
    expect(situacaoDaConta(conta("active"), AGORA)).toMatchObject({ chave: "ativo", rotulo: "Ativo", tom: "bom" });

    const teste = situacaoDaConta(conta("trialing", { trial: 4.5 * D }), AGORA);
    expect(teste).toMatchObject({ chave: "em_teste", rotulo: "Em teste", detalhe: "5 dias restantes", tom: "neutro" });
    // O último dia do teste ainda avisa (TRIAL_WARN_DAYS), em âmbar.
    expect(situacaoDaConta(conta("trialing", { trial: 0.5 * D }), AGORA)).toMatchObject({
      detalhe: "1 dia restante",
      tom: "aviso",
    });
    expect(situacaoDaConta(conta("trialing"), AGORA)).toMatchObject({ chave: "em_teste", detalhe: "sem prazo" });

    expect(situacaoDaConta(conta("trialing", { trial: -2 * D }), AGORA)).toMatchObject({
      chave: "teste_encerrado",
      rotulo: "Teste encerrado",
      tom: "perigo",
    });
    expect(situacaoDaConta(conta("past_due", { grace: 3 * D }), AGORA)).toMatchObject({
      chave: "atrasado",
      detalhe: "em carência",
      tom: "aviso",
    });
    expect(situacaoDaConta(conta("past_due", { grace: -1 * D }), AGORA)).toMatchObject({
      chave: "atrasado",
      detalhe: "acesso bloqueado",
      tom: "perigo",
    });
    expect(situacaoDaConta(conta("canceled"), AGORA)).toMatchObject({ chave: "cancelado", tom: "perigo" });
    expect(situacaoDaConta(conta("outra-coisa"), AGORA)).toMatchObject({ chave: "desconhecido", tom: "neutro" });
  });

  test("a situação é o tipo de acesso: um teste vencido bloqueia e a central mostra isso", () => {
    const vencido = conta("trialing", { trial: -2 * D });
    expect(accessState(vencido, new Date(AGORA)).blocked).toBe(true);
    expect(situacaoDaConta(vencido, AGORA).chave).toBe("teste_encerrado");
  });

  test("os filtros mapeiam das situações (que saem do tipo de acesso); plano sem nome conhecido é nulo", () => {
    expect(FILTROS_DE_SITUACAO.map((f) => f.chave)).toEqual([
      "vitalicio",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "bloqueado",
      "desativado",
    ]);
    expect(ehFiltroDeSituacao("active")).toBe(true);
    expect(ehFiltroDeSituacao("lifetime")).toBe(false);
    expect(ehFiltroDeSituacao(null)).toBe(false);
    expect(nomeDoPlano("essencial")).toBe("Essencial");
    expect(nomeDoPlano(null)).toBeNull();
    expect(nomeDoPlano("inventado")).toBeNull();
  });
});

test.describe("Alertas (lib/admin-alertas.ts)", () => {
  test("cliente saudável não tem alerta", () => {
    expect(alertasDaConta(entrada())).toEqual([]);
  });

  test("cada regra do plano, e a ordem do mais urgente ao menos", () => {
    const tudo = alertasDaConta(
      entrada({
        conta: conta("past_due", { grace: 3 * D }),
        estado: ia("parado"),
        whatsapp: "desconectado",
        ultimaAtividade: iso(AGORA - 9 * D),
      })
    );
    expect(tudo.map((a) => a.chave)).toEqual(["limite_parado", "pagamento", "whatsapp", "sem_atividade"]);
    expect(tudo[0].tom).toBe("perigo");
    expect(tudo.find((a) => a.chave === "pagamento")?.tom).toBe("aviso");

    const perto = alertasDaConta(entrada({ estado: ia(estadoDoConsumo(8_500_000, 10_000_000)) }));
    expect(perto.map((a) => a.chave)).toEqual(["limite_aviso"]);

    const naoTerminou = alertasDaConta(
      entrada({ publicada: false, estado: ia("normal", { publicada: false }), ultimaAtividade: null })
    );
    expect(naoTerminou.map((a) => a.chave)).toEqual(["montagem"]);
    // A regra é a do módulo de montagem, a mesma de `montagemState`.
    expect(montagemTerminada(false)).toBe(false);
    expect(montagemTerminada(true)).toBe(true);
    for (const published of [false, true]) {
      const input = { hasInstance: true, agentConfigured: true, tested: true, published, hasNotify: true };
      expect(montagemState(input).completo).toBe(montagemTerminada(published));
    }
  });

  test("pagamento bloqueado é perigo; o limite só conta com o agente no ar", () => {
    const bloqueado = alertasDaConta(entrada({ conta: conta("past_due", { grace: -D }) }));
    expect(bloqueado[0]).toMatchObject({ chave: "pagamento", tom: "perigo" });
    // Agente desligado: o teto não importa (como estadoDaIa), nem a falta de atividade.
    const desligado = alertasDaConta(
      entrada({ estado: ia("parado", { ligada: false }), ultimaAtividade: iso(AGORA - 30 * D) })
    );
    expect(desligado).toEqual([]);
  });

  test("sem atividade: 7 dias ou mais, contados da criação quando nunca houve turno", () => {
    expect(DIAS_SEM_ATIVIDADE).toBe(7);
    // Dias CIVIS de São Paulo (`diasDesde`): 6 dias atrás ainda não, 7 sim.
    expect(alertasDaConta(entrada({ ultimaAtividade: iso(AGORA - 6 * D) }))).toEqual([]);
    const sete = alertasDaConta(entrada({ ultimaAtividade: iso(AGORA - 7 * D) }));
    expect(sete[0]).toMatchObject({ chave: "sem_atividade", rotulo: "Sem atividade há 7 dias" });
    // Conta de ontem, sem turno: ainda não está parada.
    expect(alertasDaConta(entrada({ ultimaAtividade: null, criadaEm: iso(AGORA - 1 * D) }))).toEqual([]);
    expect(alertasDaConta(entrada({ ultimaAtividade: null, criadaEm: iso(AGORA - 12 * D) }))[0].rotulo).toBe(
      "Sem atividade há 12 dias"
    );
    expect(diasSemAtividade(iso(AGORA - 3 * D), iso(AGORA - 60 * D), AGORA)).toBe(3);
    expect(diasSemAtividade(null, iso(AGORA - 5 * D), AGORA)).toBe(5);
    // Virou o dia em São Paulo: 23:59 de ontem já são 1 dia, mesmo com 16 horas de diferença.
    expect(diasSemAtividade("2026-10-14T02:59:00Z", "2026-01-01T00:00:00Z", AGORA)).toBe(1);
  });

  test("WhatsApp: só desconectado conta, e só para quem tem instância", () => {
    expect(alertasDaConta(entrada({ whatsapp: "conectado" }))).toEqual([]);
    expect(alertasDaConta(entrada({ whatsapp: "desconhecido" }))).toEqual([]);
    expect(alertasDaConta(entrada({ whatsapp: "reconectando" }))).toEqual([]);
    expect(alertasDaConta(entrada({ whatsapp: "desconectado" }))[0].chave).toBe("whatsapp");
    expect(alertasDaConta(entrada({ whatsapp: "desconectado", temInstancia: false }))).toEqual([]);
    // Mesma regra da faixa do app: só `open` é conectado.
    expect(estadoDoWhatsApp("open")).toBe("conectado");
    expect(estadoDoWhatsApp("close")).toBe("desconectado");
    // Reconectando não é queda: o app o mostra à parte (WhatsAppBanner, ConexaoCampo) e a central não alerta.
    expect(estadoDoWhatsApp("connecting")).toBe("reconectando");
    expect(estadoDoWhatsApp("outra")).toBe("desconhecido");
    // A normalização é UMA só, a da faixa do app (lib/whatsapp-estado.ts).
    expect(normalizarEstado("open")).toBe("open");
    expect(normalizarEstado("close")).toBe("close");
    expect(normalizarEstado("connecting")).toBe("connecting");
    expect(normalizarEstado(42)).toBe("unknown");
    expect(estadoDoWhatsApp(undefined)).toBe("desconhecido");
  });

  test("nenhum texto leva travessão", () => {
    const dash = new RegExp("[\\u2013\\u2014]");
    const todos = alertasDaConta(
      entrada({ conta: conta("past_due", { grace: D }), estado: ia("parado"), whatsapp: "desconectado", ultimaAtividade: null })
    );
    for (const a of todos) expect(dash.test(a.rotulo)).toBe(false);
    for (const s of ["active", "trialing", "past_due", "canceled", "x"]) {
      const sit = situacaoDaConta(conta(s), AGORA);
      expect(dash.test(sit.rotulo + (sit.detalhe ?? ""))).toBe(false);
    }
  });
});

test.describe("Uso de IA (lib/admin-cliente.ts)", () => {
  test("o jsonb do banco vira dias e horas; formato torto vira vazio (a grade saiu: os picos têm a função própria)", () => {
    const dias = diasDoJson({
      dias: [
        ["2026-10-13", 10, 50_000, 20_000, 900],
        ["2026-10-14", 4, 20_000, 8_000, 300],
        ["x", "y"],
      ],
      cubo: [[1, 16, 9]],
    });
    expect(dias).toHaveLength(2);
    expect(dias[0]).toEqual({ dia: "2026-10-13", turnos: 10, tokens: { entrada: 50_000, cache: 20_000, saida: 900 } });
    expect(diasDoJson(null)).toEqual([]);
    expect(diasDoJson("lixo")).toEqual([]);

    // As horas: [data, hora, turnos, entrada, cache, saida]; hora fora de 0 a 23 e data torta caem.
    const horas = horasDoJson([
      ["2026-10-14", 9, 3, 1_000, 400, 30],
      ["2026-10-14", 24, 1, 1, 1, 1],
      ["14/10", 8, 1, 1, 1, 1],
    ]);
    expect(horas).toEqual([{ chave: "2026-10-14T09", turnos: 3, tokens: { entrada: 1_000, cache: 400, saida: 30 } }]);
    expect(horasDoJson(null)).toEqual([]);
    expect(usoBruto(null, "lixo")).toEqual({ dias: [], horas: [], primeira: null });
    // O primeiro turno do cliente (limita os meses do seletor): só uma data AAAA-MM-DD vale.
    expect(usoBruto(null, null, "2026-03-09").primeira).toBe("2026-03-09");
    expect(usoBruto(null, null, "ontem").primeira).toBeNull();
  });

  test("os quatro períodos: Dia sai por hora e é HOJE desde as 00h, os outros por dia (7, 15, 30 dias com hoje)", () => {
    const bruto = usoBruto(
      {
        dias: [
          ["2026-09-30", 1, 1_000_000, 0, 0],
          ["2026-10-07", 2, 100, 0, 0],
          ["2026-10-08", 3, 200, 0, 0],
          ["2026-10-14", 4, 1_000, 500, 10],
        ],
      },
      [
        ["2026-10-13", 15, 1, 300, 0, 3],
        ["2026-10-13", 16, 2, 400, 0, 4],
        ["2026-10-14", 14, 4, 1_000, 500, 10],
        ["2026-10-14", 15, 1, 50, 0, 1],
        // Antes das 00h de hoje (o Dia é o dia civil, não uma janela rolante): ignorada.
        ["2026-10-13", 14, 9, 9_999, 0, 9],
      ]
    );
    const tela = usoParaTela(bruto, AGORA, "gpt-5.4-mini");

    const dia = tela.periodos.dia;
    expect(dia.unidade).toBe("hora");
    // AGORA são 15h em São Paulo: as colunas vão de 00h a 15h de hoje (16), não de ontem às 16h.
    expect(dia.barras).toHaveLength(16);
    expect(dia.barras[0].chave).toBe("2026-10-14T00");
    expect(dia.barras[15].chave).toBe("2026-10-14T15");
    expect(dia.barras[15]).toMatchObject({ eixo: "15h", rotulo: "14/10, 15h", turnos: 1, usados: 51 });
    expect(dia.total.turnos).toBe(4 + 1);
    expect(dia.maior?.chave).toBe("2026-10-14T14");
    expect(dia.legenda).toBe("hoje, desde as 00h");

    const semana = tela.periodos.semana;
    expect(semana.unidade).toBe("dia");
    expect(semana.barras.map((b) => b.chave)).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
    // 7 dias com hoje: 07/10 fica de fora, e o rótulo leva o dia da semana (14/10/2026 é quarta).
    expect(semana.total.turnos).toBe(3 + 4);
    expect(semana.total.tokens.entrada).toBe(1_200);
    expect(semana.barras[6]).toMatchObject({ rotulo: "quarta, 14/10", eixo: "14/10" });
    expect(tela.periodos.quinzena.barras).toHaveLength(15);
    expect(tela.periodos.mes.barras).toHaveLength(30);
    // O mês de 30 dias (rolante) vai de 15/09 a 14/10: pega 30/09, que o mês CIVIL não pega.
    expect(tela.periodos.mes.total.turnos).toBe(1 + 2 + 3 + 4);

    // Custo pela tabela do modelo; modelo desconhecido é nulo, nunca um preço parecido.
    // (500 * 0,75 + 500 * 0,075 + 10 * 4,5) / 1e6 para o dia 14.
    expect(usoDoPeriodo(bruto, "semana", AGORA, "gpt-5.4-mini").barras[6].custoUsd).toBeCloseTo(
      (500 * 0.75 + 500 * 0.075 + 10 * 4.5) / 1e6,
      12
    );
    expect(usoDoPeriodo(bruto, "semana", AGORA, "gpt-9-turbo").total.custoUsd).toBeNull();
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("o dia de São Paulo manda: 31/10 de noite ainda é outubro, e o último dia da semana é 31/10", () => {
    const meiaNoite = Date.parse("2026-11-01T02:30:00Z"); // 31/10 23:30 em SP
    expect(mesSP(meiaNoite)).toBe("2026-10-01");
    expect(diasDoMes(mesSP(meiaNoite).slice(0, 7))).toBe(31);
    const semana = usoDoPeriodo(
      usoBruto({ dias: [["2026-10-31", 5, 1_000, 0, 10]] }, []),
      "semana",
      meiaNoite,
      "gpt-5.4-mini"
    );
    expect(semana.barras).toHaveLength(7);
    expect(semana.barras[6]).toMatchObject({ chave: "2026-10-31", turnos: 5, usados: 1_010, eixo: "31/10" });
    // As horas seguem o relógio de SP: 23h de 31/10 é a última coluna do Dia (e o dia tem as 24).
    const dia = usoDoPeriodo(usoBruto(null, [["2026-10-31", 23, 2, 10, 0, 1]]), "dia", meiaNoite, null);
    expect(dia.barras[23]).toMatchObject({ chave: "2026-10-31T23", turnos: 2 });
    expect(dia.barras[0].chave).toBe("2026-10-31T00");
  });

  test("o ritmo do limite é limite ÷ dias do mês (÷ 24 por hora): só aritmética sobre o limite", () => {
    expect(diasDoMes("2026-10")).toBe(31);
    expect(diasDoMes("2026-02")).toBe(28);
    expect(diasDoMes("2028-02")).toBe(29);
    expect(diasDoMes("2026-09")).toBe(30);
    expect(ritmoDaBarra(10_000_000, "2026-10-14", "dia")).toBeCloseTo(10_000_000 / 31, 6);
    expect(ritmoDaBarra(10_000_000, "2026-10-14T09", "hora")).toBeCloseTo(10_000_000 / 31 / 24, 6);
  });

  test("a soma das colunas é o total do período", () => {
    const bruto = usoBruto(
      {
        dias: [
          ["2026-10-12", 2, 1_000, 400, 20],
          ["2026-10-10", 3, 2_000, 800, 40],
        ],
      },
      []
    );
    const tela = usoParaTela(bruto, AGORA, "gpt-5.4-mini");
    const semana = tela.periodos.semana;
    expect(semana.barras.reduce((s, b) => s + b.turnos, 0)).toBe(semana.total.turnos);
    expect(semana.barras.reduce((s, b) => s + b.usados, 0)).toBe(semana.total.usados);
    expect(semana.total.turnos).toBe(5);
    expect(semana.maior?.chave).toBe("2026-10-10");
    // Sem leitura de picos, os quatro chips têm janela vazia (nunca um erro).
    expect(tela.picos.semana).toEqual({ dias: [], cubo: [] });
  });
});

test.describe("Atendimento (lib/admin-cliente.ts, sobre as contas do painel)", () => {
  const janela = {
    janela: 1,
    conversas: 48,
    sem_humano: 36,
    respostas_ia: 210,
    recebidas: 260,
    dif_n: 40,
    dif_lo: 42_000,
    dif_hi: 46_000,
    dif_soma: 1_760_000,
    dif_rapidas: 10,
    pessoas_novas: 12,
    primeira_em: null,
    leads: 20,
    pausar: 9,
    agendar: 3,
  };

  test("conversas, só a IA, mediana, motivos e soluções saem dos mesmos módulos do painel", () => {
    const a = atendimentoDe({
      periodo: "semana",
      janela,
      motivos: [
        { motivo: "falta_info", n: 2 },
        { motivo: "preco", n: 4 },
        { motivo: null, n: 2 },
        { motivo: "pessoa", n: 4 },
      ],
      solucoes: [
        { solucao: "orientou_ia", aberto: false, n: 4 },
        { solucao: "time_resolveu", aberto: false, n: 3 },
        { solucao: null, aberto: false, n: 1 },
        { solucao: null, aberto: true, n: 1 },
      ],
      regrasSalvas: 3,
    });
    expect(a.movimento).toEqual({ unidade: "dia", barras: [] });
    expect(a).toMatchObject({
      legenda: "últimos 7 dias",
      conversas: 48,
      semIntervencao: 36,
      respostasIa: 210,
      passouParaOTime: 9,
      // n par: média arredondada dos dois valores centrais.
      primeiraRespostaMs: 44_000,
      amostraMediana: 40,
      regrasSalvas: 3,
    });
    // Do mais frequente ao menos; empate segue a lista de motivos; "Sem motivo" por último.
    expect(a.pedidos.motivos.map((m) => m.motivo)).toEqual(["pessoa", "preco", "falta_info", null]);
    expect(a.pedidos.total).toBe(12);
    expect(a.pedidos.solucoes.map((s) => [s.solucao, s.n])).toEqual([
      ["orientou_ia", 4],
      ["time_resolveu", 3],
    ]);
    expect(a.pedidos.abertos).toBe(1);
    expect(a.pedidos.semSolucao).toBe(1);
  });

  test("sem amostra a mediana é nula (nunca um número inventado)", () => {
    const a = atendimentoDe({
      periodo: "dia",
      janela: { ...janela, dif_n: 0, dif_lo: null, dif_hi: null },
      motivos: [],
      solucoes: [],
      regrasSalvas: 0,
    });
    expect(a.primeiraRespostaMs).toBeNull();
    expect(a.pedidos.total).toBe(0);
  });

  test("contagemPorSolucao: aberto não tem solução, fechado sem solução fica à parte, zero não entra", () => {
    const r = contagemPorSolucao([
      { solucao: "time_assumiu", aberto: false, n: 2 },
      { solucao: "orientou_ia", aberto: false, n: 2 },
      { solucao: "ia", aberto: false, n: 1 },
      { solucao: null, aberto: true, n: 3 },
      { solucao: "time_resolveu", aberto: false, n: 0 },
    ]);
    // Empate: ordem da lista (orientou_ia vem antes de time_assumiu).
    expect(r.itens.map((i) => i.solucao)).toEqual(["orientou_ia", "time_assumiu"]);
    expect(r.abertos).toBe(3);
    expect(r.semSolucao).toBe(1);
    expect(r.total).toBe(8);
  });

  test("os quatro períodos saem de UMA leitura: a janela k é a posição do período na lista", () => {
    const lista = janelasDoAtendimento(AGORA);
    expect(lista).toHaveLength(4);
    expect(ORDEM_PERIODOS).toEqual(["dia", "semana", "quinzena", "mes"]);
    expect(lista[0]).toEqual({ de: AGORA - D, ate: AGORA });
    expect(lista[3]).toEqual({ de: AGORA - 30 * D, ate: AGORA });

    const por = atendimentoPorPeriodo({
      janelas: [1, 2, 3, 4].map((k) => ({ ...janelaFalsa(k), janela: k })),
      motivos: [
        { janela: 2, motivo: "preco", n: 5 },
        { janela: 4, motivo: "pessoa", n: 1 },
        { janela: 4, motivo: null, n: 2 },
      ],
      solucoes: [
        { janela: 2, solucao: "orientou_ia", aberto: false, n: 5 },
        { janela: 4, solucao: null, aberto: true, n: 3 },
      ],
      regrasSalvas: 2,
      agora: AGORA,
    });
    // O dia é a janela 1 (fator 1) e o mês a 4 (fator 4): cada período lê a SUA linha.
    expect(por.dia.conversas).toBe(48);
    expect(por.semana.conversas).toBe(96);
    expect(por.quinzena.conversas).toBe(144);
    expect(por.mes.conversas).toBe(192);
    expect(por.dia.pedidos.total).toBe(0);
    expect(por.semana.pedidos.motivos.map((m) => m.motivo)).toEqual(["preco"]);
    expect(por.mes.pedidos.total).toBe(3);
    expect(por.mes.pedidos.abertos).toBe(3);
    expect(por.semana.legenda).toBe("últimos 7 dias");
    expect(por.mes.regrasSalvas).toBe(2);
  });

  test("as janelas atuais e as anteriores vão numa chamada só (a lista do painel) e voltam separadas, renumeradas de 1 a 4", () => {
    const plano = planoDoAtendimento(AGORA);
    // Oito janelas: a atual e a anterior de cada período, na ordem de ORDEM_PERIODOS (a regra de lib/periodo.ts).
    expect(plano.lista).toHaveLength(8);
    expect(janelasDoAtendimento(AGORA)).toEqual(ORDEM_PERIODOS.map((k) => plano.lista[plano.operacao[k].atual - 1]));
    // A resposta do banco traz a janela 0 (o acumulado) e as oito, em qualquer ordem: cada uma vai para o seu lugar.
    const linhas = [0, ...plano.lista.map((_, i) => i + 1)].map((n) => ({ ...janelaFalsa(1), janela: n, conversas: 100 + n }));
    const { atuais, anteriores } = atuaisEAnteriores([...linhas].reverse(), plano);
    expect(atuais.map((j) => j.janela)).toEqual([1, 2, 3, 4]);
    expect(anteriores.map((j) => j.janela)).toEqual([1, 2, 3, 4]);
    ORDEM_PERIODOS.forEach((k, i) => {
      expect(atuais[i].conversas).toBe(100 + plano.operacao[k].atual);
      expect(anteriores[i].conversas).toBe(100 + plano.operacao[k].anterior);
    });
    // Cada janela anterior é a atual do mesmo período deslocada (a regra do painel): as bordas não se cruzam.
    ORDEM_PERIODOS.forEach((k) => {
      expect(plano.lista[plano.operacao[k].anterior - 1].ate).toBeLessThanOrEqual(plano.lista[plano.operacao[k].atual - 1].de);
    });
  });

  test("o movimento: as colunas do painel (barrasDasSeries), Dia por hora e os outros por dia, com o dia da semana", () => {
    const series = {
      ...SERIES_VAZIAS,
      dias: [
        ["2026-10-13", 40, 5],
        ["2026-10-14", 30, 2],
      ] as [string, number, number][],
      horas: [
        ["2026-10-14", 14, 7, 1],
        ["2026-10-14", 15, 3, 0],
      ] as [string, number, number, number][],
    };
    const por = atendimentoPorPeriodo({
      janelas: [1, 2, 3, 4].map((k) => ({ ...janelaFalsa(k), janela: k })),
      motivos: [],
      solucoes: [],
      regrasSalvas: 0,
      series,
      agora: AGORA,
    });
    const dia = por.dia.movimento;
    expect(dia.unidade).toBe("hora");
    expect(dia.barras).toHaveLength(24);
    expect(dia.barras[23]).toMatchObject({ chave: "2026-10-14T15", eixo: "15h", rotulo: "14/10, 15h", ia: 3, time: 0 });
    expect(dia.barras[22]).toMatchObject({ chave: "2026-10-14T14", ia: 7, time: 1 });

    const semana = por.semana.movimento;
    expect(semana.unidade).toBe("dia");
    expect(semana.barras).toHaveLength(7);
    expect(semana.barras[6]).toMatchObject({ chave: "2026-10-14", eixo: "14/10", rotulo: "quarta, 14/10", ia: 30, time: 2 });
    expect(semana.barras[5]).toMatchObject({ rotulo: "terça, 13/10", ia: 40, time: 5 });
    expect(por.quinzena.movimento.barras).toHaveLength(15);
    expect(por.mes.movimento.barras).toHaveLength(30);
    // Sem as séries (preview vazio) o esqueleto sai todo em zero: nada inventado.
    const vazio = movimentoDoPeriodo(barrasDasSeries(SERIES_VAZIAS, 7, AGORA), "semana");
    expect(vazio.barras.every((b) => b.ia === 0 && b.time === 0)).toBe(true);
  });

  test("período e aba desconhecidos são recusados", () => {
    expect(ehPeriodo("semana")).toBe(true);
    expect(ehPeriodo("ano")).toBe(false);
    expect(ehPeriodo(null)).toBe(false);
    expect(ehAbaDoCliente("uso")).toBe(true);
    expect(ehAbaDoCliente("financeiro")).toBe(true);
    expect(ehAbaDoCliente("acoes")).toBe(true);
    expect(ehAbaDoCliente("apagar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A TRAVA É POR ROTA (plano, decisão 1): não existe um prefixo que cubra tudo,
// então cada página e cada rota da central chama a MESMA guarda: as rotas
// `rotaDoAdmin` (404 para quem não é admin, 400 para id torto, `revalidar` quando
// escreve) e as páginas `adminDaPagina` (redireciona, nunca 404). Este teste LISTA
// os arquivos e prova que todos usam a guarda; uma página ou rota nova da central
// que esquecer a guarda reprova aqui, e uma que não estiver na lista também (a
// lista é conferida de propósito). `/admin` só redireciona o dono e dá 404 aos
// outros (`adminDaSessao` direto).
// ---------------------------------------------------------------------------

function achar(dir: string, nome: RegExp): string[] {
  const raiz = process.cwd();
  const saida: string[] = [];
  const andar = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else if (nome.test(e.name)) saida.push(path.relative(raiz, p).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(path.join(raiz, dir))) andar(path.join(raiz, dir));
  return saida.sort();
}

const ler = (arq: string) => fs.readFileSync(path.join(process.cwd(), arq), "utf8");

test.describe("Lógica dos gráficos da central (lib, fora dos componentes)", () => {
  test("unidadeDoPeriodo: a janela de 1 dia sai por hora, as outras por dia (a mesma regra do painel e da central)", () => {
    expect(unidadeDoPeriodo(1)).toBe("hora");
    expect(unidadeDoPeriodo(7)).toBe("dia");
    expect(unidadeDoPeriodo(30)).toBe("dia");
  });

  test("o esqueleto do painel é 24 horas ou N dias, da mais antiga à atual; o Dia da central é hoje desde as 00h", () => {
    const horas = chavesDoEsqueleto(1, AGORA);
    expect(horas).toHaveLength(24);
    expect(horas[0].chave).toBe("2026-10-13T16");
    expect(horas[23].chave).toBe("2026-10-14T15");
    const dias = chavesDoEsqueleto(7, AGORA).map((d) => d.chave);
    expect(dias).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
    // O Dia da central é o dia civil (00h até a hora atual), e a janela rolante do painel não muda.
    const uso = usoDoPeriodo(usoBruto(null, null), "dia", AGORA, null).barras.map((b) => b.chave);
    expect(uso).toEqual(chavesDoDiaCivil(AGORA).map((h) => h.chave));
    expect(uso).toHaveLength(16);
    expect(uso[0]).toBe("2026-10-14T00");
    // Os outros períodos da central seguem desenhando as MESMAS colunas do painel.
    const semanaUso = usoDoPeriodo(usoBruto(null, null), "semana", AGORA, null).barras.map((b) => b.chave);
    expect(semanaUso).toEqual(dias);
    const mov = movimentoDoPeriodo(barrasDasSeries(SERIES_VAZIAS, 7, AGORA), "semana").barras.map((b) => b.chave);
    expect(mov).toEqual(dias);
  });

  test("pct: porcentagem inteira, e zero quando não há todo", () => {
    expect(pct(252, 336)).toBe(75);
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 0)).toBe(0);
  });

  test("marcasDoEixo: marcas redondas que cobrem o maior valor, começando em zero", () => {
    expect(marcasDoEixo(322_581)).toEqual([0, 100_000, 200_000, 300_000, 400_000]);
    expect(marcasDoEixo(100)).toEqual([0, 25, 50, 75, 100]);
    expect(marcasDoEixo(7)).toEqual([0, 2, 4, 6, 8]);
    // Sem valor não quebra (o gráfico só desenha com uso, e o ritmo do limite é maior que zero).
    expect(marcasDoEixo(0)).toEqual([0]);
    for (const m of [13_441, 258_400, 1_000_000, 4_999_999]) {
      const marcas = marcasDoEixo(m);
      expect(marcas[0]).toBe(0);
      expect(marcas[marcas.length - 1]).toBeGreaterThanOrEqual(m);
      expect(marcas.length).toBeLessThanOrEqual(7);
    }
  });

  test("quebrarRotulo: até 18 letras fica numa linha; acima quebra no espaço mais perto do meio", () => {
    expect(quebrarRotulo("Preço ou orçamento")).toEqual(["Preço ou orçamento"]);
    expect(quebrarRotulo("Fora do que a empresa faz")).toEqual(["Fora do que a", "empresa faz"]);
    expect(quebrarRotulo("Tentativa de manipulação")).toEqual(["Tentativa de", "manipulação"]);
    // Sem espaço não há onde quebrar.
    expect(quebrarRotulo("Supercalifragilisticoexpialidoso")).toEqual(["Supercalifragilisticoexpialidoso"]);
  });

  test("a rosca: a cor segue a solução, aberto e sem registro vão por último em cinza, zero não entra", () => {
    const a = atendimentoDe({
      periodo: "semana",
      janela: { ...janelaFalsa(1), janela: 1 },
      motivos: [],
      solucoes: [
        { solucao: "time_assumiu", aberto: false, n: 2 },
        { solucao: "orientou_ia", aberto: false, n: 4 },
        { solucao: null, aberto: true, n: 1 },
        { solucao: null, aberto: false, n: 3 },
      ],
      regrasSalvas: 0,
    });
    const fatias = fatiasDasSolucoes(a);
    expect(fatias.map((f) => [f.chave, f.n])).toEqual([
      ["orientou_ia", 4],
      ["time_assumiu", 2],
      ["aberto", 1],
      ["sem", 3],
    ]);
    // A mesma solução tem sempre a mesma cor, em qualquer posição.
    expect(fatias[0].fill).toBe("var(--chart-rampa-4)");
    expect(fatias[1].fill).toBe("var(--chart-rampa-2)");
    expect(new Set(fatias.map((f) => f.fill)).size).toBe(4);
    expect(fatiasDasSolucoes({ pedidos: { total: 0, abertos: 0, semSolucao: 0, motivos: [], solucoes: [] } })).toEqual([]);
  });

  test("comTime é conversas menos as sem resposta humana", () => {
    const a = atendimentoDe({
      periodo: "dia",
      janela: { ...janelaFalsa(1), janela: 1 },
      motivos: [],
      solucoes: [],
      regrasSalvas: 0,
    });
    expect(a.conversas).toBe(48);
    expect(a.semIntervencao).toBe(36);
    expect(a.comTime).toBe(12);
  });
});

test.describe("Trava por rota da central", () => {
  const PAGINAS_DA_CENTRAL = ["app/(app)/clientes/[id]/page.tsx", "app/(app)/clientes/page.tsx"];
  const PAGINA_ADMIN = "app/admin/page.tsx";
  const ROTAS = [
    "app/api/admin/empresas/[id]/apagar/route.ts",
    "app/api/admin/empresas/[id]/atendimento/route.ts",
    "app/api/admin/empresas/[id]/cobrancas/route.ts",
    "app/api/admin/empresas/[id]/conta/route.ts",
    "app/api/admin/empresas/[id]/exportar/route.ts",
    "app/api/admin/empresas/[id]/limite/route.ts",
    "app/api/admin/empresas/[id]/uso/route.ts",
    "app/api/admin/empresas/[id]/whatsapp/route.ts",
    "app/api/admin/empresas/route.ts",
  ];

  test("as páginas e rotas da central são exatamente as listadas", () => {
    expect(achar("app/(app)/clientes", /^page\.tsx$/)).toEqual(PAGINAS_DA_CENTRAL);
    expect(achar("app/admin", /^page\.tsx$/)).toEqual([PAGINA_ADMIN]);
    expect(achar("app/api/admin", /^route\.ts$/)).toEqual(ROTAS);
    // Nada de layout herdando em silêncio: a central não tem layout próprio.
    expect(achar("app/(app)/clientes", /^layout\.tsx$/)).toEqual([]);
  });

  for (const arq of PAGINAS_DA_CENTRAL) {
    test(`${arq} chama a guarda de página (adminDaPagina), que redireciona e nunca dá 404`, () => {
      const fonte = ler(arq);
      expect(fonte).toMatch(/await adminDaPagina\(/);
    });
  }

  test("a página /admin dá 404 a quem não é admin", () => {
    const fonte = ler(PAGINA_ADMIN);
    expect(fonte).toMatch(/adminDaSessao\(/);
    expect(fonte).toContain("notFound()");
  });

  for (const arq of ROTAS) {
    test(`${arq} é embrulhada por rotaDoAdmin`, () => {
      const fonte = ler(arq);
      // Todo método exportado da rota passa pela guarda: nenhum `export async function`.
      expect(fonte).not.toMatch(/export (async )?function/);
      const metodos = [...fonte.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = (\w+)\(/g)];
      expect(metodos.length).toBeGreaterThan(0);
      for (const m of metodos) expect(m[2]).toBe("rotaDoAdmin");
      // Quem ESCREVE reconfere a sessão no Auth.
      if (metodos.some((m) => m[1] !== "GET")) expect(fonte).toContain("revalidar: true");
      // A rota da lista não tem [id]; as outras recebem o id já validado.
      if (!arq.includes("[id]")) expect(fonte).toContain("semId: true");
    });
  }

  test("a guarda das rotas responde 404 e 400 num lugar só", () => {
    const fonte = ler("lib/admin.ts");
    expect(fonte).toContain('new NextResponse("Not Found", { status: 404 })');
    expect(fonte).toContain("ehUuid(id)");
    expect(fonte).toContain("{ status: 400 }");
    // Nenhuma rota da central repete a 404 à mão.
    for (const arq of ROTAS) expect(ler(arq)).not.toContain('"Not Found"');
  });

  test("nenhuma rota da central usa sessaoDaRota (o admin não age como membro de um tenant)", () => {
    for (const arq of ROTAS) expect(ler(arq)).not.toMatch(/import[^;]*sessaoDaRota/);
  });

  test("a central nunca importa o service_role em componente", () => {
    for (const arq of achar("components/admin", /\.tsx$/)) {
      expect(ler(arq)).not.toContain("lib/supabase/service");
    }
  });

  test("o redirecionamento de quem não é admin mora num lugar só (sem caso especial no proxy)", () => {
    expect(ler("proxy.ts")).not.toContain("/contatos");
    expect(ler("lib/admin-acesso.ts")).not.toContain("listaDaCentral");
  });
});
