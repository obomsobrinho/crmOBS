// Identidade do produto num lugar só.
//
// Existe para a troca de marca ser um arquivo, e não uma caçada por 8 arquivos.
// A cor de acento e o gradiente ficam em `app/globals.css` (`--accent`,
// `.brand-grad`), pelo mesmo motivo: trocar de marca é editar tokens, não
// redesenhar telas.
//
// Módulo puro (sem imports): serve para metadata do servidor e para componente
// de client igual.

export const BRAND = {
  /** Nome que aparece na UI e no título da aba. */
  name: "O Bom Sobrinho",
  /** Sigla de fallback, usada como texto alternativo do selo. */
  initial: "OBS",
  /** Descrição curta, usada na metadata. */
  tagline: "Inbox de conversas de WhatsApp com agente de IA",
  /* Duas artes do MESMO selo, e não uma com filtro: a moldura em degradê faz
     parte da marca e precisa sobreviver nos dois temas, então só as letras
     trocam de cor (carvão no claro, branco no escuro). */
  markLight: "/marca/obs-mark-light.png",
  markDark: "/marca/obs-mark-dark.png",
  /** Assinatura de rodapé: o CRM é subproduto da OBS, não a OBS. */
  footer: "um produto OBS",
} as const;
