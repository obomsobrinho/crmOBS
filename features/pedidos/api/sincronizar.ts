import type { QueryClient } from "@tanstack/react-query";
import { foraDaLista } from "@/lib/inbox-lista";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { casaMotivo, encaixarAbertosDaConversa, encaixarResolvido, type PedidoAberto, type PedidoItem } from "../regras";
import { aplicarNaLista, type ListaNoCache } from "./cache";
import { chavesDePedidos, type FiltroDaLista } from "./chaves";
import type { FontePedidos } from "./fonte";
import { fonteDoNavegador } from "./navegador";

// A PARTE PESADA DA PONTE DE PEDIDOS (a fonte, as regras de encaixe). Fica fora de
// `ponte.ts` de propósito: a ponte mora no layout do `(app)`, então tudo que ela
// importa entra no JS de TODA rota (B8). Ela carrega este módulo só no primeiro
// evento de `handoffs` (a tela de Pedidos já o traz no próprio JS).

/**
 * O que mudou numa conversa, levado ao cache de Pedidos (docs/plano-dados-e-estado.md,
 * 2.7; a regra de hoje da tela, agora fora dela). Para cada lista guardada:
 * - com tela olhando: a fila aberta DESTA conversa (posição e total refeitos) ou os
 *   pedidos que fecharam, UMA leitura pequena, encaixada no lugar
 *   (`encaixarAbertosDaConversa`, `encaixarResolvido`); nunca a lista inteira;
 * - sem ninguém olhando: só fica marcada como velha (zero leitura); quem voltar relê.
 * O detalhe aberto desta conversa relê só ele, e os números das abas são agregado:
 * invalidação com atraso.
 */
export async function sincronizarConversa(
  qc: QueryClient,
  fonte: FontePedidos,
  fora: string[],
  phone: string,
  ids: number[]
): Promise<void> {
  try {
    let abertos: Promise<PedidoAberto[]> | null = null;
    const porId = new Map<number, Promise<PedidoItem | null>>();
    for (const q of qc.getQueryCache().findAll({ queryKey: chavesDePedidos.listas() })) {
      const f = q.queryKey[3] as FiltroDaLista;
      if (q.getObserversCount() === 0) {
        void qc.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "none" });
        continue;
      }
      if (f.aba === "abertos") {
        abertos ??= fonte.abertosDoFone(fora, phone);
        const novos = (await abertos).filter((p) => casaMotivo(p, f.motivo));
        qc.setQueryData<ListaNoCache>(q.queryKey, (d) =>
          aplicarNaLista(d, (itens, temMais) =>
            encaixarAbertosDaConversa(itens, phone, novos, f.busca, temMais)
          )
        );
      } else if (ids.length > 0) {
        const lidos = await Promise.all(
          ids.map(async (id) => {
            if (!porId.has(id)) porId.set(id, fonte.porId(fora, id));
            return [id, await porId.get(id)!] as const;
          })
        );
        const agora = Date.now();
        qc.setQueryData<ListaNoCache>(q.queryKey, (d) =>
          aplicarNaLista(d, (itens, temMais) =>
            lidos.reduce(
              (acc, [id, i]) => encaixarResolvido(acc, id, i && casaMotivo(i, f.motivo) ? i : null, f.busca, temMais, agora),
              itens
            )
          )
        );
      }
    }
    for (const q of qc.getQueryCache().findAll({ queryKey: chavesDePedidos.detalhes() })) {
      const d = q.state.data as PedidoItem | null | undefined;
      if (d?.phone === phone) void qc.invalidateQueries({ queryKey: q.queryKey, exact: true });
    }
    invalidarComAtraso(qc, chavesDePedidos.contagens());
  } catch (e) {
    console.error("pedido do realtime:", e);
  }
}

/** O mesmo, com a fonte e as grafias do número de avisos do navegador (o que a ponte chama). */
export function sincronizarDoNavegador(qc: QueryClient, clientId: string, avisos: string | null, phone: string, ids: number[]) {
  return sincronizarConversa(qc, fonteDoNavegador(clientId), foraDaLista(avisos), phone, ids);
}
