import fs from "node:fs";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { buildPersona, type AgentConfig } from "../lib/agent-prompt";

// DATAS E HORÁRIOS CONTRA O CÉREBRO REAL (01/10/2026).
//
// O teste do dono às 22h de 30/09 achou a IA perguntando "hoje às 18h?",
// oferecendo "16h" sem o dia ao seguir a orientação do time, e trocando o 18h
// combinado por "amanhã de manhã". Estes casos repetem a conversa dele com a HORA
// FIXA (`agoraTeste`, que só vale em dryRun), então o resultado não depende da
// hora em que a bateria roda. Cobre os DOIS modos de prompt: o avançado da OBS
// (texto dele, copiado em `e2e/fixtures/persona-obs.txt`) e um guiado.
//
// Também existe o caso de CONTROLE, de dia: com 16h ainda no futuro, a IA não
// pode empurrar para amanhã. Sem ele, uma regra exagerada passaria.
//
// Paga: só roda com `npm run test:e2e:ia`.

test.setTimeout(150_000);

const NOITE = "2026-09-30T22:05:00-03:00"; // quarta, 22h05: amanhã é quinta, dia útil
const MANHA = "2026-09-30T10:00:00-03:00"; // quarta, 10h: 16h de hoje ainda vale

const PERSONA_OBS = fs.readFileSync("e2e/fixtures/persona-obs.txt", "utf8");

const CONFIG: AgentConfig = {
  version: 1,
  companyName: "Ótica Vista Clara",
  companyWhat: "Ótica com exame de vista e venda de óculos e lentes",
  companyAddress: "",
  companySite: "",
  hours: {
    seg: { open: true, from: "09:00", to: "19:00" },
    ter: { open: true, from: "09:00", to: "19:00" },
    qua: { open: true, from: "09:00", to: "19:00" },
    qui: { open: true, from: "09:00", to: "19:00" },
    sex: { open: true, from: "09:00", to: "19:00" },
    sab: { open: false, from: "09:00", to: "13:00" },
    dom: { open: false, from: "09:00", to: "13:00" },
  },
  hoursNote: "",
  agentName: "Bia",
  agentRole: "",
  tone: "profissional",
  goals: ["duvidas", "qualificar", "agendar"],
  neverAdmitAi: true,
  dontDo: [],
  escalateWhen: [],
  handoffNotice: "",
  details: "",
};
// Garante que a configuração compila (erro aqui é do teste, não do produto).
buildPersona(CONFIG);

type Turno = { role: "user" | "assistant"; content: string };
type Modo = { nome: string; corpo: Record<string, unknown> };
const MODOS: Modo[] = [
  { nome: "avançado (OBS)", corpo: { mode: "avancado", persona: PERSONA_OBS } },
  { nome: "guiado", corpo: { mode: "guiado", config: CONFIG } },
];

interface Resposta {
  output: { messages: string[]; action: string; summary: string };
  diagnostics: { pedidoNaFila?: boolean };
}

async function turno(request: APIRequestContext, corpo: Record<string, unknown>): Promise<Resposta> {
  const res = await request.post("/api/playground", { data: corpo });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Resposta;
}

const texto = (r: Resposta) => r.output.messages.join(" ").toLowerCase();
const HOJE = /\bhoje\b|\bagora\b|ainda hoje/;
const MANHA_ERRADA = /de manh[ãa]|parte da manh[ãa]|cedo/;

const INICIO: Turno[] = [
  { role: "user", content: "Quero falar com alguém sobre um orçamento" },
  { role: "assistant", content: "Claro, já vou verificar isso com o nosso time.\nPra adiantar, me conta rapidinho o que você precisa." },
];

for (const modo of MODOS) {
  test.describe(`Datas e horários, ${modo.nome}`, () => {
    test("à noite, a orientação \"às 16h\" vira \"amanhã às 16h\"", async ({ request }) => {
      const r = await turno(request, {
        ...modo.corpo,
        history: INICIO,
        retomada: { instruction: "ok, avisa ele que tenho disponibilidade as 16hrs, pergunta se ele pode" },
        agoraTeste: NOITE,
      });
      const t = texto(r);
      expect(t, t).toContain("amanhã");
      expect(t, t).toMatch(/16/);
      expect(t, t).not.toMatch(HOJE);
    });

    test("de dia, a mesma orientação NÃO é empurrada para amanhã", async ({ request }) => {
      const r = await turno(request, {
        ...modo.corpo,
        history: INICIO,
        retomada: { instruction: "ok, avisa ele que tenho disponibilidade as 16hrs, pergunta se ele pode" },
        agoraTeste: MANHA,
      });
      const t = texto(r);
      expect(t, t).toMatch(/16/);
      expect(t, t).not.toContain("amanhã");
    });

    test("à noite, \"depois às seis\" vira amanhã às 18h, nunca hoje", async ({ request }) => {
      const r = await turno(request, {
        ...modo.corpo,
        history: [
          ...INICIO,
          { role: "assistant", content: "Tenho disponibilidade amanhã às 16h. Você consegue nesse horário?" },
        ],
        message: "Isso lá eu não consigo. Será que teria como conversar depois às seis? Aí já fica melhor para mim.",
        agoraTeste: NOITE,
      });
      const t = texto(r);
      expect(t, t).toMatch(/18|seis/);
      expect(t, t).not.toMatch(HOJE);
      expect(t, t).not.toMatch(MANHA_ERRADA);
    });

    test("\"amanhã na\" completa o 18h combinado, nunca vira manhã", async ({ request }) => {
      const r = await turno(request, {
        ...modo.corpo,
        history: [
          ...INICIO,
          { role: "assistant", content: "Tenho disponibilidade às 16h. Você consegue?" },
          { role: "user", content: "Isso lá eu não consigo. Será que teria como conversar depois às seis?" },
          { role: "assistant", content: "Consigo sim, às 18h. Me confirma o dia?" },
        ],
        message: "Amanhã na",
        agoraTeste: NOITE,
      });
      const t = texto(r);
      expect(t, t).toMatch(/18/);
      expect(t, t).not.toMatch(MANHA_ERRADA);
    });

    test("conversa marcada é agendar e NÃO entra na fila de pedidos", async ({ request }) => {
      const r = await turno(request, {
        ...modo.corpo,
        history: [
          ...INICIO,
          { role: "assistant", content: "Consigo sim. Fica amanhã às 18h, certo?" },
        ],
        message: "Isso, amanhã às 18h pode marcar",
        agoraTeste: NOITE,
      });
      expect(r.output.action, texto(r)).toBe("agendar");
      expect(r.diagnostics.pedidoNaFila).toBe(false);
    });
  });
}
