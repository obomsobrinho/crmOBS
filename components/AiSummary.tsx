"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sparkles, Clock, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { qualReasonLabel, type Qualification, type QualAction } from "@/lib/crm";
import { formatEspera } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Entendimento": o que a IA entendeu desta conversa. Lê a qualificação mais
// recente (conversation_qualifications, gravada por /api/agent). Só leitura.
//
// Abre o painel de propósito, mesmo sem qualificação nenhuma: a primeira coisa
// que a coluna responde é "o que essa pessoa quer". Antes isso era um cartão
// tingido chamado "Resumo da IA" que sumia quando não havia handoff, e a
// lateral começava em texto solto.
export default function AiSummary({
  phone,
  clientId,
  variante = "painel",
  direita,
}: {
  phone: string;
  clientId: string;
  /**
   * `painel` é o bloco da coluna da direita. `faixa` é a linha larga que fica
   * logo abaixo do cabeçalho da conversa (desenho de 18/09/2026): "O CLIENTE
   * QUER ..." é a primeira coisa que a pessoa lê ao abrir, e no painel lateral
   * ela disputava atenção com dados cadastrais.
   */
  variante?: "painel" | "faixa";
  /** Só na faixa: o que aparece na ponta direita (quem assumiu). */
  direita?: ReactNode;
}) {
  const supabase = createClient();
  const [qual, setQual] = useState<Qualification | null>(null);
  // Handoff em aberto desta conversa. Vem junto porque é aqui que o pedido
  // pendente está descrito, e é aqui que faz sentido declarar que acabou.
  const [handoffAt, setHandoffAt] = useState<string | null>(null);
  const [resolvendo, setResolvendo] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: conv }] = await Promise.all([
      supabase
        .from("conversation_qualifications")
        .select("action, summary, preferencia_horario, created_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("handoff_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .maybeSingle(),
    ]);
    setHandoffAt((conv?.handoff_at as string | null) ?? null);
    if (!data) {
      setQual(null);
      return;
    }
    setQual({
      action: (data.action as QualAction) ?? "none",
      summary: (data.summary as string | null) ?? "",
      preferenciaHorario: (data.preferencia_horario as string | null) ?? "",
      createdAt: (data.created_at as string) ?? "",
    });
  }, [supabase, clientId, phone]);

  // Declara o pedido resolvido: fecha o handoff e devolve o atendimento para a
  // IA. Vai por rota (service_role) porque `handoff_at` não tem grant de UPDATE
  // para o browser, justamente para ninguém tirar conversa da fila por acidente.
  const resolver = useCallback(async () => {
    setResolvendo(true);
    const anterior = handoffAt;
    setHandoffAt(null); // otimista
    try {
      const res = await fetch("/api/conversations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) setHandoffAt(anterior); // reverte
    } catch {
      setHandoffAt(anterior);
    } finally {
      setResolvendo(false);
    }
  }, [phone, handoffAt]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const channel = supabase
      .channel(`qual-${phone}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_qualifications" },
        () => void load()
      )
      // `conversations` também: o handoff é aberto pelo /api/agent e fechado pela
      // rota de resolver, os dois fora desta tela, então sem isto o bloco só
      // atualizaria ao trocar de conversa.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, supabase, phone]);

  // O pedido é a linha grande. Sem qualificação, ou com action "none", a IA
  // ainda não concluiu nada: dizer isso é mais útil que esconder o bloco.
  const pedido = qual ? qualReasonLabel(qual.action) : "";
  const horario = qual?.preferenciaHorario ?? "";
  const resumo = qual?.summary ?? "";

  if (variante === "faixa") {
    return (
      <div
        data-slot="conversa-entendimento"
        className={cn(
          "flex shrink-0 items-center gap-2.5 border-b px-4 py-2",
          handoffAt
            ? "border-warn-line bg-warn-surface"
            : "border-line bg-raised"
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-rotulo uppercase",
            handoffAt ? "text-warn-ink" : "text-brand-ink"
          )}
        >
          <Sparkles size={13} className="shrink-0" />
          O cliente quer
        </span>
        {/* Uma linha só e sem quebrar o layout: o resumo pode ser longo, e a
            faixa não pode empurrar a conversa para baixo a cada turno da IA. */}
        <span className="min-w-0 flex-1 truncate text-apoio text-ink">
          {resumo || pedido || "Ainda não disse"}
        </span>
        {horario && (
          <span className="hidden shrink-0 items-center gap-1 text-legenda text-ink-2 lg:flex">
            <Clock size={13} className="shrink-0 text-ink-3" />
            {horario}
          </span>
        )}
        {handoffAt && (
          <>
            <span
              className="shrink-0 text-legenda font-medium text-warn-ink"
              suppressHydrationWarning
            >
              esperando há {formatEspera(handoffAt)}
            </span>
            <Button
              size="chrome"
              variant="outline"
              onClick={resolver}
              disabled={resolvendo}
              className="shrink-0"
            >
              <CheckCheck size={14} />
              {resolvendo ? "Resolvendo…" : "Resolvido"}
            </Button>
          </>
        )}
        {direita}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="flex items-center gap-1.5 text-rotulo uppercase text-brand-ink">
        <Sparkles size={13} className="shrink-0" />
        Entendimento
      </span>

      <b className="text-titulo text-ink" style={{ textWrap: "pretty" }}>
        {pedido || "Ainda não disse"}
      </b>

      {horario && (
        <span className="flex items-center gap-1.5 text-apoio font-semibold text-ink-2">
          <Clock size={14} className="shrink-0 text-ink-3" />
          {horario}
        </span>
      )}

      {resumo && (
        <p className="text-apoio text-ink-3" style={{ textWrap: "pretty" }}>
          {resumo}
        </p>
      )}

      {/* Pendência em aberto. Âmbar aqui é o significado certo da cor: alguém
          espera. Só aparece com handoff aberto, e sai quando for resolvido. */}
      {handoffAt && (
        <div className="mt-1 rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5">
          <p className="text-apoio font-medium text-warn-ink">
            Esperando você há {formatEspera(handoffAt)}
          </p>
          <p className="mt-0.5 text-legenda text-ink-2">
            Resolver fecha essa pendência e devolve o atendimento para a IA.
          </p>
          <Button
            size="field"
            variant="outline"
            onClick={resolver}
            disabled={resolvendo}
            className="mt-2 w-full justify-center"
          >
            <CheckCheck size={15} />
            {resolvendo ? "Resolvendo…" : "Resolvido"}
          </Button>
        </div>
      )}
    </div>
  );
}
