import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest só para regra pura, auxiliar de cache e esquema (docs/plano-dados-e-estado.md, D2).
// Tela e fluxo continuam no Playwright (`e2e/`).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "features/**/*.test.ts"],
    environment: "node",
  },
});
