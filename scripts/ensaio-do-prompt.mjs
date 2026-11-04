// ENSAIO DO PROMPT: testa uma persona candidata (modo avançado) contra o turno de
// produção, sem gravar nada e sem WhatsApp. Ferramenta de desenvolvimento, fora
// do app.
//
//   node scripts/ensaio-do-prompt.mjs --persona <arquivo.md> --cenarios <arquivo.json> [--cliente <uuid>] [--saida <arquivo.md>]
//
// --persona   o texto que iria para `clients.persona` (o rabo da base é tirado e recolado, como em produção)
// --cenarios  JSON: { "agora"?: ISO, "cenarios": [ { "nome", "campanha"?, "mensagens": [...], "agora"? } ] }
//             "campanha": true usa a 1ª variante sugerida com "Empresa Exemplo"; ou
//             { "texto"?, "enviadoEm"?, "empresa"? } para o envio exato. Sem "campanha", contato que chegou sozinho.
// --cliente   a empresa (padrão: a única chamada OBS)
// --midias    catálogo de mídias de teste (JSON: [{ chave, tipo, path: "biblioteca/x.mp4", mime, descricao, quando_enviar, legenda? }])
// --saida     grava a transcrição também neste arquivo
//
// Lê o .env.local (Supabase e OpenAI). Cada mensagem é um turno de `processTurn`
// em dryRun com o modelo de verdade (custa tokens da OpenAI). O banco é lido de
// verdade, mas toda escrita é barrada (scripts/ensaio/servico-somente-leitura.ts),
// e as variáveis da Evolution e do n8n são apagadas antes de carregar o código.
// Exemplo: scripts/ensaio/exemplo.json.

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
const { ensaiar } = await jiti.import(`${raiz}scripts/ensaio/main.ts`);
await ensaiar(process.argv.slice(2));
