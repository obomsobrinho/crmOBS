"use client";

import { useState } from "react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Aviso } from "@/components/ui/aviso";
import { LIMITS, tamanhoDaRegra } from "@/lib/agent-prompt";
import { numeroBR } from "@/lib/format";
import { cn } from "@/lib/utils";

// SALVAR COMO REGRA (P1 item 5, 13/10/2026; ADR
// docs/adr/2026-10-13-orientation-saved-as-agent-rule.md).
//
// Mora dentro de "Orientação do time", no detalhe de um pedido RESOLVIDO pela
// orientação (`podeVirarRegra`, lib/pedidos.ts). Só o dono vê; a rota
// `agent-rules` recusa o atendente de novo (403), porque esconder não é barrar.
//
// O editor abre PREENCHIDO com a orientação, para o dono generalizar antes de
// salvar ("diga ao João que chega amanhã" não é regra; "frete grátis acima de
// R$ 200" é). Nada é salvo sem o clique em "Salvar regra" sobre o texto editado.

type Estado =
  | { fase: "livre" }
  | { fase: "editando" }
  | { fase: "salva"; aviso: string | null; mensagem: string | null };

export default function SalvarComoRegra({
  pedidoId,
  orientacao,
  clientId,
  salvaEm,
  preview,
}: {
  pedidoId: number;
  orientacao: string;
  clientId?: string;
  /** `handoffs.regra_salva_em`, lido JUNTO da história do pedido (`FontePedidos.historia`). */
  salvaEm: string | null;
  preview: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(
    salvaEm ? { fase: "salva", aviso: null, mensagem: null } : { fase: "livre" }
  );
  const [texto, setTexto] = useState(orientacao);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A MESMA medida da rota (`tamanhoDaRegra`): acima de `LIMITS.bullet` é recusado, nunca cortado.
  const tamanho = tamanhoDaRegra(texto);
  const longo = tamanho > LIMITS.bullet;

  async function salvar() {
    const regra = texto.trim();
    if (!regra || longo) return;
    setErro(null);
    if (preview || !clientId) {
      setEstado({ fase: "salva", aviso: null, mensagem: null });
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/agent-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: regra, pedidoId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        aviso?: string | null;
        mensagem?: string | null;
      };
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível salvar a regra.");
        return;
      }
      setEstado({ fase: "salva", aviso: data.aviso ?? null, mensagem: data.mensagem ?? null });
    } catch {
      setErro("Não foi possível contatar o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  if (estado.fase === "salva") {
    return (
      <div className="flex flex-col gap-2">
        <p data-slot="pedido-regra-salva" className="flex items-center gap-1.5 text-legenda font-semibold text-ink-2">
          <BookmarkCheck size={14} aria-hidden />
          Salva como regra
        </p>
        {estado.mensagem && (
          <p data-slot="pedido-regra-mensagem" className="text-legenda text-ink-3">
            {estado.mensagem}
          </p>
        )}
        {estado.aviso && <Aviso data-slot="pedido-regra-aviso">{estado.aviso}</Aviso>}
      </div>
    );
  }

  if (estado.fase === "livre") {
    return (
      <div>
        <Button
          variant="outline"
          size="control"
          data-slot="pedido-salvar-regra"
          onClick={() => {
            setErro(null);
            setEstado({ fase: "editando" });
          }}
        >
          <BookmarkPlus size={14} />
          Salvar como regra
        </Button>
      </div>
    );
  }

  return (
    <div data-slot="pedido-regra-editor" className="flex flex-col gap-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Texto da regra"
        rows={3}
        autoFocus
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-legenda text-ink-3" style={{ textWrap: "pretty" }}>
          Escreva como regra para todo cliente, não só para este. &quot;Diga ao João que chega amanhã&quot; não é
          regra; &quot;frete grátis acima de R$ 200&quot; é. A regra vale para o agente a partir da próxima mensagem.
        </p>
        <span className={cn("text-legenda tabular-nums", longo ? "text-danger-ink" : "text-ink-3")}>
          {numeroBR(tamanho)} de {numeroBR(LIMITS.bullet)}
        </span>
      </div>
      {erro && (
        <Aviso tom="danger" role="alert">
          {erro}
        </Aviso>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="control"
          data-slot="pedido-regra-confirmar"
          onClick={() => void salvar()}
          carregando={salvando}
          disabled={!texto.trim() || longo}
        >
          Salvar regra
        </Button>
        <Button
          variant="ghost"
          size="control"
          onClick={() => {
            // Cancelar descarta a edição: reabrir começa de novo pela orientação.
            setTexto(orientacao);
            setEstado({ fase: "livre" });
          }}
          disabled={salvando}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
