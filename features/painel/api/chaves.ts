/** As chaves do Painel no cache (docs/plano-dados-e-estado.md, 2.5). */
export const chavesDoPainel = {
  tudo: ["painel"] as const,
  dados: () => ["painel", "painel", "dados"] as const,
};
