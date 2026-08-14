"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Handoff coach (copiloto): quando a IA abre um handoff (pausada), em vez de o
// operador assumir o teclado, ele diz à IA o que responder. A orientação vai
// para conversations.pending_instruction e a IA é reativada; ela usa a
// orientação na PRÓXIMA mensagem do cliente (consumo único em /api/agent) e
// segue sozinha. Só aparece quando há handoff aberto (IA pausada) ou já existe
// uma orientação pendente. Escrita direta do browser (grant + RLS por tenant).
export default function AiCoach({
  phone,
  clientId,
  myUserId,
  paused,
  initialInstruction,
}: {
  phone: string;
  clientId: string;
  myUserId: string;
  paused: boolean;
  initialInstruction: string | null;
}) {
  const supabase = createClient();
  const [pending, setPending] = useState<string | null>(initialInstruction);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  // Fora de handoff e sem orientação pendente: não ocupa espaço.
  if (!paused && !pending) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || status === "saving") return;
    setStatus("saving");
    const { error } = await supabase
      .from("conversations")
      .update({
        pending_instruction: text,
        pending_instruction_at: new Date().toISOString(),
        pending_instruction_by: myUserId,
      })
      .eq("client_id", clientId)
      .eq("phone", phone);
    if (error) {
      setStatus("error");
      return;
    }
    // Reativa a IA para ela retomar sozinha no próximo turno.
    await supabase
      .from("dados_cliente")
      .update({ atendimento_ia: "reativada" })
      .eq("telefone", phone);
    setPending(text);
    setDraft("");
    setStatus("idle");
  };

  const cancel = async () => {
    if (status === "saving") return;
    setStatus("saving");
    const { error } = await supabase
      .from("conversations")
      .update({
        pending_instruction: null,
        pending_instruction_at: null,
        pending_instruction_by: null,
      })
      .eq("client_id", clientId)
      .eq("phone", phone);
    if (error) {
      setStatus("error");
      return;
    }
    setPending(null);
    setStatus("idle");
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
        <Sparkles size={12} className="text-ia" />
        Orientar a IA
      </div>

      {pending ? (
        <div className="rounded-lg bg-[var(--ia-bg)] px-3 py-2.5">
          <div className="text-[12.5px] font-medium text-ia">Orientação pendente</div>
          <p className="mt-1.5 text-[13px] leading-snug text-ink">{pending}</p>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            A IA vai usar isto na próxima mensagem do cliente.
          </p>
          <button
            onClick={cancel}
            disabled={status === "saving"}
            className="mt-2 flex items-center gap-1 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            <X size={13} />
            Cancelar orientação
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] leading-snug text-ink-muted">
            Diga o que a IA deve responder. Ela reativa e usa sua orientação na
            próxima mensagem do cliente.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={800}
            placeholder="Ex.: confirme que temos horário amanhã de manhã e peça o nome completo."
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || status === "saving"}
            className="btn-primary mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {status === "saving" ? "Enviando..." : "Orientar e reativar IA"}
          </button>
        </>
      )}

      {status === "error" && (
        <p className="mt-1.5 text-[12px] text-danger">Não deu para salvar. Tente de novo.</p>
      )}
    </div>
  );
}
