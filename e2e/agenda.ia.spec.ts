import fs from "node:fs";
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { AgentConfig } from "../lib/agent-prompt";

// AGENDA CONVERSANDO DE VERDADE (29/10/2026). Nasceu do teste do dono na OBS:
// ele ligou a agenda (só à tarde), pediu "amanhã" e a IA perguntou "manhã ou
// tarde?", repetiu a pergunta e abriu um pedido de ajuda. Nenhum teste tinha
// conversado com a IA real com a agenda LIGADA. Aqui cada caso é uma conversa:
// as mensagens da pessoa entram uma a uma, a resposta da IA volta para o
// histórico, e o que importa é o que a pessoa leria e o que o sistema decidiu.
//
// A agenda vai no corpo (`agendaTeste`, só dryRun): nada é gravado e a agenda do
// tenant de teste fica como está. Relógio fixo: quinta, 29/10/2026, 11h13.
//
// Paga: só roda com `npm run test:e2e:ia`.

test.setTimeout(240_000);

const AGORA = "2026-10-29T11:13:00-03:00";
const PERSONA_OBS = fs.readFileSync("e2e/fixtures/persona-obs.txt", "utf8");

const DIA_TODO = { open: true, from: "08:00", to: "18:00" };
const FECHADO = { open: false, from: "08:00", to: "12:00" };
const ATENDIMENTO = { seg: DIA_TODO, ter: DIA_TODO, qua: DIA_TODO, qui: DIA_TODO, sex: DIA_TODO, sab: FECHADO, dom: FECHADO };

// A agenda da OBS como o dono configurou: segunda a sexta, 13h às 18h.
const TARDE = { open: true, from: "13:00", to: "18:00" };
const AGENDA_OBS = {
  config: {
    inicio: "hora",
    intervaloMin: 15,
    antecedenciaMin: 120,
    lembrete: true,
    horario: { seg: TARDE, ter: TARDE, qua: TARDE, qui: TARDE, sex: TARDE, sab: { ...TARDE, open: false }, dom: { ...TARDE, open: false } },
  },
  servicos: [{ nome: "Reunião com cliente", duracaoMin: 30 }],
};
// Uma clínica com manhã e tarde (para os formatos de dia e a escolha do período).
const AGENDA_CLINICA = {
  config: { inicio: "meia", intervaloMin: 0, antecedenciaMin: 120, lembrete: true, horario: ATENDIMENTO },
  servicos: [{ nome: "Avaliação", duracaoMin: 30 }],
};

const CONFIG: AgentConfig = {
  version: 1,
  companyName: "Clínica Sorriso",
  companyWhat: "Clínica odontológica com avaliação, limpeza e clareamento",
  companyAddress: "",
  companySite: "",
  hours: ATENDIMENTO,
  hoursNote: "",
  hoursConfirmed: true,
  agentName: "Bia",
  agentRole: "",
  tone: "profissional",
  goals: ["duvidas", "qualificar"],
  neverAdmitAi: true,
  dontDo: [],
  escalateWhen: [],
  handoffNotice: "",
  details: "",
};

type Turno = { role: "user" | "assistant"; content: string };
interface Resposta {
  output: { messages: string[]; action: string; summary: string };
  diagnostics: { agenda?: { decisao: string; ofertas?: number; marcado?: string }; pedidoNaFila?: boolean; motivo?: string | null };
}

const OBS = { mode: "avancado", persona: PERSONA_OBS, hours: ATENDIMENTO, regrasSalvas: [], agendaTeste: AGENDA_OBS };
const CLINICA = { mode: "guiado", config: CONFIG, regrasSalvas: [], agendaTeste: AGENDA_CLINICA };

/** Uma conversa: manda as mensagens uma a uma e devolve cada resposta. */
async function conversa(request: APIRequestContext, corpo: Record<string, unknown>, inicio: Turno[], mensagens: string[]) {
  const history: Turno[] = [...inicio];
  const respostas: Resposta[] = [];
  for (const message of mensagens) {
    const res = await request.post("/api/playground", { data: { ...corpo, history, message, agoraTeste: AGORA } });
    expect(res.status(), await res.text()).toBe(200);
    const r = (await res.json()) as Resposta;
    respostas.push(r);
    history.push({ role: "user", content: message }, { role: "assistant", content: r.output.messages.join("\n") });
  }
  return respostas;
}
const texto = (r: Resposta) => r.output.messages.join(" ");
const diag = (r: Resposta) => JSON.stringify({ acao: r.output.action, motivo: r.diagnostics.motivo, agenda: r.diagnostics.agenda, texto: texto(r) });

// O começo real da conversa do dono (29/10), até a IA convidar para marcar.
const INICIO_OBS: Turno[] = [
  { role: "user", content: "Bom dia, gostaria de marcar um horário" },
  { role: "assistant", content: "Bom dia! Aqui é o Tony, da OBS. A gente desenvolve sistemas sob medida, automações e agentes inteligentes pra atendimento.\nMe conta um pouco do seu negócio e o que você tá querendo resolver." },
  { role: "user", content: "quero melhorar meu atendimento" },
  { role: "assistant", content: "Entendi. O que mais pega hoje no seu atendimento, demora pra responder, perder mensagens ou outra coisa?" },
  { role: "user", content: "perder muitas msgs" },
  { role: "assistant", content: "Faz sentido, e esse é um dos cenários que a gente mais resolve.\nPosso te mostrar numa conversa rápida como isso ficaria montado pro seu atendimento. Quer marcar?" },
];

