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
//
// ⚠️ CÓPIAS EM SQL (R-18, auditoria de 01/10/2026). O painel agrega no banco
// porque o "Max rows" do PostgREST corta qualquer conjunto de linhas em 1000, e
// por isso a regra existe TAMBÉM em SQL, nestes lugares e só nestes:
//   - public.painel_janelas e public.painel_series
//     (supabase/migrations/20261001225553_painel_agregados_janelas_series.sql)
//   - public.painel_verbatim (mesma migration)
//   - as cinco consultas de docs/instrumentacao-beta.md
// A tradução, que as três funções repetem igual:
//   ehImportada(t)     <=>  message_type = 'imported'
//   respostaDaIa(m)    <=>  coalesce(bot_message, '') <> ''
//                           and message_type is distinct from 'manual'
//                           and message_type is distinct from 'imported'
//   respostaHumana(m)  <=>  coalesce(bot_message, '') <> ''
//                           and message_type in ('manual', 'imported')
//   `!!m.user_message` <=>  coalesce(user_message, '') <> ''   (sem btrim)
// Quem acrescentar um `message_type` novo (agendamento, template...) muda ESTE
// arquivo e essas funções juntos. O teste que prova que os dois lados concordam
// é e2e/painel-agregado.serial.spec.ts (semeia todas as combinações de tipo e
// texto e compara o banco com `agregarLinhas`, que usa as funções abaixo).
// Única diferença declarada: `painel_verbatim` exige texto não vazio DEPOIS do
// btrim, porque `escolherVerbatim` (lib/painel.ts) faz o mesmo `trim()` em
// seguida; a linha só de espaços é resposta da IA para a contagem e nunca vira
// frase de vitrine.

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

/** Até quanto tempo atrás uma mensagem sem resposta conta como parte do lote atual. */
export const JANELA_DO_LOTE_MS = 10 * 60_000;

/**
 * Tira do histórico as mensagens do LOTE que está sendo respondido agora.
 *
 * ⚠️ Por que existe (30/09/2026, achado do dono: áudio, texto e imagem de uma vez).
 * O n8n passou a gravar CADA mensagem recebida na hora, com a própria mídia, e a
 * resposta da IA numa linha separada. Então, quando o cérebro roda, as mensagens
 * do lote JÁ estão em `chat_messages` e TAMBÉM chegam juntas no `message` do
 * pedido; sem este corte a IA leria cada uma duas vezes.
 *
 * O lote são as linhas mais recentes, em sequência, que têm mensagem do cliente,
 * NÃO têm resposta, chegaram há menos de `JANELA_DO_LOTE_MS` E cujo texto está
 * no `mensagem` do pedido. A última condição é o que torna o corte exato: uma
 * mensagem sem resposta que NÃO veio no pedido (a que chegou com a IA pausada,
 * por exemplo) continua no histórico e a IA não a esquece. `linhas` vem do
 * banco da mais NOVA para a mais antiga. Na retomada (orientar) não se corta
 * nada: não há mensagem nova, e o que o cliente disse sem resposta é o assunto.
 */
export function semLoteAtual<
  T extends { user_message: string | null; bot_message: string | null; created_at: string },
>(linhas: T[], agora: number, mensagem: string): T[] {
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    const t = Date.parse(l.created_at);
    const texto = l.user_message?.trim() ?? "";
    const doLote =
      !!texto &&
      mensagem.includes(texto) &&
      !l.bot_message?.trim() &&
      Number.isFinite(t) &&
      agora - t <= JANELA_DO_LOTE_MS;
    if (!doLote) break;
    i++;
  }
  return linhas.slice(i);
}

/**
 * Quantas mensagens a conversa aberta traz por vez (01/10/2026,
 * docs/plano-carregamento.md, fase 4): as mais recentes ao abrir, e as
 * anteriores de tantas em tantas ao rolar para cima.
 */
export const PAGINA_MENSAGENS = 30;
