import type { OpcoesDaBusca } from "./prospeccao";

// A FONTE DE LEADS, trocável (docs/plano-campanhas.md, seção 6): começar uma
// busca, ler o que ela achou e traduzir cada lugar num lead. Este módulo é o
// contrato puro; a implementação de hoje é `lib/fonte-apify.ts` (servidor) com os
// campos em `lib/apify-campos.ts` (puro). Google Places ou outro actor trocam a
// implementação sem mexer na tela nem nas tabelas (`prospeccao_buscas.fonte`).

/** Um lugar já traduzido, no formato que `prospeccao_concluir_busca` grava. */
export interface ItemDaFonteDeLeads {
  /** A chave do celular (`telefoneDoLead`); null sem celular válido. */
  telefone: string | null;
  telefone_original: string | null;
  tipo_telefone: "celular" | "fixo" | "invalido" | null;
  fonte_id: string | null;
  nome: string;
  segmento: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  site: string | null;
  site_classe: "sim" | "so_rede_social" | "nao";
  nota: number | null;
  avaliacoes: number | null;
  pontuacao: number;
  /** Fechado de vez na fonte (sai quando a busca pede "sem fechadas"). Não vai ao banco. */
  fechado: boolean;
}

export interface InicioDaBusca {
  fonte: string;
  execucaoId: string;
}

/** Onde a execução está: rodando (ainda não leia), pronta (com os itens) ou falhou (com o motivo). */
export type LeituraDaExecucao =
  | { situacao: "rodando" }
  | { situacao: "pronta"; itens: unknown[] }
  | { situacao: "falhou"; motivo: string };

export interface FonteDeLeads {
  readonly id: string;
  /** Começa a busca; o fim chega por webhook em `webhookUrl` com o `segredo` num header. */
  iniciar(opcoes: OpcoesDaBusca, webhook: { url: string; segredo: string }): Promise<InicioDaBusca>;
  lerExecucao(execucaoId: string): Promise<LeituraDaExecucao>;
  mapearItem(bruto: unknown, termo: string): ItemDaFonteDeLeads;
}

/**
 * O que a busca pediu, conferido do NOSSO lado também: a fonte pode ignorar um
 * filtro (os valores aceitos ainda não foram vistos numa execução real), e a base
 * não deve receber o que o dono mandou deixar de fora. Repetidos pelo celular ou
 * pelo id do lugar saem aqui também (o SQL deduplica de novo contra a base).
 */
export function filtrarPelasOpcoes(itens: ItemDaFonteDeLeads[], o: OpcoesDaBusca): ItemDaFonteDeLeads[] {
  const vistos = new Set<string>();
  return itens.filter((i) => {
    if (o.ignorarFechados && i.fechado) return false;
    if (o.notaMinima !== null && (i.nota === null || i.nota < o.notaMinima)) return false;
    if (o.site === "sem_site" && i.site_classe === "sim") return false;
    if (o.site === "com_site" && i.site_classe !== "sim") return false;
    const chaves = [i.telefone && `t${i.telefone}`, i.fonte_id && `f${i.fonte_id}`].filter((c): c is string => !!c);
    if (chaves.some((c) => vistos.has(c))) return false;
    for (const c of chaves) vistos.add(c);
    return true;
  });
}

/** O item no formato do jsonb de `prospeccao_concluir_busca` (sem o que não vai ao banco). */
export function itemParaOBanco(i: ItemDaFonteDeLeads) {
  return {
    telefone: i.telefone,
    telefone_original: i.telefone_original,
    tipo_telefone: i.tipo_telefone,
    fonte_id: i.fonte_id,
    nome: i.nome,
    segmento: i.segmento,
    endereco: i.endereco,
    bairro: i.bairro,
    cidade: i.cidade,
    site: i.site,
    site_classe: i.site_classe,
    nota: i.nota,
    avaliacoes: i.avaliacoes,
    pontuacao: i.pontuacao,
  };
}
