"use client";

import { useState } from "react";
import { ArrowLeftRight, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/agente/ui";

export type AcaoConexao = "desconectar" | "trocar";

// DESCONECTAR E TROCAR DE NÚMERO (03/10/2026). As duas ações moram aqui, num
// componente só, e quem as mostra (`/connect` e `/agente`) só decide o que fazer
// DEPOIS (`onFeito`). O QR e o código de pareamento seguem em `ConnectWhatsApp`:
// "Trocar número" desconecta e devolve o controle para ele, nunca reimplementa.
//
// O diálogo diz a consequência antes de derrubar, porque derrubar uma instância
// ABERTA para de receber mensagens e desativa o agente.

const TEXTOS: Record<
  AcaoConexao,
  { rotulo: string; titulo: string; corpo: string; confirmar: string }
> = {
  desconectar: {
    rotulo: "Desconectar",
    titulo: "Desconectar o WhatsApp?",
    corpo:
      "As mensagens deixam de chegar e o agente fica Desativado até você conectar um número de novo. As conversas e os contatos continuam aqui, como histórico.",
    confirmar: "Desconectar",
  },
  trocar: {
    rotulo: "Trocar número",
    titulo: "Trocar o número do WhatsApp?",
    corpo:
      "Vamos desconectar o número atual e pedir a conexão do novo. Enquanto isso as mensagens não chegam e o agente fica Desativado até você ligar de novo. As conversas e os contatos continuam aqui, como histórico. Depois, confira o destino dos avisos.",
    confirmar: "Desconectar e trocar",
  },
};

export default function AcoesConexao({
  clientId,
  onFeito,
  preview = false,
}: {
  clientId: string;
  /** Chamado depois que a Evolution (ou o preview) confirmou a desconexão. */
  onFeito: (acao: AcaoConexao) => void;
  /** /design: não chama a rota. */
  preview?: boolean;
}) {
  const [pendente, setPendente] = useState<AcaoConexao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    const acao = pendente;
    if (!acao) return;
    setPendente(null);
    setErro(null);
    if (preview) {
      onFeito(acao);
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/disconnect-whatsapp`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível desconectar o WhatsApp.");
        return;
      }
      onFeito(acao);
    } catch {
      setErro("Não foi possível contatar o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  const texto = pendente ? TEXTOS[pendente] : null;

  return (
    <div data-slot="acoes-conexao" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="field"
          data-acao="trocar"
          onClick={() => setPendente("trocar")}
          carregando={carregando}
        >
          <ArrowLeftRight size={15} aria-hidden />
          {TEXTOS.trocar.rotulo}
        </Button>
        <Button
          variant="outline"
          size="field"
          data-acao="desconectar"
          onClick={() => setPendente("desconectar")}
          carregando={carregando}
        >
          <Unplug size={15} aria-hidden />
          {TEXTOS.desconectar.rotulo}
        </Button>
      </div>
      {erro && (
        <p role="alert" data-slot="erro-conexao" className="text-apoio text-danger-ink">
          {erro}
        </p>
      )}
      <ConfirmModal
        aberto={pendente !== null}
        title={texto?.titulo ?? ""}
        body={texto?.corpo ?? ""}
        confirmLabel={texto?.confirmar ?? ""}
        onCancel={() => setPendente(null)}
        onConfirm={() => void confirmar()}
      />
    </div>
  );
}
