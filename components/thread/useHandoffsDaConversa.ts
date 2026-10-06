"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import type { Handoff } from "../HandoffCard";

/**
 * Os pedidos de ajuda desta conversa: carga, tempo real (uma linha por evento),
 * a fila de abertos e o "Resolvido". Quem desenha a fila é o `Thread`.
 */
export function useHandoffsDaConversa({
  clientId,
  phone,
  handoffsPreview,
}: {
  clientId: string;
  phone: string;
  /** Só o preview /design: os pedidos de ajuda, que sem banco não existem. */
  handoffsPreview?: Handoff[];
}) {
  const supabase = createClient();
  // PEDIDOS DE AJUDA DA IA (tabela `handoffs`, 27/09/2026): viram cartões na
  // linha do tempo. Carregados e escutados em tempo real, porque quem abre e
  // fecha é o servidor (o agente e o Resolvido), fora desta tela.
  const [handoffs, setHandoffs] = useState<Handoff[]>(handoffsPreview ?? []);
  const carregarHandoffs = useCallback(async () => {
    if (handoffsPreview) return;
    const { data } = await supabase
      .from("handoffs")
      .select("id, opened_at, summary, instruction, closed_at, closed_how, motivo")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .order("opened_at", { ascending: true });
    setHandoffs(
      (data ?? []).map((r) => ({
        id: r.id,
        openedAt: r.opened_at,
        summary: r.summary,
        instruction: r.instruction,
        closedAt: r.closed_at,
        closedHow: r.closed_how as Handoff["closedHow"],
        motivo: r.motivo,
      }))
    );
  }, [supabase, clientId, phone, handoffsPreview]);

  useEffect(() => {
    if (handoffsPreview) return;
    void (async () => {
      await carregarHandoffs();
    })();
  }, [carregarHandoffs, handoffsPreview]);

  // TEMPO REAL (02/10/2026, R-21/R-22): canal do tenant, só os pedidos DESTA
  // conversa, e o evento encaixa a linha (por id) em vez de reler a lista. A
  // lista só é relida ao reconectar ou ao voltar o foco.
  useCanalTenant({
    clientId,
    tabelas: ["handoffs"],
    modo: "aplicar",
    ativo: !handoffsPreview,
    revalidar: () => void carregarHandoffs(),
    aoEvento: (ev) => {
      if (foneDoEvento(ev) !== phone) return;
      if (ev.tipo === "DELETE") {
        const id = ev.antigo?.id as number | undefined;
        if (id != null) setHandoffs((cur) => cur.filter((h) => h.id !== id));
        return;
      }
      const r = ev.novo;
      if (!r) return;
      const novo: Handoff = {
        id: r.id as number,
        openedAt: r.opened_at as string,
        summary: (r.summary as string | null) ?? null,
        instruction: (r.instruction as string | null) ?? null,
        closedAt: (r.closed_at as string | null) ?? null,
        closedHow: (r.closed_how as Handoff["closedHow"]) ?? null,
        motivo: (r.motivo as string | null) ?? null,
      };
      setHandoffs((cur) =>
        cur.some((h) => h.id === novo.id)
          ? cur.map((h) => (h.id === novo.id ? novo : h))
          : [...cur, novo]
      );
    },
  });

  // A FILA: pedidos abertos do mais antigo para o mais novo. A caixa de escrita
  // mostra o primeiro; resolvido ele, vem o próximo.
  const fila = useMemo(
    () =>
      handoffs
        .filter((h) => !h.closedAt)
        .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt)),
    [handoffs]
  );
  const pedidoAtual = fila[0] ?? null;

  // "Resolvido": fecha o pedido da vez sem mandar nada (a mesma rota do antigo
  // Resolvido, que também devolve a IA e larga o responsável).
  const resolverHandoff = useCallback(
    async (pedidoId: number) => {
      const res = await fetch("/api/conversations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pedidoId }),
      });
      // Fecha na tela já; o evento do realtime traz a linha de verdade (sem
      // reler a lista, que era a segunda consulta por clique).
      if (res.ok) {
        setHandoffs((cur) =>
          cur.map((h) =>
            h.id === pedidoId && !h.closedAt
              ? { ...h, closedAt: new Date().toISOString(), closedHow: "resolvido" }
              : h
          )
        );
      }
    },
    [phone]
  );

  return { handoffs, carregarHandoffs, fila, pedidoAtual, resolverHandoff };
}
