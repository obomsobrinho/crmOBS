"use client";

import { useState } from "react";
import { ArrowUp, CheckCheck, LifeBuoy, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatEspera, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Um pedido de ajuda da IA (tabela `handoffs`). */
export interface Handoff {
  id: number;
  openedAt: string;
  summary: string | null;
  instruction: string | null;
  closedAt: string | null;
  closedHow: "ia" | "resolvido" | null;
}

/**
 * O HANDOFF MORA NA CONVERSA (27/09/2026, pedido do dono).
 *
 * Antes o pedido de ajuda da IA vivia numa faixa âmbar no topo, e a orientação
 * numa pílula roxa da caixa de escrita, embaixo: nada na tela dizia que uma
 * respondia à outra, e o dono, testando, não soube como "responder o handoff
 * pedindo para a IA resolver". Agora o pedido é um CARTÃO na linha do tempo,
 * logo depois da resposta da IA que pediu ajuda, e a orientação se digita
 * DENTRO dele, na mesma cor. Os três jeitos de sair moram juntos: orientar (a IA
 * resolve na próxima mensagem do cliente e o cartão fecha sozinho), "Resolvi
 * por fora" e "Assumir a conversa".
 *
 * Fechado, ele vira uma linha de histórico: quem resolveu, como e quando.
 */
export default function HandoffCard({
  h,
  orientacaoPendente,
  onOrientar,
  onCancelarOrientacao,
  onResolver,
  onAssumir,
  readOnly = false,
}: {
  h: Handoff;
  /** `conversations.pending_instruction`: o time já orientou e a IA ainda não usou. */
  orientacaoPendente: string | null;
  onOrientar?: (texto: string) => void | Promise<void>;
  onCancelarOrientacao?: () => void | Promise<void>;
  onResolver?: () => void | Promise<void>;
  onAssumir?: () => void;
  readOnly?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);

  if (h.closedAt) {
    // Linha de HISTÓRICO: o pedido continua visível onde aconteceu, com o
    // desfecho. Neutra, porque não pede mais nada de ninguém.
    const desfecho =
      h.closedHow === "ia"
        ? "resolvido pela IA com a sua orientação"
        : "resolvido pelo time";
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

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !onOrientar) return;
    setEnviando(true);
    try {
      await onOrientar(t);
      setTexto("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      data-slot="handoff-cartao"
      data-estado="aberto"
      className="mb-3 overflow-hidden rounded-2xl border border-warn-line bg-raised shadow-[var(--bubble-shadow)]"
    >
      <div className="flex items-start gap-3 bg-warn-surface px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-raised text-warn-ink">
          <LifeBuoy size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-rotulo uppercase text-warn-ink">A IA pediu sua ajuda</span>
            <span className="text-legenda text-warn-ink" suppressHydrationWarning>
              · esperando há {formatEspera(h.openedAt)}
            </span>
          </p>
          <p className="mt-0.5 text-corpo font-semibold text-ink">
            {h.summary || "Ela não soube responder e passou para o time."}
          </p>
        </div>
      </div>

      {!readOnly && (
        <div className="px-4 pb-3 pt-3">
          {orientacaoPendente ? (
            // Orientado: a parte do time está feita, e o cartão diz o que vem.
            <div data-slot="handoff-orientado" className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-apoio text-ink">
                  <span className="font-semibold">Você orientou:</span> “{orientacaoPendente}”
                </p>
                <p className="mt-0.5 text-legenda text-ink-3">
                  A IA responde na próxima mensagem do cliente.
                </p>
              </div>
              {onCancelarOrientacao && (
                <Button
                  variant="ghost"
                  size="icon-chrome"
                  aria-label="Cancelar orientação"
                  onClick={() => void onCancelarOrientacao()}
                  className="text-ink-3"
                >
                  <X size={15} />
                </Button>
              )}
            </div>
          ) : (
            onOrientar && (
              <div className="flex items-end gap-2 rounded-xl border border-warn-line bg-[var(--input-bg)] p-1.5 pl-3">
                <Textarea
                  variant="limpo"
                  rows={1}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  aria-label="Orientação para a IA"
                  placeholder="Diga à IA o que responder ao cliente"
                  className="max-h-[132px] min-h-9 min-w-0 flex-1 px-0 py-2 text-corpo [field-sizing:content]"
                />
                {/* Âmbar, a cor do pedido: é a resposta a ele. Roxo aqui repetia
                    a desconexão que o dono apontou entre handoff e orientação. */}
                <Button
                  variant="warn"
                  size="none"
                  onClick={() => void enviar()}
                  carregando={enviando}
                  disabled={!texto.trim()}
                  aria-label="Enviar orientação"
                  className="size-9 shrink-0 justify-center rounded-full"
                >
                  <ArrowUp size={18} />
                </Button>
              </div>
            )
          )}

          <div className={cn("flex flex-wrap items-center gap-1", "mt-2")}>
            {onResolver && (
              <Button
                variant="ghost"
                size="chrome"
                carregando={resolvendo}
                onClick={async () => {
                  setResolvendo(true);
                  try {
                    await onResolver();
                  } finally {
                    setResolvendo(false);
                  }
                }}
              >
                <CheckCheck size={14} />
                Resolvi por fora
              </Button>
            )}
            {onAssumir && (
              <Button variant="ghost" size="chrome" onClick={onAssumir}>
                <UserRound size={14} />
                Assumir a conversa
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
