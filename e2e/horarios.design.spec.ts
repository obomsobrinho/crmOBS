import { test, expect } from "@playwright/test";
import {
  calendarioBlock,
  citaDia,
  diaDosHorarios,
  DIAS_DO_CALENDARIO,
  horarioCadastrado,
  horariosDoPeriodo,
  horariosCitados,
  minutosAgoraSP,
  notaDeHorarios,
} from "../lib/horarios";
import type { BusinessHours } from "../lib/agent-prompt";

// A CONTA DE HORÁRIO É DO CÓDIGO (lib/horarios.ts, 01/10/2026): o modelo errava
// para os dois lados ("hoje às 16h" às 22h, "amanhã" às 10h). Aqui a regra pura.

const NOITE = new Date("2026-09-30T22:05:00-03:00");
const MANHA = new Date("2026-09-30T10:00:00-03:00");

test.describe("Horários citados (lib/horarios.ts)", () => {
  test("lê as formas com número e ignora o que não é horário", () => {
    expect(horariosCitados("tenho disponibilidade as 16hrs")).toEqual([960]);
    expect(horariosCitados("pode ser 16h30 ou 18:00")).toEqual([990, 1080]);
    expect(horariosCitados("às 9 eu chego, depois 14 horas")).toEqual([540, 840]);
    expect(horariosCitados("desconto de 10% em 12 vezes")).toEqual([]);
    expect(horariosCitados("às seis")).toEqual([]);
  });

  test("minutos em São Paulo, não no fuso da máquina", () => {
    expect(minutosAgoraSP(NOITE)).toBe(22 * 60 + 5);
    expect(minutosAgoraSP(new Date("2026-10-01T02:30:00Z"))).toBe(23 * 60 + 30);
  });

  test("à noite 16h já passou (amanhã); de manhã ainda vem (hoje)", () => {
    expect(diaDosHorarios("tenho disponibilidade as 16hrs", NOITE)).toBe("amanhã às 16h");
    expect(diaDosHorarios("tenho disponibilidade as 16hrs", MANHA)).toBe("hoje às 16h");
    expect(notaDeHorarios("as 16hrs", NOITE)).toContain("já passou");
    expect(notaDeHorarios("as 16hrs", MANHA)).toContain("ainda não chegou");
    expect(notaDeHorarios("sem horário nenhum", NOITE)).toBeNull();
  });

  test("orientação que já diz o dia não ganha palpite", () => {
    expect(citaDia("amanhã às 16h")).toBe(true);
    expect(citaDia("quinta às 16h")).toBe(true);
    expect(citaDia("dia 02/10 às 16h")).toBe(true);
    expect(diaDosHorarios("quinta às 16h", NOITE)).toBeNull();
  });
});

// O CALENDÁRIO DO TURNO (05/10/2026): a bateria de diagnóstico achou o modelo
// agendando sábado com a empresa fechada e dizendo às 16h que 17h "já passou".
// Com o bloco pronto, o modelo de hoje acertou os 30 casos checáveis.
const COMERCIAL: BusinessHours = {
  seg: { open: true, from: "08:00", to: "18:00" },
  ter: { open: true, from: "08:00", to: "18:00" },
  qua: { open: true, from: "08:00", to: "18:00" },
  qui: { open: true, from: "08:00", to: "18:00" },
  sex: { open: true, from: "08:00", to: "18:00" },
  sab: { open: false, from: "08:00", to: "12:00" },
  dom: { open: false, from: "08:00", to: "12:00" },
};
const linha = (bloco: string, inicio: string) =>
  bloco.split("\n").find((l) => l.startsWith(`- ${inicio}`)) ?? "";

