"use client";

import { useState } from "react";
import { BookmarkCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/aviso";
import { ConfirmModal, Hint, MOLDURA_LISTA, SubBloco } from "./ui";

// REGRAS SALVAS PELO TIME (P1 item 5, 13/10/2026; ADR
// docs/adr/2026-10-13-orientation-saved-as-agent-rule.md).
//
// Onde o dono revisa e apaga as regras que salvou a partir de orientações em
// Pedidos. Aparece nos DOIS modos do /agente: no guiado dentro de "O que ele pode
// fazer", no avançado embaixo do prompt (lá não existe outra lista de regras).
//
// ⚠️ Não é campo do formulário: apagar publica NA HORA, pela rota `agent-rules`
// (recompila o prompt e grava a versão), e o Salvar do formulário mantém a lista
// do banco. Por isso pede confirmação e não espera o Salvar.

export default function RegrasSalvas({
  clientId,
  regras,
  onRegras,
  preview = false,
}: {
  clientId: string;
  regras: string[];
  /** A lista que o servidor devolveu (também alimenta a prévia do prompt). */
  onRegras: (regras: string[]) => void;
  /** /design: apaga só na tela. */
  preview?: boolean;
}) {
  const [apagar, setApagar] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    const regra = apagar;
    setApagar(null);
    if (!regra) return;
    setErro(null);
    if (preview) {
      onRegras(regras.filter((r) => r !== regra));
      return;
    }
    setApagando(regra);
    try {
      const res = await fetch(`/api/clients/${clientId}/agent-rules`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: regra }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; regras?: string[] };
      if (!res.ok || !data.regras) {
        setErro(data.error ?? "Não foi possível apagar a regra.");
        return;
      }
      onRegras(data.regras);
    } catch {
      setErro("Não foi possível contatar o servidor.");
    } finally {
      setApagando(null);
    }
  }

  return (
    <SubBloco
      titulo="Regras salvas pelo time"
      icone={BookmarkCheck}
      descricao="Orientações de Pedidos que você salvou como regra. Valem em toda conversa."
    >
      <div data-slot="regras-salvas" className="space-y-2">
        {regras.length === 0 ? (
          <Hint>
            Nenhuma regra salva ainda. Em Pedidos, num pedido resolvido com orientação, use
            &quot;Salvar como regra&quot;.
          </Hint>
        ) : (
          <ul className={MOLDURA_LISTA}>
            {regras.map((r) => (
              <li key={r} data-slot="regra-salva" className="flex items-start gap-2 px-3 py-2 text-apoio">
                <span className="min-w-0 flex-1 break-words">{r}</span>
                <Button
                  variant="danger-ghost"
                  size="none"
                  onClick={() => setApagar(r)}
                  carregando={apagando === r}
                  aria-label={`Apagar a regra: ${r}`}
                  className="rounded"
                >
                  <X size={15} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {erro && (
          <Aviso tom="danger" role="alert">
            {erro}
          </Aviso>
        )}
      </div>
      <ConfirmModal
        aberto={apagar !== null}
        title="Apagar esta regra?"
        body="O agente deixa de seguir esta regra a partir da próxima mensagem. Isso já vale no WhatsApp, sem precisar salvar."
        confirmLabel="Apagar regra"
        onCancel={() => setApagar(null)}
        onConfirm={() => void confirmar()}
      />
    </SubBloco>
  );
}
