/**
 * As chaves de Pipeline no cache de dados (docs/plano-dados-e-estado.md, 2.5). O
 * quadro (a primeira página de cada coluna, e as seguintes que a rolagem trouxe) e os
 * números dependem do recorte E das colunas ativas (ordem e padrão), por isso as duas
 * coisas entram na chave: arquivar ou reordenar um estágio é outro quadro. `fora` vem
 * da sessão e não muda dentro do cliente.
 */
export interface RecorteDoQuadro {
  busca: string;
  atendente: string;
  soEsperando: boolean;
  /** As chaves das colunas ativas, em ordem, e a padrão: `"a,b,c|a"`. */
  colunas: string;
}

export const chavesDePipeline = {
  tudo: ["pipeline"] as const,
  quadros: () => ["pipeline", "quadro"] as const,
  quadro: (r: RecorteDoQuadro) => [...chavesDePipeline.quadros(), r] as const,
  contagens: () => ["pipeline", "contagens"] as const,
  contagem: (r: RecorteDoQuadro) => [...chavesDePipeline.contagens(), r] as const,
  estagios: () => ["pipeline", "estagios", "lista"] as const,
  membros: () => ["pipeline", "membros", "lista"] as const,
};
