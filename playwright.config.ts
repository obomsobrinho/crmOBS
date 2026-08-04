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

// Testes e2e do CRM. Rodam contra o dev server (porta 3001). Os testes sem login
// batem nas telas /design (liberadas pelo proxy em dev). Os testes com login usam
// o storageState gravado por e2e/auth.setup.ts (credenciais em .env.e2e.local,
// fora do git).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- -p 3001",
    url: "http://localhost:3001",
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
