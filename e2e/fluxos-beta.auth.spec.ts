import { test, expect } from "@playwright/test";
import type { AgentConfig } from "../lib/agent-prompt";

// Os quatro fluxos que o dono pediu provados antes do beta (23/09/2026):
// login, esqueci a senha, handoff e orientação para a IA.
//
// Login e esqueci a senha rodam contra o Supabase Auth de verdade. Handoff e
// orientação chamam o CÉREBRO REAL pela bancada (`/api/playground`, dryRun
// travado pela rota): nada vai ao WhatsApp e nada é gravado em conversa.
//
// ⚠️ "Esqueci a senha" dispara um e-mail de verdade para a conta de teste
// (E2E_EMAIL). É o único jeito de provar que o pedido chega ao Supabase sem
// erro; o teste de `/design` usa endereço inexistente e prova só a tela.

test.setTimeout(150_000);

const EMAIL = process.env.E2E_EMAIL ?? "";
const SENHA = process.env.E2E_PASSWORD ?? "";

test.describe("Login e senha, sem sessão", () => {
  // Sem o storageState do dono: o ponto é entrar do zero.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login com a senha certa entra; com a errada, avisa e fica", async ({ page }) => {
    await page.goto("/login");
    // Esperar a tela assentar: clique antes da hidratação se perde (mesma
    // corrida do auth.setup.ts, vista em 26/09/2026).
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha").fill("senha-errada-de-proposito");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    // O "/" decide o destino (painel, montagem ou conversas); qualquer um vale,
    // desde que seja tela do app e não o login de novo.
    await expect(page).toHaveURL(/\/(painel|montagem|inbox|connect)/);
  });

  test("esqueci a senha manda o link para uma conta que existe", async ({ page }) => {
    await page.goto("/recuperar-senha");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByRole("button", { name: "Enviar link" }).click();
    // Mesma resposta de uma conta inexistente (não vira verificador de
    // contas), mas aqui o pedido vai ao Supabase com um usuário real, e um
    // erro dele (SMTP, limite) apareceria como falha.
    await expect(page.getByRole("heading", { name: "Link enviado" })).toBeVisible({
      timeout: 20_000,
    });
  });
});

// Configuração fixa, no corpo, para o resultado não depender do que estiver
// salvo no tenant de teste. Um negócio genérico, sem preço nenhum nas fontes.
const CONFIG: AgentConfig = {
  version: 1,
  companyName: "Oficina Teste",
  companyWhat: "Oficina mecânica de bairro",
  companyAddress: "Rua das Flores, 10",
  companySite: "",
  hours: {
    seg: { open: true, from: "08:00", to: "18:00" },
    ter: { open: true, from: "08:00", to: "18:00" },
    qua: { open: true, from: "08:00", to: "18:00" },
    qui: { open: true, from: "08:00", to: "18:00" },
    sex: { open: true, from: "08:00", to: "18:00" },
    sab: { open: false, from: "09:00", to: "13:00" },
    dom: { open: false, from: "09:00", to: "13:00" },
  },
  hoursNote: "",
  agentName: "Léo",
  agentRole: "atender os clientes da oficina",
  tone: "profissional",
  goals: ["duvidas", "qualificar"],
  neverAdmitAi: false,
  dontDo: ["fornecer precos"],
  escalateWhen: [],
  handoffNotice: "",
  details: "Fazemos revisão, troca de óleo, freio e suspensão.",
};

interface Resposta {
  output: { messages: string[]; action: string; summary: string };
  diagnostics: { guardrail: { blocked: boolean } };
}

test.describe("Handoff e orientação, com o cérebro real", () => {
  test("pedido que a IA não pode resolver abre handoff E ela responde", async ({
    request,
  }) => {
    const res = await request.post("/api/playground", {
      data: {
        message: "Quanto custa para trocar a embreagem do meu Gol 2012?",
        history: [],
        mode: "guiado",
        config: CONFIG,
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const r = (await res.json()) as Resposta;
    // Preço é proibido nesta configuração: o certo é passar para o time.
    expect(r.output.action).toBe("pausar");
    // ⚠️ E o handoff NÃO emudece (regra de 20/08/2026): a IA diz o que vai
    // verificar. Handoff mudo foi o defeito que deixou 46 contatos sem resposta.
    expect(r.output.messages.join(" ").trim().length).toBeGreaterThan(0);
    expect(r.output.summary.trim().length).toBeGreaterThan(0);
  });

  test("a orientação do time entra na resposta seguinte", async ({ request }) => {
    const res = await request.post("/api/playground", {
      data: {
        message: "E quanto fica a troca de óleo?",
        history: [],
        mode: "guiado",
        config: CONFIG,
        instruction: "Pode informar que a troca de óleo com filtro sai por R$ 180.",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const r = (await res.json()) as Resposta;
    // O valor só existe na orientação. Se ele aparece, a orientação chegou ao
    // modelo; e o guardrail aceita porque orientação do operador é fonte.
    expect(r.output.messages.join(" ")).toMatch(/180/);
    expect(r.diagnostics.guardrail.blocked).toBe(false);
  });
});
