"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCanalConversa } from "@/lib/use-canal-ao-vivo";
import { ehManual, PAGINA_MENSAGENS } from "@/lib/mensagem";
import type { Bubble, ChatRow } from "@/lib/types";
import type { OutgoingMedia } from "../MessageComposer";
import { ordemDasLinhas, rowsToBubbles } from "./bolhas";

// As colunas de `ChatRow` (lib/types.ts), sem `select("*")` em leitura de lista.
const COLUNAS_MENSAGEM =
  "id, phone, nomewpp, user_message, bot_message, message_type, active, created_at, media_url, media_type";

type Pending = {
  tempId: string;
  content: string;
  created_at: string;
  status: "pending" | "failed";
  // Preenchido quando o pendente é um envio de mídia (reconcilia pelo caminho).
  mediaPath?: string;
};

/**
 * As mensagens da conversa: as linhas, os envios pendentes, a paginação para
 * cima, o tempo real (a linha que mudou entra direto) e os balões derivados.
 */
export function useMensagensDaConversa({
  phone,
  initialRows,
  temAntigasInicial,
  viewportRef,
  pedidoAtualId,
  carregarHandoffs,
}: {
  phone: string;
  initialRows: ChatRow[];
  /** A conversa tem mensagens mais antigas que as que vieram do servidor. */
  temAntigasInicial: boolean;
  /** O elemento que rola de verdade, dentro do ScrollArea. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** O pedido de ajuda da vez: responder daqui o resolve. */
  pedidoAtualId: number | undefined;
  carregarHandoffs: () => Promise<void>;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<ChatRow[]>(initialRows);
  const [rowsProp, setRowsProp] = useState<ChatRow[]>(initialRows);
  // CONVERSA PAGINADA (01/10/2026, docs/plano-carregamento.md, fase 4): abre
  // com as 30 mais recentes e busca as anteriores ao chegar no topo.
  const [temAntigas, setTemAntigas] = useState(temAntigasInicial);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const topoRef = useRef<HTMLDivElement>(null);
  // Distância até o FIM antes de crescer em cima: devolvida depois, para a
  // mensagem que a pessoa lia não sair do lugar.
  const restaurarRef = useRef<number | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  // Ressincroniza ao navegar entre conversas (o componente é reaproveitado).
  //
  // Ajuste em tempo de render, e não `useEffect` com `setState` dentro: com o
  // efeito, o React pintava a conversa NOVA com as mensagens da ANTIGA e só
  // então corrigia, o que é uma renderização em cascata e um piscar visível em
  // lista longa. Ver react.dev "adjusting state when a prop changes".
  if (rowsProp !== initialRows) {
    setRowsProp(initialRows);
    setRows(initialRows);
    setPending([]);
    setTemAntigas(temAntigasInicial);
  }

  /**
   * Junta linhas que chegaram (realtime, recarga) às que estão na tela, por id e
   * na ordem de chegada no WhatsApp. Pendente que virou linha no banco sai: mídia
   * casa pelo media_url, texto pela mensagem 'manual'.
   */
  const mesclar = useCallback((novas: ChatRow[]) => {
    if (novas.length === 0) return;
    setRows((cur) => {
      const porId = new Map(cur.map((r) => [r.id, r]));
      for (const r of novas) porId.set(r.id, r);
      return [...porId.values()].sort(ordemDasLinhas);
    });
    setPending((prev) =>
      prev.filter((p) =>
        p.mediaPath
          ? !novas.some((r) => r.media_url === p.mediaPath)
          : !novas.some((r) => ehManual(r.message_type) && r.bot_message === p.content)
      )
    );
  }, []);

  /** As mais recentes de novo (o realtime caiu e voltou): junta, não substitui. */
  const recarregarRecentes = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select(COLUNAS_MENSAGEM)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGINA_MENSAGENS);
    if (data) mesclar(data.reverse());
  }, [phone, supabase, mesclar]);

  /** As 30 anteriores à primeira da tela. */
  const carregarAntigas = useCallback(async () => {
    const primeira = rows[0];
    if (!temAntigas || carregandoAntigas || !primeira) return;
    setCarregandoAntigas(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(COLUNAS_MENSAGEM)
        .eq("phone", phone)
        .or(`created_at.lt.${primeira.created_at},and(created_at.eq.${primeira.created_at},id.lt.${primeira.id})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGINA_MENSAGENS);
      if (error) throw error;
      const antigas = (data ?? []).reverse();
      const el = viewportRef.current;
      if (el) restaurarRef.current = el.scrollHeight - el.scrollTop;
      setTemAntigas(antigas.length === PAGINA_MENSAGENS);
      mesclar(antigas);
    } catch (e) {
      console.error("mensagens anteriores:", e);
    } finally {
      setCarregandoAntigas(false);
    }
  }, [rows, temAntigas, carregandoAntigas, phone, supabase, mesclar, viewportRef]);

  // Cresceu em cima: a mensagem que a pessoa lia fica onde estava.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el && restaurarRef.current != null) {
      el.scrollTop = el.scrollHeight - restaurarRef.current;
      restaurarRef.current = null;
    }
  }, [rows, viewportRef]);

  // O marcador do TOPO: quando aparece, vêm as anteriores.
  useEffect(() => {
    const alvo = topoRef.current;
    const raiz = viewportRef.current;
    if (!alvo || !raiz || !temAntigas) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void carregarAntigas();
      },
      { root: raiz, rootMargin: "300px 0px 0px 0px" }
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [temAntigas, carregarAntigas, rows.length, viewportRef]);

  // Realtime: mudanças nesta conversa (canal próprio por telefone, filtrado no
  // servidor: é a tabela de maior volume). Reassinatura (o realtime caiu e
  // voltou) ou voltar o foco: pode ter chegado mensagem no meio, então busca as
  // recentes e JUNTA. A primeira assinatura é pulada: a conversa acabou de vir.
  useCanalConversa({
    nome: "thread",
    tabela: "chat_messages",
    filtro: `phone=eq.${phone}`,
    modo: "aplicar",
    revalidar: () => void recarregarRecentes(),
    aoEvento: (ev) => {
      // A LINHA que mudou entra direto, sem baixar a conversa de novo.
      if (ev.tipo === "DELETE") {
        const id = ev.antigo?.id as number | undefined;
        if (id != null) setRows((cur) => cur.filter((r) => r.id !== id));
        return;
      }
      if (ev.novo) mesclar([ev.novo as ChatRow]);
    },
  });

  const bubbles = useMemo(() => {
    const base = rowsToBubbles(rows);
    const pend: Bubble[] = pending.map((p) => ({
      key: p.tempId,
      side: "out",
      author: "voce",
      content: p.content,
      created_at: p.created_at,
      status: p.status,
    }));
    return [...base, ...pend];
  }, [rows, pending]);

  const handleSend = useCallback(
    async (text: string) => {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        { tempId, content: text, created_at: new Date().toISOString(), status: "pending" },
      ]);
      try {
        // Responder com um pedido aberto é responder A ELE: a caixa mostra o
        // pedido nos dois modos, então quem responde daqui resolve o pedido.
        const pedidoId = pedidoAtualId;
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, text, ...(pedidoId ? { pedidoId } : {}) }),
        });
        if (!res.ok) throw new Error("send failed");
        if (pedidoId) void carregarHandoffs();
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p))
        );
      }
    },
    [phone, pedidoAtualId, carregarHandoffs]
  );

  // Envio de mídia: o arquivo já subiu pro Storage (composer); aqui só dispara o
  // envio e mostra um pendente. A linha real chega pelo realtime (o n8n grava).
  const handleSendMedia = useCallback(
    async (media: OutgoingMedia) => {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        {
          tempId,
          content: media.filename,
          created_at: new Date().toISOString(),
          status: "pending",
          mediaPath: media.path,
        },
      ]);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, media }),
        });
        if (!res.ok) throw new Error("send failed");
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p))
        );
      }
    },
    [phone]
  );

  return { bubbles, pending, temAntigas, carregandoAntigas, topoRef, handleSend, handleSendMedia };
}
