"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

/**
 * Canal de feedback do beta.
 *
 * Escreve DIRETO do browser na tabela `feedback`, sob RLS, que é o padrão das
 * tabelas próprias do CRM (tags, notas, respostas rápidas). Não existe route
 * handler porque não há nada para o servidor decidir: o tenant vem da policy, o
 * autor vem do default `auth.uid()` e não há segredo envolvido.
 *
 * ⚠️ A CONFIRMAÇÃO NÃO PROMETE RESPOSTA. É uma pessoa só atendendo dez
 * empresas: "vamos te responder" seria promessa que o dono não consegue
 * cumprir, e promessa quebrada custa mais do que o relato vale.
 *
 * ⚠️ NINGUÉM É AVISADO quando um relato chega. O dono só vê rodando a consulta
 * de `docs/instrumentacao-beta.md`. É limitação conhecida e assumida: notificar
 * exigiria mexer no n8n, que é produção.
 */
export default function FeedbackDialog({
  aberto,
  onFechar,
  clientId,
  path,
}: {
  aberto: boolean;
  onFechar: () => void;
  /**
   * Tenant de quem está escrevendo. Ausente só nas telas de `/design`, que não
   * têm sessão: ali o envio é simulado, senão o preview quebraria com erro de
   * RLS em vez de mostrar o desenho.
   */
  clientId?: string;
  /** Em que tela a pessoa estava. Metade do valor do relato mora aqui. */
  path?: string;
}) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"escrevendo" | "enviando" | "enviado">(
    "escrevendo",
  );
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    onFechar();
    // Zera depois que a janela sai de cena, senão o texto some na frente de
    // quem está olhando, durante a animação de saída.
    setTimeout(() => {
      setTexto("");
      setEstado("escrevendo");
      setErro(null);
    }, 200);
  }

  async function enviar() {
    const message = texto.trim();
    if (!message) return;
    setEstado("enviando");
    setErro(null);

    if (!clientId) {
      setEstado("enviado");
      return;
    }

    const supabase = createClient();
    // Sem `.select()` de propósito: a tabela não dá SELECT a `authenticated`
    // (ninguém lê feedback pelo browser), então pedir a linha de volta faria o
    // insert falhar por falta de permissão de leitura.
    const { error } = await supabase.from("feedback").insert({
      client_id: clientId,
      message,
      path: path ?? null,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
    });

    if (error) {
      // Falhou é falhou. Dizer "recebido" sem ter gravado é a mentira mais cara
      // que esta tela poderia contar: a pessoa acha que avisou e não avisou.
      setErro("Não deu para enviar agora. Tente de novo em instantes.");
      setEstado("escrevendo");
      return;
    }
    setEstado("enviado");
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) fechar();
      }}
    >
      <DialogContent
        tamanho="confirmacao"
        // Um pouco mais largo que a confirmação padrão: aqui se escreve, não se
        // responde sim ou não, e 384px deixa a caixa de texto apertada.
        className="max-w-md"
        data-slot="feedback-dialog"
      >
        {estado === "enviado" ? (
          <>
            <DialogTitle>Recebido, obrigado.</DialogTitle>
            <DialogDescription className="mt-2 mb-5">
              Seu relato foi registrado.
            </DialogDescription>
            <div className="flex justify-end">
              <Button size="field" className="px-4" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Enviar feedback</DialogTitle>
            <DialogDescription className="mt-2 mb-3">
              Conte o que deu errado, o que faltou ou o que atrapalhou. Quanto
              mais específico, melhor.
            </DialogDescription>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
              placeholder="Escreva aqui..."
              aria-label="Seu relato"
              className="mb-3 resize-y"
              autoFocus
            />
            {erro && (
              <p className="mb-3 text-apoio text-danger-ink" role="alert">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" size="field" className="px-4">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                size="field"
                className="px-4"
                onClick={enviar}
                disabled={!texto.trim() || estado === "enviando"}
              >
                {estado === "enviando" ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
