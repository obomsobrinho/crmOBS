// Offline, deterministic repo checks (audit F13, 02/10/2026). No network, no
// database, no paid call. `npm run checar`; also run by e2e/checagens.design.spec.ts.
//
// ERRORS (exit 1; the n8n check is strict, so `--estrito` is accepted but redundant):
//  1. supabase/migrations: file name `<14-digit UTC>_<snake>.sql`, unique and
//     strictly increasing timestamps, and every migration after 20261001160000
//     opens with a `--` comment header and has no em or en dash.
//  2. Every `docs/...md` path cited in .claude/rules/*.md and CLAUDE.md exists
//     (a "why:" that points nowhere is a rule nobody can audit).
//  3. n8n webhooks (audit R-01): every `n8n-nodes-base.webhook` node in n8n/*.json
//     has a `{{N8N_WEBHOOK_PATH_*}}` placeholder path (a real path is a secret) and
//     a placeholder `webhookId`; the app-called ones (not `Webhook EVO`, which
//     Evolution calls) have `authentication: headerAuth`.
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const erros = [];
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");
const lista = (dir, ext) =>
  fs.existsSync(path.join(raiz, dir))
    ? fs.readdirSync(path.join(raiz, dir)).filter((f) => f.endsWith(ext)).sort()
    : [];

// 1. Migrations
const CORTE = "20261001160000";
let anterior = "";
for (const f of lista("supabase/migrations", ".sql")) {
  const m = f.match(/^(\d{14})_([a-z0-9_]+)\.sql$/);
  if (!m) {
    erros.push(`migration ${f}: name must be <14-digit UTC>_<snake_case>.sql`);
    continue;
  }
  if (m[1] === anterior) erros.push(`migration ${f}: duplicated timestamp ${m[1]}`);
  if (m[1] < anterior) erros.push(`migration ${f}: timestamp goes backwards`);
  anterior = m[1];
  if (m[1] <= CORTE) continue;
  const texto = ler(`supabase/migrations/${f}`);
  if (!texto.trimStart().startsWith("--")) erros.push(`migration ${f}: must open with a -- comment header saying why`);
  if (new RegExp("[\\u2013\\u2014]").test(texto)) erros.push(`migration ${f}: no em dash or en dash`);
}

// 2. Doc references in the rules
const fontes = [...lista(".claude/rules", ".md").map((f) => `.claude/rules/${f}`), "CLAUDE.md"];
for (const arq of fontes) {
  const vistos = new Set();
  for (const m of ler(arq).matchAll(/docs\/[A-Za-z0-9_\-./]+?\.md/g)) {
    if (vistos.has(m[0])) continue;
    vistos.add(m[0]);
    if (m[0].includes("*") || m[0].includes("<")) continue;
    if (!fs.existsSync(path.join(raiz, m[0]))) erros.push(`${arq}: cites ${m[0]}, which does not exist`);
  }
}

// 3. n8n webhooks
const PATH_OK = /^{{N8N_WEBHOOK_PATH_[A-Z_]+}}$/;
const ID_OK = /^{{N8N_WEBHOOK_ID_[A-Z_]+}}$/;
const SEM_AUTH = new Set(["Webhook EVO"]);
for (const f of lista("n8n", ".json")) {
  let json;
  try {
    json = JSON.parse(ler(`n8n/${f}`));
  } catch {
    erros.push(`n8n/${f}: invalid JSON`);
    continue;
  }
  for (const n of json.nodes ?? []) {
    if (n.type !== "n8n-nodes-base.webhook") continue;
    if (!PATH_OK.test(String(n.parameters?.path ?? ""))) erros.push(`n8n/${f}: webhook "${n.name}" path must be a {{N8N_WEBHOOK_PATH_*}} placeholder`);
    if (n.webhookId !== undefined && !ID_OK.test(String(n.webhookId))) erros.push(`n8n/${f}: webhook "${n.name}" webhookId must be a {{N8N_WEBHOOK_ID_*}} placeholder`);
    if (!SEM_AUTH.has(n.name) && n.parameters?.authentication !== "headerAuth") erros.push(`n8n/${f}: webhook "${n.name}" must have authentication headerAuth`);
  }
}

for (const e of erros) console.error(`erro: ${e}`);
console.log(`checagens: ${erros.length} erro(s)`);
process.exit(erros.length ? 1 : 0);
