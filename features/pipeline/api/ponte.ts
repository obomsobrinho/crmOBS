import { useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { rowToStage, type Stage, type StageRow } from "@/lib/pipeline";
import type { SessaoDoApp } from "@/lib/sessao";
import { chavesDePipeline } from "./chaves";

/** Uma rajada de eventos vira UMA busca por conversa, depois de 500 ms parado (o de antes). */
const ATRASO_MS = 500;

/**
 * Reconectou ou voltou o foco: o quadro, os números e os estágios relêem, como a tela
 * fazia (a equipe não: é configuração, e a tela não a relia).
 */
export function revalidarPipeline(qc: QueryClient): void {
  invalidarComAtraso(qc, chavesDePipeline.quadros());
  invalidarComAtraso(qc, chavesDePipeline.contagens());
  invalidarComAtraso(qc, chavesDePipeline.estagios());
}

/**
 * A PONTE DE PIPELINE (lib/realtime/PonteDoRealtime.tsx), no canal do tenant:
 * - conversa, contato ou resumo que mudou: UM card por conversa, lido e encaixado nos
 *   quadros guardados (`sincronizar.ts`, carregado só quando há quadro no cache);
 * - `pipeline_stages`: a linha do payload entra na lista de estágios guardada (zero
 *   leitura). DELETE traz só o id (passo 0): tira o estágio, nunca decide outra coisa.
 */
export function usePonteDePipeline(sessao: SessaoDoApp): void {
  const qc = useQueryClient();
  const pendentes = useRef(new Set<string>());
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useCanalTenant({
    clientId: sessao.clientId,
    tabelas: ["conversations", "dados_cliente", "conversation_qualifications", "pipeline_stages"],
    aoEvento: (ev) => {
      if (ev.tabela === "pipeline_stages") {
        qc.setQueryData<Stage[]>(chavesDePipeline.estagios(), (cur) => {
          if (!cur) return cur;
          if (ev.tipo === "DELETE") {
            const id = ev.antigo?.id as number | undefined;
            return id == null ? cur : cur.filter((st) => st.id !== id);
          }
          if (!ev.novo) return cur;
          const nova = rowToStage(ev.novo as StageRow);
          return cur.some((st) => st.id === nova.id) ? cur.map((st) => (st.id === nova.id ? nova : st)) : [...cur, nova];
        });
        return;
      }
      // Sem quadro guardado (ninguém abriu o Pipeline nesta aba), nada a fazer.
      if (qc.getQueryCache().findAll({ queryKey: chavesDePipeline.quadros() }).length === 0) return;
      const fone = foneDoEvento(ev);
      if (!fone) return;
      pendentes.current.add(fone);
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(() => {
        const fones = [...pendentes.current];
        pendentes.current.clear();
        void import("./sincronizar").then(({ sincronizarCards }) => sincronizarCards(qc, sessao.clientId, sessao.avisos, fones));
      }, ATRASO_MS);
    },
    revalidar: () => revalidarPipeline(qc),
  });
}
