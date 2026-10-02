"use client";

import { ArrowUp, Mic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Handoff } from "../HandoffCard";
import MessageComposer from "../MessageComposer";
import { mmss } from "./apoio";

/**
 * O rodapé da bancada: com pedido aberto é a caixa da tela de Conversas
 * (`MessageComposer`); sem pedido, a caixa de escrita do cliente de teste.
 */
export function RodapeDaBancada({
  pedidoAtual,
  fila,
  error,
  iaPausada,
  setIaPausada,
  responderComoTime,
  orientarPedido,
  fecharPedido,
  gravando,
  segundos,
  pararGravacao,
  iniciarGravacao,
  input,
  setInput,
  sendMessage,
  sending,
}: {
  pedidoAtual: Handoff | null;
  fila: Handoff[];
  error: string | null;
  iaPausada: boolean;
  setIaPausada: (v: boolean) => void;
  responderComoTime: (texto: string) => void;
  orientarPedido: (texto: string) => Promise<void>;
  fecharPedido: (p: Handoff, como: "ia" | "resolvido", instrucao: string | null) => void;
  gravando: boolean;
  segundos: number;
  pararGravacao: (enviar: boolean) => void;
  iniciarGravacao: () => Promise<void>;
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => Promise<void>;
  sending: boolean;
}) {
  return (
    <>
          {/* ⚠️ COM PEDIDO ABERTO, A CAIXA É A DA TELA DE CONVERSAS (29/09/2026,
              decisão do dono: "mostrar de um jeito na montagem e de outro quando
              funcionar não é bom"). É o PRÓPRIO `MessageComposer` com a prop
              `pedido`, e não uma cópia: abre em Orientar a IA, troca para
              Responder, e tem o Resolvido ao lado. Enquanto o pedido espera, o
              cliente de teste não escreve, exatamente como a caixa do time não
              escreve pelo cliente. */}
          {pedidoAtual ? (
            <div className="relative shrink-0">
              <MessageComposer
                key={`pedido-${pedidoAtual.id}`}
                clientId=""
                onSend={responderComoTime}
                atende={{ quem: iaPausada ? "voce" : "ia" }}
                pedido={{
                  handoff: pedidoAtual,
                  posicao: 1,
                  total: fila.length,
                  onOrientar: orientarPedido,
                  onResolvido: () => fecharPedido(pedidoAtual, "resolvido", null),
                }}
              />
              {error && <p className="px-4 pb-2 text-legenda text-danger-ink">{error}</p>}
            </div>
          ) : (
          <>
          {/* DEVOLVER PARA A IA (29/09/2026, decisão do dono): responder como time
              pausa a IA, e sem saída isso encerrava o teste. É o gesto da chave
              da IA no cabeçalho da tela de Conversas; a bancada não tem esse
              cabeçalho, então o botão mora junto do aviso, onde a pessoa está
              olhando quando a IA para de responder. */}
          {iaPausada && (
            <div
              data-slot="ia-pausada-teste"
              className="relative mx-3 mt-2 flex items-center gap-3 rounded-lg border border-human-line bg-human-surface px-3 py-2"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-human" aria-hidden />
              <p className="min-w-0 flex-1 text-legenda text-human-ink">
                Você assumiu esta conversa, e a IA não responde enquanto você atende.
                Devolva para ela para continuar o teste.
              </p>
              <Button
                variant="outline"
                size="chrome"
                onClick={() => setIaPausada(false)}
                className="shrink-0 border-human-line text-human-ink"
              >
                Devolver para a IA
              </Button>
            </div>
          )}
          {/* A caixa de escrita no molde da tela de Conversas (`MessageComposer`):
              moldura de 16px com relevo sobre o fundo da conversa, campo limpo
              que cresce com o texto e o botão redondo à direita. Aqui não há os
              modos de nota e orientação, só o de responder, então a moldura é
              da cor da marca e não muda. */}
          <div className="relative shrink-0 px-3 pb-3 pt-2">
            <div className="rounded-[16px] border border-brand-line bg-raised shadow-[var(--panel-shadow)]">
              {gravando ? (
                // Gravando: o campo dá lugar à barra do WhatsApp, com o tempo
                // correndo, descartar à esquerda e enviar à direita.
                <div data-slot="gravando" className="flex items-center gap-2 p-2">
                  <Button
                    variant="ghost"
                    size="none"
                    onClick={() => pararGravacao(false)}
                    className="size-9 justify-center rounded-full text-ink-2 max-md:size-10"
                    aria-label="Descartar áudio"
                  >
                    <Trash2 size={16} />
                  </Button>
                  <span className="gravando size-2.5 rounded-full bg-danger" aria-hidden />
                  <span className="flex-1 text-corpo tabular-nums text-ink-2">
                    Gravando {mmss(segundos)}
                  </span>
                  <Button
                    size="none"
                    onClick={() => pararGravacao(true)}
                    className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                    aria-label="Enviar áudio"
                  >
                    <ArrowUp size={18} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2 p-2">
                  <Textarea
                    variant="limpo"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    aria-label="Mensagem de teste"
                    placeholder="Escreva uma mensagem"
                    className="max-h-[132px] min-h-9 min-w-0 flex-1 px-2 py-2 text-corpo [field-sizing:content]"
                  />
                  {/* Como no WhatsApp: campo vazio mostra o microfone, com texto
                      vira enviar. */}
                  {input.trim() ? (
                    <Button
                      size="none"
                      onClick={sendMessage}
                      disabled={sending}
                      className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                      aria-label="Enviar"
                    >
                      <ArrowUp size={18} />
                    </Button>
                  ) : (
                    <Button
                      size="none"
                      onClick={() => void iniciarGravacao()}
                      disabled={sending}
                      className="size-9 shrink-0 justify-center rounded-full max-md:size-10"
                      aria-label="Gravar áudio"
                    >
                      <Mic size={17} />
                    </Button>
                  )}
                </div>
              )}
            </div>
            {error && (
              <p className="mt-1.5 px-1 text-legenda text-danger-ink">{error}</p>
            )}
          </div>
          </>
          )}
    </>
  );
}
