import { test, expect } from "@playwright/test";
import {
  AGENDA_PADRAO,
  blocoDaAgenda,
  consultarPeriodo,
  decidirAgenda,
  hhmm,
  horariosDoTime,
  iniciosDoDia,
  diaDoLembrete,
  execucaoDoDia,
  janelaDoLembrete,
  lembreteDoHorario,
  normalizarConfigDaAgenda,
  feriadoQueFecha,
  horarioDaAgenda,
  periodosDoDia,
  resumoDosPeriodos,
  quandoFalado,
  textoDaConsulta,
  validarHorario,
  type AgendaConfig,
  type SaidaDaAgenda,
} from "../lib/agenda";
import { EMPTY_CONFIG, GOALS, compilePersona, validateConfig, type BusinessHours } from "../lib/agent-prompt";
import { inicioDoDiaSP } from "../lib/fuso";
import { feriadoDoDia, feriadosDoAno, pascoa } from "../lib/feriados";

// AGENDA PRÓPRIA (docs/plano-agenda.md): as regras do dono de 28/10/2026, puras
// e com relógio FIXO. Quarta, 28/10/2026, 08:00 em São Paulo.

const MIN = 60_000;
const em = (dia: string, hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return inicioDoDiaSP(dia) + (h * 60 + m) * MIN;
};
const AGORA = em("2026-10-28", "08:00");
const aberto = { open: true, from: "08:00", to: "18:00" };
const HORAS: BusinessHours = {
  seg: aberto, ter: aberto, qua: aberto, qui: aberto, sex: aberto,
  sab: { open: true, from: "08:00", to: "12:00" },
  dom: { open: false, from: "08:00", to: "12:00" },
};
const CFG: AgendaConfig = { ...AGENDA_PADRAO, ativa: true, antecedenciaMin: 120, intervaloMin: 0, inicio: "meia" };
const lista = (ts: number[]) => ts.map(hhmm);
const VAZIA: SaidaDaAgenda = { acao: "", servico: "", dia: "", periodo: "", hora: "", agendamento: "" };

test.describe("lib/agenda: como os horários começam", () => {
  const base = { dia: "2026-10-29", hours: HORAS, duracaoMin: 30 };
  test("na hora cheia ou na meia hora (padrão)", () => {
    expect(lista(iniciosDoDia({ ...base, ocupados: [], config: CFG })).slice(0, 4)).toEqual(["08:00", "08:30", "09:00", "09:30"]);
  });
  test("na hora cheia", () => {
    expect(lista(iniciosDoDia({ ...base, ocupados: [], config: { ...CFG, inicio: "hora" } })).slice(0, 3)).toEqual(["08:00", "09:00", "10:00"]);
  });
  test("logo após o anterior, com intervalo de 10 min: 8h, 8h40, 9h20", () => {
    expect(lista(iniciosDoDia({ ...base, ocupados: [], config: { ...CFG, inicio: "seguido", intervaloMin: 10 } })).slice(0, 3)).toEqual(["08:00", "08:40", "09:20"]);
  });
  test("o intervalo entra na conta: fim + intervalo, arredondado para a próxima marca", () => {
    const ocupado = [{ inicio: em("2026-10-29", "08:00"), fim: em("2026-10-29", "08:40") }];
    expect(lista(iniciosDoDia({ ...base, ocupados: ocupado, config: { ...CFG, intervaloMin: 10 } }))[0]).toBe("09:00");
    expect(lista(iniciosDoDia({ ...base, ocupados: ocupado, config: { ...CFG, inicio: "seguido", intervaloMin: 10 } }))[0]).toBe("08:50");
  });
});

