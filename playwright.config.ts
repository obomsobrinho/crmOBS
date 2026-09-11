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

// O projeto `ia` (as 12 armadilhas contra o cérebro real) SÓ EXISTE quando foi
// pedido pelo nome na linha de comando. Cada execução dele faz 12 chamadas ao
// modelo, que custam dinheiro; `npm run test:e2e` (todos os projetos) não pode
// pagar isso sem querer. `--project=ia` e `--project ia` entram; o resto, não.
//
// ⚠️ Os WORKERS recarregam este arquivo sem os argumentos da linha de comando
// (o `argv` deles é o do processo filho), e um projeto que existe no processo
// principal e não existe no worker falha com "Project ia not found". Por isso a
// decisão é copiada para o ambiente, que o worker herda.
const IA_PEDIDO =
  process.env.E2E_IA === "1" ||
  process.argv.some((a) => a === "ia" || a === "--project=ia");
if (IA_PEDIDO) process.env.E2E_IA = "1";

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
    // Testes que afirmam AUSÊNCIA ("isto não deve acontecer") e por isso não
    // toleram outro worker escrevendo no mesmo tenant ao mesmo tempo.
    //
    // ⚠️ Existe porque um deles quebrou de verdade: o teste do realtime exige que
    // abrir o inbox NÃO re-busque a lista, e os testes de pipeline, rodando em
    // paralelo, escrevem em `conversations`. O realtime fez o que devia, a lista
    // re-buscou, e a asserção de zero caiu com 5. O código estava certo e o teste
    // errado. `dependencies` faz este projeto começar só depois que o `logado`
    // inteiro terminou, e um worker só impede que eles briguem entre si.
    {
      name: "logado-serial",
      testMatch: /.*\.serial\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/dono.json",
      },
      dependencies: ["logado"],
    },
    // As 12 armadilhas contra o cérebro real (`*.ia.spec.ts`). Condicional a
    // `IA_PEDIDO` (ver o topo): fora de `logado` porque paga 12 chamadas ao
    // modelo, e fora da lista padrão para ninguém pagar sem querer.
    //
    // `retries: 1` de propósito e só aqui: o modelo não é determinístico, e uma
    // repetição separa "a base regrediu" de "o modelo variou uma vez". Duas
    // falhas seguidas do mesmo caso é sinal de verdade.
    ...(IA_PEDIDO
      ? [
          {
            name: "ia",
            testMatch: /.*\.ia\.spec\.ts/,
            retries: 1,
            workers: 3,
            use: {
              ...devices["Desktop Chrome"],
              storageState: "e2e/.auth/dono.json",
            },
            dependencies: ["setup"],
          },
        ]
      : []),
  ],
});
