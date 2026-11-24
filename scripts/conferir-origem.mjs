// CONFERIR A ORIGEM DE CAMPANHA contra o banco de verdade (24/11/2026). De 07 a
// 23/11/2026 `origemDaCampanha` falhou em TODO turno (embed ambíguo no PostgREST),
// o erro foi engolido e a trava de robô nunca rodou; os testes só viam a função
// pura. Este script chama a função de verdade, com o schema de verdade, para o envio
// de campanha mais recente, e sai com erro se a origem não vier.
//
//   node scripts/conferir-origem.mjs
//
// Só leitura: o cliente de serviço é o do ensaio do prompt
// (scripts/ensaio/servico-somente-leitura.ts), que barra toda escrita. Não imprime
// telefone nem texto. Roda pelo `logado` (`e2e/campanhas-origem.auth.spec.ts`).

import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("..", import.meta.url));
process.loadEnvFile(`${raiz}.env.local`);
for (const k of Object.keys(process.env)) {
  if (k.startsWith("EVOLUTION_") || k.startsWith("N8N_")) delete process.env[k];
}

const jiti = createJiti(import.meta.url, {
  alias: {
    "@/lib/supabase/service": `${raiz}scripts/ensaio/servico-somente-leitura.ts`,
    "server-only": `${raiz}scripts/ensaio/vazio.ts`,
    "@": raiz,
  },
});
const { conferirOrigem } = await jiti.import(`${raiz}scripts/ensaio/origem-real.ts`);
const r = await conferirOrigem();
console.log(JSON.stringify(r));
process.exit(r.ok ? 0 : 1);
