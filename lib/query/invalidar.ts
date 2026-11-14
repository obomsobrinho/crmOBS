import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** O mesmo atraso que `inbox-fonte` já usa: uma rajada de eventos vira uma leitura. */
export const ATRASO_DA_INVALIDACAO_MS = 500;

const pendentes = new WeakMap<QueryClient, Map<string, ReturnType<typeof setTimeout>>>();

/**
 * Invalida um prefixo de chave com atraso, juntando as chamadas que chegam no
 * meio (docs/plano-dados-e-estado.md, 2.6 e 2.7). A escrita que termina e o eco
 * dela no realtime passam por aqui e viram UMA leitura.
 *
 * Chave de tela desmontada só é marcada como velha (o TanStack não relê o que
 * ninguém está olhando); ao voltar, a tela relê.
 */
export function invalidarComAtraso(
  qc: QueryClient,
  chave: QueryKey,
  atrasoMs: number = ATRASO_DA_INVALIDACAO_MS
): void {
  let mapa = pendentes.get(qc);
  if (!mapa) {
    mapa = new Map();
    pendentes.set(qc, mapa);
  }
  const id = JSON.stringify(chave);
  const anterior = mapa.get(id);
  if (anterior) clearTimeout(anterior);
  mapa.set(
    id,
    setTimeout(() => {
      mapa.delete(id);
      void qc.invalidateQueries({ queryKey: chave });
    }, atrasoMs)
  );
}
