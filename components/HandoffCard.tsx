import { CheckCheck } from "lucide-react";
import { formatTime } from "@/lib/format";

/** Um pedido de ajuda da IA (tabela `handoffs`). */
export interface Handoff {
  id: number;
  openedAt: string;
  summary: string | null;
  instruction: string | null;
  closedAt: string | null;
  closedHow: "ia" | "resolvido" | null;
  /** Por que a IA chamou o time (lib/motivos.ts); null = pedido antigo. */
  motivo?: string | null;
}

/**
 * O PEDIDO FECHADO, NA LINHA DO TEMPO DA CONVERSA.
 *
 * O pedido ABERTO não mora mais aqui (27/09/2026, pedido do dono): ele é a
 * caixa de escrita em modo pedido (`MessageComposer` com a prop `pedido`). Na conversa fica só o
 * histórico, uma linha neutra no ponto em que o pedido fechou: o quê, como e
 * quando. Sem âmbar, porque não pede mais nada de ninguém.
 */
export default function HandoffCard({ h }: { h: Handoff }) {
  if (!h.closedAt) return null;
  const desfecho =
    h.closedHow === "ia" ? "resolvido com a sua orientação" : "resolvido pelo time";
  return (
    <div data-slot="handoff-cartao" data-estado="fechado" className="mb-3 flex justify-center">
      <div className="max-w-[620px] rounded-xl border border-line-soft bg-[var(--marcador-surface)] px-3.5 py-2 text-center">
        <p className="text-legenda text-ink-2" suppressHydrationWarning>
          <CheckCheck size={13} className="mr-1 inline align-[-2px] text-human-ink" aria-hidden />
          Pedido de ajuda{h.summary ? `: ${h.summary}` : ""} · {desfecho} ·{" "}
          {formatTime(h.closedAt)}
        </p>
        {h.closedHow === "ia" && h.instruction && (
          <p className="mt-0.5 text-legenda text-ink-3">Orientação: “{h.instruction}”</p>
        )}
      </div>
    </div>
  );
}
