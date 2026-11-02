import { normalizar } from "./clientes";
import { mascaraTelefoneBR } from "./format";
import { NOME_AUSENTE } from "./apify-campos";
import type { ItemDaFonteDeLeads } from "./fonte-de-leads";
import { pontuarLead, telefoneDoLead, tipoDoTelefone } from "./prospeccao";

// A PLANILHA DE LEADS (dono, 02/11/2026): uma lista em Excel (.xlsx) que o dono
// importa numa campanha, ao lado das buscas no Google. Puro (sem I/O, testável):
// achar as colunas pelo cabeçalho, conferir cada telefone (só celular BR entra:
// é o que recebe WhatsApp), tirar os repetidos da própria planilha e mostrar a
// amostra "como ficou" antes de gravar. A leitura do arquivo é `lib/planilha-servidor.ts`;
// a gravação reusa `prospeccao_concluir_busca` (o mesmo lead não duplica, e quem
// pediu para sair continua fora: `prospeccao_leads_do_filtro` olha `parou_em`).

/** O teto de linhas de uma planilha (uma importação é uma chamada de gravação). */
export const MAXIMO_DE_LINHAS = 2000;

/** O teto do arquivo (o corpo de um pedido na Vercel tem 4,5 MB). */
export const MAXIMO_DO_ARQUIVO_BYTES = 4 * 1024 * 1024;

/** A fonte gravada na busca de uma planilha (`prospeccao_buscas.fonte`). */
export const FONTE_PLANILHA = "planilha";

export type ColunaDaPlanilha = "telefone" | "nome" | "cidade" | "segmento";

/** As palavras de cabeçalho de cada coluna, sem acento e sem caixa (a primeira que bater vale). */
const CABECALHOS: Record<ColunaDaPlanilha, string[]> = {
  telefone: ["whatsapp", "celular", "telefone", "fone", "tel", "numero"],
  nome: ["empresa", "nome", "razao", "fantasia", "cliente"],
  cidade: ["cidade", "municipio"],
  segmento: ["segmento", "categoria", "ramo", "atividade"],
};

export type ColunasDaPlanilha = Partial<Record<ColunaDaPlanilha, number>>;

/**
 * As colunas pelo cabeçalho (a primeira linha). Sem cabeçalho de telefone, a coluna
 * em que a maioria das primeiras linhas é um telefone (uma planilha sem cabeçalho).
 */
export function colunasDaPlanilha(linhas: string[][]): { colunas: ColunasDaPlanilha; temCabecalho: boolean } {
  const cabecalho = (linhas[0] ?? []).map((c) => normalizar(c.trim()));
  const colunas: ColunasDaPlanilha = {};
  for (const [coluna, palavras] of Object.entries(CABECALHOS) as [ColunaDaPlanilha, string[]][]) {
    for (const p of palavras) {
      const i = cabecalho.findIndex((c, k) => c.includes(p) && !Object.values(colunas).includes(k));
      if (i >= 0) {
        colunas[coluna] = i;
        break;
      }
    }
  }
  if (colunas.telefone !== undefined) return { colunas, temCabecalho: true };
  // Sem cabeçalho: a coluna com mais telefones nas primeiras 20 linhas.
  const amostra = linhas.slice(0, 20);
  const largura = Math.max(0, ...amostra.map((l) => l.length));
  let melhor = -1;
  let melhorN = 0;
  for (let k = 0; k < largura; k++) {
    const n = amostra.filter((l) => tipoDoTelefone(l[k]) !== "invalido").length;
    if (n > melhorN) {
      melhor = k;
      melhorN = n;
    }
  }
  return melhor >= 0 && melhorN * 2 >= amostra.length ? { colunas: { telefone: melhor }, temCabecalho: false } : { colunas: {}, temCabecalho: true };
}

/** Uma linha que entra: o celular já como chave e o resto como veio. */
export interface LinhaImportada {
  telefone: string;
  telefoneOriginal: string;
  nome: string | null;
  cidade: string | null;
  segmento: string | null;
}

