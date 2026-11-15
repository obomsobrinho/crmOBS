import { useEffect } from "react";
import { focusManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ouvirContato } from "@/lib/contato-bus";
import { soAPrimeiraPagina } from "@/lib/query/cache";
import { JANELA_FOCO_MS } from "@/lib/use-canal-ao-vivo";
import { chavesDeContatos } from "./chaves";

/** Tudo de Contatos fica velho; as listas voltam à primeira página antes (uma leitura, não uma por página). */
function revalidarContatos(qc: QueryClient): void {
  qc.setQueriesData({ queryKey: chavesDeContatos.listas() }, soAPrimeiraPagina);
  void qc.invalidateQueries({ queryKey: chavesDeContatos.listas() });
  void qc.invalidateQueries({ queryKey: chavesDeContatos.contagens() });
  void qc.invalidateQueries({ queryKey: chavesDeContatos.fichas() });
}

/**
 * A PONTE DE CONTATOS (lib/realtime/PonteDoRealtime.tsx). Contatos não escuta o canal
 * do tenant (a lista nunca teve realtime). Montada no layout, ela vale também quando a
 * tela de Contatos não está aberta (zero leitura para o que ninguém olha; quem estiver
 * na tela relê):
 * - o que muda NESTA aba chega pelo `contato-bus` (um contato salvo na ficha, aqui ou
 *   em Conversas, ou um cadastro novo);
 * - voltar o foco relê, no máximo a cada `JANELA_FOCO_MS` (a regra de `realtime.md`),
 *   cortando as listas para a primeira página antes.
 */
export function usePonteDeContatos(): void {
  const qc = useQueryClient();
  useEffect(() => ouvirContato(() => revalidarContatos(qc)), [qc]);
  useEffect(() => {
    let ultima = Date.now();
    return focusManager.subscribe((focada) => {
      if (!focada || Date.now() - ultima < JANELA_FOCO_MS) return;
      ultima = Date.now();
      revalidarContatos(qc);
    });
  }, [qc]);
}
