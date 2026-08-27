import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Carrega credenciais de teste de .env.e2e.local (fora do git). Evita dep extra.
try {
  for (const line of fs.readFileSync(".env.e2e.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // sem arquivo local: só os testes sem login rodam.
}

// Testes e2e do CRM. Rodam contra o dev server (porta 3001 por padrão). Os testes
// sem login batem nas telas /design (liberadas pelo proxy em dev). Os testes com
// login usam o storageState gravado por e2e/auth.setup.ts (credenciais em
// .env.e2e.local, fora do git).
//
// `E2E_PORT` existe porque o Next 16 RECUSA um segundo dev server no mesmo
// diretório: se já existe um rodando em OUTRA porta (o do dia a dia, por
// exemplo), o Playwright não consegue subir o dele e a suíte nem começa. Com
// `E2E_PORT=3000 npm run test:e2e -- --project=sem-login` ele reusa o que já está
// no ar, em vez de obrigar a derrubar o servidor de quem está trabalhando.
const PORTA = process.env.E2E_PORT ?? "3001";
const BASE = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- -p ${PORTA}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Prepara a sessão logada (dono) uma vez; os testes autenticados reusam.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "sem-login",
      testMatch: /.*\.design\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "logado",
      testMatch: /.*\.auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/dono.json",
      },
      dependencies: ["setup"],
    },
  ],
});
