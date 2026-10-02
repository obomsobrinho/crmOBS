import { compararCards, type ContagensPipeline } from "@/lib/pipeline-fonte";
import type { PipelineCard } from "@/lib/pipeline";

/** Os cards já carregados de uma coluna. */
export interface ColunaCarregada {
  cards: PipelineCard[];
  temMais: boolean;
  carregando: boolean;
}

/**
 * Tira o card de onde estiver e o põe na coluna dele, na ordem. Com mais
 * páginas por carregar na coluna, só entra se cair dentro do que já está na
 * tela (abaixo, ele chega pela rolagem). `card` nulo: saiu do recorte.
 */
export function encaixarCard(
  cs: Record<string, ColunaCarregada>,
  phone: string,
  card: PipelineCard | null
): Record<string, ColunaCarregada> {
  const out: Record<string, ColunaCarregada> = {};
  for (const [k, c] of Object.entries(cs)) {
    out[k] = c.cards.some((x) => x.phone === phone)
      ? { ...c, cards: c.cards.filter((x) => x.phone !== phone) }
      : c;
  }
  if (!card || !card.stage || !out[card.stage]) return out;
  const col = out[card.stage];
  const ultimo = col.cards[col.cards.length - 1];
  if (col.temMais && ultimo && compararCards(card, ultimo) > 0) return out;
  const pos = col.cards.findIndex((x) => compararCards(card, x) < 0);
  const lista = pos < 0 ? [...col.cards, card] : [...col.cards.slice(0, pos), card, ...col.cards.slice(pos)];
  out[card.stage] = { ...col, cards: lista };
  return out;
}

export function moverNosNumeros(
  ct: ContagensPipeline,
  de: string | null,
  para: string,
  esperando: boolean
): ContagensPipeline {
  const pc = { ...ct.porColuna };
  const ajusta = (k: string, d: number) => {
    const n = pc[k] ?? { total: 0, esperando: 0, maisAntigo: null };
    pc[k] = { ...n, total: Math.max(0, n.total + d), esperando: Math.max(0, n.esperando + (esperando ? d : 0)) };
  };
  if (de) ajusta(de, -1);
  ajusta(para, 1);
  return { ...ct, porColuna: pc };
}