test.describe("lib/agenda: oferta por dia e período", () => {
  const base = { agora: AGORA, hours: HORAS, ocupados: [], config: CFG, duracaoMin: 30 };
  test("no máximo 3, os mais próximos do período", () => {
    const r = consultarPeriodo({ ...base, dia: "2026-10-29", periodo: "tarde" });
    expect(r.tipo === "ofertas" && lista(r.inicios)).toEqual(["12:00", "12:30", "13:00"]);
  });
  test("sem limite de dias à frente", () => {
    const r = consultarPeriodo({ ...base, dia: "2027-03-10", periodo: "manha" });
    expect(r.tipo).toBe("ofertas");
  });
  test("só livre dentro da antecedência: escala, não esconde", () => {
    const r = consultarPeriodo({ ...base, agora: em("2026-10-28", "16:30"), dia: "2026-10-28", periodo: "tarde" });
    expect(r.tipo).toBe("antecedencia");
  });
  test("dia fechado: diz que não tem horário naquele dia e pergunta outro dia", () => {
    const r = consultarPeriodo({ ...base, dia: "2026-11-01", periodo: "manha" });
    expect(r.tipo).toBe("fechado");
    expect(textoDaConsulta({ dia: "2026-11-01", periodo: "manha", resultado: r, agora: AGORA, antecedenciaMin: 120 })).toContain("não temos horário. Prefere outro dia?");
  });
  test("o texto da oferta diz o dia, o período e até 3 horas", () => {
    const r = consultarPeriodo({ ...base, dia: "2026-10-29", periodo: "tarde" });
    expect(textoDaConsulta({ dia: "2026-10-29", periodo: "tarde", resultado: r, agora: AGORA, antecedenciaMin: 120 })).toBe(
      "Amanhã, quinta, 29/10, à tarde, tenho 12h, 12h30 ou 13h. Qual fica melhor?"
    );
  });
});

test.describe("lib/agenda: validar e decidir", () => {
  const ctx = { agora: AGORA, hours: HORAS, ocupados: [{ inicio: em("2026-10-29", "10:00"), fim: em("2026-10-29", "10:30") }], config: CFG };
  const servicos = [{ id: 7, nome: "Avaliação", duracaoMin: 30 }];
  test("validarHorario", () => {
    expect(validarHorario({ ...ctx, inicio: em("2026-10-29", "11:00"), duracaoMin: 30 })).toBe("ok");
    expect(validarHorario({ ...ctx, inicio: em("2026-10-29", "10:00"), duracaoMin: 30 })).toBe("ocupado");
    expect(validarHorario({ ...ctx, inicio: em("2026-10-29", "11:10"), duracaoMin: 30 })).toBe("fora");
    expect(validarHorario({ ...ctx, inicio: em("2026-10-28", "09:00"), duracaoMin: 30 })).toBe("antecedencia");
    expect(validarHorario({ ...ctx, inicio: em("2026-10-28", "07:00"), duracaoMin: 30 })).toBe("passou");
  });
  test("decidirAgenda: consultar, marcar, escalar, indisponível, inválido, cancelar", () => {
    const d = (action: string, saida: Partial<SaidaDaAgenda>, daPessoa = [] as never[]) =>
      decidirAgenda({ ...ctx, action, saida: { ...VAZIA, ...saida }, servicos, daPessoa });
    expect(d("none", {}).tipo).toBe("nada");
    expect(d("none", { acao: "consultar", dia: "2026-10-29", periodo: "manha" }).tipo).toBe("consultar");
    expect(d("none", { acao: "consultar", dia: "2026-10-29" }).tipo).toBe("invalido");
    expect(d("agendar", { acao: "marcar", dia: "2026-10-29", hora: "11:00" }).tipo).toBe("marcar");
    expect(d("agendar", { acao: "marcar", dia: "2026-10-28", hora: "09:00" }).tipo).toBe("escalar");
    expect(d("agendar", { acao: "marcar", dia: "2026-10-29", hora: "10:00" }).tipo).toBe("indisponivel");
    expect(d("agendar", {}).tipo).toBe("invalido");
    const g = { codigo: "A1", id: 9, servicoId: 7, servicoNome: "Avaliação", inicio: em("2026-10-30", "09:00"), fim: em("2026-10-30", "09:30") };
    expect(decidirAgenda({ ...ctx, action: "none", saida: { ...VAZIA, acao: "cancelar", agendamento: "A1" }, servicos, daPessoa: [g] }).tipo).toBe("cancelar");
    const rem = decidirAgenda({ ...ctx, action: "agendar", saida: { ...VAZIA, acao: "remarcar", dia: "2026-10-30", hora: "14:00", agendamento: "a1" }, servicos, daPessoa: [g] });
    expect(rem.tipo === "remarcar" && rem.agendamento.id).toBe(9);
  });
  test("com mais de um serviço, sem código válido é inválido", () => {
    const dois = [...servicos, { id: 8, nome: "Retorno", duracaoMin: 15 }];
    expect(decidirAgenda({ ...ctx, action: "agendar", saida: { ...VAZIA, acao: "marcar", dia: "2026-10-29", hora: "11:00" }, servicos: dois, daPessoa: [] }).tipo).toBe("invalido");
    expect(decidirAgenda({ ...ctx, action: "agendar", saida: { ...VAZIA, acao: "marcar", servico: "V2", dia: "2026-10-29", hora: "11:00" }, servicos: dois, daPessoa: [] }).tipo).toBe("marcar");
  });
  test("o time marca fora do expediente", () => {
    const dentro = horariosDoTime({ ...ctx, dia: "2026-11-01", duracaoMin: 30 });
    const fora = horariosDoTime({ ...ctx, dia: "2026-11-01", duracaoMin: 30, foraDoExpediente: true });
    expect(dentro).toEqual([]);
    expect(fora.length).toBeGreaterThan(40);
  });
  test("bloco do prompt: sem horários, com o contrato e sem travessão", () => {
    const b = blocoDaAgenda({ agora: AGORA, daPessoa: [], servicos, config: CFG, hours: HORAS });
    expect(b).toContain("### AGENDA");
    expect(b).toContain("Só há um serviço");
    expect(b).not.toMatch(/\d{1,2}h\d{0,2}, /);
    expect(b).not.toMatch(/[–—]/);
  });
});

