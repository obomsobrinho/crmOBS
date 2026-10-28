import { test, expect } from "@playwright/test";
import {
  AGENDA_PADRAO,
  blocoDaAgenda,
  conflita,
  decidirAgenda,
  espalhados,
  faixaHoraria,
  horariosLivres,
  montarOfertas,
  normalizarConfigDaAgenda,
  quandoFalado,
  textoSemHorario,
  type AgendaConfig,
} from "../lib/agenda";
import type { BusinessHours } from "../lib/agent-prompt";
import { inicioDoDiaSP } from "../lib/fuso";

// AGENDA PRÓPRIA (docs/plano-agenda.md): a regra pura de horário livre e a
// decisão do turno, com relógio FIXO. Quarta, 28/10/2026, 08:00 em São Paulo.

const MIN = 60_000;
const em = (dia: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return inicioDoDiaSP(dia) + (h * 60 + m) * MIN;
};
const AGORA = em("2026-10-28", "08:00");
const HORAS: BusinessHours = {
  seg: { open: true, from: "09:00", to: "12:00" },
  ter: { open: true, from: "09:00", to: "12:00" },
  qua: { open: true, from: "09:00", to: "12:00" },
  qui: { open: true, from: "09:00", to: "12:00" },
  sex: { open: true, from: "09:00", to: "12:00" },
  sab: { open: false, from: "09:00", to: "12:00" },
  dom: { open: false, from: "09:00", to: "12:00" },
};
const CFG: AgendaConfig = { ...AGENDA_PADRAO, ativa: true, antecedenciaMin: 0, intervaloMin: 0, passoMin: 30 };
const horas = (inicios: number[]) => inicios.map((t) => faixaHoraria(t, t).split(" ")[0]);