test.describe("Calendário do turno (lib/horarios.ts)", () => {
  test("sexta 19h: hoje já encerrou, amanhã é sábado fechado, segunda abre", () => {
    const b = calendarioBlock(new Date("2026-10-09T19:00:00-03:00"), COMERCIAL);
    expect(linha(b, "hoje")).toContain("sexta 09/10");
    expect(linha(b, "hoje")).toContain("JÁ ENCERROU às 18h");
    expect(linha(b, "amanhã")).toContain("sábado 10/10");
    expect(linha(b, "amanhã")).toContain("FECHADO");
    expect(linha(b, "segunda")).toContain("aberto das 8h às 18h");
    expect(b.split("\n").filter((l) => /^- (hoje|amanhã|[a-zç]+ \d)/.test(l))).toHaveLength(DIAS_DO_CALENDARIO);
    // Fechado agora: a próxima abertura vem pronta (o agente parava no "fechado").
    expect(b).toContain("Próxima abertura: segunda 12/10 às 8h");
  });

  test("aberto agora não ganha linha de próxima abertura; antes de abrir, é hoje", () => {
    expect(calendarioBlock(new Date("2026-10-07T16:00:00-03:00"), COMERCIAL)).not.toContain("Próxima abertura");
    expect(calendarioBlock(new Date("2026-10-07T06:00:00-03:00"), COMERCIAL)).toContain(
      "Próxima abertura: hoje (quarta 07/10) às 8h"
    );
  });

  test("quarta 16h: aberto agora, 17h ainda vale", () => {
    const b = calendarioBlock(new Date("2026-10-07T16:00:00-03:00"), COMERCIAL);
    expect(linha(b, "hoje")).toContain("ABERTO AGORA, até 18h");
    expect(linha(b, "hoje")).toContain("depois de 16h ainda vale");
  });

  test("segunda 23h50: amanhã é terça, sem escorregar de data", () => {
    const b = calendarioBlock(new Date("2026-10-05T23:50:00-03:00"), COMERCIAL);
    expect(linha(b, "hoje")).toContain("segunda 05/10");
    expect(linha(b, "amanhã")).toContain("terça 06/10");
  });

  test("antes de abrir e expediente que vira a noite", () => {
    const noite: BusinessHours = { ...COMERCIAL, qua: { open: true, from: "18:00", to: "02:00" } };
    const tarde = calendarioBlock(new Date("2026-10-07T15:00:00-03:00"), noite);
    expect(linha(tarde, "hoje")).toContain("ainda NÃO abriu: abre hoje às 18h");
    const madrugada = calendarioBlock(new Date("2026-10-07T23:30:00-03:00"), noite);
    expect(linha(madrugada, "hoje")).toContain("ABERTO AGORA, até 2h do dia seguinte");
    // Quinta 01h: ainda é o expediente de quarta.
    const virada = calendarioBlock(new Date("2026-10-08T01:00:00-03:00"), noite);
    expect(linha(virada, "hoje")).toContain("ABERTO AGORA (expediente de ontem), até 2h");
  });

  test("sem horário cadastrado: só datas, nunca o horário padrão", () => {
    expect(horarioCadastrado(null)).toBeNull();
    expect(horarioCadastrado({})).toBeNull();
    const fechado = Object.fromEntries(
      Object.entries(COMERCIAL).map(([k, v]) => [k, { ...v, open: false }])
    );
    expect(horarioCadastrado({ hours: fechado })).toBeNull();
    expect(horarioCadastrado({ hours: COMERCIAL })).toEqual(COMERCIAL);
    const b = calendarioBlock(new Date("2026-10-09T19:00:00-03:00"), null);
    expect(b).not.toMatch(/FECHADO|aberto|ABERTO|ENCERROU/);
    expect(linha(b, "amanhã")).toBe("- amanhã (sábado 10/10)");
  });

  test("sem travessão no texto que vai ao modelo", () => {
    const b = calendarioBlock(new Date("2026-10-07T23:30:00-03:00"), COMERCIAL);
    expect(b).not.toMatch(/[–—]/);
  });
});

// PERÍODOS DO DIA PELO EXPEDIENTE (decisões do dono, 06/10/2026): tarde das 13h
// às 17h, manhã até as 11h, noite a partir das 18h, sempre cortados pelo horário
// cadastrado e, hoje, só o que ainda não chegou. Nada sem horário cadastrado.
test.describe("Períodos do dia pelo expediente (lib/horarios.ts)", () => {
  test("a OBM (8h às 18h): manhã 8h a 11h, tarde 13h a 17h, nenhuma noite", () => {
    const dia = COMERCIAL.qua;
    expect(horariosDoPeriodo("manha", null, dia)).toEqual([8, 9, 10, 11]);
    expect(horariosDoPeriodo("tarde", null, dia)).toEqual([13, 14, 15, 16, 17]);
    expect(horariosDoPeriodo("noite", null, dia)).toEqual([]);
  });

  test("hoje, só o que ainda não chegou: às 13h a tarde vale 14h a 17h", () => {
    const dia = COMERCIAL.qua;
    expect(horariosDoPeriodo("tarde", 13 * 60, dia)).toEqual([14, 15, 16, 17]);
    expect(horariosDoPeriodo("tarde", 13 * 60 + 20, dia)).toEqual([14, 15, 16, 17]);
    expect(horariosDoPeriodo("tarde", 10 * 60, dia)).toEqual([13, 14, 15, 16, 17]);
    expect(horariosDoPeriodo("manha", 10 * 60, dia)).toEqual([11]);
    expect(horariosDoPeriodo("tarde", 17 * 60, dia)).toEqual([]);
  });

  test("outros expedientes: fecha às 16h, abre às 9h, pizzaria só à noite, fechado, sem horário", () => {
    expect(horariosDoPeriodo("tarde", null, { open: true, from: "08:00", to: "16:00" })).toEqual([13, 14, 15]);
    expect(horariosDoPeriodo("manha", null, { open: true, from: "09:30", to: "18:00" })).toEqual([10, 11]);
    const pizzaria = { open: true, from: "18:00", to: "23:00" };
    expect(horariosDoPeriodo("noite", null, pizzaria)).toEqual([18, 19, 20, 21, 22]);
    expect(horariosDoPeriodo("tarde", null, pizzaria)).toEqual([]);
    expect(horariosDoPeriodo("noite", null, { open: true, from: "18:00", to: "02:00" })).toEqual([18, 19, 20, 21, 22, 23]);
    expect(horariosDoPeriodo("tarde", null, COMERCIAL.sab)).toEqual([]);
    expect(horariosDoPeriodo("tarde", null, null)).toEqual([]);
  });

  test("o bloco diz os períodos de hoje e de amanhã; sem horário cadastrado, não diz", () => {
    const quarta13 = calendarioBlock(new Date("2026-10-07T13:00:00-03:00"), COMERCIAL);
    expect(quarta13).toContain("Hoje: tarde 14h, 15h, 16h e 17h. Amanhã: manhã 8h, 9h, 10h e 11h; tarde 13h, 14h, 15h, 16h e 17h.");
    expect(quarta13).not.toContain("noite");
    const sexta19 = calendarioBlock(new Date("2026-10-09T19:00:00-03:00"), COMERCIAL);
    expect(sexta19).toContain("Hoje: nenhum. Amanhã: nenhum.");
    expect(calendarioBlock(new Date("2026-10-07T13:00:00-03:00"), null)).not.toContain("Horários para oferecer");
  });
});
