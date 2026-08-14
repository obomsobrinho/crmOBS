"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, PauseCircle } from "lucide-react";

// Interruptor do agente no WhatsApp. Publicado = a IA responde cliente de
// verdade; pausado = ela não responde ninguém, e as mensagens que chegam
// continuam sendo gravadas para a equipe responder na mão.
//
// Os pré-requisitos são conferidos no servidor (a rota devolve 409 com o que
// falta), então este card não é o gate: ele só mostra o resultado.
export default function AgentPublishCard({
  clientId,
  published,
  blockers,
}: {
  clientId: string;
  published: boolean;
  /** O que falta para poder publicar (vem de lib/onboarding.publishBlockers). */
  blockers: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const travado = !published && blockers.length > 0;

  async function alternar() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/publish`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "não foi possível salvar.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("falha de conexão. Tente de novo.");
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        {published ? (
          <Radio size={18} className="mt-0.5 shrink-0 text-ia" />
        ) : (
          <PauseCircle size={18} className="mt-0.5 shrink-0 text-warn" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {published ? "Agente publicado" : "Agente pausado"}
          </p>
          <p className="text-sm text-ink-muted">
            {published
              ? "A IA está atendendo no WhatsApp conectado."
              : "A IA não responde ninguém. As mensagens que chegam ficam no inbox para a equipe responder."}
          </p>

          {travado && (
            <p className="mt-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
              Antes de publicar, falta: {blockers.join(", ")}.
            </p>
          )}

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>

        <button
          onClick={alternar}
          disabled={loading || travado}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
            published
              ? "border border-line hover:border-line-strong"
              : "btn-primary"
          }`}
        >
          {loading
            ? "Salvando…"
            : published
            ? "Pausar agente"
            : "Publicar agente"}
        </button>
      </div>
    </div>
  );
}