test.describe("lib/agenda: config", () => {
  test("valores fora da lista viram o padrão; antecedência é livre", () => {
    expect(normalizarConfigDaAgenda(null)).toEqual(AGENDA_PADRAO);
    expect(normalizarConfigDaAgenda({ ativa: true, antecedenciaMin: 45, intervaloMin: 7, inicio: "seguido" })).toEqual({
      ...AGENDA_PADRAO, ativa: true, antecedenciaMin: 45, inicio: "seguido",
    });
    expect(quandoFalado(em("2026-10-29", "10:30"), AGORA)).toBe("amanhã, quinta, 29/10, às 10h30");
  });
});

test.describe("lib/agenda: horário próprio", () => {
  test("o próprio vale; sem ele, a cópia do de atendimento; o banco guarda normalizado", () => {
    const proprio: BusinessHours = { ...HORAS, sab: { open: false, from: "08:00", to: "12:00" } };
    expect(horarioDaAgenda({ ...CFG, horario: proprio }, HORAS)).toBe(proprio);
    expect(horarioDaAgenda({ ...CFG, horario: null }, HORAS)).toBe(HORAS);
    expect(horarioDaAgenda({ ...CFG, horario: null }, null)).toBeNull();
    expect(normalizarConfigDaAgenda({ horario: { seg: { open: true, from: "10:00", to: "12:00" } } }).horario?.seg).toEqual({
      open: true, from: "10:00", to: "12:00",
    });
  });
});

test.describe("lib/agenda: lembrete às 9h do dia anterior aberto", () => {
  // HORAS: segunda a sexta abertas, sábado só manhã, domingo fechado.
  const semSabado: BusinessHours = { ...HORAS, sab: { open: false, from: "08:00", to: "12:00" } };
  test("dia comum: a execução cobre só amanhã", () => {
    expect(janelaDoLembrete("2026-10-28", HORAS)).toEqual({ de: "2026-10-29", ate: "2026-10-29" });
  });
  test("sexta com sábado e domingo fechados: saem os de sábado, domingo e segunda", () => {
    expect(janelaDoLembrete("2026-10-30", semSabado)).toEqual({ de: "2026-10-31", ate: "2026-11-02" });
  });
  test("empresa fechada no dia: não roda", () => {
    expect(janelaDoLembrete("2026-11-01", HORAS)).toBeNull();
    expect(janelaDoLembrete("2026-10-31", semSabado)).toBeNull();
  });
  test("feriado não entra: vale só o horário semanal", () => {
    // 02/11 (Finados) é segunda: para o produto, um dia aberto como outro qualquer.
    expect(janelaDoLembrete("2026-11-02", HORAS)).toEqual({ de: "2026-11-03", ate: "2026-11-03" });
    expect(diaDoLembrete("2026-11-03", HORAS)).toBe("2026-11-02");
  });
  test("o dia do lembrete de um horário e quem fica sem", () => {
    expect(diaDoLembrete("2026-11-02", semSabado)).toBe("2026-10-30");
    const inicio = em("2026-11-02", "10:00");
    expect(lembreteDoHorario({ inicio, marcadoEm: em("2026-10-30", "08:59"), hours: semSabado, ligado: true })).toEqual({ dia: "2026-10-30" });
    // Marcado depois da execução que o cobriria: sem lembrete.
    expect(lembreteDoHorario({ inicio, marcadoEm: em("2026-10-30", "09:00"), hours: semSabado, ligado: true })).toBeNull();
    expect(lembreteDoHorario({ inicio, marcadoEm: AGORA, hours: semSabado, ligado: false })).toBeNull();
    expect(execucaoDoDia("2026-10-30")).toBe(em("2026-10-30", "09:00"));
  });
});

