/** As chaves da Agenda no cache (docs/plano-dados-e-estado.md, 2.5). */
export const chavesDaAgenda = {
  tudo: ["agenda"] as const,
  /** O que a tela precisa para abrir numa semana: configuração, serviços, horários e a semana. */
  abertura: (semana: string) => ["agenda", "abertura", "semana", semana] as const,
};
