"use client";

import { Bot, CheckCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Bubble } from "@/lib/types";
import { MediaView } from "./MediaView";

/** A pele de cada autor, medida no desenho aprovado.
 *
 * Um objeto e não uma escada de `if`: são quatro peles (as três autorias mais a
 * falha) e cada uma tem CINCO propriedades que andam juntas (fundo, tinta,
 * linha, tinta da hora e relevo). Com `if` encadeado, acrescentar a próxima
 * autoria é lembrar de cinco lugares.
 *
 * ⚠️ A LINHA de 1px é o que mudou de verdade aqui: o balão não tinha nenhuma, e
 * no tema claro o balão recebido é branco sobre cinza claríssimo, ou seja, só a
 * sombra o separava do fundo. A linha é do MATIZ do balão (verde no seu, roxo
 * no da IA), então ela é contorno e assinatura ao mesmo tempo.
 * O relevo (`--bubble-shadow`) ficou só no balão recebido, que é o único sem
 * cor de fundo própria para se destacar.
 */
const PELE: Record<
  "cliente" | "ia" | "voce" | "falha",
  { caixa: string; hora: string }
> = {
  cliente: {
    caixa:
      "border-line-soft bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)] shadow-[var(--bubble-shadow)]",
    hora: "text-[var(--bubble-in-hora)]",
  },
  ia: {
    caixa:
      "border-brand-line bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]",
    hora: "text-[var(--bubble-ia-hora)]",
  },
  voce: {
    caixa:
      "border-human-line bg-[var(--bubble-you-bg)] text-[var(--bubble-you-fg)]",
    hora: "text-[var(--bubble-you-hora)]",
  },
  falha: {
    caixa: "border-danger-line bg-danger-surface text-danger-ink",
    hora: "text-danger-ink",
  },
};

export function BubbleView({ b, showLabel }: { b: Bubble; showLabel: boolean }) {
  const out = b.side === "out";
  const failed = b.status === "failed";
  const pele = PELE[failed ? "falha" : b.author];

  return (
    <div
      className={cn(
        // 12px entre balões, sempre. Eram 16px na troca de autor e 4px dentro
        // da sequência, e a sequência apertada existia para os balões "colarem"
        // sob a mesma carinha. Sem carinha, o ritmo único é o do desenho.
        "msg-in mb-3 flex",
        out ? "justify-end" : "justify-start",
      )}
    >
      <div
        data-slot="conversa-balao"
        data-autor={failed ? "falha" : b.author}
        className={cn(
          // 620px é a largura medida no desenho, e ela é ABSOLUTA e não
          // percentual: o que limita linha de texto é o número de caracteres
          // que o olho percorre sem se perder, e isso não cresce porque a
          // janela cresceu. O `min(74%, 560px)` de antes encolhia o balão em
          // tela estreita, que é justamente onde ele precisa de mais espaço.
          "max-w-[620px] whitespace-pre-wrap break-words border px-3 pb-1.5 pt-[9px] text-corpo",
          // O canto recortado (4px) aponta para QUEM FALOU: em cima à esquerda
          // no recebido, em cima à direita no enviado. Antes era embaixo, e só
          // no último balão da sequência.
          out
            ? "rounded-[16px_4px_16px_16px]"
            : "rounded-[4px_16px_16px_16px]",
          pele.caixa,
          b.status === "pending" && "opacity-60",
        )}
      >
        {b.author !== "cliente" && showLabel && (
          // A autoria dentro do balão, no papel `rotulo` (12px, caixa alta), na
          // mesma tinta da hora. Era 12px em peso 600 com `opacity-70`, e
          // opacidade sobre fundo colorido é tinta que ninguém escolheu.
          <span
            className={cn(
              "mb-1.5 flex items-center gap-1.5 text-rotulo uppercase",
              pele.hora,
            )}
          >
            {b.author === "ia" ? <Bot size={12} /> : <User size={12} />}
            {b.author === "ia" ? "IA" : "Você"}
          </span>
        )}
        {b.mediaUrl && <MediaView url={b.mediaUrl} type={b.mediaType ?? null} />}
        {b.content}
        {/* A HORA VIROU LINHA PRÓPRIA, encostada à direita. Era um `float-right`
            com `translate-y`, truque para "Olá" não ocupar duas linhas; o preço
            era a hora se enfiando no meio do texto quando a última linha do
            balão era curta. O desenho reserva 14px de altura para ela, e o
            respiro de baixo do balão (6px) já é menor por causa disso. */}
        <span
          className={cn(
            "mt-0.5 flex h-3.5 items-center justify-end gap-1.5 text-legenda tabular-nums",
            pele.hora,
          )}
          suppressHydrationWarning
        >
          {b.status === "pending" ? (
            "enviando…"
          ) : b.status === "failed" ? (
            "falhou"
          ) : (
            <>
              {formatTime(b.created_at)}
              {/* ⚠️ ISTO É "SAIU", NÃO "FOI LIDA". O desenho chama o marcador de
                  `enviado` e é o que o dado permite: a Evolution devolve o
                  recibo de leitura por evento, e nada disso é gravado em
                  `chat_messages` (a tabela tem id, telefone, as duas mensagens,
                  o tipo, a data e a mídia). Pintar um dos traços de azul, que é
                  o que o WhatsApp faz para "lida", seria afirmar uma coisa que
                  este produto não sabe. */}
              {out && <CheckCheck size={12} aria-label="enviada" />}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
