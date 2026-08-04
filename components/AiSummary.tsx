"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Hand, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { qualReasonLabel, type Qualification, type QualAction } from "@/lib/crm";

// Resumo da IA para a conversa: o que a IA entendeu e por que passou para uma
// pessoa. Lê a qualificação mais recente (conversation_qualifications, gravada
// por /api/agent). Só leitura; nada aqui escreve. Some quando não há handoff.
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

  // Sem qualificação relevante: não ocupa espaço no painel.
  if (!qual || qual.action === "none") return null;

  const isAgendar = qual.action === "agendar";
  const Icon = isAgendar ? CalendarClock : Hand;
  const tone = isAgendar ? "text-ia" : "text-warn";
  const bg = isAgendar ? "bg-[var(--ia-bg)]" : "bg-[var(--warn-bg)]";

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
        Resumo da IA
      </div>
      <div className={`rounded-lg ${bg} px-3 py-2.5`}>
        <div className={`flex items-center gap-1.5 text-[12.5px] font-medium ${tone}`}>
          <Icon size={14} className="shrink-0" />
          {qualReasonLabel(qual.action)}
        </div>
        {qual.summary && (
          <p className="mt-1.5 text-[13px] leading-snug text-ink">{qual.summary}</p>
        )}
        {isAgendar && qual.preferenciaHorario && (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-muted">
            <Clock size={12} className="shrink-0" />
            {qual.preferenciaHorario}
          </p>
        )}
      </div>
    </div>
  );
}
