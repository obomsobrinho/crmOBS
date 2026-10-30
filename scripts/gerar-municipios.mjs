// Generates lib/dados/municipios.json: every Brazilian municipality per UF, with its IBGE code and the
// coordinates of its seat, for the "Nova busca" city picker of Campanhas (no external call on screen).
//
// Sources:
// - names and UF: the IBGE localities API (servicodados.ibge.gov.br/api/v1/localidades/municipios), the
//   source of truth for the official spelling;
// - coordinates of each seat: kelvins/municipios-brasileiros (MIT, keyed by the same IBGE code), because
//   the IBGE localities API has no coordinates.
//
// Usage:
//   node scripts/gerar-municipios.mjs                 (IBGE names + kelvins coordinates; the normal run)
//   node scripts/gerar-municipios.mjs --sem-ibge      (kelvins for both, when the IBGE API is unreachable)
//
// The output is sorted (UF, then name in pt-BR) so a re-run only shows real changes in the diff.

import fs from "node:fs";
import path from "node:path";

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";
const KELVINS = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";
const SAIDA = path.join(process.cwd(), "lib", "dados", "municipios.json");

const UF_DO_CODIGO = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN",
  25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC",
  43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
};

async function baixar(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/** kelvins CSV: codigo_ibge,nome,latitude,longitude,capital,codigo_uf,... (names have no commas). */
function lerKelvins(csv) {
  const linhas = csv.trim().split("\n").slice(1);
  const porCodigo = new Map();
  for (const l of linhas) {
    const [codigo, nome, lat, lng, , codigoUf] = l.split(",");
    porCodigo.set(Number(codigo), { nome, lat: Number(lat), lng: Number(lng), uf: UF_DO_CODIGO[Number(codigoUf)] });
  }
  return porCodigo;
}

async function main() {
  const semIbge = process.argv.includes("--sem-ibge");
  const coordenadas = lerKelvins(await baixar(KELVINS));
  let municipios;
  if (semIbge) {
    municipios = [...coordenadas.entries()].map(([codigo, m]) => ({ codigo, nome: m.nome, uf: m.uf }));
  } else {
    const ibge = JSON.parse(await baixar(IBGE));
    municipios = ibge.map((m) => ({ codigo: m["municipio-id"], nome: m["municipio-nome"], uf: m["UF-sigla"] }));
  }
  const porUf = {};
  let semCoordenada = 0;
  for (const m of municipios) {
    if (!m.uf) throw new Error(`municipality without UF: ${m.codigo}`);
    const c = coordenadas.get(m.codigo);
    if (!c) semCoordenada++;
    (porUf[m.uf] ??= []).push([m.nome, c ? c.lat : null, c ? c.lng : null, m.codigo]);
  }
  const ordenado = {};
  for (const uf of Object.keys(porUf).sort()) ordenado[uf] = porUf[uf].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(
    SAIDA,
    `${JSON.stringify({ fonte: semIbge ? "kelvins" : "ibge+kelvins", ufs: ordenado }).replace(/\],\[/g, "],\n[")}\n`,
  );
  console.log(`${municipios.length} municipalities in ${Object.keys(ordenado).length} UFs; ${semCoordenada} without coordinates`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
