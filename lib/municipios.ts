import { normalizar } from "./clientes";

// AS CIDADES DO BRASIL, para escolher o local de uma busca de leads sem nunca errar
// o nome (revisão do dono, 30/10/2026). Os dados são um arquivo estático gerado por
// `scripts/gerar-municipios.mjs` (nomes do IBGE, coordenadas da sede), em
// `lib/dados/municipios.json`; nada aqui chama a rede. O navegador carrega o
// arquivo só quando o diálogo abre (`carregarMunicipios`).

/** Uma cidade: nome como o IBGE escreve, coordenadas da sede e o código IBGE. */
export interface Municipio {
  nome: string;
  uf: string;
  lat: number | null;
  lng: number | null;
  ibge: number;
}

export type MunicipiosPorUf = Record<string, Municipio[]>;

/** O JSON gerado (UF -> linhas `[nome, lat, lng, ibge]`) nas cidades; linha torta fica de fora. */
export function municipiosDoArquivo(arquivo: { ufs: Record<string, (string | number | null)[][]> }): MunicipiosPorUf {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const saida: MunicipiosPorUf = {};
  for (const [uf, linhas] of Object.entries(arquivo.ufs)) {
    saida[uf] = linhas.flatMap(([nome, lat, lng, ibge]) =>
      typeof nome === "string" && typeof ibge === "number" ? [{ nome, uf, lat: num(lat), lng: num(lng), ibge }] : [],
    );
  }
  return saida;
}

/** Carrega a lista (um pedaço separado do JavaScript, baixado só quando o diálogo abre). */
export async function carregarMunicipios(): Promise<MunicipiosPorUf> {
  const m = await import("./dados/municipios.json");
  return municipiosDoArquivo(m.default);
}

/**
 * As cidades da UF que casam com o que foi digitado, sem acento e sem caixa ("mutum",
 * "Mutúm"): primeiro as que COMEÇAM com o texto, depois as que o contêm; no máximo `limite`.
 */
export function buscarCidades(cidades: Municipio[], digitado: string, limite = 50): Municipio[] {
  const q = normalizar(digitado.trim());
  if (!q) return cidades.slice(0, limite);
  const comeca: Municipio[] = [];
  const contem: Municipio[] = [];
  for (const c of cidades) {
    const n = normalizar(c.nome);
    if (n.startsWith(q)) comeca.push(c);
    else if (n.includes(q)) contem.push(c);
    if (comeca.length >= limite) break;
  }
  return [...comeca, ...contem].slice(0, limite);
}

/** O `locationQuery` da fonte a partir da cidade escolhida: "Cidade, UF, Brasil". */
export function localDaBusca(c: { cidade: string; uf: string }): string {
  return `${c.cidade}, ${c.uf}, Brasil`;
}

/** A cidade daquele código IBGE na UF, ou null (o servidor confere a escolha com isto). */
export function cidadeDoCodigo(porUf: MunicipiosPorUf, uf: string, ibge: number): Municipio | null {
  return porUf[uf]?.find((c) => c.ibge === ibge) ?? null;
}
