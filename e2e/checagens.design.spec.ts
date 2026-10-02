import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// Checagens offline do repositório (`scripts/checagens.mjs`, auditoria F13):
// nomes e cabeçalhos das migrações e referências de docs nas regras. Roda no
// `sem-login` porque não precisa de banco, de rede nem de login.
test("as checagens do repositório passam (migrações e referências das regras)", () => {
  const r = spawnSync(process.execPath, ["scripts/checagens.mjs"], { encoding: "utf8" });
  expect(r.status, r.stderr || r.stdout).toBe(0);
});
