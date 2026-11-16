import type { JanelaKey } from "@/lib/inbox";
import type { FiltroInbox, ItemLista } from "@/lib/inbox-lista";
import { foraDaLista, inicioDaJanela } from "@/lib/inbox-lista";
import type { ParamsLista } from "./fonte";

/**
 * As chaves de Conversas no cache de dados (docs/plano-dados-e-estado.md, 2.5):
 * `[area, entidade, tipo, params?]`, sempre por aqui. O começo da janela ("hoje")
 * sai do relógio na hora da leitura e não entra na chave; quem é a pessoa e o número
 * de avisos vêm da sessão, que não muda dentro do cliente de dados.
 */
export interface RecorteDaLista {
  janela: JanelaKey;
  filtro: FiltroInbox;
  busca: string;
}

/** O que a lista guarda: as linhas já carregadas (na ordem do banco) e se há mais. */
export interface ListaNoCache {
  itens: ItemLista[];
  temMais: boolean;
}

/** Quem lê: a pessoa (filtro "Suas") e o número de avisos, que nunca é conversa. */
export interface QuemLe {
  eu: string | null;
  avisos: string | null;
}

export const chavesDeConversas = {
  tudo: ["conversas"] as const,
  listas: () => ["conversas", "conversas", "lista"] as const,
  lista: (r: RecorteDaLista) => [...chavesDeConversas.listas(), r] as const,
  contagens: () => ["conversas", "contagens"] as const,
  contagensDa: (janela: JanelaKey) => [...chavesDeConversas.contagens(), janela] as const,
  equipe: () => ["conversas", "equipe"] as const,
  abertura: (phone: string) => ["conversas", "conversa", "abertura", phone] as const,
};

/** O recorte guardado numa chave de lista (`lista(r)`). */
export function recorteDaChave(chave: readonly unknown[]): RecorteDaLista | null {
  const r = chave[3];
  if (!r || typeof r !== "object") return null;
  const { janela, filtro, busca } = r as Partial<RecorteDaLista>;
  return janela && filtro && typeof busca === "string" ? { janela, filtro, busca } : null;
}

/** Os parâmetros da função do banco para um recorte, com o relógio de agora. */
export function paramsDoRecorte(r: RecorteDaLista, quem: QuemLe, agora: number): ParamsLista {
  return { inicio: inicioDaJanela(r.janela, agora), filtro: r.filtro, busca: r.busca, eu: quem.eu, fora: foraDaLista(quem.avisos) };
}
