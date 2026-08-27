// Quem respondeu uma linha de chat_messages.
//
// Módulo PURO (zero imports), igual a lib/delta.ts e lib/billing.ts: existe
// porque a regra estava escrita DUAS vezes, em lib/valor.ts e lib/metrics.ts,
// e as duas erravam igual.
//
// O DEFEITO QUE ISTO CONSERTA (medido em 27/08/2026, na OBM): as duas diziam
// "resposta da IA é bot_message com message_type <> 'manual'". Só que
// `imported` também não é 'manual', então as respostas que o PRÓPRIO DONO
// digitou à mão no WhatsApp, antes de a IA existir, entravam como trabalho da
// IA. Eram 84 das 94 linhas que a OBM contava como IA. Na tela isso virava
// "31 mensagens respondidas em fim de semana" quando a IA mandou 3, e
// "46 de 47 conversas atendidas sem intervenção do time" quando eram 2.
//
// É exatamente o erro que o produto não pode cometer: o cliente confere no
// WhatsApp dele em dez segundos, e "a IA não inventa" é o nosso eixo.

/** Histórico do WhatsApp trazido no onboarding. Aconteceu ANTES da IA. */
export const IMPORTADA = "imported";
/** Alguém do time respondeu pelo CRM. */
export const MANUAL = "manual";

/** A linha veio do histórico importado (portanto é anterior ao agente). */
export function ehImportada(messageType: string | null): boolean {
  return messageType === IMPORTADA;
}

/**
 * A linha carrega uma resposta DA IA?
 *
 * Note que uma linha só é resposta quando tem `bot_message`: a mesma linha pode
 * ter a mensagem recebida e a resposta juntas, porque é assim que o n8n grava.
 */
export function respostaDaIa(m: {
  bot_message: string | null;
  message_type: string | null;
}): boolean {
  return (
    !!m.bot_message && m.message_type !== MANUAL && m.message_type !== IMPORTADA
  );
}

/**
 * A linha carrega uma resposta de GENTE?
 *
 * São dois casos, e o segundo é o que faltava: o envio manual pelo CRM, e o
 * histórico importado com `bot_message`, que é o dono respondendo à mão no
 * celular dele antes de existir agente nenhum.
 */
export function respostaHumana(m: {
  bot_message: string | null;
  message_type: string | null;
}): boolean {
  if (!m.bot_message) return false;
  return m.message_type === MANUAL || m.message_type === IMPORTADA;
}
