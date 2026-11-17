import { useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ehNumeroDeAvisos } from "@/lib/avisos";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import type { SessaoDoApp } from "@/lib/sessao";
import { soPrimeiraPagina, type ListaNoCache } from "./cache";
import { chavesDePedidos } from "./chaves";

/** Uma rajada de eventos da mesma conversa vira UMA busca, depois de 400 ms parado (o de antes). */
const ATRASO_DA_CONVERSA_MS = 400;

/**
 * Reconectou ou voltou o foco: as listas e os números ficam velhos, como a tela fazia
 * antes (a equipe é configuração, e a história do pedido aberto relê pelo canal dela).
 * As listas voltam à primeira página antes (`soPrimeiraPagina`), para reler uma e não todas.
 */
export function revalidarPedidos(qc: QueryClient): void {
  for (const q of qc.getQueryCache().findAll({ queryKey: chavesDePedidos.listas() })) {
    qc.setQueryData<ListaNoCache>(q.queryKey, soPrimeiraPagina);
  }
  invalidarComAtraso(qc, chavesDePedidos.listas());
  invalidarComAtraso(qc, chavesDePedidos.contagens());
}

/**
 * A PONTE DE PEDIDOS: assinada UMA vez, no layout do `(app)` (`lib/realtime/`), no
 * canal do tenant que já existe. Assim um pedido aberto pela IA enquanto a pessoa
 * está em Conversas deixa a lista guardada marcada como velha, e não "fresca" com
 * dado de 30 s atrás. `modo: "buscar"`: aba escondida não lê, revalida ao voltar.
 */
export function usePonteDePedidos(sessao: SessaoDoApp): void {
  const qc = useQueryClient();
  const pendentes = useRef(new Map<string, Set<number>>());
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useCanalTenant({
    clientId: sessao.clientId,
    tabelas: ["handoffs"],
    aoEvento: (ev) => {
      const fone = foneDoEvento(ev);
      if (!fone || ehNumeroDeAvisos(fone, sessao.avisos)) return;
      const ids = pendentes.current.get(fone) ?? new Set<number>();
      // DELETE traz só o id (passo 0): serve para tirar, nunca para decidir a conversa,
      // e o telefone veio de `foneDoEvento` (sem telefone, o evento já saiu acima).
      const id = Number((ev.novo ?? ev.antigo)?.id);
      if (Number.isFinite(id) && (ev.tipo === "DELETE" || ev.novo?.closed_at != null)) ids.add(id);
      pendentes.current.set(fone, ids);
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(() => {
        const todos = [...pendentes.current.entries()];
        pendentes.current.clear();
        // A parte pesada (fonte, regras de encaixe) só chega no primeiro evento (B8).
        void import("./sincronizar").then(({ sincronizarDoNavegador }) => {
          for (const [phone, lista] of todos) void sincronizarDoNavegador(qc, sessao.clientId, sessao.avisos, phone, [...lista]);
        });
      }, ATRASO_DA_CONVERSA_MS);
    },
    revalidar: () => revalidarPedidos(qc),
  });
}
