"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// A CONFIRMAÇÃO DE UMA AÇÃO DA CENTRAL (abas Financeiro e Ações, entrega 2). Uma
// peça só: título, o que vai acontecer, campos extras (dias, plano, o nome
// digitado) e o botão que confirma com `carregando` enquanto a rota responde. A
// falha aparece dentro do diálogo e ele continua aberto; o sucesso fecha.
export default function DialogoDaAcao({
  aberto,
  titulo,
  texto,
  rotuloConfirmar,
  perigo = false,
  podeConfirmar = true,
  slot,
  children,
  onConfirmar,
  onFechar,
}: {
  aberto: boolean;
  titulo: string;
  texto: React.ReactNode;
  rotuloConfirmar: string;
  /** Ação destrutiva: botão vermelho. */
  perigo?: boolean;
  /** Falta um dado (o nome digitado não confere, dias inválidos): o botão fica desabilitado. */
  podeConfirmar?: boolean;
  slot: string;
  children?: React.ReactNode;
  /** Devolve o texto do erro, ou `null` quando deu certo. */
  onConfirmar: () => Promise<string | null>;
  onFechar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      const falha = await onConfirmar();
      if (falha) setErro(falha);
      else onFechar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent tamanho="confirmacao" data-slot={slot}>
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={18} className={perigo ? "text-danger-ink" : "text-warn-ink"} />
          <DialogTitle>{titulo}</DialogTitle>
        </div>
        <DialogDescription asChild>
          <div className="mb-4 space-y-2 text-apoio text-ink-2">{texto}</div>
        </DialogDescription>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (podeConfirmar) void confirmar();
          }}
          className="flex flex-col gap-3"
        >
          {children}
          {erro && (
            <p data-slot="central-acao-erro" role="alert" className="text-apoio text-danger-ink">
              {erro}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="field" className="px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="field"
              variant={perigo ? "danger" : "brand"}
              className="px-4"
              data-slot="central-acao-confirmar"
              disabled={!podeConfirmar}
              carregando={enviando}
            >
              {rotuloConfirmar}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
