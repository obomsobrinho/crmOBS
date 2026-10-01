/**
 * Aviso local de "um contato mudou AGORA nesta aba" (R-15, 01/10/2026).
 *
 * POR QUE EXISTE: depois de renomear um contato ou cadastrar um cliente, a tela
 * chamava `router.refresh()`, que refaz o layout, as duas funções da lista e as
 * sete consultas da página, só para um nome mudar de lugar. Agora quem grava
 * anuncia aqui e cada interessado corrige o PRÓPRIO pedaço: o cabeçalho da
 * conversa e a ficha trocam o nome na hora (`useNomeDoContato`), e a lista de
 * clientes, que não tem realtime, busca de novo as linhas que já tem na tela
 * (`revalidar` do `usePaginada`: uma função do banco, e não a árvore toda).
 *
 * É o mesmo molde de `lib/ia-bus.ts`, pelo mesmo motivo: os irmãos debaixo de um
 * layout de Server Component não compartilham estado de React. O realtime segue
 * sendo a fonte para mudança feita em OUTRA aba ou por outro atendente.
 */

const EVENTO = "crm:contato-mudou";

export type ContatoMudou = {
  /** JID do contato que mudou; `null` = a lista mudou (cadastro novo), sem um contato só. */
  phone: string | null;
  /**
   * O nome de exibição que acabou de ser gravado (`display_name`, sem espaços
   * nas pontas). `null` = o apelido foi LIMPO e vale o nome que o WhatsApp deu.
   * `undefined` = o nome não mudou (só e-mail, nascimento ou campos).
   */
  nome?: string | null;
};

export function anunciarContato(detail: ContatoMudou): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ContatoMudou>(EVENTO, { detail }));
}

/** Retorna a função de limpeza, para usar direto no return do `useEffect`. */
export function ouvirContato(cb: (d: ContatoMudou) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<ContatoMudou>).detail);
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
}
