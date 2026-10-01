"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// PRIMEIRA MENSAGEM PARA QUEM NUNCA ESCREVEU (fatia B, 01/10/2026).
//
// Escrever primeiro é o que o WhatsApp pune com bloqueio, então o gesto tem
// peso: o aviso, a caixa "Esta pessoa sabe que eu vou escrever" obrigatória e
// "Enviar mesmo assim". Um contato por vez, sem seleção múltipla em lugar
// nenhum. O aceite também é conferido no servidor (`POST /api/send`).
//
// É um envio manual comum: quem escreveu assumiu, e a IA fica PAUSADA até
// alguém religar na chave (decisão do dono, 01/10/2026).
export default function PrimeiraMensagemDialog({
  aberto,
  onFechar,
  nome,
  phone,
  simular = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  nome: string;
  phone: string;
  /** Preview `/design/clientes`: não envia nada. */
  simular?: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    onFechar();
    setTimeout(() => {
      setTexto("");
      setAceite(false);
      setErro(null);
    }, 200);
  }

  async function enviar() {
    const text = texto.trim();
    if (!text || !aceite) return;
    if (simular) {
      fechar();
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text, aceite: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErro(data.error ?? "Não deu para enviar agora.");
        return;
      }
      fechar();
      router.push(`/inbox/${encodeURIComponent(phone)}`);
    } catch {
      setErro("Não deu para enviar agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-md" data-slot="primeira-mensagem">
        <DialogTitle>Primeira mensagem para {nome}</DialogTitle>

        <div className="mt-3 flex gap-2.5 rounded-lg border border-warn-line bg-warn-surface p-3">
          <TriangleAlert size={18} className="mt-px shrink-0 text-warn-ink" />
          <div className="flex flex-col gap-1">
            <span className="text-apoio font-semibold text-ink">
              Este número nunca escreveu para você
            </span>
            <span className="text-apoio text-ink-2" style={{ textWrap: "pretty" }}>
              O WhatsApp pode bloquear o seu número por mensagens que a pessoa não
              pediu. Envie só para quem espera o seu contato, e uma pessoa por vez.
            </span>
          </div>
        </div>

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Escreva a primeira mensagem"
          aria-label="Primeira mensagem"
          className="mt-3 resize-y"
        />

        <label className="mt-3 flex cursor-pointer items-center gap-2.5">
          <Checkbox
            data-slot="primeira-aceite"
            checked={aceite}
            onCheckedChange={(v) => setAceite(v === true)}
          />
          <span className="text-apoio text-ink">Esta pessoa sabe que eu vou escrever</span>
        </label>

        <p className="mt-2 text-legenda text-ink-3">
          Depois de enviar, a IA fica pausada nesta conversa. Para ela atender, religue na conversa.
        </p>

        {erro && (
          <p className="mt-3 text-apoio text-danger-ink" role="alert">
            {erro}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="field" className="px-4">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            size="field"
            className="px-4"
            data-slot="primeira-enviar"
            carregando={enviando}
            disabled={!texto.trim() || !aceite}
            onClick={() => void enviar()}
          >
            Enviar mesmo assim
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
