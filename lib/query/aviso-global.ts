/**
 * O aviso de escrita recusada quando a tela que a fez já não está aberta
 * (docs/plano-dados-e-estado.md, 2.6): o erro "no lugar" não tem onde aparecer,
 * então ele vai para uma faixa só, no layout do app. Uma loja mínima para
 * `useSyncExternalStore`, sem biblioteca.
 */
type Ouvinte = () => void;

let atual: string | null = null;
const ouvintes = new Set<Ouvinte>();

export function mostrarAvisoGlobal(frase: string): void {
  atual = frase;
  ouvintes.forEach((o) => o());
}

export function fecharAvisoGlobal(): void {
  atual = null;
  ouvintes.forEach((o) => o());
}

export function assinarAvisoGlobal(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}

export function lerAvisoGlobal(): string | null {
  return atual;
}