export interface LeituraDaPlanilha {
  validas: LinhaImportada[];
  /** Linhas com um telefone que não é celular BR (fixo, curto, torto): o número da linha e o valor. */
  invalidas: { linha: number; valor: string }[];
  /** Linhas sem telefone nenhum (puladas sem aviso por linha). */
  vazias: number;
  /** O mesmo celular repetido na planilha (fica a primeira linha). */
  repetidas: number;
}

const celula = (l: string[], i: number | undefined) => (i === undefined ? null : (l[i] ?? "").trim() || null);

/** As linhas da planilha (já sem o cabeçalho) conferidas uma a uma. */
export function lerLinhas(linhas: string[][], colunas: ColunasDaPlanilha, primeiraLinha: number): LeituraDaPlanilha {
  const r: LeituraDaPlanilha = { validas: [], invalidas: [], vazias: 0, repetidas: 0 };
  const vistos = new Set<string>();
  linhas.forEach((l, k) => {
    const bruto = celula(l, colunas.telefone);
    if (!bruto) {
      r.vazias++;
      return;
    }
    const chave = telefoneDoLead(bruto);
    if (!chave) {
      r.invalidas.push({ linha: primeiraLinha + k, valor: bruto });
      return;
    }
    if (vistos.has(chave)) {
      r.repetidas++;
      return;
    }
    vistos.add(chave);
    r.validas.push({ telefone: chave, telefoneOriginal: bruto, nome: celula(l, colunas.nome), cidade: celula(l, colunas.cidade), segmento: celula(l, colunas.segmento) });
  });
  return r;
}

/** "Como ficou": o número como estava na planilha e como o sistema vai usar. */
export function amostraDosNumeros(validas: LinhaImportada[], quantos = 5): { original: string; comoFica: string }[] {
  return validas.slice(0, quantos).map((v) => ({ original: v.telefoneOriginal, comoFica: `+55 ${mascaraTelefoneBR(v.telefone)}` }));
}

/** Uma linha da planilha no formato que `prospeccao_concluir_busca` grava (sem nada que a fonte traria). */
export function itemDaPlanilha(v: LinhaImportada): ItemDaFonteDeLeads {
  const segmento = v.segmento ?? "";
  return {
    telefone: v.telefone,
    telefone_original: v.telefoneOriginal,
    tipo_telefone: "celular",
    fonte_id: null,
    nome: v.nome ?? NOME_AUSENTE,
    segmento: v.segmento,
    endereco: null,
    bairro: null,
    cidade: v.cidade,
    site: null,
    site_classe: "nao",
    nota: null,
    avaliacoes: null,
    pontuacao: pontuarLead({ telefone: v.telefone, segmento, site: null, nota: null, avaliacoes: null }).pontos,
    fechado: false,
    detalhes: { lat: null, lng: null, reivindicado: null, horarios: null, distribuicao: null, fotos: null, categorias: [], endereco: null, instagram: null },
  };
}

/** O que a tela mostra antes de gravar (e o que a rota devolve na prévia). */
export interface PreviaDaPlanilha {
  linhas: number;
  /** Os nomes das colunas achadas, como estavam no cabeçalho ("Coluna B" sem cabeçalho). */
  colunas: Partial<Record<ColunaDaPlanilha, string>>;
  validas: number;
  invalidas: number;
  exemplosInvalidos: { linha: number; valor: string }[];
  vazias: number;
  repetidas: number;
  /** Dos válidos, quantos já estão na base (viram o mesmo lead, sem duplicar). */
  jaNaBase: number;
  /** Dos que já estão na base, quantos pediram para sair (nunca recebem de novo). */
  pediramSair: number;
  amostra: { original: string; comoFica: string }[];
}

/** O nome de uma coluna para a tela: o cabeçalho, ou a letra da coluna. */
export function nomeDaColuna(cabecalho: string[], temCabecalho: boolean, i: number): string {
  const letra = String.fromCharCode(65 + (i % 26));
  return temCabecalho && cabecalho[i]?.trim() ? cabecalho[i].trim() : `Coluna ${letra}`;
}
