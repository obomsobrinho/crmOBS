"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCanalTenant, type TabelaTenant } from "@/lib/use-canal-ao-vivo";

/**
 * UM NÚMERO QUE ACOMPANHA O BANCO (o contador do menu), do jeito barato
 * (01/10/2026, docs/plano-carregamento.md, fase 2):
 *
 * - o canal é o do TENANT (`useCanalTenant`, compartilhado com o resto da tela:
 *   status, volta do foco e aba escondida moram lá);
 * - uma rajada de eventos (um lote de mensagens) vira UMA contagem, depois de
 *   `esperaMs` sem evento novo;
 * - aba escondida não conta nada: o canal anota que ficou para trás e conta uma
 *   vez quando a pessoa volta (ou quando o socket reconecta).
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
  tabela: TabelaTenant;
  /** Só para o log de erro. */
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
  const vivoRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contarAgora = useCallback(async () => {
    if (!clientId) return;
    try {
      const n = await contarRef.current(createClient(), clientId);
      if (vivoRef.current) setValor(n);
    } catch (e) {
      console.error(`contagem ${canal}:`, e);
    }
  }, [clientId, canal]);

  useEffect(() => {
    vivoRef.current = true;
    void contarAgora();
    return () => {
      vivoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [contarAgora]);

  useCanalTenant({
    clientId,
    tabelas: [tabela],
    revalidar: () => void contarAgora(),
    aoEvento: () => {
      // Rajada vira UMA contagem, depois de `esperaMs` sem evento novo.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void contarAgora(), esperaMs);
    },
  });

  return valor;
}
