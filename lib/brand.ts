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
  name: "DeskCRM",
  /** Letra do selo quadrado (o "logo" enquanto não existe um de verdade). */
  initial: "D",
  /** Descrição curta, usada na metadata. */
  tagline: "Inbox de conversas de WhatsApp com agente de IA",
} as const;
