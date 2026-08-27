/**
 * Aviso local de "a chave da IA deste contato mudou agora".
 *
 * POR QUE EXISTE: a chave da IA vive no cabeçalho da conversa
 * (`ConversationView`), e a marca de quem está atendendo vive na lista
 * (`ContactSidebar`). Os dois são irmãos debaixo de um layout de Server
 * Component, então não compartilham estado de React.
 *
 * O caminho que já existia era o realtime do Supabase: a lista escuta
 * `dados_cliente` e, quando chega evento, re-busca TRÊS tabelas. Isso funciona,
 * mas leva o tempo de ida ao Postgres mais a volta do WebSocket mais as três
 * consultas, e nesse intervalo o cabeçalho já mostra o estado novo enquanto a
 * marca na lista ainda mostra o antigo. Era exatamente a queixa: "não atualiza ao
 * mesmo tempo".
 *
 * Este barramento cobre esse intervalo com o valor otimista, sem substituir o
 * realtime: ele segue sendo a fonte para mudança feita em OUTRA aba ou por outro
 * atendente. Quem escuta só corrige o próprio mapa; ninguém grava por aqui.
 *
 * `CustomEvent` no `window` e não um contexto de React de propósito: um provider
 * exigiria envolver o layout do inbox só para carregar um valor por telefone.
 */

const EVENTO = "crm:ia-mudou";

export type IaMudou = {
  /** JID completo, o mesmo que é chave em `dados_cliente.telefone`. */
  phone: string;
  /** Valor cru da coluna: 'ativa'/'reativada' = ligada, 'pause' = pausada. */
  estado: string | null;
};

export function anunciarIa(detail: IaMudou): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<IaMudou>(EVENTO, { detail }));
}

/** Retorna a função de limpeza, para usar direto no return do `useEffect`. */
export function ouvirIa(cb: (d: IaMudou) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<IaMudou>).detail);
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
}
