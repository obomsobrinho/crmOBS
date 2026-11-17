import type { QueryClient } from "@tanstack/react-query";
import { encaixar } from "@/lib/inbox-lista";
import { agoraMs } from "@/lib/periodo";
import { chavesDeConversas, paramsDoRecorte, recorteDaChave, type ListaNoCache, type QuemLe } from "./chaves";
import type { FonteInbox } from "./fonte";

/**
 * O REALTIME DA LISTA DE CONVERSAS, LINHA A LINHA (a regra de 01/10/2026, agora no cache):
 * para cada conversa que mudou, busca só a LINHA dela com o recorte de cada lista que
 * alguém está olhando e encaixa no lugar (`encaixar`, `lib/inbox-lista.ts`), sem tocar
 * no resto. Uma lista guardada que ninguém olha só fica marcada como velha (zero
 * leitura); voltar à tela relê. Os números dos chips ficam velhos e relêem se visíveis.
 */
export async function encaixarConversas(qc: QueryClient, fonte: FonteInbox, quem: QuemLe, fones: string[]): Promise<void> {
  if (fones.length === 0) return;
  const listas = qc.getQueryCache().findAll({ queryKey: chavesDeConversas.listas() });
  await Promise.all(
    listas.map(async (q) => {
      const recorte = recorteDaChave(q.queryKey);
      if (!recorte || q.getObserversCount() === 0) {
        await qc.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "none" });
        return;
      }
      const p = paramsDoRecorte(recorte, quem, agoraMs());
      try {
        const linhas = await Promise.all(fones.map((f) => fonte.linha(p, f).then((l) => [f, l] as const)));
        qc.setQueryData<ListaNoCache>(q.queryKey, (cur) =>
          cur ? { ...cur, itens: linhas.reduce((acc, [f, l]) => encaixar(acc, f, l, cur.temMais), cur.itens) } : cur,
        );
      } catch (e) {
        console.error("linha da lista:", e);
      }
    }),
  );
  void qc.invalidateQueries({ queryKey: chavesDeConversas.contagens() });
}

/** Reconectou ou voltou o foco: listas e números ficam velhos; o que está na tela relê as N primeiras linhas. */
export function revalidarConversas(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: chavesDeConversas.listas() });
  void qc.invalidateQueries({ queryKey: chavesDeConversas.contagens() });
}