test.describe("Agenda ligada, a conversa do dono na OBS (só à tarde)", () => {
  test("\"sim, vamos marcar para amanhã\" já oferece horários da tarde, e escolher um marca", async ({ request }) => {
    const [r1, r2] = await conversa(request, OBS, INICIO_OBS, ["sim, vamos marcar para amanhã", "pode ser às 14h"]);
    // Turno 1: nada de "manhã ou tarde": a agenda só atende à tarde.
    expect(r1.diagnostics.agenda?.decisao, diag(r1)).toBe("consultar");
    expect(r1.diagnostics.agenda?.ofertas ?? 0, diag(r1)).toBeGreaterThan(0);
    expect(texto(r1), diag(r1)).toMatch(/13h/);
    expect(texto(r1), diag(r1)).not.toMatch(/(?<!a)manh[ãa]/i);
    expect(r1.output.action, diag(r1)).not.toBe("pausar");
    // Turno 2: escolheu um horário oferecido: marcado (no dryRun, só diz).
    expect(r2.diagnostics.agenda?.decisao, diag(r2)).toBe("marcar");
    expect(r2.output.action, diag(r2)).toBe("agendar");
    expect(r2.diagnostics.agenda?.marcado ?? "", diag(r2)).toMatch(/14h/);
    expect(r2.diagnostics.pedidoNaFila, diag(r2)).toBe(false);
  });

  test("pedir manhã numa agenda só à tarde: diz que só tem à tarde, sem pedido de ajuda", async ({ request }) => {
    const [r] = await conversa(request, OBS, INICIO_OBS, ["sim, amanhã de manhã"]);
    expect(texto(r), diag(r)).toMatch(/tarde/i);
    expect(r.output.action, diag(r)).not.toBe("pausar");
  });

  test("quer marcar sem dizer o dia: pergunta o dia e diz que é à tarde, sem oferecer manhã", async ({ request }) => {
    const [r] = await conversa(request, OBS, INICIO_OBS, ["quero sim"]);
    expect(texto(r), diag(r)).not.toMatch(/(?<!a)manh[ãa]/i);
    expect(r.output.action, diag(r)).not.toBe("pausar");
  });
});

// O dia como a pessoa fala (pedido do dono, 29/10): "segunda-feira", "dia 05",
// "5 de novembro", "30/10". Hoje é quinta, 29/10/2026.
const INICIO_CLINICA: Turno[] = [
  { role: "user", content: "oi, queria marcar uma avaliação" },
  { role: "assistant", content: "Oi! Claro. Qual dia fica melhor pra você?" },
];
const FORMATOS: { dito: string; data: string }[] = [
  { dito: "pode ser quarta-feira à tarde", data: "04/11" },
  { dito: "dia 05 de manhã", data: "05/11" },
  { dito: "5 de novembro à tarde", data: "05/11" },
  { dito: "pode marcar 30/10 de manhã", data: "30/10" },
  { dito: "terça que vem, à tarde", data: "03/11" },
];

test.describe("Agenda ligada, o dia do jeito que a pessoa fala", () => {
  for (const f of FORMATOS) {
    test(`"${f.dito}" oferece horários de ${f.data}`, async ({ request }) => {
      const [r] = await conversa(request, CLINICA, INICIO_CLINICA, [f.dito]);
      expect(r.diagnostics.agenda?.decisao, diag(r)).toBe("consultar");
      expect(texto(r), diag(r)).toContain(f.data);
      expect(r.diagnostics.agenda?.ofertas ?? 0, diag(r)).toBeGreaterThan(0);
    });
  }

  test("\"segunda-feira\" cai no feriado de Finados (02/11): o sistema diz que é feriado, sem pedido de ajuda", async ({ request }) => {
    const [r] = await conversa(request, CLINICA, INICIO_CLINICA, ["pode ser segunda-feira à tarde"]);
    expect(r.output.action, diag(r)).not.toBe("pausar");
    expect(texto(r), diag(r)).toMatch(/feriado/i);
  });

  test("só o dia, numa agenda com manhã e tarde: pergunta qual período, entre os dois", async ({ request }) => {
    const [r1, r2] = await conversa(request, CLINICA, INICIO_CLINICA, ["amanhã", "à tarde"]);
    expect(["pedePeriodo", "nada"], diag(r1)).toContain(r1.diagnostics.agenda?.decisao ?? "nada");
    expect(texto(r1), diag(r1)).toMatch(/tarde/i);
    // Respondeu o período: a IA lembra do dia dito antes e oferece os horários.
    expect(r2.diagnostics.agenda?.decisao, diag(r2)).toBe("consultar");
    expect(texto(r2), diag(r2)).toContain("30/10");
  });
});
