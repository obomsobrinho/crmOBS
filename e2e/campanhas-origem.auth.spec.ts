import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

// A ORIGEM DE CAMPANHA contra o schema de verdade (24/11/2026). De 07 a 23/11/2026
// `origemDaCampanha` falhou em todo turno (dois caminhos entre `prospeccao_leads` e
// `prospeccao_buscas`, e o PostgREST recusa o embed sem o `!fk`), o erro foi engolido
// e a trava de robô nunca rodou. Os testes puros (`resposta-automatica.design`) não
// pegam isso: só a consulta real pega. O script lê o envio mais recente e chama a
// função de verdade, com o cliente de serviço que barra toda escrita; não imprime
// telefone. Sem a correção ele devolve o erro do PostgREST (conferido em 24/11/2026).

test("origemDaCampanha devolve a origem do envio de campanha mais recente", () => {
  // O Playwright roda da raiz do repositório (playwright.config.ts).
  const raiz = process.cwd();
  let saida: string;
  try {
    saida = execFileSync(process.execPath, ["scripts/conferir-origem.mjs"], { cwd: raiz, encoding: "utf8", timeout: 60_000 });
  } catch (e) {
    const out = e && typeof e === "object" && "stdout" in e ? String(e.stdout) : String(e);
    throw new Error(`a origem não veio: ${out}`);
  }
  const r = JSON.parse(saida.trim().split("\n").pop() ?? "{}");
  expect(r).toMatchObject({ ok: true, temEnvio: true, origem: true, mesmoEnvio: true });
});
