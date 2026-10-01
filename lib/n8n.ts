import "server-only";

/**
 * Headers das chamadas do app aos webhooks do n8n ("CRM Envio Manual" e
 * "CRM Envio IA"). R-01 da auditoria de 01/10/2026: os webhooks aceitavam POST de
 * qualquer um, então quem achasse o endereço mandava WhatsApp por qualquer tenant.
 *
 * O segredo vai em header (nunca na URL, que aparece em log). Enquanto
 * `N8N_WEBHOOK_SECRET` não existir no ambiente, o header simplesmente não vai,
 * e é isso que deixa subir o app ANTES de ligar a checagem no n8n (ordem de
 * deploy: app, depois n8n).
 */
export function headersN8n(): Record<string, string> {
  const segredo = process.env.N8N_WEBHOOK_SECRET;
  return {
    "Content-Type": "application/json",
    ...(segredo ? { "x-webhook-secret": segredo } : {}),
  };
}