test.describe("lib/feriados e lib/agenda: feriados nacionais", () => {
  test("Páscoa e móveis calculados; fixos do ano", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(feriadoDoDia("2026-04-03")).toEqual({ dia: "2026-04-03", nome: "Sexta-feira Santa", tipo: "nacional" });
    expect(feriadoDoDia("2026-02-17")?.tipo).toBe("facultativo"); // Carnaval
    expect(feriadoDoDia("2026-11-20")?.nome).toBe("Dia da Consciência Negra");
    expect(feriadoDoDia("2026-10-28")).toBeNull();
    expect(feriadosDoAno(2026).filter((x) => x.tipo === "nacional")).toHaveLength(10);
  });
  test("feriado nacional vem bloqueado para a IA; o dono libera um específico", () => {
    const base = { agora: AGORA, hours: HORAS, ocupados: [], duracaoMin: 30, periodo: "manha" as const };
    // 02/11/2026 é segunda (Finados).
    const r = consultarPeriodo({ ...base, config: CFG, dia: "2026-11-02" });
    expect(r).toEqual({ tipo: "fechado", feriado: "Finados" });
    expect(textoDaConsulta({ dia: "2026-11-02", periodo: "manha", resultado: r, agora: AGORA, antecedenciaMin: 120 })).toContain("é feriado (Finados)");
    expect(consultarPeriodo({ ...base, config: { ...CFG, feriadosLiberados: ["2026-11-02"] }, dia: "2026-11-02" }).tipo).toBe("ofertas");
    expect(validarHorario({ ...base, config: CFG, inicio: em("2026-11-02", "09:00") })).toBe("fora");
    // Ponto facultativo só aparece marcado: não bloqueia.
    expect(feriadoQueFecha("2027-02-08", CFG)).toBeNull();
  });
});

test.describe("lib/agenda: períodos pelo horário da agenda", () => {
  const tarde: BusinessHours = { ...HORAS, qui: { open: true, from: "13:00", to: "17:00" } };
  test("das 13h às 17h é só à tarde; pedir manhã diz o que existe", () => {
    expect(periodosDoDia("2026-10-29", tarde)).toEqual(["tarde"]);
    expect(periodosDoDia("2026-10-28", HORAS)).toEqual(["manha", "tarde"]);
    const r = consultarPeriodo({ agora: AGORA, hours: tarde, ocupados: [], config: CFG, duracaoMin: 30, dia: "2026-10-29", periodo: "manha" });
    expect(r).toEqual({ tipo: "semPeriodo", periodos: ["tarde"] });
    expect(textoDaConsulta({ dia: "2026-10-29", periodo: "manha", resultado: r, agora: AGORA, antecedenciaMin: 120 })).toBe(
      "Amanhã, quinta, 29/10 só temos horário à tarde. Pode ser?"
    );
  });
  test("o bloco do prompt resume os períodos da semana", () => {
    expect(resumoDosPeriodos(HORAS)).toBe("segunda a sexta: manhã e tarde; sábado: manhã");
  });
});

test.describe("Prompt do agente: a agenda ligada substitui o objetivo Agendar", () => {
  const cfg = { ...EMPTY_CONFIG, companyName: "Loja", companyWhat: "vende coisas.", agentName: "Ana", goals: ["duvidas", "agendar"] };
  test("sem agenda ninguém marca, nem o avançado", () => {
    const g = compilePersona({ mode: "guiado", config: cfg });
    expect(g.ok && g.persona).toContain('NUNCA use "agendar"');
    expect(g.ok && g.persona).toContain("Você não marca horários nem conversas");
    const a = compilePersona({ mode: "avancado", persona: "### IDENTIDADE\nVocê é a Ana. Confirmou dia e período: use agendar." });
    expect(a.ok && a.persona).toContain('NUNCA use "agendar"');
  });
  test("com agenda, o prompt manda seguir a seção AGENDA e o sistema oferece os horários", () => {
    const g = compilePersona({ mode: "guiado", config: cfg, agendaAtiva: true });
    expect(g.ok && g.persona).toContain("siga a seção AGENDA");
    expect(g.ok && g.persona).toContain("um dos horários que o sistema ofereceu");
    expect(g.ok && g.persona).not.toMatch(/[\u2013\u2014]/);
  });
  test("o objetivo Agendar sumiu da lista e da config", () => {
    expect(GOALS.map((g) => g.value)).toEqual(["duvidas", "qualificar"]);
    const v = validateConfig(cfg);
    expect(v.ok && v.value.goals).toEqual(["duvidas"]);
  });
});