test.describe("lib/agenda: horário livre", () => {
  test("grade dentro do expediente, o último cabe inteiro", () => {
    const d = horariosLivres({ agora: AGORA, hours: HORAS, ocupados: [], config: CFG, duracaoMin: 60, maxDias: 1 });
    expect(d[0].dia).toBe("2026-10-28");
    expect(horas(d[0].inicios)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  test("antecedência mínima corta o começo do dia", () => {
    const cfg = { ...CFG, antecedenciaMin: 120 };
    const d = horariosLivres({ agora: AGORA, hours: HORAS, ocupados: [], config: cfg, duracaoMin: 30, maxDias: 1 });
    expect(horas(d[0].inicios)[0]).toBe("10:00");
  });

  test("ocupado e intervalo tiram os horários que encostam", () => {
    const ocupado = [{ inicio: em("2026-10-28", "10:00"), fim: em("2026-10-28", "10:30") }];
    const sem = horariosLivres({ agora: AGORA, hours: HORAS, ocupados: ocupado, config: CFG, duracaoMin: 30, maxDias: 1 });
    expect(horas(sem[0].inicios)).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
    const com = horariosLivres({ agora: AGORA, hours: HORAS, ocupados: ocupado, config: { ...CFG, intervaloMin: 15 }, duracaoMin: 30, maxDias: 1 });
    expect(horas(com[0].inicios)).toEqual(["09:00", "11:00", "11:30"]);
  });

  test("dia fechado pula e o limite de dias para", () => {
    const d = horariosLivres({ agora: AGORA, hours: HORAS, ocupados: [], config: { ...CFG, diasAFrente: 7 }, duracaoMin: 30 });
    expect(d.map((x) => x.dia)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03"]);
  });

  test("o que já passou hoje não aparece", () => {
    const tarde = em("2026-10-28", "10:40");
    const d = horariosLivres({ agora: tarde, hours: HORAS, ocupados: [], config: CFG, duracaoMin: 30, maxDias: 1 });
    expect(horas(d[0].inicios)).toEqual(["11:00", "11:30"]);
  });

  test("expediente que vira a noite termina no dia seguinte", () => {
    const noite: BusinessHours = { ...HORAS, qua: { open: true, from: "22:00", to: "01:00" } };
    const d = horariosLivres({ agora: AGORA, hours: noite, ocupados: [], config: CFG, duracaoMin: 60, maxDias: 1 });
    expect(horas(d[0].inicios)).toEqual(["22:00", "22:30", "23:00", "23:30", "00:00"]);
  });

  test("conflita e espalhados", () => {
    expect(conflita(0, 10, [{ inicio: 10, fim: 20 }])).toBe(false);
    expect(conflita(0, 11, [{ inicio: 10, fim: 20 }])).toBe(true);
    expect(espalhados([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7]);
  });

  test("config do banco: só valores da lista, o resto vira o padrão", () => {
    expect(normalizarConfigDaAgenda(null)).toEqual(AGENDA_PADRAO);
    expect(normalizarConfigDaAgenda({ ativa: true, antecedenciaMin: 999, diasAFrente: 30 })).toEqual({
      ...AGENDA_PADRAO,
      ativa: true,
      diasAFrente: 30,
    });
  });
});

test.describe("lib/agenda: bloco e decisão do turno", () => {
  const servicos = [{ id: 7, nome: "Avaliação", duracaoMin: 30 }];
  const ofertas = montarOfertas({ agora: AGORA, hours: HORAS, ocupados: [], config: CFG, servicos });
  const daPessoa = [{ codigo: "A1", id: 55, servicoId: 7, servicoNome: "Avaliação", inicio: em("2026-10-30", "09:00"), fim: em("2026-10-30", "09:30") }];

  test("ofertas com código, no máximo 6 por dia e 3 dias", () => {
    expect(ofertas.length).toBe(18);
    expect(ofertas[0].codigo).toBe("S1");
    const bloco = blocoDaAgenda({ agora: AGORA, ofertas, daPessoa, servicos });
    expect(bloco).toContain("### HORÁRIOS LIVRES");
    expect(bloco).toContain("Avaliação (30 min), hoje, quarta, 28/10: 9h [S1]");
    expect(bloco).toContain("[A1] Avaliação, sexta, 30/10, às 9h");
    expect(bloco).not.toMatch(/[–—]/);
  });

  test("só marca com código deste turno", () => {
    const vazia = { acao: "" as const, horario: "", agendamento: "" };
    expect(decidirAgenda({ action: "none", saida: vazia, ofertas, daPessoa }).tipo).toBe("nada");
    expect(decidirAgenda({ action: "agendar", saida: vazia, ofertas, daPessoa }).tipo).toBe("invalido");
    expect(decidirAgenda({ action: "agendar", saida: { ...vazia, acao: "marcar", horario: "S99" }, ofertas, daPessoa }).tipo).toBe("invalido");
    const ok = decidirAgenda({ action: "agendar", saida: { ...vazia, acao: "marcar", horario: "s2" }, ofertas, daPessoa });
    expect(ok.tipo === "marcar" && ok.oferta.codigo).toBe("S2");
    const rem = decidirAgenda({ action: "agendar", saida: { acao: "remarcar", horario: "S3", agendamento: "A1" }, ofertas, daPessoa });
    expect(rem.tipo === "remarcar" && rem.agendamento.id).toBe(55);
    const can = decidirAgenda({ action: "none", saida: { ...vazia, acao: "cancelar", agendamento: "A1" }, ofertas, daPessoa });
    expect(can.tipo).toBe("cancelar");
    expect(decidirAgenda({ action: "none", saida: { ...vazia, acao: "cancelar", agendamento: "A9" }, ofertas, daPessoa }).tipo).toBe("nada");
  });

  test("textos escritos pelo código dizem dia e hora", () => {
    expect(quandoFalado(em("2026-10-29", "10:30"), AGORA)).toBe("amanhã, quinta, 29/10, às 10h30");
    expect(textoSemHorario(ofertas.slice(1), AGORA)).toMatch(/^Esse horário acabou de ser preenchido\. Posso hoje, quarta, 28\/10, às 9h30 ou /);
    expect(textoSemHorario([], AGORA)).toContain("alguém do time");
  });
});
