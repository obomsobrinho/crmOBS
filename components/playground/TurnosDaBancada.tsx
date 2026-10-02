"use client";

import type { RefObject } from "react";
import { AreaRolavel, DISSOLVER_BALAO } from "@/components/ui/dissolver-rolagem";
import { cn } from "@/lib/utils";
import HandoffCard from "../HandoffCard";
import { BalaoAudio } from "./BalaoAudio";
import { PELE_CLIENTE, PELE_IA, PELE_TIME } from "./apoio";
import type { PlaygroundTurn } from "./tipos";

/** A área de mensagens da bancada: os turnos e o "digitando". */
export function TurnosDaBancada({
  turns,
  pensando,
  scrollRef,
}: {
  turns: PlaygroundTurn[];
  pensando: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
          {/* A bancada tem os mesmos baloes da conversa, entao o mesmo degrau. */}
          <AreaRolavel
            ref={scrollRef}
            tamanho={DISSOLVER_BALAO}
            className="relative flex-1 space-y-3 p-4"
          >
            {turns.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-apoio text-ink-3">
                Mande uma mensagem ou um áudio, como um cliente faria.
              </div>
            ) : (
              turns.map((t, i) => {
                if (t.role === "marco" && t.pedido) {
                  return <HandoffCard key={i} h={t.pedido} />;
                }
                if (t.role === "marco") {
                  // O mesmo selo "passagem de bastão" da tela de Conversas.
                  return (
                    <div key={i} className="flex items-center gap-3 py-1" data-slot="conversa-marco">
                      <span className="h-px flex-1 bg-human-line" aria-hidden />
                      <span className="inline-flex h-[26px] shrink-0 items-center gap-2 rounded-md border border-human-line bg-human-surface px-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-human" aria-hidden />
                        <span className="whitespace-nowrap text-rotulo uppercase text-human-ink">
                          {t.rotulo}
                        </span>
                      </span>
                      <span className="h-px flex-1 bg-human-line" aria-hidden />
                    </div>
                  );
                }
                if (t.role === "time") {
                  return (
                    <div key={i} className="flex flex-col items-start gap-1.5">
                      <div
                        className={cn(
                          "msg-in max-w-[80%] whitespace-pre-wrap break-words rounded-[4px_16px_16px_16px] border px-3 py-2 text-corpo",
                          PELE_TIME
                        )}
                      >
                        {t.content}
                      </div>
                    </div>
                  );
                }
                // Handoff silencioso: a IA não envia nada, só abre o handoff.
                if (t.role === "assistant" && !t.content.trim()) {
                  return (
                    <div key={i} className="flex justify-center">
                      <div className="rounded-full bg-warn-surface px-3 py-1 text-legenda text-warn-ink">
                        A IA passou esta conversa para você.
                      </div>
                    </div>
                  );
                }
                if (t.audio) {
                  return (
                    <div key={i} className="msg-in flex flex-col items-end gap-1">
                      <BalaoAudio url={t.audio.url} segundos={t.audio.segundos} />
                      {/* O que o agente "ouviu". Sem isso uma resposta torta
                          pareceria defeito dele quando o erro foi do áudio. */}
                      <p
                        data-slot="transcricao"
                        className="max-w-[80%] text-right text-legenda text-ink-3"
                      >
                        {t.audio.transcrevendo
                          ? "Transcrevendo o áudio…"
                          : `Transcrição: “${t.content}”`}
                      </p>
                    </div>
                  );
                }
                // Um balão por mensagem, como chega no WhatsApp. Turno antigo
                // (ou vindo do coach) sem `partes` cai no texto inteiro.
                const baloes =
                  t.role === "assistant" && t.partes ? t.partes : [t.content];
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-1.5",
                      t.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    {baloes.map((texto, j) => (
                      // As peles do Thread: quem testa é o CLIENTE (balão
                      // recebido, branco com relevo) e o agente é a IA (roxo
                      // claro). O canto recortado aponta para quem falou.
                      <div
                        key={j}
                        className={cn(
                          "msg-in max-w-[80%] whitespace-pre-wrap break-words border px-3 py-2 text-corpo",
                          t.role === "user"
                            ? cn("rounded-[16px_4px_16px_16px]", PELE_CLIENTE)
                            : cn("rounded-[4px_16px_16px_16px]", PELE_IA)
                        )}
                      >
                        {texto}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
            {pensando && (
              <div className="flex justify-start">
                <div
                  data-slot="digitando"
                  role="status"
                  aria-label="Digitando"
                  className={cn(
                    "digitando msg-in flex items-center gap-1 rounded-[4px_16px_16px_16px] border px-3.5 py-3",
                    PELE_IA
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  <span className="size-1.5 rounded-full bg-current" />
                  <span className="size-1.5 rounded-full bg-current" />
                </div>
              </div>
            )}
          </AreaRolavel>
    </>
  );
}
