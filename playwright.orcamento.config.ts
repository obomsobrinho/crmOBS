import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// O ORÇAMENTO DE DESEMPENHO no build de produção (docs/plano-dados-e-estado.md,
// seção 3.2): B1 (moldura no clique), B2 (nada bloqueia ao voltar a uma tela já
// vista, só para as áreas migradas) e B8 (JS por rota). Roda contra `next start`,
// nunca contra o dev server, que compila sob demanda e mede outra coisa.
//
// Pede o build ANTES (`npm run build`); a `fechar-entrega` roda nesta ordem.
// Usa a sessão do dono gravada pelo `e2e/auth.setup.ts`.
try {
  for (const line of fs.readFileSync(".env.e2e.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // sem arquivo local: a suíte precisa de login e não roda.
}

const PORTA = process.env.E2E_ORCAMENTO_PORT ?? "3005";
const BASE = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: BASE, trace: "off" },
  webServer: {
    command: `npx next start -p ${PORTA}`,
    url: `${BASE}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "orcamento",
      testMatch: /.*\.orcamento\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 }, storageState: "e2e/.auth/dono.json" },
      dependencies: ["setup"],
    },
  ],
});
