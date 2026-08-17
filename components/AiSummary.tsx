"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { qualReasonLabel, type Qualification, type QualAction } from "@/lib/crm";

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
}: {
  phone: string;
  clientId: string;
}) {
  const supabase = createClient();
  const [qual, setQual] = useState<Qualification | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("conversation_qualifications")
      .select("action, summary, preferencia_horario, created_at")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
    </div>
  );
}
