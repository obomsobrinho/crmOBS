// ENSAIO DO PROMPT: testa uma persona candidata (modo avançado) contra o turno de
// produção, sem gravar nada e sem WhatsApp. Ferramenta de desenvolvimento, fora
// do app.
//
//   node scripts/ensaio-do-prompt.mjs --persona <arquivo.md> --cenarios <arquivo.json> [--cliente <uuid>] [--documentos <a.md,b.md>] [--repeticoes K] [--saida <arquivo.md>]
//
// --persona   o texto que iria para `clients.persona` (o rabo da base é tirado e recolado, como em produção)
// --cenarios  JSON: { "agora"?: ISO, "cenarios": [ { "nome", "campanha"?, "mensagens": [...], "agora"? } ] }
//             "campanha": true usa a 1ª variante sugerida com "Empresa Exemplo"; ou
//             { "texto"?, "enviadoEm"?, "empresa"? } para o envio exato. Sem "campanha", contato que chegou sozinho.
// --cliente   a empresa (padrão: a única chamada OBS)
// --documentos  base de conhecimento candidata (md, txt, csv, pdf, docx, xlsx) separada por vírgula: fatiada e
//             embedada só em memória como na produção, top 5 por cosseno a cada turno; os trechos gravados da
//             empresa são ignorados e nada sobe para o banco nem para a conta
// --repeticoes  roda cada cenário K vezes, cada uma do zero (padrão 1)
//             Um cenário pode trocar "mensagens" por "lead": { "persona": "<quem é, objetivo, temperamento>", "maxTurnos"?: 8 }:
//             outro modelo (ENSAIO_MODELO_LEAD, padrão gpt-5.4-mini, temperatura 0.8) faz a pessoa, vendo só a
//             conversa, e para com [FIM] ou no teto (scripts/ensaio/lead-simulado.ts)
// --modelo    modelo do AGENTE nesta execução (padrão: OPENAI_AGENT_MODEL ou gpt-5.4-mini); o lead simulado não muda
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
// --modelo: troca SÓ o modelo do agente nesta execução (`AGENT_MODEL`, lib/agent.ts, é lido
// ao carregar o código, por isso vem antes do import). O lead simulado não muda.
const iModelo = process.argv.indexOf("--modelo");
if (iModelo >= 0 && process.argv[iModelo + 1]) process.env.OPENAI_AGENT_MODEL = process.argv[iModelo + 1];

const jiti = createJiti(import.meta.url, {
  alias: {
    "@/lib/supabase/service": `${raiz}scripts/ensaio/servico-somente-leitura.ts`,
    "server-only": `${raiz}scripts/ensaio/vazio.ts`,
    "@": raiz,
  },
});
const { ensaiar } = await jiti.import(`${raiz}scripts/ensaio/main.ts`);
await ensaiar(process.argv.slice(2));
