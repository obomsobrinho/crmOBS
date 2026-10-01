"use client";

import { useEffect, useRef, useState } from "react";
import { assinarComSessao, createClient } from "@/lib/supabase/client";

/**
 * UM NÚMERO QUE ACOMPANHA O BANCO (o contador do menu), do jeito barato
 * (01/10/2026, docs/plano-carregamento.md, fase 2):
 *
 * - o canal escuta só o TENANT (`client_id=eq.`), não o banco inteiro;
 * - uma rajada de eventos (um lote de mensagens) vira UMA contagem, depois de
 *   `esperaMs` sem evento novo;
 * - aba escondida não conta nada: anota que ficou para trás e conta uma vez
 *   quando a pessoa volta.
 *
 * Sem `clientId` (preview `/design`, sem sessão) não consulta nada e fica em 0.
 */
export function useContagemAoVivo({
  clientId,
  tabela,
  canal,
  contar,
  esperaMs = 1000,
}: {
  clientId: string | undefined;
  tabela: string;
  canal: string;
  /** A contagem em si (HEAD, nunca linhas). */
  contar: (supabase: ReturnType<typeof createClient>, clientId: string) => Promise<number>;
  esperaMs?: number;
}): number {
  const [valor, setValor] = useState(0);
  const contarRef = useRef(contar);
  useEffect(() => {
    contarRef.current = contar;
  });

  useEffect(() => {
    if (!clientId) return;
    const supabase = createClient();
    let vivo = true;
    let atrasada = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const contarAgora = async () => {
      try {
        const n = await contarRef.current(supabase, clientId);
        if (vivo) setValor(n);
      } catch (e) {
        console.error(`contagem ${canal}:`, e);
      }
    };
    const agendar = () => {
      if (document.visibilityState !== "visible") {
        atrasada = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void contarAgora(), esperaMs);
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && atrasada) {
        atrasada = false;
        void contarAgora();
      }
    };

    void contarAgora();
    const sair = assinarComSessao((sb) =>
      sb
      .channel(`${canal}-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabela, filter: `client_id=eq.${clientId}` },
        agendar
      )
      .subscribe()
    );
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      sair();
    };
  }, [clientId, tabela, canal, esperaMs]);

  return valor;
}
