// Offline, deterministic repo checks (audit F13, 02/10/2026). No network, no
// database, no paid call. `npm run checar`; also run by e2e/checagens.design.spec.ts.
//
// ERRORS (exit 1):
//  1. supabase/migrations: file name `<14-digit UTC>_<snake>.sql`, unique and
//     strictly increasing timestamps, and every migration after 20261001160000
//     opens with a `--` comment header and has no em or en dash.
//  2. Every `docs/...md` path cited in .claude/rules/*.md and CLAUDE.md exists
//     (a "why:" that points nowhere is a rule nobody can audit).
// WARNINGS (printed, exit 0 unless `--estrito`):
//  3. Every `n8n-nodes-base.webhook` node in n8n/*.json has authentication
//     other than none and a uuid path (audit SEC-01, waits for the owner's OK to
//     change the live workflows).
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const erros = [];
const avisos = [];
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
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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
    const auth = n.parameters?.authentication ?? "none";
    if (auth === "none") avisos.push(`n8n/${f}: webhook "${n.name}" has no authentication`);
    if (!UUID.test(String(n.parameters?.path ?? ""))) avisos.push(`n8n/${f}: webhook "${n.name}" path is not a uuid`);
  }
}

for (const a of avisos) console.warn(`aviso: ${a}`);
for (const e of erros) console.error(`erro: ${e}`);
const estrito = process.argv.includes("--estrito");
console.log(`checagens: ${erros.length} erro(s), ${avisos.length} aviso(s)`);
process.exit(erros.length || (estrito && avisos.length) ? 1 : 0);
