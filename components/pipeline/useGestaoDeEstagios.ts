"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { createClient } from "@/lib/supabase/client";
import { slugifyStage, type Stage, type StagePatch } from "@/lib/pipeline";

/**
 * A gestão de estágios do dono: criar, renomear/recolorir/arquivar, apagar o
 * arquivado e reordenar (arraste e teclado). Sem banco (preview), só memória.
 */
export function useGestaoDeEstagios({
  supabase,
  clientId,
  stages,
  setStages,
  activeStages,
  refetchStages,
  setError,
}: {
  supabase: ReturnType<typeof createClient> | null;
  clientId: string;
  stages: Stage[];
  setStages: Dispatch<SetStateAction<Stage[]>>;
  activeStages: Stage[];
  refetchStages: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  // ---- Gestão de estágios (dono) ----
  const takenKeys = useMemo(() => stages.map((s) => s.key), [stages]);

  const addStage = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const key = slugifyStage(clean, takenKeys);
      const position = stages.reduce((m, s) => Math.max(m, s.position), -1) + 1;
      if (!supabase) {
        setStages((s) => [
          ...s,
          {
            id: -Date.now(),
            key,
            name: clean,
            position,
            isCanonical: false,
            isDefault: false,
            archived: false,
            color: "gray",
          },
        ]);
        return;
      }
      const { error: err } = await supabase.from("pipeline_stages").insert({
        client_id: clientId,
        key,
        name: clean,
        position,
        color: "gray",
      });
      if (err) setError("não foi possível criar o estágio.");
      else await refetchStages();
    },
    [stages, takenKeys, supabase, clientId, refetchStages, setStages, setError]
  );

  /**
   * Apaga um estágio ARQUIVADO de vez.
   *
   * ⚠️ QUEM PROTEGE É O BANCO, e não uma checagem daqui: a FK
   * `conversations_stage_fkey` não tem `ON DELETE`, então apagar um estágio que
   * ainda tem card no funil é recusado pelo Postgres. Não há como perder
   * conversa por acidente, e por isso o erro vira frase em vez de guarda
   * duplicada, que é o tipo de regra que diverge do banco na primeira mudança.
   *
   * ⚠️ Só no ARQUIVADO. Apagar direto da coluna viva seria um clique entre a
   * pessoa e um estágio que some sem volta; arquivar primeiro é o passo que
   * torna a decisão deliberada, e o botão de restaurar fica ali do lado.
   */
  const deleteStage = useCallback(
    async (id: number) => {
      if (!supabase) {
        setStages((s) => s.filter((st) => st.id !== id));
        return;
      }
      const { error: err } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("id", id);
      if (err) {
        setError(
          "não foi possível apagar: o estágio ainda tem conversa nele. Mova os cards e tente de novo."
        );
        return;
      }
      await refetchStages();
    },
    [supabase, refetchStages, setStages, setError]
  );

  const patchStage = useCallback(
    async (id: number, patch: StagePatch) => {
      if (!supabase) {
        setStages((s) =>
          s.map((st) =>
            st.id === id
              ? {
                  ...st,
                  name: patch.name ?? st.name,
                  color: patch.color ?? st.color,
                  position: patch.position ?? st.position,
                  archived: patch.archived ?? st.archived,
                }
              : st
          )
        );
        return;
      }
      const { error: err } = await supabase
        .from("pipeline_stages")
        .update(patch)
        .eq("id", id);
      if (err) setError("não foi possível salvar o estágio.");
      else await refetchStages();
    },
    [supabase, refetchStages, setStages, setError]
  );

  // Reordena trocando a posição com o vizinho (entre os não arquivados).
  const moveStage = useCallback(
    async (id: number, dir: -1 | 1) => {
      const ordered = [...activeStages];
      const i = ordered.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return;
      const a = ordered[i];
      const b = ordered[j];
      if (!supabase) {
        setStages((s) =>
          s.map((st) =>
            st.id === a.id
              ? { ...st, position: b.position }
              : st.id === b.id
                ? { ...st, position: a.position }
                : st
          )
        );
        return;
      }
      const r1 = await supabase
        .from("pipeline_stages")
        .update({ position: b.position })
        .eq("id", a.id);
      const r2 = await supabase
        .from("pipeline_stages")
        .update({ position: a.position })
        .eq("id", b.id);
      if (r1.error || r2.error) setError("não foi possível reordenar.");
      await refetchStages();
    },
    [activeStages, supabase, refetchStages, setStages, setError]
  );

  // Reordena por ARRASTE: tira o estágio de onde está, põe no índice do alvo e
  // reescreve as posições em sequência.
  //
  // Reescrever a lista toda, em vez de trocar duas posições como o `moveStage`
  // faz, é o que permite arrastar para qualquer lugar de uma vez, e ainda
  // normaliza posições que ficaram com buraco depois de arquivar um estágio.
  // `moveStage` CONTINUA existindo: virou o caminho de teclado (setas no punho de
  // arraste), porque arraste nativo do HTML não é operável por teclado, e trocar
  // as setas por arraste sem isso deixaria a tela inoperável para quem não usa
  // mouse.
  const reorderStages = useCallback(
    async (fromId: number, toId: number) => {
      if (fromId === toId) return;
      const ordered = [...activeStages];
      const de = ordered.findIndex((s) => s.id === fromId);
      const para = ordered.findIndex((s) => s.id === toId);
      if (de < 0 || para < 0) return;
      const [movido] = ordered.splice(de, 1);
      ordered.splice(para, 0, movido);

      const novaPos = new Map(ordered.map((s, i) => [s.id, i] as const));
      // Otimista: no /design é o estado final, e em produção tira a espera do
      // refetch de cima do arraste.
      setStages((s) =>
        s.map((st) =>
          novaPos.has(st.id) ? { ...st, position: novaPos.get(st.id)! } : st
        )
      );
      if (!supabase) return;
      const res = await Promise.all(
        ordered.map((s, i) =>
          supabase.from("pipeline_stages").update({ position: i }).eq("id", s.id)
        )
      );
      if (res.some((r) => r.error)) setError("não foi possível reordenar.");
      await refetchStages();
    },
    [activeStages, supabase, refetchStages, setStages, setError]
  );

  return { addStage, deleteStage, patchStage, moveStage, reorderStages };
}
