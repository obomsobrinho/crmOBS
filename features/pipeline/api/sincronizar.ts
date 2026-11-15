import type { QueryClient } from "@tanstack/react-query";
import { foraDaLista } from "@/lib/inbox-lista";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { createClient } from "@/lib/supabase/client";
import type { Stage } from "@/lib/pipeline";
import { encaixarCard, type ColunaCarregada } from "../components/colunas";
import { chavesDePipeline, type RecorteDoQuadro } from "./chaves";
import { fontePipelineDoBanco, paramsPipeline, type FontePipeline } from "./fonte";

// A PARTE PESADA DA PONTE DE PIPELINE (a fonte, a regra de encaixe), carregada só no
// primeiro evento que tem um quadro guardado (a ponte mora no layout: o que ela
// importa entraria no JS de toda rota, B8).

let guardada: { clientId: string; fonte: FontePipeline } | null = null;
export function fontePipelineDoNavegador(clientId: string): FontePipeline {
  if (guardada?.clientId !== clientId) guardada = { clientId, fonte: fontePipelineDoBanco(createClient(), clientId) };
  return guardada.fonte;
}

/**
 * Os cards que mudaram (UM por conversa), levados a cada quadro guardado com tela
 * olhando: lê SÓ aquele card e o põe na coluna certa (`encaixarCard`), como a tela
 * fazia. Quadro sem ninguém olhando só fica velho (zero leitura). Os números são
 * agregado: invalidação com atraso.
 */
export async function sincronizarCards(qc: QueryClient, clientId: string, avisos: string | null, fones: string[]): Promise<void> {
  const fonte = fontePipelineDoNavegador(clientId);
  const fora = foraDaLista(avisos);
  const stages = qc.getQueryData<Stage[]>(chavesDePipeline.estagios()) ?? [];
  try {
    for (const q of qc.getQueryCache().findAll({ queryKey: chavesDePipeline.quadros() })) {
      if (q.getObserversCount() === 0) {
        void qc.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "none" });
        continue;
      }
      const r = q.queryKey[2] as RecorteDoQuadro;
      const p = paramsPipeline(stages, { busca: r.busca, atendente: r.atendente, soEsperando: r.soEsperando, fora });
      if (!p) continue;
      const achados = await Promise.all(fones.map((f) => fonte.card(p, f).then((c) => [f, c] as const)));
      qc.setQueryData<Record<string, ColunaCarregada>>(q.queryKey, (cs) =>
        cs ? achados.reduce((acc, [f, c]) => encaixarCard(acc, f, c), cs) : cs
      );
    }
    invalidarComAtraso(qc, chavesDePipeline.contagens());
  } catch (e) {
    console.error("card do pipeline:", e);
  }
}
