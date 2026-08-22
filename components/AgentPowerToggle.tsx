"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch, SwitchTrack, SwitchThumb } from "@/components/ui/switch";

// Liga e desliga o agente. Era um cartão inteiro (título, parágrafo e botão
// "Publicar agente") no topo de /agente; virou uma chave no cabeçalho, porque o
// estado é uma informação de uma palavra e não precisava de um bloco.
//
// O NOME mudou junto, e a razão é de produto: "publicado" é vocabulário de fluxo
// de publicação e não diz nada para quem tem uma clínica. Aqui é "Agente ativo"
// e "Desativado". E não é "pausado" de propósito: pausada é a IA de UMA conversa
// quando um humano assume, e usar a mesma palavra nos dois lugares faria a
// pessoa olhar o inbox sem saber se a IA parou naquela conversa ou no sistema.
//
// Os pré-requisitos são conferidos no servidor (a rota devolve 409 com o que
// falta), então esta chave não é o gate: ela só reflete e desabilita.
export default function AgentPowerToggle({
  clientId,
  enabled,
  blocked,
}: {
  clientId: string;
  /** Agente atendendo agora (já foi ao ar ao menos uma vez E está ligado). */
  enabled: boolean;
  /** Falta passo do onboarding e nunca foi ao ar: não dá para ligar ainda. */
  blocked: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternar(proximo: boolean) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/publish`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: proximo }),
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
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={enabled}
        onCheckedChange={alternar}
        disabled={loading || (blocked && !enabled)}
        aria-label={enabled ? "Desativar agente" : "Ativar agente"}
        className="flex items-center gap-2 rounded-full border border-line bg-bloco px-3 py-1.5"
      >
        <span
          className={`text-apoio font-medium ${
            enabled ? "text-human-ink" : "text-ink-2"
          }`}
        >
          {loading ? "Salvando…" : enabled ? "Agente ativo" : "Desativado"}
        </span>
        <SwitchTrack checked={enabled}>
          <SwitchThumb checked={enabled} />
        </SwitchTrack>
      </Switch>
      {error && <p className="text-legenda text-danger-ink">{error}</p>}
    </div>
  );
}
