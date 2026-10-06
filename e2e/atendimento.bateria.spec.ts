import fs from "node:fs";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { AGENT_PRESETS } from "../lib/agent-presets";
import { CASOS, type Caso, type Saida } from "./bateria/casos-obm";
import { SEGMENTOS } from "./bateria/casos-segmentos";

// BATERIA DE DIAGNÓSTICO DO ATENDIMENTO (05/10/2026), cérebro real em dryRun.
//
// 70 casos: 30 da OBM (prompt avançado congelado de 05/10) e 40 de quatro
// segmentos no guiado (odonto, advocacia, loja, pizzaria). Cobrem período e
// horário, contexto, momento da conversa, interpretação do pedido e fidelidade
// à base. Rodar ANTES de mudar a base do prompt, o modelo ou o calendário.
//
// ⚠️ PAGO e só quando pedido pelo nome: `npm run test:e2e:bateria` (uma chamada
// ao modelo por caso, mais a repetição de quem falhar). Nada vai ao WhatsApp:
// a bancada (`/api/playground`) é dryRun travado.
//
// Só assertiva por máquina, nunca leitura de texto à mão. O modelo varia: o
// projeto repete uma vez quem falha (`retries: 1`), e duas falhas seguidas do
// mesmo caso é sinal de verdade. Na rodada de 05/10 cada caso rodou 3 vezes; os
// números estão no relatório e em docs/adr/2026-10-05-turn-calendar-computed-in-code.md.

test.setTimeout(150_000);

const PERSONA_OBM = fs.readFileSync("e2e/fixtures/persona-obm-2026-10-05.txt", "utf8");
const HORARIO_OBM = {
  seg: { open: true, from: "08:00", to: "18:00" },
  ter: { open: true, from: "08:00", to: "18:00" },
  qua: { open: true, from: "08:00", to: "18:00" },
  qui: { open: true, from: "08:00", to: "18:00" },
  sex: { open: true, from: "08:00", to: "18:00" },
  sab: { open: false, from: "08:00", to: "12:00" },
  dom: { open: false, from: "08:00", to: "12:00" },
};

interface Resposta {
  output: Saida;
  diagnostics: { guardrail: { blocked: boolean; reason: string | null } };
}

async function rodar(request: APIRequestContext, c: Caso, corpo: Record<string, unknown>) {
  const res = await request.post("/api/playground", {
    data: {
      ...corpo,
      history: c.history,
      ...(c.retomada ? { retomada: { instruction: c.retomada } } : { message: c.message }),
      pedidosAbertos: c.pedidosAbertos ?? [],
      agoraTeste: c.agora,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const r = (await res.json()) as Resposta;
  const texto = r.output.messages.join(" ").toLowerCase();
  const falhas = r.diagnostics.guardrail.blocked
    ? c.aceitaGuardrail
      ? []
      : [`guardrail bloqueou: ${r.diagnostics.guardrail.reason}`]
    : c.check(r.output, texto);
  expect(
    falhas,
    `${c.titulo}\nesperado: ${c.espera}\naction=${r.output.action}; resposta: ${r.output.messages.join(" / ")}`
  ).toEqual([]);
}

function caso(c: Caso, corpo: () => Record<string, unknown>) {
  const nome = `${c.id}. ${c.titulo}`;
  // Pendente = falha conhecida que depende do dono: pulada, com o motivo no
  // relatório, sem pagar a chamada.
  test(nome, async ({ request }) => {
    test.fixme(!!c.pendente, c.pendente);
    await rodar(request, c, corpo());
  });
}

test.describe("Bateria: OBM, prompt avançado", () => {
  for (const c of CASOS)
    caso(c, () => ({ mode: "avancado", persona: PERSONA_OBM, hours: HORARIO_OBM }));
});

for (const seg of SEGMENTOS) {
  const base = AGENT_PRESETS.find((p) => p.id === seg.presetId)!.config;
  const config = {
    ...base,
    ...seg.over,
    details: [seg.over.details, ...seg.kb].filter(Boolean).join("\n"),
  };
  test.describe(`Bateria: ${seg.over.companyName} (${seg.expediente})`, () => {
    for (const c of seg.casos) caso(c, () => ({ mode: "guiado", config }));
  });
}
